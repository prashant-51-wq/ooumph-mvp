/**
 * POST /api/webhooks/email-inbound
 * Receives inbound emails forwarded by Resend's inbound routing.
 * Creates inbox_conversations + inbox_messages records.
 *
 * Configure in Resend Dashboard → Inbound → Add route → this URL
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

interface ResendInboundPayload {
  from?: string
  to?: string | string[]
  subject?: string
  text?: string
  html?: string
  headers?: Record<string, string>
  messageId?: string
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as ResendInboundPayload

    const fromRaw = payload.from || ''
    const emailMatch = fromRaw.match(/<([^>]+)>/)
    const contactEmail = emailMatch ? emailMatch[1] : fromRaw.trim()
    const contactName = emailMatch
      ? fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
      : ''

    const toRaw = Array.isArray(payload.to) ? payload.to[0] : payload.to || ''
    const subject = payload.subject || '(no subject)'
    const body = payload.text || (payload.html || '').replace(/<[^>]+>/g, ' ').trim()
    const externalId = payload.messageId || ''

    if (!contactEmail || !body) {
      return NextResponse.json({ ok: true, skipped: 'No email or body' })
    }

    // Find workspace by the receiving email address (stored in integrations)
    // Fall back to first workspace if no match
    const integResult = await sql`
      SELECT workspace_id FROM integrations
      WHERE platform = 'gmail' AND status = 'active'
      LIMIT 1
    `
    const workspaceId = integResult.rows[0]
      ? String(integResult.rows[0].workspace_id)
      : null

    if (!workspaceId) {
      // Try first workspace as fallback
      const wsResult = await sql`SELECT id FROM workspaces LIMIT 1`
      if (!wsResult.rows[0]) return NextResponse.json({ ok: true, skipped: 'No workspace' })
    }

    const wId = workspaceId || (await sql`SELECT id FROM workspaces LIMIT 1`).rows[0]?.id as string
    if (!wId) return NextResponse.json({ ok: true, skipped: 'No workspace' })

    // Find or create contact in CRM
    let contactId: string | null = null
    const crmResult = await sql`SELECT id FROM leads_captured WHERE workspace_id = ${wId} AND email = ${contactEmail} LIMIT 1`
    if (crmResult.rows[0]) {
      contactId = String(crmResult.rows[0].id)
    } else {
      // Auto-create lead
      contactId = newId()
      await sql`
        INSERT INTO leads_captured (id, workspace_id, name, email, source, status, score)
        VALUES (${contactId}, ${wId}, ${contactName || null}, ${contactEmail}, 'inbound_email', 'new', 0)
      `
    }

    // Find or create conversation
    let convId: string
    const existingConv = await sql`
      SELECT id FROM inbox_conversations
      WHERE workspace_id = ${wId} AND contact_email = ${contactEmail} AND channel = 'email' AND status != 'closed'
      LIMIT 1
    `
    const now = new Date().toISOString()

    if (existingConv.rows[0]) {
      convId = String(existingConv.rows[0].id)
      await sql`
        UPDATE inbox_conversations
        SET last_message_at = ${now}, unread_count = unread_count + 1
        WHERE id = ${convId}
      `
    } else {
      convId = newId()
      await sql`
        INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, channel, subject, status, tags, last_message_at, unread_count, created_at)
        VALUES (${convId}, ${wId}, ${contactId}, ${contactEmail}, ${contactName || null}, 'email', ${subject}, 'open', '[]', ${now}, 1, ${now})
      `
    }

    // Insert message
    const msgId = newId()
    await sql`
      INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, from_address, to_address, subject, body, channel, status, external_id, sent_at, created_at)
      VALUES (${msgId}, ${convId}, ${wId}, 'inbound', ${contactEmail}, ${toRaw}, ${subject}, ${body.slice(0, 10000)}, 'email', 'read', ${externalId}, ${now}, ${now})
    `

    // Fire email_received workflow trigger
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/workflows/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: wId, triggerType: 'email_received', leadId: contactId, contactEmail, data: { subject, conversationId: convId } }),
    }).catch(e => console.error('Workflow trigger (email) failed:', e))

    return NextResponse.json({ ok: true, conversationId: convId, messageId: msgId })
  } catch (error) {
    console.error('Inbound email webhook error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
