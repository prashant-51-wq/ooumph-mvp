/**
 * Twitter Publishing Worker — Publishing Supervisor
 * POST /api/agents/publish/twitter — post tweets or threads via Twitter API
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { postTweet, postThread, isTwitterAvailable } from '@/lib/tools/twitter'

interface TwitterRequest {
  workspaceId: string
  action: 'tweet' | 'thread' | 'preview'
  content?: string
  tweets?: string[]
  accessToken?: string
}

/** Split text at sentence boundaries, never exceeding maxLen chars per chunk */
function splitIntoTweets(text: string, maxLen = 280): string[] {
  const chunks: string[] = []
  // Split on sentence endings, keeping the delimiter
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  let current = ''

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    if ((current + ' ' + trimmed).trim().length <= maxLen) {
      current = (current + ' ' + trimmed).trim()
    } else {
      // Current sentence doesn't fit — flush current, start new
      if (current) chunks.push(current)
      // If single sentence itself is too long, hard-split it
      if (trimmed.length > maxLen) {
        let remaining = trimmed
        while (remaining.length > maxLen) {
          // Try to break at last space before limit
          let cutAt = maxLen - 1
          const lastSpace = remaining.lastIndexOf(' ', maxLen - 1)
          if (lastSpace > 0) cutAt = lastSpace
          chunks.push(remaining.slice(0, cutAt).trim())
          remaining = remaining.slice(cutAt).trim()
        }
        current = remaining
      } else {
        current = trimmed
      }
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)]
}

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as TwitterRequest
    const { workspaceId, action, content, tweets, accessToken } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Inject bearer token if present
    if (settings.twitterBearerToken) {
      process.env.TWITTER_BEARER_TOKEN = settings.twitterBearerToken as string
    }

    const effectiveToken = accessToken || (settings.twitterAccessToken as string | undefined)

    // ── Preview ──────────────────────────────────────────────────────────────
    if (action === 'preview') {
      if (!content) return NextResponse.json({ error: 'Missing content for preview' }, { status: 400 })
      const preview = splitIntoTweets(content)
      return NextResponse.json({ ok: true, preview, tweetCount: preview.length })
    }

    // All posting actions require a token
    if (!effectiveToken) {
      return NextResponse.json({
        ok: false,
        error: 'Twitter access token not configured. Add it in Settings → Social Publishing.',
        requiresSetup: true,
      })
    }

    // ── Single Tweet ─────────────────────────────────────────────────────────
    if (action === 'tweet') {
      if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })
      let tweetText = content
      if (tweetText.length > 280) {
        tweetText = tweetText.slice(0, 277) + '...'
      }
      const tweet = await postTweet(tweetText, effectiveToken)
      const tweetId = tweet?.id ?? ''

      // Save artifact
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
        VALUES (
          ${artifactId},
          ${workspaceId},
          ${null},
          ${'published_tweet'},
          ${'Tweet: ' + tweetText.slice(0, 80)},
          ${JSON.stringify({ text: tweetText, tweetId, platform: 'twitter' })},
          ${'approved'}
        )
      `.catch(() => { /* ignore if artifacts table structure differs */ })

      return NextResponse.json({
        ok: true,
        tweet,
        tweetUrl: tweetId ? `https://twitter.com/i/status/${tweetId}` : null,
      })
    }

    // ── Thread ───────────────────────────────────────────────────────────────
    if (action === 'thread') {
      const tweetsArray = tweets && tweets.length > 0
        ? tweets
        : content
          ? splitIntoTweets(content)
          : null

      if (!tweetsArray || tweetsArray.length === 0) {
        return NextResponse.json({ error: 'Missing tweets or content for thread' }, { status: 400 })
      }

      const postedTweets = await postThread(tweetsArray, effectiveToken)
      const firstId = Array.isArray(postedTweets) && postedTweets.length > 0
        ? (postedTweets[0] as { id?: string })?.id ?? ''
        : ''

      return NextResponse.json({
        ok: true,
        tweets: postedTweets,
        threadUrl: firstId ? `https://twitter.com/i/status/${firstId}` : null,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Twitter route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
