/**
 * proxy.ts — Next.js 16 (Turbopack) edge proxy / middleware
 *
 * Responsibilities:
 *   1. Protect /dashboard/** — redirect unauthenticated users to /login
 *   2. Protect /api/agents/**, /api/workflows/**, /api/calendar/**,
 *      /api/leads/**, /api/artifacts/**, /api/approvals/**, /api/brand/**,
 *      /api/publish/**, /api/integrations/**, /api/inbox/**, /api/vendor/**,
 *      /api/billing/**, /api/analytics/**, /api/media/**, /api/assets/**
 *      — return 401 JSON for unauthenticated requests
 *   3. Verify workspaceId in GET query params against session token (403 on mismatch)
 *   4. Forward x-session-user-id / x-session-workspace-id headers to route handlers
 *
 * Bypass rules (no session required):
 *   - x-internal-secret header matching CRON_SECRET or ADMIN_SECRET
 *   - x-admin-secret header matching ADMIN_SECRET (for /api/admin/**)
 *   - Public routes: /api/auth/**, /api/webhooks/**, /api/lp-submit, /api/billing/plans (auto-seed)
 *   - All non-matched paths
 */

import { NextRequest, NextResponse } from 'next/server'

const _rawSecret = process.env.AUTH_SECRET
if (!_rawSecret && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET env var is required in production. Set it in your Vercel environment variables.')
}
const SECRET = _rawSecret || 'ooumph-dev-secret-change-in-production'
const COOKIE_NAME = 'ooumph_session'

// ── Paths that are always public ──────────────────────────────────────────────
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/lp-submit',
  '/api/cron/',   // cron routes use Bearer CRON_SECRET, not session cookie
]

// ── Paths that require a valid session ────────────────────────────────────────
const PROTECTED_API_PREFIXES = [
  '/api/agents/',
  '/api/workflows/',
  '/api/calendar/',
  '/api/leads/',
  '/api/artifacts/',
  '/api/approvals/',
  '/api/brand/',
  '/api/publish/',
  '/api/integrations/',
  '/api/inbox/',
  '/api/vendor/',
  '/api/billing/',
  '/api/analytics/',
  '/api/media/',
  '/api/assets/',
  '/api/leads-captured/',
  '/api/schedule/',
  '/api/crm/',
  '/api/team/',
  '/api/bookings/',
]

// ── Token verification (Edge-compatible HMAC) ─────────────────────────────────
async function verifyEdgeToken(token: string): Promise<{ userId: string; workspaceId?: string } | null> {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx < 0) return null
    const payloadB64 = token.slice(0, dotIdx)
    const sigHex = token.slice(dotIdx + 1)

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sigBytes = new Uint8Array((sigHex.match(/../g) ?? []).map(h => parseInt(h, 16)))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64))
    if (!valid) return null

    const pad = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(pad.padEnd(pad.length + (4 - pad.length % 4) % 4, '='))) as {
      userId: string
      workspaceId?: string
      exp: number
    }

    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return { userId: payload.userId, workspaceId: payload.workspaceId }
  } catch {
    return null
  }
}

// ── Proxy handler ─────────────────────────────────────────────────────────────
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const adminSecret = process.env.ADMIN_SECRET || ''
  const cronSecret = process.env.CRON_SECRET || ''

  // ── 1. Dashboard + Admin portal protection — redirect to login ──────────────
  // Sprint 18T: /admin is its own top-level portal (not nested under /dashboard).
  // Same session-cookie protection applies; the admin layout's own client-side
  // gate + each API route's assertSuperAdmin enforce the super-admin check.
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token || !(await verifyEdgeToken(token))) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // ── 2. API route protection ──────────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Public API routes — skip all checks
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Protected route check
  if (!PROTECTED_API_PREFIXES.some(p => pathname.startsWith(p))) {
    // Admin API — handled below; everything else passes through
    if (!pathname.startsWith('/api/admin/')) return NextResponse.next()
  }

  // ── Internal service bypass ──────────────────────────────────────────────────
  const internalSecret = req.headers.get('x-internal-secret') || ''
  if (
    internalSecret &&
    ((cronSecret && internalSecret === cronSecret) ||
      (adminSecret && internalSecret === adminSecret))
  ) {
    return NextResponse.next()
  }

  // ── Admin routes: x-admin-secret OR signed session cookie ───────────────────
  // Sprint 18S: the new dashboard admin panel calls /api/admin/* from the
  // browser using a session cookie — browsers can't send x-admin-secret.
  // Proxy verifies the cookie HMAC is valid here; the route handler's
  // assertSuperAdmin then enforces users.is_admin = 1 / SUPER_ADMIN_EMAILS.
  // Defense in depth: forged cookie → 401 at edge; non-admin user → 403 in handler.
  if (pathname.startsWith('/api/admin/')) {
    const adminHdr = req.headers.get('x-admin-secret') || ''
    if (adminSecret && adminHdr === adminSecret) {
      return NextResponse.next()
    }
    const adminToken = req.cookies.get(COOKIE_NAME)?.value
    if (adminToken && (await verifyEdgeToken(adminToken))) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
  }

  // ── Session cookie check ─────────────────────────────────────────────────────
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const session = await verifyEdgeToken(token)
  if (!session) {
    const res = NextResponse.json({ error: 'Session expired' }, { status: 401 })
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  // ── Workspace ownership check for GET query params ───────────────────────────
  // POST body ownership is verified inside each route handler via assertWorkspaceOwnership()
  const qpWorkspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (qpWorkspaceId && session.workspaceId && qpWorkspaceId !== session.workspaceId) {
    return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  }

  // ── Forward session metadata as headers ─────────────────────────────────────
  const res = NextResponse.next()
  res.headers.set('x-session-user-id', session.userId)
  if (session.workspaceId) res.headers.set('x-session-workspace-id', session.workspaceId)
  return res
}

export default proxy

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/:path*',
  ],
}
