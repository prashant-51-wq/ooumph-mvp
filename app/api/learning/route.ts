import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const result = await sql`
    SELECT ln.*, a.type as artifact_type, a.title as artifact_title
    FROM learning_notes ln
    LEFT JOIN artifacts a ON a.id = ln.source_id
    WHERE ln.workspace_id = ${workspaceId}
    ORDER BY ln.created_at DESC
  `
  return NextResponse.json(result.rows)
}
