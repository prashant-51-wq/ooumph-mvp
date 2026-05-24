/**
 * Hashtag & SEO Worker — Growth Engine Supervisor
 * Generates platform-optimised hashtag sets and SEO keyword strategies
 * for every content type and platform.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Hashtag & SEO Specialist Agent for Ooumph AI Marketing OS.
You create data-driven hashtag strategies and SEO keyword plans that maximise discoverability.
Always use niche + mid-tier + broad hashtag ratios. Focus on ranking potential, not just volume.
Always respond with valid JSON.`

interface HashtagSet {
  platform: string
  niche: string[]       // <100K posts — high engagement, low competition
  midTier: string[]     // 100K-1M posts — good balance
  broad: string[]       // 1M+ posts — reach but competitive
  branded: string[]     // brand-specific hashtags to own
  campaign: string[]    // campaign-specific for this content
  bestTime: string      // best posting time for this platform
  characterNote: string // platform-specific character limit note
}

interface SEOKeyword {
  keyword: string
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional'
  difficulty: 'low' | 'medium' | 'high'
  opportunity: string   // why this keyword is good for the brand
  contentType: string   // blog / video / landing page / FAQ
  suggestedTitle: string
}

interface HashtagSEOReport {
  summary: string
  primaryKeywords: string[]          // top 5 brand keywords to own
  hashtagSets: HashtagSet[]          // one per active platform
  seoKeywords: SEOKeyword[]          // 8-10 SEO opportunities
  youtubeTagStrategy: string[]       // YouTube-specific tags
  pinterestKeywords: string[]        // Pinterest SEO
  linkedInKeywords: string[]         // LinkedIn SEO / profile keywords
  contentCalendarIntegration: string // how to use these in the content calendar
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, contentTopic } = await req.json() as {
      workspaceId: string
      contentTopic?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'hashtag_seo', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const pillars = (strategy as { contentPillars?: Array<{ name: string }> })?.contentPillars?.map(p => p.name).join(', ') || 'Not defined'

    const prompt = `Create a comprehensive Hashtag & SEO strategy for:

Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Offer: ${brand.offer}
Target Audience: ${brand.target_audience}
Active Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Instagram, LinkedIn'}
Competitors: ${brand.competitors || 'Not specified'}
Content Pillars: ${pillars}
${contentTopic ? `Specific Content Topic: ${contentTopic}` : ''}

Rules:
- Niche hashtags: under 100K posts (highest engagement per impression)
- Mid-tier: 100K-1M (best reach/engagement balance)
- Broad: 1M+ (reach, lower engagement rate)
- Ratio: 40% niche, 40% mid-tier, 20% broad
- YouTube tags should be specific, not generic
- SEO keywords should have realistic ranking potential (not "marketing")
- Prioritise long-tail keywords the brand can realistically rank for

Return JSON:
{
  "summary": "Why these hashtags/keywords were selected for this brand",
  "primaryKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "hashtagSets": [
    {
      "platform": "instagram|linkedin|youtube|twitter|tiktok",
      "niche": ["#tag", "#tag", "#tag"],
      "midTier": ["#tag", "#tag", "#tag"],
      "broad": ["#tag", "#tag"],
      "branded": ["#BrandTag"],
      "campaign": ["#CampaignTag"],
      "bestTime": "Tue-Thu 9-11am IST",
      "characterNote": "Instagram allows 30 hashtags, 3-5 in caption, rest in first comment"
    }
  ],
  "seoKeywords": [
    {
      "keyword": "specific long-tail keyword",
      "intent": "informational|commercial|navigational|transactional",
      "difficulty": "low|medium|high",
      "opportunity": "why this keyword works for this brand",
      "contentType": "blog post|video|landing page|FAQ",
      "suggestedTitle": "ready-to-use title"
    }
  ],
  "youtubeTagStrategy": ["tag1", "tag2"],
  "pinterestKeywords": ["kw1", "kw2"],
  "linkedInKeywords": ["kw1", "kw2"],
  "contentCalendarIntegration": "How to apply these hashtags/keywords in the content calendar"
}`

    const report = await runAgent<HashtagSEOReport>(SYSTEM, prompt)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(report)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Hashtag & SEO Strategy — ${brand.business_name}`
    const contentJson = { ...report, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'hashtag_seo_report', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Save primary keywords as learnings
    if (report.primaryKeywords?.length) {
      await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
                VALUES (${newId()}, ${workspaceId}, 'hashtag_seo', ${artifactId},
                        ${`Primary SEO keywords for ${brand.business_name}: ${report.primaryKeywords.join(', ')}`}, 0.85)`
    }

    return NextResponse.json({
      artifactId,
      report: contentJson,
      platformCount: report.hashtagSets?.length || 0,
      keywordCount: report.seoKeywords?.length || 0,
      message: `Hashtag & SEO strategy created: ${report.hashtagSets?.length || 0} platform sets, ${report.seoKeywords?.length || 0} SEO keywords.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Hashtag SEO error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'hashtag_seo_report'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
