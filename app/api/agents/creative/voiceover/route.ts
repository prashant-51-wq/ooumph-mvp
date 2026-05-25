import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

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

    // 1. Fetch workspace model_settings and inject API keys
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    if (!settings.elevenLabsApiKey) {
      return NextResponse.json({
        ok: false,
        error: 'ElevenLabs API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    process.env.ELEVENLABS_API_KEY = settings.elevenLabsApiKey
    if (settings.elevenLabsVoiceId) {
      process.env.ELEVENLABS_VOICE_ID = settings.elevenLabsVoiceId
    }

    // 2. Generate voiceover
    const { textToSpeech, isElevenLabsAvailable } = await import('@/lib/tools/elevenlabs')

    if (!isElevenLabsAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'ElevenLabs API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    const result = await textToSpeech(text, {
      voiceId: voiceId || settings.elevenLabsVoiceId,
      stability,
      similarityBoost,
    })

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

    return NextResponse.json({
      ok: true,
      audioBase64: result.audioBase64,
      mimeType: 'audio/mpeg',
      charCount: text.length,
      artifactId,
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

    if (!settings.elevenLabsApiKey) {
      return NextResponse.json({
        ok: false,
        error: 'ElevenLabs API key not configured.',
        requiresSetup: true,
        voices: [],
      })
    }

    process.env.ELEVENLABS_API_KEY = settings.elevenLabsApiKey

    const { getVoices } = await import('@/lib/tools/elevenlabs')
    const voices = await getVoices()

    return NextResponse.json({ ok: true, voices })
  } catch (error) {
    console.error('Get voices error:', error)
    return NextResponse.json({ ok: false, error: String(error), voices: [] }, { status: 500 })
  }
}
