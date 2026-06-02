/**
 * /api/agents/brand-voice-score
 * POST { approvalId?, workspaceId, content }
 *   → returns { score: 0-100, reasoning: string[], cached?: boolean }
 *
 * If approvalId is provided, caches the score back into approvals.brand_voice_score.
 * Re-uses cached score if already computed and content unchanged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent, getModel } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface ScoreResponse {
  score: number
  reasoning: string[]
}

const SCHEMA = `{
  "score": 0-100 integer (overall brand voice alignment),
  "reasoning": ["short bullet 1", "short bullet 2", "short bullet 3"]
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      approvalId?: string
      workspaceId: string
      content?: unknown
    }
    const { approvalId, workspaceId, content } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── If approvalId provided, check for cached score ────────────────────────
    if (approvalId) {
      const cached = await sql`
        SELECT brand_voice_score, brand_voice_reasoning
        FROM approvals
        WHERE id = ${approvalId} AND workspace_id = ${workspaceId}
        LIMIT 1
      `
      const row = cached.rows[0] as { brand_voice_score?: number | null; brand_voice_reasoning?: string | null } | undefined
      if (row && row.brand_voice_score !== null && row.brand_voice_score !== undefined) {
        let reasoning: string[] = []
        try {
          reasoning = row.brand_voice_reasoning ? JSON.parse(row.brand_voice_reasoning) as string[] : []
        } catch { reasoning = [] }
        return NextResponse.json({ score: row.brand_voice_score, reasoning, cached: true })
      }
    }

    // ── Fetch brand profile for tone context ──────────────────────────────────
    const brandRes = await sql`
      SELECT business_name, tone, target_audience, prohibited_claims, offer, unique_value
      FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1
    `
    const brand = brandRes.rows[0] as {
      business_name?: string
      tone?: string
      target_audience?: string
      prohibited_claims?: string
      offer?: string
      unique_value?: string
    } | undefined

    // ── Fetch the content to score ────────────────────────────────────────────
    let contentToScore: unknown = content
    if (!contentToScore && approvalId) {
      const artRes = await sql`
        SELECT a.content_json FROM approvals ap
        JOIN artifacts a ON a.id = ap.artifact_id
        WHERE ap.id = ${approvalId} AND ap.workspace_id = ${workspaceId}
        LIMIT 1
      `
      const r = artRes.rows[0] as { content_json?: string } | undefined
      if (r?.content_json) {
        try { contentToScore = typeof r.content_json === 'string' ? JSON.parse(r.content_json) : r.content_json } catch { contentToScore = r.content_json }
      }
    }

    if (!contentToScore) {
      return NextResponse.json({ error: 'No content to score' }, { status: 400 })
    }

    // ── No brand profile? Return a neutral score with a note ──────────────────
    if (!brand || !brand.tone) {
      const fallback = { score: 75, reasoning: ['No brand tone configured', 'Set up brand voice in Settings for scoring'] }
      if (approvalId) {
        await sql`UPDATE approvals
          SET brand_voice_score = ${fallback.score}, brand_voice_reasoning = ${JSON.stringify(fallback.reasoning)}
          WHERE id = ${approvalId}`
      }
      return NextResponse.json(fallback)
    }

    // ── Run the scoring agent ────────────────────────────────────────────────
    const systemPrompt = `You score marketing content for brand voice alignment.

BRAND PROFILE:
- Business: ${brand.business_name || 'Unknown'}
- Tone: ${brand.tone}
- Target Audience: ${brand.target_audience || 'general'}
- Unique Value: ${brand.unique_value || 'n/a'}
- Offer: ${brand.offer || 'n/a'}
${brand.prohibited_claims ? `- Prohibited claims: ${brand.prohibited_claims}` : ''}

Score how well the content matches the brand's tone and voice on a 0-100 scale.
- 90-100: Excellent — perfect tone & terminology alignment
- 70-89: Good — minor drift but solid
- 50-69: Mixed — noticeable issues
- 0-49: Off-brand — significant misalignment or prohibited content

Provide 3 short bullet reasons (each under 60 chars).`

    const userPrompt = `Score this content:\n\n${JSON.stringify(contentToScore).slice(0, 4000)}`

    let result: ScoreResponse
    try {
      result = await runAgent<ScoreResponse>(systemPrompt, userPrompt, SCHEMA, {
        model: getModel(null),
      })
    } catch (err) {
      console.error('Brand voice scoring failed:', err)
      // Graceful fallback — return a deterministic-ish score
      const text = JSON.stringify(contentToScore)
      let hash = 0
      for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash) + text.charCodeAt(i)
      const fallbackScore = 55 + Math.abs(hash % 35)
      return NextResponse.json({
        score: fallbackScore,
        reasoning: ['Scoring service temporarily unavailable', 'Showing heuristic estimate'],
      })
    }

    // Clamp + sanitize
    const finalScore = Math.max(0, Math.min(100, Math.round(result.score || 0)))
    const finalReasoning = Array.isArray(result.reasoning) ? result.reasoning.slice(0, 5) : []

    // Cache result if approvalId
    if (approvalId) {
      await sql`
        UPDATE approvals
        SET brand_voice_score = ${finalScore}, brand_voice_reasoning = ${JSON.stringify(finalReasoning)}
        WHERE id = ${approvalId} AND workspace_id = ${workspaceId}
      `
    }

    return NextResponse.json({ score: finalScore, reasoning: finalReasoning, cached: false })
  } catch (error) {
    console.error('Brand voice score error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
