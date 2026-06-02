/**
 * Trend Scout Worker — Content Intelligence Supervisor
 * Discovers trending topics, viral formats, and content opportunities
 * for the brand's industry and audience.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Trend Scout Agent for Ooumph AI Marketing OS.
You identify trending topics, viral content formats, and emerging opportunities
for a brand's specific industry and target audience.
You mine social signals, search patterns, and platform algorithm shifts.
Always respond with valid JSON.`

interface TrendingTopic {
  topic: string
  platform: 'instagram' | 'linkedin' | 'youtube' | 'twitter' | 'tiktok' | 'google'
  trendScore: number         // 1-10 virality potential
  contentAngle: string       // specific angle for this brand
  suggestedFormat: string    // Reel / Carousel / Thread / Short
  hook: string               // ready-to-use opening line
  hashtags: string[]
  urgency: 'trending_now' | 'rising' | 'evergreen'
  competitorGap: string      // opportunity not covered by competitors
}

interface TrendReport {
  reportDate: string
  industry: string
  audiencePulse: string      // what the audience cares about right now
  platformShifts: string[]   // algorithm / format changes to capitalise on
  trendingTopics: TrendingTopic[]
  contentOpportunities: string[]
  avoidTopics: string[]      // oversaturated or brand-unsafe topics
  weeklyContentIdea: string  // best single piece of content to create this week
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, focusPlatform } = await req.json() as {
      workspaceId: string
      focusPlatform?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, strategyResult, calendarResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'content_calendar' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'trend_scout', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const calendar = calendarResult.rows[0]?.content_json as Record<string, unknown> | undefined

    // Fetch live search signals via shared Brave Search wrapper (graceful fallback if key not set)
    const industry = brand.industry || ''
    const audience = brand.target_audience || ''
    const channel = (Array.isArray(brand.channels) ? brand.channels[0] : brand.channels) || 'social media'
    const year = new Date().getFullYear()

    const [industryTrends, audiencePains, viralContent] = await Promise.all([
      braveSearch(`${industry} trends ${year}`, 8),
      braveSearch(`${audience} pain points ${year}`, 8),
      braveSearch(`viral ${channel} content ${industry}`, 8),
    ])

    const liveSignals = [
      industryTrends.length
        ? `INDUSTRY TRENDS (${industry} ${year}):\n${formatSearchResults(industryTrends)}`
        : '',
      audiencePains.length
        ? `AUDIENCE PAIN POINTS (${audience}):\n${formatSearchResults(audiencePains)}`
        : '',
      viralContent.length
        ? `VIRAL CONTENT SIGNALS (${channel} + ${industry}):\n${formatSearchResults(viralContent)}`
        : '',
    ].filter(Boolean).join('\n\n---\n\n')

    const prompt = `Identify trending content opportunities for:

Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Target Audience: ${brand.target_audience}
Active Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Instagram, LinkedIn'}
Current Tone: ${brand.tone}
Offer: ${brand.offer}
Competitors: ${brand.competitors || 'Not specified'}
${focusPlatform ? `Focus Platform: ${focusPlatform}` : ''}
${strategy ? `Content Pillars: ${JSON.stringify((strategy as Record<string, unknown>).contentPillars || [])}` : ''}
${calendar ? `Current calendar themes: ${JSON.stringify((calendar as Record<string, unknown>).weeklyThemes || [])}` : ''}

Today's date: ${new Date().toISOString().split('T')[0]}
${liveSignals ? `\n--- LIVE WEB SIGNALS (from Brave Search) ---\n\n${liveSignals}` : ''}

Identify 6-8 trending topics with specific content angles for this brand.
Focus on: what's going viral in their industry, platform algorithm trends,
underserved niches where their competitors aren't playing, seasonal opportunities.

Return JSON:
{
  "reportDate": "ISO date string",
  "industry": "industry name",
  "audiencePulse": "1-2 sentences on what this audience cares about right now",
  "platformShifts": ["shift1", "shift2"],
  "trendingTopics": [
    {
      "topic": "specific topic name",
      "platform": "instagram|linkedin|youtube|twitter|tiktok|google",
      "trendScore": 8,
      "contentAngle": "specific angle for this brand",
      "suggestedFormat": "Reel|Carousel|Thread|Short|Newsletter|Podcast",
      "hook": "attention-grabbing first line",
      "hashtags": ["#tag1", "#tag2"],
      "urgency": "trending_now|rising|evergreen",
      "competitorGap": "why this is an unclaimed opportunity"
    }
  ],
  "contentOpportunities": ["opportunity1", "opportunity2", "opportunity3"],
  "avoidTopics": ["topic1", "topic2"],
  "weeklyContentIdea": "The single best content idea to execute this week"
}`

    const report = await runAgent<TrendReport>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(report)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Trend Scout Report — ${brand.business_name} — ${new Date().toLocaleDateString()}`
    const contentJson = { ...report, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'trend_report', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Write learnings about trending topics
    for (const topic of report.trendingTopics?.slice(0, 3) || []) {
      await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
                VALUES (${newId()}, ${workspaceId}, 'trend_scout', ${artifactId},
                        ${`Trending: "${topic.topic}" on ${topic.platform} — ${topic.contentAngle}`}, 0.7)`
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'trend_report',
        artifactTitle: title,
      })
    }

    return NextResponse.json({
      artifactId,
      report: contentJson,
      trendCount: report.trendingTopics?.length || 0,
      message: `Trend Scout found ${report.trendingTopics?.length || 0} trending opportunities. Top pick: "${report.weeklyContentIdea}"`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Trend Scout error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'trend_report'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
