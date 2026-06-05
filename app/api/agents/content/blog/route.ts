import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgentWithTools } from '@/lib/agents/tool-calling'
import { buildMemoryMatrix, logMemoryInjection } from '@/lib/agents/memory-retrieval'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface BlogPost {
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  excerpt: string
  readTime: string
  outline: string[]
  content: string
  keywords: string[]
  internalLinkSuggestions: string[]
  callToAction: string
  socialCaption: string
  wordCount: number
}

const BLOG_SCHEMA = `{
  "title": "string — SEO-optimized H1 heading",
  "slug": "string — URL-friendly slug (lowercase, hyphens)",
  "metaTitle": "string — 60 chars max",
  "metaDescription": "string — 155 chars max",
  "excerpt": "string — 2-sentence summary",
  "readTime": "string — e.g. '7 min read'",
  "outline": ["string — H2 heading"],
  "content": "string — Full HTML blog post with <h2>, <p>, <ul>, <strong> tags",
  "keywords": ["string — primary and secondary keywords used"],
  "internalLinkSuggestions": ["string — topic to internally link to"],
  "callToAction": "string — closing CTA paragraph",
  "socialCaption": "string — LinkedIn/Twitter caption to promote the post",
  "wordCount": "number"
}`

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json()
    const {
      workspaceId,
      topic,
      keywords = '',
      targetWordCount = 1500,
      style = 'educational',
      targetAudience = '',
    }: {
      workspaceId: string
      topic: string
      keywords?: string
      targetWordCount?: number
      style?: 'educational' | 'thought_leadership' | 'how_to' | 'listicle' | 'news_analysis'
      targetAudience?: string
    } = body

    if (!workspaceId || !topic) {
      return NextResponse.json({ error: 'workspaceId and topic are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // 1. Load brand profile
    const brandResult = await sql`
      SELECT bp.* FROM brand_profiles bp
      JOIN workspaces w ON bp.workspace_id = w.id
      WHERE w.id = ${workspaceId} LIMIT 1
    `
    const brand = brandResult.rows[0] as Record<string, unknown> | undefined
    if (!brand) {
      return NextResponse.json({ error: 'Brand profile not found. Complete onboarding first.' }, { status: 400 })
    }

    // Sprint 2: research is now done via the native search tool during the
    // agent's tool-use loop — no manual pre-fetch needed here.

    // 3. Log agent run
    runId = newId()
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status)
      VALUES (${runId}, ${workspaceId}, 'blog_writer', 'running')
    `

    // 4. Call runAgent
    // Sprint 15E (P0 #6): inject brand memory so the blog reflects the
    // user's uploaded brand docs (positioning, tone examples).
    const { getMemoryPromptBlock } = await import('@/lib/tools/memory')
    const memoryBlock = await getMemoryPromptBlock(workspaceId, { query: topic, maxNotes: 6, maxVoiceExamples: 2 })

    // Sprint 1: Postgres memory matrix on top of the existing memory tool.
    // The two blocks are complementary — getMemoryPromptBlock is keyword-
    // search-tuned (topic-relevant notes), buildMemoryMatrix is
    // deterministic top-N (winners, voice rules, live campaigns).
    const memoryMatrix = await buildMemoryMatrix(workspaceId)
    await logMemoryInjection({ workspaceId, agentRunId: runId, agent: 'blog_writer', matrix: memoryMatrix })

    const systemPrompt = `You are an expert SEO content writer and digital marketer. You write comprehensive, engaging blog posts that rank on Google. You follow E-E-A-T principles, use natural keyword integration, and always write in the brand's voice. You structure content for both readers and search engines.

You have tools available:
- search: research SEO best practices, trending angles, or competitor content for this topic
- query_brand_memory: fetch approved brand voice examples (call this first)
- scrape: read a competitor or reference URL if needed
- persist_artifact: save the finished blog post as a workspace artifact

Always call query_brand_memory first, then optionally search for research context, then write the post.`

    const userPrompt = `Write a complete, publication-ready blog post for ${brand.business_name || 'the brand'}.

BRAND DETAILS:
- Business: ${brand.business_name || ''}
- Tone: ${brand.tone_of_voice || brand.tone || 'professional'}
- Target audience: ${brand.target_audience || targetAudience || 'general audience'}
- Industry: ${brand.industry || ''}
- Brand values: ${brand.brand_values || brand.values || ''}
${memoryBlock ? `\n${memoryBlock}\n` : ''}
### SYSTEM MEMORY & PAST WORKSPACE LEARNINGS
${memoryMatrix.matrix}

CONTENT BRIEF:
- Topic: ${topic}
- Target keywords: ${keywords || 'derive from topic'}
- Target word count: ${targetWordCount} words
- Style: ${style}
- Target audience: ${targetAudience || brand.target_audience || 'general audience'}

REQUIREMENTS:
- Write a full ${targetWordCount}-word blog post in HTML (use <h2>, <p>, <ul>, <li>, <strong>, <em> tags)
- Include a compelling, keyword-rich H1 title
- Natural keyword integration (not stuffed)
- Clear structure with multiple H2 sections matching the outline
- Include actionable insights and concrete examples
- End with a strong call to action
- Write a LinkedIn/Twitter social caption to promote this post
- Generate 3-5 internal link suggestion topics related to this content

Respond with valid JSON only.`

    let blog: BlogPost
    try {
      blog = await runAgentWithTools<BlogPost>(systemPrompt, userPrompt, workspaceId)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    // 5. Update agent run + save artifact
    await sql`
      UPDATE agent_runs
      SET status = 'completed', output_json = ${JSON.stringify(blog)}, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `

    const artifactId = newId()
    const title = blog.title || topic
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'blog_post', ${title}, ${JSON.stringify(blog)})
    `
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id)
      VALUES (${newId()}, ${workspaceId}, ${artifactId})
    `

    return NextResponse.json({ blog, artifactId })
  } catch (error) {
    console.error('Blog writer agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 400 })
  const result = await sql`
    SELECT id, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'blog_post'
    ORDER BY created_at DESC
    LIMIT 10
  `
  return NextResponse.json(result.rows)
}
