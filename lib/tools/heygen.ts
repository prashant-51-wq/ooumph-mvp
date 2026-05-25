// HeyGen API

const HEYGEN_BASE = 'https://api.heygen.com'

export interface HeyGenAvatar {
  avatar_id: string
  avatar_name: string
  preview_image_url?: string
  preview_video_url?: string
  gender?: string
}

export interface HeyGenVoice {
  voice_id: string
  language: string
  gender: string
  name: string
  preview_audio?: string
}

export interface HeyGenVideo {
  video_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  video_url?: string
  thumbnail_url?: string
  duration?: number
  created_at?: number
  title?: string
}

export interface HeyGenGenerateOptions {
  avatarId: string
  voiceId: string
  script: string
  title?: string
  background?: string
  width?: number
  height?: number
}

function heyGenHeaders(): Record<string, string> {
  const key = process.env.HEYGEN_API_KEY || ''
  return {
    'X-Api-Key': key,
    'Content-Type': 'application/json',
  }
}

export async function getHeyGenAvatars(): Promise<HeyGenAvatar[]> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
      headers: heyGenHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data?.avatars || []
  } catch {
    return []
  }
}

export async function getHeyGenVoices(): Promise<HeyGenVoice[]> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
      headers: heyGenHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data?.voices || []
  } catch {
    return []
  }
}

export async function generateHeyGenVideo(
  options: HeyGenGenerateOptions
): Promise<{ videoId: string } | null> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) return null
  try {
    const backgroundValue = options.background || '#ffffff'
    const isUrl =
      backgroundValue.startsWith('http://') || backgroundValue.startsWith('https://')
    const background = isUrl
      ? { type: 'image', url: backgroundValue }
      : { type: 'color', value: backgroundValue }

    const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST',
      headers: heyGenHeaders(),
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id: options.avatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: options.script,
              voice_id: options.voiceId,
              speed: 1.0,
            },
            background,
          },
        ],
        dimension: {
          width: options.width ?? 1280,
          height: options.height ?? 720,
        },
        title: options.title || 'Ooumph Generated Video',
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const videoId = json.data?.video_id
    return videoId ? { videoId } : null
  } catch {
    return null
  }
}

export async function getHeyGenVideoStatus(videoId: string): Promise<HeyGenVideo | null> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/video_status.get?video_id=${videoId}`, {
      headers: heyGenHeaders(),
    })
    if (!res.ok) return null
    const json = await res.json()
    const data = json.data
    if (!data) return null
    return {
      video_id: videoId,
      status: data.status || 'pending',
      video_url: data.video_url,
      thumbnail_url: data.thumbnail_url,
      duration: data.duration,
    }
  } catch {
    return null
  }
}

export async function listHeyGenVideos(): Promise<HeyGenVideo[]> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${HEYGEN_BASE}/v1/video.list?limit=20`, {
      headers: heyGenHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    const videos: Record<string, unknown>[] = json.data?.videos || []
    return videos.map((v) => ({
      video_id: String(v.video_id || ''),
      status: (v.status as HeyGenVideo['status']) || 'pending',
      video_url: v.video_url ? String(v.video_url) : undefined,
      thumbnail_url: v.thumbnail_url ? String(v.thumbnail_url) : undefined,
      duration: v.duration ? Number(v.duration) : undefined,
      created_at: v.created_at ? Number(v.created_at) : undefined,
      title: v.title ? String(v.title) : undefined,
    }))
  } catch {
    return []
  }
}

export function isHeyGenAvailable(): boolean {
  return !!process.env.HEYGEN_API_KEY
}
