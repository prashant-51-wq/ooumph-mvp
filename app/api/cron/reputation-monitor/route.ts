/**
 * GET /api/cron/reputation-monitor
 * Runs daily at 11am UTC via Vercel cron.
 * 1. Finds bookings completed 24-48h ago without a review request → auto-sends
 * 2. Flags unanswered negative reviews older than 48h
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { isAgentActive } from '@/lib/agents'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const authHeader = req.headers.get('authorization') || ''
  const internalSecret = req.headers.get('x-internal-secret') || ''
  const isDev = process.env.NODE_ENV !== 'production'
  const authorized =
    (secret && authHeader === `Bearer ${secret}`) ||
    (adminSecret && internalSecret === adminSecret)
  if (!authorized && (!isDev || secret || adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  let requestsSent = 0
  let negativesAlerted = 0
  let skippedPaused = 0

  // Sprint 10D: per-workspace pause cache, matching the pattern in
  // daily-brief / extract-knowledge / auto-approve / workflow-steps.
  // The `reputation` worker agent owns review-request sending; if the
  // operator paused it, we skip BOTH the review-request fanout AND the
  // negative-review urgency flagging for that workspace. Flagging is
  // surface-only (status update) so skipping it when paused matches
  // "don't act on this workspace right now" intent.
  const pauseCache = new Map<string, boolean>()
  async function isReputationAllowedFor(workspaceId: string): Promise<boolean> {
    if (pauseCache.has(workspaceId)) return pauseCache.get(workspaceId)!
    let active: boolean
    try {
      active = await isAgentActive(workspaceId, 'reputation')
    } catch {
      active = true   // fail-open on agent-table issues
    }
    pauseCache.set(workspaceId, active)
    return active
  }

  try {
    // ── 1. Auto-send review requests for completed bookings ──────────────────
    // Find bookings with status completed/no_show that ended 24-48h ago
    // and don't already have a reputation_request
    const eligibleBookings = await sql`
      SELECT b.id, b.workspace_id, b.contact_id, b.contact_name, b.contact_email, b.title
      FROM bookings b
      WHERE b.status IN ('completed')
        AND b.end_time < ${h24ago}
        AND b.end_time > ${h48ago}
        AND b.contact_email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM reputation_requests rr
          WHERE rr.workspace_id = b.workspace_id
            AND rr.booking_id = b.id
        )
      LIMIT 20
    `

    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    for (const booking of eligibleBookings.rows) {
      // Sprint 10D: respect pause.
      if (!(await isReputationAllowedFor(String(booking.workspace_id)))) {
        skippedPaused++
        continue
      }
      try {
        // Get workspace review link from integrations or brand settings
        const intResult = await sql`
          SELECT metadata FROM integrations
          WHERE workspace_id = ${String(booking.workspace_id)} AND platform = 'google_mybusiness' AND status = 'active'
          LIMIT 1
        `
        let reviewLink: string | undefined
        if (intResult.rows[0]?.metadata) {
          try {
            const meta = typeof intResult.rows[0].metadata === 'object'
              ? intResult.rows[0].metadata as Record<string, unknown>
              : JSON.parse(String(intResult.rows[0].metadata)) as Record<string, unknown>
            reviewLink = meta.review_url as string | undefined
          } catch { /* ignore */ }
        }

        await fetch(`${appUrl}/api/agents/reputation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.CRON_SECRET || process.env.ADMIN_SECRET || '',
          },
          body: JSON.stringify({
            workspaceId: String(booking.workspace_id),
            mode: 'request_review',
            bookingId: String(booking.id),
            contactId: booking.contact_id ? String(booking.contact_id) : undefined,
            contactName: booking.contact_name ? String(booking.contact_name) : undefined,
            contactEmail: String(booking.contact_email),
            reviewPlatform: 'google',
            reviewLink,
          }),
        })
        requestsSent++
      } catch (e) {
        console.error(`Review request failed for booking ${String(booking.id)}:`, e)
      }
    }

    // ── 2. Flag unanswered negative reviews older than 48h ───────────────────
    const urgentNegatives = await sql`
      SELECT id, workspace_id, contact_name, source, rating, body
      FROM reputation_reviews
      WHERE sentiment = 'negative'
        AND status = 'new'
        AND created_at < ${h48ago}
      LIMIT 50
    `
    // negativesAlerted is set AFTER the loop now — see urgentMarked below.

    // For each flagged review, update status to 'urgent' — unless that
    // workspace has paused the reputation worker.
    let urgentMarked = 0
    for (const review of urgentNegatives.rows) {
      if (!(await isReputationAllowedFor(String(review.workspace_id)))) {
        skippedPaused++
        continue
      }
      await sql`UPDATE reputation_reviews SET status = 'urgent' WHERE id = ${String(review.id)}`
      urgentMarked++
    }
    // negativesAlerted reflects what we ACTUALLY marked, not just what we
    // saw — keeps the counter honest under partial pause.
    negativesAlerted = urgentMarked

    return NextResponse.json({
      ok: true,
      requestsSent,
      negativesAlerted,
      skippedPaused,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('Reputation monitor cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
