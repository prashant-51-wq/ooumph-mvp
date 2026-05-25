// Ghost Admin API
import crypto from 'crypto'

export interface GhostPost {
  id: string
  url: string
  title: string
  status: string
  published_at: string
}

function ghostJWT(adminKey: string): string {
  const [id, secret] = adminKey.split(':')
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ exp: now + 300, iat: now, aud: '/admin/' })
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

export async function createGhostPost(
  ghostUrl: string,
  adminKey: string,
  data: {
    title: string
    html: string
    status: 'draft' | 'published'
    tags?: string[]
    customExcerpt?: string
  }
): Promise<GhostPost | null> {
  if (!ghostUrl || !adminKey) return null
  try {
    const token = ghostJWT(adminKey)
    const body = {
      posts: [
        {
          title: data.title,
          html: data.html,
          status: data.status,
          ...(data.tags && data.tags.length > 0
            ? { tags: data.tags.map((t) => ({ name: t })) }
            : {}),
          ...(data.customExcerpt ? { custom_excerpt: data.customExcerpt } : {}),
        },
      ],
    }
    const res = await fetch(`${ghostUrl}/ghost/api/admin/posts/`, {
      method: 'POST',
      headers: {
        Authorization: `Ghost ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = await res.json()
    const post = json.posts?.[0]
    if (!post) return null
    return {
      id: post.id || '',
      url: post.url || '',
      title: post.title || data.title,
      status: post.status || data.status,
      published_at: post.published_at || '',
    }
  } catch {
    return null
  }
}

export async function getGhostPosts(
  ghostUrl: string,
  adminKey: string,
  limit = 10
): Promise<GhostPost[]> {
  if (!ghostUrl || !adminKey) return []
  try {
    const token = ghostJWT(adminKey)
    const res = await fetch(
      `${ghostUrl}/ghost/api/admin/posts/?limit=${limit}&fields=id,url,title,status,published_at`,
      {
        headers: { Authorization: `Ghost ${token}` },
      }
    )
    if (!res.ok) return []
    const json = await res.json()
    const posts = json.posts || []
    return (Array.isArray(posts) ? posts : []).map(
      (p: { id: string; url: string; title: string; status: string; published_at: string }) => ({
        id: p.id || '',
        url: p.url || '',
        title: p.title || '',
        status: p.status || '',
        published_at: p.published_at || '',
      })
    )
  } catch {
    return []
  }
}

export async function testGhostConnection(
  ghostUrl: string,
  adminKey: string
): Promise<boolean> {
  if (!ghostUrl || !adminKey) return false
  try {
    const token = ghostJWT(adminKey)
    const res = await fetch(`${ghostUrl}/ghost/api/admin/site/`, {
      headers: { Authorization: `Ghost ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}
