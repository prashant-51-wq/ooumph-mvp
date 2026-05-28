/**
 * GET  /api/agents/analytics — fetch saved analytics reports + live aggregated data
 * POST /api/agents/analytics — trigger Data Aggregator + Report Generator + KPI Tracker
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateAnalyticsReport, aggregateAnalyticsData, trackKPIs } from '@/lib/agents/analytics'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const mode = searchParams.get('mode') || 'reports'
  const days = parseInt(searchParams.get('days') || '30', 10)

  if (!workspaceId) return NextResponse.json([], { status: 200 })

  if (mode === 'live') {
    // Return aggregated live data without AI (fast, for dashboard widgets)
    try {
      const data = await aggregateAnalyticsData(workspaceId, days)
      const brandRow = await sql`SELECT goals FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
      const goals = String(brandRow.rows[0]?.goals || '')
      const kpis = trackKPIs(data, goals)
      return NextResponse.json({ ...data, kpis, days })
    } catch (error) {
      console.error('Analytics aggregation error:', error)
      return NextResponse.json({ error: String(error) }, { status: 500 })
    }
  }

  // Return saved AI reports
  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'analytics_report'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, days } = await req.json() as { workspaceId: string; days?: number }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const report = await generateAnalyticsReport(workspaceId, days || 30)

    return NextResponse.json({
      ok: true,
      report,
      message: `Analytics report generated — Health Score: ${report.overallHealthScore}/100 (${report.overallHealth}). ${report.recommendations.length} recommendations ready.`,
    })
  } catch (error) {
    console.error('Analytics report error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
