/**
 * Task registry helpers for the strategy → sub-agent execution loop.
 *
 * Sub-agents (Blog, Email-Marketing, Ads, etc.) call claimPendingTask() on
 * boot to see if a project_task is waiting for them. If one exists they
 * include its task_brief as additional context in their prompt so the output
 * directly addresses the CMO's execution plan.
 *
 * completeTask() is called after the agent writes its output artifact to
 * close the loop: project_task → completed, produced_artifact_id set.
 */
import { sql, newId } from '@/lib/db'

export interface PendingTask {
  id: string
  workspace_id: string
  agent: string
  task_brief: string
  cmo_run_id: string | null
  initiative_run_id: string | null
  parent_artifact_id: string | null
}

/**
 * Atomically claim the oldest pending task for a given agent in a workspace.
 * Flips status from 'pending' to 'in_progress' and returns the task.
 * Returns null if no task is waiting.
 */
export async function claimPendingTask(
  workspaceId: string,
  agentName: string,
): Promise<PendingTask | null> {
  try {
    // Find oldest pending task for this agent in this workspace
    const findRes = await sql`
      SELECT id, workspace_id, agent, task_brief, cmo_run_id, initiative_run_id, parent_artifact_id
      FROM project_tasks
      WHERE workspace_id = ${workspaceId}
        AND agent = ${agentName}
        AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `
    const task = findRes.rows[0] as unknown as PendingTask | undefined
    if (!task) return null

    // Atomic CAS: only flip to in_progress if still pending (race-safe)
    const updated = await sql`
      UPDATE project_tasks
      SET status = 'in_progress', started_at = NOW()
      WHERE id = ${task.id} AND status = 'pending'
    `
    // If rowCount is 0, a concurrent caller grabbed it first
    const rowCount = (updated as unknown as { rowCount?: number }).rowCount ?? 1
    if (rowCount === 0) return null

    return task
  } catch {
    return null
  }
}

/**
 * Mark a project_task as completed once the sub-agent has written its artifact.
 * Non-fatal — a failure here never blocks artifact creation.
 */
export async function completeTask(
  taskId: string,
  producedArtifactId: string,
  agentRunId?: string,
): Promise<void> {
  try {
    await sql`
      UPDATE project_tasks
      SET status = 'completed',
          produced_artifact_id = ${producedArtifactId},
          agent_run_id = ${agentRunId ?? null},
          completed_at = NOW()
      WHERE id = ${taskId}
    `
  } catch (e) {
    console.warn('[task-registry] completeTask failed (non-fatal):', e)
  }
}

/**
 * Mark a project_task as failed with an error message.
 */
export async function failTask(taskId: string, errorMessage: string): Promise<void> {
  try {
    await sql`
      UPDATE project_tasks
      SET status = 'failed',
          error_message = ${errorMessage.slice(0, 500)},
          completed_at = NOW()
      WHERE id = ${taskId}
    `
  } catch { /* non-fatal */ }
}

/**
 * List all project_tasks for a workspace, grouped by status.
 * Used by the dashboard to show execution runway state.
 */
export async function getWorkspaceTasks(
  workspaceId: string,
  limit = 50,
): Promise<PendingTask[]> {
  try {
    const res = await sql`
      SELECT id, workspace_id, agent, task_brief, cmo_run_id, initiative_run_id,
             parent_artifact_id, status, created_at
      FROM project_tasks
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return res.rows as unknown as PendingTask[]
  } catch {
    return []
  }
}

/**
 * Sprint 3 Loop 3: atomic flip proposed → pending for all CMO-proposed tasks.
 * Called by the approvals handler when a strategy artifact is approved.
 * Returns the list of tasks that were flipped so the caller can create agent_runs.
 */
export async function activateProposedTasks(
  workspaceId: string,
): Promise<PendingTask[]> {
  try {
    const res = await sql`
      UPDATE project_tasks
      SET status = 'pending', updated_at = NOW()
      WHERE workspace_id = ${workspaceId} AND status = 'proposed'
      RETURNING id, workspace_id, agent, task_brief, cmo_run_id, initiative_run_id, parent_artifact_id
    `
    return (res.rows || []) as unknown as PendingTask[]
  } catch (e) {
    console.error('[task-registry] activateProposedTasks failed:', e)
    return []
  }
}

/**
 * Write an agent_run trace row for a newly-activated task and link it back.
 * Allows the Agent Console to surface the task as an in-flight run
 * before the sub-agent actually boots.
 */
export async function createAgentRunsForTasks(
  workspaceId: string,
  tasks: PendingTask[],
): Promise<void> {
  for (const task of tasks) {
    try {
      const runId = newId()
      await sql`
        INSERT INTO agent_runs (id, workspace_id, agent_name, status, parent_run_id, created_at)
        VALUES (
          ${runId}, ${workspaceId}, ${task.agent}, 'pending',
          ${task.cmo_run_id ?? null}, NOW()
        )
      `
      // Back-link the task so it knows which agent_run owns it
      await sql`
        UPDATE project_tasks
        SET agent_run_id = ${runId}
        WHERE id = ${task.id}
      `
    } catch (e) {
      console.warn(`[task-registry] agent_run trace for task ${task.id} failed (non-fatal):`, e)
    }
  }
}
