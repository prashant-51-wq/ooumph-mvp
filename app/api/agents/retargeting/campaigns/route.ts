/**
 * Retargeting Worker: Campaign Builder
 * POST { workspaceId, budget, platforms, segments?, objective? }
 * GET  ?workspaceId=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { buildRetargetingCampaign, segmentAudiences, type AudienceSegment } from '@/lib/agents/retargeting'

const SYSTEM = `You are a senior media buyer and performance marketing architect.
You build platform-specific campaign structures that translate strategy into actionable setups.
Respond ONLY with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      budget: number
      platforms: Array<'meta' | 'google' | 'linkedin' | 'tiktok'>
      segments?: string[]
      objective?: string
    }
    const { workspaceId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!body.budget || body.budget <= 0) return NextResponse.json({ error: 'budget required and must be > 0' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const platforms = body.platforms || (['meta', 'google'] as Array<'meta' | 'google' | 'linkedin' | 'tiktok'>)
    const budget = body.budget

    // ── Load or generate audience segments ────────────────────────────────────
    let segments: AudienceSegment[]
    const existingRes = await sql`
      SELECT content_json FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'retargeting_audiences'
      ORDER BY created_at DESC LIMIT 1
    `
    const existingContent = existingRes.rows[0]?.content_json as Record<string, unknown> | undefined
    const savedSegments = existingContent?.segments as AudienceSegment[] | undefined

    if (savedSegments && savedSegments.length > 0) {
      // Filter to requested segment names if provided
      segments = body.segments && body.segments.length > 0
        ? savedSegments.filter((s: AudienceSegment) => body.segments!.includes(s.name))
        : savedSegments
    } else {
      // Generate fresh segments from lead data
      const [totalRes, bySourceRes, byStatusRes, byScoreRes] = await Promise.all([
        sql`SELECT COUNT(*) as total, AVG(score) as avg_score FROM leads_captured WHERE workspace_id = ${workspaceId}`,
        sql`SELECT source, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY source`,
        sql`SELECT status, COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} GROUP BY status`,
        sql`SELECT
              SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) as hot,
              SUM(CASE WHEN score >= 40 AND score < 70 THEN 1 ELSE 0 END) as warm,
              SUM(CASE WHEN score >= 1 AND score < 40 THEN 1 ELSE 0 END) as cold,
              SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) as new_leads
            FROM leads_captured WHERE workspace_id = ${workspaceId}`,
      ])

      const bySource: Record<string, number> = {}
      for (const r of bySourceRes.rows) bySource[String(r.source || 'unknown')] = Number(r.cnt)
      const byStatus: Record<string, number> = {}
      for (const r of byStatusRes.rows) byStatus[String(r.status || 'unknown')] = Number(r.cnt)
      const sr = byScoreRes.rows[0] || {}

      segments = await segmentAudiences(brand, {
        total: Number(totalRes.rows[0]?.total || 0),
        bySource,
        byStatus,
        byScoreTier: { hot: Number(sr.hot || 0), warm: Number(sr.warm || 0), cold: Number(sr.cold || 0), new: Number(sr.new_leads || 0) },
        avgScore: Math.round(Number(totalRes.rows[0]?.avg_score || 0)),
      })
    }

    // ── Build the campaign blueprint ──────────────────────────────────────────
    const campaign = await buildRetargetingCampaign(brand, segments, budget, platforms)

    // ── Generate per-platform implementation specs ────────────────────────────
    const platformSpecs: Record<string, unknown> = {}

    for (const platform of platforms) {
      const platformSegments = segments.filter((s: AudienceSegment) =>
        s.platforms.map((p: string) => p.toLowerCase()).includes(platform.toLowerCase())
      )

      if (platform === 'meta') {
        interface MetaSpec {
          campaignName: string
          campaignObjective: string
          adSets: Array<{
            name: string
            audienceSource: string
            bidStrategy: string
            dailyBudget: string
            optimizationGoal: string
            placements: string[]
          }>
          ads: Array<{ name: string; format: string; headline: string; primaryText: string; cta: string }>
          frequencyCap: string
          campaignBudget: string
          bidStrategy: string
          pixelEvents: string[]
        }
        const metaSpec = await runAgent<MetaSpec>(
          SYSTEM,
          `Generate a complete Meta (Facebook/Instagram) Ads campaign structure.

Business: ${brand.business_name}
Offer: ${brand.offer}
Monthly budget for Meta: $${Math.round(budget * (campaign.budgetAllocation?.meta || 50) / 100)}
Segments to target: ${JSON.stringify(platformSegments.map((s: AudienceSegment) => s.name))}
Campaign objective: ${campaign.objective}
Creative directions: ${JSON.stringify(campaign.creativeDirections?.slice(0, 3))}
Frequency cap: ${campaign.frequencyCap}
Retargeting window: ${campaign.retargetingWindow} days

Return a Meta campaign structure JSON:
{
  "campaignName": "...",
  "campaignObjective": "CONVERSIONS|TRAFFIC|LEAD_GENERATION",
  "adSets": [
    {
      "name": "AdSet name — one per segment",
      "audienceSource": "website custom audience|customer list|engagement",
      "bidStrategy": "LOWEST_COST|COST_CAP|BID_CAP",
      "dailyBudget": "$X/day",
      "optimizationGoal": "CONVERSIONS|LINK_CLICKS|LANDING_PAGE_VIEWS",
      "placements": ["Facebook Feed", "Instagram Feed", "Stories"]
    }
  ],
  "ads": [
    {
      "name": "Ad name",
      "format": "Single Image|Carousel|Video",
      "headline": "actual headline",
      "primaryText": "actual ad copy — warm audience",
      "cta": "SHOP_NOW|LEARN_MORE|SIGN_UP|BOOK_TRAVEL"
    }
  ],
  "frequencyCap": "3 per week",
  "campaignBudget": "$X/month",
  "bidStrategy": "recommended bid strategy with reasoning",
  "pixelEvents": ["Purchase", "Lead", "InitiateCheckout"]
}`
        )
        platformSpecs.meta = metaSpec
      }

      if (platform === 'google') {
        interface GoogleSpec {
          campaignName: string
          campaignType: string
          networks: string[]
          adGroups: Array<{
            name: string
            audienceType: string
            audienceList: string
            bidAdjustment: string
            keywords?: string[]
            targetCpa?: string
          }>
          responsiveDisplayAds: Array<{ headlines: string[]; descriptions: string[]; longHeadline: string }>
          responsiveSearchAds: Array<{ headlines: string[]; descriptions: string[] }>
          bidStrategy: string
          dailyBudget: string
        }
        const googleSpec = await runAgent<GoogleSpec>(
          SYSTEM,
          `Generate a Google Ads retargeting campaign structure.

Business: ${brand.business_name}
Offer: ${brand.offer}
Monthly budget for Google: $${Math.round(budget * (campaign.budgetAllocation?.google || 30) / 100)}
Segments: ${JSON.stringify(platformSegments.map((s: AudienceSegment) => s.name))}
Campaign objective: ${campaign.objective}

Return a Google Ads retargeting structure:
{
  "campaignName": "...",
  "campaignType": "Display|Search|Performance Max",
  "networks": ["Display Network", "Search Network"],
  "adGroups": [
    {
      "name": "AdGroup — one per segment",
      "audienceType": "website_visitors|customer_match|similar_audiences",
      "audienceList": "specific audience list name",
      "bidAdjustment": "+50%",
      "keywords": ["relevant RLSA keywords"],
      "targetCpa": "$X"
    }
  ],
  "responsiveDisplayAds": [
    {
      "headlines": ["headline 1", "headline 2", "headline 3"],
      "descriptions": ["desc 1", "desc 2"],
      "longHeadline": "longer headline for display"
    }
  ],
  "responsiveSearchAds": [
    {
      "headlines": ["up to 15 headlines, 30 chars each"],
      "descriptions": ["up to 4 descriptions, 90 chars each"]
    }
  ],
  "bidStrategy": "Target CPA|Target ROAS|Maximize Conversions",
  "dailyBudget": "$X/day"
}`
        )
        platformSpecs.google = googleSpec
      }

      if (platform === 'linkedin') {
        interface LinkedInSpec {
          campaignGroupName: string
          objective: string
          campaigns: Array<{
            name: string
            audienceType: string
            matchedAudienceName: string
            format: string
            bidType: string
            dailyBudget: string
          }>
          sponsoredContent: Array<{ introText: string; headline: string; description: string; cta: string }>
          messageAds: Array<{ subject: string; body: string; cta: string }>
          targetJobTitles: string[]
          targetIndustries: string[]
        }
        const linkedinSpec = await runAgent<LinkedInSpec>(
          SYSTEM,
          `Generate a LinkedIn Campaign Manager retargeting structure.

Business: ${brand.business_name}
Offer: ${brand.offer}
Target audience: ${brand.target_audience}
Monthly budget for LinkedIn: $${Math.round(budget * (campaign.budgetAllocation?.linkedin || 20) / 100)}
Segments: ${JSON.stringify(platformSegments.map((s: AudienceSegment) => s.name))}

Return a LinkedIn Ads retargeting structure:
{
  "campaignGroupName": "...",
  "objective": "WEBSITE_CONVERSIONS|LEAD_GENERATION|WEBSITE_VISITS",
  "campaigns": [
    {
      "name": "Campaign — one per segment",
      "audienceType": "website_retargeting|contact_targeting|account_targeting",
      "matchedAudienceName": "audience list name in Campaign Manager",
      "format": "Single Image Ad|Message Ad|Conversation Ad|Document Ad",
      "bidType": "Enhanced CPC|Target CPA|Automated",
      "dailyBudget": "$X/day (min $10)"
    }
  ],
  "sponsoredContent": [
    {
      "introText": "LinkedIn post text (150 char preview visible)",
      "headline": "70 chars max",
      "description": "100 chars max",
      "cta": "Learn More|Sign Up|Download|Get Quote|Register|Subscribe"
    }
  ],
  "messageAds": [
    {
      "subject": "subject line",
      "body": "500-1000 char message — professional, value-focused",
      "cta": "button text"
    }
  ],
  "targetJobTitles": ["relevant job titles"],
  "targetIndustries": ["relevant industries"]
}`
        )
        platformSpecs.linkedin = linkedinSpec
      }

      if (platform === 'tiktok') {
        interface TikTokSpec {
          campaignName: string
          objective: string
          adGroups: Array<{
            name: string
            audienceSource: string
            placement: string[]
            bidStrategy: string
            dailyBudget: string
            optimization: string
          }>
          videoAds: Array<{ hookText: string; bodyText: string; cta: string; videoDirection: string; captionStyle: string }>
          creatorBriefs: string[]
        }
        const tiktokSpec = await runAgent<TikTokSpec>(
          SYSTEM,
          `Generate a TikTok Ads retargeting campaign structure.

Business: ${brand.business_name}
Offer: ${brand.offer}
Target audience: ${brand.target_audience}
Monthly budget for TikTok: $${Math.round(budget * (campaign.budgetAllocation?.tiktok || 20) / 100)}
Segments: ${JSON.stringify(platformSegments.map((s: AudienceSegment) => s.name))}

Return a TikTok Ads retargeting structure:
{
  "campaignName": "...",
  "objective": "CONVERSIONS|TRAFFIC|APP_INSTALLS|LEAD_GENERATION",
  "adGroups": [
    {
      "name": "AdGroup — one per segment",
      "audienceSource": "website_traffic|customer_file|engagement",
      "placement": ["TikTok Feed", "TikTok Stories"],
      "bidStrategy": "Lowest Cost|Cost Cap|Bid Cap",
      "dailyBudget": "$X/day (min $20)",
      "optimization": "Complete Payment|Click|ViewContent"
    }
  ],
  "videoAds": [
    {
      "hookText": "First 2 seconds — critical hook",
      "bodyText": "Ad caption — 100 chars max — conversational",
      "cta": "Shop Now|Learn More|Sign Up|Book Now",
      "videoDirection": "precise video direction — style, tone, pacing",
      "captionStyle": "on-screen text overlays to include"
    }
  ],
  "creatorBriefs": [
    "Brief for UGC creator — what to show, say, and how"
  ]
}`
        )
        platformSpecs.tiktok = tiktokSpec
      }
    }

    const fullResult = {
      campaign,
      platformSpecs,
      segments,
      budget,
      platforms,
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_campaigns', 'completed')`

    const artifactId = newId()
    const title = `Retargeting Campaign Blueprint — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'retargeting_campaign', ${title}, ${JSON.stringify(fullResult)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'retargeting_campaign',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, artifactId, campaign, platformSpecs, segmentsUsed: segments.length })
  } catch (error) {
    console.error('Retargeting campaign builder error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'retargeting_campaign'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
