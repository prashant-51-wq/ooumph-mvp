/**
 * POST /api/agents/video/assemble — Sprint 19A
 *
 * Merge multiple AI-generated video clips into a single Cloudinary-hosted MP4.
 * Each input URL is uploaded to Cloudinary first (if it isn't already), then
 * concatenated in order via the `fl_splice` URL transform.
 *
 * Body: {
 *   workspaceId: string
 *   videoUrls:   string[]   // ordered list of remote MP4 URLs
 *   voiceoverUrl?: string   // optional audio URL to overlay (replaces clip audio)
 *   bgmUrl?:    string      // optional background music URL
 *   subtitleSrtUrl?: string // optional SRT for burned-in captions
 *   crop?: { width: number; height: number; mode?: 'fill'|'fit'|'crop'|'pad' }
 * }
 * → { ok: true, mergedUrl, basePublicId, clipPublicIds, durationSec, artifactId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { withCredentials } from '@/lib/credential-context'
import { recordMediaAsset } from '@/lib/media-assets'
import {
  uploadVideoUrl,
  buildEditedVideoUrl,
  isCloudinaryVideoAvailable,
  type VideoEditSpec,
} from '@/lib/tools/cloudinary-video'

export const runtime = 'nodejs'
export const maxDuration = 300

interface AssembleBody {
  workspaceId: string
  videoUrls: string[]
  voiceoverUrl?: string
  bgmUrl?: string
  subtitleSrtUrl?: string
  crop?: { width: number; height: number; mode?: 'fill' | 'fit' | 'crop' | 'pad' }
}

export async function POST(req: NextRequest) {
  let body: AssembleBody
  try {
    body = (await req.json()) as AssembleBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, videoUrls } = body
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
    return NextResponse.json({ error: 'videoUrls must be a non-empty array' }, { status: 400 })
  }
  if (videoUrls.length > 30) {
    return NextResponse.json({ error: 'At most 30 clips per assemble call' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const overQuota = await assertAgentRunQuota(req, workspaceId)
  if (overQuota) return overQuota

  // Resolve workspace model_settings for BYOK Cloudinary credentials.
  const wsRes = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const settings = (wsRes.rows[0]?.model_settings || {}) as Record<string, string>

  return withCredentials(
    {
      CLOUDINARY_CLOUD_NAME: settings.cloudinaryCloudName,
      CLOUDINARY_API_KEY: settings.cloudinaryApiKey,
      CLOUDINARY_API_SECRET: settings.cloudinaryApiSecret,
    },
    async () => {
      if (!isCloudinaryVideoAvailable()) {
        return NextResponse.json({
          ok: false,
          error: 'Cloudinary not configured. Add CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in Settings → AI Assistants or platform env.',
          requiresSetup: true,
        })
      }

      const runId = newId()
      await sql`
        INSERT INTO agent_runs (id, workspace_id, agent_name, status, input_json)
        VALUES (${runId}, ${workspaceId}, 'video_assemble', 'running', ${JSON.stringify({ clipCount: videoUrls.length })})
      `

      try {
        const folder = `ooumph/${workspaceId}/video-assembly`
        // Upload every input URL to Cloudinary so we get stable public IDs.
        // Skip already-Cloudinary-hosted URLs (we can derive their public ID
        // directly without re-upload).
        const uploaded: { publicId: string; secureUrl: string; durationSec?: number }[] = []
        for (const url of videoUrls) {
          if (/res\.cloudinary\.com\//.test(url)) {
            // Extract public_id from existing Cloudinary URL.
            const m = url.match(/\/upload\/(?:[^/]+\/)*([^.?]+)\./)
            if (m) {
              uploaded.push({ publicId: m[1], secureUrl: url })
              continue
            }
          }
          const asset = await uploadVideoUrl(url, folder)
          if (!asset) {
            return NextResponse.json({
              ok: false,
              error: `Failed to upload clip to Cloudinary: ${url}`,
            }, { status: 502 })
          }
          uploaded.push({ publicId: asset.publicId, secureUrl: asset.secureUrl, durationSec: asset.durationSec })
        }

        // Upload optional audio/subtitle assets.
        let voiceoverPublicId: string | undefined
        if (body.voiceoverUrl) {
          const a = await uploadVideoUrl(body.voiceoverUrl, folder + '/audio')
          voiceoverPublicId = a?.publicId
        }
        let bgmPublicId: string | undefined
        if (body.bgmUrl) {
          const a = await uploadVideoUrl(body.bgmUrl, folder + '/audio')
          bgmPublicId = a?.publicId
        }

        const base = uploaded[0].publicId
        const concatRest = uploaded.slice(1).map(u => u.publicId)
        const totalDuration = uploaded.reduce((sum, u) => sum + (u.durationSec || 0), 0)

        const spec: VideoEditSpec = {
          concatPublicIds: concatRest,
          voiceoverPublicId,
          bgmPublicId,
          bgmVolumePct: bgmPublicId ? 25 : undefined,   // duck BGM under voiceover
          subtitlesPublicId: body.subtitleSrtUrl ? body.subtitleSrtUrl.split('/').pop()?.replace(/\.[a-z]+$/, '') : undefined,
          crop: body.crop,
        }

        const mergedUrl = buildEditedVideoUrl(base, spec)
        if (!mergedUrl) {
          return NextResponse.json({ ok: false, error: 'Failed to build Cloudinary URL' }, { status: 500 })
        }

        // Persist as artifact + media_asset for the library.
        const artifactId = newId()
        await sql`
          INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
          VALUES (
            ${artifactId}, ${workspaceId}, ${runId}, 'assembled_video',
            ${'Assembled video: ' + videoUrls.length + ' clip' + (videoUrls.length === 1 ? '' : 's')},
            ${JSON.stringify({ mergedUrl, basePublicId: base, clipPublicIds: uploaded.map(u => u.publicId), spec, durationSec: totalDuration })},
            'draft'
          )
        `

        let mediaAssetId: string | null = null
        try {
          mediaAssetId = await recordMediaAsset({
            workspaceId,
            url: mergedUrl,
            filename: `assembled-${Date.now().toString(36)}.mp4`,
            assetType: 'video',
            mimeType: 'video/mp4',
            sourceProvider: 'cloudinary/assemble',
            metadata: { clipCount: videoUrls.length, durationSec: totalDuration, artifactId },
          })
        } catch (err) {
          console.error('[video/assemble] media_assets dual-write failed (non-fatal):', err)
        }

        await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

        return NextResponse.json({
          ok: true,
          mergedUrl,
          basePublicId: base,
          clipPublicIds: uploaded.map(u => u.publicId),
          durationSec: totalDuration,
          artifactId,
          mediaAssetId,
        })
      } catch (error) {
        await sql`UPDATE agent_runs SET status = 'failed', error_message = ${String(error)} WHERE id = ${runId}`
        console.error('[video/assemble]', error)
        return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
      }
    },
  )
}
