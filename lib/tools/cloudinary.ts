// Cloudinary Image Upload & Management

import crypto from 'crypto'

export interface CloudinaryAsset {
  publicId: string
  secureUrl: string
  format: string
  width: number
  height: number
  bytes: number
  createdAt?: string
}

function buildSignature(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const sortedStr = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha256').update(sortedStr + apiSecret).digest('hex')
}

function mapAsset(data: Record<string, unknown>): CloudinaryAsset {
  return {
    publicId: data.public_id as string,
    secureUrl: data.secure_url as string,
    format: data.format as string,
    width: data.width as number,
    height: data.height as number,
    bytes: data.bytes as number,
    createdAt: data.created_at as string | undefined,
  }
}

async function uploadFormData(
  fileValue: string,
  folder: string | undefined,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<CloudinaryAsset | null> {
  const timestamp = Math.floor(Date.now() / 1000)
  const params: Record<string, string | number> = { timestamp }
  if (folder) params.folder = folder

  const signature = buildSignature(params, apiSecret)

  const form = new FormData()
  form.append('file', fileValue)
  if (folder) form.append('folder', folder)
  form.append('timestamp', String(timestamp))
  form.append('api_key', apiKey)
  form.append('signature', signature)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) return null
  const json = await res.json()
  return mapAsset(json)
}

export async function uploadImageUrl(
  imageUrl: string,
  folder?: string
): Promise<CloudinaryAsset | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  try {
    return await uploadFormData(imageUrl, folder, cloudName, apiKey, apiSecret)
  } catch {
    return null
  }
}

export async function uploadBase64(
  base64Data: string,
  folder?: string,
  mimeType?: string
): Promise<CloudinaryAsset | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  try {
    const fileValue = `data:${mimeType ?? 'image/png'};base64,${base64Data}`
    return await uploadFormData(fileValue, folder, cloudName, apiKey, apiSecret)
  } catch {
    return null
  }
}

export function buildCloudinaryUrl(
  publicId: string,
  transformations?: string
): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? ''
  const t = transformations ? `${transformations}/` : ''
  return `https://res.cloudinary.com/${cloudName}/image/upload/${t}${publicId}`
}

export async function listCloudinaryImages(
  folder?: string,
  maxResults = 50
): Promise<CloudinaryAsset[]> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return []
  try {
    const params = new URLSearchParams({
      type: 'upload',
      max_results: String(maxResults),
    })
    if (folder) params.set('prefix', folder)
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?${params}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    if (!res.ok) return []
    const json = await res.json()
    return ((json.resources ?? []) as Record<string, unknown>[]).map(mapAsset)
  } catch {
    return []
  }
}

export async function deleteCloudinaryImage(publicId: string): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return false
  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const params: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
    }
    const signature = buildSignature(params, apiSecret)

    const form = new FormData()
    form.append('public_id', publicId)
    form.append('timestamp', String(timestamp))
    form.append('api_key', apiKey)
    form.append('signature', signature)

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: 'POST', body: form }
    )
    if (!res.ok) return false
    const json = await res.json()
    return json.result === 'ok'
  } catch {
    return false
  }
}

export function isCloudinaryAvailable(): boolean {
  return (
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET
  )
}
