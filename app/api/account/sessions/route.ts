/**
 * /api/account/sessions — Sprint 7C
 *
 * Backs the Active Sessions card on /dashboard/settings/security.
 *
 *   GET                       → list current user's non-revoked sessions,
 *                               marking the one that matches the request
 *                               cookie as `current: true`.
 *   DELETE ?id=<sessionId>    → revoke a specific session row.
 *   POST   { action: 'revoke-others' }
 *                             → revoke every session EXCEPT the one
 *                               matching the request cookie. Used by
 *                               "Sign out from all other devices".
 *
 * The token cookie value is never returned in API responses. Sessions
 * are identified by their row id + the sha256(token) hash, both safe
 * to expose since neither lets a client reconstruct the JWT itself.
 *
 * Auth model: session ownership = user_sessions.user_id matches the
 * authenticated session's user_id. Bypass paths (CRON_SECRET /
 * ADMIN_SECRET) are NOT honoured here — a cron has no reason to
 * enumerate or revoke a human's sessions.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql } from '@/lib/db'
import { COOKIE_NAME, verifyToken } from '@/lib/auth'
import { getSessionUserId } from '@/lib/guards'

export const runtime = 'nodejs'

interface SessionRow {
  id: string
  user_id: string
  workspace_id: string | null
  token_hash: string
  user_agent: string | null
  ip: string | null
  created_at: string
  last_seen_at: string
  revoked_at: string | null
}

function currentTokenHash(req: NextRequest): string | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  // Verify the token is well-formed before hashing — prevents storing
  // hash of garbage if someone passes a malformed cookie.
  if (!verifyToken(token)) return null
  return crypto.createHash('sha256').update(token).digest('hex')
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device'
  // Very lightweight — full UA parsing is overkill here. We just want
  // the user to recognise which session is which.
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android device'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows PC'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown device'
}

function browserLabel(ua: string | null): string {
  if (!ua) return ''
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari'
  return 'Browser'
}

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const currentHash = currentTokenHash(req)

  const res = await sql`
    SELECT id, user_id, workspace_id, token_hash, user_agent, ip,
           created_at, last_seen_at, revoked_at
    FROM user_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY last_seen_at DESC LIMIT 50
  `
  const rows = res.rows as unknown as SessionRow[]
  const sessions = rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    device: deviceLabel(r.user_agent),
    browser: browserLabel(r.user_agent),
    ip: r.ip || 'unknown',
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: currentHash !== null && r.token_hash === currentHash,
  }))

  return NextResponse.json({ sessions })
}

export async function DELETE(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Ownership: only let the user revoke their own session rows. Without
  // this filter a determined attacker could enumerate other users' rows
  // by guessing IDs.
  await sql`
    UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
  `
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string }
  if (body.action !== 'revoke-others') {
    return NextResponse.json({ error: "action must be 'revoke-others'" }, { status: 400 })
  }

  const currentHash = currentTokenHash(req)
  if (!currentHash) {
    // Edge case: no valid cookie. Revoke EVERYTHING for the user. Saner
    // than leaving stale sessions when the operator can't be matched.
    await sql`UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ${userId} AND revoked_at IS NULL`
    return NextResponse.json({ ok: true, revokedAllIncludingCurrent: true })
  }
  await sql`
    UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId} AND revoked_at IS NULL AND token_hash <> ${currentHash}
  `
  return NextResponse.json({ ok: true })
}
