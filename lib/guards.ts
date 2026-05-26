/**
 * lib/guards.ts
 * Server-side guards for API route handlers.
 *
 * Usage in a route handler:
 *
 *   import { assertWorkspaceOwnership } from '@/lib/guards'
 *
 *   export async function POST(req: NextRequest) {
 *     const { workspaceId, ... } = await req.json()
 *     const denied = assertWorkspaceOwnership(req, workspaceId)
 *     if (denied) return denied
 *     // ... rest of handler
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

/**
 * Verifies that the authenticated user owns the requested workspaceId.
 *
 * Returns a 403 NextResponse if ownership check fails,
 * or null if everything is fine (proceed with handler logic).
 *
 * Bypass rules:
 *  - x-internal-secret header matching CRON_SECRET or ADMIN_SECRET → allow
 *  - x-admin-secret header matching ADMIN_SECRET → allow
 *  - No workspaceId passed → skip check (some endpoints are workspace-agnostic)
 *  - Dev mode (NODE_ENV !== 'production') still enforces in case workspaceId is provided
 */
export function assertWorkspaceOwnership(
  req: NextRequest,
  requestedWorkspaceId: string | null | undefined,
): NextResponse | null {
  // No workspaceId to check — nothing to enforce
  if (!requestedWorkspaceId) return null

  const adminSecret = process.env.ADMIN_SECRET || ''
  const cronSecret = process.env.CRON_SECRET || ''

  // Internal service bypass
  const internalSecret = req.headers.get('x-internal-secret') || ''
  if (
    internalSecret &&
    ((adminSecret && internalSecret === adminSecret) ||
      (cronSecret && internalSecret === cronSecret))
  ) {
    return null
  }

  // Admin bypass
  const adminHdr = req.headers.get('x-admin-secret') || ''
  if (adminSecret && adminHdr === adminSecret) return null

  // Prefer forwarded session headers (set by middleware — avoids re-parsing cookie)
  const sessionWorkspaceId =
    req.headers.get('x-session-workspace-id') ||
    (() => {
      // Fallback: parse the cookie directly (in case middleware didn't run, e.g. tests)
      const token = req.cookies.get(COOKIE_NAME)?.value
      if (!token) return null
      const session = verifyToken(token)
      return session?.workspaceId ?? null
    })()

  if (!sessionWorkspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (sessionWorkspaceId !== requestedWorkspaceId) {
    return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  }

  return null // ✅ Ownership confirmed
}

/**
 * Reads the authenticated user's workspaceId from the request.
 * Returns null if not authenticated.
 */
export function getSessionWorkspaceId(req: NextRequest): string | null {
  // Try middleware-forwarded header first
  const fromHeader = req.headers.get('x-session-workspace-id')
  if (fromHeader) return fromHeader

  // Fall back to cookie
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = verifyToken(token)
  return session?.workspaceId ?? null
}

/**
 * Reads the authenticated user's userId from the request.
 */
export function getSessionUserId(req: NextRequest): string | null {
  const fromHeader = req.headers.get('x-session-user-id')
  if (fromHeader) return fromHeader

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = verifyToken(token)
  return session?.userId ?? null
}

/**
 * Asserts the authenticated user is a platform-level super admin.
 *
 * Super admin status is granted via users.is_admin = 1 OR
 * via SUPER_ADMIN_EMAILS env var (comma-separated emails).
 *
 * Returns:
 *  - null if user is super admin (proceed)
 *  - NextResponse 401/403 otherwise
 *
 * Bypass: x-admin-secret header matching ADMIN_SECRET env var.
 */
export async function assertSuperAdmin(req: NextRequest): Promise<NextResponse | null> {
  // Admin secret bypass (CI / cron / internal)
  const adminSecret = process.env.ADMIN_SECRET || ''
  const adminHdr = req.headers.get('x-admin-secret') || ''
  if (adminSecret && adminHdr === adminSecret) return null

  const userId = getSessionUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Dynamic import to avoid circular deps
  const { sql } = await import('@/lib/db')
  const result = await sql`SELECT email, is_admin FROM users WHERE id = ${userId} LIMIT 1`
  const user = result.rows[0] as { email?: string; is_admin?: number } | undefined

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // Method 1: users.is_admin column
  if (user.is_admin === 1) return null

  // Method 2: SUPER_ADMIN_EMAILS env var allowlist
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return null

  return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
}

/**
 * Check if the current session belongs to a super admin (returns boolean, no error response).
 * Used in page-level checks where we want to redirect instead of returning an error.
 */
export async function isSessionSuperAdmin(req: NextRequest): Promise<boolean> {
  const userId = getSessionUserId(req)
  if (!userId) return false
  const { sql } = await import('@/lib/db')
  const result = await sql`SELECT email, is_admin FROM users WHERE id = ${userId} LIMIT 1`
  const user = result.rows[0] as { email?: string; is_admin?: number } | undefined
  if (!user) return false
  if (user.is_admin === 1) return true
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return true
  return false
}
