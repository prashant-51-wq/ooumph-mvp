// YouTube Data API v3 & Analytics

import { getCredential } from '@/lib/credential-context'

const YT_DATA_BASE = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeChannel {
  id: string
  title: string
  description?: string
  subscriberCount?: number
  viewCount?: number
  videoCount?: number
  thumbnailUrl?: string
}

export interface YouTubeVideo {
  id: string
  title: string
  channelTitle?: string
  publishedAt?: string
  thumbnailUrl?: string
  viewCount?: number
  description?: string
}

export async function getChannelInfo(
  accessToken: string
): Promise<YouTubeChannel | null> {
  if (!accessToken) return null
  try {
    const res = await fetch(
      `${YT_DATA_BASE}/channels?part=snippet,statistics&mine=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return null
    const json = await res.json()
    const item = json.items?.[0]
    if (!item) return null
    return {
      id: item.id,
      title: item.snippet?.title,
      description: item.snippet?.description,
      subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
      viewCount: Number(item.statistics?.viewCount ?? 0),
      videoCount: Number(item.statistics?.videoCount ?? 0),
      thumbnailUrl: item.snippet?.thumbnails?.default?.url,
    }
  } catch {
    return null
  }
}

export async function searchVideos(
  query: string,
  maxResults = 10
): Promise<YouTubeVideo[]> {
  const key = getCredential('YOUTUBE_API_KEY')
  if (!key) return []
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(maxResults),
      key,
    })
    const res = await fetch(`${YT_DATA_BASE}/search?${params}`)
    if (!res.ok) return []
    const json = await res.json()
    return ((json.items ?? []) as Record<string, unknown>[]).map((item) => {
      const id = item.id as Record<string, string>
      const snippet = item.snippet as Record<string, unknown>
      const thumbs = snippet?.thumbnails as Record<string, { url: string }> | undefined
      return {
        id: id?.videoId ?? '',
        title: (snippet?.title as string) ?? '',
        channelTitle: snippet?.channelTitle as string | undefined,
        publishedAt: snippet?.publishedAt as string | undefined,
        thumbnailUrl: thumbs?.default?.url,
        description: snippet?.description as string | undefined,
      }
    })
  } catch {
    return []
  }
}

export async function getVideoDetails(
  videoId: string
): Promise<YouTubeVideo | null> {
  const key = getCredential('YOUTUBE_API_KEY')
  if (!key) return null
  try {
    const params = new URLSearchParams({
      part: 'statistics,snippet',
      id: videoId,
      key,
    })
    const res = await fetch(`${YT_DATA_BASE}/videos?${params}`)
    if (!res.ok) return null
    const json = await res.json()
    const item = json.items?.[0]
    if (!item) return null
    const thumbs = item.snippet?.thumbnails as
      | Record<string, { url: string }>
      | undefined
    return {
      id: item.id,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle,
      publishedAt: item.snippet?.publishedAt,
      thumbnailUrl: thumbs?.default?.url,
      viewCount: Number(item.statistics?.viewCount ?? 0),
      description: item.snippet?.description,
    }
  } catch {
    return null
  }
}

export function getUploadInstructions(): { message: string; steps: string[] } {
  return {
    message:
      'Video upload to YouTube requires a full OAuth 2.0 flow with upload scope and a resumable upload session. This cannot be done with a simple fetch call.',
    steps: [
      '1. Complete OAuth 2.0 with scope https://www.googleapis.com/auth/youtube.upload',
      '2. POST to https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable with video metadata to get a session URI',
      '3. PUT the video binary to the session URI with Content-Type and Content-Length headers',
      '4. Handle 308 Resume Incomplete responses for large files',
    ],
  }
}

export function isYouTubeAvailable(): boolean {
  return !!getCredential('YOUTUBE_API_KEY')
}
