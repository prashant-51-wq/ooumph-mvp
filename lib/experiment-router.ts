/**
 * lib/experiment-router.ts
 *
 * Deterministic variant resolver. Given a visitor's trackingId (stable
 * cookie or user id), this function returns the SAME variant assignment
 * every time within the lifetime of an experiment — so a returning user
 * always sees the same A/B treatment.
 *
 *   const result = await resolveActiveVariant(
 *     workspaceId,
 *     'funnel_step',          // target_type
 *     'fs_abc123',             // target_reference_id
 *     'visitor_cookie_xyz',    // tracking id
 *   )
 *
 *   if (result) {
 *     const { variantId, variantLabel, configurationOverride, experimentId } = result
 *     // Merge configurationOverride into the base asset, render variant
 *   } else {
 *     // No running experiment → render base asset
 *   }
 *
 * Algorithm
 * ─────────
 * 1. Find the single 'running' experiment for (workspace, target_type, target_ref).
 *    The DB index `idx_marketing_experiments_target` makes this a single-row hit.
 *
 * 2. Load all variants and their `traffic_allocation_weight` values.
 *
 * 3. Compute `hash = sha256(trackingId + ':' + experimentId)` and take its
 *    first 8 hex chars as a 32-bit integer (≥ 4 billion buckets — plenty
 *    of granularity for weighted distributions up to thousands of arms).
 *
 * 4. `bucket = bigIntFromHash % SUM(weights)` selects the variant whose
 *    cumulative weight range contains the bucket.
 *
 * Determinism
 * ───────────
 * The same `(trackingId, experimentId)` pair will always hash to the same
 * 32-bit integer. The variant pool can grow over an experiment's lifetime
 * WITHOUT reassigning existing visitors as long as the new variants are
 * appended at the end of the cumulative weight axis — visitor X's bucket
 * still falls in the same range it did yesterday.
 *
 * If the experiment is paused or completed, this returns null (no override).
 * Callers should always be prepared for a null result and fall back to the
 * baseline asset config.
 */

import crypto from 'crypto'
import { sql } from '@/lib/db'

export interface ResolvedVariant {
  experimentId: string
  experimentName: string
  variantId: string
  variantLabel: string
  /** Parsed JSON patch. Empty object if the variant has no override. */
  configurationOverride: Record<string, unknown>
}

interface ExperimentRow {
  id: string
  name: string
  status: string
}
interface VariantRow {
  id: string
  variant_label: string
  configuration_override_json: string
  traffic_allocation_weight: number | string
}

const TARGET_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const TRACKING_ID_MAX = 256

/**
 * Convert the first 8 hex chars of an sha256 digest into a 32-bit unsigned int.
 * We deliberately use only 32 bits (not the full 256) because JavaScript's
 * Number safely handles ints up to 2^53, but 32 bits is more than enough
 * resolution for any sane traffic-split granularity — sum-of-weights would
 * have to exceed 4,294,967,295 before bucket distribution skews.
 */
function hashToBucket(trackingId: string, experimentId: string, modulo: number): number {
  if (modulo <= 0) return 0
  const digest = crypto
    .createHash('sha256')
    .update(`${trackingId}:${experimentId}`)
    .digest('hex')
  const slice = digest.slice(0, 8)             // 8 hex chars = 32 bits
  const intVal = parseInt(slice, 16)           // 0 .. 4,294,967,295
  return intVal % modulo
}

/**
 * Resolve the running experiment + chosen variant for a given (target, visitor).
 *
 * Returns `null` when:
 *   - inputs are invalid
 *   - no running experiment exists for this target
 *   - the experiment has zero variants
 *   - sum of variant weights is zero (mis-configured experiment — fail-open
 *     to base asset so visitors never see a broken page)
 *
 * Never throws. Database errors are swallowed and treated as "no experiment".
 */
export async function resolveActiveVariant(
  workspaceId: string,
  targetType: string,
  targetReferenceId: string,
  trackingId: string,
): Promise<ResolvedVariant | null> {
  // ── Input sanitisation ────────────────────────────────────────────────
  if (!workspaceId || !targetType || !targetReferenceId || !trackingId) return null
  if (!TARGET_TYPE_PATTERN.test(targetType)) return null
  if (trackingId.length > TRACKING_ID_MAX) return null

  try {
    // ── 1. Locate running experiment ────────────────────────────────────
    // Uses idx_marketing_experiments_target — single-row hit.
    const expRes = await sql`
      SELECT id, name, status FROM marketing_experiments
      WHERE workspace_id = ${workspaceId}
        AND target_type = ${targetType}
        AND target_reference_id = ${targetReferenceId}
        AND status = 'running'
      LIMIT 1
    `
    const experiment = expRes.rows[0] as unknown as ExperimentRow | undefined
    if (!experiment) return null

    // ── 2. Load all variants for this experiment ────────────────────────
    const varRes = await sql`
      SELECT id, variant_label, configuration_override_json, traffic_allocation_weight
      FROM experiment_variants
      WHERE experiment_id = ${experiment.id}
      ORDER BY created_at ASC, variant_label ASC
    `
    const variants = varRes.rows as unknown as VariantRow[]
    if (variants.length === 0) return null

    // ── 3. Sum weights — if zero, the experiment is misconfigured ───────
    const totalWeight = variants.reduce(
      (s, v) => s + Math.max(0, Number(v.traffic_allocation_weight || 0)),
      0,
    )
    if (totalWeight <= 0) return null

    // ── 4. Deterministic bucket selection ───────────────────────────────
    const bucket = hashToBucket(trackingId, experiment.id, totalWeight)

    let cumulative = 0
    let chosen: VariantRow | null = null
    for (const v of variants) {
      const weight = Math.max(0, Number(v.traffic_allocation_weight || 0))
      cumulative += weight
      if (bucket < cumulative) { chosen = v; break }
    }
    // Defensive: floor-rounding edge case — fall back to last variant
    if (!chosen) chosen = variants[variants.length - 1]

    // ── 5. Parse configuration override JSON ────────────────────────────
    let configurationOverride: Record<string, unknown> = {}
    if (chosen.configuration_override_json && chosen.configuration_override_json !== '{}') {
      try {
        const parsed = JSON.parse(chosen.configuration_override_json)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          configurationOverride = parsed as Record<string, unknown>
        }
      } catch { /* malformed override JSON — treat as empty */ }
    }

    return {
      experimentId: experiment.id,
      experimentName: experiment.name,
      variantId: chosen.id,
      variantLabel: chosen.variant_label,
      configurationOverride,
    }
  } catch (err) {
    // Fail-open: any DB error means visitors see the baseline asset, not a broken page.
    console.error('[experiment-router] resolve failed', err)
    return null
  }
}

/**
 * Convenience helper: merge a variant's configuration override into a base
 * config object. Shallow-merge (variant fields win). Used by dispatchers
 * that need to apply the override before publishing.
 */
export function applyVariantOverride<T extends Record<string, unknown>>(
  baseConfig: T,
  override: Record<string, unknown>,
): T {
  if (!override || Object.keys(override).length === 0) return baseConfig
  return { ...baseConfig, ...override } as T
}
