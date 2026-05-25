/**
 * Scheduling Worker: Recurring Schedule Builder
 * /api/agents/scheduling/recurring
 *
 * POST { workspaceId, platforms?, postsPerWeek?, contentMix?, startDate? }
 *
 * Builds a sustainable recurring posting template, generates 4 weeks of
 * concrete scheduled dates, and optionally inserts the first week into
 * the scheduled_content table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { buildRecurringSchedule, analyzeOptimalTimes } from '@/lib/agents/scheduling'
import type { BrandProfile } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

const WEEKDAY_INDICES = [1, 2, 3, 4, 5]
const MWF_INDICES = [1, 3, 5]

function frequencyToDayIndices(frequency: string): number[] {
  switch (frequency) {
    case 'daily': return [0, 1, 2, 3, 4, 5, 6]
    case 'weekdays': return WEEKDAY_INDICES
    case 'mwf': return MWF_INDICES
    case 'weekly': return [1]     // Monday
    case 'biweekly': return [1]   // Monday, every 2 weeks handled separately
    case 'monthly': return [1]    // first Monday of month
    default: return WEEKDAY_INDICES
  }
}

/**
 * Given a RecurringSchedule template + startDate, generate concrete post slots for N weeks.
 * Posts are assigned to optimal times from the template, cycling through the time slots.
 */
function expandScheduleToWeeks(
  schedule: {
    platforms: string[]
    frequency: string
    times: string[]
    contentTypes: string[]
  },
  startDate: string,
  weeks: number,
): Array<{ platform: string; scheduledFor: string; contentType: string }> {
  const posts: Array<{ platform: string; scheduledFor: string; contentType: string }> = []
  const start = new Date(startDate + 'T00:00:00.000Z')
  const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)

  const dayIndices = frequencyToDayIndices(schedule.frequency)
  let platformCursor = 0
  let timeCursor = 0
  let typeCursor = 0
  let weekCount = 0

  const current = new Date(start)
  while (current < end) {
    const dayOfWeek = current.getDay()
    const weeksSinceStart = Math.floor((current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))

    // For biweekly, only post on even weeks
    if (schedule.frequency === 'biweekly' && weeksSinceStart % 2 !== 0) {
      current.setUTCDate(current.getUTCDate() + 1)
      continue
    }
    // For monthly, only post on the first occurrence of the target day
    if (schedule.frequency === 'monthly') {
      if (weeksSinceStart % 4 !== 0) {
        current.setUTCDate(current.getUTCDate() + 1)
        continue
      }
    }

    if (dayIndices.includes(dayOfWeek)) {
      const platform = schedule.platforms[platformCursor % schedule.platforms.length]
      const time = schedule.times[timeCursor % Math.max(schedule.times.length, 1)]
      const contentType = schedule.contentTypes[typeCursor % Math.max(schedule.contentTypes.length, 1)]

      const [hours, minutes] = (time || '09:00').split(':').map(Number)
      const postDate = new Date(current)
      postDate.setUTCHours(hours ?? 9, minutes ?? 0, 0, 0)

      // Only schedule future posts
      if (postDate.getTime() > Date.now()) {
        posts.push({
          platform,
          scheduledFor: postDate.toISOString(),
          contentType,
        })
      }

      platformCursor++
      timeCursor++
      typeCursor++
      weekCount++
    }

    current.setUTCDate(current.getUTCDate() + 1)
  }

  return posts
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      platforms?: string[]
      postsPerWeek?: number
      contentMix?: Record<string, number>
      startDate?: string
      insertFirstWeek?: boolean
    }
    const {
      workspaceId,
      platforms = [],
      postsPerWeek = 5,
      contentMix,
      startDate,
      insertFirstWeek = false,
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Resolve platforms — fall back to brand channels
    const resolvedPlatforms = platforms.length > 0
      ? platforms
      : (Array.isArray(brand.channels) ? brand.channels as string[] : ['instagram', 'linkedin'])

    // Load existing publish density so AI can account for what's already in the queue
    const existingDensityResult = await sql`
      SELECT platform, COUNT(*) as count,
             MIN(scheduled_for) as earliest, MAX(scheduled_for) as latest
      FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
        AND status = 'pending'
        AND scheduled_for >= ${new Date().toISOString()}
      GROUP BY platform
    `
    const existingDensity = Object.fromEntries(
      existingDensityResult.rows.map(r => [String(r.platform), {
        count: Number(r.count),
        earliest: r.earliest,
        latest: r.latest,
      }])
    )

    // Build the recurring schedule template
    const schedule = await buildRecurringSchedule(brand, resolvedPlatforms, postsPerWeek, contentMix)

    // Get optimal times for more precise slot assignment
    let optimalTimes: Awaited<ReturnType<typeof analyzeOptimalTimes>> = []
    try {
      optimalTimes = await analyzeOptimalTimes(brand, resolvedPlatforms)
    } catch {
      // Non-fatal: fall back to schedule.times
    }

    // Merge optimal times into the schedule if AI returned them
    if (optimalTimes.length > 0) {
      const bestTimes = resolvedPlatforms.flatMap(p => {
        const platformSlots = optimalTimes.filter(s => s.platform.toLowerCase() === p.toLowerCase())
        return platformSlots.slice(0, 1).map(s => s.time)
      }).filter(Boolean)
      if (bestTimes.length > 0) {
        schedule.times = [...new Set([...bestTimes, ...schedule.times])].slice(0, 4)
      }
    }

    // Determine start date
    const resolvedStart = startDate ?? new Date().toISOString().slice(0, 10)

    // Expand to 4 weeks of concrete slots
    const fourWeeks = expandScheduleToWeeks(schedule, resolvedStart, 4)

    // Expand first week separately for optional DB insert
    const firstWeekEnd = new Date(new Date(resolvedStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const firstWeekSlots = fourWeeks.filter(p => p.scheduledFor.slice(0, 10) < firstWeekEnd)

    const insertedIds: string[] = []

    if (insertFirstWeek && firstWeekSlots.length > 0) {
      for (const slot of firstWeekSlots) {
        const id = newId()
        await sql`
          INSERT INTO scheduled_content (id, workspace_id, platform, content, scheduled_for, status, created_at)
          VALUES (
            ${id},
            ${workspaceId},
            ${slot.platform},
            ${'[' + slot.contentType + ' content — fill in before publish]'},
            ${slot.scheduledFor},
            'pending',
            ${new Date().toISOString()}
          )
        `
        insertedIds.push(id)
      }
    }

    // Save artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (
        ${artifactId}, ${workspaceId}, ${null},
        'recurring_schedule',
        ${'Recurring Schedule — ' + schedule.name},
        ${JSON.stringify({
          schedule,
          resolvedPlatforms,
          fourWeekSlots: fourWeeks,
          firstWeekSlots,
          firstWeekInserted: insertedIds.length,
          insertedIds,
          existingDensity,
          generatedAt: new Date().toISOString(),
        })}
      )
    `

    return NextResponse.json({
      ok: true,
      schedule,
      fourWeekSlots: fourWeeks,
      firstWeekSlots,
      firstWeekInserted: insertedIds.length,
      insertedIds,
      artifactId,
    })
  } catch (error) {
    console.error('Recurring schedule worker error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET — Return saved recurring schedule artifacts ─────────────────────────

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
        AND type = 'recurring_schedule'
      ORDER BY created_at DESC
      LIMIT 5
    `

    return NextResponse.json({
      ok: true,
      schedules: result.rows.map(r => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        schedule: (r.content_json as Record<string, unknown>)?.schedule ?? null,
      })),
    })
  } catch (error) {
    console.error('Recurring GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
