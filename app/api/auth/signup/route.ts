import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { hashPassword, createToken, COOKIE_NAME } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limiter'

export async function POST(req: NextRequest) {
  // Rate-limit signup by IP — same window as login (5 per 15 min per IP).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    (req as NextRequest & { ip?: string }).ip ||
    'unknown'
  const rateLimit = checkRateLimit(ip)
  if (rateLimit.blocked) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`, retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429 },
    )
  }

  try {
    const { email, password, name } = await req.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const { hash, salt } = hashPassword(password)
    const userId = newId()
    await sql`INSERT INTO users (id, email, name, password_hash, salt) VALUES (${userId}, ${email.toLowerCase()}, ${name}, ${hash}, ${salt})`

    const token = createToken(userId)
    const res = NextResponse.json({ ok: true, userId, email: email.toLowerCase(), name })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
    })
    return res
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Account creation failed. Please try again.' }, { status: 500 })
  }
}
