/**
 * POST /api/media-assets/presign
 *
 * Returns short-lived signed-upload coordinates so the BROWSER uploads
 * directly to Cloudinary / S3 — never proxied through Vercel. This is
 * critical: Vercel serverless functions hard-cap at 4.5MB request body,
 * which kills any video or high-res image upload through this route.
 *
 *   Request:
 *     { workspaceId, filename, mimeType, fileSize }
 *
 *   Response:
 *     {
 *       ok: true,
 *       provider: 'cloudinary' | 's3',
 *       cloudName?: string,
 *       apiKey?: string,
 *       timestamp: number,
 *       signature: string,
 *       folder: string,
 *       publicId: string,
 *       uploadUrl: string,
 *       maxFileSize: number,
 *       expiresAt: number          // signature is valid until this unix ts
 *     }
 *
 * Tenant scoping
 * ──────────────
 * The signed signature pins the upload to a workspace-scoped folder
 * (`ooumph/{workspaceId}/{assetType}/`) so a leaked signature can ONLY
 * land assets in that tenant's namespace. Even if an attacker got the
 * signature, they can't upload to a sibling workspace.
 *
 * Safety contract
 * ───────────────
 * - Workspace ownership validated FIRST.
 * - File-size sanity check rejects requests claiming >100MB (Cloudinary
 *   free tier soft cap; configurable via env).
 * - MIME type whitelist enforced for the asset_type bucket.
 * - Signature expires in 60 minutes (Cloudinary default behaviour).
 *
 * NOTE: After the browser completes the direct upload, the client should
 * call POST /api/media-assets with the resulting URL to persist a DB row.
 * This endpoint does NOT create the DB row itself — that would require
 * a second request from the client anyway once the upload finishes.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

// ─── Asset-type whitelist (filename + MIME validation) ─────────────────────

const TYPE_RULES: Record<string, { mimes: RegExp; extensions: RegExp; cloudinaryType: 'image' | 'video' | 'raw' }> = {
  image:     { mimes: /^image\//,     extensions: /\.(png|jpg|jpeg|webp|gif|avif|svg)$/i, cloudinaryType: 'image' },
  video:     { mimes: /^video\//,     extensions: /\.(mp4|mov|webm|m4v|avi)$/i,           cloudinaryType: 'video' },
  audio:     { mimes: /^audio\//,     extensions: /\.(mp3|wav|m4a|ogg|opus|flac)$/i,      cloudinaryType: 'video' /* Cloudinary lumps audio under video */ },
  thumbnail: { mimes: /^image\//,     extensions: /\.(png|jpg|jpeg|webp)$/i,              cloudinaryType: 'image' },
  doc:       { mimes: /^(application|text)\//, extensions: /\.(pdf|docx|txt|md|csv|json)$/i, cloudinaryType: 'raw' },
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  // 100 MB
const SIGNATURE_TTL_SECONDS = 3600                      // 60 minutes

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectAssetType(filename: string, mimeType: string): keyof typeof TYPE_RULES | null {
  const lower = filename.toLowerCase()
  const mime = mimeType.toLowerCase()
  for (const [type, rule] of Object.entries(TYPE_RULES)) {
    if (rule.mimes.test(mime) && rule.extensions.test(lower)) return type as keyof typeof TYPE_RULES
  }
  // Fallback: trust MIME alone if extension is missing
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return null
}

function slugFilename(name: string): string {
  // Strip path components, then alphanumerise
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  return base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset'
}

/**
 * Cloudinary signed-upload signature.
 * Documentation: https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
 *
 * The signature locks the upload to specific parameters — folder, public_id,
 * etc. — so a leaked signature can ONLY upload to that exact destination.
 */
function buildCloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const sortedStr = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha256').update(sortedStr + apiSecret).digest('hex')
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { workspaceId?: string; filename?: string; mimeType?: string; fileSize?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, filename, mimeType, fileSize } = body
  if (!workspaceId || !filename?.trim() || !mimeType?.trim() || typeof fileSize !== 'number') {
    return NextResponse.json(
      { error: 'workspaceId, filename, mimeType, and fileSize (number, bytes) are required' },
      { status: 400 },
    )
  }

  // ── 1. Tenant session validation ────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 2. File-size sanity ─────────────────────────────────────────────────
  const maxBytes = Number(process.env.MEDIA_UPLOAD_MAX_BYTES || DEFAULT_MAX_FILE_SIZE_BYTES)
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'fileSize must be a positive integer (bytes)' }, { status: 400 })
  }
  if (fileSize > maxBytes) {
    return NextResponse.json(
      {
        error: `File too large. Workspace cap is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        maxBytes,
        attemptedBytes: fileSize,
      },
      { status: 413 },
    )
  }

  // ── 3. Asset-type detection + MIME validation ──────────────────────────
  const assetType = detectAssetType(filename, mimeType)
  if (!assetType) {
    return NextResponse.json(
      { error: 'Unsupported file type. Accepted: images, videos, audio, common docs.' },
      { status: 415 },
    )
  }
  const rule = TYPE_RULES[assetType]

  // ── 4. Provider selection ──────────────────────────────────────────────
  // Cloudinary is the primary provider (already wrapped in lib/tools/cloudinary.ts).
  // S3 support can drop into this same response shape if/when configured.
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error: 'Media upload provider is not configured on this deployment.',
        hint: 'Set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in env, then redeploy.',
      },
      { status: 501 },
    )
  }

  // ── 5. Build signed payload — pinned to this workspace's folder ─────────
  const timestamp = Math.floor(Date.now() / 1000)
  const expiresAt = timestamp + SIGNATURE_TTL_SECONDS
  const folder = `ooumph/${workspaceId}/${assetType}`
  // Unique public_id with both a slug and a randomness suffix so re-uploads
  // never overwrite by accident.
  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const publicId = `${folder}/${slugFilename(filename)}-${randomSuffix}`

  // Build the params that go into the signature (must MATCH the upload form
  // exactly or Cloudinary will reject the request).
  const signedParams: Record<string, string | number> = {
    folder,
    public_id: publicId,
    timestamp,
  }
  const signature = buildCloudinarySignature(signedParams, apiSecret)

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${rule.cloudinaryType}/upload`

  return NextResponse.json({
    ok: true,
    provider: 'cloudinary',
    assetType,
    cloudinaryType: rule.cloudinaryType,
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    uploadUrl,
    maxFileSize: maxBytes,
    expiresAt,
    // Client integration hint — the browser fetches `uploadUrl` with FormData:
    //   file (binary), api_key, timestamp, signature, folder, public_id
    // On 200, the response includes secure_url which the client then sends
    // to POST /api/media-assets with the relevant metadata to persist a DB row.
    clientFormFields: ['file', 'api_key', 'timestamp', 'signature', 'folder', 'public_id'],
  })
}
