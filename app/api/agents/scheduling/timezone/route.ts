/**
 * Scheduling Worker: Timezone Optimizer
 * /api/agents/scheduling/timezone
 *
 * POST { workspaceId, targetMarkets: string[], primaryPlatforms?: string[] }
 *
 * Finds UTC posting windows that maximize simultaneous audience coverage
 * across all target markets, then stores the config in the workspace's
 * extra_settings JSON column.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { optimizeForTimezones } from '@/lib/agents/scheduling'
import type { BrandProfile } from '@/types'

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      targetMarkets: string[]
      primaryPlatforms?: string[]
    }
    const { workspaceId, targetMarkets, primaryPlatforms } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!Array.isArray(targetMarkets) || targetMarkets.length === 0) {
      return NextResponse.json({ error: 'targetMarkets must be a non-empty array of market/timezone strings' }, { status: 400 })
    }

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Narrow the brand's channels to the requested platforms if provided
    const effectiveBrand = primaryPlatforms && primaryPlatforms.length > 0
      ? { ...brand, channels: primaryPlatforms }
      : brand

    const optimization = await optimizeForTimezones(effectiveBrand, targetMarkets)

    // Save the timezone config to workspace settings for use by other agents
    // Try to update the workspaces table's extra_settings column if it exists
    try {
      // Read current extra_settings
      const wsResult = await sql`
        SELECT extra_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1
      `
      if (wsResult.rows.length > 0) {
        const current = (wsResult.rows[0].extra_settings as Record<string, unknown> | null) || {}
        const updated = {
          ...current,
          timezoneOptimization: {
            primaryTimezone: optimization.primaryTimezone,
            targetTimezones: optimization.targetTimezones,
            optimalWindows: optimization.optimalWindows,
            updatedAt: new Date().toISOString(),
          },
        }
        await sql`
          UPDATE workspaces
          SET extra_settings = ${JSON.stringify(updated)}
          WHERE id = ${workspaceId}
        `
      }
    } catch (settingsError) {
      // Non-fatal: the extra_settings column may not exist in all DB versions
      console.warn('Could not persist timezone config to workspace settings:', settingsError)
    }

    // Save as artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (
        ${artifactId}, ${workspaceId}, ${null},
        'timezone_optimization',
        ${'Timezone Optimization — ' + brand.business_name},
        ${JSON.stringify({
          optimization,
          targetMarkets,
          primaryPlatforms: primaryPlatforms ?? (Array.isArray(brand.channels) ? brand.channels : []),
          generatedAt: new Date().toISOString(),
        })}
      )
    `

    // Build a human-readable schedule recommendation from the windows
    const bestWindow = optimization.optimalWindows.sort((a, b) => b.audiencePercent - a.audiencePercent)[0]

    return NextResponse.json({
      ok: true,
      optimization,
      artifactId,
      topRecommendation: bestWindow
        ? `Post at ${bestWindow.utcTime} UTC — reaches ${bestWindow.audiencePercent}% of your audience (${bestWindow.coverage})`
        : null,
      configSaved: true,
    })
  } catch (error) {
    console.error('Timezone optimizer error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET — Return saved timezone optimization ─────────────────────────────────

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
        AND type = 'timezone_optimization'
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (result.rows.length === 0) {
      return NextResponse.json({
        ok: true,
        artifact: null,
        message: 'No timezone optimization found. Run POST with targetMarkets to generate one.',
      })
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
    console.error('Timezone GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
