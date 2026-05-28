/**
 * /api/analytics/recommendations — Sprint 6F
 *
 * Bucket-3 fix: the analytics report builder previously had a static
 * "AI-generated recommendations will appear here once the report engine
 * has data to analyze" stub. This endpoint replaces that stub with a
 * deterministic rule-based engine that ingests the workspace's stats
 * for the period and surfaces actionable, data-grounded recommendations.
 *
 * Why rule-based, not Claude:
 *   - Free, fast, deterministic (operators can audit "why" each
 *     recommendation surfaced).
 *   - No risk of the model fabricating metrics. Every recommendation
 *     references real numbers from the same stats query the dashboard
 *     uses.
 *   - Cron-safe: report engine will call this; predictable cost.
 *
 * GET ?workspaceId=…&range=30d
 *
 * Response shape:
 *   {
 *     range: '30d',
 *     generatedAt: ISO,
 *     recommendations: Array<{
 *       id: string,            // stable rule id, e.g. 'low_ctr_linkedin'
 *       title: string,         // one-liner shown in UI
 *       body: string,          // 1-2 sentence rationale citing the metric
 *       severity: 'info' | 'warning' | 'critical',
 *       metric?: { label: string, value: string }, // optional surface
 *     }>,
 *     dataAvailable: boolean,   // false when workspace has zero history
 *   }
 *
 * When dataAvailable is false the UI should render the empty-state copy
 * instead of "no recommendations" (which would be misleading).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface Recommendation {
  id: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  metric?: { label: string; value: string }
}

function rangeToDays(range: string | null): number {
  switch (range) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case '12mo': return 365
    default: return 30
  }
}

// Industry benchmarks — conservative defaults. Operators on Pro tier
// can override these in a future settings sprint.
const BENCHMARK_CTR_LOW = 1.0   // <1% CTR is considered weak
const BENCHMARK_CTR_HIGH = 3.0  // >3% CTR is considered strong
const BENCHMARK_CPL_HIGH = 50   // CPL >$50 deserves attention for typical SMB

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const range = searchParams.get('range')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  // Sprint 7A: prevent cross-workspace analytics leak.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const days = rangeToDays(range)
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString()
  const sinceDate = sinceISO.slice(0, 10)

  try {
    // Pull the same metrics shape /api/stats?view=analytics does — single
    // source of truth, so the recommendations always reference numbers
    // the operator already sees on the dashboard.
    const [publishedRes, leadsRes, leadsByStatusRes, leadsBySourceRes, campaignPerfRes, costRes] = await Promise.all([
      sql`SELECT COUNT(*)::int as count FROM publish_log WHERE workspace_id = ${workspaceId} AND published_at >= ${sinceISO}`,
      sql`SELECT COUNT(*)::int as count FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO}`,
      sql`SELECT status, COUNT(*)::int as count FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`,
      sql`SELECT source, COUNT(*)::int as count FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO} GROUP BY source`,
      sql`SELECT platform, SUM(impressions)::int as impressions, SUM(clicks)::int as clicks, SUM(spend)::numeric as spend, SUM(conversions)::int as conversions, SUM(revenue)::numeric as revenue FROM campaign_performance WHERE workspace_id = ${workspaceId} AND date >= ${sinceDate} GROUP BY platform`,
      sql`SELECT COALESCE(SUM(cost_estimate)::numeric, 0) as total_cost FROM agent_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO}`,
    ])

    const published = Number(publishedRes.rows[0]?.count ?? 0)
    const leads = Number(leadsRes.rows[0]?.count ?? 0)
    const totalAICost = Number((costRes.rows[0] as { total_cost?: number | string } | undefined)?.total_cost ?? 0)

    interface PlatformRow {
      platform: string; impressions: number; clicks: number;
      spend: number; conversions: number; revenue: number
    }
    const platforms: PlatformRow[] = campaignPerfRes.rows.map(r => ({
      platform: String(r.platform || 'unknown'),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      spend: Number(r.spend || 0),
      conversions: Number(r.conversions || 0),
      revenue: Number(r.revenue || 0),
    }))
    const totalSpend = platforms.reduce((s, p) => s + p.spend, 0)
    const totalConversions = platforms.reduce((s, p) => s + p.conversions, 0)
    const totalRevenue = platforms.reduce((s, p) => s + p.revenue, 0)

    interface LeadStatusRow { status: string; count: number }
    interface LeadSourceRow { source: string; count: number }
    const leadsByStatus: LeadStatusRow[] = leadsByStatusRes.rows.map(r => ({ status: String(r.status || 'unknown'), count: Number(r.count) }))
    const leadsBySource: LeadSourceRow[] = leadsBySourceRes.rows.map(r => ({ source: String(r.source || 'unknown'), count: Number(r.count) }))

    const dataAvailable = published > 0 || leads > 0 || totalSpend > 0 || totalAICost > 0
    const recommendations: Recommendation[] = []

    // ── Rule 1: nothing happening at all ───────────────────────────────────
    if (!dataAvailable) {
      // Empty state — the report builder UI handles this branch separately.
      return NextResponse.json({
        range: range || '30d',
        generatedAt: new Date().toISOString(),
        recommendations: [],
        dataAvailable: false,
      })
    }

    // ── Rule 2: per-platform CTR analysis ──────────────────────────────────
    for (const p of platforms) {
      if (p.impressions < 100) continue   // too small to draw conclusions
      const ctr = (p.clicks / p.impressions) * 100
      if (ctr < BENCHMARK_CTR_LOW) {
        recommendations.push({
          id: `low_ctr_${p.platform}`,
          severity: 'warning',
          title: `Weak CTR on ${p.platform}`,
          body: `${p.platform} click-through rate is ${ctr.toFixed(2)}% over the last ${days} days — below the ${BENCHMARK_CTR_LOW}% benchmark. Try refreshing hooks, testing new creative, or narrowing audience targeting.`,
          metric: { label: 'CTR', value: `${ctr.toFixed(2)}%` },
        })
      } else if (ctr > BENCHMARK_CTR_HIGH) {
        recommendations.push({
          id: `high_ctr_${p.platform}`,
          severity: 'info',
          title: `Strong CTR on ${p.platform}`,
          body: `${p.platform} CTR is ${ctr.toFixed(2)}% — well above the ${BENCHMARK_CTR_HIGH}% benchmark. Consider increasing budget allocation here while creative is performing.`,
          metric: { label: 'CTR', value: `${ctr.toFixed(2)}%` },
        })
      }
    }

    // ── Rule 3: paid spend with no conversions ─────────────────────────────
    for (const p of platforms) {
      if (p.spend >= 100 && p.conversions === 0) {
        recommendations.push({
          id: `dead_spend_${p.platform}`,
          severity: 'critical',
          title: `${p.platform}: spend without conversions`,
          body: `You've spent $${p.spend.toFixed(2)} on ${p.platform} this period with zero conversions. Pause this platform and audit your landing page + conversion tracking before resuming.`,
          metric: { label: 'Spend', value: `$${p.spend.toFixed(2)}` },
        })
      }
    }

    // ── Rule 4: cost per lead from paid is high ────────────────────────────
    if (totalSpend > 0 && totalConversions > 0) {
      const cpl = totalSpend / totalConversions
      if (cpl > BENCHMARK_CPL_HIGH) {
        recommendations.push({
          id: 'high_cpl',
          severity: 'warning',
          title: 'Cost per lead is high',
          body: `Blended CPL across paid channels is $${cpl.toFixed(2)} — above the $${BENCHMARK_CPL_HIGH} threshold. Audit which platform is driving the average up and consider tightening targeting or refreshing creative.`,
          metric: { label: 'CPL', value: `$${cpl.toFixed(2)}` },
        })
      }
    }

    // ── Rule 5: ROAS — revenue vs spend ─────────────────────────────────────
    if (totalSpend > 100) {
      const roas = totalRevenue / totalSpend
      if (roas < 1.0) {
        recommendations.push({
          id: 'negative_roas',
          severity: 'critical',
          title: 'Paid campaigns are not yet profitable',
          body: `Total revenue ($${totalRevenue.toFixed(2)}) is less than paid spend ($${totalSpend.toFixed(2)}) — ROAS of ${roas.toFixed(2)}. Either revenue attribution is missing or campaigns need a profitability review.`,
          metric: { label: 'ROAS', value: `${roas.toFixed(2)}×` },
        })
      } else if (roas > 3.0) {
        recommendations.push({
          id: 'strong_roas',
          severity: 'info',
          title: 'Strong ROAS — room to scale',
          body: `ROAS of ${roas.toFixed(2)}× across paid channels. Test increasing budget by 20-30% on top performers while monitoring CAC.`,
          metric: { label: 'ROAS', value: `${roas.toFixed(2)}×` },
        })
      }
    }

    // ── Rule 6: lead source concentration ──────────────────────────────────
    if (leads > 5 && leadsBySource.length > 0) {
      const dominant = [...leadsBySource].sort((a, b) => b.count - a.count)[0]
      const dominantShare = (dominant.count / leads) * 100
      if (dominantShare > 70 && leadsBySource.length === 1) {
        recommendations.push({
          id: 'single_source',
          severity: 'warning',
          title: 'Lead pipeline depends on one source',
          body: `${dominantShare.toFixed(0)}% of new leads (${dominant.count}/${leads}) come from "${dominant.source}". Diversify channels to reduce concentration risk — losing this one source would gut the pipeline.`,
          metric: { label: dominant.source, value: `${dominantShare.toFixed(0)}%` },
        })
      }
    }

    // ── Rule 7: lead qualification rate ────────────────────────────────────
    if (leads >= 10) {
      const newCount = leadsByStatus.find(s => s.status === 'new')?.count || 0
      const qualifiedCount = leadsByStatus
        .filter(s => ['qualified', 'customer', 'won', 'closed_won'].includes(s.status))
        .reduce((s, r) => s + r.count, 0)
      const totalScored = newCount + qualifiedCount
      if (totalScored > 0) {
        const qualRate = (qualifiedCount / totalScored) * 100
        if (qualRate < 10) {
          recommendations.push({
            id: 'low_qual_rate',
            severity: 'warning',
            title: 'Low lead-to-qualified conversion',
            body: `Only ${qualRate.toFixed(0)}% of leads have reached qualified status (${qualifiedCount}/${totalScored}). Either lead quality is weak, qualification follow-up is slow, or your scoring criteria need review.`,
            metric: { label: 'Qual rate', value: `${qualRate.toFixed(0)}%` },
          })
        }
      }
    }

    // ── Rule 8: silent workspace (no leads despite publishing) ─────────────
    if (published >= 10 && leads === 0) {
      recommendations.push({
        id: 'publishing_no_leads',
        severity: 'warning',
        title: 'Publishing without lead capture',
        body: `You've published ${published} pieces of content this period with zero captured leads. Check that your landing pages have working forms and that posts include clear CTAs pointing at them.`,
        metric: { label: 'Published', value: String(published) },
      })
    }

    // ── Rule 9: AI cost runaway ────────────────────────────────────────────
    // $5 over a 30-day window for a single workspace is enough to flag.
    const dailyAICost = days > 0 ? totalAICost / days : 0
    if (dailyAICost > 0.5) {
      recommendations.push({
        id: 'ai_cost_high',
        severity: 'warning',
        title: 'AI spend is climbing',
        body: `Daily AI cost averages $${dailyAICost.toFixed(2)} this period ($${totalAICost.toFixed(2)} over ${days} days). Audit which agent is driving the spend in /dashboard/agents and trim prompts or schedules where output isn't proportional.`,
        metric: { label: 'AI/day', value: `$${dailyAICost.toFixed(2)}` },
      })
    }

    // ── Rule 10: positive note — solid output ──────────────────────────────
    if (recommendations.length === 0 && published >= 5 && leads >= 5) {
      recommendations.push({
        id: 'all_clear',
        severity: 'info',
        title: 'No issues flagged this period',
        body: `Output and conversion are within healthy ranges. ${published} published / ${leads} new leads. Keep an eye on diversification and CPL as volume grows.`,
      })
    }

    // Sort: critical → warning → info (operators want the bad stuff first).
    const severityOrder: Record<Recommendation['severity'], number> = { critical: 0, warning: 1, info: 2 }
    recommendations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json({
      range: range || '30d',
      generatedAt: new Date().toISOString(),
      recommendations,
      dataAvailable: true,
    })
  } catch (err) {
    console.error('analytics/recommendations error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
