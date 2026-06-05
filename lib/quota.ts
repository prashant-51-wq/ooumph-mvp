/**
 * lib/quota.ts — Sprint 12C
 *
 * Plan-tier quota enforcement for agent runs.
 *
 * Before this, every /api/agents/* route was rate-limited only by
 * assertWorkspaceOwnership and the underlying provider API costs.
 * A workspace on the Free tier could call CMO 10,000 times in a day
 * and burn through the platform's shared keys with no pushback.
 *
 * Now: each protected agent route calls assertAgentRunQuota() before
 * doing any LLM work. We read the workspace's plan.max_ai_runs_monthly
 * from `subscriptions` × `plans` and compare against the number of
 * agent_runs rows the workspace has accumulated in the current billing
 * period. Over the cap → 429 with a clear "upgrade or wait" payload.
 *
 * Trial logic: when subscriptions.current_period_start/end are NULL
 * (still trialing or no Stripe subscription yet), we fall back to a
 * "first of current calendar month" anchor so trial users get a
 * predictable monthly bucket.
 *
 * Internal bypasses (so server-to-server calls don't get quota-killed):
 *   - x-internal-secret == CRON_SECRET or ADMIN_SECRET → unmetered.
 *     Cron-fired agent runs are already capped by the cron's own
 *     BATCH_LIMIT + per-workspace pause check.
 *
 * Defaults when no subscription exists at all (a brand-new workspace
 * that hasn't gone through onboarding billing): treat as Free plan
 * (100 runs/month) so the platform isn't open-ended without an
 * onboarding pricing decision.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

interface PlanLimits {
  planId: string | null
  planName: string
  maxAiRunsMonthly: number
  periodStart: string  // ISO
  periodEnd: string    // ISO
}

const DEFAULT_FREE_LIMIT = 100  // runs/month when no subscription row at all

/**
 * Returns the workspace's plan limits + current billing period boundaries.
 * Falls back to a "free" sentinel when no subscription is found so quota
 * still applies — preferable to silently treating "no row" as unlimited.
 */
async function getWorkspacePlanLimits(workspaceId: string): Promise<PlanLimits> {
  const res = await sql`
    SELECT p.id as plan_id, p.name as plan_name, p.max_ai_runs_monthly,
           s.current_period_start, s.current_period_end, s.status
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.workspace_id = ${workspaceId} LIMIT 1
  `
  const row = res.rows[0] as {
    plan_id?: string; plan_name?: string; max_ai_runs_monthly?: number
    current_period_start?: string | null; current_period_end?: string | null
    status?: string
  } | undefined

  // Determine period bucket. Prefer Stripe-stamped dates; fall back to
  // calendar month so users don't avoid quota by never paying.
  const now = new Date()
  const calStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const calEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  if (!row) {
    return {
      planId: null,
      planName: 'Free (no subscription)',
      maxAiRunsMonthly: DEFAULT_FREE_LIMIT,
      periodStart: calStart,
      periodEnd: calEnd,
    }
  }

  return {
    planId: row.plan_id || null,
    planName: row.plan_name || 'Free',
    maxAiRunsMonthly: Number(row.max_ai_runs_monthly ?? DEFAULT_FREE_LIMIT),
    periodStart: row.current_period_start || calStart,
    periodEnd: row.current_period_end || calEnd,
  }
}

/**
 * Count agent_runs rows the workspace has created in [periodStart, now).
 * Counts ALL rows regardless of status — a failed/canceled run still
 * consumed our shared key + bandwidth. Operators who want only-completed
 * counting can adjust the WHERE clause here.
 */
async function getRunsThisPeriod(workspaceId: string, periodStart: string): Promise<number> {
  const res = await sql`
    SELECT COUNT(*)::int as n FROM agent_runs
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${periodStart}
  `
  return Number((res.rows[0] as { n?: number } | undefined)?.n || 0)
}

/**
 * Guard for agent routes. Call after assertWorkspaceOwnership:
 *
 *   export async function POST(req: NextRequest) {
 *     const denied = assertWorkspaceOwnership(req, workspaceId)
 *     if (denied) return denied
 *     const overQuota = await assertAgentRunQuota(req, workspaceId)
 *     if (overQuota) return overQuota
 *     // ... actual work
 *   }
 *
 * Returns:
 *   - null  → caller is under quota, proceed.
 *   - NextResponse 429 → over quota. Response body includes the plan
 *     name, used/limit counts, current period boundaries, and a clear
 *     'upgrade' hint pointing at /dashboard/billing.
 *
 * Bypasses:
 *   - x-internal-secret matching CRON_SECRET or ADMIN_SECRET
 *     (server-to-server traffic shouldn't get quota-killed).
 */
export async function assertAgentRunQuota(
  req: NextRequest,
  workspaceId: string,
): Promise<NextResponse | null> {
  if (!workspaceId) return null

  // Internal-service bypass — mirrors lib/guards.ts.
  const adminSecret = process.env.ADMIN_SECRET || ''
  const cronSecret = process.env.CRON_SECRET || ''
  const internal = req.headers.get('x-internal-secret') || ''
  if (
    internal &&
    ((adminSecret && internal === adminSecret) ||
     (cronSecret && internal === cronSecret))
  ) {
    return null
  }

  const limits = await getWorkspacePlanLimits(workspaceId)
  const used = await getRunsThisPeriod(workspaceId, limits.periodStart)

  if (used < limits.maxAiRunsMonthly) {
    return null
  }

  return NextResponse.json({
    ok: false,
    error: `Monthly AI run limit reached for your plan (${limits.planName}: ${used}/${limits.maxAiRunsMonthly}). Upgrade your plan or wait until the next billing period.`,
    quotaExceeded: true,
    plan: {
      name: limits.planName,
      limit: limits.maxAiRunsMonthly,
      used,
      periodStart: limits.periodStart,
      periodEnd: limits.periodEnd,
    },
    upgradeUrl: '/dashboard/billing',
  }, { status: 429 })
}

/**
 * Read-only helper for UI — returns the same shape as the 429 body
 * regardless of quota state. Lets a dashboard widget show "you've used
 * X of Y runs this month" without firing a quota-violating request.
 *
 *   const usage = await getAgentRunQuotaUsage(workspaceId)
 *   → { used, limit, remaining, planName, periodStart, periodEnd, percent }
 */
export async function getAgentRunQuotaUsage(workspaceId: string): Promise<{
  used: number; limit: number; remaining: number
  planName: string; periodStart: string; periodEnd: string
  percent: number; nearLimit: boolean
}> {
  const limits = await getWorkspacePlanLimits(workspaceId)
  const used = await getRunsThisPeriod(workspaceId, limits.periodStart)
  const remaining = Math.max(0, limits.maxAiRunsMonthly - used)
  const percent = limits.maxAiRunsMonthly > 0
    ? Math.min(100, (used / limits.maxAiRunsMonthly) * 100)
    : 100
  return {
    used,
    limit: limits.maxAiRunsMonthly,
    remaining,
    planName: limits.planName,
    periodStart: limits.periodStart,
    periodEnd: limits.periodEnd,
    percent: Number(percent.toFixed(1)),
    nearLimit: percent >= 80,
  }
}
