/**
 * Branding Worker: Tagline Generator
 * POST { workspaceId, count?, angles? }
 *
 * angles: ['functional','emotional','aspirational','contrarian','question','rhyme','alliteration']
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { generateTaglines } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

const ALLOWED_ANGLES = ['functional', 'emotional', 'aspirational', 'contrarian', 'question', 'rhyme', 'alliteration'] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      count?: number
      angles?: string[]
    }
    const { workspaceId, count = 10, angles } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // If specific angles were requested, generate angle-focused taglines
    let taglines
    if (angles && angles.length > 0) {
      const validAngles = angles.filter(a => (ALLOWED_ANGLES as readonly string[]).includes(a))
      if (validAngles.length > 0) {
        // Use runAgent directly to focus on specific angles
        const TAGLINE_SYSTEM = `You are a world-class copywriter who specialises in brand taglines. You create memorable, punchy, differentiated taglines. Respond ONLY with valid JSON.`
        taglines = await runAgent<import('@/lib/agents/branding').TaglineOptions>(
          TAGLINE_SYSTEM,
          `Generate ${count} taglines for this brand, focusing specifically on these angles: ${validAngles.join(', ')}.

Business: ${brand.business_name}
Industry: ${brand.industry || ''}
Offer: ${brand.offer || ''}
Audience: ${brand.target_audience || ''}
Tone: ${brand.tone || ''}
UVP: ${brand.unique_value || brand.unique_value_prop || ''}
Existing tagline: ${brand.tagline || '(none)'}

Every tagline must be under 8 words. Make each one feel different — vary the rhythm, approach, and emotional register.

Return JSON:
{
  "primary": "the single best tagline",
  "alternatives": ["tagline2", "tagline3", "..."],
  "taglineWithRationale": [
    {
      "tagline": "text",
      "angle": "which angle from [${validAngles.join(', ')}]",
      "targetEmotion": "the emotion this evokes",
      "whenToUse": "best context for this tagline"
    }
  ],
  "seoVersion": "longer SEO-optimised version",
  "shortForm": "1-3 words only"
}`,
        )
      } else {
        taglines = await generateTaglines(brand, count)
      }
    } else {
      taglines = await generateTaglines(brand, count)
    }

    const artifactId = newId()
    const contentJson = {
      ...taglines,
      businessName: brand.business_name,
      requestedAngles: angles || ALLOWED_ANGLES,
      generatedCount: count,
    }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_taglines',
        ${'Taglines — ' + brand.business_name},
        ${JSON.stringify(contentJson)}
      )
    `

    return NextResponse.json({ ok: true, artifactId, taglines: contentJson })
  } catch (error) {
    console.error('Tagline generator worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
