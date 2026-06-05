/**
 * Sprint 15D — small helper so every creative generator can dual-write into
 * the Media Library without copy-pasting the same INSERT 6 times.
 *
 * The audit found that /image-gen, /video-gen, and /voiceover all wrote
 * their output to `artifacts` but skipped `media_assets`. Result: the user
 * generated a beautiful asset, then couldn't see it in the Media Library
 * and couldn't attach it to a scheduled post. Closing that gap.
 *
 * Non-throwing — a failed media_assets insert must never break the agent
 * route's primary response, which is the artifact itself.
 */
import { sql, newId } from '@/lib/db'

export type AssetKind = 'image' | 'video' | 'audio' | 'document' | 'other'

export interface CreateMediaAssetInput {
  workspaceId: string
  url: string
  filename: string
  assetType: AssetKind
  mimeType?: string
  fileSize?: number | null
  durationSeconds?: number | null
  sourceProvider?: string  // e.g. 'openai-dalle3', 'runway', 'elevenlabs'
  parentAssetId?: string | null
  metadata?: Record<string, unknown>
  status?: 'ready' | 'pending' | 'failed'
}

/**
 * Insert a media_assets row. Returns the new id, or null on failure.
 * Callers should treat this as fire-and-forget for non-critical paths.
 */
export async function recordMediaAsset(input: CreateMediaAssetInput): Promise<string | null> {
  try {
    const id = newId()
    const metaStr = JSON.stringify(input.metadata || {}).slice(0, 8000)
    await sql`
      INSERT INTO media_assets (
        id, workspace_id, parent_asset_id, filename, url, asset_type,
        mime_type, file_size, dimensions, duration_seconds,
        source_provider, metadata_json, status, created_at
      ) VALUES (
        ${id}, ${input.workspaceId}, ${input.parentAssetId || null},
        ${input.filename.slice(0, 240)}, ${input.url}, ${input.assetType},
        ${input.mimeType || null}, ${input.fileSize ?? null}, ${null}, ${input.durationSeconds ?? null},
        ${input.sourceProvider || null}, ${metaStr},
        ${input.status || 'ready'}, CURRENT_TIMESTAMP
      )
    `
    return id
  } catch (err) {
    console.error('[recordMediaAsset] insert failed (non-fatal):', err)
    return null
  }
}
