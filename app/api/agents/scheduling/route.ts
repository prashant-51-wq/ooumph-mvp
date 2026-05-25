/**
 * Scheduling Supervisor — /api/agents/scheduling
 *
 * POST { workspaceId, mode, ...modeParams }
 *
 * Modes:
 *   optimal_times    — { workspaceId, platforms?, audienceLocation? }
 *   audit_calendar   — { workspaceId, dateRange?: { from, to } }
 *   auto_schedule    — { workspaceId, contentItems: [{platform, content, type?}], startDate? }
 *   recurring_plan   — { workspaceId, platforms?, postsPerWeek?, contentMix? }
 *   detect_conflicts — { workspaceId }
 *   timezone_optimize — { workspaceId, targetMarkets?: string[] }
 *
 * GET ?workspaceId=xxx  — Scheduling overview: pending counts by platform + next 7 days
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'
import {
  analyzeOptimalTimes,
  auditPublishingCalendar,
  autoScheduleBatch,
  buildRecurringSchedule,
  detectSchedulingConflicts,
  optimizeForTimezones,
} from '@/lib/agents/scheduling'

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'optimal_times' | 'audit_calendar' | 'auto_schedule' | 'recurring_plan' | 'detect_conflicts' | 'timezone_optimize'
      // optimal_times
      platforms?: string[]
      audienceLocation?: string
      // audit_calendar
      dateRange?: { from: string; to: string }
      // auto_schedule
      contentItems?: Array<{ platform: string; content: string; type?: string }>
      startDate?: string
      // recurring_plan
      postsPerWeek?: number
      contentMix?: Record<string, number>
      // timezone_optimize
      targetMarkets?: string[]
    }

    const { workspaceId, mode } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!mode) return NextResponse.json({ error: 'mode required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load brand profile — required for all modes
    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── optimal_times ─────────────────────────────────────────────────────────
    if (mode === 'optimal_times') {
      const { platforms = [], audienceLocation } = body

      // Load last 30 days of published content for historical context
      const publishedResult = await sql`
        SELECT platform, published_at
        FROM published_content
        WHERE workspace_id = ${workspaceId}
        ORDER BY published_at DESC
        LIMIT 200
      `

      const slots = await analyzeOptimalTimes(brand, platforms, audienceLocation)

      // Save as artifact
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
        VALUES (
          ${artifactId}, ${workspaceId}, ${null},
          'optimal_times',
          ${'Optimal Posting Times — ' + brand.business_name},
          ${JSON.stringify({
            slots,
            platforms,
            audienceLocation,
            publishedCount: publishedResult.rows.length,
            generatedAt: new Date().toISOString(),
          })}
        )
      `

      return NextResponse.json({ ok: true, slots, artifactId, platformsAnalyzed: slots.map(s => s.platform) })
    }

    // ── audit_calendar ────────────────────────────────────────────────────────
    if (mode === 'audit_calendar') {
      const { dateRange } = body
      const from = dateRange?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const to = dateRange?.to ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const [scheduledResult, publishedResult] = await Promise.all([
        sql`
          SELECT id, platform, content, scheduled_for, status, created_at
          FROM scheduled_content
          WHERE workspace_id = ${workspaceId}
            AND scheduled_for >= ${from}
            AND scheduled_for <= ${to}
          ORDER BY scheduled_for ASC
          LIMIT 500
        `,
        sql`
          SELECT id, platform, published_at, title
          FROM published_content
          WHERE workspace_id = ${workspaceId}
            AND published_at >= ${from}
            AND published_at <= ${to}
          ORDER BY published_at DESC
          LIMIT 200
        `,
      ])

      const audit = await auditPublishingCalendar(
        brand,
        scheduledResult.rows as Array<Record<string, unknown>>,
        publishedResult.rows as Array<Record<string, unknown>>,
        { from, to },
      )

      // Save audit artifact
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
        VALUES (
          ${artifactId}, ${workspaceId}, ${null},
          'schedule_audit',
          ${'Schedule Audit — ' + brand.business_name + ' — ' + new Date().toISOString().slice(0, 10)},
          ${JSON.stringify({ audit, dateRange: { from, to }, generatedAt: new Date().toISOString() })}
        )
      `

      return NextResponse.json({ ok: true, audit, artifactId })
    }

    // ── auto_schedule ─────────────────────────────────────────────────────────
    if (mode === 'auto_schedule') {
      const { contentItems = [], startDate } = body

      if (!Array.isArray(contentItems) || contentItems.length === 0) {
        return NextResponse.json({ error: 'contentItems must be a non-empty array' }, { status: 400 })
      }
      if (contentItems.length > 50) {
        return NextResponse.json({ error: 'Maximum 50 content items per auto_schedule call' }, { status: 400 })
      }
      for (const item of contentItems) {
        if (!item.platform || !item.content) {
          return NextResponse.json(
            { error: 'Each contentItem requires platform and content' },
            { status: 400 },
          )
        }
      }

      const resolvedStart = startDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const platforms = [...new Set(contentItems.map(i => i.platform))]

      const batch = await autoScheduleBatch(brand, contentItems, resolvedStart, platforms)

      // Validate all scheduledFor values are valid future dates
      const now = Date.now()
      const insertedIds: string[] = []
      const insertedPosts: Array<typeof batch.posts[0] & { id: string }> = []

      for (const post of batch.posts) {
        const ts = new Date(post.scheduledFor).getTime()
        if (isNaN(ts)) {
          console.warn('Scheduling agent returned invalid date for post, skipping:', post.scheduledFor)
          continue
        }

        // If the AI-generated time is in the past, push it forward by 24h
        const scheduledFor = ts <= now
          ? new Date(now + 24 * 60 * 60 * 1000).toISOString()
          : post.scheduledFor

        const id = newId()
        await sql`
          INSERT INTO scheduled_content (id, workspace_id, platform, content, scheduled_for, status, created_at)
          VALUES (
            ${id},
            ${workspaceId},
            ${post.platform},
            ${post.content},
            ${scheduledFor},
            'pending',
            ${new Date().toISOString()}
          )
        `
        insertedIds.push(id)
        insertedPosts.push({ ...post, scheduledFor, id })
      }

      // Save artifact for the batch plan
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
        VALUES (
          ${artifactId}, ${workspaceId}, ${null},
          'scheduled_batch',
          ${'Auto-Schedule Batch — ' + brand.business_name + ' (' + insertedIds.length + ' posts)'},
          ${JSON.stringify({
            batch: { ...batch, posts: insertedPosts },
            scheduledIds: insertedIds,
            generatedAt: new Date().toISOString(),
          })}
        )
      `

      return NextResponse.json({
        ok: true,
        scheduled: insertedIds.length,
        posts: insertedPosts,
        dateRange: batch.dateRange,
        cadenceSummary: batch.cadenceSummary,
        artifactId,
      })
    }

    // ── recurring_plan ────────────────────────────────────────────────────────
    if (mode === 'recurring_plan') {
      const { platforms = [], postsPerWeek = 5, contentMix } = body

      // Load existing schedule density to inform AI
      const existingResult = await sql`
        SELECT platform, COUNT(*) as count
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND status = 'pending'
          AND scheduled_for >= ${new Date().toISOString()}
        GROUP BY platform
      `
      const existingDensity = Object.fromEntries(
        existingResult.rows.map(r => [String(r.platform), Number(r.count)])
      )

      const schedule = await buildRecurringSchedule(
        brand,
        platforms.length > 0 ? platforms : (Array.isArray(brand.channels) ? brand.channels : ['instagram', 'linkedin']),
        postsPerWeek,
        contentMix,
      )

      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
        VALUES (
          ${artifactId}, ${workspaceId}, ${null},
          'recurring_schedule',
          ${'Recurring Schedule — ' + schedule.name},
          ${JSON.stringify({ schedule, existingDensity, generatedAt: new Date().toISOString() })}
        )
      `

      return NextResponse.json({ ok: true, schedule, artifactId })
    }

    // ── detect_conflicts ──────────────────────────────────────────────────────
    if (mode === 'detect_conflicts') {
      const pendingResult = await sql`
        SELECT id, platform, content, scheduled_for, status
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND status = 'pending'
          AND scheduled_for >= ${new Date().toISOString()}
        ORDER BY scheduled_for ASC
        LIMIT 200
      `

      const conflicts = await detectSchedulingConflicts(
        pendingResult.rows as Array<Record<string, unknown>>,
      )

      return NextResponse.json({
        ok: true,
        conflictsFound: conflicts.length,
        conflicts,
        pendingPostsScanned: pendingResult.rows.length,
      })
    }

    // ── timezone_optimize ─────────────────────────────────────────────────────
    if (mode === 'timezone_optimize') {
      const { targetMarkets = ['United States', 'United Kingdom', 'Australia'] } = body

      const optimization = await optimizeForTimezones(brand, targetMarkets)

      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
        VALUES (
          ${artifactId}, ${workspaceId}, ${null},
          'timezone_optimization',
          ${'Timezone Optimization — ' + brand.business_name},
          ${JSON.stringify({ optimization, targetMarkets, generatedAt: new Date().toISOString() })}
        )
      `

      return NextResponse.json({ ok: true, optimization, artifactId })
    }

    return NextResponse.json({ error: `Unknown mode: ${mode as string}` }, { status: 400 })
  } catch (error) {
    console.error('Scheduling supervisor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET — Scheduling Overview ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const now = new Date().toISOString()
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const [pendingByPlatform, nextSevenDays, totalCounts] = await Promise.all([
      // Pending posts grouped by platform
      sql`
        SELECT platform, COUNT(*) as count
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND status = 'pending'
          AND scheduled_for >= ${now}
        GROUP BY platform
        ORDER BY count DESC
      `,
      // Next 7 days of scheduled content
      sql`
        SELECT id, platform, content, scheduled_for, status
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND scheduled_for >= ${now}
          AND scheduled_for <= ${sevenDaysOut}
        ORDER BY scheduled_for ASC
        LIMIT 100
      `,
      // Overall status breakdown
      sql`
        SELECT status, COUNT(*) as count
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
        GROUP BY status
      `,
    ])

    const statusMap = Object.fromEntries(
      totalCounts.rows.map(r => [String(r.status), Number(r.count)])
    )

    return NextResponse.json({
      pendingByPlatform: pendingByPlatform.rows.map(r => ({
        platform: String(r.platform),
        pending: Number(r.count),
      })),
      nextSevenDays: nextSevenDays.rows,
      totalPending: statusMap['pending'] || 0,
      totalPublished: statusMap['published'] || 0,
      totalFailed: statusMap['failed'] || 0,
      totalCancelled: statusMap['cancelled'] || 0,
    })
  } catch (error) {
    console.error('Scheduling supervisor GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
