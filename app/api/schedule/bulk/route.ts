/**
 * /api/schedule/bulk
 * POST   — bulk-insert up to 100 scheduled_content rows
 * GET    — list all scheduled content for a workspace ordered by scheduled_for ASC
 * DELETE — cancel selected posts by id array (sets status='cancelled')
 *
 * Body (POST): { workspaceId, posts: [{ platform, content, scheduledFor, mediaUrls?, artifactId? }] }
 * Body (DELETE): { workspaceId, ids: string[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { isSupportedPublishChannel, unsupportedChannelError } from '@/lib/publish-platforms'

interface ScheduledPost {
  platform: string
  content: string
  scheduledFor: string
  mediaUrls?: string[]
  artifactId?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string; posts: ScheduledPost[] }
    const { workspaceId, posts } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: 'posts must be a non-empty array' }, { status: 400 })
    }

    if (posts.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 posts per bulk request' }, { status: 400 })
    }

    // Sprint 20N: gate each post's platform up front. Reject the entire
    // batch if any single row targets an unsupported channel — atomicity
    // is more honest than silently dropping half.
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]
      if (!p.platform || !isSupportedPublishChannel(p.platform)) {
        return NextResponse.json(
          {
            ...unsupportedChannelError(p.platform || ''),
            failedIndex: i,
            hint: `Post #${i} targets "${p.platform}". Switch to a supported channel or split the batch.`,
          },
          { status: 400 },
        )
      }
    }

    const now = Date.now()
    const ids: string[] = []

    for (const post of posts) {
      if (!post.platform || !post.content || !post.scheduledFor) {
        return NextResponse.json({ error: 'Each post requires platform, content, and scheduledFor' }, { status: 400 })
      }
      const scheduledAt = new Date(post.scheduledFor).getTime()
      if (isNaN(scheduledAt) || scheduledAt <= now) {
        return NextResponse.json(
          { error: `scheduledFor must be a valid future datetime. Got: ${post.scheduledFor}` },
          { status: 400 }
        )
      }
    }

    for (const post of posts) {
      const id = newId()
      ids.push(id)
      await sql`
        INSERT INTO scheduled_content (id, workspace_id, platform, content, media_urls, artifact_id, scheduled_for, status)
        VALUES (
          ${id},
          ${workspaceId},
          ${post.platform},
          ${post.content},
          ${JSON.stringify(post.mediaUrls || [])},
          ${post.artifactId || null},
          ${post.scheduledFor},
          'pending'
        )
      `
    }

    return NextResponse.json({ ok: true, created: ids.length, ids })
  } catch (error) {
    console.error('Bulk schedule POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const result = await sql`
      SELECT id, platform, content, media_urls, artifact_id, scheduled_for, status, error_message, published_at, created_at
      FROM scheduled_content
      WHERE workspace_id = ${workspaceId}
      ORDER BY scheduled_for ASC
      LIMIT 500
    `

    return NextResponse.json({ posts: result.rows, total: result.rows.length })
  } catch (error) {
    console.error('Bulk schedule GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string; ids: string[] }
    const { workspaceId, ids } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 ids per delete request' }, { status: 400 })
    }

    let cancelled = 0
    for (const id of ids) {
      await sql`
        UPDATE scheduled_content
        SET status = 'cancelled'
        WHERE id = ${id} AND workspace_id = ${workspaceId} AND status = 'pending'
      `
      cancelled++
    }

    return NextResponse.json({ ok: true, cancelled })
  } catch (error) {
    console.error('Bulk schedule DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
