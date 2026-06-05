/**
 * Scheduling Worker: Calendar Audit Agent
 * /api/agents/scheduling/audit
 *
 * POST { workspaceId, from?, to? }
 * Performs a deep audit of the publishing calendar and returns a health report
 * with streak analysis, gap detection, best-performing windows, and scored recommendations.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { auditPublishingCalendar } from '@/lib/agents/scheduling'
import type { BrandProfile } from '@/types'

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      from?: string
      to?: string
    }
    const { workspaceId, from, to } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Default to the past 30 days + next 30 days
    const rangeFrom = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const rangeTo = to ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Load all data in date range
    const [scheduledResult, publishedResult] = await Promise.all([
      sql`
        SELECT id, platform, content, scheduled_for, status, created_at
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND scheduled_for >= ${rangeFrom}
          AND scheduled_for <= ${rangeTo}
        ORDER BY scheduled_for ASC
        LIMIT 500
      `,
      sql`
        SELECT id, platform, published_at, title
        FROM published_content
        WHERE workspace_id = ${workspaceId}
          AND published_at >= ${rangeFrom}
          AND published_at <= ${rangeTo}
        ORDER BY published_at ASC
        LIMIT 500
      `,
    ])

    const scheduledPosts = scheduledResult.rows as Array<Record<string, unknown>>
    const publishedPosts = publishedResult.rows as Array<Record<string, unknown>>

    // Run the core AI audit
    const audit = await auditPublishingCalendar(brand, scheduledPosts, publishedPosts, { from: rangeFrom, to: rangeTo })

    // ── Additional computed metrics ─────────────────────────────────────────

    // 1. Longest publishing streak (consecutive days with at least one published post)
    const publishedDates = new Set(
      publishedPosts.map(p => new Date(String(p.published_at)).toISOString().slice(0, 10))
    )
    const sortedPublishedDates = [...publishedDates].sort()
    let longestStreak = 0
    let currentStreak = 0
    let prevDate: Date | null = null
    for (const d of sortedPublishedDates) {
      const curr = new Date(d)
      if (prevDate) {
        const diffDays = Math.round((curr.getTime() - prevDate.getTime()) / 86_400_000)
        if (diffDays === 1) {
          currentStreak++
        } else {
          longestStreak = Math.max(longestStreak, currentStreak)
          currentStreak = 1
        }
      } else {
        currentStreak = 1
      }
      prevDate = curr
    }
    longestStreak = Math.max(longestStreak, currentStreak)

    // 2. Longest gap (consecutive days without any published content in the past)
    const pastPublishedDates = sortedPublishedDates.filter(d => d <= new Date().toISOString().slice(0, 10))
    let longestGapDays = 0
    for (let i = 1; i < pastPublishedDates.length; i++) {
      const gap = Math.round(
        (new Date(pastPublishedDates[i]).getTime() - new Date(pastPublishedDates[i - 1]).getTime()) / 86_400_000
      ) - 1
      if (gap > longestGapDays) longestGapDays = gap
    }

    // 3. Best performing day of week (by post count — proxy since we don't have engagement data yet)
    const dayCount: Record<string, number> = {}
    for (const p of publishedPosts) {
      const dt = new Date(String(p.published_at))
      const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()]
      dayCount[day] = (dayCount[day] || 0) + 1
    }
    const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // 4. Best performing hour
    const hourCount: Record<string, number> = {}
    for (const p of publishedPosts) {
      const dt = new Date(String(p.published_at))
      const hour = String(dt.getHours()).padStart(2, '0') + ':00'
      hourCount[hour] = (hourCount[hour] || 0) + 1
    }
    const bestHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // 5. Platform consistency score — how evenly distributed are posts across active platforms?
    const activePlatforms = Array.isArray(brand.channels)
      ? brand.channels.map(c => String(c).toLowerCase())
      : ['instagram', 'linkedin']
    const platformCountsAll: Record<string, number> = {}
    for (const p of [...scheduledPosts, ...publishedPosts]) {
      const pl = String(p.platform || 'unknown').toLowerCase()
      platformCountsAll[pl] = (platformCountsAll[pl] || 0) + 1
    }
    const totalPosts = Object.values(platformCountsAll).reduce((a, b) => a + b, 0)
    const expectedPerPlatform = totalPosts / Math.max(activePlatforms.length, 1)
    const variance = activePlatforms.reduce((sum, p) => {
      const actual = platformCountsAll[p] || 0
      return sum + Math.pow(actual - expectedPerPlatform, 2)
    }, 0)
    const platformConsistencyScore = totalPosts > 0
      ? Math.max(0, Math.round(100 - (Math.sqrt(variance / activePlatforms.length) / Math.max(expectedPerPlatform, 1)) * 100))
      : 0

    // Save audit artifact
    const artifactId = newId()
    const title = `Schedule Audit — ${brand.business_name} — ${new Date().toISOString().slice(0, 10)}`
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (
        ${artifactId}, ${workspaceId}, ${null},
        'schedule_audit',
        ${title},
        ${JSON.stringify({
          audit,
          dateRange: { from: rangeFrom, to: rangeTo },
          extendedMetrics: {
            longestPublishingStreak: longestStreak,
            longestGapDays,
            bestPerformingDay: bestDay,
            bestPerformingHour: bestHour,
            platformConsistencyScore,
          },
          generatedAt: new Date().toISOString(),
        })}
      )
    `

    return NextResponse.json({
      ok: true,
      audit,
      extendedMetrics: {
        longestPublishingStreak: longestStreak,
        longestGapDays,
        bestPerformingDay: bestDay,
        bestPerformingHour: bestHour,
        platformConsistencyScore,
      },
      dateRange: { from: rangeFrom, to: rangeTo },
      dataPoints: {
        scheduledPosts: scheduledPosts.length,
        publishedPosts: publishedPosts.length,
      },
      artifactId,
    })
  } catch (error) {
    console.error('Audit worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET — Return most recent audit artifact ──────────────────────────────────

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
        AND type = 'schedule_audit'
      ORDER BY created_at DESC
      LIMIT 5
    `

    return NextResponse.json({
      ok: true,
      audits: result.rows.map(r => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        overallScore: (r.content_json as Record<string, Record<string, unknown>>)?.audit?.overallScore ?? null,
      })),
    })
  } catch (error) {
    console.error('Audit GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
