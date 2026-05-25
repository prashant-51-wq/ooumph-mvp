/**
 * Meta Marketing API v20 client.
 * Handles campaigns, ad sets, ads, and insights for Facebook + Instagram.
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

const GRAPH = 'https://graph.facebook.com/v20.0'

export interface MetaCredentials {
  adAccountId: string   // e.g. "act_123456789"
  accessToken: string   // long-lived page or user access token
}

// ─── Objective mapping ────────────────────────────────────────────────────────

const OBJECTIVE_MAP: Record<string, string> = {
  awareness:   'BRAND_AWARENESS',
  traffic:     'LINK_CLICKS',
  leads:       'LEAD_GENERATION',
  conversions: 'OUTCOME_LEADS',
  sales:       'OUTCOME_SALES',
}

const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  awareness:   'REACH',
  traffic:     'LINK_CLICKS',
  leads:       'LEAD_GENERATION',
  conversions: 'OFFSITE_CONVERSIONS',
  sales:       'OFFSITE_CONVERSIONS',
}

const BILLING_EVENT_MAP: Record<string, string> = {
  awareness:   'IMPRESSIONS',
  traffic:     'LINK_CLICKS',
  leads:       'IMPRESSIONS',
  conversions: 'IMPRESSIONS',
  sales:       'IMPRESSIONS',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function graphPost(path: string, token: string, body: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${GRAPH}${path}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (data.error) throw new Error(`Meta API error: ${JSON.stringify(data.error)}`)
  return data
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params })
  const res = await fetchWithTimeout(`${GRAPH}${path}?${qs}`)
  const data = await res.json() as Record<string, unknown>
  if (data.error) throw new Error(`Meta API error: ${JSON.stringify(data.error)}`)
  return data
}

async function graphPatch(path: string, token: string, body: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${GRAPH}${path}?access_token=${token}`, {
    method: 'POST',  // Meta uses POST for updates on most resources
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (data.error) throw new Error(`Meta API error: ${JSON.stringify(data.error)}`)
  return data
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function createMetaCampaign(creds: MetaCredentials, opts: {
  name: string
  objective: string      // our internal: awareness | traffic | leads | conversions | sales
  dailyBudget?: number   // cents (so ₹500 = 50000 if we want ₹5/day minimum is $1)
  status?: 'ACTIVE' | 'PAUSED'
}) {
  const { adAccountId, accessToken } = creds
  const data = await graphPost(`/${adAccountId}/campaigns`, accessToken, {
    name: opts.name,
    objective: OBJECTIVE_MAP[opts.objective] || 'OUTCOME_LEADS',
    special_ad_categories: [],
    status: opts.status || 'PAUSED',  // always start paused for HITL
  })
  return { campaignId: data.id as string }
}

export async function updateMetaCampaign(creds: MetaCredentials, campaignId: string, updates: {
  status?: 'ACTIVE' | 'PAUSED' | 'DELETED'
  name?: string
  daily_budget?: number
}) {
  const data = await graphPatch(`/${campaignId}`, creds.accessToken, updates)
  return data
}

// ─── Ad Set ───────────────────────────────────────────────────────────────────

export async function createMetaAdSet(creds: MetaCredentials, opts: {
  campaignId: string
  name: string
  objective: string
  dailyBudget: number    // in account currency minor units (e.g. paise for INR, cents for USD)
  targeting: MetaTargeting
  startTime?: string     // ISO 8601
  endTime?: string
}) {
  const { adAccountId, accessToken } = creds
  const data = await graphPost(`/${adAccountId}/adsets`, accessToken, {
    name: opts.name,
    campaign_id: opts.campaignId,
    daily_budget: opts.dailyBudget,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    billing_event: BILLING_EVENT_MAP[opts.objective] || 'IMPRESSIONS',
    optimization_goal: OPTIMIZATION_GOAL_MAP[opts.objective] || 'LINK_CLICKS',
    targeting: opts.targeting,
    status: 'PAUSED',
    start_time: opts.startTime || new Date().toISOString(),
    end_time: opts.endTime,
  })
  return { adSetId: data.id as string }
}

export async function updateMetaAdSet(creds: MetaCredentials, adSetId: string, updates: {
  status?: 'ACTIVE' | 'PAUSED'
  daily_budget?: number
  bid_amount?: number
}) {
  return graphPatch(`/${adSetId}`, creds.accessToken, updates)
}

// ─── Ad Creative + Ad ─────────────────────────────────────────────────────────

export async function createMetaAdCreative(creds: MetaCredentials, opts: {
  pageId: string
  imageUrl: string
  headline: string
  body: string
  ctaType: string         // 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW' | 'GET_QUOTE' etc.
  websiteUrl: string
}) {
  const { adAccountId, accessToken } = creds
  const data = await graphPost(`/${adAccountId}/adcreatives`, accessToken, {
    name: `Creative — ${opts.headline.slice(0, 40)}`,
    object_story_spec: {
      page_id: opts.pageId,
      link_data: {
        image_url: opts.imageUrl,
        message: opts.body,
        name: opts.headline,
        call_to_action: { type: opts.ctaType, value: { link: opts.websiteUrl } },
        link: opts.websiteUrl,
      },
    },
  })
  return { creativeId: data.id as string }
}

export async function createMetaAd(creds: MetaCredentials, opts: {
  adSetId: string
  creativeId: string
  name: string
}) {
  const { adAccountId, accessToken } = creds
  const data = await graphPost(`/${adAccountId}/ads`, accessToken, {
    name: opts.name,
    adset_id: opts.adSetId,
    creative: { creative_id: opts.creativeId },
    status: 'PAUSED',
  })
  return { adId: data.id as string }
}

// ─── Insights / Performance ───────────────────────────────────────────────────

const INSIGHT_FIELDS = 'impressions,clicks,spend,ctr,cpc,actions,action_values,reach,frequency'

export interface MetaInsights {
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  conversions: number
  revenue: number
  roas: number
  reach: number
  frequency: number
  date: string
}

export async function getMetaCampaignInsights(
  creds: MetaCredentials,
  campaignId: string,
  datePreset: 'last_7d' | 'last_14d' | 'last_30d' | 'yesterday' = 'last_7d'
): Promise<MetaInsights[]> {
  const data = await graphGet(`/${campaignId}/insights`, creds.accessToken, {
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
    time_increment: '1',  // daily breakdown
    level: 'campaign',
  })
  const rows = (data.data as Record<string, unknown>[]) || []
  return rows.map(row => {
    const actions = (row.actions as Array<{ action_type: string; value: string }>) || []
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) || []
    const conversions = actions.reduce((sum, a) =>
      ['lead', 'purchase', 'complete_registration'].includes(a.action_type)
        ? sum + parseFloat(a.value || '0') : sum, 0)
    const revenue = actionValues.reduce((sum, a) =>
      ['purchase'].includes(a.action_type)
        ? sum + parseFloat(a.value || '0') : sum, 0)
    const spend = parseFloat(row.spend as string || '0')
    return {
      date: row.date_start as string,
      impressions: parseInt(row.impressions as string || '0'),
      clicks: parseInt(row.clicks as string || '0'),
      spend,
      ctr: parseFloat(row.ctr as string || '0'),
      cpc: parseFloat(row.cpc as string || '0'),
      conversions,
      revenue,
      roas: spend > 0 ? revenue / spend : 0,
      reach: parseInt(row.reach as string || '0'),
      frequency: parseFloat(row.frequency as string || '0'),
    }
  })
}

export async function getMetaAdSetInsights(
  creds: MetaCredentials,
  adSetId: string,
  datePreset: 'last_7d' | 'last_14d' | 'last_30d' = 'last_7d'
): Promise<MetaInsights[]> {
  const data = await graphGet(`/${adSetId}/insights`, creds.accessToken, {
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
    time_increment: '1',
    level: 'adset',
  })
  const rows = (data.data as Record<string, unknown>[]) || []
  return rows.map(row => {
    const actions = (row.actions as Array<{ action_type: string; value: string }>) || []
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) || []
    const conversions = actions.reduce((sum, a) =>
      ['lead', 'purchase', 'complete_registration'].includes(a.action_type)
        ? sum + parseFloat(a.value || '0') : sum, 0)
    const revenue = actionValues.reduce((sum, a) =>
      ['purchase'].includes(a.action_type) ? sum + parseFloat(a.value || '0') : sum, 0)
    const spend = parseFloat(row.spend as string || '0')
    return {
      date: row.date_start as string,
      impressions: parseInt(row.impressions as string || '0'),
      clicks: parseInt(row.clicks as string || '0'),
      spend, ctr: parseFloat(row.ctr as string || '0'),
      cpc: parseFloat(row.cpc as string || '0'),
      conversions, revenue,
      roas: spend > 0 ? revenue / spend : 0,
      reach: parseInt(row.reach as string || '0'),
      frequency: parseFloat(row.frequency as string || '0'),
    }
  })
}

// ─── Targeting types ──────────────────────────────────────────────────────────

export interface MetaTargeting {
  age_min?: number
  age_max?: number
  genders?: number[]     // 1 = male, 2 = female
  geo_locations?: {
    countries?: string[]
    cities?: Array<{ key: string; name: string; region: string; country: string }>
  }
  interests?: Array<{ id: string; name: string }>
  behaviors?: Array<{ id: string; name: string }>
  publisher_platforms?: string[]   // 'facebook', 'instagram', 'audience_network'
  facebook_positions?: string[]    // 'feed', 'right_hand_column', 'instant_article'
  instagram_positions?: string[]   // 'stream', 'story', 'explore'
  device_platforms?: string[]      // 'mobile', 'desktop'
}

export function buildMetaTargeting(audienceDescription: string, platform: string): MetaTargeting {
  const isInstagram = platform === 'instagram'
  const targeting: MetaTargeting = {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ['IN'] },  // default to India; can be overridden
    publisher_platforms: isInstagram ? ['instagram'] : ['facebook', 'instagram'],
    facebook_positions: isInstagram ? [] : ['feed'],
    instagram_positions: ['stream', 'story'],
    device_platforms: ['mobile', 'desktop'],
  }
  return targeting
}
