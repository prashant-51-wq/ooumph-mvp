/**
 * lib/tools/luma.ts — Sprint 12A
 *
 * Luma Dream Machine API client. Sibling to lib/tools/runway.ts.
 *
 * Authentication: single bearer token. Get a key at
 * https://lumalabs.ai/dream-machine/api/keys. Once approved, set the
 * env var LUMA_API_KEY (or the workspace BYOK lumaApiKey).
 *
 * The Dream Machine API is asynchronous: POST /generations starts a
 * job, GET /generations/{id} returns its status. We submit and poll
 * the same way the Runway adapter does — the route handler hides this
 * lifecycle from the UI.
 *
 * Docs (as of writing): https://docs.lumalabs.ai/docs/api
 */

import { getCredential } from '@/lib/credential-context'

const LUMA_BASE = 'https://api.lumalabs.ai/dream-machine/v1'

export interface LumaTask {
  id: string
  /** Luma uses lowercase: 'queued' | 'dreaming' | 'completed' | 'failed'. */
  status: 'queued' | 'dreaming' | 'completed' | 'failed'
  /** Progress only meaningful while status === 'dreaming'. Not all responses include it. */
  progress?: number
  /** Populated once status === 'completed'. */
  videoUrl?: string
  failureReason?: string
  createdAt?: string
}

export interface LumaGenOptions {
  /** Aspect ratio. Luma accepts '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | '9:21'. */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | '9:21'
  /** Whether to loop the generated video. */
  loop?: boolean
  /** Seed for reproducible generations. */
  seed?: number
}

function lumaHeaders(): Record<string, string> {
  const key = getCredential('LUMA_API_KEY') || ''
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/**
 * Normalize Luma's status reply into our LumaTask shape. Returns null
 * on missing required fields so the caller can surface "task not
 * found" cleanly.
 */
function normalizeTask(raw: Record<string, unknown> | null): LumaTask | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '')
  if (!id) return null
  const rawState = String(raw.state || raw.status || '').toLowerCase()
  // Luma's documented states map cleanly; default unknown → 'queued' so
  // callers don't crash on an unfamiliar value.
  const status: LumaTask['status'] =
    rawState === 'completed' ? 'completed'
    : rawState === 'failed' ? 'failed'
    : rawState === 'dreaming' ? 'dreaming'
    : 'queued'
  const assets = (raw.assets || {}) as Record<string, unknown>
  const videoUrl = typeof assets.video === 'string' ? assets.video : undefined
  return {
    id,
    status,
    progress: typeof raw.progress === 'number' ? raw.progress : undefined,
    videoUrl,
    failureReason: typeof raw.failure_reason === 'string' ? raw.failure_reason : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  }
}

export async function generateLumaFromText(
  prompt: string,
  options?: LumaGenOptions,
): Promise<{ id: string } | null> {
  const key = getCredential('LUMA_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${LUMA_BASE}/generations`, {
      method: 'POST',
      headers: lumaHeaders(),
      body: JSON.stringify({
        prompt,
        aspect_ratio: options?.aspectRatio ?? '16:9',
        loop: options?.loop ?? false,
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    const id = String(json.id || '')
    return id ? { id } : null
  } catch {
    return null
  }
}

export async function generateLumaFromImage(
  imageUrl: string,
  prompt: string,
  options?: LumaGenOptions,
): Promise<{ id: string } | null> {
  const key = getCredential('LUMA_API_KEY')
  if (!key) return null
  try {
    // Luma uses keyframes for image-to-video — frame 0 is the start image.
    const res = await fetch(`${LUMA_BASE}/generations`, {
      method: 'POST',
      headers: lumaHeaders(),
      body: JSON.stringify({
        prompt,
        aspect_ratio: options?.aspectRatio ?? '16:9',
        loop: options?.loop ?? false,
        keyframes: {
          frame0: { type: 'image', url: imageUrl },
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    const id = String(json.id || '')
    return id ? { id } : null
  } catch {
    return null
  }
}

export async function getLumaTaskStatus(taskId: string): Promise<LumaTask | null> {
  const key = getCredential('LUMA_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${LUMA_BASE}/generations/${encodeURIComponent(taskId)}`, {
      headers: lumaHeaders(),
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    return normalizeTask(json)
  } catch {
    return null
  }
}

export function isLumaAvailable(): boolean {
  return !!getCredential('LUMA_API_KEY')
}
