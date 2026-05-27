/**
 * /api/crisis-status
 *
 * Read + reset the PR Circuit Breaker. The scanner trips it automatically;
 * this endpoint lets a human reset it back to 'clear' (or escalate to
 * 'recovering' while they author a PR response) once the situation is
 * addressed.
 *
 *   GET   ?workspaceId=…  → { crisisStatus, crisisTrippedAt, criticalUnreadCount }
 *   POST  { workspaceId, status: 'clear' | 'tripped' | 'recovering', note? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_TRANSITIONS = new Set(['clear', 'tripped', 'recovering'])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const wsRes = await sql`
    SELECT crisis_status, crisis_tripped_at
    FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `
  const row = wsRes.rows[0] as { crisis_status?: string; crisis_tripped_at?: string | null } | undefined

  // Surface the count of unread critical mentions so the UI can show
  // "5 critical mentions still unaddressed" before letting the user clear.
  const cntRes = await sql`
    SELECT COUNT(*) AS c FROM brand_mentions
    WHERE workspace_id = ${workspaceId} AND severity_level = 'critical' AND status IN ('unread', 'flagged_crisis')
  `
  const criticalUnreadCount = Number((cntRes.rows[0] as { c?: number | string } | undefined)?.c || 0)

  return NextResponse.json({
    workspaceId,
    crisisStatus: row?.crisis_status || 'clear',
    crisisTrippedAt: row?.crisis_tripped_at ?? null,
    criticalUnreadCount,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; status?: string; note?: string }
    const { workspaceId, status, note } = body
    if (!workspaceId || !status) return NextResponse.json({ error: 'workspaceId and status required' }, { status: 400 })
    if (!ALLOWED_TRANSITIONS.has(status)) {
      return NextResponse.json(
        { error: `Status must be one of ${[...ALLOWED_TRANSITIONS].join(' | ')}` },
        { status: 422 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (status === 'tripped') {
      // Set tripped_at only if currently clear (atomic CAS)
      await sql`
        UPDATE workspaces
        SET crisis_status = 'tripped', crisis_tripped_at = CURRENT_TIMESTAMP
        WHERE id = ${workspaceId} AND crisis_status = 'clear'
      `
    } else if (status === 'clear') {
      // Clearing wipes the timestamp
      await sql`
        UPDATE workspaces
        SET crisis_status = 'clear', crisis_tripped_at = NULL
        WHERE id = ${workspaceId}
      `
    } else {
      // recovering — keep the original tripped_at intact
      await sql`UPDATE workspaces SET crisis_status = 'recovering' WHERE id = ${workspaceId}`
    }

    // Audit trail via notifications
    try {
      await sql`
        INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
        VALUES (
          ${newId()}, ${workspaceId}, 'crisis_status_change',
          ${`PR Circuit Breaker → ${status}`},
          ${note?.slice(0, 500) || `Crisis status set to ${status} via manual override.`},
          ${status === 'tripped' ? 'critical' : status === 'recovering' ? 'warning' : 'info'},
          CURRENT_TIMESTAMP
        )
      `
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, crisisStatus: status })
  } catch (err) {
    console.error('[/api/crisis-status POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
