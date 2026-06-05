import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql } from '@/lib/db'
import { COOKIE_NAME } from '@/lib/auth'

/**
 * Sprint 7C: logout also marks the current session row revoked in
 * user_sessions so the Settings → Security tab stops showing it in
 * "Active Sessions". Token hash lookup is sha256(JWT) — same hash
 * inserted during login.
 *
 * Best-effort: if the DB update fails the cookie clear still happens.
 * Users always get logged out from this device even if the audit
 * trail is unhealthy.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      await sql`UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`
    } catch (e) {
      console.error('[logout] user_sessions revoke failed (non-fatal):', e)
    }
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
  return res
}
