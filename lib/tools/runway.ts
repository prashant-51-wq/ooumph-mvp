// Runway ML API

import { getCredential } from '@/lib/credential-context'

const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1'

export interface RunwayTask {
  id: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress?: number
  output?: string[]
  failure?: string
  createdAt?: string
}

export interface RunwayGenOptions {
  duration?: 5 | 10
  ratio?: '1280:768' | '768:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672'
  seed?: number
  watermark?: boolean
}

function runwayHeaders(): Record<string, string> {
  const key = getCredential('RUNWAY_API_KEY') || ''
  return {
    Authorization: `Bearer ${key}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type': 'application/json',
  }
}

export async function generateVideoFromText(
  prompt: string,
  options?: RunwayGenOptions
): Promise<{ id: string } | null> {
  const key = getCredential('RUNWAY_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${RUNWAY_BASE}/text_to_video`, {
      method: 'POST',
      headers: runwayHeaders(),
      body: JSON.stringify({
        promptText: prompt,
        model: 'gen3a_turbo',
        duration: options?.duration ?? 5,
        ratio: options?.ratio ?? '1280:768',
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
        watermark: options?.watermark ?? false,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.id ? { id: json.id } : null
  } catch {
    return null
  }
}

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  options?: RunwayGenOptions
): Promise<{ id: string } | null> {
  const key = getCredential('RUNWAY_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
      method: 'POST',
      headers: runwayHeaders(),
      body: JSON.stringify({
        promptImage: imageUrl,
        promptText: prompt,
        model: 'gen3a_turbo',
        duration: options?.duration ?? 5,
        ratio: options?.ratio ?? '1280:768',
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
        watermark: options?.watermark ?? false,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.id ? { id: json.id } : null
  } catch {
    return null
  }
}

export async function getRunwayTaskStatus(taskId: string): Promise<RunwayTask | null> {
  const key = getCredential('RUNWAY_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: runwayHeaders(),
    })
    if (!res.ok) return null
    const json = await res.json()
    return {
      id: String(json.id || taskId),
      status: json.status || 'PENDING',
      progress: json.progress,
      output: json.output,
      failure: json.failure,
      createdAt: json.createdAt,
    }
  } catch {
    return null
  }
}

export async function cancelRunwayTask(taskId: string): Promise<boolean> {
  const key = getCredential('RUNWAY_API_KEY')
  if (!key) return false
  try {
    const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}/cancel`, {
      method: 'DELETE',
      headers: runwayHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export function isRunwayAvailable(): boolean {
  return !!getCredential('RUNWAY_API_KEY')
}
