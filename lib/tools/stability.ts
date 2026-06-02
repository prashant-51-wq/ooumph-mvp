// Stability AI — Stable Image Generate (SD3.5)
//
// Docs: https://platform.stability.ai/docs/api-reference#tag/Generate
//
// Endpoint used: POST https://api.stability.ai/v2beta/stable-image/generate/core
// Multipart form-data; returns image bytes (default) or JSON when
// `Accept: application/json` is set. We use JSON so we can return a
// base64 data URL the rest of the codebase already handles for
// provider results (matches the ElevenLabs pattern in
// /api/creative-generation-jobs/route.ts).

import { getCredential } from '@/lib/credential-context'

const STABILITY_BASE = 'https://api.stability.ai'

export interface StabilityImageResult {
  /** base64 data URL — `data:image/<mime>;base64,…` */
  url: string
  mimeType: string
  /** Stability returns finish_reason; surface so callers can detect filtered content */
  finishReason: string
  seed?: number
}

export interface StabilityImageOptions {
  /** 1:1 by default. Stability accepts a fixed enum for `aspect_ratio`. */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '21:9' | '9:21' | '2:3' | '3:2' | '4:5' | '5:4'
  negativePrompt?: string
  /** Output format. PNG is default (lossless); JPEG and WEBP also supported. */
  outputFormat?: 'png' | 'jpeg' | 'webp'
  /** Optional seed for deterministic generation. */
  seed?: number
}

export async function generateStabilityImage(
  prompt: string,
  options?: StabilityImageOptions,
): Promise<StabilityImageResult | null> {
  const key = getCredential('STABILITY_API_KEY')
  if (!key) return null
  try {
    const outputFormat = options?.outputFormat ?? 'png'
    // Stability v2beta uses multipart/form-data. We use the global FormData /
    // Blob — available in Node 18+ which Next 16 / Vercel both support.
    const form = new FormData()
    form.append('prompt', prompt)
    if (options?.negativePrompt) form.append('negative_prompt', options.negativePrompt)
    if (options?.aspectRatio) form.append('aspect_ratio', options.aspectRatio)
    if (typeof options?.seed === 'number') form.append('seed', String(options.seed))
    form.append('output_format', outputFormat)

    const res = await fetch(`${STABILITY_BASE}/v2beta/stable-image/generate/core`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        // JSON envelope so we get base64 + finish_reason instead of raw bytes.
        Accept: 'application/json',
      },
      body: form,
    })
    if (!res.ok) return null
    const json = await res.json() as {
      image?: string
      finish_reason?: string
      seed?: number
    }
    if (!json.image) return null
    const mimeType = `image/${outputFormat === 'jpeg' ? 'jpeg' : outputFormat}`
    return {
      url: `data:${mimeType};base64,${json.image}`,
      mimeType,
      finishReason: json.finish_reason ?? 'SUCCESS',
      seed: json.seed,
    }
  } catch {
    return null
  }
}

/** Lightweight key check — Stability exposes /v1/user/account for this. */
export async function testStabilityKey(): Promise<boolean> {
  const key = getCredential('STABILITY_API_KEY')
  if (!key) return false
  try {
    const res = await fetch(`${STABILITY_BASE}/v1/user/account`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export function isStabilityAvailable(): boolean {
  return !!getCredential('STABILITY_API_KEY')
}
