/**
 * POST /api/agents/video/edit — Sprint 19A
 *
 * Prompt-driven video editor. The user types a natural-language instruction
 * ("trim to first 5 seconds, add fade in, overlay my logo bottom-right") and
 * Claude parses it into a VideoEditSpec JSON. The spec is then translated to
 * Cloudinary's video transformation URL grammar — no ffmpeg, no extra render
 * host. Output is a Cloudinary-hosted MP4 URL that the dashboard previews
 * inline.
 *
 * Body: {
 *   workspaceId: string
 *   videoUrl:    string        // either a Cloudinary URL or an external MP4 we'll upload first
 *   instruction: string        // free-text edit request
 *   currentSpec?: VideoEditSpec // existing spec to merge into (for incremental edits)
 * }
 * → { ok: true, editedUrl, spec, beforeUrl, artifactId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { withCredentials } from '@/lib/credential-context'
import { runAgent } from '@/lib/claude'
import { recordMediaAsset } from '@/lib/media-assets'
import {
  uploadVideoUrl,
  buildEditedVideoUrl,
  isCloudinaryVideoAvailable,
  type VideoEditSpec,
} from '@/lib/tools/cloudinary-video'

export const runtime = 'nodejs'
export const maxDuration = 60

const EDITOR_SYSTEM = `You are the Video Edit Parser for Ooumph.

Your job: convert a user's natural-language editing instruction into a strict JSON edit specification. The spec is then applied via Cloudinary's video transformation API.

Schema:
{
  "trim":        { "startSec": number, "durationSec": number } | null,
  "speedPct":    number | null,        // 50 = half speed, 200 = double speed
  "fadeInMs":    number | null,
  "fadeOutMs":   number | null,
  "overlays":    Overlay[] | null,
  "voiceoverVolumePct":  number | null,  // 0-200, 100 = unchanged
  "bgmVolumePct":        number | null,
  "crop":        { "width": number, "height": number, "mode": "fill"|"fit"|"crop"|"pad" } | null,
  "brightness":  number | null,        // -100 to 100
  "saturation":  number | null,        // -100 to 100
  "muteAudio":   boolean | null,
  "loudnessNormalize": boolean | null
}

Overlay shape:
- ImageOverlay: { "type": "image", "publicId": "<id>", "position": "top_left"|"top"|"top_right"|"left"|"center"|"right"|"bottom_left"|"bottom"|"bottom_right", "widthPct": number, "opacityPct": number, "startSec": number, "durationSec": number }
- TextOverlay:  { "type": "text", "text": "...", "fontFamily": "Arial", "fontSize": 48, "color": "FFFFFF", "position": "...", "startSec": number, "durationSec": number }

Rules:
- OMIT any field you are NOT changing (don't include it in the JSON at all).
- To CLEAR a previously-set field (e.g. user says "remove the fade in"),
  output that field with the value null. The orchestrator interprets
  explicit null as a deletion marker.
- If the user says "trim to 5 seconds" interpret as startSec=0, durationSec=5.
- If the user says "speed up 2x" → speedPct=200. "Slow down half" → speedPct=50.
- Common positions: "bottom right", "top left", etc.
- If the user asks for something you can't express in this schema (e.g. "remove the background", "track this object"), include an "unsupported" key with a one-sentence explanation and OMIT all other fields.
- ALWAYS return valid JSON. No prose, no markdown fences.`

interface EditBody {
  workspaceId: string
  videoUrl: string
  instruction: string
  currentSpec?: VideoEditSpec
}

function mergeSpecs(prev: VideoEditSpec | undefined, next: Partial<VideoEditSpec>): VideoEditSpec {
  // Sprint 19F (audit pass #9 P1-1): explicit null = deletion marker, so
  // users can say "remove the fade in" and Claude can express that by
  // setting fadeInMs to null. Previously null was treated the same as
  // 'unchanged' and the field could never be cleared.
  // Last-write-wins per top-level field. Arrays (overlays, concatPublicIds)
  // are replaced wholesale, not merged — Claude returns the new desired set.
  const out: VideoEditSpec = { ...(prev || {}) }
  for (const k of Object.keys(next) as Array<keyof VideoEditSpec>) {
    const v = next[k]
    if (v === undefined) continue
    if (v === null) {
      delete out[k]
      continue
    }
    // @ts-expect-error - dynamic key copy
    out[k] = v
  }
  return out
}

export async function POST(req: NextRequest) {
  let body: EditBody
  try {
    body = (await req.json()) as EditBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, videoUrl, instruction, currentSpec } = body
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 })
  if (!instruction || !instruction.trim()) {
    return NextResponse.json({ error: 'instruction required' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const overQuota = await assertAgentRunQuota(req, workspaceId)
  if (overQuota) return overQuota

  // Resolve workspace settings for BYOK.
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
        VALUES (${runId}, ${workspaceId}, 'video_edit', 'running', ${JSON.stringify({ videoUrl, instruction })})
      `

      try {
        // Resolve the base public_id. If the source is already a Cloudinary
        // URL we can extract it directly; otherwise upload first.
        let basePublicId: string
        if (/res\.cloudinary\.com\/.+\/video\/upload\//.test(videoUrl)) {
          const m = videoUrl.match(/\/upload\/(?:[^/]+\/)*([^.?]+)\./)
          if (!m) {
            return NextResponse.json({ ok: false, error: 'Could not parse Cloudinary public_id from URL' }, { status: 400 })
          }
          basePublicId = m[1]
        } else {
          const folder = `ooumph/${workspaceId}/video-edit`
          const asset = await uploadVideoUrl(videoUrl, folder)
          if (!asset) {
            return NextResponse.json({ ok: false, error: 'Failed to upload source video to Cloudinary' }, { status: 502 })
          }
          basePublicId = asset.publicId
        }

        // Ask Claude to parse the instruction.
        const parsed = await runAgent<Partial<VideoEditSpec> & { unsupported?: string }>(
          EDITOR_SYSTEM,
          `User instruction: ${instruction.trim()}\n\nCurrent edit spec (apply changes ON TOP of this — keep prior fields unless the user explicitly changes them):\n${JSON.stringify(currentSpec || {}, null, 2)}`,
          undefined,
          { workspaceId },
        )

        if (parsed.unsupported) {
          await sql`UPDATE agent_runs SET status = 'failed', error_message = ${parsed.unsupported} WHERE id = ${runId}`
          return NextResponse.json({
            ok: false,
            error: parsed.unsupported,
            unsupported: true,
          })
        }

        const finalSpec = mergeSpecs(currentSpec, parsed)
        const editedUrl = buildEditedVideoUrl(basePublicId, finalSpec)
        if (!editedUrl) {
          return NextResponse.json({ ok: false, error: 'Failed to build Cloudinary URL' }, { status: 500 })
        }

        // Persist artifact + media_asset.
        const artifactId = newId()
        await sql`
          INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
          VALUES (
            ${artifactId}, ${workspaceId}, ${runId}, 'edited_video',
            ${'Edited: ' + instruction.slice(0, 80)},
            ${JSON.stringify({ editedUrl, basePublicId, spec: finalSpec, instruction, beforeUrl: videoUrl })},
            'draft'
          )
        `

        try {
          await recordMediaAsset({
            workspaceId,
            url: editedUrl,
            filename: `edit-${Date.now().toString(36)}.mp4`,
            assetType: 'video',
            mimeType: 'video/mp4',
            sourceProvider: 'cloudinary/edit',
            metadata: { artifactId, instruction },
          })
        } catch (err) {
          console.error('[video/edit] media_assets dual-write failed (non-fatal):', err)
        }

        await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

        return NextResponse.json({
          ok: true,
          editedUrl,
          beforeUrl: videoUrl,
          spec: finalSpec,
          artifactId,
        })
      } catch (error) {
        await sql`UPDATE agent_runs SET status = 'failed', error_message = ${String(error)} WHERE id = ${runId}`
        console.error('[video/edit]', error)
        return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
      }
    },
  )
}
