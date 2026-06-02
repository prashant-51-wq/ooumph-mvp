import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface NewsletterSection {
  title: string
  content: string
  type: 'story' | 'tips' | 'news' | 'spotlight' | 'cta'
}

interface Newsletter {
  subject: string
  previewText: string
  headline: string
  intro: string
  sections: NewsletterSection[]
  featuredInsight: string
  cta: { text: string; buttonLabel: string; url?: string }
  footer: string
  estimatedReadTime: string
}

const NEWSLETTER_SCHEMA = `{
  "subject": "string — email subject line (compelling, under 60 chars)",
  "previewText": "string — 85-char email preview text",
  "headline": "string — newsletter header title",
  "intro": "string — opening paragraph (personal, engaging, 2-3 sentences)",
  "sections": [
    {
      "title": "string",
      "content": "string — 2-3 paragraphs or bullet list in HTML",
      "type": "string — one of: story, tips, news, spotlight, cta"
    }
  ],
  "featuredInsight": "string — one key insight or quote to highlight",
  "cta": {
    "text": "string — CTA body text",
    "buttonLabel": "string — button label",
    "url": "string — optional URL placeholder"
  },
  "footer": "string — warm sign-off message",
  "estimatedReadTime": "string — e.g. '3 min read'"
}`

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json()
    const {
      workspaceId,
      theme,
      sections = [],
      edition = '',
      tone = 'professional',
    }: {
      workspaceId: string
      theme: string
      sections?: string[]
      edition?: string
      tone?: 'professional' | 'casual' | 'exciting'
    } = body

    if (!workspaceId || !theme) {
      return NextResponse.json({ error: 'workspaceId and theme are required' }, { status: 400 })
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

    // 2. Log agent run
    runId = newId()
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status)
      VALUES (${runId}, ${workspaceId}, 'newsletter_writer', 'running')
    `

    // 3. Call runAgent
    const systemPrompt = `You are an expert email newsletter writer. You craft compelling newsletters that subscribers actually look forward to reading. You balance value, personality, and clear calls to action. You write in the brand's voice and ensure every edition feels personal and relevant.`

    const sectionsRequest = sections.length
      ? `Include these sections: ${sections.join(', ')}`
      : 'Include a mix of industry news, tips, and a featured story'

    // Sprint 15E (P0 #6): inject brand memory so subscribers feel a
    // continuous voice across newsletter editions.
    const { getMemoryPromptBlock } = await import('@/lib/tools/memory')
    const memoryBlock = await getMemoryPromptBlock(workspaceId, { query: theme, maxNotes: 6, maxVoiceExamples: 3 })

    const userPrompt = `Write a complete email newsletter for ${brand.business_name || 'the brand'}.

BRAND DETAILS:
- Business: ${brand.business_name || ''}
- Tone: ${brand.tone_of_voice || brand.tone || tone}
- Target audience: ${brand.target_audience || 'subscribers'}
- Industry: ${brand.industry || ''}
${memoryBlock ? `\n${memoryBlock}\n` : ''}
NEWSLETTER BRIEF:
- Theme / Topic: ${theme}
- Edition: ${edition || 'Current Edition'}
- Desired tone: ${tone}
- ${sectionsRequest}

REQUIREMENTS:
- Subject line that gets opened (curiosity + value, under 60 chars)
- Preview text that complements the subject (85 chars)
- Warm, personal opening that connects with readers
- 3-5 distinct sections with rich HTML content (use <p>, <ul>, <li>, <strong> tags)
- One standout featured insight or quote
- Clear, non-pushy CTA
- Friendly sign-off footer in the brand's voice
- Estimate realistic read time

Respond with valid JSON only.`

    let newsletter: Newsletter
    try {
      newsletter = await runAgent<Newsletter>(systemPrompt, userPrompt, NEWSLETTER_SCHEMA)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    // 4. Update agent run + save artifact
    await sql`
      UPDATE agent_runs
      SET status = 'completed', output_json = ${JSON.stringify(newsletter)}, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `

    const artifactId = newId()
    const title = newsletter.subject || theme
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'newsletter', ${title}, ${JSON.stringify(newsletter)})
    `
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id)
      VALUES (${newId()}, ${workspaceId}, ${artifactId})
    `

    return NextResponse.json({ newsletter, artifactId })
  } catch (error) {
    console.error('Newsletter writer agent error:', error)
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
    WHERE workspace_id = ${workspaceId} AND type = 'newsletter'
    ORDER BY created_at DESC
    LIMIT 10
  `
  return NextResponse.json(result.rows)
}
