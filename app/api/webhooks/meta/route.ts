/**
 * Meta Webhook Receiver — Engagement Agent (W11)
 *
 * GET  — webhook verification handshake (Meta requires this)
 * POST — receives real-time events: comments, messages, mentions
 *
 * Setup in Meta for Developers:
 *  1. Set Callback URL to: https://your-domain/api/webhooks/meta
 *  2. Verify Token: set META_WEBHOOK_VERIFY_TOKEN env var
 *  3. Subscribe to: feed, messages, mention, comment
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'

// ─── Signature verification (audit pass #6 P0) ─────────────────────────────────
// Meta signs every webhook delivery with x-hub-signature-256, computed over the
// raw request body using HMAC-SHA256 keyed with the app secret. Without this
// check anyone with the webhook URL could POST arbitrary "comment" payloads,
// triggering LLM calls and writes to learning_notes against any workspace.
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret) return false // fail-closed handled separately with 503
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const provided = signatureHeader.slice('sha256='.length)
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(provided, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const SYSTEM = `You are the Engagement Agent for Ooumph AI Marketing OS.
Generate authentic, brand-aligned reply suggestions for social media comments.
Keep replies concise (under 150 chars for comments, under 300 for DMs).
Match the brand tone. Never promise discounts or make claims not approved.
Always respond with valid JSON.`

interface CommentEvent {
  type: 'comment' | 'message' | 'mention'
  platform: 'facebook' | 'instagram'
  from: string
  text: string
  postId?: string
  commentId?: string
  timestamp: string
}

async function generateReply(comment: CommentEvent, brand: Record<string, unknown>, playbook: Record<string, unknown> | null) {
  const templates = (playbook as { replyTemplates?: Array<{ scenario: string; platform: string; template: string }> } | null)?.replyTemplates || []
  const relevantTemplates = templates.filter(t =>
    t.platform.toLowerCase().includes(comment.platform) ||
    t.platform.toLowerCase() === 'all'
  ).slice(0, 3)

  const prompt = `A user commented on ${brand.business_name}'s ${comment.platform} post.

Comment: "${comment.text}"
From: ${comment.from}
Type: ${comment.type}

Brand tone: ${brand.tone}
Business: ${brand.business_name}
Offer: ${brand.offer}

${relevantTemplates.length ? `Reference reply templates:\n${relevantTemplates.map(t => `[${t.scenario}]: ${t.template}`).join('\n')}` : ''}

Generate 2-3 reply options. Return JSON:
{
  "replies": [
    { "text": "reply text (under 150 chars)", "tone": "friendly|professional|playful", "recommended": true|false }
  ],
  "sentiment": "positive|neutral|negative|question",
  "suggestedAction": "reply|dm|escalate|ignore"
}`

  interface ReplyResult { replies: Array<{ text: string; tone: string; recommended: boolean }>; sentiment: string; suggestedAction: string }
  return runAgent<ReplyResult>(SYSTEM, prompt)
}

// ─── GET: Meta webhook verification ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ─── POST: Receive and process webhook events ──────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Audit pass #6 P0: verify x-hub-signature-256 against the raw body BEFORE
    // parsing/dispatching. Misconfigured prod (no META_APP_SECRET) must
    // fail-closed rather than silently processing unsigned events.
    if (!process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'META_APP_SECRET not configured — webhook intake refused' },
        { status: 503 },
      )
    }
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let body: {
      object: string
      entry: Array<{
        id: string
        changes?: Array<{ field: string; value: Record<string, unknown> }>
        messaging?: Array<Record<string, unknown>>
      }>
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.object !== 'page' && body.object !== 'instagram') {
      return NextResponse.json({ ok: true })
    }

    for (const entry of body.entry || []) {
      const pageId = entry.id

      // Find workspace by page/account ID in integrations table
      const integResult = await sql`
        SELECT workspace_id FROM integrations
        WHERE account_id = ${pageId} AND platform IN ('facebook', 'instagram')
        LIMIT 1
      `
      const workspaceId = integResult.rows[0] ? String(integResult.rows[0].workspace_id) : null
      if (!workspaceId) continue

      const [brandResult, playbookResult] = await Promise.all([
        sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
        sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'engagement_playbook' ORDER BY created_at DESC LIMIT 1`,
      ])
      const brand = brandResult.rows[0] as Record<string, unknown> | undefined
      if (!brand) continue
      const playbook = playbookResult.rows[0]?.content_json as Record<string, unknown> | null

      // Process comment/feed changes
      for (const change of entry.changes || []) {
        if (!['feed', 'comments', 'mention'].includes(change.field)) continue
        const val = change.value
        if (!val.message || !val.from) continue

        const comment: CommentEvent = {
          type: 'comment',
          platform: body.object === 'instagram' ? 'instagram' : 'facebook',
          from: String((val.from as Record<string, unknown>)?.name || 'User'),
          text: String(val.message),
          postId: String(val.post_id || ''),
          commentId: String(val.comment_id || val.id || ''),
          timestamp: new Date().toISOString(),
        }

        // Generate reply suggestions asynchronously (don't block webhook ack)
        generateReply(comment, brand, playbook).then(async (result) => {
          const noteId = newId()
          await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
                    VALUES (${noteId}, ${workspaceId}, 'webhook_comment', ${comment.commentId || noteId},
                            ${JSON.stringify({ comment: comment.text, from: comment.from, platform: comment.platform, replies: result.replies, sentiment: result.sentiment, suggestedAction: result.suggestedAction })},
                            0.75)`
        }).catch(e => console.error('Engagement reply generation failed:', e))
      }

      // Process direct messages (Instagram/Messenger)
      for (const msg of entry.messaging || []) {
        const msgData = msg as { sender?: { id: string }; message?: { text: string }; timestamp?: number }
        if (!msgData.message?.text) continue

        const comment: CommentEvent = {
          type: 'message',
          platform: body.object === 'instagram' ? 'instagram' : 'facebook',
          from: msgData.sender?.id || 'Unknown',
          text: msgData.message.text,
          timestamp: msgData.timestamp ? new Date(msgData.timestamp).toISOString() : new Date().toISOString(),
        }

        generateReply(comment, brand, playbook).then(async (result) => {
          const noteId = newId()
          await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
                    VALUES (${noteId}, ${workspaceId}, 'webhook_dm', ${comment.from},
                            ${JSON.stringify({ message: comment.text, platform: comment.platform, replies: result.replies, sentiment: result.sentiment })},
                            0.75)`
        }).catch(e => console.error('DM reply generation failed:', e))
      }
    }

    // Meta requires a 200 response within 20s
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Meta webhook error:', error)
    return NextResponse.json({ ok: true }) // always return 200 to Meta
  }
}
