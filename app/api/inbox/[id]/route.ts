/**
 * /api/inbox/[id] — Single conversation thread
 * GET  — returns conversation + all messages
 * PATCH — update status, tags, mark read
 *
 * Sprint 7E — added workspace ownership checks. Without these any
 * authenticated user who guessed a conversation id could read another
 * tenant's customer messages or change their workflow state.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

async function workspaceFor(id: string): Promise<string | null> {
  const r = await sql`SELECT workspace_id FROM inbox_conversations WHERE id = ${id} LIMIT 1`
  return (r.rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const wsId = await workspaceFor(id)
  if (!wsId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const denied = assertWorkspaceOwnership(req, wsId)
  if (denied) return denied

  const [convResult, msgResult] = await Promise.all([
    sql`SELECT * FROM inbox_conversations WHERE id = ${id} LIMIT 1`,
    sql`SELECT * FROM inbox_messages WHERE conversation_id = ${id} ORDER BY sent_at ASC`,
  ])

  // Mark as read
  await sql`UPDATE inbox_conversations SET unread_count = 0 WHERE id = ${id}`

  return NextResponse.json({
    conversation: convResult.rows[0],
    messages: msgResult.rows,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const wsId = await workspaceFor(id)
    if (!wsId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, wsId)
    if (denied) return denied

    const body = await req.json() as { status?: string; tags?: string[]; assignedTo?: string }
    const { status, tags, assignedTo } = body

    if (status) await sql`UPDATE inbox_conversations SET status = ${status} WHERE id = ${id} AND workspace_id = ${wsId}`
    if (tags) await sql`UPDATE inbox_conversations SET tags = ${JSON.stringify(tags)} WHERE id = ${id} AND workspace_id = ${wsId}`
    if (assignedTo !== undefined) await sql`UPDATE inbox_conversations SET assigned_to = ${assignedTo} WHERE id = ${id} AND workspace_id = ${wsId}`

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
