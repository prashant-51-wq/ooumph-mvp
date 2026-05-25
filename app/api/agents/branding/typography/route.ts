/**
 * Branding Worker: Typography System
 * POST { workspaceId, style? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { generateTypographySystem } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string; style?: string }
    const { workspaceId } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, colorsResult, identityResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_colors' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_identity' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Build color context from colors artifact or identity
    type ColorContext = Parameters<typeof generateTypographySystem>[1]
    let colorContext: ColorContext | undefined

    const colorsData = colorsResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const identityData = identityResult.rows[0]?.content_json as Record<string, unknown> | undefined

    if (colorsData?.primary) {
      colorContext = {
        primary: colorsData.primary as { hex: string },
        neutrals: Array.isArray(colorsData.neutrals) ? colorsData.neutrals as Array<{ hex: string; name: string }> : undefined,
      }
    } else if (identityData?.colorPalette) {
      const cp = identityData.colorPalette as Record<string, { hex: string; name: string }>
      colorContext = {
        primary: cp.primary,
        neutrals: [cp.neutral, cp.background].filter(Boolean) as Array<{ hex: string; name: string }>,
      }
    }

    const typography = await generateTypographySystem(brand, colorContext)

    // Build the HTML <link> tag for easy inclusion in pages
    const allGoogleUrls = [
      typography.heading.googleUrl,
      typography.body.googleUrl,
      typography.accent.googleUrl,
    ].filter((url, idx, arr) => url && arr.indexOf(url) === idx)

    const linkTags = allGoogleUrls.map(url => `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${url}" rel="stylesheet">`).join('\n')

    const contentJson = {
      ...typography,
      linkTags,
      typeSpecimen: {
        heading: `${typography.heading.font} — ${typography.heading.weight} — Heading font`,
        body: `${typography.body.font} — ${typography.body.weight} — Body text that reads beautifully at any size`,
        accent: `${typography.accent.font} — ${typography.accent.weight} — ACCENT & LABEL TEXT`,
      },
    }

    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_typography',
        ${'Typography System — ' + brand.business_name},
        ${JSON.stringify(contentJson)}
      )
    `

    return NextResponse.json({ ok: true, artifactId, typography: contentJson })
  } catch (error) {
    console.error('Typography worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
