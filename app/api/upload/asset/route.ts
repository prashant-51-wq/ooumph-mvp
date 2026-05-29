/**
 * POST /api/upload/asset
 *
 * Sprint 17H (audit pass #3 P2 #44) — general-purpose asset upload for
 * lead magnets (PDFs, eBooks, swipe files, audio downloads, etc).
 *
 * Mirrors /api/upload/logo's auth + Cloudinary fallback pattern but
 * accepts a wider mime list and uses Cloudinary's `raw` resource type
 * so non-image files (PDFs especially) are stored verbatim, not
 * processed as images.
 *
 * Body: { workspaceId, base64, mimeType, filename?, folder? }
 * Returns: { url, source: 'cloudinary' | 'data-url' }
 *
 * Hard cap: 10MB (lead magnets shouldn't be huge — they're previews +
 * cheat sheets, not full courses).
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const MAX_BASE64_BYTES = 10 * 1024 * 1024 * 4 / 3  // ~13.3MB base64 → 10MB binary

// Allowed mime types for lead magnets. Keep this restrictive to avoid
// becoming a generic file-host: no executables, no archives without a
// good reason. PDF + Office docs + audio + video previews cover 95%
// of marketing lead-magnet use cases.
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
  'text/plain', 'text/markdown', 'text/csv',
  'application/zip',  // common for design swipe files
])

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspaceId?: string
      base64?: string
      mimeType?: string
      filename?: string
      folder?: string
    }
    const { workspaceId, base64, mimeType, filename, folder = 'ooumph/lead-magnets' } = body
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'base64 required' }, { status: 400 })
    }
    if (base64.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Max 10MB.', maxBytes: 10 * 1024 * 1024 },
        { status: 413 },
      )
    }
    const safeMime = mimeType || 'application/octet-stream'
    if (!ALLOWED_MIMES.has(safeMime)) {
      return NextResponse.json(
        {
          error: `Unsupported mime type: ${safeMime}. Use PDF / Office docs / images / audio / video / text / zip.`,
        },
        { status: 400 },
      )
    }

    const cleaned = base64.includes('base64,') ? base64.split('base64,')[1] : base64
    const scopedFolder = `${folder}/${workspaceId}`

    // Cloudinary path — `raw` resource_type for non-image binaries; otherwise
    // image upload still works for PDFs but Cloudinary auto-converts.
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET
    if (cloudName && apiKey && apiSecret) {
      try {
        // Cloudinary raw uploads require a signed POST. We construct the
        // signature manually (same algorithm as the cloudinary helper but
        // we need resource_type=raw which the existing helper hard-codes
        // to image). Documented at https://cloudinary.com/documentation/upload_widget#unsigned_uploads.
        const timestamp = Math.floor(Date.now() / 1000).toString()
        // Build the signature string: alphabetical sort of params (except
        // file/api_key/signature), then concat + apiSecret + sha1.
        const sigParams = `folder=${scopedFolder}&timestamp=${timestamp}`
        const { createHash } = await import('node:crypto')
        const signature = createHash('sha1').update(sigParams + apiSecret).digest('hex')

        const isImage = safeMime.startsWith('image/')
        const resourceType = isImage ? 'image' : 'raw'

        const form = new FormData()
        const fileValue = `data:${safeMime};base64,${cleaned}`
        form.append('file', fileValue)
        form.append('folder', scopedFolder)
        form.append('timestamp', timestamp)
        form.append('api_key', apiKey)
        form.append('signature', signature)

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
          { method: 'POST', body: form },
        )
        if (res.ok) {
          const data = await res.json() as { secure_url?: string; public_id?: string }
          if (data.secure_url) {
            return NextResponse.json({
              url: data.secure_url,
              source: 'cloudinary',
              filename: filename || data.public_id,
            })
          }
        } else {
          console.error('[/api/upload/asset] cloudinary upload failed:', res.status, await res.text().catch(() => ''))
        }
      } catch (err) {
        console.error('[/api/upload/asset] cloudinary error, falling back:', err)
      }
    }

    // Fallback: return the data URL inline. NOTE — lead magnets larger
    // than ~1MB will bloat any record that stores this URL. Caller should
    // set up Cloudinary for production.
    const dataUrl = `data:${safeMime};base64,${cleaned}`
    return NextResponse.json({ url: dataUrl, source: 'data-url', filename })
  } catch (err) {
    console.error('[/api/upload/asset] failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
