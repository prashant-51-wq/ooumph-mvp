/**
 * /api/experiments
 *
 * CRUD for marketing_experiments + their variants. The cron worker and
 * promote-winner endpoint operate on these rows; this endpoint is how
 * humans (or agents) create them in the first place.
 *
 *   GET    ?workspaceId=…[&status=running][&targetType=funnel_step]
 *
 *   POST   {
 *            workspaceId, name, targetType, targetReferenceId,
 *            hypothesis?,
 *            statisticalSignificanceThreshold? (0.5..0.999, default 0.95),
 *            variants: [
 *              { label: 'control', trafficAllocationWeight: 50, configurationOverrideJson?: {} },
 *              { label: 'a',       trafficAllocationWeight: 50, configurationOverrideJson?: {…} },
 *            ]
 *          }
 *
 *   PATCH  { id, workspaceId, status?: 'draft'|'running'|'paused'|'archived', name?, hypothesis? }
 *
 *   DELETE ?id=…&workspaceId=…    (hard-delete; ON DELETE CASCADE wipes variants + events)
 *
 * Status transitions to 'completed' / 'concluded' / 'promoting' are
 * OWNED EXCLUSIVELY by the significance cron + promote-winner route.
 * This endpoint refuses to set them directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_PATCH_STATUSES = new Set(['draft', 'running', 'paused', 'archived'])
const PROTECTED_STATUSES = new Set(['completed', 'concluded', 'promoting'])

const TARGET_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const VARIANT_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,50}$/

interface ExperimentRow {
  id: string
  workspace_id: string
  name: string
  hypothesis: string | null
  target_type: string
  target_reference_id: string
  status: string
  statistical_significance_threshold: number | string
  winner_variant_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  const targetType = searchParams.get('targetType')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (status && targetType) {
    result = await sql`
      SELECT * FROM marketing_experiments
      WHERE workspace_id = ${workspaceId} AND status = ${status} AND target_type = ${targetType}
      ORDER BY created_at DESC LIMIT 200
    `
  } else if (status) {
    result = await sql`
      SELECT * FROM marketing_experiments
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY created_at DESC LIMIT 200
    `
  } else if (targetType) {
    result = await sql`
      SELECT * FROM marketing_experiments
      WHERE workspace_id = ${workspaceId} AND target_type = ${targetType}
      ORDER BY created_at DESC LIMIT 200
    `
  } else {
    result = await sql`
      SELECT * FROM marketing_experiments
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT 200
    `
  }
  return NextResponse.json(result.rows as unknown as ExperimentRow[])
}

// ── POST (creates experiment + all variants atomically) ────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      name?: string
      hypothesis?: string
      targetType?: string
      targetReferenceId?: string
      statisticalSignificanceThreshold?: number
      variants?: Array<{
        label?: string
        trafficAllocationWeight?: number
        configurationOverrideJson?: Record<string, unknown> | string
      }>
    }
    const { workspaceId, name, targetType, targetReferenceId } = body
    if (!workspaceId || !name?.trim() || !targetType || !targetReferenceId) {
      return NextResponse.json(
        { error: 'workspaceId, name, targetType, and targetReferenceId are required' },
        { status: 400 },
      )
    }
    if (!TARGET_TYPE_PATTERN.test(targetType)) {
      return NextResponse.json({ error: 'targetType must be lowercase a-z 0-9 underscore' }, { status: 422 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const variants = Array.isArray(body.variants) ? body.variants : []
    if (variants.length < 2) {
      return NextResponse.json({ error: 'At least 2 variants are required (control + 1 challenger)' }, { status: 422 })
    }
    if (variants.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 variants per experiment' }, { status: 422 })
    }
    for (const v of variants) {
      if (!v.label?.trim() || !VARIANT_LABEL_PATTERN.test(v.label.trim())) {
        return NextResponse.json(
          { error: `Each variant requires a label matching ${VARIANT_LABEL_PATTERN.source}` },
          { status: 422 },
        )
      }
    }
    // Ensure unique labels
    const labels = new Set(variants.map(v => v.label!.trim().toLowerCase()))
    if (labels.size !== variants.length) {
      return NextResponse.json({ error: 'Variant labels must be unique within an experiment' }, { status: 422 })
    }

    const threshold = body.statisticalSignificanceThreshold !== undefined
      ? Math.max(0.5, Math.min(0.999, Number(body.statisticalSignificanceThreshold)))
      : 0.95

    const experimentId = newId()
    await sql`
      INSERT INTO marketing_experiments (
        id, workspace_id, name, hypothesis, target_type, target_reference_id,
        status, statistical_significance_threshold, created_at, updated_at
      ) VALUES (
        ${experimentId}, ${workspaceId}, ${name.trim()}, ${body.hypothesis?.trim() || null},
        ${targetType}, ${targetReferenceId}, 'draft', ${threshold},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `

    // Insert variants
    const variantIds: string[] = []
    for (const v of variants) {
      const overrideStr = v.configurationOverrideJson
        ? (typeof v.configurationOverrideJson === 'string'
            ? v.configurationOverrideJson.slice(0, 8000)
            : JSON.stringify(v.configurationOverrideJson).slice(0, 8000))
        : '{}'
      const weight = Math.max(0, Math.floor(Number(v.trafficAllocationWeight || 50)))
      const variantId = newId()
      await sql`
        INSERT INTO experiment_variants (
          id, workspace_id, experiment_id, variant_label,
          configuration_override_json, traffic_allocation_weight,
          impression_count, conversion_count, created_at
        ) VALUES (
          ${variantId}, ${workspaceId}, ${experimentId}, ${v.label!.trim()},
          ${overrideStr}, ${weight}, 0, 0, CURRENT_TIMESTAMP
        )
      `
      variantIds.push(variantId)
    }

    return NextResponse.json({ ok: true, id: experimentId, variantIds, status: 'draft' })
  } catch (err) {
    console.error('[/api/experiments POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH (status + metadata updates) ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      name?: string
      hypothesis?: string
      status?: string
    }
    const { id, workspaceId, status } = body
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT status FROM marketing_experiments WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { status?: string } | undefined
    if (!row) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })
    if (PROTECTED_STATUSES.has(row.status || '')) {
      return NextResponse.json(
        { error: `Cannot edit an experiment in '${row.status}' state.` },
        { status: 409 },
      )
    }
    if (status && !ALLOWED_PATCH_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Status '${status}' cannot be set here. Use the cron / promote-winner route for terminal states.` },
        { status: 422 },
      )
    }

    // When transitioning to 'running' for the first time, stamp started_at
    const willStart = status === 'running' && row.status !== 'running'
    await sql`
      UPDATE marketing_experiments SET
        name        = COALESCE(${body.name?.trim() ?? null}, name),
        hypothesis  = COALESCE(${body.hypothesis?.trim() ?? null}, hypothesis),
        status      = COALESCE(${status ?? null}, status),
        started_at  = COALESCE(${willStart ? new Date().toISOString() : null}, started_at),
        updated_at  = CURRENT_TIMESTAMP
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/experiments PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (cascade) ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Refuse to delete if currently in a state the cron / promote owns
  const existing = await sql`SELECT status FROM marketing_experiments WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
  const row = existing.rows[0] as { status?: string } | undefined
  if (!row) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })
  if (row.status === 'promoting') {
    return NextResponse.json({ error: 'Cannot delete an experiment that is currently promoting its winner' }, { status: 409 })
  }

  // ON DELETE CASCADE on FK clears variants + events automatically
  await sql`DELETE FROM marketing_experiments WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
