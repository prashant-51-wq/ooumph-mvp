/**
 * Branding Worker: Mission / Vision / Values Generator
 * POST { workspaceId, regenerate? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { generateMVV } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      regenerate?: boolean
    }
    const { workspaceId, regenerate = false } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Return cached version if not regenerating
    if (!regenerate) {
      const existing = await sql`
        SELECT id, content_json FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'brand_mvv'
        ORDER BY created_at DESC LIMIT 1
      `
      if (existing.rows[0]) {
        const cached = existing.rows[0].content_json as Record<string, unknown>
        return NextResponse.json({
          ok: true,
          artifactId: existing.rows[0].id,
          cached: true,
          mission:  cached.mission,
          vision:   cached.vision,
          values:   cached.values,
          purpose:  cached.purpose,
        })
      }
    }

    const mvv = await generateMVV(brand)

    // Save as artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_mvv',
        ${'Mission / Vision / Values — ' + brand.business_name},
        ${JSON.stringify(mvv)}
      )
    `

    // Store in brand_profiles.extra_settings JSON field
    // Falls back gracefully if column doesn't exist or is a different type
    await sql`
      UPDATE brand_profiles
      SET extra_settings = COALESCE(extra_settings::jsonb, '{}'::jsonb) || ${JSON.stringify({
        mission: mvv.mission,
        vision:  mvv.vision,
        purpose: mvv.purpose,
        values:  mvv.values.map((v: { name: string }) => v.name),
      })}::jsonb
      WHERE workspace_id = ${workspaceId}
    `.catch(() => {/* non-fatal if column absent or wrong type */})

    // Also try updating the mission column directly if it exists
    await sql`
      UPDATE brand_profiles
      SET mission = ${mvv.mission}
      WHERE workspace_id = ${workspaceId}
    `.catch(() => {/* non-fatal */})

    return NextResponse.json({
      ok: true,
      artifactId,
      mission:  mvv.mission,
      vision:   mvv.vision,
      values:   mvv.values,
      purpose:  mvv.purpose,
    })
  } catch (error) {
    console.error('MVV generator worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
