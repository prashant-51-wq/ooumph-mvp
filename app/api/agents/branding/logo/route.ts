/**
 * Branding Worker: Logo Concept Generator (DALL-E 3)
 * POST { workspaceId, style?, concept? }
 *
 * If OPENAI_API_KEY is not set, returns the DALL-E prompt so the user
 * can run it manually — no error thrown.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'
import type { BrandIdentity } from '@/lib/agents/branding'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      style?: string
      concept?: string
    }
    const { workspaceId, style, concept } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, identityResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_identity' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const identity = identityResult.rows[0]?.content_json as BrandIdentity | undefined

    // Determine DALL-E prompt
    let dallEPrompt: string
    if (concept) {
      dallEPrompt = concept
    } else if (identity?.logoDirection?.dallEPrompt) {
      dallEPrompt = identity.logoDirection.dallEPrompt
    } else {
      // Build a prompt from raw brand data
      const colors = identity?.colorPalette
        ? `using ${identity.colorPalette.primary.name} (${identity.colorPalette.primary.hex}) and ${identity.colorPalette.secondary.name} (${identity.colorPalette.secondary.hex})`
        : 'with professional brand colors'
      dallEPrompt = `A minimalist, modern logo concept for ${brand.business_name}, a ${brand.industry || 'technology'} company. ${colors}. The logo should feel ${brand.tone || 'professional and trustworthy'}. Clean geometric shapes, no text, vector style, white background, suitable for business cards and digital use. The design communicates ${brand.unique_value || 'innovation and reliability'}.`
    }

    const finalPrompt = `Professional brand logo concept: ${dallEPrompt}. Clean, vector-style, white background, suitable for business use, scalable mark, no photographic elements.`

    // Check if OPENAI_API_KEY is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok: false,
        error: 'Configure OPENAI_API_KEY to generate logo images automatically.',
        dallEPrompt: finalPrompt,
        instructions: 'Copy the dallEPrompt and paste it into DALL-E 3 at https://labs.openai.com to generate your logo concept.',
      })
    }

    // Call DALL-E 3 via lib/tools/openai (raw fetch, no SDK dependency)
    const { generateImage } = await import('@/lib/tools/openai')
    const generated = await generateImage(finalPrompt, { size: '1024x1024', quality: 'hd', style: 'natural' })

    const imageUrl = generated?.url
    if (!imageUrl) {
      return NextResponse.json({ error: 'DALL-E returned no image. Check OPENAI_API_KEY is valid.' }, { status: 500 })
    }

    const response = { data: [{ url: imageUrl, revised_prompt: generated?.revisedPrompt }] }

    // Store as artifact
    const artifactId = newId()
    const contentJson = {
      imageUrl,
      dallEPrompt: finalPrompt,
      style: style || identity?.logoDirection?.style || 'combination',
      businessName: brand.business_name,
      revisedPrompt: response.data[0]?.revised_prompt,
    }

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'logo_concept',
        ${'Logo Concept — ' + brand.business_name},
        ${JSON.stringify(contentJson)}
      )
    `

    // Also store in media_assets if the table exists
    await sql`
      INSERT INTO media_assets (id, workspace_id, type, url, title, metadata_json, created_at)
      VALUES (
        ${newId()},
        ${workspaceId},
        'logo_concept',
        ${imageUrl},
        ${'Logo Concept — ' + brand.business_name},
        ${JSON.stringify({ artifactId, prompt: finalPrompt })},
        ${new Date().toISOString()}
      )
    `.catch(() => {/* non-fatal if table absent */})

    return NextResponse.json({ ok: true, imageUrl, artifactId, prompt: finalPrompt })
  } catch (error) {
    console.error('Logo generation worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
