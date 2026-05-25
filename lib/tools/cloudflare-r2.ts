// Cloudflare R2 via user-deployed Worker endpoint

export interface R2UploadResult {
  url: string
  key: string
}

export async function uploadToR2(
  key: string,
  dataBase64: string,
  contentType = 'application/octet-stream'
): Promise<R2UploadResult | null> {
  const workerUrl = process.env.R2_WORKER_URL
  if (!workerUrl) return null
  try {
    const res = await fetch(`${workerUrl}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, data: dataBase64, contentType }),
    })
    if (!res.ok) return null
    return (await res.json()) as R2UploadResult
  } catch {
    return null
  }
}

export function getR2Url(key: string): string {
  const workerUrl = process.env.R2_WORKER_URL ?? ''
  return `${workerUrl}/files/${key}`
}

export async function listR2Files(
  prefix?: string
): Promise<{ keys: string[] } | null> {
  const workerUrl = process.env.R2_WORKER_URL
  if (!workerUrl) return null
  try {
    const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    const res = await fetch(`${workerUrl}/list${params}`)
    if (!res.ok) return null
    return (await res.json()) as { keys: string[] }
  } catch {
    return null
  }
}

export async function deleteFromR2(key: string): Promise<boolean> {
  const workerUrl = process.env.R2_WORKER_URL
  if (!workerUrl) return false
  try {
    const res = await fetch(`${workerUrl}/files/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

export function isR2Available(): boolean {
  return !!process.env.R2_WORKER_URL
}
