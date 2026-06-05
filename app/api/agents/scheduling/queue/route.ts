/**
 * Scheduling Worker: Publishing Queue Manager
 * /api/agents/scheduling/queue
 *
 * GET  ?workspaceId=xxx&status=pending&platform=instagram&limit=50
 *      Returns queued posts with optional filters
 *
 * POST { workspaceId, action, postId?, scheduledFor?, content?, platform? }
 *   action = 'add'        — Insert a new post. If no scheduledFor, auto-detect optimal slot.
 *   action = 'reschedule' — Move an existing post to a new time.
 *   action = 'cancel'     — Mark post as cancelled.
 *   action = 'move'       — Alias for reschedule.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { analyzeOptimalTimes } from '@/lib/agents/scheduling'
import type { BrandProfile } from '@/types'

// ─── GET — List queue with filters ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const status = searchParams.get('status')        // pending | published | failed | cancelled
    const platform = searchParams.get('platform')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // Build dynamic filter conditions
    const statusFilter = status ? status : null
    const platformFilter = platform ? platform.toLowerCase() : null

    let result
    if (statusFilter && platformFilter) {
      result = await sql`
        SELECT id, platform, content, media_urls, artifact_id, scheduled_for, status, error_message, published_at, created_at
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND status = ${statusFilter}
          AND LOWER(platform) = ${platformFilter}
        ORDER BY scheduled_for ASC
        LIMIT ${limit}
      `
    } else if (statusFilter) {
      result = await sql`
        SELECT id, platform, content, media_urls, artifact_id, scheduled_for, status, error_message, published_at, created_at
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND status = ${statusFilter}
        ORDER BY scheduled_for ASC
        LIMIT ${limit}
      `
    } else if (platformFilter) {
      result = await sql`
        SELECT id, platform, content, media_urls, artifact_id, scheduled_for, status, error_message, published_at, created_at
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
          AND LOWER(platform) = ${platformFilter}
        ORDER BY scheduled_for ASC
        LIMIT ${limit}
      `
    } else {
      result = await sql`
        SELECT id, platform, content, media_urls, artifact_id, scheduled_for, status, error_message, published_at, created_at
        FROM scheduled_content
        WHERE workspace_id = ${workspaceId}
        ORDER BY scheduled_for ASC
        LIMIT ${limit}
      `
    }

    return NextResponse.json({
      posts: result.rows,
      total: result.rows.length,
      filters: { status: statusFilter, platform: platformFilter, limit },
    })
  } catch (error) {
    console.error('Queue GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── POST — Queue actions ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'add' | 'reschedule' | 'cancel' | 'move'
      postId?: string
      scheduledFor?: string
      content?: string
      platform?: string
      artifactId?: string
      mediaUrls?: string[]
    }
    const { workspaceId, action, postId, scheduledFor, content, platform, artifactId, mediaUrls } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── add ───────────────────────────────────────────────────────────────────
    if (action === 'add') {
      if (!content) return NextResponse.json({ error: 'content required for add' }, { status: 400 })
      if (!platform) return NextResponse.json({ error: 'platform required for add' }, { status: 400 })

      let resolvedScheduledFor = scheduledFor

      // Smart-add: auto-detect next optimal slot if no time provided
      if (!resolvedScheduledFor) {
        const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
        const brand = brandResult.rows[0] as unknown as BrandProfile

        // Load existing pending posts for this platform to find gaps
        const existingResult = await sql`
          SELECT scheduled_for
          FROM scheduled_content
          WHERE workspace_id = ${workspaceId}
            AND LOWER(platform) = ${platform.toLowerCase()}
            AND status = 'pending'
            AND scheduled_for >= ${new Date().toISOString()}
          ORDER BY scheduled_for ASC
          LIMIT 50
        `

        const occupiedSlots = existingResult.rows.map(r => new Date(String(r.scheduled_for)).getTime())

        // Get optimal time suggestions from AI
        let slots: Awaited<ReturnType<typeof analyzeOptimalTimes>> = []
        try {
          slots = await analyzeOptimalTimes(brand, [platform])
        } catch (e) {
          console.warn('Could not fetch optimal times for smart-add, using default offset:', e)
        }

        // Platform min-gap mapping (hours)
        const MIN_GAP_HOURS: Record<string, number> = {
          instagram: 12, twitter: 2, x: 2, linkedin: 18,
          facebook: 8, tiktok: 8, youtube: 24, pinterest: 4, threads: 6,
        }
        const gapMs = (MIN_GAP_HOURS[platform.toLowerCase()] ?? 12) * 3_600_000

        // Find the next available slot based on optimal times
        const now = Date.now()
        let candidate = now + gapMs

        if (slots.length > 0) {
          // Try to hit the best scoring slot in the next 7 days
          const sortedSlots = slots.sort((a, b) => b.engagementScore - a.engagementScore)
          const topSlot = sortedSlots[0]

          const dayMap: Record<string, number> = {
            Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
            Thursday: 4, Friday: 5, Saturday: 6,
          }
          const targetDay = dayMap[topSlot.dayOfWeek] ?? 1
          const [targetHour, targetMin] = topSlot.time.split(':').map(Number)

          // Walk forward up to 14 days to find a non-conflicting occurrence
          for (let daysAhead = 0; daysAhead <= 14; daysAhead++) {
            const attempt = new Date(now + daysAhead * 86_400_000)
            if (attempt.getDay() === targetDay) {
              attempt.setHours(targetHour, targetMin ?? 0, 0, 0)
              const attemptTs = attempt.getTime()
              if (attemptTs <= now) continue

              // Check no existing post is within the gap window
              const hasConflict = occupiedSlots.some(occ => Math.abs(occ - attemptTs) < gapMs)
              if (!hasConflict) {
                candidate = attemptTs
                break
              }
            }
          }
        } else {
          // Simple fallback: find next slot that doesn't conflict with existing posts
          while (occupiedSlots.some(occ => Math.abs(occ - candidate) < gapMs)) {
            candidate += gapMs
          }
        }

        resolvedScheduledFor = new Date(candidate).toISOString()
      }

      // Validate the resolved datetime
      const scheduledTs = new Date(resolvedScheduledFor).getTime()
      if (isNaN(scheduledTs) || scheduledTs <= Date.now()) {
        return NextResponse.json(
          { error: `scheduledFor must be a valid future datetime. Got: ${resolvedScheduledFor}` },
          { status: 400 },
        )
      }

      const id = newId()
      await sql`
        INSERT INTO scheduled_content (id, workspace_id, platform, content, media_urls, artifact_id, scheduled_for, status, created_at)
        VALUES (
          ${id},
          ${workspaceId},
          ${platform},
          ${content},
          ${JSON.stringify(mediaUrls || [])},
          ${artifactId || null},
          ${resolvedScheduledFor},
          'pending',
          ${new Date().toISOString()}
        )
      `

      return NextResponse.json({ ok: true, id, scheduledFor: resolvedScheduledFor, smartScheduled: !scheduledFor })
    }

    // ── reschedule / move ────────────────────────────────────────────────────
    if (action === 'reschedule' || action === 'move') {
      if (!postId) return NextResponse.json({ error: 'postId required for reschedule/move' }, { status: 400 })
      if (!scheduledFor) return NextResponse.json({ error: 'scheduledFor required for reschedule/move' }, { status: 400 })

      const newTs = new Date(scheduledFor).getTime()
      if (isNaN(newTs) || newTs <= Date.now()) {
        return NextResponse.json({ error: 'scheduledFor must be a valid future datetime' }, { status: 400 })
      }

      const existing = await sql`
        SELECT id FROM scheduled_content WHERE id = ${postId} AND workspace_id = ${workspaceId} LIMIT 1
      `
      if (existing.rows.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

      await sql`
        UPDATE scheduled_content
        SET scheduled_for = ${scheduledFor}, status = 'pending', error_message = NULL
        WHERE id = ${postId} AND workspace_id = ${workspaceId}
      `

      return NextResponse.json({ ok: true, id: postId, scheduledFor })
    }

    // ── cancel ───────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      if (!postId) return NextResponse.json({ error: 'postId required for cancel' }, { status: 400 })

      const existing = await sql`
        SELECT id, status FROM scheduled_content WHERE id = ${postId} AND workspace_id = ${workspaceId} LIMIT 1
      `
      if (existing.rows.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      if (String(existing.rows[0].status) === 'published') {
        return NextResponse.json({ error: 'Cannot cancel an already-published post' }, { status: 409 })
      }

      await sql`
        UPDATE scheduled_content
        SET status = 'cancelled'
        WHERE id = ${postId} AND workspace_id = ${workspaceId}
      `

      return NextResponse.json({ ok: true, id: postId, status: 'cancelled' })
    }

    return NextResponse.json({ error: `Unknown action: ${action as string}` }, { status: 400 })
  } catch (error) {
    console.error('Queue POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
