/**
 * POST /api/creative-generation-jobs/[id]/publish
 *
 * Human-in-the-Loop gate. Marks a completed creative asset as ready for
 * external channel distribution ONLY when:
 *
 *   1. workspace ownership ✓
 *   2. job exists + status='completed' + has result_asset_id
 *   3. PR Circuit Breaker is 'clear' (cross-cutting Sprint-5 guard)
 *   4. linked artifact_id has been human-approved via assertArtifactApproved()
 *
 * On success, the job row is transitioned to status='approved_for_publish'
 * and the media_asset's status flips to 'published_ready'. Downstream
 * dispatchers (publishing cron, ads deploy, PR distribute) can now safely
 * include this asset in outbound content.
 *
 *   POST body: { workspaceId }
 *   200: { ok, jobId, assetId, status: 'approved_for_publish' }
 *   401/403/404/409/423 on failures with explicit hints
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  assertWorkspaceOwnership, assertArtifactApproved, assertCrisisClear,
} from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface JobRow {
  id: string
  workspace_id: string
  artifact_id: string | null
  status: string
  result_asset_id: string | null
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: jobId } = await ctx.params
  let body: { workspaceId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { workspaceId } = body
  if (!workspaceId || !jobId) {
    return NextResponse.json({ error: 'workspaceId and job id required' }, { status: 400 })
  }

  // ── 1. Workspace ownership ────────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 2. 🚨 PR Circuit Breaker ─────────────────────────────────────────
  // Pause publish-side actions when the workspace is in crisis. Same
  // single-row guard pattern that protects email send / ad deploy / PR distribute.
  const breaker = await assertCrisisClear(workspaceId)
  if (breaker) return breaker

  // ── 3. Load the job + verify state ────────────────────────────────────
  const jobRes = await sql`
    SELECT id, workspace_id, artifact_id, status, result_asset_id
    FROM creative_generation_jobs
    WHERE id = ${jobId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const job = jobRes.rows[0] as unknown as JobRow | undefined
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'completed') {
    return NextResponse.json(
      {
        error: `Cannot publish a job in '${job.status}' state. Only completed jobs are publishable.`,
        currentStatus: job.status,
      },
      { status: 409 },
    )
  }
  if (!job.result_asset_id) {
    return NextResponse.json(
      { error: 'Job has no produced asset — nothing to publish.' },
      { status: 422 },
    )
  }

  // ── 4. 🛡️ HITL gate — artifact must be human-approved ────────────────
  // If the job is linked to an artifact (typical for AI-generated creatives),
  // we require an explicit human Approve via the ReviewRequiredModal before
  // the asset can be marked publish-ready. Jobs without a linked artifact
  // (e.g. ad-hoc user generations) skip the gate — the user IS the human.
  if (job.artifact_id) {
    const gate = await assertArtifactApproved(workspaceId, job.artifact_id)
    if (gate) return gate  // 403 if not approved, 404 if artifact missing
  }

  // ── 5. Atomic CAS lock — completed → approved_for_publish ─────────────
  await sql`
    UPDATE creative_generation_jobs
    SET status = 'approved_for_publish'
    WHERE id = ${jobId} AND workspace_id = ${workspaceId} AND status = 'completed'
  `
  // Verify we won the lock (defensive — protects against double-click)
  const verifyRes = await sql`
    SELECT status FROM creative_generation_jobs
    WHERE id = ${jobId} AND workspace_id = ${workspaceId} LIMIT 1
  `
  const final = verifyRes.rows[0] as { status?: string } | undefined
  if (final?.status !== 'approved_for_publish') {
    return NextResponse.json(
      {
        error: `Lock contention — job is now in '${final?.status}' state. Refresh and try again.`,
        currentStatus: final?.status,
      },
      { status: 409 },
    )
  }

  // ── 6. Flip the underlying media_asset to publish-ready ───────────────
  try {
    await sql`
      UPDATE media_assets
      SET status = 'published_ready'
      WHERE id = ${job.result_asset_id} AND workspace_id = ${workspaceId}
    `
  } catch (err) {
    // Rollback the job status if asset update fails — we never want them divergent
    console.error('[creative-jobs/publish] asset status flip failed; rolling back', err)
    try {
      await sql`
        UPDATE creative_generation_jobs
        SET status = 'completed'
        WHERE id = ${jobId} AND workspace_id = ${workspaceId}
      `
    } catch { /* best-effort */ }
    return NextResponse.json(
      { error: 'Failed to flip media asset to publish-ready', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    jobId,
    assetId: job.result_asset_id,
    status: 'approved_for_publish',
    message: 'Asset is now eligible for external channel distribution.',
  })
}
