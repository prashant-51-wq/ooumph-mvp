/**
 * /api/integration-connections
 *
 * App marketplace router. Each row represents one third-party integration
 * card a workspace has connected (Stripe, HubSpot, Slack, Notion, Salesforce…).
 *
 *   GET    ?workspaceId=…[&status=connected]   → list (NEVER decrypts; the
 *                                                  encrypted blob is returned
 *                                                  opaque so the UI can show
 *                                                  status without leaking creds)
 *   POST   { workspaceId, providerSlug, credentials: object }
 *          → AES-256-GCM-encrypts the credentials JSON via lib/secrets.ts
 *            and INSERTs. If a row already exists for this (workspace_id,
 *            provider_slug) the composite UNIQUE fires; we re-route the
 *            request through the upsert path automatically.
 *   PUT    { workspaceId, providerSlug, credentials: object, status? }
 *          → Idempotent upsert — clean handler for the OAuth callback
 *            scenario where the receiver re-authenticates and we want to
 *            replace the encrypted blob in place.
 *   DELETE ?id=…&workspaceId=…                 → revoke the card.
 *
 * Why the UNIQUE matters here: clicking "Connect Stripe" twice from the UI,
 * or running the OAuth callback after a token refresh, would otherwise create
 * duplicate cards in the marketplace grid. The composite (workspace_id,
 * provider_slug) catches that, and the upsert flow preserves the audit trail
 * (same row id, just rotated credentials_encrypted + updated_at).
 *
 * What credentials look like: the receiver-side OAuth flow lands an access
 * token + refresh token + expiry. We accept any JSON-serialisable object,
 * stringify it, and run it through encryptSecret() — opaque to us; the
 * adapter that hydrates the connection (e.g. lib/tools/hubspot.ts) is the
 * only code that decrypts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { encryptSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['connected', 'disconnected', 'error', 'pending'])
const PROVIDER_SLUG_PATTERN = /^[a-z][a-z0-9_-]{1,48}$/
const MAX_CRED_BYTES = 32 * 1024  // 32 KB credentials cap — way more than any real OAuth blob needs

interface ConnectionRow {
  id: string
  workspace_id: string
  provider_slug: string
  credentials_encrypted: string | null
  status: string
  updated_at: string
  created_at: string
}

interface PublicConnectionRow {
  id: string
  workspace_id: string
  provider_slug: string
  status: string
  updated_at: string
  created_at: string
  /** True when an encrypted credentials blob exists, false when the row is
   *  only the marketplace stub. We NEVER return the blob itself. */
  hasCredentials: boolean
}

function serialiseCredentials(credentials: unknown): string | null {
  if (credentials === null || credentials === undefined) return null
  try {
    const str = JSON.stringify(credentials)
    if (Buffer.byteLength(str, 'utf8') > MAX_CRED_BYTES) return null
    return str
  } catch {
    return null
  }
}

function toPublicRow(row: ConnectionRow): PublicConnectionRow {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    provider_slug: row.provider_slug,
    status: row.status,
    updated_at: row.updated_at,
    created_at: row.created_at,
    hasCredentials: Boolean(row.credentials_encrypted),
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = status
    ? await sql`
        SELECT id, workspace_id, provider_slug, credentials_encrypted, status, updated_at, created_at
        FROM integration_connections
        WHERE workspace_id = ${workspaceId} AND status = ${status}
        ORDER BY updated_at DESC LIMIT 200
      `
    : await sql`
        SELECT id, workspace_id, provider_slug, credentials_encrypted, status, updated_at, created_at
        FROM integration_connections
        WHERE workspace_id = ${workspaceId}
        ORDER BY updated_at DESC LIMIT 200
      `
  const rows = result.rows as unknown as ConnectionRow[]
  return NextResponse.json(rows.map(toPublicRow))
}

// ─── Shared upsert helper ─────────────────────────────────────────────────

async function upsertConnection(opts: {
  workspaceId: string
  providerSlug: string
  credentials: unknown | null
  status?: string
}): Promise<{ row: PublicConnectionRow; created: boolean }> {
  const { workspaceId, providerSlug } = opts
  const status = opts.status?.toLowerCase() && ALLOWED_STATUSES.has(opts.status.toLowerCase())
    ? opts.status.toLowerCase()
    : 'connected'

  // Pre-serialise + encrypt off the SQL path so we keep the transaction tight.
  let encrypted: string | null = null
  if (opts.credentials !== undefined && opts.credentials !== null) {
    const serialised = serialiseCredentials(opts.credentials)
    if (serialised === null) {
      throw new Error('credentials must be JSON-serialisable and ≤ 32KB after stringify')
    }
    encrypted = encryptSecret(serialised)
  }

  const existing = await sql`
    SELECT id FROM integration_connections
    WHERE workspace_id = ${workspaceId} AND provider_slug = ${providerSlug}
    LIMIT 1
  `
  const existingId = (existing.rows[0] as { id?: string } | undefined)?.id

  if (existingId) {
    // Idempotent overwrite. credentials_encrypted = COALESCE-style: we only
    // overwrite the blob when the caller actually sent fresh credentials.
    await sql`
      UPDATE integration_connections SET
        credentials_encrypted = COALESCE(${encrypted}, credentials_encrypted),
        status                = ${status},
        updated_at            = CURRENT_TIMESTAMP
      WHERE id = ${existingId} AND workspace_id = ${workspaceId}
    `
    const refetch = await sql`
      SELECT id, workspace_id, provider_slug, credentials_encrypted, status, updated_at, created_at
      FROM integration_connections WHERE id = ${existingId} LIMIT 1
    `
    return { row: toPublicRow(refetch.rows[0] as unknown as ConnectionRow), created: false }
  }

  const id = newId()
  await sql`
    INSERT INTO integration_connections (
      id, workspace_id, provider_slug, credentials_encrypted, status, updated_at, created_at
    ) VALUES (
      ${id}, ${workspaceId}, ${providerSlug}, ${encrypted}, ${status},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `
  const refetch = await sql`
    SELECT id, workspace_id, provider_slug, credentials_encrypted, status, updated_at, created_at
    FROM integration_connections WHERE id = ${id} LIMIT 1
  `
  return { row: toPublicRow(refetch.rows[0] as unknown as ConnectionRow), created: true }
}

// ─── POST ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      providerSlug?: string
      credentials?: unknown
      status?: string
    }
    const { workspaceId, providerSlug } = body
    if (!workspaceId || !providerSlug) {
      return NextResponse.json(
        { error: 'workspaceId and providerSlug required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const slug = providerSlug.trim().toLowerCase()
    if (!PROVIDER_SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: `providerSlug must match ${PROVIDER_SLUG_PATTERN.source}` },
        { status: 422 },
      )
    }

    const { row, created } = await upsertConnection({
      workspaceId,
      providerSlug: slug,
      credentials: body.credentials,
      status: body.status,
    })
    return NextResponse.json({ ok: true, ...row, created })
  } catch (err) {
    console.error('[/api/integration-connections POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── PUT (explicit upsert — preferred for OAuth callbacks) ────────────────

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      providerSlug?: string
      credentials?: unknown
      status?: string
    }
    const { workspaceId, providerSlug } = body
    if (!workspaceId || !providerSlug) {
      return NextResponse.json(
        { error: 'workspaceId and providerSlug required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const slug = providerSlug.trim().toLowerCase()
    if (!PROVIDER_SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: `providerSlug must match ${PROVIDER_SLUG_PATTERN.source}` },
        { status: 422 },
      )
    }

    const { row, created } = await upsertConnection({
      workspaceId,
      providerSlug: slug,
      credentials: body.credentials,
      status: body.status,
    })
    return NextResponse.json({ ok: true, ...row, created })
  } catch (err) {
    console.error('[/api/integration-connections PUT]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`DELETE FROM integration_connections WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
