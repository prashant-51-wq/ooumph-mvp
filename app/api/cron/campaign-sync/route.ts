/**
 * Cron: /api/cron/campaign-sync — runs daily at 06:00 UTC (Vercel cron)
 * Syncs performance data from all active DSP campaigns for all workspaces.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { syncCampaignPerformance } from '@/lib/ad-platforms'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all unique workspace+campaign pairs that have platform links
    const linksResult = await sql`
      SELECT DISTINCT workspace_id, campaign_artifact_id
      FROM campaign_platform_links
      WHERE status = 'active'
      LIMIT 100
    `

    const results: Array<{ workspaceId: string; campaignId: string; status: string; error?: string }> = []

    for (const link of linksResult.rows) {
      const workspaceId = String(link.workspace_id)
      const campaignArtifactId = String(link.campaign_artifact_id)
      try {
        const snapshots = await syncCampaignPerformance(workspaceId, campaignArtifactId, 7)
        results.push({ workspaceId, campaignId: campaignArtifactId, status: 'synced' })
        console.log(`Synced ${snapshots.length} platform(s) for campaign ${campaignArtifactId}`)
      } catch (e) {
        results.push({ workspaceId, campaignId: campaignArtifactId, status: 'failed', error: String(e) })
        console.error(`Sync failed for campaign ${campaignArtifactId}:`, e)
      }
    }

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      total: results.length,
      succeeded: results.filter(r => r.status === 'synced').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    })
  } catch (error) {
    console.error('Campaign sync cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
