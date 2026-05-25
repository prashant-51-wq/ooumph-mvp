/**
 * Meta Ads Worker — Paid Ads Supervisor
 * POST /api/agents/ads/meta — manage Meta (Facebook/Instagram) ad campaigns
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  getMetaCampaigns,
  createMetaCampaign,
  getMetaCampaignInsights,
  pauseMetaCampaign,
  activateMetaCampaign,
  getMetaAccountInfo,
  isMetaAdsAvailable,
} from '@/lib/tools/meta-ads'

interface MetaAdsRequest {
  workspaceId: string
  action: 'list' | 'create' | 'insights' | 'pause' | 'activate' | 'account'
  campaignId?: string
  name?: string
  objective?: string    // OUTCOME_TRAFFIC | OUTCOME_AWARENESS | OUTCOME_LEADS | OUTCOME_SALES
  dailyBudget?: number  // dollars — converted to cents internally (* 100)
  preset?: string       // 'last_7d' | 'last_14d' | 'last_30d'
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
    const body = await req.json() as MetaAdsRequest
    const { workspaceId, action, campaignId, name, objective, dailyBudget, preset } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Inject credentials from workspace settings
    if (settings.metaAccessToken) {
      process.env.META_ACCESS_TOKEN = settings.metaAccessToken as string
    }
    if (settings.metaAdAccountId) {
      process.env.META_AD_ACCOUNT_ID = settings.metaAdAccountId as string
    }

    // Check availability after injecting credentials
    if (!isMetaAdsAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Meta Ads not configured. Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in Settings → API Keys.',
        requiresSetup: true,
      })
    }

    // ── Account Info ─────────────────────────────────────────────────────────
    if (action === 'account') {
      const info = await getMetaAccountInfo()
      return NextResponse.json({ ok: true, account: info })
    }

    // ── List Campaigns ────────────────────────────────────────────────────────
    if (action === 'list') {
      const campaigns = await getMetaCampaigns()
      return NextResponse.json({ ok: true, campaigns })
    }

    // ── Create Campaign ───────────────────────────────────────────────────────
    if (action === 'create') {
      if (!name) return NextResponse.json({ error: 'Missing campaign name' }, { status: 400 })
      const budgetCents = dailyBudget ? Math.round(dailyBudget * 100) : 1000 // default $10
      const campaign = await createMetaCampaign({
        name,
        objective: objective || 'OUTCOME_TRAFFIC',
        dailyBudget: budgetCents,
      })
      return NextResponse.json({ ok: true, campaign })
    }

    // ── Campaign Insights ─────────────────────────────────────────────────────
    if (action === 'insights') {
      if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })
      const insights = await getMetaCampaignInsights(campaignId, preset || 'last_7d')
      return NextResponse.json({ ok: true, insights })
    }

    // ── Pause Campaign ────────────────────────────────────────────────────────
    if (action === 'pause') {
      if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })
      const result = await pauseMetaCampaign(campaignId)
      return NextResponse.json({ ok: true, result })
    }

    // ── Activate Campaign ─────────────────────────────────────────────────────
    if (action === 'activate') {
      if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })
      const result = await activateMetaCampaign(campaignId)
      return NextResponse.json({ ok: true, result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Meta Ads route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
