// LinkedIn API v2

const LINKEDIN_BASE = 'https://api.linkedin.com/v2'

export interface LinkedInProfile {
  sub: string
  name?: string
  email?: string
  picture?: string
}

export interface LinkedInPost {
  id: string
}

export async function getProfile(
  accessToken: string
): Promise<LinkedInProfile | null> {
  if (!accessToken) return null
  try {
    const res = await fetch(`${LINKEDIN_BASE}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    return (await res.json()) as LinkedInProfile
  } catch {
    return null
  }
}

export async function createTextPost(
  text: string,
  accessToken: string,
  authorUrn: string
): Promise<LinkedInPost | null> {
  if (!accessToken || !authorUrn) return null
  try {
    const res = await fetch(`${LINKEDIN_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const id: string = json.id ?? json['x-restli-id']
    return id ? { id } : null
  } catch {
    return null
  }
}

export async function createArticlePost(
  title: string,
  text: string,
  url: string,
  accessToken: string,
  authorUrn: string
): Promise<LinkedInPost | null> {
  if (!accessToken || !authorUrn) return null
  try {
    const res = await fetch(`${LINKEDIN_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'ARTICLE',
            media: [
              {
                status: 'READY',
                originalUrl: url,
                title: { text: title },
                description: { text },
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const id: string = json.id ?? json['x-restli-id']
    return id ? { id } : null
  } catch {
    return null
  }
}

export function isLinkedInAvailable(): boolean {
  return !!process.env.LINKEDIN_CLIENT_ID
}
