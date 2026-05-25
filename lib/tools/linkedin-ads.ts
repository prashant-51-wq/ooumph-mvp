// LinkedIn Ads API

const LINKEDIN_ADS_BASE = 'https://api.linkedin.com/v2'

export interface LinkedInAdCampaignGroup {
  id: string
  name: string
  status: string
  account: string
  runSchedule?: { start: number; end?: number }
}

export interface LinkedInAdCampaign {
  id: string
  name: string
  status: string
  type: string
  objectiveType?: string
  totalBudget?: { amount: string; currencyCode: string }
  dailyBudget?: { amount: string; currencyCode: string }
}

export interface LinkedInAdAnalytics {
  impressions: number
  clicks: number
  costInLocalCurrency: string
  ctr: number
  costPerClick: string
  dateRange: { start: { year: number; month: number; day: number } }
}

function linkedInHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

export async function getLinkedInCampaignGroups(
  accessToken?: string,
  accountId?: string
): Promise<LinkedInAdCampaignGroup[]> {
  const token = accessToken || process.env.LINKEDIN_ADS_ACCESS_TOKEN
  const account = accountId || process.env.LINKEDIN_ADS_ACCOUNT_ID
  if (!token || !account) return []
  try {
    const encodedAccount = encodeURIComponent(account)
    const res = await fetch(
      `${LINKEDIN_ADS_BASE}/adCampaignGroups?q=search&search.account.values[0]=${encodedAccount}`,
      { headers: linkedInHeaders(token) }
    )
    if (!res.ok) return []
    const json = await res.json()
    const elements: Record<string, unknown>[] = json.elements || []
    return elements.map((el) => ({
      id: String(el.id || ''),
      name: String(el.name || ''),
      status: String(el.status || ''),
      account: String(el.account || account),
      runSchedule: el.runSchedule as LinkedInAdCampaignGroup['runSchedule'],
    }))
  } catch {
    return []
  }
}

export async function getLinkedInCampaigns(
  accessToken?: string,
  accountId?: string
): Promise<LinkedInAdCampaign[]> {
  const token = accessToken || process.env.LINKEDIN_ADS_ACCESS_TOKEN
  const account = accountId || process.env.LINKEDIN_ADS_ACCOUNT_ID
  if (!token || !account) return []
  try {
    const encodedAccount = encodeURIComponent(account)
    const res = await fetch(
      `${LINKEDIN_ADS_BASE}/adCampaigns?q=search&search.account.values[0]=${encodedAccount}`,
      { headers: linkedInHeaders(token) }
    )
    if (!res.ok) return []
    const json = await res.json()
    const elements: Record<string, unknown>[] = json.elements || []
    return elements.map((el) => ({
      id: String(el.id || ''),
      name: String(el.name || ''),
      status: String(el.status || ''),
      type: String(el.type || ''),
      objectiveType: el.objectiveType ? String(el.objectiveType) : undefined,
      totalBudget: el.totalBudget as LinkedInAdCampaign['totalBudget'],
      dailyBudget: el.dailyBudget as LinkedInAdCampaign['dailyBudget'],
    }))
  } catch {
    return []
  }
}

export async function getLinkedInCampaignAnalytics(
  campaignId: string,
  accessToken?: string
): Promise<LinkedInAdAnalytics | null> {
  const token = accessToken || process.env.LINKEDIN_ADS_ACCESS_TOKEN
  if (!token) return null
  try {
    const campaignUrn = encodeURIComponent(`urn:li:sponsoredCampaign:${campaignId}`)
    const fields = 'impressions,clicks,costInLocalCurrency,ctr'
    const url =
      `${LINKEDIN_ADS_BASE}/adAnalytics?q=analytics&pivot=CAMPAIGN` +
      `&dateRange.start.day=1&dateRange.start.month=1&dateRange.start.year=2024` +
      `&campaigns[0]=${campaignUrn}&fields=${fields}`
    const res = await fetch(url, { headers: linkedInHeaders(token) })
    if (!res.ok) return null
    const json = await res.json()
    const elements: Record<string, unknown>[] = json.elements || []
    if (elements.length === 0) return null
    const el = elements[0]
    const clicks = Number(el.clicks || 0)
    const cost = String(el.costInLocalCurrency || '0')
    const costNum = parseFloat(cost) || 0
    return {
      impressions: Number(el.impressions || 0),
      clicks,
      costInLocalCurrency: cost,
      ctr: Number(el.ctr || 0),
      costPerClick: clicks > 0 ? String((costNum / clicks).toFixed(4)) : '0',
      dateRange: (el.dateRange as LinkedInAdAnalytics['dateRange']) || {
        start: { year: 2024, month: 1, day: 1 },
      },
    }
  } catch {
    return null
  }
}

export async function pauseLinkedInCampaign(
  campaignId: string,
  accessToken?: string
): Promise<boolean> {
  const token = accessToken || process.env.LINKEDIN_ADS_ACCESS_TOKEN
  if (!token) return false
  try {
    const res = await fetch(`${LINKEDIN_ADS_BASE}/adCampaigns/${campaignId}`, {
      method: 'POST',
      headers: {
        ...linkedInHeaders(token),
        'X-HTTP-Method-Override': 'PATCH',
      },
      body: JSON.stringify({ patch: { $set: { status: 'PAUSED' } } }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function isLinkedInAdsAvailable(): boolean {
  return !!process.env.LINKEDIN_ADS_ACCESS_TOKEN
}
