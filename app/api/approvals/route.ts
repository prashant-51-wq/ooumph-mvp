import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  const result = await sql`
    SELECT
      ap.*,
      a.type as artifact_type,
      a.title as artifact_title,
      a.content_json,
      a.status as artifact_status,
      a.created_at as artifact_created_at
    FROM approvals ap
    JOIN artifacts a ON a.id = ap.artifact_id
    WHERE ap.workspace_id = ${workspaceId}
    ORDER BY ap.created_at DESC
  `
  return NextResponse.json(result.rows)
}

export async function PATCH(req: NextRequest) {
  try {
    const { approvalId, action, notes, workspaceId } = await req.json()

    const status = action === 'approve' ? 'approved' : 'rejected'

    await sql`
      UPDATE approvals
      SET status = ${status}, notes = ${notes || null}, updated_at = NOW()
      WHERE id = ${approvalId}
    `

    await sql`
      UPDATE artifacts a
      SET status = ${status}
      FROM approvals ap
      WHERE ap.id = ${approvalId} AND a.id = ap.artifact_id
    `

    if (action === 'reject' && notes) {
      const artifactResult = await sql`
        SELECT artifact_id FROM approvals WHERE id = ${approvalId}
      `
      const artifactId = artifactResult.rows[0]?.artifact_id

      await sql`
        INSERT INTO learning_notes (workspace_id, source_type, source_id, note)
        VALUES (${workspaceId}, 'approval_rejection', ${artifactId}, ${notes})
      `
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: 'Approval action failed' }, { status: 500 })
  }
}
