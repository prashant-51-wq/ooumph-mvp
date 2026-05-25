/**
 * Branding Worker: Brand Consistency Checker
 * POST { workspaceId, content: string, contentType? }
 *
 * contentType: 'social_post'|'email'|'ad'|'blog'|'pitch'
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'
import type { BrandVoiceGuide, BrandIdentity } from '@/lib/agents/branding'

const CONSISTENCY_SYSTEM = `You are a senior brand guardian and copy editor. You audit content against brand guidelines with precision and provide constructive, actionable feedback. You cite specific examples from the content. You provide a corrected version of the content when issues are found. Respond ONLY with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      content: string
      contentType?: 'social_post' | 'email' | 'ad' | 'blog' | 'pitch'
    }
    const { workspaceId, content, contentType = 'social_post' } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!content)     return NextResponse.json({ error: 'content required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, voiceResult, identityResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_voice_guide' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_identity' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const voiceGuide  = voiceResult.rows[0]?.content_json  as BrandVoiceGuide | undefined
    const identity    = identityResult.rows[0]?.content_json as BrandIdentity | undefined

    // Build comprehensive brand guidelines context
    const guidelinesContext = [
      `Business: ${brand.business_name}`,
      `Offer: ${brand.offer || ''}`,
      `Audience: ${brand.target_audience || ''}`,
      `Tone: ${brand.tone || ''}`,
      `Prohibited claims: ${brand.prohibited_claims || 'none'}`,
      identity ? `Brand archetype: ${identity.brandArchetype}` : '',
      identity ? `Brand personality: ${identity.brandPersonality?.join(', ')}` : '',
      voiceGuide ? `Words to use: ${voiceGuide.vocabulary?.useTheseWords?.slice(0, 15).join(', ')}` : '',
      voiceGuide ? `Words to avoid: ${voiceGuide.vocabulary?.avoidTheseWords?.join(', ')}` : '',
      voiceGuide ? `Voice principles: ${voiceGuide.writingPrinciples?.slice(0, 3).join(' | ')}` : '',
      voiceGuide ? `Tone for ${contentType}: ${voiceGuide.tone?.[contentType] || voiceGuide.tone?.instagram || ''}` : '',
      voiceGuide ? `Emoji policy: ${voiceGuide.emojiPolicy || ''}` : '',
    ].filter(Boolean).join('\n')

    const result = await runAgent<{
      overallScore:    number
      passedChecks:    string[]
      failedChecks:    string[]
      warnings:        string[]
      recommendations: string[]
      platformNotes:   Record<string, string>
      correctedVersion: string
    }>(
      CONSISTENCY_SYSTEM,
      `Audit this ${contentType} content against the brand guidelines below.

=== Brand Guidelines ===
${guidelinesContext}

=== Content to Audit ===
"""
${content}
"""

Perform a thorough audit across these dimensions:
1. Tone match — does it match the ${brand.tone} brand tone?
2. Vocabulary compliance — any prohibited/discouraged words? Are recommended words being used?
3. Message alignment — does content align with the offer and UVP?
4. Prohibited claims — check against: ${brand.prohibited_claims || 'none specified'}
5. Clarity and directness
6. CTA quality
7. Audience relevance for ${brand.target_audience}
8. Platform appropriateness for ${contentType}

Return JSON:
{
  "overallScore": 0-100,
  "passedChecks": ["specific check with brief note"],
  "failedChecks": ["specific issue — quote the exact failing text"],
  "warnings": ["improvement opportunity with specific suggestion"],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2"],
  "platformNotes": {
    "${contentType}": "platform-specific note",
    "general": "general improvement note"
  },
  "correctedVersion": "Full rewritten version of the content that passes all checks — write it in brand voice"
}`,
    )

    return NextResponse.json({ ok: true, report: result, contentType })
  } catch (error) {
    console.error('Consistency checker worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
