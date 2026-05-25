/**
 * Branding Worker: Full Brand Identity Builder
 * POST { workspaceId, style?, regenerate? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { generateFullBrandIdentity } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      style?: 'corporate' | 'startup' | 'luxury' | 'playful' | 'minimal' | 'bold'
      regenerate?: boolean
    }
    const { workspaceId, style, regenerate } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Check for existing identity if not regenerating
    if (!regenerate) {
      const existing = await sql`
        SELECT id, content_json FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'brand_identity'
        ORDER BY created_at DESC LIMIT 1
      `
      if (existing.rows[0]) {
        return NextResponse.json({
          ok: true,
          artifactId: existing.rows[0].id,
          identity: existing.rows[0].content_json,
          cached: true,
        })
      }
    }

    const identity = await generateFullBrandIdentity(brand, style)

    // Update brand_profiles with tagline from new identity
    await sql`
      UPDATE brand_profiles
      SET tagline = ${identity.tagline}
      WHERE workspace_id = ${workspaceId}
    `.catch(() => {/* non-fatal */})

    // Save artifact (upsert by deleting old if regenerating)
    if (regenerate) {
      await sql`
        DELETE FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'brand_identity'
      `.catch(() => {})
    }

    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_identity',
        ${'Brand Identity — ' + brand.business_name},
        ${JSON.stringify(identity)}
      )
    `

    // Fire-and-forget logo concept generation via DALL-E
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/agents/branding/logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        concept: identity.logoDirection.dallEPrompt,
      }),
    }).catch((e) => console.error('Logo generation trigger failed:', e))

    return NextResponse.json({ ok: true, artifactId, identity })
  } catch (error) {
    console.error('Brand identity worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
