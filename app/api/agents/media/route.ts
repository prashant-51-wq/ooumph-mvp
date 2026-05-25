/**
 * Media Library Worker — Creative Supervisor
 * GET  /api/agents/media — list media assets from Cloudinary
 * POST /api/agents/media — upload, delete, or list media assets
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  uploadImageUrl,
  listCloudinaryImages,
  deleteCloudinaryImage,
  buildCloudinaryUrl,
  isCloudinaryAvailable,
} from '@/lib/tools/cloudinary'

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

function injectCloudinaryEnv(settings: Record<string, unknown>) {
  if (settings.cloudinaryCloudName) process.env.CLOUDINARY_CLOUD_NAME = settings.cloudinaryCloudName as string
  if (settings.cloudinaryApiKey) process.env.CLOUDINARY_API_KEY = settings.cloudinaryApiKey as string
  if (settings.cloudinaryApiSecret) process.env.CLOUDINARY_API_SECRET = settings.cloudinaryApiSecret as string
}

// ── GET: List media ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const folder = searchParams.get('folder') || 'ooumph'
    const limit = parseInt(searchParams.get('limit') || '30', 10)

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    injectCloudinaryEnv(settings)

    if (!isCloudinaryAvailable()) {
      return NextResponse.json({
        ok: false,
        requiresSetup: true,
        error: 'Cloudinary not configured. Add credentials in Settings → Media Library.',
        assets: [],
        totalCount: 0,
      })
    }

    const cloudinaryAssets = await listCloudinaryImages(folder, limit)

    return NextResponse.json({
      ok: true,
      assets: cloudinaryAssets,
      totalCount: cloudinaryAssets.length,
    })
  } catch (error) {
    console.error('Media GET error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

// ── POST: Upload / delete / list ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, action, imageUrl, folder, publicId, key, source } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    injectCloudinaryEnv(settings)

    // ── List ─────────────────────────────────────────────────────────────────
    if (action === 'list') {
      if (!isCloudinaryAvailable()) {
        return NextResponse.json({
          ok: false,
          requiresSetup: true,
          error: 'Cloudinary not configured. Add credentials in Settings → Media Library.',
          assets: [],
          totalCount: 0,
        })
      }
      const assets = await listCloudinaryImages(folder || 'ooumph', 30)
      return NextResponse.json({ ok: true, assets, totalCount: assets.length })
    }

    // ── Upload from URL ───────────────────────────────────────────────────────
    if (action === 'upload_url') {
      if (!imageUrl) return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 })

      if (!isCloudinaryAvailable()) {
        return NextResponse.json({
          ok: false,
          requiresSetup: true,
          error: 'Cloudinary not configured. Add credentials in Settings → Media Library.',
        })
      }

      const asset = await uploadImageUrl(imageUrl, folder || 'ooumph')
      return NextResponse.json({ ok: true, asset })
    }

    // ── Upload base64 ─────────────────────────────────────────────────────────
    if (action === 'upload_base64') {
      const { base64Data, mimeType } = body
      if (!base64Data) return NextResponse.json({ error: 'Missing base64Data' }, { status: 400 })

      if (!isCloudinaryAvailable()) {
        return NextResponse.json({
          ok: false,
          requiresSetup: true,
          error: 'Cloudinary not configured. Add credentials in Settings → Media Library.',
        })
      }

      // Build a data URI and upload as URL (Cloudinary accepts data URIs)
      const dataUri = base64Data.startsWith('data:')
        ? base64Data
        : `data:${mimeType || 'image/png'};base64,${base64Data}`

      const asset = await uploadImageUrl(dataUri, folder || 'ooumph')
      return NextResponse.json({ ok: true, asset })
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!publicId) return NextResponse.json({ error: 'Missing publicId for delete' }, { status: 400 })

      if (!isCloudinaryAvailable()) {
        return NextResponse.json({
          ok: false,
          requiresSetup: true,
          error: 'Cloudinary not configured.',
        })
      }

      await deleteCloudinaryImage(publicId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Media POST error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
