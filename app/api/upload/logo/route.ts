import { NextRequest, NextResponse } from 'next/server'
import { isCloudinaryAvailable, uploadBase64 } from '@/lib/tools/cloudinary'
import { assertWorkspaceOwnership } from '@/lib/guards'

// Sprint 16H (P1 #15): logo upload endpoint for the onboarding wizard.
// Accepts a base64-encoded image and either:
//   1. Uploads it to Cloudinary (when CLOUDINARY_* env keys are configured),
//      returning the secure CDN URL.
//   2. Falls back to returning a data: URL so the wizard still functions in
//      dev / unconfigured environments — the data URL is small enough to be
//      stored directly in brand_profiles.logo_url for previews.
//
// Sprint 17A (audit pass #3 P0 #1): closed the anonymous-upload security
// gap. Previously the route had ZERO auth — any visitor could POST a
// base64 blob and drain Cloudinary credits or echo arbitrary data URLs.
// Now requires workspaceId in the body + assertWorkspaceOwnership, plus
// a 5MB cap so a single request can't blow up the budget.

const MAX_BASE64_BYTES = 5 * 1024 * 1024 * 4 / 3  // ~6.66MB base64 → 5MB binary

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspaceId?: string
      base64?: string
      mimeType?: string
      folder?: string
    }
    const { workspaceId, base64, mimeType = 'image/png', folder = 'ooumph/logos' } = body
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
        { error: 'Image too large. Max 5MB.', maxBytes: 5 * 1024 * 1024 },
        { status: 413 },
      )
    }
    // Restrict mime types to image formats only.
    const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
    if (!ALLOWED_MIMES.has(mimeType)) {
      return NextResponse.json({ error: `Unsupported mime type: ${mimeType}` }, { status: 400 })
    }

    // Strip data URL prefix if the caller sent the full data: URL.
    const cleaned = base64.includes('base64,') ? base64.split('base64,')[1] : base64

    // Namespace folders by workspace so a leaked URL can't enumerate other
    // tenants' assets via folder listing.
    const scopedFolder = `${folder}/${workspaceId}`

    if (isCloudinaryAvailable()) {
      const asset = await uploadBase64(cleaned, scopedFolder, mimeType)
      if (asset?.secureUrl) {
        return NextResponse.json({ url: asset.secureUrl, source: 'cloudinary' })
      }
      // Fall through to data URL on upload failure.
    }

    const dataUrl = `data:${mimeType};base64,${cleaned}`
    return NextResponse.json({ url: dataUrl, source: 'data-url' })
  } catch (err) {
    console.error('[api/upload/logo] failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
