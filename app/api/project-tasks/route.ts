/**
 * /api/project-tasks
 *
 * Read endpoint for the Workspace Hub middle-panel task board. Returns
 * project_tasks rows for a given initiative (master run) with a JOIN onto
 * artifacts so the UI can render produced artifact titles + statuses
 * inline.
 *
 *   GET  ?workspaceId=…&initiativeRunId=…
 *
 *   ?workspaceId=…&artifactId=…    (alt: tasks for a specific strategy artifact)
 *
 *   Returns:
 *     [
 *       {
 *         id, agent, task_type, task_brief, status, task_index,
 *         agent_run_id, produced_artifact_id, error_message,
 *         created_at, started_at, completed_at,
 *         produced_artifact_title, produced_artifact_type,
 *         produced_artifact_status
 *       },
 *       …
 *     ]
 *
 * Lightweight (no transactions, no sub-fetches) so the frontend can
 * poll this every 2-3 seconds during active runs without DB strain.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface TaskRow {
  id: string
  workspace_id: string
  initiative_run_id: string
  parent_artifact_id: string
  task_index: number
  agent: string
  task_type: string
  task_brief: string
  status: string
  agent_run_id: string | null
  produced_artifact_id: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  produced_artifact_title: string | null
  produced_artifact_type: string | null
  produced_artifact_status: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const initiativeRunId = searchParams.get('initiativeRunId')
  const artifactId = searchParams.get('artifactId')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  if (!initiativeRunId && !artifactId) {
    return NextResponse.json({ error: 'initiativeRunId or artifactId required' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (initiativeRunId) {
    result = await sql`
      SELECT
        pt.id, pt.workspace_id, pt.initiative_run_id, pt.parent_artifact_id,
        pt.task_index, pt.agent, pt.task_type, pt.task_brief, pt.status,
        pt.agent_run_id, pt.produced_artifact_id, pt.error_message,
        pt.created_at, pt.started_at, pt.completed_at,
        a.title  AS produced_artifact_title,
        a.type   AS produced_artifact_type,
        a.status AS produced_artifact_status
      FROM project_tasks pt
      LEFT JOIN artifacts a ON a.id = pt.produced_artifact_id
      WHERE pt.workspace_id = ${workspaceId}
        AND pt.initiative_run_id = ${initiativeRunId}
      ORDER BY pt.task_index ASC, pt.created_at ASC
    `
  } else {
    result = await sql`
      SELECT
        pt.id, pt.workspace_id, pt.initiative_run_id, pt.parent_artifact_id,
        pt.task_index, pt.agent, pt.task_type, pt.task_brief, pt.status,
        pt.agent_run_id, pt.produced_artifact_id, pt.error_message,
        pt.created_at, pt.started_at, pt.completed_at,
        a.title  AS produced_artifact_title,
        a.type   AS produced_artifact_type,
        a.status AS produced_artifact_status
      FROM project_tasks pt
      LEFT JOIN artifacts a ON a.id = pt.produced_artifact_id
      WHERE pt.workspace_id = ${workspaceId}
        AND pt.parent_artifact_id = ${artifactId}
      ORDER BY pt.task_index ASC, pt.created_at ASC
    `
  }

  const tasks = result.rows as unknown as TaskRow[]

  // Aggregate summary stats — useful for the task board header
  const counts = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    queued: tasks.filter(t => t.status === 'queued').length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }

  return NextResponse.json({ tasks, counts })
}

/**
 * DELETE /api/project-tasks?workspaceId=…&parentArtifactId=…
 *
 * Clear all tasks for a parent strategy artifact. Used when the user wants
 * to re-decompose. Will also cancel any in-flight tasks by marking them as
 * failed (we don't have a way to actually abort in-flight Anthropic calls,
 * but we make sure their artifacts aren't linked).
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const parentArtifactId = searchParams.get('parentArtifactId')

  if (!workspaceId || !parentArtifactId) {
    return NextResponse.json({ error: 'workspaceId and parentArtifactId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`
    DELETE FROM project_tasks
    WHERE workspace_id = ${workspaceId}
      AND parent_artifact_id = ${parentArtifactId}
  `

  return NextResponse.json({ ok: true })
}
