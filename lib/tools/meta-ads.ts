// Meta Ads (Facebook Graph API)

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

const META_BASE = 'https://graph.facebook.com/v21.0'

export interface MetaCampaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED'
  objective: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
}

export interface MetaInsights {
  impressions: string
  clicks: string
  spend: string
  ctr: string
  cpc: string
  reach: string
  date_start: string
  date_stop: string
}

export async function getMetaCampaigns(
  adAccountId?: string,
  accessToken?: string
): Promise<MetaCampaign[]> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  const accountId = adAccountId || process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) return []
  try {
    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,created_time'
    const res = await fetchWithTimeout(
      `${META_BASE}/${accountId}/campaigns?fields=${fields}&access_token=${token}`
    )
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
}

export async function createMetaCampaign(
  name: string,
  objective: string,
  dailyBudgetCents: number,
  adAccountId?: string,
  accessToken?: string
): Promise<{ id: string } | null> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  const accountId = adAccountId || process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) return null
  try {
    const res = await fetchWithTimeout(`${META_BASE}/${accountId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        objective,
        status: 'PAUSED',
        special_ad_categories: [],
        daily_budget: String(dailyBudgetCents),
        access_token: token,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.id ? { id: json.id } : null
  } catch {
    return null
  }
}

export async function getMetaCampaignInsights(
  campaignId: string,
  preset: string = 'last_30d',
  accessToken?: string
): Promise<MetaInsights | null> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  if (!token) return null
  try {
    const fields = 'impressions,clicks,spend,ctr,cpc,reach'
    const res = await fetchWithTimeout(
      `${META_BASE}/${campaignId}/insights?fields=${fields}&date_preset=${preset}&access_token=${token}`
    )
    if (!res.ok) return null
    const json = await res.json()
    const data = json.data
    if (!data || data.length === 0) return null
    return data[0]
  } catch {
    return null
  }
}

export async function pauseMetaCampaign(
  campaignId: string,
  accessToken?: string
): Promise<boolean> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  if (!token) return false
  try {
    const res = await fetchWithTimeout(`${META_BASE}/${campaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAUSED', access_token: token }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.success === true
  } catch {
    return false
  }
}

export async function activateMetaCampaign(
  campaignId: string,
  accessToken?: string
): Promise<boolean> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  if (!token) return false
  try {
    const res = await fetchWithTimeout(`${META_BASE}/${campaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE', access_token: token }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return json.success === true
  } catch {
    return false
  }
}

export async function getMetaAccountInfo(
  adAccountId?: string,
  accessToken?: string
): Promise<{ name: string; currency: string; balance?: string; account_status: number } | null> {
  const token = accessToken || process.env.META_ACCESS_TOKEN
  const accountId = adAccountId || process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) return null
  try {
    const fields = 'name,currency,account_status,balance,spend_cap'
    const res = await fetchWithTimeout(
      `${META_BASE}/${accountId}?fields=${fields}&access_token=${token}`
    )
    if (!res.ok) return null
    const json = await res.json()
    return {
      name: json.name,
      currency: json.currency,
      balance: json.balance,
      account_status: json.account_status,
    }
  } catch {
    return null
  }
}

export function isMetaAdsAvailable(): boolean {
  return !!process.env.META_ACCESS_TOKEN
}
