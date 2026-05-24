import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'

interface Integration {
  access_token: string
  account_id: string
  platform: string
}

// ─── Build image URL from artifact content ─────────────────────────────────

function buildImageUrl(content: Record<string, unknown>, type: string, size = 'square'): string {
  const tone = (content.tone as string) || 'professional'
  const business = ((content.businessName as string) || '').slice(0, 40)

  if (type === 'visual_carousel') {
    const slides = content.slides as Array<{ type: string; title?: string; coverText?: string }> | undefined
    const cover = slides?.find(s => s.type === 'cover')
    const params = new URLSearchParams({
      type: 'cover', tone, business,
      title: (cover?.title || '').slice(0, 100),
      coverText: (cover?.coverText || '').slice(0, 150),
    })
    return `${BASE_URL}/api/creative/carousel/slide?${params}`
  }

  if (type === 'youtube_thumbnail') {
    const params = new URLSearchParams({
      layout: (content.layout as string) || 'hook', tone, business,
      headline: ((content.headline as string) || '').slice(0, 60),
      subtext: ((content.subtext as string) || '').slice(0, 80),
      ...(content.accentNumber ? { accentNumber: String(content.accentNumber).slice(0, 10) } : {}),
      ...(content.accentWord ? { accentWord: String(content.accentWord).slice(0, 20) } : {}),
    })
    return `${BASE_URL}/api/creative/thumbnail?${params}`
  }

  if (type === 'visual_post') {
    const params = new URLSearchParams({
      tone, business,
      hook: ((content.hook as string) || '').slice(0, 80),
      body: ((content.body as string) || '').slice(0, 120),
      cta: ((content.cta as string) || '').slice(0, 60),
      platform: (content.platform as string) || 'instagram',
    })
    return `${BASE_URL}/api/creative/static-post?${params}`
  }

  if (type === 'visual_story') {
    const params = new URLSearchParams({
      tone, business,
      hook: ((content.hook as string) || '').slice(0, 80),
      subtext: ((content.subtext as string) || '').slice(0, 100),
      cta: ((content.cta as string) || '').slice(0, 60),
      label: ((content.label as string) || 'NEW').slice(0, 20),
    })
    return `${BASE_URL}/api/creative/story-cover?${params}`
  }

  if (type === 'visual_ad') {
    const params = new URLSearchParams({
      tone, business, size,
      headline: ((content.headline as string) || '').slice(0, 80),
      subtext: ((content.subtext as string) || '').slice(0, 120),
      cta: ((content.cta as string) || '').slice(0, 50),
      offer: ((content.offer as string) || '').slice(0, 60),
    })
    return `${BASE_URL}/api/creative/ad-creative?${params}`
  }

  return ''
}

// ─── Build caption/copy text from artifact content ─────────────────────────

function buildCaptionText(content: Record<string, unknown>, type: string): string {
  const hashtags = ((content.hashtags as string[]) || []).map(h => `#${h}`).join(' ')

  if (type === 'visual_carousel') {
    const slides = content.slides as Array<{ type: string; headline?: string; body?: string; cta?: string }> | undefined
    const contentSlides = slides?.filter(s => s.type === 'slide') || []
    const ctaSlide = slides?.find(s => s.type === 'cta')
    const lines = contentSlides.slice(0, 3).map((s, i) => `${i + 1}. ${s.headline || ''}`)
    const cta = ctaSlide?.cta || 'Check it out →'
    const business = (content.businessName as string) || ''
    return [
      `📌 Swipe through for the full breakdown →`,
      '',
      ...lines,
      '',
      cta,
      '',
      `— ${business}`,
      '',
      '#marketing #business #content',
    ].join('\n')
  }

  if (type === 'visual_post') {
    const hook = (content.hook as string) || ''
    const body = (content.body as string) || ''
    const cta = (content.cta as string) || ''
    return [hook, body, cta, hashtags].filter(Boolean).join('\n\n')
  }

  if (type === 'visual_story') {
    const hook = (content.hook as string) || ''
    const subtext = (content.subtext as string) || ''
    const cta = (content.cta as string) || ''
    return [hook, subtext, cta].filter(Boolean).join('\n\n')
  }

  if (type === 'visual_ad') {
    const headline = (content.headline as string) || ''
    const subtext = (content.subtext as string) || ''
    const offer = (content.offer as string) || ''
    const cta = (content.cta as string) || ''
    return [offer, headline, subtext, cta].filter(Boolean).join('\n\n')
  }

  if (type === 'youtube_thumbnail') {
    const headline = (content.headline as string) || ''
    const subtext = (content.subtext as string) || ''
    return [headline, subtext, '#youtube #content #growth'].filter(Boolean).join('\n\n')
  }

  if (type === 'linkedInPost') {
    const hook = (content.hook as string) || ''
    const body = (content.body as string) || ''
    const cta = (content.cta as string) || ''
    const tags = ((content.hashtags as string[]) || []).map(h => `#${h}`).join(' ')
    return [hook, body, cta, tags].filter(Boolean).join('\n\n')
  }

  return ''
}

// ─── Instagram Graph API ───────────────────────────────────────────────────

async function publishToInstagram(token: string, igUserId: string, imageUrl: string, caption: string) {
  const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  })
  const container = await containerRes.json() as { id?: string; error?: { message: string } }
  if (!container.id) throw new Error(`Instagram container error: ${container.error?.message || 'Unknown'}`)

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  })
  const published = await publishRes.json() as { id?: string; error?: { message: string } }
  if (!published.id) throw new Error(`Instagram publish error: ${published.error?.message || 'Unknown'}`)

  return { postId: published.id, postUrl: `https://www.instagram.com/p/${published.id}/` }
}

// True Instagram carousel: one media container per slide → carousel container → publish
async function publishCarouselToInstagram(
  token: string,
  igUserId: string,
  slides: Array<{ type: string; title?: string; coverText?: string; headline?: string; body?: string; slideNum?: number; cta?: string }>,
  tone: string,
  businessName: string,
  caption: string
) {
  const childIds: string[] = []

  for (const slide of slides) {
    const params = new URLSearchParams({
      type: slide.type,
      tone,
      business: businessName.slice(0, 40),
      title: (slide.title || '').slice(0, 100),
      coverText: (slide.coverText || '').slice(0, 150),
      headline: (slide.headline || '').slice(0, 80),
      body: (slide.body || '').slice(0, 220),
      slideNum: String(slide.slideNum || 1),
      total: String(slides.length),
      cta: (slide.cta || '').slice(0, 60),
    })
    const imageUrl = `${BASE_URL}/api/creative/carousel/slide?${params}`

    const res = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, is_carousel_item: true, access_token: token }),
    })
    const data = await res.json() as { id?: string; error?: { message: string } }
    if (!data.id) throw new Error(`Carousel item error (${slide.type}): ${data.error?.message || 'Unknown'}`)
    childIds.push(data.id)
  }

  // Create carousel container
  const carouselRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: token,
    }),
  })
  const carousel = await carouselRes.json() as { id?: string; error?: { message: string } }
  if (!carousel.id) throw new Error(`Carousel container error: ${carousel.error?.message || 'Unknown'}`)

  // Publish
  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: token }),
  })
  const published = await publishRes.json() as { id?: string; error?: { message: string } }
  if (!published.id) throw new Error(`Carousel publish error: ${published.error?.message || 'Unknown'}`)

  return { postId: published.id, postUrl: `https://www.instagram.com/p/${published.id}/` }
}

// ─── LinkedIn UGC API ──────────────────────────────────────────────────────

async function publishToLinkedIn(token: string, personUrn: string, text: string) {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: personUrn.startsWith('urn:') ? personUrn : `urn:li:person:${personUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LinkedIn error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as { id?: string }
  return { postId: data.id || '', postUrl: 'https://www.linkedin.com/feed/' }
}

// ─── Facebook Pages API ────────────────────────────────────────────────────

async function publishToFacebook(token: string, pageId: string, imageUrl: string, message: string) {
  if (imageUrl) {
    // Photo post
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl, message, access_token: token }),
    })
    const data = await res.json() as { id?: string; post_id?: string; error?: { message: string } }
    if (!data.id && !data.post_id) throw new Error(`Facebook photo error: ${data.error?.message || 'Unknown'}`)
    const pid = data.post_id || data.id || ''
    return { postId: pid, postUrl: `https://www.facebook.com/${pid}` }
  }

  // Text post fallback
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token }),
  })
  const data = await res.json() as { id?: string; error?: { message: string } }
  if (!data.id) throw new Error(`Facebook feed error: ${data.error?.message || 'Unknown'}`)
  return { postId: data.id, postUrl: `https://www.facebook.com/${data.id}` }
}

// ─── Twitter/X v2 API ─────────────────────────────────────────────────────

async function publishToTwitter(token: string, text: string) {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Twitter error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as { data?: { id: string } }
  const tweetId = data.data?.id || ''
  return { postId: tweetId, postUrl: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : 'https://twitter.com' }
}

// ─── POST /api/publish ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, artifactId, platform } = await req.json()
    if (!workspaceId || !artifactId || !platform) {
      return NextResponse.json({ error: 'Missing workspaceId, artifactId, or platform' }, { status: 400 })
    }

    const intResult = await sql`
      SELECT access_token, account_id, platform FROM integrations
      WHERE workspace_id = ${workspaceId} AND platform = ${platform} AND status = 'active'
      LIMIT 1
    `
    const integration = intResult.rows[0] as unknown as Integration
    if (!integration) {
      return NextResponse.json({ error: `No active ${platform} integration. Connect it in Integrations.` }, { status: 400 })
    }

    const artResult = await sql`SELECT * FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
    const artifact = artResult.rows[0]
    if (!artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })

    const content = artifact.content_json as Record<string, unknown>
    const type: string = String(artifact.type)
    const caption = buildCaptionText(content, type)
    let postId = '', postUrl = ''

    if (platform === 'instagram') {
      const supported = ['visual_carousel', 'visual_post', 'visual_story', 'visual_ad', 'youtube_thumbnail']
      if (!supported.includes(type)) {
        return NextResponse.json({ error: `Artifact type "${type}" not supported for Instagram.` }, { status: 400 })
      }

      if (type === 'visual_carousel') {
        const slides = content.slides as Array<{ type: string; title?: string; coverText?: string; headline?: string; body?: string; slideNum?: number; cta?: string }> | undefined
        if (!slides?.length) {
          return NextResponse.json({ error: 'Carousel has no slides' }, { status: 400 })
        }
        const result = await publishCarouselToInstagram(
          integration.access_token,
          integration.account_id,
          slides,
          (content.tone as string) || 'professional',
          (content.businessName as string) || '',
          caption
        )
        postId = result.postId
        postUrl = result.postUrl
      } else {
        const imageUrl = buildImageUrl(content, type)
        const result = await publishToInstagram(integration.access_token, integration.account_id, imageUrl, caption)
        postId = result.postId
        postUrl = result.postUrl
      }

    } else if (platform === 'linkedin') {
      const supported = ['linkedInPost', 'visual_post', 'visual_carousel', 'visual_ad']
      if (!supported.includes(type)) {
        return NextResponse.json({ error: `Artifact type "${type}" not supported for LinkedIn.` }, { status: 400 })
      }
      const result = await publishToLinkedIn(integration.access_token, integration.account_id, caption)
      postId = result.postId
      postUrl = result.postUrl

    } else if (platform === 'facebook') {
      const supported = ['visual_post', 'visual_carousel', 'visual_ad', 'visual_story', 'linkedInPost']
      if (!supported.includes(type)) {
        return NextResponse.json({ error: `Artifact type "${type}" not supported for Facebook.` }, { status: 400 })
      }
      const imageUrl = type !== 'linkedInPost' ? buildImageUrl(content, type) : ''
      const result = await publishToFacebook(integration.access_token, integration.account_id, imageUrl, caption)
      postId = result.postId
      postUrl = result.postUrl

    } else if (platform === 'twitter') {
      const result = await publishToTwitter(integration.access_token, caption)
      postId = result.postId
      postUrl = result.postUrl

    } else {
      return NextResponse.json({ error: `Platform "${platform}" not supported.` }, { status: 400 })
    }

    const logId = newId()
    await sql`INSERT INTO publish_log (id, workspace_id, artifact_id, platform, post_id, post_url, status)
              VALUES (${logId}, ${workspaceId}, ${artifactId}, ${platform}, ${postId}, ${postUrl}, 'published')`

    return NextResponse.json({ ok: true, postId, postUrl, platform })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT pl.*, a.title as artifact_title, a.type as artifact_type
    FROM publish_log pl
    LEFT JOIN artifacts a ON a.id = pl.artifact_id
    WHERE pl.workspace_id = ${workspaceId}
    ORDER BY pl.published_at DESC LIMIT 20
  `
  return NextResponse.json(result.rows)
}
