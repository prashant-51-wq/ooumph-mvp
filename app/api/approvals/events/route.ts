/**
 * GET /api/approvals/events?approvalId=…&workspaceId=…
 *
 * Sprint 16J (audit P1 #17) — returns the approval_events audit trail
 * for a specific approval row. Read-only history of who did what when.
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
  try {
    const rows = await sql`
      SELECT id, actor_id, actor_email, action, notes, created_at
      FROM approval_events
      WHERE approval_id = ${approvalId} AND workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT 200
    `
    return NextResponse.json(rows.rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
