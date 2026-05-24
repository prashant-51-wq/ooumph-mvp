import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ artifacts: 0, pendingApprovals: 0, learningNotes: 0, completedTypes: [] })
  }

  const [artifactsResult, approvalsResult, notesResult, typesResult] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM artifacts WHERE workspace_id = ${workspaceId}`,
    sql`SELECT COUNT(*) as count FROM approvals WHERE workspace_id = ${workspaceId} AND status = 'pending'`,
    sql`SELECT COUNT(*) as count FROM learning_notes WHERE workspace_id = ${workspaceId}`,
    sql`SELECT DISTINCT type FROM artifacts WHERE workspace_id = ${workspaceId}`,
  ])

  return NextResponse.json({
    artifacts: Number(artifactsResult.rows[0]?.count ?? 0),
    pendingApprovals: Number(approvalsResult.rows[0]?.count ?? 0),
    learningNotes: Number(notesResult.rows[0]?.count ?? 0),
    completedTypes: typesResult.rows.map((r) => r.type as string),
  })
}
