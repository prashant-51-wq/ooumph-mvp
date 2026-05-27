/**
 * /api/publishing
 *
 * Sprint-2 canonical CRUD for the social-publishing queue (scheduled_content).
 * Uses the new column names (channel, content_body, scheduled_at, retry_count)
 * introduced in Sprint-2 Commit 1.
 *
 *   GET   ?workspaceId=…[&channel=linkedin][&status=pending]
 *         → rows for the calendar / queue view, ordered by scheduled_at ASC
 *
 *   POST  { workspaceId, artifactId?, channel, contentBody,
 *           scheduledAt, mediaUrls?, link? }
 *         → enqueue a new item. status defaults to 'pending', retry_count=0.
 *
 *   PATCH { id, workspaceId, ...updates }
 *         → mutate. ⚠ If any *content-affecting* field is changed
 *           (contentBody, channel, mediaUrls, link) the worker-state fields
 *           are reset:  status → 'pending', retry_count → 0, error_message → null.
 *           Reschedule-only edits (scheduled_at) preserve worker state.
 *
 *   DELETE ?id=…&workspaceId=…
 *         → mark cancelled. We don't hard-delete so the audit trail survives.
 *
 * Workspace ownership is enforced on every method.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface ScheduledRow {
  id: string
  workspace_id: string
  artifact_id: string | null
  channel: string | null
  content_body: string | null
  scheduled_at: string | null
  status: string
  retry_count: number
  error_message: string | null
  media_urls: string | null
  // Legacy mirrored fields preserved for back-compat (Sprint-1 callers).
  platform?: string | null
  content?: string | null
  scheduled_for?: string | null
  created_at: string
  updated_at: string | null
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const channel = searchParams.get('channel')
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Build query path-by-path — tagged-template sql doesn't compose easily,
  // so we branch instead of stitching strings.
  let rows
  if (channel && status && from && to) {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
        AND channel = ${channel}
        AND status = ${status}
        AND scheduled_at >= ${from}
        AND scheduled_at <= ${to}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  } else if (channel && status) {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId} AND channel = ${channel} AND status = ${status}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  } else if (channel) {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId} AND channel = ${channel}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  } else if (status) {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  } else if (from && to) {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
        AND scheduled_at >= ${from}
        AND scheduled_at <= ${to}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  } else {
    rows = await sql`
      SELECT * FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
      ORDER BY scheduled_at ASC LIMIT 500
    `
  }

  return NextResponse.json(rows.rows as unknown as ScheduledRow[])
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      artifactId?: string | null
      channel?: string
      contentBody?: string
      scheduledAt?: string
      mediaUrls?: string[]
    }
    const { workspaceId, artifactId, channel, contentBody, scheduledAt, mediaUrls } = body

    if (!workspaceId || !channel || !contentBody?.trim() || !scheduledAt) {
      return NextResponse.json(
        { error: 'workspaceId, channel, contentBody, and scheduledAt are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (artifactId) {
      const check = await sql`SELECT id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!check.rows[0]) {
        return NextResponse.json({ error: 'Artifact not found in this workspace' }, { status: 404 })
      }
    }

    const id = newId()
    const now = new Date().toISOString()
    const mediaJson = JSON.stringify(Array.isArray(mediaUrls) ? mediaUrls : [])

    // Write to BOTH the new canonical columns and the legacy mirrors so any
    // legacy consumer (Sprint-1 cron or older direct readers) keeps working.
    await sql`
      INSERT INTO scheduled_content (
        id, workspace_id, artifact_id,
        channel, platform,
        content_body, content,
        scheduled_at, scheduled_for,
        media_urls, status, retry_count,
        created_at, updated_at
      ) VALUES (
        ${id}, ${workspaceId}, ${artifactId || null},
        ${channel}, ${channel},
        ${contentBody}, ${contentBody},
        ${scheduledAt}, ${scheduledAt},
        ${mediaJson}, 'pending', 0,
        ${now}, ${now}
      )
    `

    return NextResponse.json({ ok: true, id, status: 'pending' })
  } catch (err) {
    console.error('[/api/publishing POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────
//
// When any content-affecting field changes we reset the worker state. The
// publish loop should treat the row as if it were freshly enqueued so it
// stops trying to publish a stale version that may have already half-failed.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      artifactId?: string | null
      channel?: string
      contentBody?: string
      scheduledAt?: string
      mediaUrls?: string[]
      status?: string
    }
    const { id, workspaceId, status } = body

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`
      SELECT status, content_body, channel, media_urls
      FROM scheduled_content
      WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    const current = existing.rows[0] as {
      status?: string; content_body?: string; channel?: string; media_urls?: string
    } | undefined
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    // Refuse to mutate items that are already in flight or done. The cron
    // owns the publish-state transitions exclusively.
    if (current.status === 'publishing' || current.status === 'published') {
      return NextResponse.json(
        { error: `Cannot edit item in '${current.status}' state.` },
        { status: 409 },
      )
    }
    if (status && !['pending', 'paused', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: `Status '${status}' not allowed from this endpoint.` },
        { status: 422 },
      )
    }

    // Detect content-affecting changes → reset retry counter + clear error.
    const contentChanged =
      (body.contentBody !== undefined && body.contentBody !== current.content_body)
      || (body.channel !== undefined && body.channel !== current.channel)
      || (body.mediaUrls !== undefined)

    const newStatus = status ?? (contentChanged ? 'pending' : null)
    const resetRetry = contentChanged
    const mediaJson = body.mediaUrls !== undefined
      ? JSON.stringify(Array.isArray(body.mediaUrls) ? body.mediaUrls : [])
      : null

    const updatedAt = new Date().toISOString()
    // First pass: coalesce in any provided field updates.
    await sql`
      UPDATE scheduled_content SET
        artifact_id    = COALESCE(${body.artifactId ?? null}, artifact_id),
        channel        = COALESCE(${body.channel ?? null}, channel),
        platform       = COALESCE(${body.channel ?? null}, platform),
        content_body   = COALESCE(${body.contentBody ?? null}, content_body),
        content        = COALESCE(${body.contentBody ?? null}, content),
        scheduled_at   = COALESCE(${body.scheduledAt ?? null}, scheduled_at),
        scheduled_for  = COALESCE(${body.scheduledAt ?? null}, scheduled_for),
        media_urls     = COALESCE(${mediaJson}, media_urls),
        status         = COALESCE(${newStatus}, status),
        updated_at     = ${updatedAt}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    // Second pass: if the content actually changed, reset the worker state
    // so the cron stops chasing a stale failed version of this row.
    if (resetRetry) {
      await sql`
        UPDATE scheduled_content
        SET retry_count = 0, error_message = NULL
        WHERE id = ${id} AND workspace_id = ${workspaceId}
      `
    }

    return NextResponse.json({
      ok: true,
      resetWorkerState: contentChanged,
      newStatus: newStatus || current.status,
    })
  } catch (err) {
    console.error('[/api/publishing PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (soft) ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`
    SELECT status FROM scheduled_content
    WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
  `
  const row = existing.rows[0] as { status?: string } | undefined
  if (!row) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (row.status === 'publishing') {
    return NextResponse.json({ error: 'Cannot cancel an item currently publishing' }, { status: 409 })
  }
  await sql`
    UPDATE scheduled_content
    SET status = 'cancelled', updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true })
}
