import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const limit = parseInt(searchParams.get('limit') || '8')
  if (!workspaceId) return NextResponse.json([])

  const result = await sql`
    SELECT id, agent_name, status, created_at, completed_at, error_message, cost_estimate
    FROM agent_runs
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return NextResponse.json(result.rows)
}
