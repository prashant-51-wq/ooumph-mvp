import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/agent-runs
 *
 * Query params:
 *   workspaceId  (required)
 *   limit        default 8
 *   parentNull   'true' → only return runs with parent_run_id IS NULL
 *                (the master CMO orchestrator runs — used by the Workspace Hub
 *                page to list initiatives)
 *   since        ISO timestamp → only return runs created at/after this time
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const limit = parseInt(searchParams.get('limit') || '8')
  const parentNull = searchParams.get('parentNull') === 'true'
  const since = searchParams.get('since')
  if (!workspaceId) return NextResponse.json([])

  let result
  if (parentNull && since) {
    result = await sql`
      SELECT id, agent_name, status, parent_run_id, input_json, output_json,
             cost_estimate, error_message, created_at, completed_at
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}
        AND parent_run_id IS NULL
        AND created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else if (parentNull) {
    result = await sql`
      SELECT id, agent_name, status, parent_run_id, input_json, output_json,
             cost_estimate, error_message, created_at, completed_at
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}
        AND parent_run_id IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else if (since) {
    result = await sql`
      SELECT id, agent_name, status, parent_run_id, input_json, output_json,
             cost_estimate, error_message, created_at, completed_at
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else {
    result = await sql`
      SELECT id, agent_name, status, parent_run_id, input_json, output_json,
             cost_estimate, error_message, created_at, completed_at
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }
  return NextResponse.json(result.rows)
}
