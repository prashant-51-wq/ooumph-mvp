/**
 * /api/settings/security
 *
 * Workspace retention policy CRUD. Each policy row sets retention_days +
 * action_disposition ('purge' or 'archive') for a single data stream
 * (call_logs, agent_runs, experiment_events, …). The log-sweeper cron at
 * /api/cron/log-sweeper walks this table on each tick.
 *
 *   GET    ?workspaceId=…                 → list all policies for the workspace
 *
 *   POST   { workspaceId, streamTarget, retentionDays, actionDisposition? }
 *          → Idempotent upsert. The composite UNIQUE (workspace_id,
 *            stream_target) means re-saving an existing policy updates in
 *            place rather than duplicating. We pre-check, then INSERT or
 *            UPDATE in a single static-SQL branch — no SQL-injectable
 *            identifier substitution anywhere.
 *
 *   DELETE ?id=…&workspaceId=…            → revert that stream to the
 *                                            platform default (no policy =
 *                                            no rotation by the sweeper)
 *
 * Why settings/security and not settings/retention: the /dashboard/settings/
 * security panel hosts every "what does this workspace keep, and for how
 * long" control in one place — retention is the bulk of it, future commits
 * (2FA enforcement, IP allow-lists, audit-export schedules) will hang off
 * the same endpoint surface.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

// Must match the sweeper's STREAMS catalogue exactly. The sweeper IS the
// authority — letting the user save a stream slug the sweeper doesn't
// recognise would silently no-op forever.
const ALLOWED_STREAMS = new Set([
  'call_logs',
  'experiment_events',
  'enrichment_logs',
  'agent_runs',
  'notifications',
  'system_performance_audits',
])

const ALLOWED_ACTIONS = new Set(['purge', 'archive'])

const MIN_RETENTION_DAYS = 1
const MAX_RETENTION_DAYS = 3650

interface PolicyRow {
  id: string
  workspace_id: string
  stream_target: string
  retention_days: number | string
  action_disposition: string
  updated_at: string
  created_at: string
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, stream_target, retention_days, action_disposition, updated_at, created_at
    FROM workspace_retention_policies
    WHERE workspace_id = ${workspaceId}
    ORDER BY stream_target ASC
  `
  const rows = result.rows as unknown as PolicyRow[]

  // Surface the catalogue alongside saved policies so the settings page can
  // render every available stream (with platform defaults) without a second
  // round-trip. The user sees a complete grid, even on first visit when no
  // rows exist yet.
  const catalogue = Array.from(ALLOWED_STREAMS).map(slug => {
    const existing = rows.find(r => r.stream_target === slug)
    return {
      streamTarget: slug,
      policy: existing
        ? {
            id: existing.id,
            retentionDays: Number(existing.retention_days),
            actionDisposition: existing.action_disposition,
            updatedAt: existing.updated_at,
            createdAt: existing.created_at,
          }
        : null,
    }
  })

  return NextResponse.json({
    workspaceId,
    rows,
    catalogue,
    allowedStreams: Array.from(ALLOWED_STREAMS),
    allowedActions: Array.from(ALLOWED_ACTIONS),
    minRetentionDays: MIN_RETENTION_DAYS,
    maxRetentionDays: MAX_RETENTION_DAYS,
  })
}

// ─── POST (idempotent upsert) ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      streamTarget?: string
      retentionDays?: number
      actionDisposition?: string
    }
    const { workspaceId, streamTarget } = body
    if (!workspaceId || !streamTarget) {
      return NextResponse.json(
        { error: 'workspaceId and streamTarget are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const slug = streamTarget.trim().toLowerCase()
    if (!ALLOWED_STREAMS.has(slug)) {
      return NextResponse.json(
        {
          error: `streamTarget '${slug}' is not in the platform allow-list`,
          allowed: Array.from(ALLOWED_STREAMS),
        },
        { status: 422 },
      )
    }

    const rawDays = Number(body.retentionDays)
    if (!Number.isFinite(rawDays)) {
      return NextResponse.json(
        { error: 'retentionDays must be a finite number' },
        { status: 422 },
      )
    }
    const retentionDays = Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(rawDays)))

    const action = (body.actionDisposition || 'purge').trim().toLowerCase()
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: `actionDisposition must be one of ${Array.from(ALLOWED_ACTIONS).join(', ')}` },
        { status: 422 },
      )
    }

    // Composite UNIQUE on (workspace_id, stream_target) → pre-check + branch.
    // Doing the pre-check in code (rather than ON CONFLICT) keeps the SQL
    // dialect-portable across the inline-Postgres and SQLite paths the rest
    // of the app uses, with no measurable cost — both branches are indexed.
    const existing = await sql`
      SELECT id FROM workspace_retention_policies
      WHERE workspace_id = ${workspaceId} AND stream_target = ${slug}
      LIMIT 1
    `
    const existingId = (existing.rows[0] as { id?: string } | undefined)?.id

    if (existingId) {
      await sql`
        UPDATE workspace_retention_policies SET
          retention_days     = ${retentionDays},
          action_disposition = ${action},
          updated_at         = CURRENT_TIMESTAMP
        WHERE id = ${existingId} AND workspace_id = ${workspaceId}
      `
      return NextResponse.json({
        ok: true,
        id: existingId,
        streamTarget: slug,
        retentionDays,
        actionDisposition: action,
        created: false,
      })
    }

    const id = newId()
    await sql`
      INSERT INTO workspace_retention_policies (
        id, workspace_id, stream_target, retention_days, action_disposition, updated_at, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${slug}, ${retentionDays}, ${action},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({
      ok: true,
      id,
      streamTarget: slug,
      retentionDays,
      actionDisposition: action,
      created: true,
    })
  } catch (err) {
    console.error('[/api/settings/security POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`
    DELETE FROM workspace_retention_policies
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true })
}
