/**
 * lib/tools/pika.ts — Sprint 12E
 *
 * Pika Labs video API client. As of writing, Pika operates a public
 * API at https://devapi.pika.art but access is invitation-only and the
 * REST surface is in active flux. We model the adapter so that:
 *
 *   1. If the user has set their PIKA_API_KEY, we submit jobs to the
 *      documented endpoint and return real task IDs. Even if Pika's
 *      shape changes under us, the route handler surfaces the underlying
 *      HTTP status to the UI.
 *
 *   2. If the user has NOT set a key, we return a clear { error:
 *      'no_key' } so the frontend can render a "paste a Pika key in
 *      Settings" CTA.
 *
 *   3. If Pika hasn't granted them access, the API returns 403 — we
 *      bubble that up as { error: 'no_access' } so the UI distinguishes
 *      "needs key" from "key set but Pika hasn't enabled API access".
 *
 * Docs (subject to change): https://devapi.pika.art
 */

import { getCredential } from '@/lib/credential-context'

const PIKA_BASE = 'https://devapi.pika.art'

export interface PikaTask {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  failureReason?: string
  createdAt?: string
}

export interface PikaGenOptions {
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '5:4'
  motion?: 1 | 2 | 3 | 4   // Pika's motion intensity scale
  style?: 'realistic' | 'cartoon' | 'cinematic' | '3d'
}

function pikaHeaders(): Record<string, string> | null {
  const key = getCredential('PIKA_API_KEY') || ''
  if (!key) return null
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

function normalize(raw: Record<string, unknown> | null): PikaTask | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || raw.video_id || '')
  if (!id) return null
  const rawStatus = String(raw.status || '').toLowerCase()
  const status: PikaTask['status'] =
    rawStatus === 'completed' || rawStatus === 'finished' ? 'completed'
    : rawStatus === 'failed' || rawStatus === 'error' ? 'failed'
    : rawStatus === 'processing' || rawStatus === 'rendering' ? 'processing'
    : 'queued'
  const videoUrl =
    typeof raw.video_url === 'string' ? raw.video_url
    : typeof raw.result_url === 'string' ? raw.result_url
    : undefined
  return {
    id,
    status,
    videoUrl,
    failureReason: typeof raw.error === 'string' ? raw.error : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  }
}

export async function generatePikaFromText(
  prompt: string,
  options?: PikaGenOptions,
): Promise<{ id: string } | { error: 'no_key' | 'no_access' | 'failed', detail?: string }> {
  const headers = pikaHeaders()
  if (!headers) return { error: 'no_key' }
  try {
    const res = await fetch(`${PIKA_BASE}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
        ...(options?.motion !== undefined ? { motion: options.motion } : {}),
        ...(options?.style ? { style: options.style } : {}),
      }),
    })
    if (res.status === 401 || res.status === 403) {
      const errBody = await res.text().catch(() => '')
      return { error: 'no_access', detail: errBody.slice(0, 300) }
    }
    if (!res.ok) {
      return { error: 'failed', detail: `HTTP ${res.status}` }
    }
    const json = await res.json() as Record<string, unknown>
    const id = String(json.id || json.video_id || '')
    return id ? { id } : { error: 'failed', detail: 'Missing id in response' }
  } catch (e) {
    return { error: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

export async function getPikaTaskStatus(taskId: string): Promise<PikaTask | null> {
  const headers = pikaHeaders()
  if (!headers) return null
  try {
    const res = await fetch(`${PIKA_BASE}/jobs/${encodeURIComponent(taskId)}`, { headers })
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    return normalize(json)
  } catch {
    return null
  }
}

export function isPikaConfigured(): boolean {
  return !!getCredential('PIKA_API_KEY')
}
