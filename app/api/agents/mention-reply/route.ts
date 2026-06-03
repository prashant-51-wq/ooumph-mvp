/**
 * POST /api/agents/mention-reply
 *
 * Drafts a platform-aware reply to a brand_mention. Uses the platform's
 * length conventions so the UI can render a respectful character counter:
 *
 *   twitter / x   — 280 chars hard
 *   instagram     — 2200 chars (caption); we aim under 600 for engagement
 *   reddit        — long-form OK; aim 1500
 *   news / blog   — long-form, formal tone
 *
 *   Body: { workspaceId, mentionId }
 *   Returns: { ok, draft: { reply, tone, platform, charLimit }, mention }
 *
 * No third-party writes. The UI must explicitly call a publish route to
 * actually send the reply — this endpoint only produces text.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'

export const runtime = 'nodejs'

interface MentionRow {
  id: string
  workspace_id: string
  source_platform: string
  source_url: string | null
  author_handle: string | null
  content_text: string
  sentiment_score: number | string
  severity_level: string
}

interface DraftResult {
  reply: string
  tone: 'empathetic' | 'professional' | 'casual' | 'assertive' | 'apologetic' | string
  reasoning: string
}

// Platform → recommended max chars for the draft
function getCharLimit(platform: string): { limit: number; isHardLimit: boolean } {
  const p = platform.toLowerCase()
  if (p === 'twitter' || p === 'x') return { limit: 280, isHardLimit: true }
  if (p === 'instagram') return { limit: 600, isHardLimit: false }
  if (p === 'reddit') return { limit: 1500, isHardLimit: false }
  if (p === 'linkedin') return { limit: 1300, isHardLimit: false }
  if (p === 'news' || p === 'blog' || p === 'brave_search') return { limit: 1500, isHardLimit: false }
  return { limit: 1500, isHardLimit: false }
}

const SYSTEM_PROMPT = `You are a brand reputation reply assistant.

You will be given:
  - the original brand mention (platform + author + content)
  - sentiment score (0.00 most negative → 1.00 most positive)
  - severity level
  - the brand's name + tone preference
  - the platform character budget

Your task: draft a reply that is on-brand, sincere, and PLATFORM-APPROPRIATE.

Rules:
  • If sentiment is below 0.40, lead with empathy. Acknowledge specifically what frustrated them. NEVER deflect.
  • If sentiment is above 0.70, thank the author warmly and add a small value-add (link, related resource, next-step invite).
  • Stay STRICTLY UNDER the platform char limit. For Twitter/X (280 hard limit), the reply MUST fit including any handle reference.
  • Never claim something is fixed unless we have explicit ground truth.
  • Match the platform tone (Twitter: punchy + casual; LinkedIn: warm + professional; News: formal).
  • Do not include any markdown formatting — plain text only.

Output ONLY a JSON object. No fences. No preamble.

{
  "reply":     string,        // the reply text, plain prose, under char limit
  "tone":      "empathetic" | "professional" | "casual" | "assertive" | "apologetic",
  "reasoning": string         // 1 sentence explaining the tonal choice
}`

export async function POST(req: NextRequest) {
  let body: { workspaceId?: string; mentionId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { workspaceId, mentionId } = body
  if (!workspaceId || !mentionId) {
    return NextResponse.json({ error: 'workspaceId and mentionId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

  // Load the mention + workspace brand context
  const [mentionRes, brandRes] = await Promise.all([
    sql`SELECT * FROM brand_mentions WHERE id = ${mentionId} AND workspace_id = ${workspaceId} LIMIT 1`,
    sql`SELECT business_name, tone FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
  ])
  const mention = mentionRes.rows[0] as unknown as MentionRow | undefined
  if (!mention) return NextResponse.json({ error: 'Mention not found' }, { status: 404 })
  const brand = brandRes.rows[0] as { business_name?: string; tone?: string } | undefined
  const businessName = brand?.business_name?.trim() || 'our team'
  const brandTone = brand?.tone?.trim() || 'professional, helpful'

  const platform = mention.source_platform
  const { limit, isHardLimit } = getCharLimit(platform)
  const sentimentScore = Number(mention.sentiment_score || 0.5)

  const userPrompt = `BRAND: ${businessName}
BRAND TONE: ${brandTone}
PLATFORM: ${platform}
CHAR LIMIT: ${limit} ${isHardLimit ? '(HARD)' : '(soft target)'}
SEVERITY: ${mention.severity_level}
SENTIMENT_SCORE: ${sentimentScore.toFixed(2)}
AUTHOR: ${mention.author_handle || 'unknown'}

ORIGINAL MENTION CONTENT:
${mention.content_text.slice(0, 4000)}

Draft the reply per the OUTPUT CONTRACT.`

  try {
    const draft = await runAgent<DraftResult>(SYSTEM_PROMPT, userPrompt, workspaceId)
    // Hard-clip Twitter/X to 280 just in case the model overshoots.
    const finalReply = isHardLimit && draft.reply.length > limit
      ? draft.reply.slice(0, limit - 1) + '…'
      : draft.reply
    return NextResponse.json({
      ok: true,
      draft: {
        reply: finalReply,
        tone: draft.tone || 'professional',
        reasoning: draft.reasoning || '',
        platform,
        charLimit: limit,
        isHardLimit,
      },
      mention: {
        id: mention.id,
        source_platform: mention.source_platform,
        source_url: mention.source_url,
        author_handle: mention.author_handle,
        sentiment_score: sentimentScore,
        severity_level: mention.severity_level,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
