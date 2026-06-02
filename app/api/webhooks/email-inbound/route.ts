/**
 * POST /api/webhooks/email-inbound
 *
 * Receives inbound subscriber email replies forwarded by Resend's (or any
 * compatible provider's) inbound routing. Creates inbox_conversations +
 * inbox_messages records.
 *
 *   Configure in Resend Dashboard → Inbound → Add route → this URL
 *
 * ─── 🛡️  Auto-Reply Shield ───────────────────────────────────────────────────
 * Before persisting OR firing any workflow trigger, we run a strict header /
 * subject inspection gate. The goal is to prevent infinite loops where an
 * auto-responder on the subscriber's mailbox (out-of-office, vacation reply,
 * mailbox-full bounce, etc.) replies to an AI-sent email and the AI replies
 * back, and so on forever burning tokens and provider quota.
 *
 * The gate fires on any of:
 *   - RFC 3834 `Auto-Submitted: auto-replied` (and `auto-generated`, `auto-notified`)
 *   - Microsoft `X-Auto-Response-Suppress: All / OOF / DR / NRN / RN`
 *   - Vendor `X-Autoreply: yes` / `X-Autorespond:` (any value)
 *   - `Precedence: bulk | junk | list | auto_reply`
 *   - `Return-Path: <>` (null-bouncer envelope)
 *   - `From:` addresses matching `mailer-daemon@`, `postmaster@`, `no-reply@*`
 *     or `noreply@*` (with a generous match)
 *   - Subjects starting with bounce-style phrases (Undelivered, Delivery
 *     Status Notification, Out of Office, Automatic reply, etc.)
 *
 * When the gate triggers we return 200 OK with `{ ok: true, suppressed:
 * <reason> }` so the provider considers the webhook successful (and won't
 * retry — retries would just re-evaluate the same headers anyway).
 *
 * If the gate does NOT trigger we treat the message as a genuine human
 * response and forward it into the existing inbox_messages schema.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql, newId } from '@/lib/db'
import { notifyNurtureReplyReceived } from '@/lib/notifications'

/**
 * Sprint 18Z (audit pass #8 P0 #3): Resend Svix signature verification.
 *
 * Header: `svix-signature` is a space-delimited list of `v1,<base64sig>` tuples.
 * Header: `svix-id` is the message id.
 * Header: `svix-timestamp` is unix seconds.
 *
 * The signed payload is `svix-id.svix-timestamp.rawBody` and the HMAC-SHA256
 * is computed with the webhook secret (stripped of the `whsec_` prefix Resend
 * uses) as a base64-decoded byte key.
 */
function verifySvixSignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET || ''
  if (!secret) {
    // Fail-closed in production. Dev convenience only.
    if (process.env.NODE_ENV === 'production') return false
    return true
  }
  const id = req.headers.get('svix-id') || ''
  const timestamp = req.headers.get('svix-timestamp') || ''
  const sigHeader = req.headers.get('svix-signature') || ''
  if (!id || !timestamp || !sigHeader) return false
  // Defend against replay — reject anything older than 5 minutes.
  const tsSec = parseInt(timestamp, 10)
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > 300) return false
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8')
  const signed = `${id}.${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', key).update(signed).digest('base64')
  // The header is "v1,<sig1> v1,<sig2> ..." — accept if any v1 matches.
  for (const part of sigHeader.split(' ')) {
    const [ver, candidate] = part.split(',')
    if (ver !== 'v1' || !candidate) continue
    try {
      if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) return true
    } catch { /* length mismatch — keep trying */ }
  }
  return false
}

export const runtime = 'nodejs'

interface ResendInboundPayload {
  from?: string
  to?: string | string[]
  subject?: string
  text?: string
  html?: string
  headers?: Record<string, string | string[]>
  messageId?: string
  envelope?: { from?: string; to?: string[] }
}

// Subject-line patterns that match common automated reply / bounce styles.
// Pattern order doesn't matter; matches are case-insensitive.
const AUTOREPLY_SUBJECT_PATTERNS: RegExp[] = [
  /^auto(matic)?\s*(reply|response)/i,
  /^out\s*of\s*office/i,
  /^away\s*from/i,
  /^vacation\s*(reply|notice|auto)/i,
  /^delivery\s*(status\s*)?notification/i,
  /^undeliverable/i,
  /^undelivered\s*mail/i,
  /^returned\s*mail/i,
  /^mail\s*delivery\s*failed/i,
  /^mailer-daemon/i,
  /^failure\s*notice/i,
  /^postmaster/i,
  /^non[-\s]?delivery/i,
]

// From-address local-parts that are virtually always automated senders.
const AUTOREPLY_FROM_PATTERNS: RegExp[] = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^no[-_.]?reply@/i,
  /^do[-_.]?not[-_.]?reply@/i,
  /^bounces?@/i,
  /^delivery[-_.]?status@/i,
  /^automated@/i,
]

/**
 * Normalise a header-bag (which may have arrays or differently-cased keys) to
 * a flat lower-case-keyed string→string map.
 */
function normaliseHeaders(raw: Record<string, string | string[]> | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const lower = k.toLowerCase().trim()
    out[lower] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

/**
 * Returns a non-null reason string if the message should be suppressed,
 * or null if it appears to be a genuine human reply.
 */
function detectAutoReply(payload: ResendInboundPayload): string | null {
  const headers = normaliseHeaders(payload.headers)
  const subject = (payload.subject || '').trim()
  const fromRaw = payload.from || ''
  const fromAddr = (fromRaw.match(/<([^>]+)>/)?.[1] || fromRaw).trim().toLowerCase()

  // 1. RFC 3834 — Auto-Submitted
  const autoSubmitted = (headers['auto-submitted'] || '').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') {
    return `auto-submitted:${autoSubmitted}`
  }

  // 2. Microsoft + vendor flags
  if (headers['x-autoreply']?.toLowerCase() === 'yes') return 'x-autoreply'
  if (headers['x-auto-response-suppress']) return `x-auto-response-suppress:${headers['x-auto-response-suppress']}`
  if (headers['x-autorespond']) return 'x-autorespond-present'

  // 3. Precedence header (legacy but still widely used by mailing lists)
  const precedence = (headers['precedence'] || '').toLowerCase()
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) {
    return `precedence:${precedence}`
  }

  // 4. Null Return-Path → bounce envelope
  const returnPath = (headers['return-path'] || '').trim()
  if (returnPath === '<>' || returnPath === '') {
    if (returnPath === '<>') return 'null-return-path'
  }

  // 5. From-address local-parts
  for (const p of AUTOREPLY_FROM_PATTERNS) {
    if (p.test(fromAddr)) return `from-pattern:${fromAddr}`
  }

  // 6. Subject-line patterns
  for (const p of AUTOREPLY_SUBJECT_PATTERNS) {
    if (p.test(subject)) return `subject-pattern:${p.source}`
  }

  // 7. List-Unsubscribe headers without a real human In-Reply-To are usually
  // newsletters/notifications, not real replies. We don't block on this alone
  // because real users sometimes reply from list-managed mailboxes — but if
  // it's combined with a no-Subject or empty body we treat it as automated.
  if (headers['list-unsubscribe'] && !payload.text && !payload.html) {
    return 'list-unsubscribe-with-empty-body'
  }

  return null
}

export async function POST(req: NextRequest) {
  // Sprint 18Z: read body as text first so we can HMAC-verify before parse.
  let rawBody = ''
  try { rawBody = await req.text() } catch { rawBody = '' }
  if (!verifySvixSignature(req, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  let payload: ResendInboundPayload
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // ─── 🛡️  Auto-Reply Shield ──────────────────────────────────────────────
  // Run this before ANY DB writes or workflow triggers. The 200 OK return
  // signals success to the provider so it stops retrying — we've deliberately
  // chosen not to persist the suppressed message at all (no inbox noise, no
  // potential to accidentally trigger downstream workflows).
  const suppressionReason = detectAutoReply(payload)
  if (suppressionReason) {
    console.log(`[email-inbound] suppressed: ${suppressionReason} | from="${payload.from}" subject="${payload.subject}"`)
    return NextResponse.json({
      ok: true,
      suppressed: suppressionReason,
      message: 'Auto-reply / bounce detected — message intentionally ignored to prevent loops.',
    })
  }

  // ─── Genuine human reply → forward into inbox schema ────────────────────
  try {
    const fromRaw = payload.from || ''
    const emailMatch = fromRaw.match(/<([^>]+)>/)
    const contactEmail = (emailMatch ? emailMatch[1] : fromRaw).trim().toLowerCase()
    const contactName = emailMatch
      ? fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
      : ''

    const toRaw = Array.isArray(payload.to) ? payload.to[0] : payload.to || ''
    const subject = payload.subject || '(no subject)'
    const body = payload.text || (payload.html || '').replace(/<[^>]+>/g, ' ').trim()
    const externalId = payload.messageId || ''

    if (!contactEmail || !body) {
      return NextResponse.json({ ok: true, skipped: 'no_email_or_body' })
    }

    // Sprint 18Z (audit pass #8 P0 #3): resolve workspace by the
    // recipient address (toRaw) only. The previous "fall back to first
    // workspace" path was a cross-tenant write — any forged inbound
    // could land in workspace #1's CRM.
    const toEmailMatch = toRaw.match(/<([^>]+)>/)
    const toEmail = (toEmailMatch ? toEmailMatch[1] : toRaw).trim().toLowerCase()
    let workspaceId: string | null = null
    if (toEmail) {
      // Match against the workspace's configured inbound address stored on
      // brand_profiles.approval_email (canonical for now). A later sprint
      // can introduce a dedicated inbound_addresses table.
      const bpResult = await sql`
        SELECT workspace_id FROM brand_profiles
        WHERE LOWER(approval_email) = ${toEmail} LIMIT 1
      `
      workspaceId = bpResult.rows[0]
        ? String((bpResult.rows[0] as { workspace_id?: string }).workspace_id)
        : null
    }
    if (!workspaceId) {
      // Cannot identify a workspace — refuse rather than guess.
      return NextResponse.json({ ok: true, skipped: 'no_matching_workspace' })
    }

    // Find or auto-create contact in CRM
    let contactId: string | null = null
    const crmResult = await sql`SELECT id FROM leads_captured WHERE workspace_id = ${workspaceId} AND email = ${contactEmail} LIMIT 1`
    if (crmResult.rows[0]) {
      contactId = String(crmResult.rows[0].id)
    } else {
      contactId = newId()
      await sql`
        INSERT INTO leads_captured (id, workspace_id, name, email, source, status, score)
        VALUES (${contactId}, ${workspaceId}, ${contactName || null}, ${contactEmail}, 'inbound_email', 'new', 0)
      `
    }

    // Find or open conversation
    const now = new Date().toISOString()
    let convId: string
    const existingConv = await sql`
      SELECT id FROM inbox_conversations
      WHERE workspace_id = ${workspaceId} AND contact_email = ${contactEmail} AND channel = 'email' AND status != 'closed'
      LIMIT 1
    `
    if (existingConv.rows[0]) {
      convId = String(existingConv.rows[0].id)
      await sql`
        UPDATE inbox_conversations
        SET last_message_at = ${now}, unread_count = unread_count + 1
        WHERE id = ${convId}
      `
    } else {
      convId = newId()
      await sql`
        INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, channel, subject, status, tags, last_message_at, unread_count, created_at)
        VALUES (${convId}, ${workspaceId}, ${contactId}, ${contactEmail}, ${contactName || null}, 'email', ${subject}, 'open', '[]', ${now}, 1, ${now})
      `
    }

    const msgId = newId()
    await sql`
      INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, from_address, to_address, subject, body, channel, status, external_id, sent_at, created_at)
      VALUES (${msgId}, ${convId}, ${workspaceId}, 'inbound', ${contactEmail}, ${toRaw}, ${subject}, ${body.slice(0, 10000)}, 'email', 'read', ${externalId}, ${now}, ${now})
    `

    // Bump subscriber engagement timestamp if this address is in our list
    try {
      await sql`
        UPDATE email_subscribers
        SET last_engaged_at = ${now}
        WHERE workspace_id = ${workspaceId} AND email = ${contactEmail}
      `
    } catch { /* column may be missing on legacy installs */ }

    // Sprint 15C (P1 #11): cancel pending nurture steps when a human replies.
    //
    // The audit found: an inbound reply did not break any in-flight nurture
    // sequence — the lead kept receiving scheduled emails after replying,
    // which is a real footgun. We cancel every pending workflow_pending_step
    // for this contact_email and emit a notification so the user can see
    // what got cancelled.
    try {
      const cancelRes = await sql`
        UPDATE workflow_pending_steps
        SET status = 'cancelled', error_message = ${'Cancelled — contact replied via inbox'}
        WHERE workspace_id = ${workspaceId}
          AND contact_email = ${contactEmail}
          AND status = 'pending'
      `
      // SQLite-style rowCount: prefer rowCount, fall back to a count query.
      const cancelled =
        (cancelRes as unknown as { rowCount?: number }).rowCount ??
        await (async () => {
          const r = await sql`
            SELECT COUNT(*) as c FROM workflow_pending_steps
            WHERE workspace_id = ${workspaceId}
              AND contact_email = ${contactEmail}
              AND status = 'cancelled'
              AND error_message = ${'Cancelled — contact replied via inbox'}
          `
          return Number((r.rows[0] as { c?: number } | undefined)?.c || 0)
        })()
      if (cancelled > 0) {
        await notifyNurtureReplyReceived(workspaceId, contactEmail, cancelled)
      }
    } catch (err) {
      console.error('[email-inbound] nurture cancel failed (non-fatal):', err)
    }

    // Fire `email_received` workflow trigger — but only for genuine humans.
    // The auto-reply shield above is what guarantees this can never loop.
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/workflows/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
      },
      body: JSON.stringify({
        workspaceId,
        triggerType: 'email_received',
        leadId: contactId,
        contactEmail,
        data: { subject, conversationId: convId },
      }),
    }).catch(e => console.error('Workflow trigger (email) failed:', e))

    return NextResponse.json({ ok: true, conversationId: convId, messageId: msgId })
  } catch (error) {
    console.error('Inbound email webhook error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
