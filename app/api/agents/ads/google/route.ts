/**
 * Google Ads Worker — Paid Ads Supervisor
 * POST /api/agents/ads/google — manage Google Ads campaigns
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { withCredentials } from '@/lib/credential-context'
import {
  getGoogleAdsCampaigns,
  getGoogleAdsCampaignMetrics,
  getKeywordIdeas,
  pauseGoogleCampaign,
  isGoogleAdsAvailable,
} from '@/lib/tools/google-ads'

interface GoogleAdsRequest {
  workspaceId: string
  action: 'campaigns' | 'metrics' | 'keywords' | 'pause'
  campaignId?: string
  seeds?: string[]      // For keyword ideas
  dateRange?: 'LAST_7_DAYS' | 'LAST_14_DAYS' | 'LAST_30_DAYS'
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
    const body = await req.json() as GoogleAdsRequest
    const { workspaceId, action, campaignId, seeds, dateRange } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // Audit pass #6 P0: ownership + quota guards before any external ad-platform call.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // User-specific OAuth token and customer ID are passed directly to tool functions.
    const accessToken = settings.googleAdsAccessToken as string | undefined
    const customerId = settings.googleAdsCustomerId as string | undefined

    // Developer token + customer ID are request-scoped via AsyncLocalStorage
    // so concurrent workspaces don't see each other's credentials.
    return await withCredentials({
      GOOGLE_ADS_DEVELOPER_TOKEN: settings.googleAdsDeveloperToken as string | undefined,
      GOOGLE_ADS_CUSTOMER_ID: customerId,
    }, async () => {
      if (!isGoogleAdsAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Google Ads not configured. Add your Google Ads Developer Token in Settings → API Keys.',
          requiresSetup: true,
        })
      }

      if (!accessToken) {
        return NextResponse.json({
          ok: false,
          error: 'Google Ads access token not configured. Add your OAuth token in Settings → API Keys.',
          requiresSetup: true,
        })
      }

      // ── List Campaigns ────────────────────────────────────────────────────────
      if (action === 'campaigns') {
        const campaigns = await getGoogleAdsCampaigns(accessToken, customerId)
        return NextResponse.json({ ok: true, campaigns })
      }

      // ── Campaign Metrics ──────────────────────────────────────────────────────
      if (action === 'metrics') {
        const metrics = await getGoogleAdsCampaignMetrics(accessToken, customerId, dateRange || 'LAST_7_DAYS')
        return NextResponse.json({ ok: true, metrics })
      }

      // ── Keyword Ideas ─────────────────────────────────────────────────────────
      if (action === 'keywords') {
        const ideas = await getKeywordIdeas(seeds || [], accessToken, customerId)
        return NextResponse.json({ ok: true, ideas })
      }

      // ── Pause Campaign ────────────────────────────────────────────────────────
      if (action === 'pause') {
        if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })
        const paused = await pauseGoogleCampaign(campaignId, accessToken, customerId)
        return NextResponse.json({ ok: paused })
      }

      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    })
  } catch (error) {
    console.error('Google Ads route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
