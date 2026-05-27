/**
 * /api/media-assets
 *
 * CRUD for the unified media library. The presigned-upload flow lives at
 * /api/media-assets/presign — this endpoint manages DB rows AFTER upload
 * or after a generation job persists its output.
 *
 *   GET    ?workspaceId=…[&assetType=image|video|audio][&parentAssetId=…]
 *   POST   { workspaceId, filename, url, assetType, mimeType?, fileSize?,
 *            dimensions?, durationSeconds?, parentAssetId?, sourceProvider?,
 *            metadataJson? }
 *   PATCH  { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…
 *
 * On DELETE, the schema's `ON DELETE SET NULL` cascades: children keep
 * existing but lose their parent pointer, and any creative_generation_jobs
 * row referencing this asset has its result_asset_id cleared.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_ASSET_TYPES = new Set(['image', 'video', 'audio', 'doc', 'thumbnail'])

interface MediaAssetRow {
  id: string
  workspace_id: string
  parent_asset_id: string | null
  filename: string
  url: string
  asset_type: string
  mime_type: string | null
  file_size: number | null
  dimensions: string | null
  duration_seconds: number | string | null
  source_provider: string | null
  metadata_json: string | null
  status: string
  created_at: string
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const assetType = searchParams.get('assetType')
  const parentAssetId = searchParams.get('parentAssetId')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 1000)

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (parentAssetId) {
    result = await sql`
      SELECT * FROM media_assets
      WHERE workspace_id = ${workspaceId} AND parent_asset_id = ${parentAssetId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else if (assetType) {
    if (!ALLOWED_ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ error: `assetType must be one of ${[...ALLOWED_ASSET_TYPES].join(' | ')}` }, { status: 422 })
    }
    result = await sql`
      SELECT * FROM media_assets
      WHERE workspace_id = ${workspaceId} AND asset_type = ${assetType}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else {
    result = await sql`
      SELECT * FROM media_assets
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  }
  return NextResponse.json(result.rows as unknown as MediaAssetRow[])
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      filename?: string
      url?: string
      assetType?: string
      mimeType?: string
      fileSize?: number
      dimensions?: string
      durationSeconds?: number
      parentAssetId?: string | null
      sourceProvider?: string
      metadataJson?: Record<string, unknown> | string
    }
    const { workspaceId, filename, url, assetType } = body
    if (!workspaceId || !filename?.trim() || !url?.trim() || !assetType) {
      return NextResponse.json(
        { error: 'workspaceId, filename, url, and assetType are required' },
        { status: 400 },
      )
    }
    if (!ALLOWED_ASSET_TYPES.has(assetType)) {
      return NextResponse.json(
        { error: `assetType must be one of ${[...ALLOWED_ASSET_TYPES].join(' | ')}` },
        { status: 422 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify parent_asset_id belongs to same workspace
    if (body.parentAssetId) {
      const parent = await sql`SELECT id FROM media_assets WHERE id = ${body.parentAssetId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!parent.rows[0]) {
        return NextResponse.json({ error: 'parent_asset_id not found in this workspace' }, { status: 404 })
      }
    }

    const id = newId()
    const metaStr = typeof body.metadataJson === 'string'
      ? body.metadataJson.slice(0, 8000)
      : body.metadataJson
      ? JSON.stringify(body.metadataJson).slice(0, 8000)
      : '{}'
    const fileSize = Number(body.fileSize) || null
    const durationSeconds = body.durationSeconds !== undefined ? Number(body.durationSeconds) : null

    await sql`
      INSERT INTO media_assets (
        id, workspace_id, parent_asset_id, filename, url, asset_type,
        mime_type, file_size, dimensions, duration_seconds,
        source_provider, metadata_json, status, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${body.parentAssetId || null},
        ${filename.trim()}, ${url.trim()}, ${assetType},
        ${body.mimeType || null}, ${fileSize}, ${body.dimensions || null}, ${durationSeconds},
        ${body.sourceProvider || null}, ${metaStr}, 'ready', CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/media-assets POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      filename?: string
      status?: string
      metadataJson?: Record<string, unknown> | string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT id FROM media_assets WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!existing.rows[0]) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const metaStr = body.metadataJson !== undefined
      ? (typeof body.metadataJson === 'string'
          ? body.metadataJson.slice(0, 8000)
          : JSON.stringify(body.metadataJson).slice(0, 8000))
      : null

    await sql`
      UPDATE media_assets SET
        filename      = COALESCE(${body.filename?.trim() ?? null}, filename),
        status        = COALESCE(${body.status ?? null}, status),
        metadata_json = COALESCE(${metaStr}, metadata_json)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/media-assets PATCH]', err)
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

  // Schema's ON DELETE SET NULL cascades on parent_asset_id + creative_generation_jobs.result_asset_id
  await sql`DELETE FROM media_assets WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
