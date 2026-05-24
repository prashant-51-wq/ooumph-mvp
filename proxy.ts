import { NextRequest, NextResponse } from 'next/server'

const SECRET = process.env.AUTH_SECRET || 'ooumph-dev-secret-change-in-production'
const COOKIE_NAME = 'ooumph_session'

async function verifyEdgeToken(token: string): Promise<boolean> {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx < 0) return false
    const payloadB64 = token.slice(0, dotIdx)
    const sigHex = token.slice(dotIdx + 1)

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sigBytes = new Uint8Array((sigHex.match(/../g) ?? []).map(h => parseInt(h, 16)))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64))
    if (!valid) return false

    const pad = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(pad.padEnd(pad.length + (4 - pad.length % 4) % 4, '=')))
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch { return false }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifyEdgeToken(token))) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/dashboard/:path*'] }
