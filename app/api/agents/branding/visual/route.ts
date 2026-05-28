/**
 * Branding Worker: Visual Brand Guidelines
 * POST { workspaceId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { generateVisualGuide, type BrandIdentity } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string }
    const { workspaceId } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const [brandResult, identityResult, colorsResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_identity' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'brand_colors' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Merge color palette into identity context if identity not present but colors exist
    let identity = identityResult.rows[0]?.content_json as BrandIdentity | undefined
    if (!identity && colorsResult.rows[0]?.content_json) {
      const colors = colorsResult.rows[0].content_json as Record<string, unknown>
      identity = {
        colorPalette: {
          primary:    colors.primary,
          secondary:  colors.secondary,
          accent:     colors.accent,
          neutral:    Array.isArray(colors.neutrals) ? colors.neutrals[0] : { hex: '#4a4a4a', name: 'Dark Gray' },
          background: Array.isArray(colors.neutrals) && colors.neutrals.length > 3 ? colors.neutrals[3] : { hex: '#fafafa', name: 'Off White' },
        },
      } as unknown as BrandIdentity
    }

    const guide = await generateVisualGuide(brand, identity)

    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_visual_guide',
        ${'Visual Brand Guidelines — ' + brand.business_name},
        ${JSON.stringify(guide)}
      )
    `

    return NextResponse.json({ ok: true, artifactId, guide })
  } catch (error) {
    console.error('Visual guide worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
