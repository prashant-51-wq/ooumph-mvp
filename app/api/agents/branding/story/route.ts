/**
 * Branding Worker: Brand Story Generator
 * POST { workspaceId, format?: 'full'|'elevator'|'press'|'hero' }
 *
 * format defaults to 'full' which returns all story formats.
 * Specific format modes return only that format's text.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { generateBrandStory } from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      format?: 'full' | 'elevator' | 'press' | 'hero'
    }
    const { workspaceId, format = 'full' } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const story = await generateBrandStory(brand)

    // Save as artifact (full story always saved)
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json)
      VALUES (
        ${artifactId},
        ${workspaceId},
        'brand_story',
        ${'Brand Story — ' + brand.business_name},
        ${JSON.stringify(story)}
      )
    `

    // Return the requested format
    if (format === 'elevator') {
      return NextResponse.json({ ok: true, artifactId, format: 'elevator', text: story.elevatorPitch, story })
    }
    if (format === 'press') {
      return NextResponse.json({ ok: true, artifactId, format: 'press', text: story.pressParagraph, story })
    }
    if (format === 'hero') {
      return NextResponse.json({ ok: true, artifactId, format: 'hero', text: story.heroNarrative, story })
    }

    // Full — return all
    return NextResponse.json({ ok: true, artifactId, story })
  } catch (error) {
    console.error('Brand story worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
