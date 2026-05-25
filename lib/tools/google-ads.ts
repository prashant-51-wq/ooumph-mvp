// Google Ads API (GAQL)

const GOOGLE_ADS_BASE = 'https://googleads.googleapis.com/v18'

export interface GoogleAdsCampaign {
  id: string
  name: string
  status: string
  advertisingChannelType: string
  budgetAmountMicros?: string
  metrics?: {
    impressions: string
    clicks: string
    costMicros: string
    ctr: string
    averageCpc: string
  }
}

function buildHeaders(accessToken: string, customerId: string): Record<string, string> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type': 'application/json',
  }
  if (customerId) {
    headers['login-customer-id'] = customerId
  }
  return headers
}

function mapCampaignResult(result: Record<string, unknown>): GoogleAdsCampaign {
  const campaign = result.campaign as Record<string, unknown> | undefined
  const campaignBudget = result.campaignBudget as Record<string, unknown> | undefined
  const metrics = result.metrics as Record<string, unknown> | undefined
  return {
    id: String((campaign?.['resourceName'] as string)?.split('/').pop() || campaign?.['id'] || ''),
    name: String(campaign?.['name'] || ''),
    status: String(campaign?.['status'] || ''),
    advertisingChannelType: String(campaign?.['advertisingChannelType'] || ''),
    budgetAmountMicros: campaignBudget?.['amountMicros']
      ? String(campaignBudget['amountMicros'])
      : undefined,
    metrics: metrics
      ? {
          impressions: String(metrics['impressions'] || '0'),
          clicks: String(metrics['clicks'] || '0'),
          costMicros: String(metrics['costMicros'] || '0'),
          ctr: String(metrics['ctr'] || '0'),
          averageCpc: String(metrics['averageCpc'] || '0'),
        }
      : undefined,
  }
}

export async function getGoogleAdsCampaigns(
  accessToken: string,
  customerId?: string
): Promise<GoogleAdsCampaign[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken || !accessToken) return []
  const cid = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  if (!cid) return []
  try {
    const query =
      "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED' LIMIT 50"
    const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:search`, {
      method: 'POST',
      headers: buildHeaders(accessToken, cid),
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return []
    const json = await res.json()
    const results: Record<string, unknown>[] = json.results || []
    return results.map(mapCampaignResult)
  } catch {
    return []
  }
}

export async function getGoogleAdsCampaignMetrics(
  accessToken: string,
  customerId?: string,
  dateRange: 'LAST_7_DAYS' | 'LAST_14_DAYS' | 'LAST_30_DAYS' = 'LAST_30_DAYS'
): Promise<GoogleAdsCampaign[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken || !accessToken) return []
  const cid = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  if (!cid) return []
  try {
    const query = `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date DURING ${dateRange}`
    const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:search`, {
      method: 'POST',
      headers: buildHeaders(accessToken, cid),
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return []
    const json = await res.json()
    const results: Record<string, unknown>[] = json.results || []
    return results.map(mapCampaignResult)
  } catch {
    return []
  }
}

export async function getKeywordIdeas(
  seeds: string[],
  accessToken: string,
  customerId?: string
): Promise<{ text: string; avgMonthlySearches: string; competition: string }[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken || !accessToken) return []
  const cid = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  if (!cid) return []
  try {
    const res = await fetch(
      `${GOOGLE_ADS_BASE}/customers/${cid}/keywordPlanIdeas:generateKeywordIdeas`,
      {
        method: 'POST',
        headers: buildHeaders(accessToken, cid),
        body: JSON.stringify({
          keywordSeed: { keywords: seeds },
          language: 'languageConstants/1000',
          geoTargetConstants: [],
          keywordPlanNetwork: 'GOOGLE_SEARCH',
        }),
      }
    )
    if (!res.ok) return []
    const json = await res.json()
    const results: Record<string, unknown>[] = json.results || []
    return results.map((r) => {
      const keywordIdea = r.keywordIdeaMetrics as Record<string, unknown> | undefined
      return {
        text: String((r.text as string) || ''),
        avgMonthlySearches: String(keywordIdea?.['avgMonthlySearches'] || '0'),
        competition: String(keywordIdea?.['competition'] || 'UNKNOWN'),
      }
    })
  } catch {
    return []
  }
}

export async function pauseGoogleCampaign(
  campaignId: string,
  accessToken: string,
  customerId?: string
): Promise<boolean> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!devToken || !accessToken) return false
  const cid = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ''
  if (!cid) return false
  try {
    const res = await fetch(
      `${GOOGLE_ADS_BASE}/customers/${cid}/campaigns/${campaignId}:mutate`,
      {
        method: 'POST',
        headers: buildHeaders(accessToken, cid),
        body: JSON.stringify({
          operation: {
            update: {
              resourceName: `customers/${cid}/campaigns/${campaignId}`,
              status: 'PAUSED',
            },
            updateMask: 'status',
          },
        }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

export function isGoogleAdsAvailable(): boolean {
  return !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN
}
