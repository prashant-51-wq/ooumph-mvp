/**
 * POST /api/experiments/[id]/promote-winner
 *
 * Permanently rolls out a winning variant's `configuration_override_json`
 * into the underlying target asset. This is the "make this stick" step
 * that converts an experiment win into permanent product change.
 *
 *   Flow:
 *     1. workspace ownership                              401/403
 *     2. 🚨 PR Circuit Breaker (assertCrisisClear)         423
 *     3. Load experiment + winner_variant_id + variant     404 / 409
 *     4. 🛡️ HITL gate — assertArtifactApproved() if the
 *        winner variant carries an artifact_id reference   403
 *     5. Atomic CAS lock: completed → promoting            409
 *     6. Per-target-type merge of the override into the
 *        base asset (funnel_step / email_campaign /
 *        ad_creative / pr_campaign / artifact)             422 if unsupported
 *     7. Flip experiment status → 'concluded' (final state) and stamp
 *        promoted_at marker into updated_at
 *     8. INSERT learning_notes row so the CMO sees the win
 *
 * Why a separate state ('completed' vs 'concluded'):
 *   - 'completed' = winner identified by the cron, change NOT yet applied
 *   - 'concluded' = winner promoted, base asset permanently updated
 *
 * This split gives the user one last review checkpoint via the UI before
 * the change goes live, even after the math says it's safe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import {
  assertWorkspaceOwnership, assertArtifactApproved, assertCrisisClear,
} from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface ExperimentRow {
  id: string
  workspace_id: string
  name: string
  target_type: string
  target_reference_id: string
  status: string
  winner_variant_id: string | null
}

interface VariantRow {
  id: string
  experiment_id: string
  variant_label: string
  configuration_override_json: string
}

// ─── Per-target-type promotion handlers ───────────────────────────────────
//
// Each handler knows how to merge the override JSON into the asset's
// canonical storage location. Add new target types here as departments
// gain experiment support.

interface PromotionContext {
  workspaceId: string
  targetReferenceId: string
  override: Record<string, unknown>
}

interface PromotionOutcome {
  ok: boolean
  fieldsApplied: string[]
  error?: string
}

const PROMOTERS: Record<string, (ctx: PromotionContext) => Promise<PromotionOutcome>> = {
  // ── funnel_step: merges override into html_content OR specific HTML fields
  funnel_step: async ({ workspaceId, targetReferenceId, override }) => {
    const check = await sql`SELECT id FROM funnel_steps WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!check.rows[0]) return { ok: false, fieldsApplied: [], error: 'Funnel step not found' }
    const newHtml = typeof override.html_content === 'string' ? override.html_content : null
    if (!newHtml) {
      return { ok: false, fieldsApplied: [], error: 'Override has no html_content field to apply' }
    }
    await sql`UPDATE funnel_steps SET html_content = ${newHtml} WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId}`
    return { ok: true, fieldsApplied: ['html_content'] }
  },

  // ── email_campaign: merges override into content_json (subject + body fields)
  email_campaign: async ({ workspaceId, targetReferenceId, override }) => {
    const existing = await sql`SELECT content_json, subject FROM email_campaigns WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { content_json?: string | Record<string, unknown>; subject?: string | null } | undefined
    if (!row) return { ok: false, fieldsApplied: [], error: 'Email campaign not found' }

    const base = typeof row.content_json === 'string'
      ? (() => { try { return JSON.parse(row.content_json as string) as Record<string, unknown> } catch { return {} } })()
      : (row.content_json as Record<string, unknown>) || {}
    const merged = { ...base, ...override }
    const applied: string[] = []

    await sql`
      UPDATE email_campaigns SET
        content_json = ${JSON.stringify(merged)},
        subject = COALESCE(${(override.subject as string) ?? null}, subject),
        updated_at = ${new Date().toISOString()}
      WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId}
    `
    applied.push('content_json')
    if (override.subject) applied.push('subject')
    return { ok: true, fieldsApplied: applied }
  },

  // ── ad_creative: merges override into headline / body_copy / destination_url
  ad_creative: async ({ workspaceId, targetReferenceId, override }) => {
    const check = await sql`SELECT id FROM ad_creatives WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!check.rows[0]) return { ok: false, fieldsApplied: [], error: 'Ad creative not found' }
    const applied: string[] = []
    await sql`
      UPDATE ad_creatives SET
        headline        = COALESCE(${(override.headline as string) ?? null}, headline),
        body_copy       = COALESCE(${(override.body_copy as string) ?? null}, body_copy),
        destination_url = COALESCE(${(override.destination_url as string) ?? null}, destination_url),
        media_url       = COALESCE(${(override.media_url as string) ?? null}, media_url)
      WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId}
    `
    for (const k of ['headline', 'body_copy', 'destination_url', 'media_url']) {
      if (override[k] !== undefined) applied.push(k)
    }
    return { ok: true, fieldsApplied: applied }
  },

  // ── pr_campaign: merges override into title / body_content
  pr_campaign: async ({ workspaceId, targetReferenceId, override }) => {
    const check = await sql`SELECT id FROM pr_campaigns WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!check.rows[0]) return { ok: false, fieldsApplied: [], error: 'PR campaign not found' }
    const applied: string[] = []
    await sql`
      UPDATE pr_campaigns SET
        title        = COALESCE(${(override.title as string) ?? null}, title),
        body_content = COALESCE(${(override.body_content as string) ?? null}, body_content),
        updated_at   = ${new Date().toISOString()}
      WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId}
    `
    if (override.title) applied.push('title')
    if (override.body_content) applied.push('body_content')
    return { ok: true, fieldsApplied: applied }
  },

  // ── artifact: merges override into content_json (generic catch-all)
  artifact: async ({ workspaceId, targetReferenceId, override }) => {
    const existing = await sql`SELECT content_json FROM artifacts WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { content_json?: string | Record<string, unknown> } | undefined
    if (!row) return { ok: false, fieldsApplied: [], error: 'Artifact not found' }
    const base = typeof row.content_json === 'string'
      ? (() => { try { return JSON.parse(row.content_json as string) as Record<string, unknown> } catch { return {} } })()
      : (row.content_json as Record<string, unknown>) || {}
    const merged = { ...base, ...override }
    await sql`UPDATE artifacts SET content_json = ${JSON.stringify(merged)} WHERE id = ${targetReferenceId} AND workspace_id = ${workspaceId}`
    return { ok: true, fieldsApplied: ['content_json'] }
  },
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: experimentId } = await ctx.params
  let body: { workspaceId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { workspaceId } = body
  if (!workspaceId || !experimentId) {
    return NextResponse.json({ error: 'workspaceId and experiment id required' }, { status: 400 })
  }

  // ── 1. Workspace ownership ────────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 2. 🚨 PR Circuit Breaker ─────────────────────────────────────────
  const breaker = await assertCrisisClear(workspaceId)
  if (breaker) return breaker

  // ── 3. Load experiment + verify state ─────────────────────────────────
  const expRes = await sql`
    SELECT id, workspace_id, name, target_type, target_reference_id, status, winner_variant_id
    FROM marketing_experiments
    WHERE id = ${experimentId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const exp = expRes.rows[0] as unknown as ExperimentRow | undefined
  if (!exp) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })
  if (exp.status !== 'completed') {
    return NextResponse.json(
      {
        error: `Cannot promote winner — experiment is in '${exp.status}' state.`,
        currentStatus: exp.status,
        hint: exp.status === 'running'
          ? 'Wait for the significance cron to declare a winner first.'
          : exp.status === 'concluded'
          ? 'Winner already promoted — no further action needed.'
          : 'Only completed experiments can be promoted.',
      },
      { status: 409 },
    )
  }
  if (!exp.winner_variant_id) {
    return NextResponse.json({ error: 'No winner variant set — cannot promote' }, { status: 422 })
  }

  // ── 4. Load winner variant ────────────────────────────────────────────
  const varRes = await sql`
    SELECT id, experiment_id, variant_label, configuration_override_json
    FROM experiment_variants
    WHERE id = ${exp.winner_variant_id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const winner = varRes.rows[0] as unknown as VariantRow | undefined
  if (!winner) {
    return NextResponse.json({ error: 'Winner variant row missing — data integrity issue' }, { status: 500 })
  }

  // Parse override
  let override: Record<string, unknown>
  try {
    override = JSON.parse(winner.configuration_override_json || '{}')
    if (!override || typeof override !== 'object' || Array.isArray(override)) override = {}
  } catch {
    override = {}
  }
  if (Object.keys(override).length === 0) {
    return NextResponse.json(
      { error: 'Winner variant has an empty configuration_override — nothing to apply' },
      { status: 422 },
    )
  }

  // ── 5. 🛡️ HITL gate — if target_type === 'artifact', verify approval ─
  // For other target types, the HITL gate fires at downstream dispatch
  // time (e.g. email send still re-runs assertArtifactApproved on the
  // campaign's artifact_id). Here we only gate the artifact-direct path.
  if (exp.target_type === 'artifact') {
    const gate = await assertArtifactApproved(workspaceId, exp.target_reference_id)
    if (gate) return gate
  }

  // ── 6. Atomic CAS lock: completed → promoting ─────────────────────────
  await sql`
    UPDATE marketing_experiments
    SET status = 'promoting', updated_at = CURRENT_TIMESTAMP
    WHERE id = ${experimentId} AND workspace_id = ${workspaceId} AND status = 'completed'
  `
  const lockCheck = await sql`SELECT status FROM marketing_experiments WHERE id = ${experimentId} LIMIT 1`
  const lockedStatus = (lockCheck.rows[0] as { status?: string } | undefined)?.status
  if (lockedStatus !== 'promoting') {
    return NextResponse.json(
      {
        error: 'Could not acquire promotion lock — someone else may be promoting this experiment.',
        currentStatus: lockedStatus,
      },
      { status: 409 },
    )
  }

  const rollback = async (errMsg: string) => {
    try {
      await sql`
        UPDATE marketing_experiments
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${experimentId} AND workspace_id = ${workspaceId}
      `
    } catch (e) {
      console.error('[promote-winner] rollback failed', e, errMsg)
    }
  }

  // ── 7. Per-target-type promotion ──────────────────────────────────────
  const promoter = PROMOTERS[exp.target_type]
  if (!promoter) {
    await rollback('Unsupported target_type')
    return NextResponse.json(
      {
        error: `Target type '${exp.target_type}' has no promotion handler yet.`,
        supportedTypes: Object.keys(PROMOTERS),
      },
      { status: 422 },
    )
  }

  let result: PromotionOutcome
  try {
    result = await promoter({
      workspaceId,
      targetReferenceId: exp.target_reference_id,
      override,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await rollback(msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (!result.ok) {
    await rollback(result.error || 'Promotion handler failed')
    return NextResponse.json(
      { error: result.error || 'Promotion failed', fieldsApplied: result.fieldsApplied },
      { status: 500 },
    )
  }

  // ── 8. Flip experiment to 'concluded' (final state) ───────────────────
  try {
    await sql`
      UPDATE marketing_experiments
      SET status = 'concluded', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id = ${experimentId} AND workspace_id = ${workspaceId}
    `
  } catch (err) {
    console.error('[promote-winner] final state flip failed', err)
    // Don't rollback the asset change — it was applied. Just log the state mismatch.
  }

  // ── 9. Drop a learning_note so the CMO learns from the win ────────────
  try {
    await sql`
      INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
      VALUES (
        ${newId()}, ${workspaceId}, 'experiment_winner', ${experimentId},
        ${`Experiment "${exp.name}" winner promoted: variant '${winner.variant_label}' merged into ${exp.target_type} ${exp.target_reference_id}. Fields applied: ${result.fieldsApplied.join(', ')}`},
        0.95, CURRENT_TIMESTAMP
      )
    `
  } catch { /* non-fatal — learning_notes is an enhancement, not a blocker */ }

  return NextResponse.json({
    ok: true,
    experimentId,
    targetType: exp.target_type,
    targetReferenceId: exp.target_reference_id,
    winnerVariantId: winner.id,
    winnerLabel: winner.variant_label,
    fieldsApplied: result.fieldsApplied,
    status: 'concluded',
    message: `Winner "${winner.variant_label}" promoted permanently to ${exp.target_type}. Experiment is now concluded.`,
  })
}
