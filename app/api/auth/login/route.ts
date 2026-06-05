import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql, newId } from '@/lib/db'
import { verifyPassword, createToken, COOKIE_NAME } from '@/lib/auth'
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limiter'

/**
 * Sprint 7C: every login now writes two audit rows so /dashboard/settings
 * Security tab can render real "Active Sessions" + "Login History" instead
 * of the hardcoded demo arrays.
 *
 *   user_sessions   — one row per successful login. token_hash = sha256(JWT).
 *                     Revoke = set revoked_at. UI lists rows where it IS NULL.
 *   login_events    — one row per attempt (success OR failure). Surfaces
 *                     suspicious activity in the login-history table.
 *
 * Both writes are best-effort wrapped in try/catch — if the audit tables
 * are missing or the DB hiccups, the login still succeeds. We never want
 * the audit path to block auth.
 */
async function logLoginAttempt(params: {
  userId: string | null
  emailAttempted: string
  ip: string
  userAgent: string
  success: boolean
  failureReason?: string
}) {
  try {
    await sql`
      INSERT INTO login_events (id, user_id, email_attempted, ip, user_agent, success, failure_reason)
      VALUES (${newId()}, ${params.userId}, ${params.emailAttempted.toLowerCase()}, ${params.ip},
              ${params.userAgent.slice(0, 500)}, ${params.success ? 1 : 0}, ${params.failureReason ?? null})
    `
  } catch (e) {
    console.error('[login] login_events insert failed (non-fatal):', e)
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    (req as NextRequest & { ip?: string }).ip ||
    'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'

  try {
    const rateLimit = checkRateLimit(ip)
    if (rateLimit.blocked) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`, retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const result = await sql`SELECT id, email, name, password_hash, salt FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    const user = result.rows[0] as { id: string; email: string; name: string; password_hash: string; salt: string } | undefined
    if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
      // Sprint 7C: log the failed attempt so users see it in their
      // login history (even when we can't attribute to a user_id).
      await logLoginAttempt({
        userId: user?.id ?? null,
        emailAttempted: email,
        ip, userAgent,
        success: false,
        failureReason: user ? 'wrong_password' : 'unknown_user',
      })
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Find their workspace
    const wsResult = await sql`SELECT id FROM workspaces WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1`
    const workspaceId = (wsResult.rows[0] as { id?: string } | undefined)?.id || null

    clearRateLimit(ip)

    const token = createToken(user.id, workspaceId || undefined)

    // Sprint 7C: record this session and login event. token_hash uses
    // sha256 so we never store the raw JWT in the DB.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    try {
      await sql`
        INSERT INTO user_sessions (id, user_id, workspace_id, token_hash, user_agent, ip)
        VALUES (${newId()}, ${user.id}, ${workspaceId}, ${tokenHash}, ${userAgent.slice(0, 500)}, ${ip})
      `
    } catch (e) {
      console.error('[login] user_sessions insert failed (non-fatal):', e)
    }
    await logLoginAttempt({
      userId: user.id, emailAttempted: email, ip, userAgent, success: true,
    })

    const res = NextResponse.json({ ok: true, userId: user.id, email: user.email, name: user.name, workspaceId })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    })
    return res
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
