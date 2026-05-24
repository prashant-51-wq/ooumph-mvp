/**
 * Content Repurposing Engine Agent
 * Transforms a single piece of content into multiple platform-optimised formats.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Content Repurposing Agent for Ooumph AI Marketing OS.
You take a single piece of source content and expertly repurpose it into
every requested format while preserving the core message and adapting tone,
length, structure, and style to each platform's best practices.
Always respond with valid JSON that strictly matches the requested schema.`

type ContentType = 'blog' | 'linkedin' | 'tweet' | 'video_script' | 'email' | 'any'

const FORMAT_LIMITS: Record<string, number> = {
  twitter_thread: 280,
  linkedin_post: 3000,
  instagram_caption: 2200,
  instagram_carousel: 2200,
  email_newsletter: 0,  // no limit
  whatsapp_message: 1000,
  youtube_script: 0,
  blog_post: 0,
  press_release: 0,
  podcast_intro: 0,
}

interface RepurposedItem {
  format: string
  content: string
  hashtags?: string[]
  characterCount: number
}

interface RepurposeResult {
  repurposed: RepurposedItem[]
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, originalContent, contentType, targetFormats } = await req.json() as {
      workspaceId: string
      originalContent: string
      contentType: ContentType
      targetFormats: string[]
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!originalContent?.trim()) return NextResponse.json({ error: 'Missing originalContent' }, { status: 400 })
    if (!targetFormats?.length) return NextResponse.json({ error: 'Select at least one target format' }, { status: 400 })

    // Load brand profile
    const brandResult = await sql`
      SELECT bp.* FROM brand_profiles bp
      JOIN workspaces w ON w.id = bp.workspace_id
      WHERE w.id = ${workspaceId}
      LIMIT 1
    `
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'content_repurposer', 'running')`

    const formatInstructions: Record<string, string> = {
      twitter_thread: 'A Twitter/X thread of 5-8 tweets. Each tweet max 280 chars. Number them (1/, 2/, etc). Hook in tweet 1.',
      linkedin_post: 'Professional LinkedIn post. Max 3000 chars. Use line breaks for readability. Add relevant hashtags.',
      instagram_caption: 'Engaging Instagram caption with a hook, story, CTA. Max 2200 chars. 10-15 hashtags.',
      instagram_carousel: 'Script for an Instagram carousel. 7-10 slides. Each slide: "Slide N: [heading] — [body text]". Final slide: CTA.',
      email_newsletter: 'Full email newsletter. Include subject line, preview text, body with sections, and CTA.',
      whatsapp_message: 'WhatsApp-friendly message. Conversational, max 1000 chars. Use line breaks not paragraphs.',
      youtube_script: 'Full YouTube video script. Hook, intro, main content with timestamps, outro with subscribe CTA.',
      blog_post: 'Full blog post with H1 title, intro, 3-5 H2 sections with content, conclusion, and SEO meta description.',
      press_release: 'Formal press release. Headline, dateline, lead paragraph (5 Ws), body, boilerplate, contact info.',
      podcast_intro: 'Podcast episode intro (60-90 seconds when read aloud). Hook, episode overview, what listeners will learn.',
    }

    const requestedFormats = targetFormats
      .map(f => `- ${f}: ${formatInstructions[f] || f}`)
      .join('\n')

    const prompt = `Repurpose the following ${contentType} content into all requested formats for this brand:

BRAND CONTEXT:
Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Target Audience: ${brand.target_audience}
Brand Tone: ${brand.tone}
Offer: ${brand.offer}
Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Not specified'}

ORIGINAL CONTENT (${contentType}):
---
${originalContent.slice(0, 8000)}
---

REQUIRED OUTPUT FORMATS:
${requestedFormats}

For each format:
- Preserve the core message and insights
- Adapt tone, length, and structure to the platform
- Add relevant hashtags for social formats
- Keep brand voice consistent (${brand.tone})
- Make each standalone and compelling

Return ONLY valid JSON:
{
  "repurposed": [
    {
      "format": "twitter_thread",
      "content": "1/ Hook tweet here\n\n2/ Second tweet...",
      "hashtags": ["#tag1", "#tag2"],
      "characterCount": 1240
    }
  ]
}

Include one object per requested format. The "format" field must match the format key exactly.
For "characterCount" provide the total character count of the content field.`

    const result = await runAgent<RepurposeResult>(SYSTEM, prompt)

    // Ensure characterCount is accurate
    const repurposed = (result.repurposed || []).map(item => ({
      ...item,
      characterCount: item.content?.length || 0,
    }))

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify({ repurposed })}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Repurposed Content — ${brand.business_name} — ${targetFormats.length} formats — ${new Date().toLocaleDateString()}`
    const contentJson = {
      repurposed,
      originalContent: originalContent.slice(0, 500) + (originalContent.length > 500 ? '...' : ''),
      contentType,
      targetFormats,
      businessName: brand.business_name,
      formatLimits: FORMAT_LIMITS,
    }

    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'repurposed_content', ${title}, ${JSON.stringify(contentJson)})`

    return NextResponse.json({ repurposed, artifactId })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Content repurpose error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
