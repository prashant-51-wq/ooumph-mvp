/**
 * /api/agents/[name]/status — Sprint 2 Commit 2
 *
 *   GET    ?workspaceId=…           → current status row
 *   PATCH  { workspaceId, status }  → flip lifecycle status
 *
 * This is the endpoint the Agents page's Pause / Resume toggles talk to.
 * On PATCH we update `agents.status` (which the cron worker filters on the
 * next tick) plus `paused_at` and `paused_by` for audit attribution.
 *
 * Architectural note: pause is NOT process teardown. The Vercel
 * serverless deployment model has no daemons to SIGTERM — gating happens
 * in the cron filter (`lib/agents.ts → isAgentActive`). In-flight runs
 * complete normally; the next cron tick reads this new status and skips.
 * This endpoint is the only authoritative writer; the cron is a reader.
 *
 * Status vocabulary (matches the CHECK constraint on agents.status):
 *   active   - default; cron picks up work
 *   paused   - operator paused; cron skips
 *   error    - system flagged after repeated failures (NOT set via this
 *              endpoint — the runner sets it)
 *   disabled - admin soft-delete (only admins can set)
 *
 * Via this user-facing PATCH endpoint we only accept active | paused.
 * Setting 'error' or 'disabled' requires admin-secret bypass (operators
 * shouldn't be able to brick agents via the regular UI).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership, getSessionUserId } from '@/lib/guards'
import { isValidAgentStatus, DEFAULT_AGENTS, type AgentStatus } from '@/lib/agents'

export const runtime = 'nodejs'

interface AgentRow {
  id: string
  workspace_id: string
  name: string
  status: AgentStatus
  paused_at: string | null
  paused_by: string | null
  created_at: string
  updated_at: string | null
}

interface RouteCtx {
  params: Promise<{ name: string }>
}

/** Operator-permitted statuses (admin bypass can write any). */
const OPERATOR_STATUSES: AgentStatus[] = ['active', 'paused']

const KNOWN_AGENT_SLUGS = new Set(DEFAULT_AGENTS.map(a => a.name))

// ─── GET (read current status) ────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { name } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const r = await sql`
    SELECT id, workspace_id, name, status, paused_at, paused_by, created_at, updated_at
    FROM agents
    WHERE workspace_id = ${workspaceId} AND name = ${name}
    LIMIT 1
  `
  const row = r.rows[0] as unknown as AgentRow | undefined

  // Unseeded but recognized agent → return a synthetic "active" row instead
  // of a 404. This keeps the UI sane for workspaces that were created before
  // Sprint 2 seeding shipped, and avoids forcing every consumer to handle 404.
  if (!row) {
    if (KNOWN_AGENT_SLUGS.has(name)) {
      return NextResponse.json({
        id: null,
        workspace_id: workspaceId,
        name,
        status: 'active' as const,
        paused_at: null,
        paused_by: null,
        unseeded: true,
      })
    }
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  return NextResponse.json(row)
}

// ─── PATCH (flip status) ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { name } = await ctx.params
    const body = await req.json() as { workspaceId?: string; status?: string }
    const { workspaceId, status } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!status || !isValidAgentStatus(status)) {
      return NextResponse.json(
        { error: `status must be one of: active, paused, error, disabled` },
        { status: 400 },
      )
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Operator UI can only set active / paused. 'error' is set by the
    // runner; 'disabled' is admin-only. If a caller passes one of those
    // via the regular session path, reject — but allow admin/internal
    // header bypass (assertWorkspaceOwnership already let them through).
    const adminBypass =
      req.headers.get('x-admin-secret') === (process.env.ADMIN_SECRET || '___no_admin_secret___') ||
      req.headers.get('x-internal-secret') === (process.env.ADMIN_SECRET || '___no_admin_secret___') ||
      req.headers.get('x-internal-secret') === (process.env.CRON_SECRET  || '___no_cron_secret___')

    if (!adminBypass && !OPERATOR_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Only 'active' or 'paused' allowed via operator endpoint` },
        { status: 403 },
      )
    }

    // Reject unknown agent slugs so a typo doesn't create a junk row that
    // the cron would then happily ignore. Admin bypass can still create
    // rows for experimental slugs.
    if (!adminBypass && !KNOWN_AGENT_SLUGS.has(name)) {
      return NextResponse.json(
        { error: `Unknown agent '${name}'` },
        { status: 404 },
      )
    }

    // The user who initiated the change. Captured for the audit trail
    // (paused_by). Falls back to 'session' when we can't resolve.
    const actorUserId = getSessionUserId(req) || 'session'

    // Upsert pattern: probe → INSERT new or UPDATE existing. We don't use
    // ON CONFLICT because the SQLite adapter doesn't honour it consistently
    // through the tagged-template layer.
    const existing = await sql`
      SELECT id FROM agents
      WHERE workspace_id = ${workspaceId} AND name = ${name}
      LIMIT 1
    `

    const now = new Date().toISOString()
    const isPausing = status === 'paused'
    const pausedAt = isPausing ? now : null
    const pausedBy = isPausing ? actorUserId : null

    if (existing.rows.length === 0) {
      // First write — create the row in the requested state.
      await sql`
        INSERT INTO agents (id, workspace_id, name, status, paused_at, paused_by, created_at, updated_at)
        VALUES (${newId()}, ${workspaceId}, ${name}, ${status}, ${pausedAt}, ${pausedBy}, ${now}, ${now})
      `
    } else {
      // Mutate the existing row. When transitioning to non-paused we clear
      // paused_at and paused_by so a previous pause's attribution doesn't
      // leak into a future log.
      await sql`
        UPDATE agents SET
          status = ${status},
          paused_at = ${pausedAt},
          paused_by = ${pausedBy},
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND name = ${name}
      `
    }

    // Return the canonical row so the client can render without a second fetch.
    const updated = await sql`
      SELECT id, workspace_id, name, status, paused_at, paused_by, created_at, updated_at
      FROM agents
      WHERE workspace_id = ${workspaceId} AND name = ${name}
      LIMIT 1
    `
    return NextResponse.json(updated.rows[0])
  } catch (err) {
    console.error('[/api/agents/[name]/status PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
