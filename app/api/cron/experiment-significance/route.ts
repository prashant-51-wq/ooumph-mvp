/**
 * GET /api/cron/experiment-significance
 *
 * Vercel cron entrypoint. For every `running` experiment, compute each
 * variant's posterior conversion-rate distribution using the Beta-Bernoulli
 * conjugate prior (Bayesian A/B testing) and declare a winner if any
 * variant clears the workspace-configured significance threshold.
 *
 * Why Bayesian instead of frequentist Z-test:
 *   • No assumption of normality / minimum sample size — works from day 1
 *   • Result is a direct probability statement: "variant B has 96.4%
 *     posterior probability of being the best" — intuitive for marketers
 *   • Sequential-test safe: peeking at the dashboard doesn't inflate
 *     false-positive rate the way it does with classical p-values
 *
 * Algorithm per experiment:
 *   1. Load all variants with impression_count + conversion_count
 *   2. For each variant compute Beta(α=conversions+1, β=impressions-conversions+1)
 *   3. Monte Carlo sample N=10,000 draws from each variant's posterior
 *   4. For each draw, find which variant had the highest sampled CR
 *   5. P(best) per variant = (times it won) / N
 *   6. If max(P_best) ≥ significance_threshold AND minimum sample met:
 *        UPDATE marketing_experiments SET status='completed', winner_variant_id=…
 *        INSERT notifications row
 *
 * Sample-size floor: require ≥100 impressions per variant before declaring
 * a winner, regardless of posterior probability. Catches the early-tide
 * trap where 5/10 vs 0/10 looks like 99% probability but isn't meaningful.
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron) OR x-internal-secret with ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 300

const MONTE_CARLO_SAMPLES = 10_000
const MINIMUM_IMPRESSIONS_PER_VARIANT = 100

// ─── Beta-distribution sampler ─────────────────────────────────────────────

/**
 * Sample one value from Beta(alpha, beta).
 * Uses the Marsaglia–Tsang gamma sampler — fast, no external deps, accurate
 * across the whole support. Beta(a,b) = G(a)/(G(a)+G(b)) where G is Gamma(shape,1).
 */
function sampleBeta(alpha: number, beta: number): number {
  const g1 = sampleGamma(alpha)
  const g2 = sampleGamma(beta)
  return g1 / (g1 + g2)
}

/** Marsaglia–Tsang sampler for Gamma(shape, 1). Returns a positive number. */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Boost trick: gamma(shape) = gamma(shape+1) * U^(1/shape)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number, v: number
    do {
      x = randNormal()
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Box–Muller transform for standard normal samples. */
function randNormal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ─── Types ────────────────────────────────────────────────────────────────

interface ExperimentRow {
  id: string
  workspace_id: string
  name: string
  status: string
  statistical_significance_threshold: number | string
  winner_variant_id: string | null
}

interface VariantRow {
  id: string
  variant_label: string
  impression_count: number | string
  conversion_count: number | string
}

interface ExperimentOutcome {
  experimentId: string
  experimentName: string
  variants: Array<{
    variantId: string
    variantLabel: string
    impressions: number
    conversions: number
    conversionRate: number
    probabilityBest: number
  }>
  thresholdRequired: number
  winnerDeclared: boolean
  winnerVariantId: string | null
  reason: string
}

// ─── Cron handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth — match the pattern used by /api/cron/publish-scheduled + brand-monitor
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const internal = req.headers.get('x-internal-secret') || ''
  const cronOk = cronSecret && auth === `Bearer ${cronSecret}`
  const adminOk = adminSecret && (internal === adminSecret || auth === `Bearer ${adminSecret}`)
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  // Load all running experiments across the platform
  const expRes = await sql`
    SELECT id, workspace_id, name, status, statistical_significance_threshold, winner_variant_id
    FROM marketing_experiments
    WHERE status = 'running' AND winner_variant_id IS NULL
    LIMIT 200
  `
  const experiments = expRes.rows as unknown as ExperimentRow[]
  const outcomes: ExperimentOutcome[] = []

  for (const exp of experiments) {
    const threshold = Math.max(0.5, Math.min(0.999, Number(exp.statistical_significance_threshold || 0.95)))
    const outcome: ExperimentOutcome = {
      experimentId: exp.id,
      experimentName: exp.name,
      variants: [],
      thresholdRequired: threshold,
      winnerDeclared: false,
      winnerVariantId: null,
      reason: '',
    }

    try {
      // Pull variants
      const varRes = await sql`
        SELECT id, variant_label, impression_count, conversion_count
        FROM experiment_variants
        WHERE experiment_id = ${exp.id}
        ORDER BY created_at ASC
      `
      const variants = varRes.rows as unknown as VariantRow[]
      if (variants.length < 2) {
        outcome.reason = `Only ${variants.length} variant(s) — need at least 2 to compare`
        outcomes.push(outcome); continue
      }

      // Pre-compute conversion rates + sample-size gate
      const arms = variants.map(v => {
        const imp = Math.max(0, Number(v.impression_count || 0))
        const conv = Math.min(imp, Math.max(0, Number(v.conversion_count || 0)))
        return {
          variantId: v.id,
          variantLabel: v.variant_label,
          impressions: imp,
          conversions: conv,
          conversionRate: imp > 0 ? conv / imp : 0,
          probabilityBest: 0,
        }
      })

      const minSample = Math.min(...arms.map(a => a.impressions))
      if (minSample < MINIMUM_IMPRESSIONS_PER_VARIANT) {
        outcome.variants = arms
        outcome.reason = `Smallest arm has ${minSample} impressions; need ≥ ${MINIMUM_IMPRESSIONS_PER_VARIANT} per variant`
        outcomes.push(outcome); continue
      }

      // ── Monte Carlo: sample each arm's posterior N times, tally wins ────
      const winCounts = new Array<number>(arms.length).fill(0)
      for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
        let bestIdx = 0
        let bestVal = -1
        for (let j = 0; j < arms.length; j++) {
          // Beta(conversions + 1, non_conversions + 1) — uniform Beta(1,1) prior
          const alpha = arms[j].conversions + 1
          const beta = (arms[j].impressions - arms[j].conversions) + 1
          const draw = sampleBeta(alpha, beta)
          if (draw > bestVal) { bestVal = draw; bestIdx = j }
        }
        winCounts[bestIdx]++
      }

      for (let i = 0; i < arms.length; i++) {
        arms[i].probabilityBest = winCounts[i] / MONTE_CARLO_SAMPLES
      }

      // ── Identify max P(best) ───────────────────────────────────────────
      let leaderIdx = 0
      for (let i = 1; i < arms.length; i++) {
        if (arms[i].probabilityBest > arms[leaderIdx].probabilityBest) leaderIdx = i
      }
      const leader = arms[leaderIdx]
      outcome.variants = arms

      // ── Declare winner if threshold cleared ────────────────────────────
      if (leader.probabilityBest >= threshold) {
        // Atomic CAS — only flip if still 'running' (defensive against double-cron-firing)
        await sql`
          UPDATE marketing_experiments
          SET status = 'completed',
              winner_variant_id = ${leader.variantId},
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${exp.id} AND workspace_id = ${exp.workspace_id} AND status = 'running'
        `

        outcome.winnerDeclared = true
        outcome.winnerVariantId = leader.variantId
        outcome.reason = `Variant '${leader.variantLabel}' wins with ${(leader.probabilityBest * 100).toFixed(2)}% posterior probability (CR ${(leader.conversionRate * 100).toFixed(2)}%)`

        // Best-effort notification — user sees a bell pop when winner declared
        try {
          await sql`
            INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
            VALUES (
              ${newId()}, ${exp.workspace_id}, 'experiment_winner',
              ${`🎯 Experiment winner: "${exp.name}"`},
              ${`Variant ${leader.variantLabel} won with ${(leader.probabilityBest * 100).toFixed(1)}% confidence (CR ${(leader.conversionRate * 100).toFixed(2)}% over ${leader.impressions.toLocaleString()} impressions). Go to /dashboard/experiments to promote it permanently.`},
              'info', CURRENT_TIMESTAMP
            )
          `
        } catch { /* non-fatal */ }
      } else {
        outcome.reason = `Leader '${leader.variantLabel}' at ${(leader.probabilityBest * 100).toFixed(2)}% — threshold is ${(threshold * 100).toFixed(1)}%`
      }
    } catch (err) {
      outcome.reason = `Analysis failed: ${err instanceof Error ? err.message : String(err)}`
      console.error('[experiment-significance] failed for', exp.id, err)
    }

    outcomes.push(outcome)
  }

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    experimentsAnalysed: outcomes.length,
    winnersDeclared: outcomes.filter(o => o.winnerDeclared).length,
    outcomes,
  })
}
