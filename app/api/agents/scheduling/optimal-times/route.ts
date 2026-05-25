/**
 * Scheduling Worker: Optimal Time Analyzer
 * /api/agents/scheduling/optimal-times
 *
 * POST { workspaceId, platforms?, audienceLocation?, contentType? }
 * GET  ?workspaceId=xxx  — Returns most recent optimal_times artifact if exists
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { analyzeOptimalTimes } from '@/lib/agents/scheduling'
import type { BrandProfile } from '@/types'

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      platforms?: string[]
      audienceLocation?: string
      contentType?: string
    }
    const { workspaceId, platforms = [], audienceLocation, contentType } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load brand profile
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Load publishing history for pattern context (up to 200 recent posts)
    const historyResult = await sql`
      SELECT platform, published_at
      FROM published_content
      WHERE workspace_id = ${workspaceId}
      ORDER BY published_at DESC
      LIMIT 200
    `

    // Compute per-platform historical posting patterns
    const platformHistory: Record<string, { totalPosts: number; dayDistribution: Record<string, number>; hourDistribution: Record<string, number> }> = {}
    for (const row of historyResult.rows) {
      const p = String(row.platform || 'unknown').toLowerCase()
      const dt = new Date(String(row.published_at))
      if (isNaN(dt.getTime())) continue

      if (!platformHistory[p]) {
        platformHistory[p] = { totalPosts: 0, dayDistribution: {}, hourDistribution: {} }
      }
      platformHistory[p].totalPosts++

      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()]
      platformHistory[p].dayDistribution[dayName] = (platformHistory[p].dayDistribution[dayName] || 0) + 1

      const hour = String(dt.getHours()).padStart(2, '0') + ':00'
      platformHistory[p].hourDistribution[hour] = (platformHistory[p].hourDistribution[hour] || 0) + 1
    }

    // Resolve platforms — fallback to brand channels
    const resolvedPlatforms = platforms.length > 0
      ? platforms
      : (Array.isArray(brand.channels) ? brand.channels : ['instagram', 'linkedin'])

    // Augment audience location with content type context
    const audienceContext = [
      audienceLocation,
      contentType ? `Primary content type: ${contentType}` : null,
      Object.keys(platformHistory).length > 0
        ? `Historical publishing data available for: ${Object.keys(platformHistory).join(', ')}`
        : null,
    ].filter(Boolean).join(' | ')

    const slots = await analyzeOptimalTimes(brand, resolvedPlatforms, audienceContext || undefined)

    // Save artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (
        ${artifactId}, ${workspaceId}, ${null},
        'optimal_times',
        ${'Optimal Posting Times — ' + brand.business_name},
        ${JSON.stringify({
          slots,
          platforms: resolvedPlatforms,
          audienceLocation,
          contentType,
          platformHistory,
          generatedAt: new Date().toISOString(),
        })}
      )
    `

    // Group slots by platform for easy consumption
    const slotsByPlatform: Record<string, typeof slots> = {}
    for (const slot of slots) {
      if (!slotsByPlatform[slot.platform]) slotsByPlatform[slot.platform] = []
      slotsByPlatform[slot.platform].push(slot)
    }

    return NextResponse.json({
      ok: true,
      slots,
      slotsByPlatform,
      artifactId,
      platformsAnalyzed: resolvedPlatforms,
      historicalDataPoints: historyResult.rows.length,
    })
  } catch (error) {
    console.error('Optimal times worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET — Return saved optimal times artifact ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const result = await sql`
      SELECT id, title, content_json, created_at
      FROM artifacts
      WHERE workspace_id = ${workspaceId}
        AND type = 'optimal_times'
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ ok: true, artifact: null, message: 'No optimal times analysis found. Run POST to generate one.' })
    }

    const artifact = result.rows[0]
    return NextResponse.json({
      ok: true,
      artifact: {
        id: artifact.id,
        title: artifact.title,
        createdAt: artifact.created_at,
        ...(artifact.content_json as Record<string, unknown>),
      },
    })
  } catch (error) {
    console.error('Optimal times GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
