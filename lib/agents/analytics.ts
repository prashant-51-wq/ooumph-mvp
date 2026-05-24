/**
 * Analytics & Reporting Supervisor — Data Aggregator · Report Generator · KPI Tracker
 *
 * Workers:
 *  - Data Aggregator: pulls from campaign_performance, publish_log, artifacts, agent_runs
 *  - Report Generator: AI narrative over aggregated data
 *  - KPI Tracker: compares actuals vs brand goals, flags deviations
 */
import { runAgent } from '@/lib/claude'
import { sql, newId } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPIStatus {
  metric: string
  target: string
  current: string | number
  status: 'on_track' | 'at_risk' | 'behind' | 'exceeded'
  delta: string
}

export interface PlatformSummary {
  platform: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  revenue: number
  ctr: number
  roas: number
  postsPublished: number
}

export interface ContentSummary {
  totalArtifacts: number
  approved: number
  pending: number
  byType: Record<string, number>
  topPerformingType: string
}

export interface AgentActivitySummary {
  totalRuns: number
  completed: number
  failed: number
  byAgent: Record<string, number>
  activeAgents: string[]
}

export interface AnalyticsReport {
  period: string
  generatedAt: string
  executiveSummary: string
  overallHealthScore: number
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor'
  kpis: KPIStatus[]
  platformPerformance: PlatformSummary[]
  contentSummary: ContentSummary
  agentActivity: AgentActivitySummary
  topInsights: string[]
  recommendations: string[]
  forecastedImpact: string
}

// ─── GA4 Data Aggregator ──────────────────────────────────────────────────────

async function fetchGA4Data(propertyId: string, accessToken: string, days: number) {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'conversions' },
          ],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json() as {
      rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>
    }
    return data.rows?.map(row => ({
      channel: row.dimensionValues[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues[0]?.value || '0'),
      pageViews: parseInt(row.metricValues[1]?.value || '0'),
      users: parseInt(row.metricValues[2]?.value || '0'),
      newUsers: parseInt(row.metricValues[3]?.value || '0'),
      bounceRate: parseFloat(row.metricValues[4]?.value || '0'),
      avgSessionDuration: parseFloat(row.metricValues[5]?.value || '0'),
      conversions: parseInt(row.metricValues[6]?.value || '0'),
    })) || null
  } catch { return null }
}

// ─── Data Aggregator ──────────────────────────────────────────────────────────

export async function aggregateAnalyticsData(workspaceId: string, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch GA4 data if credentials are configured
  const ga4PropertyId = process.env.GA4_PROPERTY_ID
  const ga4AccessToken = process.env.GA4_ACCESS_TOKEN
  const ga4DataPromise = (ga4PropertyId && ga4AccessToken)
    ? fetchGA4Data(ga4PropertyId, ga4AccessToken, days)
    : Promise.resolve(null)

  const [perfRows, publishRows, artifactRows, runRows, brandRow, kpiRows, ga4Data] = await Promise.all([
    sql`SELECT platform, SUM(impressions) as impressions, SUM(clicks) as clicks,
               SUM(spend) as spend, SUM(conversions) as conversions, SUM(revenue) as revenue,
               AVG(ctr) as ctr, AVG(roas) as roas
        FROM campaign_performance
        WHERE workspace_id = ${workspaceId} AND date >= ${cutoff}
        GROUP BY platform`,

    sql`SELECT platform, COUNT(*) as count
        FROM publish_log
        WHERE workspace_id = ${workspaceId} AND published_at >= ${cutoff}
        GROUP BY platform`,

    sql`SELECT type, status, COUNT(*) as count
        FROM artifacts
        WHERE workspace_id = ${workspaceId} AND created_at >= ${cutoff}
        GROUP BY type, status`,

    sql`SELECT agent_name, status, COUNT(*) as count
        FROM agent_runs
        WHERE workspace_id = ${workspaceId} AND created_at >= ${cutoff}
        GROUP BY agent_name, status`,

    sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,

    sql`SELECT * FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'strategy'
        ORDER BY created_at DESC LIMIT 1`,
    ga4DataPromise,
  ])

  // Build platform performance summaries
  const publishByPlatform: Record<string, number> = {}
  for (const row of publishRows.rows) {
    publishByPlatform[String(row.platform)] = Number(row.count)
  }

  const platformPerformance: PlatformSummary[] = perfRows.rows.map(row => ({
    platform: String(row.platform),
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    spend: Number(row.spend) || 0,
    conversions: Number(row.conversions) || 0,
    revenue: Number(row.revenue) || 0,
    ctr: Number(row.ctr) || 0,
    roas: Number(row.roas) || 0,
    postsPublished: publishByPlatform[String(row.platform)] || 0,
  }))

  // Add platforms that have publishes but no paid performance
  for (const [platform, count] of Object.entries(publishByPlatform)) {
    if (!platformPerformance.find(p => p.platform === platform)) {
      platformPerformance.push({
        platform, impressions: 0, clicks: 0, spend: 0,
        conversions: 0, revenue: 0, ctr: 0, roas: 0, postsPublished: count,
      })
    }
  }

  // Content summary
  const byType: Record<string, number> = {}
  let approved = 0, pending = 0, totalArtifacts = 0
  for (const row of artifactRows.rows) {
    const t = String(row.type)
    byType[t] = (byType[t] || 0) + Number(row.count)
    totalArtifacts += Number(row.count)
    if (row.status === 'approved') approved += Number(row.count)
    if (row.status === 'draft') pending += Number(row.count)
  }
  const topPerformingType = Object.entries(byType).sort(([, a], [, b]) => b - a)[0]?.[0] || 'none'

  // Agent activity
  const byAgent: Record<string, number> = {}
  let totalRuns = 0, completed = 0, failed = 0
  for (const row of runRows.rows) {
    const a = String(row.agent_name)
    byAgent[a] = (byAgent[a] || 0) + Number(row.count)
    totalRuns += Number(row.count)
    if (row.status === 'completed') completed += Number(row.count)
    if (row.status === 'failed') failed += Number(row.count)
  }
  const activeAgents = Object.keys(byAgent)

  // Merge GA4 organic traffic as additional platform entries
  if (ga4Data) {
    for (const channel of ga4Data) {
      const platformKey = `ga4_${channel.channel.toLowerCase().replace(/\s+/g, '_')}`
      platformPerformance.push({
        platform: platformKey,
        impressions: channel.pageViews,
        clicks: channel.sessions,
        spend: 0,
        conversions: channel.conversions,
        revenue: 0,
        ctr: channel.sessions > 0 ? channel.conversions / channel.sessions : 0,
        roas: 0,
        postsPublished: 0,
      })
    }
  }

  return {
    brand: brandRow.rows[0] as Record<string, unknown> | undefined,
    strategy: kpiRows.rows[0]?.content_json as Record<string, unknown> | undefined,
    platformPerformance,
    contentSummary: { totalArtifacts, approved, pending, byType, topPerformingType },
    agentActivity: { totalRuns, completed, failed, byAgent, activeAgents },
    period: `Last ${days} days`,
    ga4Channels: ga4Data,
  }
}

// ─── KPI Targets API ──────────────────────────────────────────────────────────

export interface KPITargets {
  targetImpressions: number
  targetROAS: number
  targetApprovalRate: number
  targetAgentRuns: number
  targetConversions: number
  targetCPA: number
}

export const DEFAULT_KPI_TARGETS: KPITargets = {
  targetImpressions: 10000,
  targetROAS: 2.5,
  targetApprovalRate: 80,
  targetAgentRuns: 20,
  targetConversions: 50,
  targetCPA: 50,
}

export async function getKPITargets(workspaceId: string): Promise<KPITargets> {
  try {
    const result = await sql`SELECT targets_json FROM kpi_targets WHERE workspace_id = ${workspaceId} LIMIT 1`
    if (result.rows[0]) {
      const saved = result.rows[0].targets_json as KPITargets
      return { ...DEFAULT_KPI_TARGETS, ...saved }
    }
  } catch { /* table not yet created */ }
  return DEFAULT_KPI_TARGETS
}

export async function saveKPITargets(workspaceId: string, targets: Partial<KPITargets>): Promise<KPITargets> {
  const merged = { ...DEFAULT_KPI_TARGETS, ...targets }
  await sql`INSERT INTO kpi_targets (id, workspace_id, targets_json, updated_at)
            VALUES (${workspaceId + '_targets'}, ${workspaceId}, ${JSON.stringify(merged)}, CURRENT_TIMESTAMP)
            ON CONFLICT (workspace_id) DO UPDATE SET targets_json = ${JSON.stringify(merged)}, updated_at = CURRENT_TIMESTAMP`
  return merged
}

// ─── KPI Tracker ─────────────────────────────────────────────────────────────

export function trackKPIs(
  data: Awaited<ReturnType<typeof aggregateAnalyticsData>>,
  goals: string,
  customTargets?: KPITargets
): KPIStatus[] {
  const targets = customTargets || DEFAULT_KPI_TARGETS
  const kpis: KPIStatus[] = []
  // Exclude GA4 channels from paid platform totals for ROAS calculation
  const paidPlatforms = data.platformPerformance.filter(p => !p.platform.startsWith('ga4_'))
  const totalImpressions = data.platformPerformance.reduce((s, p) => s + p.impressions, 0)
  const totalClicks = data.platformPerformance.reduce((s, p) => s + p.clicks, 0)
  const totalSpend = paidPlatforms.reduce((s, p) => s + p.spend, 0)
  const totalConversions = data.platformPerformance.reduce((s, p) => s + p.conversions, 0)
  const avgROAS = paidPlatforms.filter(p => p.roas > 0).length
    ? paidPlatforms.filter(p => p.roas > 0).reduce((s, p) => s + p.roas, 0) / paidPlatforms.filter(p => p.roas > 0).length
    : 0
  const contentApprovalRate = data.contentSummary.totalArtifacts > 0
    ? (data.contentSummary.approved / data.contentSummary.totalArtifacts) * 100
    : 0

  const targetImpressions = customTargets?.targetImpressions ?? (goals?.toLowerCase().includes('reach') ? 50000 : 10000)
  const targetROAS = targets.targetROAS

  kpis.push({
    metric: 'Total Impressions',
    target: `${targetImpressions.toLocaleString()}`,
    current: totalImpressions,
    status: totalImpressions >= targetImpressions ? 'on_track' : totalImpressions >= targetImpressions * 0.7 ? 'at_risk' : 'behind',
    delta: `${totalImpressions >= targetImpressions ? '+' : ''}${Math.round(((totalImpressions - targetImpressions) / targetImpressions) * 100)}%`,
  })
  kpis.push({
    metric: 'Total Clicks',
    target: `${Math.round(targetImpressions * 0.02).toLocaleString()}`,
    current: totalClicks,
    status: totalClicks >= targetImpressions * 0.02 ? 'on_track' : 'at_risk',
    delta: totalClicks > 0 ? `CTR ${((totalClicks / Math.max(totalImpressions, 1)) * 100).toFixed(2)}%` : 'No data',
  })
  kpis.push({
    metric: 'ROAS',
    target: `${targetROAS}x`,
    current: avgROAS > 0 ? `${avgROAS.toFixed(2)}x` : 'N/A',
    status: avgROAS === 0 ? 'behind' : avgROAS >= targetROAS ? 'on_track' : avgROAS >= targetROAS * 0.8 ? 'at_risk' : 'behind',
    delta: avgROAS > 0 ? `${avgROAS >= targetROAS ? '+' : ''}${((avgROAS - targetROAS) / targetROAS * 100).toFixed(0)}%` : 'No paid data',
  })
  kpis.push({
    metric: 'Content Approval Rate',
    target: '80%',
    current: `${contentApprovalRate.toFixed(0)}%`,
    status: contentApprovalRate >= 80 ? 'on_track' : contentApprovalRate >= 60 ? 'at_risk' : 'behind',
    delta: `${data.contentSummary.approved} approved of ${data.contentSummary.totalArtifacts} total`,
  })
  kpis.push({
    metric: 'Agent Runs',
    target: `${targets.targetAgentRuns}+`,
    current: data.agentActivity.totalRuns,
    status: data.agentActivity.totalRuns >= targets.targetAgentRuns ? 'on_track' : data.agentActivity.totalRuns >= targets.targetAgentRuns * 0.5 ? 'at_risk' : 'behind',
    delta: `${data.agentActivity.completed} completed, ${data.agentActivity.failed} failed`,
  })
  if (totalConversions > 0 || totalSpend > 0) {
    kpis.push({
      metric: 'Cost Per Conversion',
      target: 'Under $50',
      current: totalConversions > 0 ? `$${(totalSpend / totalConversions).toFixed(2)}` : 'No conversions',
      status: totalConversions === 0 ? 'behind' : (totalSpend / totalConversions) <= 50 ? 'on_track' : 'at_risk',
      delta: `${totalConversions} total conversions`,
    })
  }

  return kpis
}

// ─── Report Generator ─────────────────────────────────────────────────────────

export async function generateAnalyticsReport(
  workspaceId: string,
  days = 30
): Promise<AnalyticsReport> {
  const [data, customTargets] = await Promise.all([
    aggregateAnalyticsData(workspaceId, days),
    getKPITargets(workspaceId),
  ])
  const brand = data.brand as { business_name?: string; goals?: string; monthly_budget?: string } | undefined
  const kpis = trackKPIs(data, brand?.goals || '', customTargets)

  const SYSTEM = `You are an expert marketing analyst and data storyteller.
Generate concise, actionable analytics reports. Use specific numbers from the data.
Always respond with valid JSON.`

  const prompt = `Generate a marketing analytics report for:

Business: ${brand?.business_name || 'Unknown'}
Period: ${data.period}
Goals: ${brand?.goals || 'Not specified'}
Monthly Budget: ${brand?.monthly_budget || 'Not specified'}

Platform Performance:
${JSON.stringify(data.platformPerformance, null, 2)}

Content Activity:
${JSON.stringify(data.contentSummary, null, 2)}

Agent Activity:
${JSON.stringify(data.agentActivity, null, 2)}

KPI Status:
${JSON.stringify(kpis, null, 2)}

Return JSON:
{
  "executiveSummary": "2-3 sentence summary of overall marketing performance",
  "overallHealthScore": 0-100,
  "overallHealth": "excellent|good|fair|poor",
  "topInsights": ["insight1", "insight2", "insight3", "insight4", "insight5"],
  "recommendations": ["action1", "action2", "action3"],
  "forecastedImpact": "What improvements are expected if recommendations are followed"
}`

  interface AIReport {
    executiveSummary: string
    overallHealthScore: number
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor'
    topInsights: string[]
    recommendations: string[]
    forecastedImpact: string
  }

  const aiReport = await runAgent<AIReport>(SYSTEM, prompt)

  const reportId = newId()
  const report: AnalyticsReport = {
    period: data.period,
    generatedAt: new Date().toISOString(),
    executiveSummary: aiReport.executiveSummary,
    overallHealthScore: aiReport.overallHealthScore,
    overallHealth: aiReport.overallHealth,
    kpis,
    platformPerformance: data.platformPerformance,
    contentSummary: data.contentSummary,
    agentActivity: data.agentActivity,
    topInsights: aiReport.topInsights || [],
    recommendations: aiReport.recommendations || [],
    forecastedImpact: aiReport.forecastedImpact,
  }

  // Save the report as an artifact
  await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
            VALUES (${reportId}, ${workspaceId}, ${null}, 'analytics_report',
                    ${'Analytics Report — ' + data.period}, ${JSON.stringify(report)})`
  await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${reportId})`

  return report
}
