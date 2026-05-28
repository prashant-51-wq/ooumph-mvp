import { NextRequest, NextResponse } from 'next/server'
import { isCloudinaryAvailable, uploadBase64 } from '@/lib/tools/cloudinary'

// Sprint 16H (P1 #15): logo upload endpoint for the onboarding wizard.
// Accepts a base64-encoded image and either:
//   1. Uploads it to Cloudinary (when CLOUDINARY_* env keys are configured),
//      returning the secure CDN URL.
//   2. Falls back to returning a data: URL so the wizard still functions in
//      dev / unconfigured environments — the data URL is small enough to be
//      stored directly in brand_profiles.logo_url for previews.
//
// The Cloudinary helper itself already degrades gracefully (returns null
// when keys are missing), so this route just routes around that null and
// emits the data URL instead of erroring.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      base64?: string
      mimeType?: string
      folder?: string
    }
    const { base64, mimeType = 'image/png', folder = 'ooumph/logos' } = body
    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'base64 required' }, { status: 400 })
    }
    // Strip data URL prefix if the caller sent the full data: URL.
    const cleaned = base64.includes('base64,') ? base64.split('base64,')[1] : base64

    if (isCloudinaryAvailable()) {
      const asset = await uploadBase64(cleaned, folder, mimeType)
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
