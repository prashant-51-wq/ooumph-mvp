/**
 * POST /api/campaign/sync  — pull fresh performance data from all connected DSPs
 * GET  /api/campaign/sync  — return stored performance data for a campaign
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { syncCampaignPerformance } from '@/lib/ad-platforms'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, campaignArtifactId, days = 7 } = await req.json() as {
      workspaceId: string
      campaignArtifactId: string
      days?: 7 | 14 | 30
    }
    if (!workspaceId || !campaignArtifactId) {
      return NextResponse.json({ error: 'Missing workspaceId or campaignArtifactId' }, { status: 400 })
    }
    // Sprint 9A: ownership.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const snapshots = await syncCampaignPerformance(workspaceId, campaignArtifactId, days)

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      platformsWithData: snapshots.map(s => s.platform),
      snapshots,
    })
  } catch (error) {
    console.error('Campaign sync error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const campaignArtifactId = searchParams.get('campaignArtifactId')
  if (!workspaceId || !campaignArtifactId) {
    return NextResponse.json({ platforms: [], performance: [], links: [] })
  }
  // Sprint 9A: ownership.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const [perfResult, linksResult] = await Promise.all([
    sql`
      SELECT platform, date, impressions, clicks, spend, conversions, ctr, cpc, cpa, roas
      FROM campaign_performance
      WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId}
      ORDER BY date DESC, platform
      LIMIT 200
    `,
    sql`
      SELECT platform, platform_campaign_id, platform_adset_ids, status, last_synced_at
      FROM campaign_platform_links
      WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId}
    `,
  ])

  // Aggregate totals per platform
  const platformMap: Record<string, {
    impressions: number; clicks: number; spend: number; conversions: number; days: number
  }> = {}
  for (const row of perfResult.rows) {
    const p = row.platform as string
    if (!platformMap[p]) platformMap[p] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, days: 0 }
    platformMap[p].impressions += (row.impressions as number) || 0
    platformMap[p].clicks += (row.clicks as number) || 0
    platformMap[p].spend += (row.spend as number) || 0
    platformMap[p].conversions += (row.conversions as number) || 0
    platformMap[p].days += 1
  }

  const platforms = Object.entries(platformMap).map(([platform, totals]) => ({
    platform,
    ...totals,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
  }))

  return NextResponse.json({
    platforms,
    performance: perfResult.rows,
    links: linksResult.rows,
  })
}
