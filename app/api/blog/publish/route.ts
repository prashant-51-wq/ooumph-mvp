/**
 * /api/blog/publish — direct draft → CMS publish
 *
 * The dashboard Blog Drafts page stores drafts in localStorage only (no
 * artifacts table backing yet — see app/dashboard/blog/page.tsx for the
 * full rationale). To enable real publishing today without first moving
 * drafts into the artifacts table, this endpoint accepts the raw title +
 * markdown body and pushes it to the configured CMS (WordPress or Ghost)
 * using credentials stored on the workspace's model_settings.
 *
 * POST body:
 *   {
 *     workspaceId: string
 *     platform: 'wordpress' | 'ghost'
 *     title: string
 *     body: string         // markdown
 *     status: 'draft' | 'publish'   // wp 'publish' === ghost 'published'
 *     excerpt?: string
 *     tags?: string[]
 *   }
 *
 * Why no HITL approval gate here:
 *   /api/agents/publish (the artifact-bound path) enforces
 *   assertArtifactApproved for `publish_blog`. That gate exists because
 *   ai-generated artifacts must be human-reviewed before going live.
 *   The Blog Drafts page is a hand-authored composer — the user IS the
 *   author + reviewer, so the HITL gate would be theatre. We still
 *   enforce workspace ownership and require status='draft' or 'publish'
 *   to be passed explicitly so an accidental click doesn't auto-publish.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { createWPPost, createGhostPost } from '@/lib/tools'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

// Re-used from app/dashboard/blog/page.tsx — kept compact server-side.
// We accept markdown from the client and convert to HTML here so the
// posted HTML doesn't depend on a vulnerable client-side renderer.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
function inlineFormat(s: string): string {
  let r = escapeHtml(s)
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => `<a href="${escapeAttr(u)}">${t}</a>`)
  return r
}
function mdToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('')
      continue
    }
    const h = /^(#{1,6})\s+(.*)/.exec(line)
    if (h) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h${h[1].length}>${escapeHtml(h[2])}</h${h[1].length}>`)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inlineFormat(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p>${inlineFormat(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  let body: {
    workspaceId?: string
    platform?: 'wordpress' | 'ghost'
    title?: string
    body?: string
    status?: 'draft' | 'publish'
    excerpt?: string
    tags?: string[]
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { workspaceId, platform, title, body: bodyMd, status, excerpt, tags } = body
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  if (!platform || (platform !== 'wordpress' && platform !== 'ghost')) {
    return NextResponse.json({ error: 'platform must be "wordpress" or "ghost"' }, { status: 400 })
  }
  if (!title?.trim() || !bodyMd?.trim()) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
  }
  if (status !== 'draft' && status !== 'publish') {
    return NextResponse.json({ error: 'status must be "draft" or "publish"' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Load workspace model_settings for CMS credentials
  const wsRes = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsRes.rows[0]
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  let ms: Record<string, unknown> = {}
  try {
    ms = typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings)
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch { ms = {} }

  const html = mdToHtml(bodyMd)

  let postUrl = ''
  let postId = ''

  if (platform === 'wordpress') {
    // Resolve credentials: workspace settings first, then env fallback.
    const siteUrl = (ms.wordpressSiteUrl as string) || process.env.WP_SITE_URL || ''
    const username = (ms.wordpressUsername as string) || process.env.WP_USERNAME || ''
    const appPassword = (ms.wordpressAppPassword as string) || process.env.WP_APP_PASSWORD || ''
    if (!siteUrl || !username || !appPassword) {
      return NextResponse.json({
        error: 'WordPress not configured. Add WP Site URL, Username, and Application Password in Settings → API Keys, or set WP_SITE_URL / WP_USERNAME / WP_APP_PASSWORD in your environment.',
      }, { status: 400 })
    }
    const result = await createWPPost(siteUrl, username, appPassword, {
      title: title.trim(),
      content: html,
      status,
      excerpt: excerpt?.trim(),
      tags: tags?.filter(Boolean),
    })
    if (!result) {
      return NextResponse.json({ error: 'WordPress rejected the post. Check that your Application Password has post-create scope and the site URL is correct.' }, { status: 502 })
    }
    postUrl = result.link
    postId = String(result.id)

  } else {
    // Ghost
    const ghostUrl = (ms.ghostUrl as string) || process.env.GHOST_URL || ''
    const adminKey = (ms.ghostAdminKey as string) || process.env.GHOST_ADMIN_API_KEY || ''
    if (!ghostUrl || !adminKey) {
      return NextResponse.json({
        error: 'Ghost not configured. Add Ghost URL and Admin API Key in Settings → API Keys, or set GHOST_URL / GHOST_ADMIN_API_KEY in your environment.',
      }, { status: 400 })
    }
    const ghostStatus = status === 'publish' ? 'published' : 'draft'
    const result = await createGhostPost(ghostUrl, adminKey, {
      title: title.trim(),
      html,
      status: ghostStatus,
      tags: tags?.filter(Boolean),
      customExcerpt: excerpt?.trim() || undefined,
    })
    if (!result) {
      return NextResponse.json({ error: 'Ghost rejected the post. Verify the Admin API Key (id:secret format) and Ghost URL.' }, { status: 502 })
    }
    postUrl = result.url
    postId = result.id
  }

  // Log to publish_log so the publishing history surface picks it up.
  const logId = newId()
  await sql`
    INSERT INTO publish_log (id, workspace_id, platform, post_url, published_at)
    VALUES (${logId}, ${workspaceId}, ${platform}, ${postUrl}, CURRENT_TIMESTAMP)
  `.catch(() => { /* table may not exist in dev */ })

  return NextResponse.json({
    ok: true,
    platform,
    status,
    postId,
    postUrl,
    message: `Posted to ${platform} as ${status === 'publish' ? 'published' : 'draft'}.`,
  })
}
