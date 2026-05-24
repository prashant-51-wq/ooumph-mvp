/**
 * POST /api/schedule — queue a calendar post for scheduled publishing
 * GET  /api/schedule — list queued/published posts for a workspace
 * DELETE /api/schedule?id=... — dequeue a scheduled post
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, platform, content, imageUrl, artifactId, scheduledTime } = await req.json() as {
      workspaceId: string
      platform: string
      content: string
      imageUrl?: string
      artifactId?: string
      scheduledTime: string  // ISO8601
    }

    if (!workspaceId || !platform || !content || !scheduledTime) {
      return NextResponse.json({ error: 'Missing required fields: workspaceId, platform, content, scheduledTime' }, { status: 400 })
    }

    const id = newId()
    await sql`
      INSERT INTO scheduled_posts (id, workspace_id, platform, content_json, artifact_id, scheduled_time, status)
      VALUES (
        ${id}, ${workspaceId}, ${platform},
        ${JSON.stringify({ content, imageUrl })},
        ${artifactId || null},
        ${scheduledTime},
        'queued'
      )
    `

    return NextResponse.json({ id, scheduledTime, platform, status: 'queued' })
  } catch (error) {
    console.error('Schedule error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT id, platform, content_json, scheduled_time, status, error, published_at
    FROM scheduled_posts
    WHERE workspace_id = ${workspaceId}
    ORDER BY scheduled_time ASC
    LIMIT 100
  `
  return NextResponse.json(result.rows)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'Missing id or workspaceId' }, { status: 400 })

  await sql`DELETE FROM scheduled_posts WHERE id = ${id} AND workspace_id = ${workspaceId} AND status = 'queued'`
  return NextResponse.json({ ok: true })
}
