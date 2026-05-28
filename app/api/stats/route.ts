import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

function rangeToDays(range: string | null): number {
  switch (range) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    case '12mo': return 365
    default: return 30
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const view = searchParams.get('view')        // 'analytics' | null (default)
  const range = searchParams.get('range')      // '7d' | '30d' | '90d' | '12mo'

  if (!workspaceId) {
    return NextResponse.json({ artifacts: 0, pendingApprovals: 0, learningNotes: 0, completedTypes: [] })
  }
  // Sprint 8A: session must own this workspace. Without this the home
  // dashboard would leak any tenant's KPIs by URL-tampering ?workspaceId=.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── Default (dashboard) view ────────────────────────────────────────────────
  if (view !== 'analytics') {
    const [artifactsResult, approvalsResult, notesResult, typesResult] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM artifacts WHERE workspace_id = ${workspaceId}`,
      sql`SELECT COUNT(*) as count FROM approvals WHERE workspace_id = ${workspaceId} AND status = 'pending'`,
      sql`SELECT COUNT(*) as count FROM learning_notes WHERE workspace_id = ${workspaceId}`,
      sql`SELECT DISTINCT type FROM artifacts WHERE workspace_id = ${workspaceId}`,
    ])

    return NextResponse.json({
      artifacts: Number(artifactsResult.rows[0]?.count ?? 0),
      pendingApprovals: Number(approvalsResult.rows[0]?.count ?? 0),
      learningNotes: Number(notesResult.rows[0]?.count ?? 0),
      completedTypes: typesResult.rows.map((r) => r.type as string),
    })
  }

  // ── Analytics view ──────────────────────────────────────────────────────────
  const days = rangeToDays(range)
  const sinceMs = Date.now() - days * 86400000
  const sinceISO = new Date(sinceMs).toISOString()

  try {
    const [
      publishedResult,
      leadsResult,
      leadsByStatusResult,
      leadsBySourceResult,
      agentRunsResult,
      campaignPerfResult,
      topArtifactsResult,
      contentByTypeResult,
      publishByPlatformResult,
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM publish_log WHERE workspace_id = ${workspaceId} AND published_at >= ${sinceISO}`,
      sql`SELECT COUNT(*) as count FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO}`,
      sql`SELECT status, COUNT(*) as count FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`,
      sql`SELECT source, COUNT(*) as count FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO} GROUP BY source`,
      sql`SELECT agent_name, COUNT(*) as run_count, COALESCE(SUM(cost_estimate), 0) as total_cost FROM agent_runs WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO} GROUP BY agent_name`,
      sql`SELECT platform, SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(spend) as spend, SUM(conversions) as conversions, SUM(revenue) as revenue FROM campaign_performance WHERE workspace_id = ${workspaceId} AND date >= ${sinceISO.slice(0, 10)} GROUP BY platform`,
      sql`SELECT id, title, type, created_at FROM artifacts WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO} ORDER BY created_at DESC LIMIT 5`,
      sql`SELECT type, COUNT(*) as count FROM artifacts WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO} GROUP BY type`,
      sql`SELECT platform, COUNT(*) as count FROM publish_log WHERE workspace_id = ${workspaceId} AND published_at >= ${sinceISO} GROUP BY platform`,
    ])

    const totalRuns = agentRunsResult.rows.reduce((s, r) => s + Number(r.run_count || 0), 0)
    const totalCost = agentRunsResult.rows.reduce((s, r) => s + Number(r.total_cost || 0), 0)

    // Sum campaign metrics
    interface CampTotals {
      impressions: number
      clicks: number
      spend: number
      conversions: number
      revenue: number
    }
    const campTotals: CampTotals = campaignPerfResult.rows.reduce<CampTotals>(
      (acc, r) => {
        acc.impressions += Number(r.impressions || 0)
        acc.clicks += Number(r.clicks || 0)
        acc.spend += Number(r.spend || 0)
        acc.conversions += Number(r.conversions || 0)
        acc.revenue += Number(r.revenue || 0)
        return acc
      },
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 }
    )

    return NextResponse.json({
      range: range || '30d',
      days,
      published: Number(publishedResult.rows[0]?.count ?? 0),
      leads: Number(leadsResult.rows[0]?.count ?? 0),
      leadsByStatus: leadsByStatusResult.rows.map(r => ({ status: r.status as string, count: Number(r.count) })),
      leadsBySource: leadsBySourceResult.rows.map(r => ({ source: r.source as string, count: Number(r.count) })),
      agentRuns: agentRunsResult.rows.map(r => ({
        agent_name: r.agent_name as string,
        run_count: Number(r.run_count),
        total_cost: Number(r.total_cost || 0),
      })),
      totalRuns,
      totalCost,
      campaignByPlatform: campaignPerfResult.rows.map(r => ({
        platform: r.platform as string,
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        spend: Number(r.spend || 0),
        conversions: Number(r.conversions || 0),
        revenue: Number(r.revenue || 0),
      })),
      campTotals,
      reach: campTotals.impressions,
      revenue: campTotals.revenue,
      engagementRate: campTotals.impressions > 0
        ? Number(((campTotals.clicks / campTotals.impressions) * 100).toFixed(2))
        : 0,
      topArtifacts: topArtifactsResult.rows.map(r => ({
        id: r.id as string,
        title: r.title as string,
        type: r.type as string,
        created_at: r.created_at as string,
      })),
      contentByType: contentByTypeResult.rows.map(r => ({ type: r.type as string, count: Number(r.count) })),
      publishByPlatform: publishByPlatformResult.rows.map(r => ({ platform: r.platform as string, count: Number(r.count) })),
    })
  } catch (error) {
    console.error('Analytics stats error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
