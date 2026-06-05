/**
 * /api/account/login-history — Sprint 7C
 *
 * Backs the Login History table on /dashboard/settings/security.
 *
 * Returns the authenticated user's last N login events (default 20)
 * — both successes and failures, so users can spot suspicious activity
 * (a failed login from an unfamiliar IP, for example).
 *
 * Failure events with the same email_attempted but a NULL user_id (the
 * "unknown_user" failure_reason from the login route) are NOT surfaced
 * here, because they're not attributable to this user account — they
 * could be anyone typing a wrong email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSessionUserId } from '@/lib/guards'

export const runtime = 'nodejs'

interface EventRow {
  id: string
  user_id: string | null
  ip: string | null
  user_agent: string | null
  success: number
  failure_reason: string | null
  created_at: string
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const res = await sql`
    SELECT id, user_id, ip, user_agent, success, failure_reason, created_at
    FROM login_events
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 20
  `
  const rows = res.rows as unknown as EventRow[]
  const events = rows.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    ip: r.ip || 'unknown',
    device: deviceLabel(r.user_agent),
    success: r.success === 1,
    failureReason: r.failure_reason,
  }))

  return NextResponse.json({ events })
}
