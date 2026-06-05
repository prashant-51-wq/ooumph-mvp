/**
 * POST /api/webhooks/voice/vapi
 *
 * Post-call ingestion webhook for Vapi (and Retell AI — they ship the same
 * shape, so we route both through this handler). Vapi/Retell does the heavy
 * lifting on its side (LLM round-trips, STT, post-call summary, sentiment
 * tagging) and POSTs the final, normalised payload here when the call ends.
 *
 * Our job is therefore three steps, no telephony work:
 *
 *   1. Verify workspace ownership via x-internal-secret (the workspaceId is
 *      passed as a query param when the webhook URL is registered with Vapi).
 *      Vapi cannot present a session cookie, so we secure this with a shared
 *      secret. The workspaceId guarantee comes from the URL we ourselves
 *      generated at agent-provisioning time.
 *
 *   2. Resolve the caller phone → lead_id by hitting the indexed lookup we
 *      added in Sprint 8 Commit 1 (idx_leads_captured_phone). If the caller
 *      isn't yet in CRM the row stays with lead_id = NULL — the enrichment
 *      worker will back-fill it later.
 *
 *   3. Append a `call_logs` row carrying the transcript / summary / action
 *      / sentiment that Vapi pre-computed. This is a write-only path; we
 *      never PATCH this row again from this handler.
 *
 * Security:
 *   - Verifies x-vapi-secret header matches VAPI_WEBHOOK_SECRET if set.
 *     (Vapi can sign requests; we accept either the shared secret OR our
 *     internal secret for tests.)
 *   - workspaceId is REQUIRED in the query string. We refuse to write to
 *     `call_logs` without one — better to drop the webhook than mis-attribute.
 *
 * Reference Vapi payload shape (subset we depend on):
 *   {
 *     type: "end-of-call-report",
 *     call: { id, customer: { number }, phoneNumberId, assistantId,
 *             durationSeconds, recordingUrl, transcript, summary,
 *             analysis: { successEvaluation, structuredData },
 *             startedAt, endedAt, endedReason },
 *     message?: { ... }   // sometimes wrapped
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────

interface VapiPayloadCall {
  id?: string
  customer?: { number?: string; name?: string }
  phoneNumberId?: string
  phoneNumber?: { number?: string } | string
  assistantId?: string
  durationSeconds?: number
  recordingUrl?: string
  transcript?: string
  summary?: string
  analysis?: {
    successEvaluation?: string | boolean | number
    summary?: string
    structuredData?: Record<string, unknown>
    sentimentScore?: number
  }
  startedAt?: string
  endedAt?: string
  endedReason?: string
  status?: string
  type?: string  // 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall'
}

interface VapiWebhookPayload {
  type?: string
  call?: VapiPayloadCall
  message?: { call?: VapiPayloadCall; type?: string }
  // Retell variant — top-level fields
  call_id?: string
  from_number?: string
  to_number?: string
  transcript?: string
  call_analysis?: { call_summary?: string; user_sentiment?: string }
  recording_url?: string
  duration_ms?: number
}

interface VoiceAgentRow {
  id: string
  workspace_id: string
}

interface LeadRow {
  id: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a Vapi success-evaluation field (string|number|bool) into a
 * normalised 0..1 numeric for the sentiment_score column. We're conservative
 * here — if we can't interpret the field, we store NULL rather than fake a
 * value, since downstream analytics treat sentiment as a confidence signal.
 */
function normaliseSentiment(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: Vapi sometimes returns a -1..1 polarity, sometimes 0..1
    if (raw >= -1 && raw <= 1) return Math.max(0, Math.min(1, (raw + 1) / 2 === raw ? raw : (raw + 1) / 2))
    if (raw >= 0 && raw <= 100) return raw / 100
  }
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase()
    if (lower === 'positive' || lower === 'success' || lower === 'true') return 0.85
    if (lower === 'neutral' || lower === 'partial') return 0.55
    if (lower === 'negative' || lower === 'failure' || lower === 'false') return 0.2
    const n = Number(lower)
    if (Number.isFinite(n)) return normaliseSentiment(n)
  }
  return null
}

/** Strip a phone string down to the digits we can match against CRM. */
function normalisePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  return digits.length >= 6 ? digits : null
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth (shared secret) ──
    const expected = process.env.VAPI_WEBHOOK_SECRET || ''
    const internal = process.env.ADMIN_SECRET || ''
    const provided =
      req.headers.get('x-vapi-secret') ||
      req.headers.get('x-internal-secret') ||
      ''
    // Fail-closed: if neither secret is configured the endpoint is locked.
    // Dev bypass only when NODE_ENV !== 'production'.
    const isDev = process.env.NODE_ENV !== 'production'
    const cronOrAdminOk =
      provided && ((expected && provided === expected) || (internal && provided === internal))
    if (!cronOrAdminOk && (!isDev || expected || internal)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Workspace identity ──
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query param required' }, { status: 400 })
    }

    // ── Parse payload ──
    const body = (await req.json()) as VapiWebhookPayload
    const call: VapiPayloadCall = body.call || body.message?.call || ({} as VapiPayloadCall)

    // The Vapi message envelope only matters for some event types; we only
    // process completed calls. Anything else (transcript-delta, status-update)
    // we acknowledge with 200 so Vapi stops retrying, but we don't write.
    const eventType = (body.type || body.message?.type || '').toLowerCase()
    const isCompletedCall =
      !eventType ||
      eventType === 'end-of-call-report' ||
      eventType === 'call.ended' ||
      eventType === 'call_analyzed' ||  // Retell
      Boolean(call.endedAt) ||
      Boolean(body.transcript)

    if (!isCompletedCall) {
      return NextResponse.json({ ok: true, ignored: true, reason: `event '${eventType}' not terminal` })
    }

    // ── Extract caller phone + agent (Vapi or Retell shape) ──
    const customerNumber = normalisePhone(
      call.customer?.number ||
        (typeof call.phoneNumber === 'string' ? call.phoneNumber : call.phoneNumber?.number) ||
        body.from_number,
    )
    const direction =
      (call.type === 'outboundPhoneCall' ? 'outbound' : null) ||
      (call.type === 'inboundPhoneCall' ? 'inbound' : null) ||
      'inbound'

    // ── Resolve voice_agent (best-effort) ──
    // Vapi assistantId → our voice_agents table needs an external_provider_id
    // column to link cleanly, which we'll add when /api/voice-agents creates
    // the provider-side asset. For now we match by the phone number on the
    // workspace's roster — the indexed unique lookup we added in Commit 1.
    let voiceAgentId: string | null = null
    const toNumber = normalisePhone(
      (typeof call.phoneNumber === 'string' ? call.phoneNumber : call.phoneNumber?.number) ||
        body.to_number,
    )
    if (toNumber) {
      const agentRes = await sql`
        SELECT id, workspace_id FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND phone_number = ${toNumber}
        LIMIT 1
      `
      const agent = agentRes.rows[0] as unknown as VoiceAgentRow | undefined
      if (agent) voiceAgentId = agent.id
    }

    // ── Resolve lead_id from caller phone ──
    let leadId: string | null = null
    if (customerNumber) {
      const leadRes = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND phone = ${customerNumber}
        LIMIT 1
      `
      const lead = leadRes.rows[0] as unknown as LeadRow | undefined
      if (lead) leadId = lead.id
    }

    // ── Extract Vapi-side pre-computed fields ──
    const transcript = (call.transcript || body.transcript || '').toString().slice(0, 80_000)
    const summary = (
      call.summary ||
      call.analysis?.summary ||
      body.call_analysis?.call_summary ||
      ''
    )
      .toString()
      .slice(0, 8_000)

    const sentimentScore = normaliseSentiment(
      call.analysis?.sentimentScore ??
        call.analysis?.successEvaluation ??
        body.call_analysis?.user_sentiment,
    )

    // action_taken: prefer Vapi's structuredData.action if present, else a
    // human-readable endedReason. structuredData is workspace-defined so we
    // stringify a single primitive field rather than dumping the whole blob.
    const structured = call.analysis?.structuredData
    const actionTaken: string | null = (() => {
      if (structured && typeof structured === 'object') {
        const candidates = ['action', 'next_step', 'outcome', 'disposition']
        for (const k of candidates) {
          const v = (structured as Record<string, unknown>)[k]
          if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 500)
        }
      }
      if (call.endedReason) return call.endedReason.toString().slice(0, 500)
      return null
    })()

    const durationSeconds = (() => {
      if (typeof call.durationSeconds === 'number' && Number.isFinite(call.durationSeconds)) {
        return Math.max(0, Math.floor(call.durationSeconds))
      }
      if (typeof body.duration_ms === 'number' && Number.isFinite(body.duration_ms)) {
        return Math.max(0, Math.floor(body.duration_ms / 1000))
      }
      if (call.startedAt && call.endedAt) {
        const ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()
        if (Number.isFinite(ms) && ms >= 0) return Math.floor(ms / 1000)
      }
      return 0
    })()

    const callStatus = (() => {
      const reason = (call.endedReason || '').toLowerCase()
      if (reason.includes('voicemail')) return 'voicemail'
      if (reason.includes('no-answer') || reason.includes('no_answer')) return 'no_answer'
      if (reason.includes('busy')) return 'busy'
      if (reason.includes('failed') || reason.includes('error')) return 'failed'
      return 'completed'
    })()

    // ── Persist ──
    const id = newId()
    await sql`
      INSERT INTO call_logs (
        id, workspace_id, voice_agent_id, lead_id, provider, direction,
        from_number, to_number, duration_seconds, recording_url,
        transcript, summary, sentiment_score, call_status, action_taken,
        metadata_json, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${voiceAgentId}, ${leadId}, 'vapi', ${direction},
        ${customerNumber}, ${toNumber}, ${durationSeconds}, ${call.recordingUrl || body.recording_url || null},
        ${transcript || null}, ${summary || null}, ${sentimentScore}, ${callStatus}, ${actionTaken},
        ${JSON.stringify({ vapi_call_id: call.id || body.call_id || null, ended_reason: call.endedReason || null }).slice(0, 8000)},
        CURRENT_TIMESTAMP
      )
    `

    return NextResponse.json({
      ok: true,
      id,
      matchedLeadId: leadId,
      matchedVoiceAgentId: voiceAgentId,
      provider: 'vapi',
    })
  } catch (err) {
    console.error('[webhooks/voice/vapi]', err)
    // Vapi retries 5xx aggressively; for handler bugs we still want them to
    // back off, so we return 200 + ok:false so retry storms don't pile up
    // when our payload schema drifts. The console.error captures the cause.
    return NextResponse.json({ ok: false, error: String(err) })
  }
}
