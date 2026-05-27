/**
 * /api/voice-agents
 *
 * CRUD for configured AI voice agents. Each row links a workspace to a
 * phone-number trunk and the prompt/voice/model configuration that should
 * answer when the number rings.
 *
 *   GET    ?workspaceId=…[&status=active]
 *   POST   { workspaceId, agentName, phoneNumber?, voiceProfileId?, provider?,
 *            systemPrompt?, temperature?, llmModel?, status? }
 *   PATCH  { id, workspaceId, …any of the above patch fields }
 *   DELETE ?id=…&workspaceId=…
 *
 * The composite UNIQUE (workspace_id, phone_number) we added in Sprint 8
 * Commit 1 is enforced here with a clean 409 — a friendlier surface than
 * letting the Postgres error message bubble through.
 *
 * Note: provisioning the agent on the *provider side* (creating the Vapi
 * assistant + binding the phone number) is the responsibility of the worker
 * that calls this route, not this CRUD. We just persist the workspace's
 * intent. Sprint 8 Commit 3 will wire the UI; Sprint 8 worker (next ticket)
 * adds the actual Vapi/Retell side-effect on POST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_PROVIDERS = new Set(['vapi', 'retell', 'twilio'])
const ALLOWED_STATUSES = new Set(['active', 'paused', 'draft', 'archived'])
const MAX_PROMPT_CHARS = 16_000

interface VoiceAgentRow {
  id: string
  workspace_id: string
  voice_profile_id: string | null
  provider: string
  agent_name: string
  phone_number: string | null
  system_prompt: string | null
  temperature: number | string | null
  llm_model: string | null
  status: string
  created_at: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function normalisePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.trim().replace(/[^\d+]/g, '')
  return digits.length >= 6 ? digits : null
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
        SELECT id, workspace_id, voice_profile_id, provider, agent_name, phone_number,
               system_prompt, temperature, llm_model, status, created_at
        FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND status = ${status}
        ORDER BY created_at DESC LIMIT 200
      `
    : await sql`
        SELECT id, workspace_id, voice_profile_id, provider, agent_name, phone_number,
               system_prompt, temperature, llm_model, status, created_at
        FROM voice_agents
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC LIMIT 200
      `
  return NextResponse.json(result.rows as unknown as VoiceAgentRow[])
}

// ─── POST ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspaceId?: string
      agentName?: string
      phoneNumber?: string
      voiceProfileId?: string | null
      provider?: string
      systemPrompt?: string
      temperature?: number
      llmModel?: string
      status?: string
    }
    const { workspaceId, agentName } = body
    if (!workspaceId || !agentName?.trim()) {
      return NextResponse.json(
        { error: 'workspaceId and agentName are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const provider = (body.provider || 'vapi').toLowerCase()
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return NextResponse.json(
        { error: `provider must be one of ${Array.from(ALLOWED_PROVIDERS).join(', ')}` },
        { status: 422 },
      )
    }
    const status = (body.status || 'active').toLowerCase()
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
        { status: 422 },
      )
    }
    const phoneNumber = normalisePhone(body.phoneNumber)
    const temperature = body.temperature !== undefined ? clamp(Number(body.temperature), 0, 2) : 0.7
    const llmModel = body.llmModel?.trim() || 'gpt-4o'
    const systemPrompt = (body.systemPrompt || '').slice(0, MAX_PROMPT_CHARS) || null
    const voiceProfileId = body.voiceProfileId?.trim() || null

    // Pre-check the composite UNIQUE so we can return a friendlier 409.
    if (phoneNumber) {
      const dupe = await sql`
        SELECT id FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND phone_number = ${phoneNumber}
        LIMIT 1
      `
      if (dupe.rows[0]) {
        return NextResponse.json(
          {
            error: 'Another voice agent is already attached to this phone number in this workspace.',
            phoneNumber,
            existingAgentId: (dupe.rows[0] as { id?: string }).id,
          },
          { status: 409 },
        )
      }
    }
    // If a voice_profile_id was supplied, verify it belongs to the same workspace.
    if (voiceProfileId) {
      const vp = await sql`
        SELECT id FROM voice_profiles
        WHERE id = ${voiceProfileId} AND workspace_id = ${workspaceId}
        LIMIT 1
      `
      if (!vp.rows[0]) {
        return NextResponse.json(
          { error: 'voiceProfileId does not belong to this workspace' },
          { status: 422 },
        )
      }
    }

    const id = newId()
    await sql`
      INSERT INTO voice_agents (
        id, workspace_id, voice_profile_id, provider, agent_name, phone_number,
        system_prompt, temperature, llm_model, status, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${voiceProfileId}, ${provider}, ${agentName.trim()},
        ${phoneNumber}, ${systemPrompt}, ${temperature}, ${llmModel}, ${status},
        CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({ ok: true, id, status })
  } catch (err) {
    console.error('[/api/voice-agents POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string
      workspaceId?: string
      agentName?: string
      phoneNumber?: string | null
      voiceProfileId?: string | null
      provider?: string
      systemPrompt?: string
      temperature?: number
      llmModel?: string
      status?: string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`
      SELECT id FROM voice_agents WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Voice agent not found' }, { status: 404 })
    }

    // Validation parity with POST.
    if (body.provider && !ALLOWED_PROVIDERS.has(body.provider.toLowerCase())) {
      return NextResponse.json(
        { error: `provider must be one of ${Array.from(ALLOWED_PROVIDERS).join(', ')}` },
        { status: 422 },
      )
    }
    if (body.status && !ALLOWED_STATUSES.has(body.status.toLowerCase())) {
      return NextResponse.json(
        { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
        { status: 422 },
      )
    }

    const phoneNumber = body.phoneNumber === null ? null : normalisePhone(body.phoneNumber)
    // Composite UNIQUE pre-check on PATCH too (skip when phoneNumber explicitly cleared).
    if (phoneNumber) {
      const dupe = await sql`
        SELECT id FROM voice_agents
        WHERE workspace_id = ${workspaceId} AND phone_number = ${phoneNumber} AND id <> ${id}
        LIMIT 1
      `
      if (dupe.rows[0]) {
        return NextResponse.json(
          {
            error: 'Another voice agent is already attached to this phone number in this workspace.',
            phoneNumber,
            existingAgentId: (dupe.rows[0] as { id?: string }).id,
          },
          { status: 409 },
        )
      }
    }
    if (body.voiceProfileId !== undefined && body.voiceProfileId !== null) {
      const vp = await sql`
        SELECT id FROM voice_profiles
        WHERE id = ${body.voiceProfileId} AND workspace_id = ${workspaceId}
        LIMIT 1
      `
      if (!vp.rows[0]) {
        return NextResponse.json(
          { error: 'voiceProfileId does not belong to this workspace' },
          { status: 422 },
        )
      }
    }

    const temperature =
      body.temperature !== undefined ? clamp(Number(body.temperature), 0, 2) : null
    const systemPrompt =
      body.systemPrompt !== undefined ? body.systemPrompt.slice(0, MAX_PROMPT_CHARS) : null

    await sql`
      UPDATE voice_agents SET
        agent_name       = COALESCE(${body.agentName?.trim() ?? null}, agent_name),
        phone_number     = COALESCE(${phoneNumber}, phone_number),
        voice_profile_id = COALESCE(${body.voiceProfileId ?? null}, voice_profile_id),
        provider         = COALESCE(${body.provider?.toLowerCase() ?? null}, provider),
        system_prompt    = COALESCE(${systemPrompt}, system_prompt),
        temperature      = COALESCE(${temperature}, temperature),
        llm_model        = COALESCE(${body.llmModel?.trim() ?? null}, llm_model),
        status           = COALESCE(${body.status?.toLowerCase() ?? null}, status)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/voice-agents PATCH]', err)
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

  // call_logs.voice_agent_id has ON DELETE SET NULL, so deleting an agent
  // does not destroy historical call records — they just become un-linked.
  await sql`DELETE FROM voice_agents WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
