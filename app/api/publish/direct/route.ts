/**
 * POST /api/publish/direct
 * Directly publishes content to Twitter/X and LinkedIn using OAuth tokens
 * stored in the integrations table — no Buffer dependency.
 *
 * Body: {
 *   workspaceId: string
 *   platforms: Array<'twitter' | 'linkedin' | 'instagram' | 'facebook'>
 *   content: string                   // base content (may be platform-adapted already)
 *   adaptedContent?: Record<string, string>  // per-platform overrides
 *   mediaUrls?: string[]              // optional images
 *   artifactId?: string
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { publishTweet } from '@/lib/twitter-oauth'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { assertArtifactApproved } from '@/lib/guards'

interface DirectPublishBody {
  workspaceId: string
  platforms: string[]
  content: string
  adaptedContent?: Record<string, string>
  mediaUrls?: string[]
  artifactId?: string
}

interface PlatformResult {
  platform: string
  ok: boolean
  postId?: string
  postUrl?: string
  error?: string
}

// ── Twitter/X v2 ─────────────────────────────────────────────────────────────
// Supports both OAuth 1.0a (if metadata contains consumer_key/secret + access_token_secret)
// and OAuth 2.0 User Access Token (Bearer, PKCE flow).
// Note: App-only Bearer tokens are READ-ONLY and cannot create tweets.
async function publishToTwitter(
  text: string,
  accessToken: string,
  metadata?: Record<string, unknown> | null,
): Promise<PlatformResult> {
  try {
    const { tweetId, url } = await publishTweet(text, accessToken, metadata)
    return {
      platform: 'twitter',
      ok: true,
      postId: tweetId,
      postUrl: url,
    }
  } catch (e) {
    return { platform: 'twitter', ok: false, error: String(e) }
  }
}

// ── LinkedIn UGC Posts v2 ─────────────────────────────────────────────────────
async function publishToLinkedIn(text: string, accessToken: string, personUrn: string): Promise<PlatformResult> {
  try {
    const authorUrn = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`
    const res = await fetchWithTimeout('https://api.linkedin.com/v2/ugcPosts', {
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
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return { platform: 'linkedin', ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }
    const postId = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || undefined
    return {
      platform: 'linkedin',
      ok: true,
      postId,
      postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}/` : 'https://www.linkedin.com/feed/',
    }
  } catch (e) {
    return { platform: 'linkedin', ok: false, error: String(e) }
  }
}

// ── Facebook Graph API ────────────────────────────────────────────────────────
async function publishToFacebook(text: string, accessToken: string, pageId: string): Promise<PlatformResult> {
  try {
    const res = await fetchWithTimeout(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      timeoutMs: 10000,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: accessToken }),
    })
    const data = await res.json() as { id?: string; error?: { message?: string } }
    if (!res.ok || data.error) {
      return { platform: 'facebook', ok: false, error: data.error?.message || `HTTP ${res.status}` }
    }
    return {
      platform: 'facebook',
      ok: true,
      postId: data.id,
      postUrl: data.id ? `https://www.facebook.com/${data.id}` : undefined,
    }
  } catch (e) {
    return { platform: 'facebook', ok: false, error: String(e) }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as DirectPublishBody
    const { workspaceId, platforms, content, adaptedContent = {}, artifactId } = body

    if (!workspaceId || !platforms?.length || !content) {
      return NextResponse.json({ error: 'workspaceId, platforms, and content required' }, { status: 400 })
    }

    // ─── Human governance gate (defense in depth) ─────────────────────────
    // When this route is called with an artifactId (the normal flow from
    // ReviewRequiredModal), verify that artifact's approval has been
    // committed before any external API write fires. Ad-hoc raw-content
    // publishes (no artifactId) trust the caller. See ARCHITECTURE_SAFETY.md.
    const gate = await assertArtifactApproved(workspaceId, artifactId)
    if (gate) return gate

    // Load all integrations for this workspace
    const integResult = await sql`
      SELECT platform, access_token, account_id, metadata FROM integrations
      WHERE workspace_id = ${workspaceId} AND status = 'active'
    `
    const integrations: Record<string, { access_token?: string; account_id?: string; metadata?: unknown }> = {}
    for (const row of integResult.rows) {
      integrations[String(row.platform)] = {
        access_token: row.access_token ? String(row.access_token) : undefined,
        account_id: row.account_id ? String(row.account_id) : undefined,
        metadata: row.metadata,
      }
    }

    const results: PlatformResult[] = []
    const now = new Date().toISOString()

    for (const platform of platforms) {
      const text = adaptedContent[platform] || content
      const integ = integrations[platform]

      if (!integ?.access_token) {
        results.push({ platform, ok: false, error: `${platform} not connected — add OAuth token in Connections` })
        continue
      }

      let result: PlatformResult

      if (platform === 'twitter') {
        const twitterMeta = integ.metadata && typeof integ.metadata === 'object'
          ? integ.metadata as Record<string, unknown>
          : integ.metadata
            ? (() => { try { return JSON.parse(String(integ.metadata)) as Record<string, unknown> } catch { return null } })()
            : null
        result = await publishToTwitter(text, integ.access_token, twitterMeta)
      } else if (platform === 'linkedin') {
        if (!integ.account_id) {
          result = { platform, ok: false, error: 'LinkedIn Person URN not set in account_id field' }
        } else {
          result = await publishToLinkedIn(text, integ.access_token, integ.account_id)
        }
      } else if (platform === 'facebook') {
        if (!integ.account_id) {
          result = { platform, ok: false, error: 'Facebook Page ID not set in account_id field' }
        } else {
          result = await publishToFacebook(text, integ.access_token, integ.account_id)
        }
      } else {
        result = { platform, ok: false, error: `Direct publish not yet supported for ${platform} — use Buffer scheduling` }
      }

      results.push(result)

      // Record successful publishes
      if (result.ok) {
        const pubId = newId()
        await sql`
          INSERT INTO published_content (id, workspace_id, artifact_id, platform, post_id, post_url, title, published_at)
          VALUES (${pubId}, ${workspaceId}, ${artifactId || null}, ${platform}, ${result.postId || null}, ${result.postUrl || null}, ${text.slice(0, 200)}, ${now})
        `.catch(() => { /* non-fatal */ })
      }
    }

    const allOk = results.every(r => r.ok)
    const someOk = results.some(r => r.ok)

    return NextResponse.json({
      ok: someOk,
      results,
      published: results.filter(r => r.ok).map(r => r.platform),
      failed: results.filter(r => !r.ok).map(r => ({ platform: r.platform, error: r.error })),
      message: allOk
        ? `Published to ${results.map(r => r.platform).join(', ')}`
        : someOk
        ? `Partial success: ${results.filter(r => r.ok).map(r => r.platform).join(', ')} published`
        : 'All platforms failed',
    })
  } catch (error) {
    console.error('Direct publish error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET — return recent published_content
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])

  const result = await sql`
    SELECT * FROM published_content
    WHERE workspace_id = ${workspaceId}
    ORDER BY published_at DESC LIMIT 50
  `.catch(() => ({ rows: [] }))

  return NextResponse.json(result.rows)
}
