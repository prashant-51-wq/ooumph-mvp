/**
 * Branding Supervisor Agent
 * POST { workspaceId, mode, ...modeArgs }
 *
 * modes:
 *   full_identity      — { workspaceId, style? }
 *   voice_guide        — { workspaceId }
 *   visual_guide       — { workspaceId }
 *   check_consistency  — { workspaceId, content: string }
 *   brand_story        — { workspaceId }
 *   taglines           — { workspaceId, count? }
 *   mvv                — { workspaceId }
 *   color_palette      — { workspaceId, style? }
 *   typography         — { workspaceId }
 *
 * GET ?workspaceId=  — Returns all branding artifacts for workspace
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import {
  generateFullBrandIdentity,
  generateBrandVoiceGuide,
  generateVisualGuide,
  checkBrandConsistency,
  generateBrandStory,
  generateTaglines,
  generateMVV,
  generateColorPalette,
  generateTypographySystem,
  type BrandIdentity,
} from '@/lib/agents/branding'
import type { BrandProfile } from '@/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getBrand(workspaceId: string): Promise<BrandProfile | null> {
  const r = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
  return (r.rows[0] as unknown as BrandProfile) || null
}

async function getArtifact(workspaceId: string, type: string): Promise<Record<string, unknown> | null> {
  const r = await sql`
    SELECT content_json FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = ${type}
    ORDER BY created_at DESC LIMIT 1
  `
  return (r.rows[0]?.content_json as Record<string, unknown>) || null
}

async function saveArtifact(
  workspaceId: string,
  type: string,
  title: string,
  contentJson: Record<string, unknown>,
): Promise<string> {
  const artifactId = newId()
  await sql`
    INSERT INTO artifacts (id, workspace_id, type, title, content_json)
    VALUES (${artifactId}, ${workspaceId}, ${type}, ${title}, ${JSON.stringify(contentJson)})
    ON CONFLICT DO NOTHING
  `
  return artifactId
}

// Fire-and-forget logo concept image generation
function triggerLogoGeneration(workspaceId: string, dallEPrompt: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  fetch(`${appUrl}/api/agents/branding/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, concept: dallEPrompt }),
  }).catch((e) => console.error('Logo generation fire-and-forget failed:', e))
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: string
      style?: string
      content?: string
      count?: number
    }
    const { workspaceId, mode } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!mode)        return NextResponse.json({ error: 'mode required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brand = await getBrand(workspaceId)
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── full_identity ─────────────────────────────────────────────────────────
    if (mode === 'full_identity') {
      const style = body.style as Parameters<typeof generateFullBrandIdentity>[1] | undefined
      const identity = await generateFullBrandIdentity(brand, style)

      // Update brand_profiles with new tagline + tone
      await sql`
        UPDATE brand_profiles
        SET tagline = ${identity.tagline}
        WHERE workspace_id = ${workspaceId}
      `.catch(() => {/* non-fatal if column missing */})

      const artifactId = await saveArtifact(
        workspaceId,
        'brand_identity',
        `Brand Identity — ${brand.business_name}`,
        identity as unknown as Record<string, unknown>,
      )

      // Fire-and-forget DALL-E logo generation
      triggerLogoGeneration(workspaceId, identity.logoDirection.dallEPrompt)

      return NextResponse.json({ ok: true, artifactId, identity })
    }

    // ── voice_guide ───────────────────────────────────────────────────────────
    if (mode === 'voice_guide') {
      const guide = await generateBrandVoiceGuide(brand)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_voice_guide',
        `Brand Voice Guide — ${brand.business_name}`,
        guide as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, guide })
    }

    // ── visual_guide ──────────────────────────────────────────────────────────
    if (mode === 'visual_guide') {
      const identityData = await getArtifact(workspaceId, 'brand_identity')
      const guide = await generateVisualGuide(brand, identityData as unknown as BrandIdentity | undefined)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_visual_guide',
        `Visual Brand Guidelines — ${brand.business_name}`,
        guide as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, guide })
    }

    // ── check_consistency ─────────────────────────────────────────────────────
    if (mode === 'check_consistency') {
      const content = body.content
      if (!content) return NextResponse.json({ error: 'content required for check_consistency mode' }, { status: 400 })
      const report = await checkBrandConsistency(brand, content)
      return NextResponse.json({ ok: true, report })
    }

    // ── brand_story ───────────────────────────────────────────────────────────
    if (mode === 'brand_story') {
      const story = await generateBrandStory(brand)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_story',
        `Brand Story — ${brand.business_name}`,
        story as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, story })
    }

    // ── taglines ──────────────────────────────────────────────────────────────
    if (mode === 'taglines') {
      const taglines = await generateTaglines(brand, body.count || 10)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_taglines',
        `Taglines — ${brand.business_name}`,
        taglines as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, taglines })
    }

    // ── mvv ───────────────────────────────────────────────────────────────────
    if (mode === 'mvv') {
      const mvv = await generateMVV(brand)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_mvv',
        `Mission / Vision / Values — ${brand.business_name}`,
        mvv as unknown as Record<string, unknown>,
      )
      // Store in brand_profiles.extra_settings JSON field
      try {
        await sql`
          UPDATE brand_profiles
          SET extra_settings = COALESCE(extra_settings::jsonb, '{}'::jsonb) || ${JSON.stringify({ mvv })}::jsonb
          WHERE workspace_id = ${workspaceId}
        `
      } catch { /* non-fatal if extra_settings column absent */ }
      return NextResponse.json({ ok: true, artifactId, ...mvv })
    }

    // ── color_palette ─────────────────────────────────────────────────────────
    if (mode === 'color_palette') {
      const palette = await generateColorPalette(brand, body.style)
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_colors',
        `Color Palette — ${brand.business_name}`,
        palette as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, palette })
    }

    // ── typography ────────────────────────────────────────────────────────────
    if (mode === 'typography') {
      const colorData = await getArtifact(workspaceId, 'brand_colors')
      const typography = await generateTypographySystem(
        brand,
        colorData as Parameters<typeof generateTypographySystem>[1] | undefined,
      )
      const artifactId = await saveArtifact(
        workspaceId,
        'brand_typography',
        `Typography System — ${brand.business_name}`,
        typography as unknown as Record<string, unknown>,
      )
      return NextResponse.json({ ok: true, artifactId, typography })
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 })
  } catch (error) {
    console.error('Branding supervisor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const brandingTypes = [
    'brand_identity', 'brand_voice_guide', 'brand_visual_guide',
    'brand_story', 'brand_taglines', 'brand_mvv', 'brand_colors',
    'brand_typography', 'logo_concept',
  ]

  const result = await sql`
    SELECT id, type, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId}
      AND type = ANY(${brandingTypes}::text[])
    ORDER BY created_at DESC
    LIMIT 50
  `
  return NextResponse.json(result.rows)
}
