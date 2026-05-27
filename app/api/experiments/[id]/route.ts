/**
 * GET /api/experiments/[id]
 *
 * Returns a single experiment + all its variants in one round-trip.
 * Used by the experiments dashboard to render the per-variant
 * Conversion Probability Meter without a second fetch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

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

interface VariantRow {
  id: string
  experiment_id: string
  variant_label: string
  configuration_override_json: string
  traffic_allocation_weight: number | string
  impression_count: number | string
  conversion_count: number | string
  created_at: string
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId || !id) return NextResponse.json({ error: 'workspaceId and id required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const expRes = await sql`
    SELECT * FROM marketing_experiments
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const experiment = expRes.rows[0] as unknown as ExperimentRow | undefined
  if (!experiment) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })

  const varRes = await sql`
    SELECT id, experiment_id, variant_label, configuration_override_json,
           traffic_allocation_weight, impression_count, conversion_count, created_at
    FROM experiment_variants
    WHERE experiment_id = ${id} AND workspace_id = ${workspaceId}
    ORDER BY created_at ASC
  `
  const variants = varRes.rows as unknown as VariantRow[]

  return NextResponse.json({ experiment, variants })
}
