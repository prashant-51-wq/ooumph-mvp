/**
 * /api/inbox — Unified Inbox conversations
 * GET  ?workspaceId= [&channel=email|sms] [&status=open|closed] [&search=]
 * POST { workspaceId, contactEmail, contactName, contactPhone, channel, subject, firstMessage }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const channel = searchParams.get('channel')
  const status = searchParams.get('status') || 'open'
  const search = searchParams.get('search') || ''

  if (!workspaceId) return NextResponse.json([])
  // Sprint 7E: session must own this workspace. Inbox conversations
  // contain customer contact details + message bodies that would leak.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let convos
  if (search) {
    convos = await sql`
      SELECT c.*,
        (SELECT body FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_body,
        (SELECT direction FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_dir
      FROM inbox_conversations c
      WHERE c.workspace_id = ${workspaceId}
        AND (LOWER(c.contact_name) LIKE LOWER(${'%' + search + '%'}) OR LOWER(c.contact_email) LIKE LOWER(${'%' + search + '%'}) OR LOWER(c.subject) LIKE LOWER(${'%' + search + '%'}))
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT 50
    `
  } else if (channel && channel !== 'all') {
    convos = await sql`
      SELECT c.*,
        (SELECT body FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_body,
        (SELECT direction FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_dir
      FROM inbox_conversations c
      WHERE c.workspace_id = ${workspaceId} AND c.channel = ${channel} AND c.status = ${status}
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT 50
    `
  } else {
    convos = await sql`
      SELECT c.*,
        (SELECT body FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_body,
        (SELECT direction FROM inbox_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_dir
      FROM inbox_conversations c
      WHERE c.workspace_id = ${workspaceId} AND c.status = ${status}
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT 50
    `
  }

  return NextResponse.json(convos.rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      contactEmail?: string
      contactName?: string
      contactPhone?: string
      channel?: string
      subject?: string
      firstMessage?: string
      direction?: string
    }
    const {
      workspaceId, contactEmail, contactName, contactPhone,
      channel = 'email', subject, firstMessage, direction = 'outbound',
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    // Sprint 7E: session must own this workspace.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Try to find existing contact in CRM
    let contactId: string | null = null
    if (contactEmail) {
      const crmResult = await sql`SELECT id FROM leads_captured WHERE workspace_id = ${workspaceId} AND email = ${contactEmail} LIMIT 1`
      if (crmResult.rows[0]) contactId = String(crmResult.rows[0].id)
    }

    // Check if conversation already exists with this contact (same channel)
    if (contactEmail) {
      const existing = await sql`
        SELECT id FROM inbox_conversations
        WHERE workspace_id = ${workspaceId} AND contact_email = ${contactEmail} AND channel = ${channel} AND status != 'closed'
        LIMIT 1
      `
      if (existing.rows[0]) {
        return NextResponse.json({ ok: true, id: existing.rows[0].id, existing: true })
      }
    }

    const id = newId()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, contact_phone, channel, subject, status, tags, last_message_at, unread_count, created_at)
      VALUES (${id}, ${workspaceId}, ${contactId}, ${contactEmail || null}, ${contactName || null}, ${contactPhone || null}, ${channel}, ${subject || null}, 'open', '[]', ${now}, 0, ${now})
    `

    // Insert first message if provided
    if (firstMessage) {
      const msgId = newId()
      await sql`
        INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, from_address, to_address, subject, body, channel, status, sent_at, created_at)
        VALUES (${msgId}, ${id}, ${workspaceId}, ${direction}, ${direction === 'inbound' ? (contactEmail || null) : null}, ${direction === 'outbound' ? (contactEmail || null) : null}, ${subject || null}, ${firstMessage}, ${channel}, 'sent', ${now}, ${now})
      `
      await sql`UPDATE inbox_conversations SET unread_count = ${direction === 'inbound' ? 1 : 0} WHERE id = ${id}`
    }

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, tags, assignedTo, unreadCount } = await req.json() as {
      id: string
      status?: string
      tags?: string[]
      assignedTo?: string
      unreadCount?: number
    }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    // Sprint 7E: resolve the conversation's workspace and assert ownership.
    const wsRes = await sql`SELECT workspace_id FROM inbox_conversations WHERE id = ${id} LIMIT 1`
    const wsRow = wsRes.rows[0] as { workspace_id?: string } | undefined
    if (!wsRow?.workspace_id) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, wsRow.workspace_id)
    if (denied) return denied

    await sql`
      UPDATE inbox_conversations
      SET status = COALESCE(${status || null}, status),
          tags = COALESCE(${tags ? JSON.stringify(tags) : null}, tags),
          assigned_to = COALESCE(${assignedTo || null}, assigned_to),
          unread_count = COALESCE(${unreadCount ?? null}, unread_count)
      WHERE id = ${id} AND workspace_id = ${wsRow.workspace_id}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
