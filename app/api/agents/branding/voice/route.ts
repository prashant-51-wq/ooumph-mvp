/**
 * Branding Worker: Brand Voice Guide Generator
 * POST { workspaceId }
 * POST { workspaceId, testContent: string } — test mode: scores content against voice guide
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { generateBrandVoiceGuide, type BrandVoiceGuide } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      testContent?: string
    }
    const { workspaceId, testContent } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Test mode: score content against existing voice guide ─────────────────
    if (testContent) {
      const guideResult = await sql`
        SELECT content_json FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'brand_voice_guide'
        ORDER BY created_at DESC LIMIT 1
      `
      const guide = guideResult.rows[0]?.content_json as BrandVoiceGuide | undefined

      const VOICE_TEST_SYSTEM = `You are a brand voice expert. Evaluate content against brand voice guidelines and return specific, actionable feedback. Respond ONLY with valid JSON.`

      const testResult = await runAgent<{ score: number; issues: string[]; improvements: string[] }>(
        VOICE_TEST_SYSTEM,
        `Evaluate this content against the brand voice guidelines.

Business: ${brand.business_name}
Brand tone: ${brand.tone}
${guide ? `Voice Guide:\nPersonality traits: ${guide.personality?.join(', ')}\nWords to use: ${guide.vocabulary?.useTheseWords?.join(', ')}\nWords to avoid: ${guide.vocabulary?.avoidTheseWords?.join(', ')}\nWriting principles: ${guide.writingPrinciples?.join(' | ')}` : 'No voice guide generated yet — evaluate against brand tone only.'}

Content to test:
"""
${testContent}
"""

Return JSON:
{
  "score": 0-100,
  "issues": ["specific issue 1 with quote", "specific issue 2 with quote"],
  "improvements": ["exact rewrite suggestion 1", "exact rewrite suggestion 2"]
}`,
      )

      return NextResponse.json({ ok: true, testResult })
    }

    // ── Load brand identity artifact for richer context ───────────────────────
    const identityResult = await sql`
      SELECT content_json FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'brand_identity'
      ORDER BY created_at DESC LIMIT 1
    `
    if (identityResult.rows[0]?.content_json) {
      const id = identityResult.rows[0].content_json as Record<string, unknown>
      if (id.brandArchetype) brand.tone = `${brand.tone} (archetype: ${id.brandArchetype})`
    }

    const guide = await generateBrandVoiceGuide(brand)

    // Save artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_voice_guide',
        ${'Brand Voice Guide — ' + brand.business_name},
        ${JSON.stringify(guide)}
      )
    `

    return NextResponse.json({ ok: true, artifactId, guide })
  } catch (error) {
    console.error('Brand voice worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
