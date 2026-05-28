/**
 * Branding Worker: Color Palette Generator
 * POST { workspaceId, style?, industry?, mood? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { generateColorPalette } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      style?: string
      industry?: string
      mood?: string
    }
    const { workspaceId, style, industry, mood } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Enrich brand context with any caller-provided overrides
    const enrichedBrand: BrandProfile = {
      ...brand,
      industry: industry || brand.industry,
      tone: mood ? `${brand.tone}, ${mood}` : brand.tone,
    }

    const palette = await generateColorPalette(enrichedBrand, style)

    // Compute WCAG contrast ratios for the main combinations (approximate luminance)
    function hexToRelativeLuminance(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16) / 255
      const g = parseInt(hex.slice(3, 5), 16) / 255
      const b = parseInt(hex.slice(5, 7), 16) / 255
      const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    }
    function contrastRatio(hex1: string, hex2: string): string {
      try {
        const l1 = hexToRelativeLuminance(hex1)
        const l2 = hexToRelativeLuminance(hex2)
        const lighter = Math.max(l1, l2)
        const darker = Math.min(l1, l2)
        const ratio = (lighter + 0.05) / (darker + 0.05)
        return `${ratio.toFixed(1)}:1`
      } catch {
        return 'N/A'
      }
    }

    const textDark = palette.neutrals?.[0]?.hex || '#111111'
    const textLight = palette.neutrals?.[3]?.hex || '#ffffff'

    const accessibilityChecks = [
      {
        pair: `Dark text on primary bg`,
        foreground: textDark,
        background: palette.primary.hex,
        ratio: contrastRatio(textDark, palette.primary.hex),
      },
      {
        pair: `Light text on primary bg`,
        foreground: textLight,
        background: palette.primary.hex,
        ratio: contrastRatio(textLight, palette.primary.hex),
      },
      {
        pair: `Primary on white`,
        foreground: palette.primary.hex,
        background: '#ffffff',
        ratio: contrastRatio(palette.primary.hex, '#ffffff'),
      },
      {
        pair: `Accent on white`,
        foreground: palette.accent.hex,
        background: '#ffffff',
        ratio: contrastRatio(palette.accent.hex, '#ffffff'),
      },
    ]

    // Save artifact
    const artifactId = newId()
    const contentJson = { ...palette, accessibilityChecks }
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_colors',
        ${'Color Palette — ' + brand.business_name},
        ${JSON.stringify(contentJson)}
      )
    `

    return NextResponse.json({ ok: true, artifactId, palette: contentJson })
  } catch (error) {
    console.error('Color palette worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
