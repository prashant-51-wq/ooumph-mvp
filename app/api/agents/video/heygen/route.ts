import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { withCredentials } from '@/lib/credential-context'
import {
  getHeyGenAvatars,
  getHeyGenVoices,
  generateHeyGenVideo,
  getHeyGenVideoStatus,
  listHeyGenVideos,
  isHeyGenAvailable,
} from '@/lib/tools/heygen'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      action,
      avatarId,
      voiceId,
      script,
      title,
      background,
      videoId,
    }: {
      workspaceId: string
      action: 'avatars' | 'voices' | 'generate' | 'status' | 'list'
      avatarId?: string
      voiceId?: string
      script?: string
      title?: string
      background?: string
      videoId?: string
    } = body

    if (!workspaceId || !action) {
      return NextResponse.json({ error: 'workspaceId and action are required' }, { status: 400 })
    }

    // 1. Fetch workspace settings and run handler with request-scoped credentials.
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    return await withCredentials({ HEYGEN_API_KEY: settings.heygenApiKey }, async () => {
    if (!isHeyGenAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'HeyGen API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // 2. Handle actions
    if (action === 'avatars') {
      const avatars = await getHeyGenAvatars()
      return NextResponse.json({ ok: true, avatars })
    }

    if (action === 'voices') {
      const voices = await getHeyGenVoices()
      return NextResponse.json({ ok: true, voices })
    }

    if (action === 'generate') {
      if (!script) {
        return NextResponse.json({ error: 'script is required for generate' }, { status: 400 })
      }
      if (!avatarId || !voiceId) {
        return NextResponse.json({ error: 'avatarId and voiceId are required for generate' }, { status: 400 })
      }

      const result = await generateHeyGenVideo({ avatarId, voiceId, script, title, background })
      if (!result) {
        return NextResponse.json({ ok: false, error: 'HeyGen video generation failed. Check your API key.' }, { status: 500 })
      }

      const artifactId = newId()
      const content = JSON.stringify({
        videoId: result.videoId,
        script: script.slice(0, 200),
        avatarId,
        title,
        status: 'processing',
      })

      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId},
          ${workspaceId},
          ${'avatar_video'},
          ${(title || 'HeyGen Avatar Video').trim()},
          ${content},
          ${'pending_approval'},
          NOW()
        )
      `

      return NextResponse.json({ ok: true, videoId: result.videoId, artifactId })
    }

    if (action === 'status') {
      if (!videoId) {
        return NextResponse.json({ error: 'videoId is required for status' }, { status: 400 })
      }

      const video = await getHeyGenVideoStatus(videoId)
      if (!video) {
        return NextResponse.json({ ok: false, error: 'Video not found or status check failed.' }, { status: 404 })
      }
      // Sprint 15D (P0 #4): on completion, flip the linked artifact and
      // mirror to media_assets so the result is reachable from /media-library.
      if (video.status === 'completed' && video.video_url) {
        try {
          await sql`
            UPDATE artifacts
            SET status = 'approved',
                content_json = ${JSON.stringify({ videoId, status: 'completed', videoUrl: video.video_url, provider: 'heygen' })}
            WHERE workspace_id = ${workspaceId}
              AND content_json LIKE ${'%' + videoId + '%'}
          `
          const { recordMediaAsset } = await import('@/lib/media-assets')
          const dupe = await sql`SELECT id FROM media_assets WHERE workspace_id = ${workspaceId} AND metadata_json LIKE ${'%"videoId":"' + videoId + '"%'} LIMIT 1`
          if (!dupe.rows[0]) {
            await recordMediaAsset({
              workspaceId, url: video.video_url, filename: 'heygen-' + videoId + '.mp4',
              assetType: 'video', mimeType: 'video/mp4', sourceProvider: 'heygen',
              durationSeconds: typeof video.duration === 'number' ? video.duration : null,
              metadata: { videoId },
            })
          }
        } catch (err) {
          console.error('[heygen status] dual-write failed (non-fatal):', err)
        }
      }
      return NextResponse.json({
        ok: true,
        video: {
          status: video.status,
          videoUrl: video.video_url,
          thumbnailUrl: video.thumbnail_url,
          duration: video.duration,
        },
      })
    }

    if (action === 'list') {
      const videos = await listHeyGenVideos()
      return NextResponse.json({ ok: true, videos })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    })
  } catch (error) {
    console.error('HeyGen agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
