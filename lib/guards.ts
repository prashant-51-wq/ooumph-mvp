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

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer'

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  analyst: 1,
  manager: 2,
  admin: 3,
  owner: 4,
}

/**
 * Sprint 16B (audit P1 #11) — workspace role enforcement.
 *
 * The audit found that `workspace_invites.role` and `workspace_members.role`
 * were declared (admin/member/viewer values stored) but **never enforced**.
 * No route checked role anywhere. This helper closes the gap.
 *
 * Usage:
 *
 *   import { requireRole } from '@/lib/guards'
 *
 *   export async function POST(req: NextRequest) {
 *     const denied = await requireRole(req, workspaceId, 'admin')
 *     if (denied) return denied
 *     // ... admin-only mutation
 *   }
 *
 * Resolution order:
 *   1. workspace owner (workspaces.user_id matches session) → always passes
 *   2. workspace_members row for (workspace_id, user_id) → use role
 *   3. workspace_invites row matching the session email → use role
 *   4. Internal/admin secrets bypass (same rules as assertWorkspaceOwnership)
 *
 * `minRole` is hierarchical: owner > admin > manager > analyst > viewer.
 * Returns null on success or a 403 NextResponse with diagnostic.
 */
export async function requireRole(
  req: NextRequest,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<NextResponse | null> {
  // Internal/cron bypass first — same as ownership.
  const adminSecret = process.env.ADMIN_SECRET || ''
  const cronSecret = process.env.CRON_SECRET || ''
  const internalSecret = req.headers.get('x-internal-secret') || ''
  if (internalSecret && ((adminSecret && internalSecret === adminSecret) || (cronSecret && internalSecret === cronSecret))) {
    return null
  }

  const userId = getSessionUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  // Lazy-import sql to avoid a circular load at module init time.
  const { sql } = await import('@/lib/db')

  // 1. Owner check — fastest path.
  try {
    const ownerRes = await sql`SELECT user_id FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const owner = ownerRes.rows[0] as { user_id?: string } | undefined
    if (owner?.user_id === userId) return null
  } catch (err) {
    // Audit pass #6 P1: surface schema drift so missing-table failures aren't
    // silently swallowed as generic 403s.
    console.error('[requireRole] workspaces:', err)
  }

  // 2. workspace_members table — most common path for invited collaborators.
  try {
    const memRes = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId} LIMIT 1
    `
    const mem = memRes.rows[0] as { role?: string } | undefined
    if (mem?.role) {
      const role = (mem.role as WorkspaceRole) || 'viewer'
      if ((ROLE_RANK[role] ?? -1) >= ROLE_RANK[minRole]) return null
      return NextResponse.json(
        { error: `Requires role >= ${minRole}; you have ${role}` },
        { status: 403 },
      )
    }
  } catch (err) {
    console.error('[requireRole] workspace_members:', err)
  }

  // 3. workspace_invites — pending invite that hasn't been promoted yet.
  try {
    const userRes = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`
    const email = (userRes.rows[0] as { email?: string } | undefined)?.email
    if (email) {
      const invRes = await sql`
        SELECT role FROM workspace_invites
        WHERE workspace_id = ${workspaceId} AND email = ${email} LIMIT 1
      `
      const inv = invRes.rows[0] as { role?: string } | undefined
      if (inv?.role) {
        const role = (inv.role as WorkspaceRole) || 'viewer'
        if ((ROLE_RANK[role] ?? -1) >= ROLE_RANK[minRole]) return null
      }
    }
  } catch (err) {
    console.error('[requireRole] workspace_invites:', err)
  }

  return NextResponse.json(
    { error: `Workspace role of '${minRole}' or higher required` },
    { status: 403 },
  )
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
  const user = result.rows[0] as { email?: string; is_admin?: number | string | boolean } | undefined

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // Method 1: users.is_admin column.
  // Sprint 18R: coercion-tolerant — Neon/Vercel Postgres may return INTEGER
  // columns as either number or string depending on driver version. Use a
  // truthy check that handles 1, '1', true, and the rare BigInt 1n.
  if (Number(user.is_admin) === 1 || user.is_admin === true) return null

  // Method 2: SUPER_ADMIN_EMAILS env var allowlist
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return null

  return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
}

/**
 * Verifies that an artifact has an `approved` approval record before any
 * third-party side effect (email send, social publish, ad spend) fires on
 * its content. This is the runtime enforcement of the safety invariant
 * documented in ARCHITECTURE_SAFETY.md.
 *
 * Usage in a route that fires external writes:
 *
 *   const gate = await assertArtifactApproved(workspaceId, artifactId)
 *   if (gate) return gate    // 403 with "approval required" body
 *
 * Returns:
 *  - null if the artifact is approved (proceed with side effect)
 *  - NextResponse 403 if pending/rejected/missing
 *  - NextResponse 404 if the artifact doesn't exist in this workspace
 *
 * Skip the check (return null) when artifactId is intentionally absent —
 * e.g. ad-hoc raw-content sends where the caller takes responsibility for
 * gating. The check should always run when artifactId is provided.
 */
export async function assertArtifactApproved(
  workspaceId: string,
  artifactId: string | undefined | null,
): Promise<NextResponse | null> {
  if (!artifactId) return null  // ad-hoc raw-content path — caller's responsibility

  const { sql } = await import('@/lib/db')
  const result = await sql`
    SELECT a.id, a.status as artifact_status, ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.id = ${artifactId} AND a.workspace_id = ${workspaceId}
    ORDER BY ap.created_at DESC
    LIMIT 1
  `
  const row = result.rows[0] as { id?: string; artifact_status?: string; approval_status?: string } | undefined

  if (!row?.id) {
    return NextResponse.json(
      { error: 'Artifact not found in this workspace' },
      { status: 404 },
    )
  }

  // Approval row may be missing for legacy artifacts — defer to artifact.status in that case.
  // The artifacts table's status is set in lockstep with approvals (see /api/approvals PATCH).
  const effectiveStatus = row.approval_status || row.artifact_status

  if (effectiveStatus !== 'approved') {
    return NextResponse.json(
      {
        error: 'Artifact has not been approved by a human reviewer',
        artifactId,
        currentStatus: effectiveStatus || 'unknown',
        hint: 'Open the Review Required modal on the artifact and click Approve before triggering this action.',
      },
      { status: 403 },
    )
  }

  return null
}

/**
 * PR Circuit Breaker — short-circuits every customer-facing outbound action
 * when the workspace is in crisis mode. Read once at the top of any dispatch
 * route; co-located on the `workspaces` row so this is a single index lookup.
 *
 * Lifecycle (Sprint 5 Commit 1):
 *   clear → tripped → recovering → clear
 *
 *   tripped    — the scanner found a critical mention; ALL outbound paused
 *   recovering — human is actively responding; outbound stays paused
 *   clear      — operations normal
 *
 * Usage in any dispatch route:
 *
 *   const breaker = await assertCrisisClear(workspaceId)
 *   if (breaker) return breaker     // 423 Locked with status + tripped_at
 *
 * Bonus: `?force=true` query param on the calling request can bypass the
 * check for admins explicitly acknowledging the crisis (e.g. sending a
 * legitimate apology email DURING the crisis). The bypass requires the
 * caller to be a super admin AND to pass the explicit flag.
 */
export async function assertCrisisClear(
  workspaceId: string,
  opts?: { allowBypass?: boolean },
): Promise<NextResponse | null> {
  if (!workspaceId) return null
  const { sql } = await import('@/lib/db')
  const result = await sql`
    SELECT crisis_status, crisis_tripped_at
    FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `
  const row = result.rows[0] as { crisis_status?: string; crisis_tripped_at?: string | null } | undefined
  const status = (row?.crisis_status || 'clear').toLowerCase()
  if (status === 'clear') return null
  if (opts?.allowBypass) return null  // caller has explicitly handled the override
  return NextResponse.json(
    {
      error: `Workspace is in '${status}' mode — outbound actions paused by the PR Circuit Breaker.`,
      crisisStatus: status,
      crisisTrippedAt: row?.crisis_tripped_at ?? null,
      hint: 'Resolve the active brand-mention thread in /dashboard/brand-monitor, then flip the workspace back to clear.',
    },
    { status: 423 },  // 423 Locked
  )
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
  const user = result.rows[0] as { email?: string; is_admin?: number | string | boolean } | undefined
  if (!user) return false
  // Sprint 18R: coercion-tolerant (see assertSuperAdmin for context)
  if (Number(user.is_admin) === 1 || user.is_admin === true) return true
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return true
  return false
}

/**
 * Sprint 9 — Developer API gateway.
 *
 * Parses an `Authorization: Bearer oo_…` header, hashes the cleartext with
 * SHA-256 (single index lookup on developer_tokens.token_hash), enforces the
 * requested scope, and bumps `last_used_at` for the audit trail.
 *
 *   const tokenCtx = await assertDeveloperAccess(req, 'read:leads')
 *   if (tokenCtx instanceof NextResponse) return tokenCtx   // 401 / 403
 *   // tokenCtx.workspaceId is now the authenticated workspace.
 *
 * Scope grammar: `<verb>:<resource>` e.g. `read:leads`, `write:campaigns`.
 * A token carrying the wildcard `*` scope passes every check.
 *
 * Note: this guard intentionally bypasses the cookie-session pathway because
 * the API gateway has no session context — programmatic callers authenticate
 * with the bearer only. Workspace ownership IS implicit because the token
 * itself is workspace-scoped (`developer_tokens.workspace_id`).
 */
export interface DeveloperTokenContext {
  tokenId: string
  workspaceId: string
  scopes: string[]
}

export async function assertDeveloperAccess(
  req: NextRequest,
  requiredScope: string,
): Promise<DeveloperTokenContext | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(oo_[A-Za-z0-9_-]{16,})$/)
  if (!match) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header (expected: Bearer oo_…)' },
      { status: 401 },
    )
  }
  const plaintext = match[1]

  // Single-index lookup — no compound, no workspace filter, because at this
  // point the request hasn't been attributed yet. idx_developer_tokens_hash
  // is the dedicated B-tree on token_hash.
  const crypto = await import('crypto')
  const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex')
  const { sql } = await import('@/lib/db')
  const result = await sql`
    SELECT id, workspace_id, scopes_json
    FROM developer_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `
  const row = result.rows[0] as { id?: string; workspace_id?: string; scopes_json?: string } | undefined
  if (!row?.id || !row.workspace_id) {
    // Constant-ish response time — we already did the hash work above so
    // there's no easy timing oracle to confirm whether the bearer existed.
    return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 })
  }

  // Parse scopes (workspace_id is implicit in the token row).
  let scopes: string[] = []
  try {
    const parsed = JSON.parse(row.scopes_json || '[]') as unknown
    if (Array.isArray(parsed)) {
      scopes = parsed.filter((s): s is string => typeof s === 'string')
    }
  } catch { /* default empty scopes */ }

  const requested = requiredScope.trim().toLowerCase()
  const hasWildcard = scopes.includes('*')
  const hasExact = scopes.includes(requested)
  // Also accept verb wildcard: 'write:*' grants every 'write:<x>' scope.
  const verb = requested.split(':')[0]
  const hasVerbWildcard = verb ? scopes.includes(`${verb}:*`) : false

  if (!hasWildcard && !hasExact && !hasVerbWildcard) {
    return NextResponse.json(
      {
        error: `Token lacks required scope '${requested}'`,
        grantedScopes: scopes,
      },
      { status: 403 },
    )
  }

  // Fire-and-forget audit stamp. Failure here must NEVER deny the request,
  // so we await but swallow — the gateway is the critical path.
  try {
    await sql`
      UPDATE developer_tokens
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id}
    `
  } catch { /* non-fatal */ }

  return {
    tokenId: row.id,
    workspaceId: row.workspace_id,
    scopes,
  }
}
