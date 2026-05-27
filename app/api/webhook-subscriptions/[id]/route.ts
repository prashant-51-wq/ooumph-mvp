/**
 * /api/webhook-subscriptions/[id]
 *
 *   GET    ?workspaceId=…                      → single subscription detail
 *   PATCH  { workspaceId, status?, targetUrl?, eventType?, rotateSecret? }
 *          → Status flips and target edits. Set rotateSecret=true to mint a
 *            new whsec_ value (returned ONCE in the response).
 *   DELETE ?workspaceId=…                      → hard remove. Past
 *                                                  `notifications` rows
 *                                                  carrying a download href
 *                                                  remain intact for the
 *                                                  engineering audit trail.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const SECRET_PREFIX = 'whsec_'
const SECRET_ENTROPY_BYTES = 32

const ALLOWED_STATUSES = new Set(['active', 'paused', 'disabled'])
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

interface RouteCtx {
  params: Promise<{ id: string }>
}

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
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:' && /^(localhost|127\.|10\.|192\.168\.|::1)/i.test(u.hostname)) return true
    return false
  } catch {
    return false
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, target_url, event_type, secret_signature, status,
           last_error_log, last_attempt_at, last_attempt_status, created_at
    FROM webhook_subscriptions
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const row = result.rows[0] as unknown as WebhookRow | undefined
  if (!row) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  return NextResponse.json(row)
}

// ─── PATCH ────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = await req.json() as {
      workspaceId?: string
      status?: string
      targetUrl?: string
      eventType?: string
      rotateSecret?: boolean
    }
    const { workspaceId } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`
      SELECT id FROM webhook_subscriptions WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    if (body.status && !ALLOWED_STATUSES.has(body.status.toLowerCase())) {
      return NextResponse.json(
        { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
        { status: 422 },
      )
    }
    if (body.targetUrl && !isValidHttpsUrl(body.targetUrl)) {
      return NextResponse.json(
        { error: 'targetUrl must be an https:// URL (http:// only on localhost / RFC1918).' },
        { status: 422 },
      )
    }
    let normalisedEvent: string | null = null
    if (body.eventType) {
      normalisedEvent = body.eventType.trim().toLowerCase()
      if (!EVENT_TYPE_PATTERN.test(normalisedEvent)) {
        return NextResponse.json(
          { error: `eventType must match ${EVENT_TYPE_PATTERN.source}` },
          { status: 422 },
        )
      }
    }

    const newSecret = body.rotateSecret ? generateSecret() : null

    await sql`
      UPDATE webhook_subscriptions SET
        status           = COALESCE(${body.status?.toLowerCase() ?? null}, status),
        target_url       = COALESCE(${body.targetUrl ?? null}, target_url),
        event_type       = COALESCE(${normalisedEvent}, event_type),
        secret_signature = COALESCE(${newSecret}, secret_signature)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `

    // Return rotated secret in the response if and only if rotation happened.
    return NextResponse.json({ ok: true, ...(newSecret ? { secret: newSecret } : {}) })
  } catch (err) {
    console.error('[/api/webhook-subscriptions PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`DELETE FROM webhook_subscriptions WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
