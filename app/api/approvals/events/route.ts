/**
 * GET /api/approvals/events?approvalId=…&workspaceId=…[&limit=50][&before=ISO]
 *
 * Sprint 16J (audit P1 #17) — returns the approval_events audit trail
 * for a specific approval row.
 *
 * Sprint 17H (audit pass #3 P2 #46) — added pagination. Previously
 * returned a hardcoded LIMIT 200 with no continuation token; workspaces
 * with high-traffic approvals could hit the ceiling silently. Now
 * accepts limit (capped at 200) + before=ISO for keyset pagination by
 * created_at. Returns nextBefore in the response when more rows
 * potentially exist (rowCount === limit).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const approvalId = searchParams.get('approvalId')
  const workspaceId = searchParams.get('workspaceId')
  if (!approvalId || !workspaceId) {
    return NextResponse.json({ error: 'approvalId and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200)
  const before = searchParams.get('before')  // ISO timestamp for keyset pagination

  try {
    const rows = before
      ? await sql`
          SELECT id, actor_id, actor_email, action, notes, created_at
          FROM approval_events
          WHERE approval_id = ${approvalId}
            AND workspace_id = ${workspaceId}
            AND created_at < ${before}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, actor_id, actor_email, action, notes, created_at
          FROM approval_events
          WHERE approval_id = ${approvalId} AND workspace_id = ${workspaceId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
    const data = rows.rows as Array<{ id: string; created_at: string }>
    // Return the timestamp of the LAST row as the cursor for the next
    // page when the result is full (potentially more available).
    const nextBefore = data.length === limit ? data[data.length - 1].created_at : null
    return NextResponse.json({
      events: data,
      nextBefore,
      hasMore: nextBefore !== null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
