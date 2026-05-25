/**
 * Google Ads REST API v17 client.
 * Handles campaigns, ad groups, responsive search ads, and performance reporting.
 *
 * Requires:
 *   GOOGLE_ADS_DEVELOPER_TOKEN env var (from Google Ads API Center)
 *   Per-workspace: access_token (OAuth), customer_id stored in integrations table
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

const GADS_BASE = 'https://googleads.googleapis.com/v17'

export interface GoogleAdsCredentials {
  customerId: string      // 10-digit customer ID without dashes
  accessToken: string     // OAuth 2.0 access token
  developerToken: string  // from env: GOOGLE_ADS_DEVELOPER_TOKEN
  managerId?: string      // MCC manager account ID (optional)
}

// ─── Objective → campaign type + bidding strategy ─────────────────────────────

function getCampaignConfig(objective: string) {
  switch (objective) {
    case 'awareness':
      return { campaignType: 'DISPLAY', biddingStrategy: 'TARGET_CPM', networkSettings: { targetGoogleSearch: false, targetSearchNetwork: false, targetContentNetwork: true, targetPartnerSearchNetwork: false } }
    case 'traffic':
      return { campaignType: 'SEARCH', biddingStrategy: 'MAXIMIZE_CLICKS', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false } }
    case 'leads':
      return { campaignType: 'SEARCH', biddingStrategy: 'MAXIMIZE_CONVERSIONS', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false } }
    case 'conversions':
    case 'sales':
      return { campaignType: 'PERFORMANCE_MAX', biddingStrategy: 'MAXIMIZE_CONVERSION_VALUE', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: true, targetPartnerSearchNetwork: false } }
    default:
      return { campaignType: 'SEARCH', biddingStrategy: 'MAXIMIZE_CLICKS', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false } }
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function buildHeaders(creds: GoogleAdsCredentials) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${creds.accessToken}`,
    'developer-token': creds.developerToken,
    'Content-Type': 'application/json',
  }
  if (creds.managerId) headers['login-customer-id'] = creds.managerId
  return headers
}

async function gadsPost(creds: GoogleAdsCredentials, endpoint: string, body: unknown) {
  const url = `${GADS_BASE}/customers/${creds.customerId}${endpoint}`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildHeaders(creds),
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`Google Ads API error: ${JSON.stringify(data)}`)
  return data
}

async function gadsGet(creds: GoogleAdsCredentials, endpoint: string) {
  const url = `${GADS_BASE}/customers/${creds.customerId}${endpoint}`
  const res = await fetchWithTimeout(url, { headers: buildHeaders(creds) })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`Google Ads API error: ${JSON.stringify(data)}`)
  return data
}

// ─── Campaign Budget ──────────────────────────────────────────────────────────

export async function createGoogleAdsBudget(creds: GoogleAdsCredentials, opts: {
  name: string
  amountMicros: number    // e.g. 500 INR = 500_000_000 micros
  deliveryMethod?: 'STANDARD' | 'ACCELERATED'
}) {
  const data = await gadsPost(creds, '/campaignBudgets:mutate', {
    operations: [{
      create: {
        name: opts.name,
        amountMicros: opts.amountMicros,
        deliveryMethod: opts.deliveryMethod || 'STANDARD',
      }
    }]
  })
  const results = (data.results as Array<{ resourceName: string }>) || []
  return { budgetResourceName: results[0]?.resourceName || '' }
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function createGoogleAdsCampaign(creds: GoogleAdsCredentials, opts: {
  name: string
  objective: string
  budgetResourceName: string
  startDate: string   // YYYYMMDD
  endDate?: string    // YYYYMMDD
}) {
  const config = getCampaignConfig(opts.objective)
  const campaignBody: Record<string, unknown> = {
    name: opts.name,
    status: 'PAUSED',   // always start paused for HITL
    campaignBudget: opts.budgetResourceName,
    advertisingChannelType: config.campaignType,
    networkSettings: config.networkSettings,
    startDate: opts.startDate,
  }

  if (opts.endDate) campaignBody.endDate = opts.endDate

  // Set bidding strategy
  if (config.biddingStrategy === 'MAXIMIZE_CLICKS') {
    campaignBody.maximizeClicks = {}
  } else if (config.biddingStrategy === 'MAXIMIZE_CONVERSIONS') {
    campaignBody.maximizeConversions = {}
  } else if (config.biddingStrategy === 'MAXIMIZE_CONVERSION_VALUE') {
    campaignBody.maximizeConversionValue = {}
  } else if (config.biddingStrategy === 'TARGET_CPM') {
    campaignBody.targetCpm = {}
  }

  const data = await gadsPost(creds, '/campaigns:mutate', {
    operations: [{ create: campaignBody }]
  })
  const results = (data.results as Array<{ resourceName: string }>) || []
  const resourceName = results[0]?.resourceName || ''
  const campaignId = resourceName.split('/').pop() || ''
  return { campaignId, resourceName }
}

export async function updateGoogleAdsCampaign(creds: GoogleAdsCredentials, campaignId: string, updates: {
  status?: 'ENABLED' | 'PAUSED' | 'REMOVED'
  name?: string
}) {
  const updateMask = Object.keys(updates).join(',')
  return gadsPost(creds, '/campaigns:mutate', {
    operations: [{
      update: {
        resourceName: `customers/${creds.customerId}/campaigns/${campaignId}`,
        ...updates,
      },
      updateMask,
    }]
  })
}

// ─── Ad Group ─────────────────────────────────────────────────────────────────

export async function createGoogleAdsAdGroup(creds: GoogleAdsCredentials, opts: {
  campaignId: string
  name: string
  cpcBidMicros?: number    // e.g. 10 INR = 10_000_000
}) {
  const data = await gadsPost(creds, '/adGroups:mutate', {
    operations: [{
      create: {
        name: opts.name,
        campaign: `customers/${creds.customerId}/campaigns/${opts.campaignId}`,
        status: 'ENABLED',
        type: 'SEARCH_STANDARD',
        cpcBidMicros: opts.cpcBidMicros || 10_000_000,
      }
    }]
  })
  const results = (data.results as Array<{ resourceName: string }>) || []
  const resourceName = results[0]?.resourceName || ''
  const adGroupId = resourceName.split('/').pop() || ''
  return { adGroupId, resourceName }
}

// ─── Responsive Search Ad ─────────────────────────────────────────────────────

export async function createGoogleAdsResponsiveSearchAd(creds: GoogleAdsCredentials, opts: {
  adGroupId: string
  headlines: string[]    // 3-15 items, max 30 chars each
  descriptions: string[] // 2-4 items, max 90 chars each
  finalUrls: string[]
  path1?: string
  path2?: string
}) {
  const headlines = opts.headlines.slice(0, 15).map(text => ({
    text: text.slice(0, 30)
  }))
  const descriptions = opts.descriptions.slice(0, 4).map(text => ({
    text: text.slice(0, 90)
  }))

  const data = await gadsPost(creds, '/adGroupAds:mutate', {
    operations: [{
      create: {
        adGroup: `customers/${creds.customerId}/adGroups/${opts.adGroupId}`,
        status: 'ENABLED',
        ad: {
          finalUrls: opts.finalUrls,
          responsiveSearchAd: {
            headlines,
            descriptions,
            path1: opts.path1 || '',
            path2: opts.path2 || '',
          }
        }
      }
    }]
  })
  const results = (data.results as Array<{ resourceName: string }>) || []
  return { adResourceName: results[0]?.resourceName || '' }
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

export async function createGoogleAdsKeywords(creds: GoogleAdsCredentials, opts: {
  adGroupId: string
  keywords: string[]
  matchType?: 'BROAD' | 'PHRASE' | 'EXACT'
}) {
  const operations = opts.keywords.map(kw => ({
    create: {
      adGroup: `customers/${creds.customerId}/adGroups/${opts.adGroupId}`,
      text: kw,
      matchType: opts.matchType || 'BROAD',
      status: 'ENABLED',
    }
  }))
  return gadsPost(creds, '/adGroupCriteria:mutate', { operations })
}

// ─── Performance Reporting ────────────────────────────────────────────────────

export interface GoogleAdsMetrics {
  date: string
  impressions: number
  clicks: number
  spend: number        // in INR (converted from micros)
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
}

export async function getGoogleAdsCampaignMetrics(
  creds: GoogleAdsCredentials,
  campaignId: string,
  days = 7
): Promise<GoogleAdsMetrics[]> {
  const query = `
    SELECT
      campaign.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date DURING LAST_${days}_DAYS
    ORDER BY segments.date DESC
  `.trim()

  const data = await gadsPost(creds, '/googleAds:searchStream', { query })
  const batchResults = (data as unknown as Array<{ results: Record<string, unknown>[] }>)
  const rows: Record<string, unknown>[] = batchResults.flatMap(b => b.results || [])

  return rows.map(row => {
    const metrics = row.metrics as Record<string, unknown>
    const costMicros = parseInt(metrics?.cost_micros as string || '0')
    const spend = costMicros / 1_000_000
    const conversions = parseFloat(metrics?.conversions as string || '0')
    const conversionValue = parseFloat(metrics?.conversions_value as string || '0')
    return {
      date: (row.segments as Record<string, unknown>)?.date as string || '',
      impressions: parseInt(metrics?.impressions as string || '0'),
      clicks: parseInt(metrics?.clicks as string || '0'),
      spend,
      conversions,
      ctr: parseFloat(metrics?.ctr as string || '0'),
      cpc: costMicros > 0 ? (parseInt(metrics?.average_cpc as string || '0') / 1_000_000) : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      roas: spend > 0 ? conversionValue / spend : 0,
    }
  })
}

export async function getGoogleAdsAdGroupMetrics(
  creds: GoogleAdsCredentials,
  adGroupId: string,
  days = 7
): Promise<GoogleAdsMetrics[]> {
  const query = `
    SELECT
      ad_group.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM ad_group
    WHERE ad_group.id = ${adGroupId}
      AND segments.date DURING LAST_${days}_DAYS
    ORDER BY segments.date DESC
  `.trim()

  const data = await gadsPost(creds, '/googleAds:searchStream', { query })
  const batchResults = (data as unknown as Array<{ results: Record<string, unknown>[] }>)
  const rows: Record<string, unknown>[] = batchResults.flatMap(b => b.results || [])

  return rows.map(row => {
    const metrics = row.metrics as Record<string, unknown>
    const costMicros = parseInt(metrics?.cost_micros as string || '0')
    const spend = costMicros / 1_000_000
    const conversions = parseFloat(metrics?.conversions as string || '0')
    return {
      date: (row.segments as Record<string, unknown>)?.date as string || '',
      impressions: parseInt(metrics?.impressions as string || '0'),
      clicks: parseInt(metrics?.clicks as string || '0'),
      spend, conversions,
      ctr: parseFloat(metrics?.ctr as string || '0'),
      cpc: costMicros > 0 ? (parseInt(metrics?.average_cpc as string || '0') / 1_000_000) : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      roas: 0,
    }
  })
}

// ─── Budget update ────────────────────────────────────────────────────────────

export async function updateGoogleAdsBudget(creds: GoogleAdsCredentials, budgetResourceName: string, newAmountMicros: number) {
  return gadsPost(creds, '/campaignBudgets:mutate', {
    operations: [{
      update: {
        resourceName: budgetResourceName,
        amountMicros: newAmountMicros,
      },
      updateMask: 'amount_micros',
    }]
  })
}
