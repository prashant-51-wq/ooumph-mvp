/**
 * POST /api/agents/publish/adapt
 * AI adapts a single piece of content for each target platform,
 * respecting character limits, tone, and format conventions.
 *
 * Body: {
 *   workspaceId: string
 *   content: string            // base content
 *   platforms: string[]        // which platforms to adapt for
 *   context?: string           // optional extra context (e.g. "this is about a product launch")
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface AdaptBody {
  workspaceId: string
  content: string
  platforms: string[]
  context?: string
}

const PLATFORM_RULES: Record<string, string> = {
  twitter: 'Max 280 characters. Punchy, conversational. Use 1-2 hashtags max. No em-dashes. Hook in first 8 words. Can use numbers and emojis sparingly.',
  linkedin: 'Max 3000 characters. Professional but human. Use line breaks between short paragraphs. Start with a bold first line (no hashtag at start). Add 3-5 hashtags at the end. Emojis OK but not excessive.',
  instagram: 'Max 2200 characters for caption. Engaging, visual storytelling tone. Add a strong call to action. End with a hashtag block of 15-20 relevant hashtags on a new line. Can be longer and more personal.',
  facebook: 'Max 63,206 chars but aim for 40-80 words for best engagement. Conversational, community-focused. Ask a question to drive comments. 1-3 hashtags max.',
  youtube: 'Title + description format. Title: max 100 chars, keyword-rich. Description: 150-200 words, include 3 searchable tags at the end.',
}

async function runAgent<T>(prompt: string): Promise<T> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text) as T
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AdaptBody
    const { workspaceId, content, platforms, context } = body

    if (!workspaceId || !content || !platforms?.length) {
      return NextResponse.json({ error: 'workspaceId, content, and platforms required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load brand context
    const [brandResult, wsResult] = await Promise.all([
      sql`SELECT business_name, tone, target_audience FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
    ])
    const brand = brandResult.rows[0]
    const ws = wsResult.rows[0]
    const businessName = String(brand?.business_name || ws?.name || 'the business')
    const tone = String(brand?.tone || 'professional and engaging')
    const audience = String(brand?.target_audience || 'general audience')

    const platformRules = platforms
      .map(p => `### ${p.toUpperCase()}\n${PLATFORM_RULES[p] || 'Adapt appropriately for this platform.'}`)
      .join('\n\n')

    const adapted = await runAgent<Record<string, string>>(`
You are a social media content strategist for ${businessName} (${tone} tone, audience: ${audience}).

Adapt the following base content for each platform listed. Follow each platform's rules strictly.
${context ? `Additional context: ${context}` : ''}

BASE CONTENT:
"""
${content}
"""

PLATFORM RULES:
${platformRules}

Return a JSON object where each key is the platform name (exactly as given) and the value is the adapted content string.
Example: { "twitter": "...", "linkedin": "..." }

IMPORTANT:
- Keep the core message and facts identical across platforms
- Do NOT invent facts not in the original
- Respect character limits strictly (twitter MUST be ≤280 chars)
- Return ONLY the JSON object, no other text
`)

    // Validate twitter length
    if (adapted.twitter && adapted.twitter.length > 280) {
      adapted.twitter = adapted.twitter.slice(0, 277) + '...'
    }

    // Count characters per platform for the response
    const charCounts: Record<string, number> = {}
    for (const [p, text] of Object.entries(adapted)) {
      charCounts[p] = typeof text === 'string' ? text.length : 0
    }

    return NextResponse.json({ ok: true, adapted, charCounts })
  } catch (error) {
    console.error('Content adaptation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
