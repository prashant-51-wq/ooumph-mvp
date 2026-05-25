/**
 * Display & Video 360 API v3 client.
 * Handles Insertion Orders (IOs), Line Items, and performance metrics.
 *
 * Requires OAuth 2.0 with scope: https://www.googleapis.com/auth/display-video
 * Same OAuth token as Google Ads can work if both scopes were requested.
 *
 * Per-workspace: access_token + advertiser_id stored in integrations table.
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

const DV360_BASE = 'https://displayvideo.googleapis.com/v3'

export interface DV360Credentials {
  advertiserId: string    // numeric advertiser ID in DV360
  accessToken: string     // OAuth 2.0 access token with display-video scope
  partnerId?: string      // optional partner ID for filtering
}

// ─── Objective → Pacing and Bidding ──────────────────────────────────────────

function getInsertionOrderConfig(objective: string) {
  switch (objective) {
    case 'awareness':
      return { budget: { budgetUnit: 'BUDGET_UNIT_IMPRESSIONS' }, pacing: { pacingPeriod: 'PACING_PERIOD_FLIGHT', pacingType: 'PACING_TYPE_EVEN', maxImpressions: '100000' }, bidStrategy: 'CPM' }
    case 'traffic':
      return { budget: { budgetUnit: 'BUDGET_UNIT_CURRENCY' }, pacing: { pacingPeriod: 'PACING_PERIOD_FLIGHT', pacingType: 'PACING_TYPE_EVEN' }, bidStrategy: 'CPC' }
    case 'leads':
    case 'conversions':
    case 'sales':
      return { budget: { budgetUnit: 'BUDGET_UNIT_CURRENCY' }, pacing: { pacingPeriod: 'PACING_PERIOD_FLIGHT', pacingType: 'PACING_TYPE_EVEN' }, bidStrategy: 'CPA' }
    default:
      return { budget: { budgetUnit: 'BUDGET_UNIT_CURRENCY' }, pacing: { pacingPeriod: 'PACING_PERIOD_FLIGHT', pacingType: 'PACING_TYPE_EVEN' }, bidStrategy: 'CPM' }
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function dv360Fetch(method: string, path: string, token: string, body?: unknown) {
  const res = await fetchWithTimeout(`${DV360_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`DV360 API error ${res.status}: ${JSON.stringify(data)}`)
  return data
}

// ─── Insertion Order ──────────────────────────────────────────────────────────

export interface DV360InsertionOrder {
  insertionOrderId: string
  displayName: string
  entityStatus: string
}

export async function createDV360InsertionOrder(creds: DV360Credentials, opts: {
  name: string
  campaignId: string
  objective: string
  dailyBudgetAmountMicros: string    // in micros (1 INR = 10000 micros in DV360 — uses currency units)
  startDate: { year: number; month: number; day: number }
  endDate: { year: number; month: number; day: number }
  frequencyCap?: { unlimited: boolean; maxImpressions?: number; timeUnit?: string }
}): Promise<DV360InsertionOrder> {
  const config = getInsertionOrderConfig(opts.objective)

  const body: Record<string, unknown> = {
    displayName: opts.name,
    campaignId: opts.campaignId,
    entityStatus: 'ENTITY_STATUS_PAUSED',   // always start paused for HITL
    insertionOrderType: 'RTB',
    pacing: opts.objective === 'awareness'
      ? { pacingPeriod: 'PACING_PERIOD_FLIGHT', pacingType: 'PACING_TYPE_EVEN', maxImpressions: '100000' }
      : { pacingPeriod: 'PACING_PERIOD_DAILY', pacingType: 'PACING_TYPE_EVEN', dailyMaxAmountMicros: opts.dailyBudgetAmountMicros },
    frequencyCap: opts.frequencyCap || { unlimited: false, maxImpressions: 5, timeUnit: 'TIME_UNIT_DAYS', timeUnitCount: 1 },
    integrationDetails: {},
    flight: {
      flightDateType: 'FLIGHT_DATE_TYPE_CUSTOM',
      dateRange: {
        startDate: opts.startDate,
        endDate: opts.endDate,
      }
    },
    budget: {
      budgetUnit: config.budget.budgetUnit,
      automationType: 'INSERTION_ORDER_AUTOMATION_TYPE_NONE',
      budgetSegments: [{
        budgetAmountMicros: opts.dailyBudgetAmountMicros,
        campaignBudgetId: '0',
        dateRange: {
          startDate: opts.startDate,
          endDate: opts.endDate,
        }
      }],
    },
    bidStrategy: {
      fixedBid: {
        bidAmountMicros: opts.objective === 'awareness' ? '5000000' : '10000000'
      }
    }
  }

  const data = await dv360Fetch('POST', `/advertisers/${creds.advertiserId}/insertionOrders`, creds.accessToken, body)
  return {
    insertionOrderId: data.insertionOrderId as string,
    displayName: data.displayName as string,
    entityStatus: data.entityStatus as string,
  }
}

export async function updateDV360InsertionOrder(creds: DV360Credentials, insertionOrderId: string, updates: {
  entityStatus?: 'ENTITY_STATUS_ACTIVE' | 'ENTITY_STATUS_PAUSED'
  displayName?: string
}) {
  const updateMask = Object.keys(updates).map(k => k.replace(/([A-Z])/g, '_$1').toLowerCase()).join(',')
  return dv360Fetch('PATCH',
    `/advertisers/${creds.advertiserId}/insertionOrders/${insertionOrderId}?updateMask=${updateMask}`,
    creds.accessToken, updates)
}

// ─── Line Item ────────────────────────────────────────────────────────────────

export async function createDV360LineItem(creds: DV360Credentials, opts: {
  insertionOrderId: string
  name: string
  type: 'LINE_ITEM_TYPE_DISPLAY_DEFAULT' | 'LINE_ITEM_TYPE_VIDEO_DEFAULT'
  dailyBudgetAmountMicros: string
  startDate: { year: number; month: number; day: number }
  endDate: { year: number; month: number; day: number }
  targetingGeos?: string[]  // e.g. ['IN', 'US']
}) {
  const body = {
    displayName: opts.name,
    insertionOrderId: opts.insertionOrderId,
    lineItemType: opts.type,
    entityStatus: 'ENTITY_STATUS_PAUSED',
    flight: {
      flightDateType: 'FLIGHT_DATE_TYPE_CUSTOM',
      dateRange: { startDate: opts.startDate, endDate: opts.endDate },
    },
    budget: {
      budgetAllocationType: 'LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED',
      budgetUnit: 'BUDGET_UNIT_CURRENCY',
      maxAmount: opts.dailyBudgetAmountMicros,
    },
    pacing: {
      pacingPeriod: 'PACING_PERIOD_DAILY',
      pacingType: 'PACING_TYPE_EVEN',
      dailyMaxAmountMicros: opts.dailyBudgetAmountMicros,
    },
    bidStrategy: {
      displayVideoCpvBidStrategy: undefined,
      fixedBid: { bidAmountMicros: '5000000' },
    },
    frequencyCap: { unlimited: false, maxImpressions: 3, timeUnit: 'TIME_UNIT_DAYS', timeUnitCount: 1 },
  }

  const data = await dv360Fetch('POST', `/advertisers/${creds.advertiserId}/lineItems`, creds.accessToken, body)
  return {
    lineItemId: data.lineItemId as string,
    displayName: data.displayName as string,
  }
}

export async function updateDV360LineItem(creds: DV360Credentials, lineItemId: string, updates: {
  entityStatus?: 'ENTITY_STATUS_ACTIVE' | 'ENTITY_STATUS_PAUSED'
}) {
  const updateMask = Object.keys(updates).map(k => k.replace(/([A-Z])/g, '_$1').toLowerCase()).join(',')
  return dv360Fetch('PATCH',
    `/advertisers/${creds.advertiserId}/lineItems/${lineItemId}?updateMask=${updateMask}`,
    creds.accessToken, updates)
}

// ─── Performance / Reporting ──────────────────────────────────────────────────

export interface DV360Metrics {
  date: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
  cpm: number
}

export async function getDV360InsertionOrderMetrics(
  creds: DV360Credentials,
  insertionOrderId: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string
): Promise<DV360Metrics[]> {
  // DV360 uses the Reports API to generate async reports
  // For real-time lightweight data, use the SDF or Queries API
  const queryBody = {
    metadata: {
      title: `IO Metrics ${insertionOrderId}`,
      dataRange: { range: 'CUSTOM_DATES', customStartDate: _isoToDate(startDate), customEndDate: _isoToDate(endDate) },
      format: 'CSV',
    },
    params: {
      type: 'TYPE_GENERAL',
      groupBys: ['FILTER_DATE', 'FILTER_INSERTION_ORDER'],
      filters: [{ type: 'FILTER_INSERTION_ORDER', value: insertionOrderId }],
      metrics: ['METRIC_IMPRESSIONS', 'METRIC_CLICKS', 'METRIC_REVENUE_ADVERTISER', 'METRIC_POST_CLICK_CONVERSIONS', 'METRIC_CPM_ADVERTISER', 'METRIC_LAST_CLICKS_CPC'],
    },
    schedule: { frequency: 'ONE_TIME' },
  }

  // Create the report (async in DV360 — returns a query ID)
  const queryRes = await fetchWithTimeout(`https://doubleclickbidmanager.googleapis.com/v2/queries`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody),
  })
  const queryData = await queryRes.json() as Record<string, unknown>

  if (!queryRes.ok) {
    console.warn('DV360 report creation failed:', queryData)
    return []
  }

  // Return empty for now — real implementation polls until report is ready
  // In production: poll GET /queries/{queryId}/reports until status=DONE, then download CSV
  console.log('DV360 report created, queryId:', queryData.queryId, '— async polling needed')
  return []
}

function _isoToDate(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

// ─── Audience targeting helper ────────────────────────────────────────────────

export interface DV360Targeting {
  geoRegionDetails?: Array<{ targetingOptionId: string }>   // region targeting option IDs
  audienceGroupDetails?: { includedAudienceType: string }
  channelDetails?: { channelId: string; negative: boolean }
}

export function buildDV360Targeting(audienceDescription: string): DV360Targeting {
  return {
    geoRegionDetails: [],
    audienceGroupDetails: { includedAudienceType: 'GOOGLE_AUDIENCE_TYPE_AFFINITY' },
  }
}
