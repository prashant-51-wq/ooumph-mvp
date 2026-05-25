import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyPassword, createToken, COOKIE_NAME } from '@/lib/auth'
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limiter'

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      (req as NextRequest & { ip?: string }).ip ||
      'unknown'

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
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Find their workspace
    const wsResult = await sql`SELECT id FROM workspaces WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1`
    const workspaceId = (wsResult.rows[0] as { id?: string } | undefined)?.id || null

    clearRateLimit(ip)

    const token = createToken(user.id, workspaceId || undefined)
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
