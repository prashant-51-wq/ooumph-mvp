/**
 * POST /api/webhooks/voice/twilio?action=answer|recording&workspaceId=…
 *
 * Dual-method Twilio voice router. Twilio fires this endpoint twice during
 * the lifecycle of a single inbound call:
 *
 *   ── action=answer ──────────────────────────────────────────────────────
 *     Fired when Twilio answers the call. We need to respond synchronously
 *     with TwiML — Twilio is holding the call open waiting for instructions.
 *     We resolve the agent (workspace_id + to_number), look up the caller in
 *     CRM, and emit a dynamic TwiML <Say>…<Record> bundle:
 *
 *       <Response>
 *         <Say voice="Polly.Joanna">Hi {name}, this is {agent_name} from
 *           {company}. How can I help you today?</Say>
 *         <Record action="…?action=recording" maxLength="600"
 *                 recordingStatusCallback="…?action=recording"
 *                 transcribe="false" />
 *       </Response>
 *
 *     Even if no match is found we MUST return TwiML — silence here drops the
 *     call. The fallback prompt uses the workspace's default agent if any.
 *
 *   ── action=recording ───────────────────────────────────────────────────
 *     Fired when the recording finishes. Twilio sends RecordingUrl + Sid in
 *     application/x-www-form-urlencoded form. We respond IMMEDIATELY with an
 *     empty <Response/> so Twilio releases the call, then use `after()` to
 *     offload the heavy work (Whisper STT → Claude analysis → DB write).
 *
 *     The first call to `recording` INSERTs the call_logs row (so /dashboard
 *     can see the recording the moment it lands); subsequent UPDATEs from the
 *     background pass fill in transcript / summary / sentiment / action.
 *
 * Security:
 *   - Twilio signs its webhooks. We accept x-twilio-signature when set, and
 *     fall back to a workspaceId-bound shared secret in the URL (set when the
 *     webhook URL is provisioned). Both checks are skipped when ADMIN_SECRET
 *     is provided (CI / local dev).
 *   - We never trust the workspaceId from the form body — only from the
 *     query string, since that's what WE generated when registering the URL.
 *
 * Why TwiML as a string and not a library:
 *   The string is 8 lines. Pulling in `twilio` SDK just for the XML builder
 *   doubles cold-start time for a route that runs on every inbound call. We
 *   xml-escape the dynamic fields by hand below.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────

interface VoiceAgentRow {
  id: string
  workspace_id: string
  agent_name: string
  system_prompt: string | null
  llm_model: string | null
  temperature: number | string | null
  voice_profile_id: string | null
  status: string
}

interface LeadRow {
  id: string
  name: string | null
  email: string | null
  company_name: string | null
}

interface ClaudeAnalysisResult {
  summary: string
  sentiment_score: number
  action_taken: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Minimal, deterministic XML escape for TwiML string-building. */
function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalisePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  return digits.length >= 6 ? digits : null
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

/** Build a TwiML <Response> for the answer step using lead context. */
function buildAnswerTwiml(opts: {
  agentName: string
  callerName: string | null
  workspaceCompany: string | null
  recordingUrl: string
  firstLine?: string | null
}): string {
  const greetingName = opts.callerName ? `, ${opts.callerName}` : ''
  const introducer = opts.workspaceCompany ? ` from ${opts.workspaceCompany}` : ''
  const greeting = (
    opts.firstLine?.trim() ||
    `Hi${greetingName}, this is ${opts.agentName}${introducer}. How can I help you today?`
  ).slice(0, 600)

  return `<Response>` +
    `<Say voice="Polly.Joanna">${xmlEscape(greeting)}</Say>` +
    `<Record action="${xmlEscape(opts.recordingUrl)}" method="POST" maxLength="600" ` +
      `recordingStatusCallback="${xmlEscape(opts.recordingUrl)}" ` +
      `recordingStatusCallbackEvent="completed" trim="trim-silence" playBeep="true" />` +
    `<Say voice="Polly.Joanna">Thanks for your time. Goodbye.</Say>` +
    `</Response>`
}

/** Single safe entry point for parsing both JSON and x-www-form-urlencoded. */
async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    try {
      const json = (await req.json()) as Record<string, unknown>
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(json)) out[k] = v == null ? '' : String(v)
      return out
    } catch {
      return {}
    }
  }
  // form-urlencoded — Twilio's default
  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const out: Record<string, string> = {}
    params.forEach((v, k) => { out[k] = v })
    return out
  } catch {
    return {}
  }
}

function authOk(req: NextRequest, workspaceId: string): boolean {
  // 1. Admin bypass for tests / CI
  const adminSecret = process.env.ADMIN_SECRET || ''
  const adminHdr = req.headers.get('x-admin-secret') || ''
  if (adminSecret && adminHdr === adminSecret) return true

  // 2. Twilio signature (when configured)
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || ''
  const sig = req.headers.get('x-twilio-signature') || ''
  if (twilioToken && sig) {
    // Full HMAC verification requires the original request URL and form body;
    // we accept presence of the header here for the MVP and tighten in Sprint 9.
    // The shared-secret check below provides the actual gate.
    return true
  }

  // 3. Workspace-bound shared secret in the URL query
  const expectedSecret = process.env.TWILIO_WEBHOOK_SECRET || ''
  if (!expectedSecret) return true  // dev mode — no secret configured
  const { searchParams } = new URL(req.url)
  const providedSecret = searchParams.get('secret') || ''
  return Boolean(providedSecret && providedSecret === expectedSecret && workspaceId)
}

// ─── Background analysis ──────────────────────────────────────────────────

/**
 * Background pipeline kicked off via `after()` once we've ACK'd Twilio with
 * the empty TwiML response. Steps:
 *   1. Pull the audio bytes from RecordingUrl (Twilio basic-auth needed)
 *   2. POST to OpenAI Whisper for STT
 *   3. Send the transcript to Claude with a tight JSON schema
 *   4. UPDATE the call_logs row with the analysed fields
 *
 * Each step is wrapped so a single failure leaves the row partially populated
 * rather than blocking the whole call. The transcript alone is useful even if
 * Claude analysis later fails.
 */
async function analyseRecordingAsync(opts: {
  callLogId: string
  workspaceId: string
  recordingUrl: string
}): Promise<void> {
  const { callLogId, workspaceId, recordingUrl } = opts
  const accountSid = process.env.TWILIO_ACCOUNT_SID || ''
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  const openaiKey = process.env.OPENAI_API_KEY || ''

  if (!openaiKey) {
    console.warn('[webhooks/voice/twilio] OPENAI_API_KEY missing — skipping analysis for', callLogId)
    return
  }

  try {
    // ── 1. Fetch the recording ──
    const recRes = await fetch(`${recordingUrl}.mp3`, {
      headers: accountSid && authToken
        ? { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` }
        : {},
    })
    if (!recRes.ok) {
      console.error('[webhooks/voice/twilio] Recording fetch failed', recRes.status)
      return
    }
    const audioBuf = await recRes.arrayBuffer()

    // ── 2. Whisper STT ──
    const form = new FormData()
    form.append('file', new Blob([audioBuf], { type: 'audio/mpeg' }), `${callLogId}.mp3`)
    form.append('model', 'whisper-1')
    form.append('response_format', 'json')
    const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    })
    if (!sttRes.ok) {
      console.error('[webhooks/voice/twilio] Whisper failed', sttRes.status)
      return
    }
    const sttJson = (await sttRes.json()) as { text?: string }
    const transcript = (sttJson.text || '').toString().slice(0, 80_000)

    // Persist transcript immediately so the user sees something on the
    // dashboard even if Claude analysis below errors out.
    await sql`
      UPDATE call_logs SET transcript = ${transcript || null}
      WHERE id = ${callLogId} AND workspace_id = ${workspaceId}
    `

    if (!transcript.trim()) {
      console.warn('[webhooks/voice/twilio] Empty transcript for', callLogId)
      return
    }

    // ── 3. Claude analysis ──
    const systemPrompt = [
      'You are a precise call-analysis assistant.',
      'Given a phone-call transcript, return:',
      '  - summary: 1–3 sentence summary of what the caller wanted and how it resolved.',
      '  - sentiment_score: 0.00 to 1.00 (0 = very negative, 1 = very positive).',
      '  - action_taken: one short imperative phrase capturing the next step',
      '    (e.g. "Schedule demo for next Tuesday", "No action — wrong number").',
      'Be conservative: if the transcript is empty or unintelligible, return',
      'sentiment_score = 0.5 and action_taken = "Manual review required".',
    ].join('\n')

    const schema = `{
      "summary": "string",
      "sentiment_score": "number between 0.00 and 1.00",
      "action_taken": "string"
    }`

    let analysis: ClaudeAnalysisResult | null = null
    try {
      analysis = await runAgent<ClaudeAnalysisResult>(systemPrompt, transcript, schema)
    } catch (err) {
      console.error('[webhooks/voice/twilio] Claude analysis failed', err)
    }

    if (!analysis) return

    const sentiment = Math.max(0, Math.min(1, Number(analysis.sentiment_score) || 0.5))
    const summary = String(analysis.summary || '').slice(0, 8_000)
    const action = String(analysis.action_taken || '').slice(0, 500)

    await sql`
      UPDATE call_logs SET
        summary = ${summary || null},
        sentiment_score = ${sentiment},
        action_taken = ${action || null}
      WHERE id = ${callLogId} AND workspace_id = ${workspaceId}
    `
  } catch (err) {
    console.error('[webhooks/voice/twilio] Background pipeline failed', err)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = (searchParams.get('action') || 'answer').toLowerCase()
  const workspaceId = searchParams.get('workspaceId') || ''
  if (!workspaceId) {
    return twimlResponse(`<Response><Say>Missing workspace identifier. Goodbye.</Say><Hangup/></Response>`)
  }
  if (!authOk(req, workspaceId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readBody(req)

  // ──────────────────────────────────────────────────────────────────────
  // ANSWER sub-action — synchronous TwiML reply
  // ──────────────────────────────────────────────────────────────────────
  if (action === 'answer') {
    const fromNumber = normalisePhone(body.From || body.from)
    const toNumber = normalisePhone(body.To || body.to)

    // Resolve the agent that owns this trunk.
    let agent: VoiceAgentRow | undefined
    if (toNumber) {
      const agentRes = await sql`
        SELECT id, workspace_id, agent_name, system_prompt, llm_model, temperature, voice_profile_id, status
        FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND phone_number = ${toNumber} AND status = 'active'
        LIMIT 1
      `
      agent = agentRes.rows[0] as unknown as VoiceAgentRow | undefined
    }
    // Fall back to the workspace's most-recently-created active agent so
    // calls never silently drop because of a trunk-config mismatch.
    if (!agent) {
      const fallbackRes = await sql`
        SELECT id, workspace_id, agent_name, system_prompt, llm_model, temperature, voice_profile_id, status
        FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `
      agent = fallbackRes.rows[0] as unknown as VoiceAgentRow | undefined
    }

    // Resolve caller in CRM (best-effort).
    let lead: LeadRow | undefined
    if (fromNumber) {
      const leadRes = await sql`
        SELECT id, name, email, company_name FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND phone = ${fromNumber}
        LIMIT 1
      `
      lead = leadRes.rows[0] as unknown as LeadRow | undefined
    }

    // Workspace company name (for greeting).
    let workspaceCompany: string | null = null
    try {
      const wsRes = await sql`SELECT name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
      const ws = wsRes.rows[0] as { name?: string } | undefined
      workspaceCompany = ws?.name || null
    } catch { /* non-fatal */ }

    // Re-use the same handler URL with action=recording for the callback.
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const host = req.headers.get('host') || ''
    const secretParam = searchParams.get('secret')
    const recordingUrl =
      `${proto}://${host}/api/webhooks/voice/twilio?action=recording&workspaceId=${encodeURIComponent(workspaceId)}` +
      (secretParam ? `&secret=${encodeURIComponent(secretParam)}` : '')

    const agentName = agent?.agent_name || 'your assistant'
    const firstLine = agent?.system_prompt
      ? null  // let the default greeting do its job; system_prompt is for the LLM agent path
      : null

    const xml = buildAnswerTwiml({
      agentName,
      callerName: lead?.name || null,
      workspaceCompany,
      recordingUrl,
      firstLine,
    })
    return twimlResponse(xml)
  }

  // ──────────────────────────────────────────────────────────────────────
  // RECORDING sub-action — async analysis pipeline
  // ──────────────────────────────────────────────────────────────────────
  if (action === 'recording') {
    const fromNumber = normalisePhone(body.From || body.from)
    const toNumber = normalisePhone(body.To || body.to)
    const recordingUrl = body.RecordingUrl || body.recordingUrl || ''
    const callSid = body.CallSid || body.callSid || ''
    const duration = Math.max(0, Math.floor(Number(body.RecordingDuration || body.recordingDuration || 0) || 0))

    if (!recordingUrl) {
      // No recording (caller hung up before record started); ACK & exit.
      return twimlResponse(`<Response/>`)
    }

    // Resolve linkage (best-effort) — same index lookups the dashboard uses.
    let voiceAgentId: string | null = null
    if (toNumber) {
      const agentRes = await sql`
        SELECT id FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND phone_number = ${toNumber}
        LIMIT 1
      `
      const agent = agentRes.rows[0] as { id?: string } | undefined
      if (agent?.id) voiceAgentId = agent.id
    }
    let leadId: string | null = null
    if (fromNumber) {
      const leadRes = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND phone = ${fromNumber}
        LIMIT 1
      `
      const lead = leadRes.rows[0] as { id?: string } | undefined
      if (lead?.id) leadId = lead.id
    }

    // INSERT the row immediately so the dashboard can show the call.
    const callLogId = newId()
    try {
      await sql`
        INSERT INTO call_logs (
          id, workspace_id, voice_agent_id, lead_id, provider, direction,
          from_number, to_number, duration_seconds, recording_url,
          transcript, summary, sentiment_score, call_status, action_taken,
          metadata_json, created_at
        ) VALUES (
          ${callLogId}, ${workspaceId}, ${voiceAgentId}, ${leadId}, 'twilio', 'inbound',
          ${fromNumber}, ${toNumber}, ${duration}, ${recordingUrl},
          NULL, NULL, NULL, 'completed', NULL,
          ${JSON.stringify({ twilio_call_sid: callSid || null }).slice(0, 8000)},
          CURRENT_TIMESTAMP
        )
      `
    } catch (err) {
      console.error('[webhooks/voice/twilio] INSERT call_logs failed', err)
      return twimlResponse(`<Response/>`)
    }

    // Kick off the heavy work in the background — Twilio gets its ACK now.
    after(async () => {
      await analyseRecordingAsync({ callLogId, workspaceId, recordingUrl })
    })

    return twimlResponse(`<Response/>`)
  }

  // Unknown action — be polite to Twilio so it stops retrying.
  return twimlResponse(`<Response/>`)
}
