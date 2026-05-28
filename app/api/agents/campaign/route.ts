import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateAdCreative, generateLandingVisual } from '@/lib/creative-workers'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a performance marketing strategist specialising in paid advertising campaigns.
Create comprehensive campaign briefs with targeting, messaging, and budget allocation.
Respond ONLY with valid JSON.`

interface AdSet {
  name: string
  platform: string           // facebook, instagram, google, linkedin
  objective: string          // awareness, traffic, leads, conversions
  audience: string           // targeting description
  dailyBudget: string        // e.g. "₹500/day"
  creativeFormat: string     // single_image, carousel, video, story
  primaryCta: string
}

interface CampaignBrief {
  campaignName: string
  campaignObjective: string  // awareness | traffic | leads | conversions | sales
  totalBudget: string
  duration: string           // e.g. "30 days"
  targetAudience: string
  keyMessage: string
  uniqueAngle: string        // what makes this campaign different
  landingPageGoal: string    // what should happen on the landing page
  adSets: AdSet[]
  kpis: string[]             // e.g. ["CPL < ₹200", "CTR > 2%", "ROAS > 3X"]
  negativeKeywords?: string[]
  exclusions?: string[]
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, campaignGoal, budget, duration = '30 days' } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const [brandResult, strategyResult, funnelResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const funnel = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'campaign_manager', 'running')`

    const prompt = `Create a paid campaign brief for:
Business: ${brand.business_name}
Industry: ${brand.industry}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Products/Services: ${brand.products_services || ''}
Campaign Goal: ${campaignGoal || 'Generate qualified leads'}
Total Budget: ${budget || brand.monthly_budget || '₹50,000/month'}
Duration: ${duration}
${strategy ? `Strategy positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}` : ''}
${funnel ? `Funnel stages: ${JSON.stringify((funnel as Record<string, unknown>).stages || '')}` : ''}

Create a complete campaign brief with:
- campaignName: catchy internal name (5-8 words)
- campaignObjective: one of awareness|traffic|leads|conversions|sales
- totalBudget, duration, targetAudience, keyMessage, uniqueAngle, landingPageGoal
- adSets: 3-4 ad sets across different platforms/audiences
  Each: name, platform, objective, audience, dailyBudget, creativeFormat, primaryCta
- kpis: 3-5 measurable KPIs specific to the goal
- negativeKeywords: 5-8 words to exclude in targeting

Return JSON only.`

    const brief = await runAgent<CampaignBrief>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(brief)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    // Save the campaign brief artifact
    const artifactId = newId()
    const title = `Campaign Brief — ${brief.campaignName || campaignGoal || 'Campaign'}`
    const contentJson = { ...brief, businessName: brand.business_name, tone: brand.tone }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'campaign_brief', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // ── Creative Supervisor requests ──────────────────────────────────────────
    // For each ad set, request an ad creative from the Creative Supervisor
    const creativeRequests: Array<{ adSetName: string; artifactId: string; platform: string }> = []

    const adSetsToProcess = (brief.adSets || []).slice(0, 3) // cap at 3 to control cost
    for (const adSet of adSetsToProcess) {
      try {
        const creativeResult = await generateAdCreative(
          workspaceId,
          `${brief.campaignName} — ${adSet.name}: ${brief.keyMessage}`,
          adSet.platform,
          adSet.creativeFormat === 'story' ? ['story'] :
          adSet.creativeFormat === 'carousel' ? ['square', 'landscape'] :
          ['square', 'landscape', 'story']
        )
        creativeRequests.push({
          adSetName: adSet.name,
          artifactId: creativeResult.artifactId,
          platform: adSet.platform,
        })

        // Log in creative_requests for tracking
        await sql`
          INSERT INTO creative_requests
            (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
          VALUES
            (${newId()}, ${workspaceId}, 'campaign_manager', 'visual_ad',
             ${JSON.stringify({ adSetName: adSet.name, platform: adSet.platform, campaignId: artifactId })},
             'completed', ${creativeResult.artifactId})
        `
      } catch (creativeError) {
        console.error(`Creative gen failed for ad set ${adSet.name}:`, creativeError)
      }
    }

    // Also request a landing page visual for the campaign
    let landingArtifactId: string | null = null
    try {
      const landingResult = await generateLandingVisual(
        workspaceId,
        brief.campaignObjective === 'leads' ? 'lead_capture' :
        brief.campaignObjective === 'sales' ? 'sale' : 'product'
      )
      landingArtifactId = landingResult.artifactId
      await sql`
        INSERT INTO creative_requests
          (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
        VALUES
          (${newId()}, ${workspaceId}, 'campaign_manager', 'landing_visual_pack',
           ${JSON.stringify({ campaignId: artifactId, goal: brief.landingPageGoal })},
           'completed', ${landingArtifactId})
      `
    } catch (landingError) {
      console.error('Landing page visual failed:', landingError)
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'campaign_brief',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      artifactId,
      brief: contentJson,
      creativesGenerated: creativeRequests.length,
      creativeRequests,
      landingPageArtifactId: landingArtifactId,
      message: `Campaign brief created. ${creativeRequests.length} ad creatives and ${landingArtifactId ? '1 landing page' : '0 landing pages'} generated and sent to approval queue.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Campaign manager error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'campaign_brief'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
