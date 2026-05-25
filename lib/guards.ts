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
