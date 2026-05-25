/**
 * /api/inbox/[id]/reply — Send a reply in a conversation
 * POST { body, subject?, channel? }
 * Sends via Resend (email) or logs for SMS
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  try {
    const { body, subject, aiGenerated } = await req.json() as {
      body: string
      subject?: string
      aiGenerated?: boolean
    }

    if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

    // Get conversation details
    const convResult = await sql`SELECT * FROM inbox_conversations WHERE id = ${conversationId} LIMIT 1`
    const convo = convResult.rows[0]
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const now = new Date().toISOString()
    const msgId = newId()

    // Insert message record
    await sql`
      INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, to_address, subject, body, channel, status, ai_generated, sent_at, created_at)
      VALUES (${msgId}, ${conversationId}, ${String(convo.workspace_id)}, 'outbound', ${String(convo.contact_email || '')}, ${subject || String(convo.subject || '')}, ${body}, ${String(convo.channel || 'email')}, 'sent', ${aiGenerated ? 1 : 0}, ${now}, ${now})
    `

    // Update conversation timestamp
    await sql`UPDATE inbox_conversations SET last_message_at = ${now} WHERE id = ${conversationId}`

    // Send via Resend if email channel
    if (String(convo.channel) === 'email' && convo.contact_email) {
      try {
        const resendKey = process.env.RESEND_API_KEY
        if (resendKey) {
          const resend = new Resend(resendKey)
          const workspaceResult = await sql`SELECT name, owner_email FROM workspaces WHERE id = ${String(convo.workspace_id)} LIMIT 1`
          const ws = workspaceResult.rows[0]
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
          const fromName = ws ? String(ws.name) : 'Ooumph AI'

          await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: [String(convo.contact_email)],
            subject: subject || String(convo.subject || 'Follow-up'),
            text: body,
          })

          await sql`UPDATE inbox_messages SET status = 'delivered' WHERE id = ${msgId}`
        }
      } catch (emailErr) {
        console.error('Email send failed (non-fatal):', emailErr)
        await sql`UPDATE inbox_messages SET status = 'failed' WHERE id = ${msgId}`
      }
    }

    return NextResponse.json({ ok: true, id: msgId })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
