/**
 * /api/call-logs
 *
 * Read-heavy CRUD over the inbound/outbound call ledger. The rows themselves
 * are usually written by the Vapi/Twilio webhook handlers — this endpoint
 * exists to feed the upcoming dashboard surfaces and to let humans annotate
 * an existing call (action_taken edit, manual sentiment override).
 *
 *   GET    ?workspaceId=…[&leadId=…][&voiceAgentId=…][&provider=…]
 *          [&callStatus=…][&since=ISO][&limit=200]
 *
 *   PATCH  { id, workspaceId, summary?, sentimentScore?, actionTaken?, callStatus? }
 *          → Lets reviewers fix up a row the LLM analysis flagged for
 *            "Manual review required". transcript/recording_url/from_number/etc.
 *            are immutable here (provenance).
 *
 *   DELETE ?id=…&workspaceId=…   (rarely used — call logs are evidence)
 *
 * GET supports a single-row fetch via ?id=… for the dashboard's detail drawer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set([
  'completed', 'voicemail', 'no_answer', 'busy', 'failed', 'in_progress', 'cancelled',
])

interface CallLogRow {
  id: string
  workspace_id: string
  voice_agent_id: string | null
  lead_id: string | null
  provider: string | null
  direction: string | null
  from_number: string | null
  to_number: string | null
  duration_seconds: number | string
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment_score: number | string | null
  call_status: string
  action_taken: string | null
  metadata_json: string
  created_at: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Single-row fetch (used by the dashboard detail drawer).
  const id = searchParams.get('id')
  if (id) {
    const single = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `
    const row = single.rows[0] as unknown as CallLogRow | undefined
    if (!row) return NextResponse.json({ error: 'Call log not found' }, { status: 404 })
    return NextResponse.json(row)
  }

  const leadId = searchParams.get('leadId')
  const voiceAgentId = searchParams.get('voiceAgentId')
  const provider = searchParams.get('provider')
  const callStatus = searchParams.get('callStatus')
  const since = searchParams.get('since')
  const limit = clamp(Number(searchParams.get('limit') || 200) || 200, 1, 500)

  // Branchy SELECT to keep the template-literal SQL tag happy while still
  // honouring the most common filter combinations. The (workspace_id,
  // created_at DESC) index covers every branch.
  if (leadId) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND lead_id = ${leadId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  if (voiceAgentId) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND voice_agent_id = ${voiceAgentId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  if (provider && callStatus) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND provider = ${provider} AND call_status = ${callStatus}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  if (provider) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND provider = ${provider}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  if (callStatus) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND call_status = ${callStatus}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  if (since) {
    const result = await sql`
      SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
             from_number, to_number, duration_seconds, recording_url,
             transcript, summary, sentiment_score, call_status, action_taken,
             metadata_json, created_at
      FROM call_logs
      WHERE workspace_id = ${workspaceId} AND created_at >= ${since}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return NextResponse.json(result.rows as unknown as CallLogRow[])
  }

  // Default — chronological feed (covered by idx_call_logs_workspace_recent)
  const result = await sql`
    SELECT id, workspace_id, voice_agent_id, lead_id, provider, direction,
           from_number, to_number, duration_seconds, recording_url,
           transcript, summary, sentiment_score, call_status, action_taken,
           metadata_json, created_at
    FROM call_logs
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC LIMIT ${limit}
  `
  return NextResponse.json(result.rows as unknown as CallLogRow[])
}

// ─── PATCH (limited fields — annotation only) ─────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string
      workspaceId?: string
      summary?: string
      sentimentScore?: number
      actionTaken?: string
      callStatus?: string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`
      SELECT id FROM call_logs WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Call log not found' }, { status: 404 })
    }

    if (body.callStatus && !ALLOWED_STATUSES.has(body.callStatus.toLowerCase())) {
      return NextResponse.json(
        { error: `callStatus must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
        { status: 422 },
      )
    }

    const sentiment =
      body.sentimentScore !== undefined ? clamp(Number(body.sentimentScore), 0, 1) : null
    const summary = body.summary !== undefined ? body.summary.slice(0, 8_000) : null
    const action = body.actionTaken !== undefined ? body.actionTaken.slice(0, 500) : null

    await sql`
      UPDATE call_logs SET
        summary         = COALESCE(${summary}, summary),
        sentiment_score = COALESCE(${sentiment}, sentiment_score),
        action_taken    = COALESCE(${action}, action_taken),
        call_status     = COALESCE(${body.callStatus?.toLowerCase() ?? null}, call_status)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/call-logs PATCH]', err)
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

  await sql`DELETE FROM call_logs WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
