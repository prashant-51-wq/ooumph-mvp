// WordPress REST API v2 (Application Password auth)

export interface WPPost {
  id: number
  link: string
  title: string
  status: string
  date: string
}

function wpAuth(username: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64')
}

async function resolveOrCreateTerm(
  siteUrl: string,
  auth: string,
  taxonomy: 'tags' | 'categories',
  name: string
): Promise<number | null> {
  const endpoint = taxonomy === 'tags' ? 'tags' : 'categories'
  try {
    // Try to find existing
    const searchRes = await fetch(
      `${siteUrl}/wp-json/wp/v2/${endpoint}?search=${encodeURIComponent(name)}`,
      { headers: { Authorization: auth } }
    )
    if (searchRes.ok) {
      const items = await searchRes.json()
      const match = (items as { id: number; name: string }[]).find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      )
      if (match) return match.id
    }

    // Create if not found
    const createRes = await fetch(`${siteUrl}/wp-json/wp/v2/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    })
    if (!createRes.ok) return null
    const created = await createRes.json()
    return created.id || null
  } catch {
    return null
  }
}

export async function createWPPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  data: {
    title: string
    content: string
    excerpt?: string
    status: 'draft' | 'publish' | 'pending'
    tags?: string[]
    categories?: string[]
    featuredImageUrl?: string
  }
): Promise<WPPost | null> {
  if (!siteUrl || !username || !appPassword) return null
  try {
    const auth = wpAuth(username, appPassword)

    // Resolve tags and categories in parallel
    const [tagIds, categoryIds] = await Promise.all([
      data.tags && data.tags.length > 0
        ? Promise.all(data.tags.map((t) => resolveOrCreateTerm(siteUrl, auth, 'tags', t)))
        : Promise.resolve([]),
      data.categories && data.categories.length > 0
        ? Promise.all(data.categories.map((c) => resolveOrCreateTerm(siteUrl, auth, 'categories', c)))
        : Promise.resolve([]),
    ])

    const validTagIds = (tagIds as (number | null)[]).filter((id): id is number => id !== null)
    const validCategoryIds = (categoryIds as (number | null)[]).filter((id): id is number => id !== null)

    const body: Record<string, unknown> = {
      title: data.title,
      content: data.content,
      status: data.status,
      ...(data.excerpt ? { excerpt: data.excerpt } : {}),
      ...(validTagIds.length > 0 ? { tags: validTagIds } : {}),
      ...(validCategoryIds.length > 0 ? { categories: validCategoryIds } : {}),
    }

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const post = await res.json()
    return {
      id: post.id,
      link: post.link || '',
      title: post.title?.rendered || post.title || data.title,
      status: post.status || data.status,
      date: post.date || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function createWPPage(
  siteUrl: string,
  username: string,
  appPassword: string,
  data: { title: string; content: string; status: 'draft' | 'publish' }
): Promise<WPPost | null> {
  if (!siteUrl || !username || !appPassword) return null
  try {
    const auth = wpAuth(username, appPassword)
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/pages`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        status: data.status,
      }),
    })
    if (!res.ok) return null
    const page = await res.json()
    return {
      id: page.id,
      link: page.link || '',
      title: page.title?.rendered || page.title || data.title,
      status: page.status || data.status,
      date: page.date || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function getWPPosts(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit = 10
): Promise<WPPost[]> {
  if (!siteUrl || !username || !appPassword) return []
  try {
    const auth = wpAuth(username, appPassword)
    const res = await fetch(
      `${siteUrl}/wp-json/wp/v2/posts?per_page=${limit}&_fields=id,link,title,status,date`,
      { headers: { Authorization: auth } }
    )
    if (!res.ok) return []
    const posts = await res.json()
    return (Array.isArray(posts) ? posts : []).map(
      (p: { id: number; link: string; title: { rendered?: string } | string; status: string; date: string }) => ({
        id: p.id,
        link: p.link || '',
        title: typeof p.title === 'object' ? (p.title.rendered || '') : (p.title || ''),
        status: p.status || '',
        date: p.date || '',
      })
    )
  } catch {
    return []
  }
}

export async function testWPConnection(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<boolean> {
  if (!siteUrl || !username || !appPassword) return false
  try {
    const auth = wpAuth(username, appPassword)
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth },
    })
    return res.ok
  } catch {
    return false
  }
}
