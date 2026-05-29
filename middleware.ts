/**
 * Sprint 16B (audit P0 #2) — Next.js middleware that gates /dashboard/*
 * behind a valid session cookie.
 *
 * Previously: there was no middleware.ts. An unauthenticated visitor landing
 * on /dashboard/* would render the layout shell, then watch each /api/auth/me
 * + workspace fetch fail individually. They'd see a broken-data dashboard,
 * not a login redirect. Worse, the data-fetch endpoints leaked the precise
 * shape of what data exists per route.
 *
 * Now: the cookie is checked at the edge BEFORE any page renders.
 *
 *   - No cookie  → 302 to /login?next=<requested-path>
 *   - Invalid HMAC / expired token → same redirect (cleared cookie)
 *   - Valid cookie → request passes through unchanged
 *
 * Path scope (matcher below) intentionally excludes:
 *   - /api/*   — each route already gates with assertWorkspaceOwnership /
 *                assertAgentRunQuota. Cron + webhook routes use internal-secret
 *                or external verification, so middleware would just add noise.
 *   - /_next/* — framework assets
 *   - /lp/*   — public landing pages (server-rendered, intentionally open)
 *   - /f/*    — public form pages (public funnel renderer)
 *   - static files (image, favicon, .ico, .png, etc)
 *
 * Edge runtime: the middleware uses Web Crypto (subtle) since Node's `crypto`
 * isn't available in the Edge runtime. The HMAC check is therefore implemented
 * directly here rather than via lib/auth.ts (which uses Node crypto).
 */
import { NextResponse, type NextRequest } from 'next/server'

const SECRET = process.env.AUTH_SECRET || 'ooumph-dev-secret-change-in-production'
const COOKIE_NAME = 'ooumph_session'

/** Edge-runtime HMAC-SHA-256 of `data` using `key`. Returns hex. */
async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time string compare. Matches Node's crypto.timingSafeEqual semantics. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/** Edge-compatible base64url decode. */
function base64UrlDecode(str: string): string {
  // atob requires padded base64, not base64url. Re-pad.
  const pad = 4 - (str.length % 4 || 4)
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + (pad === 4 ? '' : '='.repeat(pad))
  try {
    return atob(padded)
  } catch {
    return ''
  }
}

interface SessionPayload {
  userId: string
  workspaceId?: string
}

/**
 * Verifies the cookie HMAC + expiry. Returns the decoded payload on success
 * so the caller can forward `userId` / `workspaceId` to downstream handlers
 * as request headers (saving them a re-parse). Returns null on any failure.
 */
async function readValidSession(token: string): Promise<SessionPayload | null> {
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx < 0) return null
  const payloadB64 = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)
  const expected = await hmacSha256Hex(SECRET, payloadB64)
  if (!constantTimeEqual(sig, expected)) return null
  try {
    const data = JSON.parse(base64UrlDecode(payloadB64)) as { exp?: number; userId?: string; workspaceId?: string }
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    if (!data.userId) return null
    return { userId: data.userId, workspaceId: data.workspaceId }
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Belt-and-suspenders: the matcher already excludes most things, but if
  // the matcher is widened later (e.g. someone adds /admin) the runtime
  // check still keeps public routes open.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/lp/') ||
    pathname.startsWith('/f/') ||
    pathname.startsWith('/api/') ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|woff2?|ttf|map)$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Only protect dashboard for now. /login, /signup, / etc stay open.
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token) {
    const session = await readValidSession(token)
    if (session) {
      // Sprint 17G (audit pass #3 P2 #35): forward session into request
      // headers. lib/guards.ts has been checking these headers since
      // Sprint 7 but middleware never set them — guards always fell
      // through to cookie re-parsing (effectively dead code). Forwarding
      // saves a base64+HMAC round-trip on every API call inside a request.
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-session-user-id', session.userId)
      if (session.workspaceId) {
        requestHeaders.set('x-session-workspace-id', session.workspaceId)
      }
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
  }

  // No cookie, or invalid — redirect with the original path so we can return
  // the user to where they tried to go after login.
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search)
  const res = NextResponse.redirect(loginUrl)
  // Clear the bad cookie so we don't loop on a stale-token attempt.
  if (token) {
    res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  }
  return res
}

export const config = {
  // Match every dashboard path. We deliberately don't widen to `/(.*)`
  // because the API + public-LP routes have their own gating, and pulling
  // them into middleware just adds latency without gain.
  matcher: ['/dashboard/:path*'],
}
