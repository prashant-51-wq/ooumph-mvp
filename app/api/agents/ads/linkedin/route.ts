/**
 * LinkedIn Ads Worker — Paid Ads Supervisor
 * POST /api/agents/ads/linkedin — manage LinkedIn ad campaigns
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { withCredentials } from '@/lib/credential-context'
import {
  getLinkedInCampaigns,
  getLinkedInCampaignAnalytics,
  isLinkedInAdsAvailable,
} from '@/lib/tools/linkedin-ads'

interface LinkedInAdsRequest {
  workspaceId: string
  action: 'campaigns' | 'groups' | 'analytics' | 'pause'
  campaignId?: string
}

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as LinkedInAdsRequest
    const { workspaceId, action, campaignId } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // Audit pass #6 P0: ownership + quota guards before any external ad-platform call.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    return await withCredentials({
      LINKEDIN_ADS_ACCESS_TOKEN: settings.linkedinAdsAccessToken as string | undefined,
      LINKEDIN_ADS_ACCOUNT_ID: settings.linkedinAdsAccountId as string | undefined,
    }, async () => {
      if (!isLinkedInAdsAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'LinkedIn Ads not configured. Add LINKEDIN_ADS_ACCESS_TOKEN and LINKEDIN_ADS_ACCOUNT_ID in Settings → API Keys.',
          requiresSetup: true,
        })
      }

      // ── List Campaigns ────────────────────────────────────────────────────────
      if (action === 'campaigns' || action === 'groups') {
        const campaigns = await getLinkedInCampaigns()
        return NextResponse.json({ ok: true, campaigns })
      }

      // ── Campaign Analytics ────────────────────────────────────────────────────
      if (action === 'analytics') {
        if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })
        const analytics = await getLinkedInCampaignAnalytics(campaignId)
        return NextResponse.json({ ok: true, analytics })
      }

      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    })
  } catch (error) {
    console.error('LinkedIn Ads route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
