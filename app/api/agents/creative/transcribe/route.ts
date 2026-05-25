import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      audioUrl,
      language = 'en',
      model = 'nova-2',
    }: {
      workspaceId: string
      audioUrl: string
      language?: string
      model?: string
    } = body

    if (!workspaceId || !audioUrl) {
      return NextResponse.json({ error: 'workspaceId and audioUrl are required' }, { status: 400 })
    }

    // 1. Fetch workspace model_settings and inject API key
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    if (!settings.deepgramApiKey) {
      return NextResponse.json({
        ok: false,
        error: 'Deepgram API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    process.env.DEEPGRAM_API_KEY = settings.deepgramApiKey

    // 2. Transcribe audio
    const { transcribeUrl, isDeepgramAvailable } = await import('@/lib/tools/deepgram')

    if (!isDeepgramAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Deepgram API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    const result = await transcribeUrl(audioUrl, { language, model })
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Transcription failed. Check your Deepgram API key and audio URL.' }, { status: 500 })
    }

    const wordCount = result.transcript.split(' ').filter(Boolean).length

    // 3. Save artifact
    const artifactId = newId()
    const content = JSON.stringify({
      audioUrl,
      transcript: result.transcript,
      summary: result.summary,
      duration: result.duration,
      wordCount,
    })

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${'transcription'},
        ${('Transcription: ' + (audioUrl.split('/').pop()?.split('?')[0] || 'audio')).slice(0, 200)},
        ${content},
        ${'approved'},
        NOW()
      )
    `

    return NextResponse.json({
      ok: true,
      transcript: result.transcript,
      summary: result.summary,
      paragraphs: result.paragraphs,
      duration: result.duration,
      wordCount,
      artifactId,
    })
  } catch (error) {
    console.error('Transcribe agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
