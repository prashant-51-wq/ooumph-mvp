/**
 * LinkedIn Publishing Worker — Publishing Supervisor
 * POST /api/agents/publish/linkedin — post text posts or articles to LinkedIn
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { createTextPost, createArticlePost, getProfile, isLinkedInAvailable } from '@/lib/tools/linkedin'

interface LinkedInRequest {
  workspaceId: string
  action: 'post' | 'article' | 'profile'
  text?: string
  title?: string
  url?: string
  accessToken?: string
  authorUrn?: string
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
    const body = await req.json() as LinkedInRequest
    const { workspaceId, action, text, title, url, accessToken, authorUrn } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const effectiveToken = accessToken || (settings.linkedinAccessToken as string | undefined)
    const effectiveAuthorUrn = authorUrn || (settings.linkedinAuthorUrn as string | undefined)

    if (action !== 'profile' && !effectiveToken) {
      return NextResponse.json({
        ok: false,
        error: 'LinkedIn access token not configured. Add it in Settings → Social Publishing.',
        requiresSetup: true,
      })
    }

    // ── Profile ──────────────────────────────────────────────────────────────
    if (action === 'profile') {
      if (!effectiveToken) {
        return NextResponse.json({
          ok: false,
          error: 'LinkedIn access token not configured. Add it in Settings → Social Publishing.',
          requiresSetup: true,
        })
      }
      const profile = await getProfile(effectiveToken as string)
      return NextResponse.json({ ok: true, profile })
    }

    // ── Text Post ────────────────────────────────────────────────────────────
    if (action === 'post') {
      if (!text) return NextResponse.json({ error: 'Missing text for post' }, { status: 400 })

      const post = await createTextPost(text, effectiveToken as string, effectiveAuthorUrn as string)
      const postId = (post as { id?: string } | null)?.id ?? ''

      // Save artifact
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
        VALUES (
          ${artifactId},
          ${workspaceId},
          ${null},
          ${'published_linkedin'},
          ${'LinkedIn Post: ' + text.slice(0, 60)},
          ${JSON.stringify({ text: text.slice(0, 300), postId, platform: 'linkedin' })},
          ${'approved'}
        )
      `.catch(() => { /* ignore */ })

      return NextResponse.json({
        ok: true,
        post,
        postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}/` : null,
      })
    }

    // ── Article ──────────────────────────────────────────────────────────────
    if (action === 'article') {
      if (!title) return NextResponse.json({ error: 'Missing title for article' }, { status: 400 })

      const post = await createArticlePost(
        title,
        text || '',
        url || '',
        effectiveToken as string,
        effectiveAuthorUrn as string,
      )

      return NextResponse.json({ ok: true, post })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('LinkedIn route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
