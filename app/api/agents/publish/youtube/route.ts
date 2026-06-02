/**
 * YouTube Publishing Worker — Publishing Supervisor
 * POST /api/agents/publish/youtube — channel info, search, upload instructions, metadata optimization
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getChannelInfo, searchVideos, getUploadInstructions, isYouTubeAvailable } from '@/lib/tools/youtube'
import { withCredentials } from '@/lib/credential-context'
import { assertWorkspaceOwnership } from '@/lib/guards'
import Anthropic from '@anthropic-ai/sdk'

interface YouTubeRequest {
  workspaceId: string
  action: 'channel' | 'search' | 'upload_info' | 'optimize'
  query?: string
  videoTitle?: string
  description?: string
  tags?: string[]
  accessToken?: string
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

function getAnthropicClient(settings: Record<string, unknown>): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as YouTubeRequest
    const { workspaceId, action, query, videoTitle, description, tags, accessToken } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const effectiveAccessToken = accessToken || (settings.youtubeAccessToken as string | undefined)

    // ── Channel Info ─────────────────────────────────────────────────────────
    if (action === 'channel') {
      if (!effectiveAccessToken) {
        return NextResponse.json({
          ok: false,
          error: 'YouTube access token not configured. Add it in Settings → Social Publishing.',
          requiresSetup: true,
        })
      }
      const channel = await getChannelInfo(effectiveAccessToken)
      return NextResponse.json({ ok: true, channel })
    }

    // ── Search ───────────────────────────────────────────────────────────────
    if (action === 'search') {
      if (!query) return NextResponse.json({ error: 'Missing query for search' }, { status: 400 })

      return await withCredentials(
        { YOUTUBE_API_KEY: settings.youtubeApiKey as string | undefined },
        async () => {
          if (!isYouTubeAvailable()) {
            return NextResponse.json({
              ok: false,
              error: 'YouTube API key not configured. Add it in Settings → Social Publishing.',
              requiresSetup: true,
            })
          }
          const videos = await searchVideos(query, 10)
          return NextResponse.json({ ok: true, videos })
        }
      )
    }

    // ── Upload Info ──────────────────────────────────────────────────────────
    if (action === 'upload_info') {
      const instructions = getUploadInstructions()

      let suggestions: Record<string, unknown> | null = null

      if (videoTitle) {
        try {
          const client = getAnthropicClient(settings)
          const model = (settings.defaultModel as string) || 'claude-sonnet-4-6'
          const response = await client.messages.create({
            model,
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: `You are a YouTube SEO expert. For a video titled "${videoTitle}"${description ? ` with this description: "${description.slice(0, 200)}"` : ''}, generate:
1. An optimized description (max 500 chars, end with a CTA like "Subscribe for more!")
2. Exactly 10 relevant keyword tags (comma-separated)
3. A thumbnail concept (one vivid sentence describing what the thumbnail should look like)

Respond in JSON: {"description": "...", "tags": ["tag1","tag2",...], "thumbnailConcept": "..."}`,
            }],
          })
          const text = response.content[0].type === 'text' ? response.content[0].text : ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) suggestions = JSON.parse(match[0])
        } catch { /* AI suggestions optional */ }
      }

      return NextResponse.json({ ok: true, instructions, suggestions })
    }

    // ── Optimize Metadata ────────────────────────────────────────────────────
    if (action === 'optimize') {
      if (!videoTitle) return NextResponse.json({ error: 'Missing videoTitle for optimize' }, { status: 400 })

      try {
        const client = getAnthropicClient(settings)
        const model = (settings.defaultModel as string) || 'claude-sonnet-4-6'
        const response = await client.messages.create({
          model,
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: `You are a YouTube SEO expert. Optimize the following YouTube video metadata for maximum discoverability.

Title: "${videoTitle}"
${description ? `Description: "${description.slice(0, 300)}"` : ''}
${tags && tags.length > 0 ? `Existing tags: ${tags.join(', ')}` : ''}

Generate:
1. An SEO-optimized title (max 70 characters, include main keyword near the start)
2. A full description (include timestamps placeholder like "[00:00] Intro", call-to-actions, relevant links placeholder, and keyword-rich paragraphs — aim for 800-1000 chars)
3. Exactly 15 keyword tags (mix of short and long-tail)
4. Three thumbnail ideas (each a vivid one-sentence description)

Respond in JSON:
{
  "optimizedTitle": "...",
  "optimizedDescription": "...",
  "tags": ["tag1", ...15 total],
  "thumbnailIdeas": ["idea1", "idea2", "idea3"]
}`,
          }],
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : ''
        const match = text.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('No JSON in response')
        const result = JSON.parse(match[0])

        return NextResponse.json({
          ok: true,
          optimizedTitle: result.optimizedTitle,
          optimizedDescription: result.optimizedDescription,
          tags: result.tags,
          thumbnailIdeas: result.thumbnailIdeas,
        })
      } catch (e) {
        return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('YouTube route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
