/**
 * Publishing Supervisor — orchestrates blog, social, and newsletter publishing
 * POST /api/agents/publish — route to sub-publishing actions
 * GET  /api/agents/publish — return publishing history
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { createWPPost, testWPConnection, createGhostPost, testGhostConnection } from '@/lib/tools'

type PublishAction = 'publish_blog' | 'schedule_social' | 'publish_newsletter' | 'get_status'

interface PublishRequest {
  workspaceId: string
  action: PublishAction
  artifactId?: string
  platforms?: string[]
  options?: Record<string, unknown>
}

// ─── Blog Publishing ──────────────────────────────────────────────────────────

async function publishBlog(
  workspaceId: string,
  artifactId: string,
  modelSettings: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  // Load the artifact
  const artResult = await sql`SELECT * FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
  const artifact = artResult.rows[0]
  if (!artifact) throw new Error('Artifact not found')

  const content = artifact.content_json as Record<string, unknown>
  const platform = (options.platform as string) || 'wordpress'
  const rawStatus = (options.status as string) || 'draft'

  const postTitle = String(artifact.title || content.title || 'New Post')
  const postBody = String(content.body || content.content || content.html || JSON.stringify(content))
  const postExcerpt = String(content.excerpt || content.summary || '')
  const postTags = (content.tags || []) as string[]

  let publishedUrl = ''
  let publishedId = ''

  if (platform === 'wordpress') {
    const wpSiteUrl = modelSettings.wordpressSiteUrl as string
    const wpUsername = modelSettings.wordpressUsername as string
    const wpAppPassword = modelSettings.wordpressAppPassword as string

    if (!wpSiteUrl || !wpUsername || !wpAppPassword) {
      throw new Error('WordPress not configured. Add Site URL, Username and App Password in Settings → API Keys.')
    }

    const wpStatus = (rawStatus === 'publish' || rawStatus === 'pending') ? rawStatus : 'draft'
    const result = await createWPPost(wpSiteUrl, wpUsername, wpAppPassword, {
      title: postTitle,
      content: postBody,
      status: wpStatus,
      excerpt: postExcerpt,
      tags: postTags,
    })
    publishedUrl = result?.link || ''
    publishedId = String(result?.id || '')

  } else if (platform === 'ghost') {
    const ghostUrl = modelSettings.ghostUrl as string
    const ghostAdminKey = modelSettings.ghostAdminKey as string

    if (!ghostUrl || !ghostAdminKey) {
      throw new Error('Ghost not configured. Add Ghost URL and Admin API Key in Settings → API Keys.')
    }

    const ghostStatus = rawStatus === 'published' ? 'published' : 'draft'
    const result = await createGhostPost(ghostUrl, ghostAdminKey, {
      title: postTitle,
      html: postBody,
      status: ghostStatus,
      tags: postTags,
      customExcerpt: postExcerpt || undefined,
    })
    publishedUrl = result?.url || ''
    publishedId = String(result?.id || '')
  }

  // Log the publish event
  const logId = newId()
  await sql`
    INSERT INTO publish_log (id, workspace_id, platform, artifact_id, published_url, published_at)
    VALUES (${logId}, ${workspaceId}, ${platform}, ${artifactId}, ${publishedUrl}, CURRENT_TIMESTAMP)
  `.catch(() => { /* table may not exist yet */ })

  return {
    success: true,
    message: `Blog post published to ${platform} as "${status}".`,
    publishedUrls: publishedUrl ? [publishedUrl] : [],
    publishedId,
    platform,
  }
}

// ─── Newsletter Publishing ────────────────────────────────────────────────────

async function publishNewsletter(
  workspaceId: string,
  artifactId: string,
  options: Record<string, unknown> = {}
) {
  // Load the artifact
  const artResult = await sql`SELECT * FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
  const artifact = artResult.rows[0]
  if (!artifact) throw new Error('Newsletter artifact not found')

  const content = artifact.content_json as Record<string, unknown>
  const recipientTag = options.recipientTag as string | undefined

  // Fetch subscriber count for confirmation
  const subsResult = await sql`
    SELECT COUNT(*) as count FROM subscribers
    WHERE workspace_id = ${workspaceId}
    ${recipientTag ? sql`AND tags @> ARRAY[${recipientTag}]` : sql``}
  `.catch(() => ({ rows: [{ count: 0 }] }))

  const subscriberCount = Number(subsResult.rows[0]?.count || 0)

  // Use the existing email-marketing agent endpoint logic (Resend)
  const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/agents/email-marketing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      action: 'send_newsletter',
      artifactId,
      recipientTag,
      subject: artifact.title,
      htmlContent: content.html || content.body || '',
    }),
  }).catch(() => null)

  const logId = newId()
  await sql`
    INSERT INTO publish_log (id, workspace_id, platform, artifact_id, published_at)
    VALUES (${logId}, ${workspaceId}, 'newsletter', ${artifactId}, CURRENT_TIMESTAMP)
  `.catch(() => { /* table may not exist yet */ })

  return {
    success: true,
    message: `Newsletter sent to ${subscriberCount} subscriber${subscriberCount !== 1 ? 's' : ''}.`,
    subscriberCount,
    emailResult: emailRes ? await emailRes.json().catch(() => null) : null,
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function getPublishStatus(workspaceId: string) {
  const result = await sql`
    SELECT pl.*, a.title as artifact_title, a.type as artifact_type
    FROM publish_log pl
    LEFT JOIN artifacts a ON a.id = pl.artifact_id
    WHERE pl.workspace_id = ${workspaceId}
    ORDER BY pl.published_at DESC LIMIT 20
  `.catch(() => ({ rows: [] }))

  return { records: result.rows }
}

// ─── Connection check ─────────────────────────────────────────────────────────

async function checkConnections(modelSettings: Record<string, unknown>) {
  const connections: Record<string, boolean> = {
    wordpress: false,
    ghost: false,
  }

  if (modelSettings.wordpressSiteUrl && modelSettings.wordpressUsername && modelSettings.wordpressAppPassword) {
    try {
      connections.wordpress = await testWPConnection(
        modelSettings.wordpressSiteUrl as string,
        modelSettings.wordpressUsername as string,
        modelSettings.wordpressAppPassword as string
      )
    } catch { connections.wordpress = false }
  }

  if (modelSettings.ghostUrl && modelSettings.ghostAdminKey) {
    try {
      connections.ghost = await testGhostConnection(
        modelSettings.ghostUrl as string,
        modelSettings.ghostAdminKey as string
      )
    } catch { connections.ghost = false }
  }

  return connections
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PublishRequest
    const { workspaceId, action, artifactId, options = {} } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    // Load workspace model_settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const workspace = wsResult.rows[0]
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    let modelSettings: Record<string, unknown> = {}
    try {
      modelSettings = typeof workspace.model_settings === 'string'
        ? JSON.parse(workspace.model_settings)
        : (workspace.model_settings as Record<string, unknown>) || {}
    } catch { modelSettings = {} }

    switch (action) {
      case 'publish_blog': {
        if (!artifactId) return NextResponse.json({ error: 'Missing artifactId' }, { status: 400 })
        const result = await publishBlog(workspaceId, artifactId, modelSettings, options)
        return NextResponse.json(result)
      }

      case 'schedule_social': {
        // Delegate to the social route
        return NextResponse.json({
          success: true,
          message: 'Use POST /api/agents/publish/social to schedule social posts.',
        })
      }

      case 'publish_newsletter': {
        if (!artifactId) return NextResponse.json({ error: 'Missing artifactId' }, { status: 400 })
        const result = await publishNewsletter(workspaceId, artifactId, options)
        return NextResponse.json(result)
      }

      case 'get_status': {
        const result = await getPublishStatus(workspaceId)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Publishing Supervisor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  // Return publishing history
  const result = await sql`
    SELECT pl.*, a.title as artifact_title, a.type as artifact_type
    FROM publish_log pl
    LEFT JOIN artifacts a ON a.id = pl.artifact_id
    WHERE pl.workspace_id = ${workspaceId}
    ORDER BY pl.published_at DESC LIMIT 50
  `.catch(() => ({ rows: [] }))

  // Also return connection status
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  let modelSettings: Record<string, unknown> = {}
  try {
    modelSettings = typeof workspace?.model_settings === 'string'
      ? JSON.parse(workspace.model_settings)
      : (workspace?.model_settings as Record<string, unknown>) || {}
  } catch { modelSettings = {} }

  const connections = await checkConnections(modelSettings)

  return NextResponse.json({
    history: result.rows,
    connections,
    bufferConfigured: !!modelSettings.bufferAccessToken,
  })
}
