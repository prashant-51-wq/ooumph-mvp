/**
 * lib/tools/sora.ts — Sprint 12E
 *
 * OpenAI Sora video API client. As of writing, Sora is exposed via
 * OpenAI's `/v1/videos` endpoint (model `sora-2`) but availability is
 * gated: even with a valid OPENAI_API_KEY, accounts without the
 * `videos.generate` capability flag will see 403 from OpenAI.
 *
 * Auth: OPENAI_API_KEY (re-uses the user's existing OpenAI BYOK — no
 * separate sora key needed).
 *
 * Lifecycle: submit returns a `video.id`. Status is polled at
 * /v1/videos/{id}. When status === 'completed', the download URL is
 * embedded in the response.
 *
 * Honesty contract: if the underlying API returns 403 / unavailable,
 * we surface that to the UI as `requiresAccess: true` so the page can
 * show a clear "Sora is enabled on your OpenAI account → try here"
 * vs "Set your key first" distinction.
 *
 * Docs: https://platform.openai.com/docs/guides/sora-api
 */

import { getCredential } from '@/lib/credential-context'

const OPENAI_VIDEO_BASE = 'https://api.openai.com/v1/videos'

export interface SoraTask {
  id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress?: number
  videoUrl?: string
  failureReason?: string
  createdAt?: string
}

export interface SoraGenOptions {
  /** Default 'sora-2'. */
  model?: 'sora-2' | 'sora-2-pro'
  /** Aspect ratio. Sora 2 supports 'landscape' | 'portrait' | 'square'. */
  aspectRatio?: 'landscape' | 'portrait' | 'square'
  /** Seconds. Sora 2 supports 5 / 10 / 15 / 20. */
  durationSeconds?: 5 | 10 | 15 | 20
}

function openaiHeaders(): Record<string, string> | null {
  const key = getCredential('OPENAI_API_KEY') || ''
  if (!key) return null
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

function normalize(raw: Record<string, unknown> | null): SoraTask | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '')
  if (!id) return null
  const rawStatus = String(raw.status || '').toLowerCase()
  const status: SoraTask['status'] =
    rawStatus === 'completed' ? 'completed'
    : rawStatus === 'failed' ? 'failed'
    : rawStatus === 'in_progress' || rawStatus === 'processing' ? 'in_progress'
    : 'queued'
  // The completed response embeds an asset URL — shape varies by API
  // generation. We check the common shapes and pick the first match.
  const assets = (raw.assets || {}) as Record<string, unknown>
  const videoUrl =
    typeof assets.url === 'string' ? assets.url
    : typeof raw.video_url === 'string' ? raw.video_url
    : typeof raw.download_url === 'string' ? raw.download_url
    : undefined
  return {
    id,
    status,
    progress: typeof raw.progress === 'number' ? raw.progress : undefined,
    videoUrl,
    failureReason: typeof raw.error === 'string' ? raw.error : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  }
}

export async function generateSoraFromText(
  prompt: string,
  options?: SoraGenOptions,
): Promise<{ id: string } | { error: 'no_key' | 'no_access' | 'failed', detail?: string }> {
  const headers = openaiHeaders()
  if (!headers) return { error: 'no_key' }
  try {
    const res = await fetch(OPENAI_VIDEO_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options?.model ?? 'sora-2',
        prompt,
        ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
        ...(options?.durationSeconds ? { duration_seconds: options.durationSeconds } : {}),
      }),
    })
    if (res.status === 403 || res.status === 404) {
      // 403: account flag missing. 404: model not yet enabled for this
      // org. Both surface as "no_access" to the caller — different
      // remediation from "no_key".
      const errBody = await res.text().catch(() => '')
      return { error: 'no_access', detail: errBody.slice(0, 300) }
    }
    if (!res.ok) {
      return { error: 'failed', detail: `HTTP ${res.status}` }
    }
    const json = await res.json() as Record<string, unknown>
    const id = String(json.id || '')
    return id ? { id } : { error: 'failed', detail: 'Missing id in response' }
  } catch (e) {
    return { error: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

export async function getSoraTaskStatus(taskId: string): Promise<SoraTask | null> {
  const headers = openaiHeaders()
  if (!headers) return null
  try {
    const res = await fetch(`${OPENAI_VIDEO_BASE}/${encodeURIComponent(taskId)}`, { headers })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    return normalize(json)
  } catch {
    return null
  }
}

export function isSoraConfigured(): boolean {
  return !!getCredential('OPENAI_API_KEY')
}
