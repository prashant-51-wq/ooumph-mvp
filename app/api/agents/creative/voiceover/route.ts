import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { recordMediaAsset } from '@/lib/media-assets'
import { getWorkspaceSecret } from '@/lib/secrets'
import { withCredentials } from '@/lib/credential-context'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      text,
      voiceId,
      stability,
      similarityBoost,
    }: {
      workspaceId: string
      text: string
      voiceId?: string
      stability?: number
      similarityBoost?: number
    } = body

    if (!workspaceId || !text) {
      return NextResponse.json({ error: 'workspaceId and text are required' }, { status: 400 })
    }

    if (text.length > 5000) {
      return NextResponse.json({ error: 'Text must be 5,000 characters or fewer' }, { status: 400 })
    }
    // Sprint 15D (P2 #21): ownership + quota gates.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // 1. Fetch workspace model_settings and inject API keys.
    // Sprint 19G: BYOK keys now live in workspace_secrets (Sprint 18B).
    // Fall back to legacy model_settings field, then env.
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    const elevenLabsKey = (await getWorkspaceSecret(workspaceId, 'elevenlabs'))
      || settings.elevenLabsApiKey
      || process.env.ELEVENLABS_API_KEY
      || ''

    if (!elevenLabsKey) {
      return NextResponse.json({
        ok: false,
        error: 'ElevenLabs API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // Sprint 18I: request-scoped credentials. Previously this route
    // mutated process.env directly — concurrent calls from different
    // workspaces could overwrite each other's ElevenLabs key. Now the
    // creds are confined to this async chain via AsyncLocalStorage.
    const result = await withCredentials(
      {
        ELEVENLABS_API_KEY: elevenLabsKey,
        ELEVENLABS_VOICE_ID: settings.elevenLabsVoiceId,
      },
      async () => {
        const { textToSpeech, isElevenLabsAvailable } = await import('@/lib/tools/elevenlabs')
        if (!isElevenLabsAvailable()) return null
        return textToSpeech(text, {
          voiceId: voiceId || settings.elevenLabsVoiceId,
          stability,
          similarityBoost,
        })
      },
    )
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Voiceover generation failed. Check your ElevenLabs API key.' }, { status: 500 })
    }

    // 3. Save artifact (metadata only — base64 audio is too large to store)
    const artifactId = newId()
    const content = JSON.stringify({
      text: text.slice(0, 200),
      voiceId: voiceId || settings.elevenLabsVoiceId,
      audioBase64: result.audioBase64.slice(0, 50) + '...',
      mimeType: 'audio/mpeg',
      charCount: text.length,
    })

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${'voiceover'},
        ${('Voiceover: ' + text.slice(0, 100)).trim()},
        ${content},
        ${'approved'},
        NOW()
      )
    `

    // Sprint 15D (P0 #4): dual-write into media_assets so the audio appears
    // in /dashboard/media-library and can be attached to scheduled posts.
    // Audio base64 is too large to inline as a data URL, so we upload to
    // Cloudinary (raw resource type) when configured. If Cloudinary isn't
    // available, we skip the media_assets row — the artifact still exists
    // and the page-level audio preview still works.
    let mediaAssetId: string | null = null
    try {
      const { uploadBase64, isCloudinaryAvailable } = await import('@/lib/tools/cloudinary')
      if (isCloudinaryAvailable()) {
        const uploaded = await uploadBase64(result.audioBase64, 'ooumph/voiceovers', 'audio/mpeg')
        if (uploaded) {
          mediaAssetId = await recordMediaAsset({
            workspaceId,
            url: uploaded.secureUrl,
            filename: ('voiceover-' + text.slice(0, 60).replace(/[^a-z0-9-_ ]/gi, '-')).slice(0, 200) + '.mp3',
            assetType: 'audio',
            mimeType: 'audio/mpeg',
            sourceProvider: 'elevenlabs',
            metadata: { artifactId, voiceId: voiceId || settings.elevenLabsVoiceId, charCount: text.length },
          })
        }
      }
    } catch (err) {
      console.error('[voiceover] media_assets dual-write failed (non-fatal):', err)
    }

    return NextResponse.json({
      ok: true,
      audioBase64: result.audioBase64,
      mimeType: 'audio/mpeg',
      charCount: text.length,
      artifactId,
      mediaAssetId,
    })
  } catch (error) {
    console.error('Voiceover agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    // Sprint 19G: same resolve order as POST.
    const elevenLabsKey = (await getWorkspaceSecret(workspaceId, 'elevenlabs'))
      || settings.elevenLabsApiKey
      || process.env.ELEVENLABS_API_KEY
      || ''

    if (!elevenLabsKey) {
      return NextResponse.json({
        ok: false,
        error: 'ElevenLabs API key not configured.',
        requiresSetup: true,
        voices: [],
      })
    }

    // Sprint 18I: request-scoped credentials (see POST handler above).
    const voices = await withCredentials(
      { ELEVENLABS_API_KEY: elevenLabsKey },
      async () => {
        const { getVoices } = await import('@/lib/tools/elevenlabs')
        return getVoices()
      },
    )

    return NextResponse.json({ ok: true, voices })
  } catch (error) {
    console.error('Get voices error:', error)
    return NextResponse.json({ ok: false, error: String(error), voices: [] }, { status: 500 })
  }
}
