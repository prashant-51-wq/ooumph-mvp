import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a Brand Guardian AI. You review marketing copy and creative content to ensure
it aligns with brand guidelines. Be specific about issues — quote the exact copy that's wrong.
Respond ONLY with valid JSON.`

interface BrandCheckResult {
  passed: boolean
  score: number          // 0-100
  issues: string[]       // specific violations with quotes
  suggestions: string[]  // exact replacement suggestions
  tone_match: boolean
  audience_fit: boolean
  summary: string
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, artifactId } = await req.json()
    if (!workspaceId || !artifactId) {
      return NextResponse.json({ error: 'Missing workspaceId or artifactId' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, artifactResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT type, title, content_json FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    const artifact = artifactResult.rows[0]

    if (!brand) return NextResponse.json({ error: 'Brand profile not found.' }, { status: 400 })
    if (!artifact) return NextResponse.json({ error: 'Artifact not found.' }, { status: 404 })

    const content = artifact.content_json as Record<string, unknown>

    const prompt = `Review this marketing content against the brand guidelines below.

=== BRAND GUIDELINES ===
Business Name: ${brand.business_name}
Industry: ${brand.industry}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Unique Value Prop: ${brand.unique_value_prop || 'Not specified'}
Mission: ${brand.mission || 'Not specified'}

=== CONTENT TO REVIEW ===
Type: ${artifact.type}
Title: ${artifact.title}
Content: ${JSON.stringify(content, null, 2)}

=== WHAT TO CHECK ===
1. Does the tone match "${brand.tone}"? (is it too formal/casual/aggressive?)
2. Is the copy appropriate for "${brand.target_audience}"?
3. Does it reflect the brand's value proposition?
4. Are there any off-brand phrases, promises, or claims?
5. Is the CTA aligned with the brand's typical ask?
6. Score 0-100: 90+ = publish-ready, 70-89 = minor fixes, <70 = needs rework

Return JSON only:
{
  "passed": boolean (true if score >= 70),
  "score": number,
  "issues": ["specific issue with quoted copy"],
  "suggestions": ["exact replacement or fix for each issue"],
  "tone_match": boolean,
  "audience_fit": boolean,
  "summary": "2-3 sentence overall assessment"
}`

    const result = await runAgent<BrandCheckResult>(SYSTEM, prompt, workspaceId)

    // Store the check result in the artifact's approval notes if it failed
    if (!result.passed) {
      const notes = `Brand Check (score: ${result.score}/100):\n${result.issues.join('\n')}`
      await sql`UPDATE approvals SET notes = ${notes}
                WHERE artifact_id = ${artifactId} AND status = 'pending'`
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Brand check error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
