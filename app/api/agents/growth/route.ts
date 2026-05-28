import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateStaticPost, generateStoryCover, generateVideoBrief } from '@/lib/creative-workers'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a growth hacking strategist and viral content expert.
Create data-driven growth plans with viral hooks, engagement tactics, and reach strategies.
Respond ONLY with valid JSON.`

interface GrowthTactic {
  type: 'viral_hook' | 'engagement_loop' | 'reach_expansion' | 'collaboration' | 'seo_content' | 'community'
  title: string
  description: string
  expectedImpact: string     // e.g. "2-3X organic reach"
  effort: 'low' | 'medium' | 'high'
  timeframe: string          // e.g. "Week 1-2"
  creativeNeeds: string[]    // which creative assets support this tactic
}

interface GrowthPlan {
  growthGoal: string
  currentGap: string         // what's holding back growth
  primaryChannel: string     // best channel for this audience
  viralMechanism: string     // how content spreads
  tactics: GrowthTactic[]
  contentPillars: string[]   // 3-5 content themes for growth
  engagementHooks: string[]  // 5 scroll-stopping hooks to test
  postingFrequency: string   // e.g. "5x/week Instagram + 3x/week LinkedIn"
  weeklyMilestones: string[] // 4-week milestone plan
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, growthGoal } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const [brandResult, strategyResult, calendarResult, assetResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'content_calendar' ORDER BY created_at DESC LIMIT 1`,
      // Pull existing content assets to understand what's already created
      sql`SELECT type, title FROM artifacts WHERE workspace_id = ${workspaceId} AND type IN ('carousel','reelScript','linkedInPost') ORDER BY created_at DESC LIMIT 5`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const calendar = calendarResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const existingAssets = assetResult.rows

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'growth_engine', 'running')`

    const prompt = `Create a growth plan for:
Business: ${brand.business_name}
Industry: ${brand.industry}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Growth Goal: ${growthGoal || 'Grow organic social media reach and engagement by 3X in 90 days'}
Channels: ${brand.channels || 'Instagram, LinkedIn'}
${strategy ? `Current positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}` : ''}
${calendar ? `Content themes in calendar: ${JSON.stringify((calendar as Record<string, unknown>).weeklyThemes || (calendar as Record<string, unknown>).themes || '')}` : ''}
${existingAssets.length ? `Existing content types: ${existingAssets.map(a => a.type).join(', ')}` : ''}

Create a viral growth plan with:
- growthGoal (refined, specific), currentGap, primaryChannel, viralMechanism
- tactics: 5-7 growth tactics, each with type, title, description, expectedImpact, effort, timeframe, creativeNeeds
- contentPillars: 3-5 content themes that drive growth for this audience
- engagementHooks: 5 specific scroll-stopping first lines to test (real words, not templates)
- postingFrequency: specific cadence per platform
- weeklyMilestones: specific milestones for weeks 1-4

Return JSON only.`

    const plan = await runAgent<GrowthPlan>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(plan)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Growth Plan — ${brand.business_name}`
    const contentJson = { ...plan, businessName: brand.business_name, tone: brand.tone }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'growth_plan', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // ── Creative Supervisor requests ──────────────────────────────────────────
    // For each engagement hook, create a static post creative
    // For reach expansion, create a story and reel brief

    const creativeRequests: Array<{ type: string; artifactId: string }> = []

    // Generate a viral static post for the best hook
    if (plan.engagementHooks?.[0]) {
      try {
        const postResult = await generateStaticPost(
          workspaceId,
          plan.engagementHooks[0],
          'instagram'
        )
        creativeRequests.push({ type: 'visual_post', artifactId: postResult.artifactId })
        await sql`
          INSERT INTO creative_requests
            (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
          VALUES
            (${newId()}, ${workspaceId}, 'growth_engine', 'visual_post',
             ${JSON.stringify({ hook: plan.engagementHooks[0], growthPlanId: artifactId })},
             'completed', ${postResult.artifactId})
        `
      } catch (e) { console.error('Growth static post failed:', e) }
    }

    // Generate a story for the viral mechanism
    if (plan.viralMechanism) {
      try {
        const storyResult = await generateStoryCover(workspaceId, plan.viralMechanism, 'instagram')
        creativeRequests.push({ type: 'visual_story', artifactId: storyResult.artifactId })
        await sql`
          INSERT INTO creative_requests
            (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
          VALUES
            (${newId()}, ${workspaceId}, 'growth_engine', 'visual_story',
             ${JSON.stringify({ topic: plan.viralMechanism, growthPlanId: artifactId })},
             'completed', ${storyResult.artifactId})
        `
      } catch (e) { console.error('Growth story failed:', e) }
    }

    // Generate a reel brief for the primary content pillar
    if (plan.contentPillars?.[0]) {
      try {
        const reelResult = await generateVideoBrief(workspaceId, plan.contentPillars[0], 'reel')
        creativeRequests.push({ type: 'video_brief', artifactId: reelResult.artifactId })
        await sql`
          INSERT INTO creative_requests
            (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
          VALUES
            (${newId()}, ${workspaceId}, 'growth_engine', 'video_brief',
             ${JSON.stringify({ pillar: plan.contentPillars[0], growthPlanId: artifactId })},
             'completed', ${reelResult.artifactId})
        `
      } catch (e) { console.error('Growth reel failed:', e) }
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'growth_plan',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      artifactId,
      plan: contentJson,
      creativesGenerated: creativeRequests.length,
      creativeRequests,
      message: `Growth plan created with ${creativeRequests.length} supporting creatives queued for approval.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Growth engine error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'growth_plan'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
