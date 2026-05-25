/**
 * /api/inbox/[id] — Single conversation thread
 * GET  — returns conversation + all messages
 * PATCH — update status, tags, mark read
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [convResult, msgResult] = await Promise.all([
    sql`SELECT * FROM inbox_conversations WHERE id = ${id} LIMIT 1`,
    sql`SELECT * FROM inbox_messages WHERE conversation_id = ${id} ORDER BY sent_at ASC`,
  ])

  if (!convResult.rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
    const body = await req.json() as { status?: string; tags?: string[]; assignedTo?: string }
    const { status, tags, assignedTo } = body

    if (status) await sql`UPDATE inbox_conversations SET status = ${status} WHERE id = ${id}`
    if (tags) await sql`UPDATE inbox_conversations SET tags = ${JSON.stringify(tags)} WHERE id = ${id}`
    if (assignedTo !== undefined) await sql`UPDATE inbox_conversations SET assigned_to = ${assignedTo} WHERE id = ${id}`

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
