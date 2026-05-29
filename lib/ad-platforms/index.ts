/**
 * Unified Ad Platform Router — credential management + platform dispatch.
 * Fetches credentials from the integrations table and routes to the right DSP client.
 */

import { sql, newId } from '@/lib/db'
import {
  createMetaCampaign, createMetaAdSet, updateMetaCampaign, updateMetaAdSet,
  getMetaCampaignInsights, buildMetaTargeting,
  type MetaCredentials, type MetaInsights, type CampaignTargetingInput,
} from './meta'
import {
  createGoogleAdsCampaign, createGoogleAdsAdGroup, createGoogleAdsBudget,
  createGoogleAdsResponsiveSearchAd, createGoogleAdsKeywords,
  updateGoogleAdsCampaign, updateGoogleAdsBudget,
  getGoogleAdsCampaignMetrics,
  type GoogleAdsCredentials, type GoogleAdsMetrics,
} from './google-ads'
import {
  createDV360InsertionOrder, createDV360LineItem,
  updateDV360InsertionOrder, updateDV360LineItem,
  type DV360Credentials,
} from './dv360'
import type { PerformanceSnapshot } from '@/lib/agents/campaign-optimizer'

export type AdPlatform = 'meta_ads' | 'google_ads' | 'dv360'

// ─── Credential retrieval ─────────────────────────────────────────────────────

export async function getPlatformCredentials(workspaceId: string, platform: AdPlatform) {
  const result = await sql`
    SELECT access_token, account_id, metadata FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = ${platform} AND status = 'active'
    LIMIT 1
  `
  const row = result.rows[0]
  if (!row) throw new Error(`${platform} not connected. Go to Integrations to connect.`)
  return {
    accessToken: row.access_token as string,
    accountId: row.account_id as string,
    metadata: (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {}) as Record<string, string>,
  }
}

export async function getConnectedPlatforms(workspaceId: string): Promise<AdPlatform[]> {
  const result = await sql`
    SELECT platform FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform IN ('meta_ads', 'google_ads', 'dv360') AND status = 'active'
  `
  return result.rows.map(r => r.platform as AdPlatform)
}

// ─── Budget parsing ───────────────────────────────────────────────────────────

function parseDailyBudgetToMinorUnits(budgetStr: string, platform: AdPlatform): number {
  // Extract numeric value from strings like "₹500/day", "500", "$10/day"
  const match = budgetStr.match(/[\d,]+/)
  const amount = match ? parseInt(match[0].replace(/,/g, '')) : 500
  if (platform === 'google_ads') return amount * 1_000_000  // Google uses micros
  if (platform === 'meta_ads') return amount * 100           // Meta uses cents (USD) or paise
  if (platform === 'dv360') return amount * 1_000_000        // DV360 uses micros
  return amount
}

// ─── Publish campaign to a DSP ────────────────────────────────────────────────

export interface PublishResult {
  platform: AdPlatform
  platformCampaignId: string
  platformAdSetIds: string[]
  platformAdIds: string[]
  status: 'success' | 'partial' | 'failed'
  error?: string
  details: Record<string, unknown>
}

export async function publishCampaignToPlatform(
  workspaceId: string,
  campaignArtifactId: string,
  brief: Record<string, unknown>,
  platform: AdPlatform,
  adSetIndices?: number[]  // which ad sets to push; default all matching the platform
): Promise<PublishResult> {
  const creds = await getPlatformCredentials(workspaceId, platform)
  const allAdSets = (brief.adSets as Record<string, unknown>[]) || []

  // Filter ad sets for this platform
  const platformAdSets = allAdSets.filter((as, i) => {
    const asPlatform = (as.platform as string || '').toLowerCase()
    const matches = asPlatform === platform ||
      (platform === 'meta_ads' && ['facebook', 'instagram', 'meta'].includes(asPlatform)) ||
      (platform === 'google_ads' && ['google', 'youtube', 'search', 'display'].includes(asPlatform)) ||
      (platform === 'dv360' && ['dv360', 'programmatic', 'display & video 360'].includes(asPlatform))
    return adSetIndices ? adSetIndices.includes(i) && matches : matches
  })

  if (platformAdSets.length === 0) {
    return {
      platform,
      platformCampaignId: '',
      platformAdSetIds: [],
      platformAdIds: [],
      status: 'failed',
      error: `No ad sets targeting ${platform} found in the campaign brief`,
      details: {},
    }
  }

  const objective = (brief.campaignObjective as string) || 'leads'
  const campaignName = brief.campaignName as string || 'Campaign'

  try {
    if (platform === 'meta_ads') {
      return await _publishToMeta(creds, campaignArtifactId, campaignName, objective, platformAdSets, brief)
    } else if (platform === 'google_ads') {
      return await _publishToGoogleAds(creds, campaignArtifactId, campaignName, objective, platformAdSets, brief)
    } else if (platform === 'dv360') {
      return await _publishToDV360(creds, campaignArtifactId, campaignName, objective, platformAdSets, brief)
    }
    throw new Error(`Unknown platform: ${platform}`)
  } catch (err) {
    return {
      platform,
      platformCampaignId: '',
      platformAdSetIds: [],
      platformAdIds: [],
      status: 'failed',
      error: String(err),
      details: {},
    }
  }
}

// ─── Meta Ads publish ─────────────────────────────────────────────────────────

async function _publishToMeta(
  creds: { accessToken: string; accountId: string; metadata: Record<string, string> },
  campaignArtifactId: string,
  campaignName: string,
  objective: string,
  adSets: Record<string, unknown>[],
  brief: Record<string, unknown>
): Promise<PublishResult> {
  const metaCreds: MetaCredentials = {
    adAccountId: creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`,
    accessToken: creds.accessToken,
  }

  // 1. Create campaign
  const { campaignId } = await createMetaCampaign(metaCreds, {
    name: campaignName,
    objective,
    status: 'PAUSED',
  })

  const adSetIds: string[] = []

  // Per-workspace targeting overrides flow in via brief.targeting (from
  // ad_campaigns.targeting_json). Falls back to sensible defaults inside
  // buildMetaTargeting when fields are missing or malformed.
  const targetingInput = (brief.targeting as CampaignTargetingInput | undefined) || undefined

  // 2. Create ad sets
  for (const adSet of adSets) {
    const dailyBudget = parseDailyBudgetToMinorUnits(adSet.dailyBudget as string || '₹500', 'meta_ads')
    const { adSetId } = await createMetaAdSet(metaCreds, {
      campaignId,
      name: adSet.name as string || 'Ad Set',
      objective,
      dailyBudget,
      targeting: buildMetaTargeting(adSet.audience as string || '', adSet.platform as string || '', targetingInput),
    })
    adSetIds.push(adSetId)
  }

  return {
    platform: 'meta_ads',
    platformCampaignId: campaignId,
    platformAdSetIds: adSetIds,
    platformAdIds: [],
    status: 'success',
    details: { campaignId, adSetIds, note: 'Campaign and ad sets created in PAUSED state. Activate from Meta Ads Manager or click Activate below.' },
  }
}

// ─── Google Ads publish ───────────────────────────────────────────────────────

async function _publishToGoogleAds(
  creds: { accessToken: string; accountId: string; metadata: Record<string, string> },
  campaignArtifactId: string,
  campaignName: string,
  objective: string,
  adSets: Record<string, unknown>[],
  brief: Record<string, unknown>
): Promise<PublishResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || creds.metadata.developerToken || ''
  if (!developerToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN not configured. Add to Vercel environment variables.')

  const googleCreds: GoogleAdsCredentials = {
    customerId: creds.accountId.replace(/-/g, ''),
    accessToken: creds.accessToken,
    developerToken,
    managerId: creds.metadata.managerId,
  }

  const duration = (brief.duration as string) || '30 days'
  const durationDays = parseInt(duration) || 30
  const startDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const endDate = new Date(Date.now() + durationDays * 86400000).toISOString().slice(0, 10).replace(/-/g, '')

  // 1. Create campaign budget (use first ad set's budget)
  const firstBudget = parseDailyBudgetToMinorUnits(adSets[0]?.dailyBudget as string || '₹500', 'google_ads')
  const { budgetResourceName } = await createGoogleAdsBudget(googleCreds, {
    name: `${campaignName} Budget`,
    amountMicros: firstBudget,
  })

  // 2. Create campaign
  const { campaignId } = await createGoogleAdsCampaign(googleCreds, {
    name: campaignName,
    objective,
    budgetResourceName,
    startDate,
    endDate,
  })

  const adGroupIds: string[] = []

  // 3. Create ad groups + RSAs
  for (const adSet of adSets) {
    const { adGroupId } = await createGoogleAdsAdGroup(googleCreds, {
      campaignId,
      name: adSet.name as string || 'Ad Group',
    })
    adGroupIds.push(adGroupId)

    // Create keywords from the brief's negative keywords + audience context
    const negativeKeywords = (brief.negativeKeywords as string[]) || []
    if (negativeKeywords.length > 0) {
      await createGoogleAdsKeywords(googleCreds, {
        adGroupId,
        keywords: negativeKeywords.slice(0, 8),
        matchType: 'BROAD',
      }).catch(e => console.warn('Keyword creation warning:', e))
    }

    // Create a basic Responsive Search Ad
    const headline = brief.keyMessage as string || campaignName
    const cta = adSet.primaryCta as string || 'Learn More'
    await createGoogleAdsResponsiveSearchAd(googleCreds, {
      adGroupId,
      headlines: [
        headline.slice(0, 30),
        (brief.uniqueAngle as string || headline).slice(0, 30),
        cta.slice(0, 30),
      ],
      descriptions: [
        (adSet.audience as string || 'Reach your goals today').slice(0, 90),
        (brief.landingPageGoal as string || 'Get started now').slice(0, 90),
      ],
      finalUrls: [creds.metadata.websiteUrl || 'https://example.com'],
      path1: objective.slice(0, 15),
      path2: 'offer',
    }).catch(e => console.warn('RSA creation warning:', e))
  }

  return {
    platform: 'google_ads',
    platformCampaignId: campaignId,
    platformAdSetIds: adGroupIds,
    platformAdIds: [],
    status: 'success',
    details: { campaignId, adGroupIds, budgetResourceName, note: 'Campaign created in PAUSED state. Review in Google Ads Manager before activating.' },
  }
}

// ─── DV360 publish ────────────────────────────────────────────────────────────

async function _publishToDV360(
  creds: { accessToken: string; accountId: string; metadata: Record<string, string> },
  campaignArtifactId: string,
  campaignName: string,
  objective: string,
  adSets: Record<string, unknown>[],
  brief: Record<string, unknown>
): Promise<PublishResult> {
  const dv360Creds: DV360Credentials = {
    advertiserId: creds.accountId,
    accessToken: creds.accessToken,
    partnerId: creds.metadata.partnerId,
  }

  const duration = (brief.duration as string) || '30 days'
  const durationDays = parseInt(duration) || 30
  const now = new Date()
  const end = new Date(now.getTime() + durationDays * 86400000)

  const startDate = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  const endDate = { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() }

  // DV360 requires a campaign ID — assume it's already created in DV360 platform
  // or stored in metadata. If not, use advertiser ID as placeholder.
  const dv360CampaignId = creds.metadata.dv360CampaignId || '0'

  const { insertionOrderId } = await createDV360InsertionOrder(dv360Creds, {
    name: campaignName,
    campaignId: dv360CampaignId,
    objective,
    dailyBudgetAmountMicros: String(parseDailyBudgetToMinorUnits(
      adSets[0]?.dailyBudget as string || '₹500', 'dv360'
    )),
    startDate,
    endDate,
  })

  const lineItemIds: string[] = []
  for (const adSet of adSets) {
    const { lineItemId } = await createDV360LineItem(dv360Creds, {
      insertionOrderId,
      name: adSet.name as string || 'Line Item',
      type: 'LINE_ITEM_TYPE_DISPLAY_DEFAULT',
      dailyBudgetAmountMicros: String(parseDailyBudgetToMinorUnits(adSet.dailyBudget as string || '₹500', 'dv360')),
      startDate,
      endDate,
    })
    lineItemIds.push(lineItemId)
  }

  return {
    platform: 'dv360',
    platformCampaignId: insertionOrderId,
    platformAdSetIds: lineItemIds,
    platformAdIds: [],
    status: 'success',
    details: { insertionOrderId, lineItemIds, note: 'Insertion order and line items created in PAUSED state in DV360.' },
  }
}

// ─── Activate / Pause campaign on a platform ──────────────────────────────────

export async function setPlatformCampaignStatus(
  workspaceId: string,
  platform: AdPlatform,
  platformCampaignId: string,
  status: 'active' | 'paused'
) {
  const creds = await getPlatformCredentials(workspaceId, platform)
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''

  if (platform === 'meta_ads') {
    const metaCreds: MetaCredentials = {
      adAccountId: creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`,
      accessToken: creds.accessToken,
    }
    await updateMetaCampaign(metaCreds, platformCampaignId, {
      status: status === 'active' ? 'ACTIVE' : 'PAUSED'
    })
  } else if (platform === 'google_ads') {
    const googleCreds: GoogleAdsCredentials = {
      customerId: creds.accountId.replace(/-/g, ''),
      accessToken: creds.accessToken,
      developerToken,
    }
    await updateGoogleAdsCampaign(googleCreds, platformCampaignId, {
      status: status === 'active' ? 'ENABLED' : 'PAUSED'
    })
  } else if (platform === 'dv360') {
    const dv360Creds: DV360Credentials = {
      advertiserId: creds.accountId,
      accessToken: creds.accessToken,
    }
    await updateDV360InsertionOrder(dv360Creds, platformCampaignId, {
      entityStatus: status === 'active' ? 'ENTITY_STATUS_ACTIVE' : 'ENTITY_STATUS_PAUSED'
    })
  }
}

// ─── Sync performance from all connected platforms ────────────────────────────

export async function syncCampaignPerformance(
  workspaceId: string,
  campaignArtifactId: string,
  days: 7 | 14 | 30 = 7
): Promise<PerformanceSnapshot[]> {
  const linksResult = await sql`
    SELECT * FROM campaign_platform_links
    WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId}
      AND status = 'active'
  `
  const links = linksResult.rows
  if (links.length === 0) return []

  const snapshots: PerformanceSnapshot[] = []

  for (const link of links) {
    const platform = link.platform as AdPlatform
    const platformCampaignId = link.platform_campaign_id as string

    try {
      const creds = await getPlatformCredentials(workspaceId, platform)
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''

      let metrics: MetaInsights[] | GoogleAdsMetrics[] = []

      if (platform === 'meta_ads') {
        const metaCreds: MetaCredentials = {
          adAccountId: creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`,
          accessToken: creds.accessToken,
        }
        metrics = await getMetaCampaignInsights(metaCreds, platformCampaignId,
          days === 7 ? 'last_7d' : days === 14 ? 'last_14d' : 'last_30d')
      } else if (platform === 'google_ads') {
        const googleCreds: GoogleAdsCredentials = {
          customerId: creds.accountId.replace(/-/g, ''),
          accessToken: creds.accessToken,
          developerToken,
        }
        metrics = await getGoogleAdsCampaignMetrics(googleCreds, platformCampaignId, days)
      }
      // DV360 uses async reports — skip for real-time sync

      if (metrics.length > 0) {
        // Aggregate to a single snapshot
        const agg = metrics.reduce((acc, m) => ({
          impressions: acc.impressions + m.impressions,
          clicks: acc.clicks + m.clicks,
          spend: acc.spend + m.spend,
          conversions: acc.conversions + m.conversions,
        }), { impressions: 0, clicks: 0, spend: 0, conversions: 0 })

        const snapshot: PerformanceSnapshot = {
          platform,
          campaignId: platformCampaignId,
          adSetName: 'All Ad Sets',
          impressions: agg.impressions,
          clicks: agg.clicks,
          spend: agg.spend,
          conversions: agg.conversions,
          ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
          cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
          cpa: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
          roas: 0,
          daysRunning: days,
          budgetUtilization: 0,
        }
        snapshots.push(snapshot)

        // Upsert into campaign_performance table
        for (const m of metrics) {
          const date = m.date || new Date().toISOString().slice(0, 10)
          await sql`
            INSERT INTO campaign_performance
              (id, workspace_id, campaign_artifact_id, platform, platform_campaign_id,
               date, impressions, clicks, spend, conversions, ctr, cpc)
            VALUES
              (${newId()}, ${workspaceId}, ${campaignArtifactId}, ${platform}, ${platformCampaignId},
               ${date}, ${m.impressions}, ${m.clicks}, ${m.spend}, ${m.conversions},
               ${m.ctr}, ${m.cpc})
            ON CONFLICT (workspace_id, campaign_artifact_id, platform, date)
            DO UPDATE SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
              spend = EXCLUDED.spend, conversions = EXCLUDED.conversions
          `.catch(() => {
            // SQLite doesn't support ON CONFLICT with ON UPDATE — just insert
            sql`INSERT OR IGNORE INTO campaign_performance
              (id, workspace_id, campaign_artifact_id, platform, platform_campaign_id,
               date, impressions, clicks, spend, conversions, ctr, cpc)
            VALUES
              (${newId()}, ${workspaceId}, ${campaignArtifactId}, ${platform}, ${platformCampaignId},
               ${date}, ${m.impressions}, ${m.clicks}, ${m.spend}, ${m.conversions},
               ${m.ctr}, ${m.cpc})`
          })
        }

        // Update last_synced_at
        await sql`
          UPDATE campaign_platform_links
          SET last_synced_at = CURRENT_TIMESTAMP
          WHERE workspace_id = ${workspaceId} AND campaign_artifact_id = ${campaignArtifactId} AND platform = ${platform}
        `
      }
    } catch (err) {
      console.error(`Sync failed for ${platform}:`, err)
    }
  }

  return snapshots
}
