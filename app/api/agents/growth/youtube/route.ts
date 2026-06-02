/**
 * YouTube Growth Worker — Growth Engine Supervisor
 * Generates YouTube channel strategy, video ideas, SEO-optimised titles,
 * descriptions, scripts, and channel growth roadmaps.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { generateVideoBrief } from '@/lib/creative-workers'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the YouTube Growth Agent for Ooumph AI Marketing OS.
You create data-driven YouTube channel strategies: video ideas, SEO titles, descriptions,
thumbnails briefs, and subscriber growth roadmaps.
Focus on searchable, evergreen content that converts viewers to customers.
Always respond with valid JSON.`

interface YouTubeVideoIdea {
  title: string                    // SEO-optimised title
  alternativeTitles: string[]      // A/B test options
  type: 'educational' | 'tutorial' | 'case_study' | 'vlog' | 'review' | 'shorts'
  searchKeyword: string            // primary keyword to rank for
  expectedLength: string           // e.g. "8-12 minutes"
  thumbnailConcept: string         // visual concept for the thumbnail
  openingHook: string              // first 15 seconds script
  description: string              // SEO-optimised description with timestamps placeholder
  tags: string[]                   // YouTube tags
  callToAction: string             // end screen CTA
  monetisationPotential: 'low' | 'medium' | 'high'
}

interface YouTubeChannelStrategy {
  channelPositioning: string       // unique angle vs other channels
  targetSubscriberPersona: string
  contentSchedule: string          // upload cadence
  playlistStructure: string[]      // 3-5 playlist names
  channelTrailer: string           // script for channel trailer
  aboutSection: string             // SEO-optimised About section
  communityTabStrategy: string     // how to use Community tab
  shortsStrategy: string           // YouTube Shorts integration
  videoIdeas: YouTubeVideoIdea[]   // 8-10 video ideas
  growthMilestones: string[]       // 30/60/90 day subscriber goals
  collabStrategy: string           // collaboration with other creators
  monetisationPath: string         // how to monetise the channel
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, strategyResult, growthResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'growth_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'youtube_growth', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const growth = growthResult.rows[0]?.content_json as Record<string, unknown> | undefined

    const prompt = `Create a complete YouTube growth strategy for:

Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Competitors: ${brand.competitors || 'Not specified'}
${strategy ? `Brand positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}` : ''}
${growth ? `Growth goal: ${JSON.stringify((growth as Record<string, unknown>).growthGoal || '')}` : ''}

Create a YouTube strategy that:
- Positions the brand as the #1 go-to channel in their niche
- Balances SEO-driven search content with viral/entertaining content
- Includes both long-form videos AND YouTube Shorts
- Has realistic subscriber growth milestones
- Connects YouTube to the broader marketing funnel

Return JSON:
{
  "channelPositioning": "Unique angle for this YouTube channel vs competitors",
  "targetSubscriberPersona": "Who the ideal subscriber is",
  "contentSchedule": "e.g. 2 long-form videos/week + 5 Shorts/week",
  "playlistStructure": ["Playlist 1 Name", "Playlist 2 Name"],
  "channelTrailer": "60-second channel trailer script",
  "aboutSection": "SEO-optimised About page (250-300 words)",
  "communityTabStrategy": "How to use Community posts for engagement",
  "shortsStrategy": "How YouTube Shorts fits the channel strategy",
  "videoIdeas": [
    {
      "title": "SEO-optimised video title",
      "alternativeTitles": ["Title B", "Title C"],
      "type": "educational|tutorial|case_study|vlog|review|shorts",
      "searchKeyword": "primary keyword",
      "expectedLength": "8-12 minutes",
      "thumbnailConcept": "Visual description of the thumbnail",
      "openingHook": "First 15 seconds word-for-word",
      "description": "SEO description with [TIMESTAMPS] placeholder",
      "tags": ["tag1", "tag2"],
      "callToAction": "End-screen CTA",
      "monetisationPotential": "low|medium|high"
    }
  ],
  "growthMilestones": ["Day 30: X subscribers", "Day 60: Y subscribers", "Day 90: Z subscribers"],
  "collabStrategy": "How to collaborate with other creators",
  "monetisationPath": "How to monetise: AdSense, sponsorships, products, courses"
}`

    const channelStrategy = await runAgent<YouTubeChannelStrategy>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(channelStrategy)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `YouTube Growth Strategy — ${brand.business_name}`
    const contentJson = { ...channelStrategy, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'youtube_strategy', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Request a YouTube thumbnail from Creative Supervisor for first video idea
    let thumbnailArtifactId: string | null = null
    if (channelStrategy.videoIdeas?.[0]) {
      try {
        const thumbResult = await generateVideoBrief(
          workspaceId,
          channelStrategy.videoIdeas[0].title,
          'youtube'
        )
        thumbnailArtifactId = thumbResult.artifactId
        await sql`INSERT INTO creative_requests
                    (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
                  VALUES
                    (${newId()}, ${workspaceId}, 'youtube_growth', 'youtube_thumbnail',
                     ${JSON.stringify({ videoTitle: channelStrategy.videoIdeas[0].title, concept: channelStrategy.videoIdeas[0].thumbnailConcept, type: 'youtube_thumbnail' })},
                     'completed', ${thumbnailArtifactId})`
      } catch (e) { console.error('YouTube thumbnail request failed:', e) }
    }

    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'youtube_growth', ${artifactId},
                      ${`YouTube channel strategy: ${channelStrategy.channelPositioning}. ${channelStrategy.videoIdeas?.length || 0} video ideas generated.`}, 0.85)`

    return NextResponse.json({
      artifactId,
      strategy: contentJson,
      videoCount: channelStrategy.videoIdeas?.length || 0,
      thumbnailArtifactId,
      message: `YouTube strategy created: ${channelStrategy.videoIdeas?.length || 0} video ideas, channel positioning, and growth roadmap.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('YouTube growth error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'youtube_strategy'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
