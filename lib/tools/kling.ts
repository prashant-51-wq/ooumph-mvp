/**
 * lib/tools/kling.ts — Sprint 12A
 *
 * Kling AI (Kuaishou) video API client. Sibling to lib/tools/runway.ts.
 *
 * Authentication: Kling uses HMAC-SHA256-signed JWTs. The user provides
 * an access_key + secret_key pair from klingai.com → API Management.
 * For each request we mint a short-lived JWT (30-minute exp) so a
 * leaked single request token isn't broadly reusable.
 *
 * The Kling API is asynchronous: POST creates a task_id, GET polls it
 * for status until the URL is ready. Same lifecycle as Runway and Luma.
 *
 * Docs: https://docs.qingque.cn/d/home/eZQDp1cUWzcJ48ZmAttn5wzAi
 *
 * Note: Kling's standard plan supports gen-1.0, gen-1.5, and 2.0
 * models. We pick 2.0 by default (highest quality) but the option
 * field lets callers downgrade for cost.
 */

import crypto from 'crypto'

const KLING_BASE = 'https://api.klingai.com'

export interface KlingTask {
  id: string
  status: 'submitted' | 'processing' | 'succeeded' | 'failed'
  progress?: number
  videoUrl?: string
  failureReason?: string
  createdAt?: string
}

export interface KlingGenOptions {
  /** 'kling-v1' | 'kling-v1-5' | 'kling-v2' — defaults to v2 (latest). */
  model?: 'kling-v1' | 'kling-v1-5' | 'kling-v2'
  /** 5 or 10 seconds. */
  duration?: 5 | 10
  /** Aspect ratio. */
  aspectRatio?: '16:9' | '9:16' | '1:1'
  /** Camera mode for richer motion. */
  cameraMode?: 'horizontal' | 'vertical' | 'roll' | 'zoom' | 'tilt' | 'pan'
}

/**
 * Build a JWT signed with the user's Kling secret key. Kling's spec is
 * HS256, 30-min default expiry, with iss = ak (access key).
 */
function buildKlingJWT(): string | null {
  const ak = process.env.KLING_ACCESS_KEY || ''
  const sk = process.env.KLING_SECRET_KEY || ''
  if (!ak || !sk) return null

  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: ak,
    exp: now + 30 * 60,   // 30 minutes — matches Kling's recommendation
    nbf: now - 5,         // tolerate ~5s clock skew
  }
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  const headerB64 = enc(header)
  const payloadB64 = enc(payload)
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = crypto
    .createHmac('sha256', sk)
    .update(signingInput)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${signingInput}.${signature}`
}

function klingHeaders(): Record<string, string> | null {
  const token = buildKlingJWT()
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/**
 * Normalize Kling's status reply. Kling returns codes like
 * 'submitted' | 'processing' | 'succeeded' | 'failed'.
 */
function normalizeTask(raw: Record<string, unknown> | null): KlingTask | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.task_id || raw.id || '')
  if (!id) return null
  const rawStatus = String(raw.task_status || raw.status || '').toLowerCase()
  const status: KlingTask['status'] =
    rawStatus === 'succeed' || rawStatus === 'succeeded' ? 'succeeded'
    : rawStatus === 'failed' ? 'failed'
    : rawStatus === 'processing' ? 'processing'
    : 'submitted'
  const result = (raw.task_result || raw.result || {}) as Record<string, unknown>
  const videos = (result.videos || []) as Array<Record<string, unknown>>
  const videoUrl = videos[0] && typeof videos[0].url === 'string' ? videos[0].url : undefined
  return {
    id,
    status,
    videoUrl,
    failureReason: typeof raw.task_status_msg === 'string' ? raw.task_status_msg : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  }
}

export async function generateKlingFromText(
  prompt: string,
  options?: KlingGenOptions,
): Promise<{ id: string } | null> {
  const headers = klingHeaders()
  if (!headers) return null
  try {
    const res = await fetch(`${KLING_BASE}/v1/videos/text2video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model_name: options?.model ?? 'kling-v2',
        prompt,
        aspect_ratio: options?.aspectRatio ?? '16:9',
        duration: String(options?.duration ?? 5),
        ...(options?.cameraMode ? { camera_control: { type: options.cameraMode } } : {}),
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    const data = (json.data || {}) as Record<string, unknown>
    const id = String(data.task_id || json.task_id || '')
    return id ? { id } : null
  } catch {
    return null
  }
}

export async function generateKlingFromImage(
  imageUrl: string,
  prompt: string,
  options?: KlingGenOptions,
): Promise<{ id: string } | null> {
  const headers = klingHeaders()
  if (!headers) return null
  try {
    const res = await fetch(`${KLING_BASE}/v1/videos/image2video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model_name: options?.model ?? 'kling-v2',
        image: imageUrl,
        prompt,
        aspect_ratio: options?.aspectRatio ?? '16:9',
        duration: String(options?.duration ?? 5),
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    const data = (json.data || {}) as Record<string, unknown>
    const id = String(data.task_id || json.task_id || '')
    return id ? { id } : null
  } catch {
    return null
  }
}

export async function getKlingTaskStatus(taskId: string): Promise<KlingTask | null> {
  const headers = klingHeaders()
  if (!headers) return null
  try {
    // Kling's status endpoint accepts the original endpoint family +
    // /{task_id}. We try text2video first; if 404, fall back to
    // image2video. (Kling's GET status endpoints are family-scoped.)
    const families = ['text2video', 'image2video'] as const
    for (const family of families) {
      const res = await fetch(`${KLING_BASE}/v1/videos/${family}/${encodeURIComponent(taskId)}`, { headers })
      if (res.ok) {
        const json = await res.json() as Record<string, unknown>
        const data = (json.data || json) as Record<string, unknown>
        const task = normalizeTask(data)
        if (task) return task
      }
    }
    return null
  } catch {
    return null
  }
}

export function isKlingAvailable(): boolean {
  return !!(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY)
}
