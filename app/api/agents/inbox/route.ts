/**
 * Inbox Agent — Unified Inbox Supervisor
 * POST { workspaceId, mode, conversationId?, contactData? }
 *
 * modes:
 *   sync_gmail    — Fetch recent Gmail threads, import into inbox_conversations
 *   compose_reply — Generate AI reply draft for a conversation
 *   classify      — Classify conversation, suggest tags + next step
 *   sync_leads    — Import leads_captured contacts as conversations if they have email history
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'

const SYSTEM = `You are the Unified Inbox Agent for Ooumph AI Marketing OS.
You manage all inbound and outbound communication across email and SMS.
You understand context from CRM data, lead scores, and conversation history.
You write concise, on-brand replies that move prospects forward.
Always respond with valid JSON.`

interface GmailThread {
  id: string
  snippet: string
  messages?: GmailMessage[]
}

interface GmailMessage {
  id: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{ mimeType: string; body?: { data?: string } }>
  }
  internalDate?: string
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function extractBody(msg: GmailMessage): string {
  const payload = msg.payload
  if (!payload) return ''

  // Try parts first
  if (payload.parts) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain')
    if (textPart?.body?.data) return decodeBase64(textPart.body.data)
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) return decodeBase64(htmlPart.body.data).replace(/<[^>]+>/g, ' ').trim()
  }

  // Fall back to top-level body
  if (payload.body?.data) return decodeBase64(payload.body.data)
  return ''
}

async function syncGmail(workspaceId: string): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = []
  let imported = 0

  // Get stored Gmail OAuth token
  const integResult = await sql`
    SELECT access_token, metadata FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = 'gmail' AND status = 'active'
    LIMIT 1
  `
  const integ = integResult.rows[0]
  if (!integ || !integ.access_token) {
    return { imported: 0, errors: ['No Gmail integration found. Connect Gmail in Settings → Connections.'] }
  }

  let accessToken = String(integ.access_token)

  // Try to refresh token if metadata has refresh_token
  try {
    const meta = typeof integ.metadata === 'object' ? integ.metadata as Record<string, string> : JSON.parse(String(integ.metadata || '{}')) as Record<string, string>
    if (meta.refresh_token && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: meta.refresh_token,
          grant_type: 'refresh_token',
        }),
      })
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json() as { access_token?: string }
        if (refreshData.access_token) {
          accessToken = refreshData.access_token
          await sql`UPDATE integrations SET access_token = ${accessToken} WHERE workspace_id = ${workspaceId} AND platform = 'gmail'`
        }
      }
    }
  } catch (e) {
    errors.push(`Token refresh warning: ${String(e)}`)
  }

  // Fetch recent threads from Gmail
  try {
    const threadsRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=20&q=in:inbox',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!threadsRes.ok) {
      const errText = await threadsRes.text()
      return { imported: 0, errors: [`Gmail API error: ${errText.slice(0, 200)}`] }
    }

    const threadsData = await threadsRes.json() as { threads?: GmailThread[] }
    const threads = threadsData.threads || []

    for (const thread of threads) {
      try {
        // Fetch full thread
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!threadRes.ok) continue
        const threadData = await threadRes.json() as { messages?: GmailMessage[] }
        const messages = threadData.messages || []
        if (!messages.length) continue

        const firstMsg = messages[0]
        const headers = firstMsg.payload?.headers || []
        const fromRaw = getHeader(headers, 'from')
        const subject = getHeader(headers, 'subject') || '(no subject)'

        // Parse from email
        const emailMatch = fromRaw.match(/<([^>]+)>/)
        const contactEmail = emailMatch ? emailMatch[1] : fromRaw.trim()
        const contactName = emailMatch ? fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim() : ''

        if (!contactEmail || contactEmail.includes('noreply') || contactEmail.includes('no-reply')) continue

        // Check if conversation already exists
        const existing = await sql`
          SELECT id FROM inbox_conversations
          WHERE workspace_id = ${workspaceId} AND contact_email = ${contactEmail}
            AND channel = 'email' AND subject = ${subject}
          LIMIT 1
        `
        if (existing.rows[0]) continue

        // Look up CRM contact
        let contactId: string | null = null
        const crmResult = await sql`SELECT id FROM leads_captured WHERE workspace_id = ${workspaceId} AND email = ${contactEmail} LIMIT 1`
        if (crmResult.rows[0]) contactId = String(crmResult.rows[0].id)

        // Create conversation
        const convId = newId()
        const lastMsgDate = messages[messages.length - 1].internalDate
          ? new Date(parseInt(String(messages[messages.length - 1].internalDate))).toISOString()
          : new Date().toISOString()

        await sql`
          INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, channel, subject, status, tags, last_message_at, unread_count, created_at)
          VALUES (${convId}, ${workspaceId}, ${contactId}, ${contactEmail}, ${contactName}, 'email', ${subject}, 'open', '[]', ${lastMsgDate}, ${messages.filter(m => {
            const h = m.payload?.headers || []
            const from = getHeader(h, 'from')
            return from.includes(contactEmail)
          }).length}, ${new Date().toISOString()})
        `

        // Import messages
        for (const msg of messages) {
          const msgHeaders = msg.payload?.headers || []
          const msgFrom = getHeader(msgHeaders, 'from')
          const isInbound = msgFrom.includes(contactEmail)
          const body = extractBody(msg)
          if (!body) continue

          const msgId = newId()
          const sentAt = msg.internalDate
            ? new Date(parseInt(String(msg.internalDate))).toISOString()
            : new Date().toISOString()

          await sql`
            INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, from_address, to_address, subject, body, channel, status, external_id, sent_at, created_at)
            VALUES (${msgId}, ${convId}, ${workspaceId}, ${isInbound ? 'inbound' : 'outbound'}, ${msgFrom}, ${isInbound ? '' : contactEmail}, ${subject}, ${body.slice(0, 5000)}, 'email', 'read', ${thread.id + '_' + msg.id}, ${sentAt}, ${sentAt})
          `
        }

        imported++
      } catch (threadErr) {
        errors.push(`Thread ${thread.id}: ${String(threadErr)}`)
      }
    }
  } catch (e) {
    errors.push(`Gmail fetch error: ${String(e)}`)
  }

  return { imported, errors }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'sync_gmail' | 'compose_reply' | 'classify' | 'sync_leads'
      conversationId?: string
      instruction?: string
    }
    const { workspaceId, mode, conversationId, instruction } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    // ── Mode: sync_gmail ────────────────────────────────────────────────────
    if (mode === 'sync_gmail') {
      const result = await syncGmail(workspaceId)
      return NextResponse.json({ ok: true, ...result })
    }

    // ── Mode: sync_leads ───────────────────────────────────────────────────
    if (mode === 'sync_leads') {
      // Import leads with email as email conversations
      const leads = await sql`
        SELECT l.* FROM leads_captured l
        WHERE l.workspace_id = ${workspaceId} AND l.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM inbox_conversations c
          WHERE c.workspace_id = ${workspaceId} AND c.contact_email = l.email
        )
        LIMIT 50
      `
      let created = 0
      for (const lead of leads.rows) {
        if (!lead.email) continue
        const convId = newId()
        const now = new Date().toISOString()
        await sql`
          INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, channel, subject, status, tags, last_message_at, unread_count, created_at)
          VALUES (${convId}, ${workspaceId}, ${String(lead.id)}, ${String(lead.email)}, ${String(lead.name || '')}, 'email', ${`Re: ${lead.campaign || 'Lead Follow-up'}`}, 'open', '[]', ${String(lead.created_at)}, 0, ${now})
        `
        created++
      }
      return NextResponse.json({ ok: true, created })
    }

    // ── Modes requiring a conversation ─────────────────────────────────────
    if (!conversationId) return NextResponse.json({ error: 'conversationId required for this mode' }, { status: 400 })

    const [convResult, msgResult, brandResult] = await Promise.all([
      sql`SELECT * FROM inbox_conversations WHERE id = ${conversationId} LIMIT 1`,
      sql`SELECT * FROM inbox_messages WHERE conversation_id = ${conversationId} ORDER BY sent_at ASC LIMIT 20`,
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
    ])

    const convo = convResult.rows[0]
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const messages = msgResult.rows
    const brand = brandResult.rows[0] || {}

    const conversationContext = messages.map((m) =>
      `[${String(m.direction).toUpperCase()}] ${String(m.from_address || 'us')}: ${String(m.body).slice(0, 800)}`
    ).join('\n\n')

    // ── Mode: compose_reply ────────────────────────────────────────────────
    if (mode === 'compose_reply') {
      const crmResult = await sql`SELECT * FROM leads_captured WHERE id = ${String(convo.contact_id || '')} LIMIT 1`
      const lead = crmResult.rows[0] || {}

      interface ReplyResult { subject: string; body: string; tone: string; reasoning: string }
      const result = await runAgent<ReplyResult>(
        SYSTEM,
        `Generate a reply to this email conversation.

Business: ${String(brand.business_name || 'Our Company')}
Brand tone: ${String(brand.tone || 'professional, helpful')}
Contact: ${String(convo.contact_name || convo.contact_email)} | Score: ${String(lead.score || 'unknown')} | Status: ${String(lead.status || 'unknown')}
Subject: ${String(convo.subject || '')}

Conversation history:
${conversationContext}

${instruction ? `Additional instruction: ${instruction}` : 'Write a helpful, concise reply that moves this conversation forward toward a meeting or sale.'}

Respond with JSON: { "subject": "reply subject", "body": "email body (plain text, no HTML)", "tone": "professional|casual|urgent", "reasoning": "why this approach" }`,
      )

      return NextResponse.json({ ok: true, reply: result })
    }

    // ── Mode: classify ─────────────────────────────────────────────────────
    if (mode === 'classify') {
      interface ClassifyResult {
        intent: string
        sentiment: string
        urgency: string
        suggestedTags: string[]
        nextAction: string
        nextActionType: string
        summary: string
        shouldUpdateCRM: boolean
        crmUpdate?: { status?: string; notes?: string }
      }
      const result = await runAgent<ClassifyResult>(
        SYSTEM,
        `Classify this conversation and suggest next actions.

Contact: ${String(convo.contact_name || convo.contact_email)}
Channel: ${String(convo.channel)}
Subject: ${String(convo.subject || '')}

Conversation:
${conversationContext}

Respond with JSON:
{
  "intent": "inquiry|complaint|request|purchase|unsubscribe|spam|other",
  "sentiment": "positive|neutral|negative",
  "urgency": "high|medium|low",
  "suggestedTags": ["tag1", "tag2"],
  "nextAction": "brief description of what to do next",
  "nextActionType": "reply|call|book_meeting|close|tag_and_wait",
  "summary": "one sentence summary of the conversation",
  "shouldUpdateCRM": true,
  "crmUpdate": { "status": "contacted", "notes": "optional notes to add to CRM lead" }
}`,
      )

      // Apply tags to conversation
      if (result.suggestedTags?.length) {
        await sql`UPDATE inbox_conversations SET tags = ${JSON.stringify(result.suggestedTags)} WHERE id = ${conversationId}`
      }

      // Update CRM lead if applicable
      if (result.shouldUpdateCRM && convo.contact_id && result.crmUpdate) {
        const { status, notes } = result.crmUpdate
        if (status) await sql`UPDATE leads_captured SET status = ${status} WHERE id = ${String(convo.contact_id)}`
        if (notes) await sql`UPDATE leads_captured SET notes = ${notes} WHERE id = ${String(convo.contact_id)}`
      }

      return NextResponse.json({ ok: true, classification: result })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (error) {
    console.error('Inbox agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
