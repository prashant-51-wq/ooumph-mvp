/**
 * /api/voice-profiles
 *
 * Workspace voice library. UNIQUE(workspace_id, native_provider_voice_id)
 * at the DB level surfaces here as a clean 409 so the UI can show
 * "this voice is already registered" instead of a raw SQL error.
 *
 *   GET   ?workspaceId=…[&status=active|archived][&provider=elevenlabs]
 *   POST  { workspaceId, voiceName, nativeProviderVoiceId, provider?,
 *           gender?, accentLabel?, sampleUrl?, isDefault? }
 *   PATCH { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_GENDERS = new Set(['male', 'female', 'neutral'])
const ALLOWED_PROVIDERS = new Set(['elevenlabs', 'openai', 'vapi', 'azure', 'amazon_polly'])

interface VoiceProfileRow {
  id: string
  workspace_id: string
  voice_name: string
  native_provider_voice_id: string
  provider: string
  gender: string | null
  accent_label: string | null
  sample_url: string | null
  status: string
  is_default: number | boolean
  created_at: string
  updated_at: string | null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  const provider = searchParams.get('provider')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (status && provider) {
    result = await sql`
      SELECT * FROM voice_profiles
      WHERE workspace_id = ${workspaceId} AND status = ${status} AND provider = ${provider}
      ORDER BY is_default DESC, created_at DESC LIMIT 200
    `
  } else if (status) {
    result = await sql`
      SELECT * FROM voice_profiles
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY is_default DESC, created_at DESC LIMIT 200
    `
  } else if (provider) {
    result = await sql`
      SELECT * FROM voice_profiles
      WHERE workspace_id = ${workspaceId} AND provider = ${provider}
      ORDER BY is_default DESC, created_at DESC LIMIT 200
    `
  } else {
    result = await sql`
      SELECT * FROM voice_profiles
      WHERE workspace_id = ${workspaceId}
      ORDER BY is_default DESC, created_at DESC LIMIT 200
    `
  }
  return NextResponse.json(result.rows as unknown as VoiceProfileRow[])
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      voiceName?: string
      nativeProviderVoiceId?: string
      provider?: string
      gender?: string
      accentLabel?: string
      sampleUrl?: string
      isDefault?: boolean
    }
    const { workspaceId, voiceName, nativeProviderVoiceId } = body
    if (!workspaceId || !voiceName?.trim() || !nativeProviderVoiceId?.trim()) {
      return NextResponse.json(
        { error: 'workspaceId, voiceName, and nativeProviderVoiceId are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const provider = (body.provider || 'elevenlabs').toLowerCase()
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return NextResponse.json(
        { error: `provider must be one of ${[...ALLOWED_PROVIDERS].join(' | ')}` },
        { status: 422 },
      )
    }
    if (body.gender && !ALLOWED_GENDERS.has(body.gender.toLowerCase())) {
      return NextResponse.json(
        { error: `gender must be one of ${[...ALLOWED_GENDERS].join(' | ')}` },
        { status: 422 },
      )
    }

    // Pre-check for clean 409 with existingId reference. The DB UNIQUE constraint
    // is still the source of truth — this just gives the UI a friendlier error.
    const dup = await sql`
      SELECT id FROM voice_profiles
      WHERE workspace_id = ${workspaceId} AND native_provider_voice_id = ${nativeProviderVoiceId.trim()}
      LIMIT 1
    `
    if (dup.rows[0]) {
      return NextResponse.json(
        {
          error: `A voice profile with native ID '${nativeProviderVoiceId}' is already registered in this workspace.`,
          existingId: String((dup.rows[0] as { id?: string }).id || ''),
        },
        { status: 409 },
      )
    }

    // If this profile is being marked default, clear the existing default first
    if (body.isDefault) {
      await sql`UPDATE voice_profiles SET is_default = 0 WHERE workspace_id = ${workspaceId} AND is_default = 1`
    }

    const id = newId()
    try {
      await sql`
        INSERT INTO voice_profiles (
          id, workspace_id, voice_name, native_provider_voice_id, provider,
          gender, accent_label, sample_url, status, is_default, created_at, updated_at
        ) VALUES (
          ${id}, ${workspaceId}, ${voiceName.trim()}, ${nativeProviderVoiceId.trim()},
          ${provider}, ${body.gender?.toLowerCase() || null}, ${body.accentLabel?.trim() || null},
          ${body.sampleUrl?.trim() || null}, 'active', ${body.isDefault ? 1 : 0},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `
    } catch (err) {
      // Belt-and-braces: race-condition fallback if two parallel POSTs slipped past the pre-check
      const msg = err instanceof Error ? err.message : String(err)
      if (/UNIQUE|unique/i.test(msg)) {
        return NextResponse.json(
          {
            error: `Voice profile already registered (race condition on UNIQUE constraint).`,
            constraint: 'idx_voice_profiles_unique',
          },
          { status: 409 },
        )
      }
      throw err
    }
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/voice-profiles POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      voiceName?: string
      gender?: string
      accentLabel?: string
      sampleUrl?: string
      status?: string
      isDefault?: boolean
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT id FROM voice_profiles WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!existing.rows[0]) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 })

    if (body.gender && !ALLOWED_GENDERS.has(body.gender.toLowerCase())) {
      return NextResponse.json({ error: `gender must be one of ${[...ALLOWED_GENDERS].join(' | ')}` }, { status: 422 })
    }
    if (body.status && !['active', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: `status must be 'active' or 'archived'` }, { status: 422 })
    }

    // Setting is_default → demote any sibling default first
    if (body.isDefault === true) {
      await sql`UPDATE voice_profiles SET is_default = 0 WHERE workspace_id = ${workspaceId} AND is_default = 1 AND id <> ${id}`
    }

    await sql`
      UPDATE voice_profiles SET
        voice_name    = COALESCE(${body.voiceName?.trim() ?? null}, voice_name),
        gender        = COALESCE(${body.gender?.toLowerCase() ?? null}, gender),
        accent_label  = COALESCE(${body.accentLabel?.trim() ?? null}, accent_label),
        sample_url    = COALESCE(${body.sampleUrl?.trim() ?? null}, sample_url),
        status        = COALESCE(${body.status ?? null}, status),
        is_default    = COALESCE(${body.isDefault === undefined ? null : (body.isDefault ? 1 : 0)}, is_default),
        updated_at    = ${new Date().toISOString()}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/voice-profiles PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`DELETE FROM voice_profiles WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
