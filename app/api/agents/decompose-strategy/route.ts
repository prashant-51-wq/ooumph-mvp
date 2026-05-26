/**
 * POST /api/agents/decompose-strategy
 *
 * Decomposes an approved Strategy artifact into project_tasks and dispatches
 * each task to its sub-agent in the background. Returns immediately with the
 * inserted task list so the caller (and the Workspace Hub task board) can
 * begin showing them as pending.
 *
 * ─── Caller contract ────────────────────────────────────────────────────
 *   Trigger: /api/approvals PATCH when artifact.type='strategy' AND
 *            action='approve' — fired via after() so the approval response
 *            stays fast.
 *
 *   Manual: an authorized client can also call this directly to re-run the
 *           decomposition (e.g. if the previous run failed).
 *
 *   Body: { workspaceId, artifactId, initiativeRunId? }
 *
 * ─── Safety ─────────────────────────────────────────────────────────────
 *   This route NEVER fires customer-facing third-party writes. Each task's
 *   sub-agent fetch produces another draft artifact + pending approval,
 *   maintaining the human-governance gate. The user must still approve
 *   each individual sub-artifact to publish.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import {
  decomposeStrategyArtifact,
  dispatchPendingTasks,
} from '@/lib/decompose-strategy'

export const runtime = 'nodejs'
export const maxDuration = 300

interface DecomposeRequest {
  workspaceId: string
  artifactId: string
  initiativeRunId?: string
  /** When true, only create the project_tasks rows and skip the auto-dispatch.
   *  Useful for testing or when the user wants to review tasks before they
   *  start executing. Default false (auto-dispatch enabled). */
  skipDispatch?: boolean
}

export async function POST(req: NextRequest) {
  let body: DecomposeRequest
  try {
    body = (await req.json()) as DecomposeRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, artifactId, initiativeRunId, skipDispatch } = body

  if (!workspaceId || !artifactId) {
    return NextResponse.json({ error: 'workspaceId and artifactId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Idempotency guard — if tasks already exist for this artifact, refuse to
  // re-decompose (the caller can DELETE existing tasks first if they want).
  const existing = await sql`
    SELECT COUNT(*) as count
    FROM project_tasks
    WHERE workspace_id = ${workspaceId} AND parent_artifact_id = ${artifactId}
  `
  const existingCount = Number((existing.rows[0] as { count?: number } | undefined)?.count || 0)
  if (existingCount > 0) {
    return NextResponse.json(
      {
        error: 'Tasks already exist for this artifact',
        existingCount,
        hint: 'Delete existing tasks first if you want to re-decompose.',
      },
      { status: 409 },
    )
  }

  let outcome
  try {
    outcome = await decomposeStrategyArtifact({
      workspaceId,
      artifactId,
      initiativeRunId,
    })
  } catch (err) {
    console.error('[/api/agents/decompose-strategy] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  // Dispatch in the background unless explicitly skipped. The route returns
  // immediately so the approval handler stays fast and the task board can
  // start polling for live updates.
  if (!skipDispatch) {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      `http://localhost:${process.env.PORT || 3000}`
    after(async () => {
      try {
        await dispatchPendingTasks(outcome.tasks, baseUrl, 3)
      } catch (err) {
        console.error('[decompose after()] dispatch failed:', err)
      }
    })
  }

  return NextResponse.json({
    ok: true,
    initiativeRunId: outcome.initiativeRunId,
    taskCount: outcome.tasks.length,
    tasks: outcome.tasks,
    dispatched: !skipDispatch,
  })
}
