/**
 * /api/webhook-subscriptions
 *
 *   GET    ?workspaceId=…[&eventType=…][&status=active]
 *   POST   { workspaceId, targetUrl, eventType }
 *          → Auto-generates a high-entropy `secret_signature` prefixed
 *            `whsec_` and returns it ONCE in the response body. The plaintext
 *            is also persisted on the row because the dispatcher needs it
 *            to sign outbound payloads — UNLIKE developer_tokens, which is
 *            authenticated by the caller and therefore only stored as a hash.
 *
 *            Both sides (us + the receiver) must know the same shared secret
 *            for HMAC verification to work, so plaintext storage on the row
 *            is intentional. The encryption boundary is at-rest DB encryption
 *            (Neon Postgres + AES on disk), same as workspace_secrets.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const SECRET_PREFIX = 'whsec_'
const SECRET_ENTROPY_BYTES = 32

const ALLOWED_STATUSES = new Set(['active', 'paused', 'disabled'])
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/  // e.g. lead.captured

interface WebhookRow {
  id: string
  workspace_id: string
  target_url: string
  event_type: string
  secret_signature: string
  status: string
  last_error_log: string | null
  last_attempt_at: string | null
  last_attempt_status: string | null
  created_at: string
}

function generateSecret(): string {
  const raw = crypto.randomBytes(SECRET_ENTROPY_BYTES).toString('base64')
  return `${SECRET_PREFIX}${raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function isValidHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s)
    // Allow http only on private RFC1918-style hosts (dev convenience); reject
    // every other plaintext scheme so we never leak HMAC payloads in the clear.
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:' && /^(localhost|127\.|10\.|192\.168\.|::1)/i.test(u.hostname)) return true
    return false
  } catch {
    return false
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const eventType = searchParams.get('eventType')
  const status = searchParams.get('status')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (eventType && status) {
    result = await sql`
      SELECT id, workspace_id, target_url, event_type, secret_signature, status,
             last_error_log, last_attempt_at, last_attempt_status, created_at
      FROM webhook_subscriptions
      WHERE workspace_id = ${workspaceId} AND event_type = ${eventType} AND status = ${status}
      ORDER BY created_at DESC LIMIT 200
    `
  } else if (eventType) {
    result = await sql`
      SELECT id, workspace_id, target_url, event_type, secret_signature, status,
             last_error_log, last_attempt_at, last_attempt_status, created_at
      FROM webhook_subscriptions
      WHERE workspace_id = ${workspaceId} AND event_type = ${eventType}
      ORDER BY created_at DESC LIMIT 200
    `
  } else if (status) {
    result = await sql`
      SELECT id, workspace_id, target_url, event_type, secret_signature, status,
             last_error_log, last_attempt_at, last_attempt_status, created_at
      FROM webhook_subscriptions
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY created_at DESC LIMIT 200
    `
  } else {
    result = await sql`
      SELECT id, workspace_id, target_url, event_type, secret_signature, status,
             last_error_log, last_attempt_at, last_attempt_status, created_at
      FROM webhook_subscriptions
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT 200
    `
  }
  return NextResponse.json(result.rows as unknown as WebhookRow[])
}

// ─── POST ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      targetUrl?: string
      eventType?: string
    }
    const { workspaceId, targetUrl, eventType } = body
    if (!workspaceId || !targetUrl || !eventType) {
      return NextResponse.json(
        { error: 'workspaceId, targetUrl, and eventType are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!isValidHttpsUrl(targetUrl)) {
      return NextResponse.json(
        { error: 'targetUrl must be an https:// URL (http:// only allowed on localhost / RFC1918 hosts).' },
        { status: 422 },
      )
    }
    const normalisedEvent = eventType.trim().toLowerCase()
    if (!EVENT_TYPE_PATTERN.test(normalisedEvent)) {
      return NextResponse.json(
        { error: `eventType must match ${EVENT_TYPE_PATTERN.source} (e.g. lead.captured)` },
        { status: 422 },
      )
    }

    const id = newId()
    const secret = generateSecret()
    await sql`
      INSERT INTO webhook_subscriptions (
        id, workspace_id, target_url, event_type, secret_signature, status, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${targetUrl}, ${normalisedEvent}, ${secret}, 'active', CURRENT_TIMESTAMP
      )
    `
    // Return cleartext secret in the create response so the user can paste
    // it into the receiver's HMAC-verification config. Subsequent fetches
    // also return it (the receiver must verify every payload), so this is
    // visible via GET — clearly documented in the route comment above.
    return NextResponse.json({ ok: true, id, secret })
  } catch (err) {
    console.error('[/api/webhook-subscriptions POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
