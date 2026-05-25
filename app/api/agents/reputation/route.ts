/**
 * POST /api/agents/reputation
 * Modes:
 *   request_review   — send personalised review-request email after a booking
 *   draft_response   — AI writes a response to a specific review
 *   analyze          — overall reputation health summary + action plan
 *   suggest_reply    — quick reply tone choices for a review
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface AgentBody {
  workspaceId: string
  mode: 'request_review' | 'draft_response' | 'analyze' | 'suggest_reply'
  reviewId?: string
  bookingId?: string
  contactEmail?: string
  contactName?: string
  contactId?: string
  reviewLink?: string       // e.g. Google Maps review URL
  reviewPlatform?: string   // 'google' | 'trustpilot' | 'facebook'
}

async function runAgent<T>(prompt: string): Promise<T> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : text) as T
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AgentBody
    const {
      workspaceId, mode, reviewId, bookingId,
      contactEmail, contactName, contactId,
      reviewLink, reviewPlatform = 'google',
    } = body

    if (!workspaceId || !mode) {
      return NextResponse.json({ error: 'workspaceId and mode required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load brand context
    const [brandResult, wsResult] = await Promise.all([
      sql`SELECT business_name, tone, offer FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT name, owner_email FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
    ])
    const brand = brandResult.rows[0]
    const ws = wsResult.rows[0]
    const businessName = String(brand?.business_name || ws?.name || 'Our Business')
    const tone = String(brand?.tone || 'professional and warm')

    // ── request_review ──────────────────────────────────────────────────────────
    if (mode === 'request_review') {
      if (!contactEmail) {
        return NextResponse.json({ error: 'contactEmail required' }, { status: 400 })
      }

      // Check if we already sent a request for this booking/contact recently
      if (bookingId) {
        const existing = await sql`
          SELECT id FROM reputation_requests
          WHERE workspace_id = ${workspaceId} AND booking_id = ${bookingId}
          LIMIT 1
        `
        if (existing.rows[0]) {
          return NextResponse.json({ ok: true, skipped: 'review request already sent for this booking' })
        }
      }

      // Load booking info for personalisation
      let bookingTitle = 'your recent meeting'
      if (bookingId) {
        const bRes = await sql`SELECT title FROM bookings WHERE id = ${bookingId} LIMIT 1`
        if (bRes.rows[0]?.title) bookingTitle = String(bRes.rows[0].title)
      }

      // AI-generate personalised email
      const emailContent = await runAgent<{ subject: string; body: string }>(`
You are a ${tone} reputation management assistant for ${businessName}.
Write a short, warm review-request email for a client who just had "${bookingTitle}".
The email should feel personal, not pushy, and include a clear call to action to leave a review.
Contact first name: ${(contactName || 'there').split(' ')[0]}
Review platform: ${reviewPlatform}
Review link placeholder: [REVIEW_LINK]

Return JSON: { "subject": "...", "body": "... (plain text, 3-5 short paragraphs, include [REVIEW_LINK] where link should go)" }
`)

      const platformLink = reviewLink || `https://www.google.com/maps/search/${encodeURIComponent(businessName)}`
      const finalBody = emailContent.body.replace(/\[REVIEW_LINK\]/g, platformLink)

      // Save request record
      const reqId = newId()
      const now = new Date().toISOString()
      await sql`
        INSERT INTO reputation_requests (id, workspace_id, contact_id, contact_name, contact_email, booking_id, status, sent_at, review_platform, review_link, created_at)
        VALUES (${reqId}, ${workspaceId}, ${contactId || null}, ${contactName || null}, ${contactEmail}, ${bookingId || null}, 'pending', ${now}, ${reviewPlatform}, ${platformLink}, ${now})
      `

      // Send email
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        try {
          const resend = new Resend(resendKey)
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
          await resend.emails.send({
            from: `${businessName} <${fromEmail}>`,
            to: [contactEmail],
            subject: emailContent.subject,
            text: finalBody,
          })
          await sql`UPDATE reputation_requests SET status = 'sent', sent_at = ${now} WHERE id = ${reqId}`
        } catch (emailErr) {
          console.error('Review request email failed (non-fatal):', emailErr)
        }
      }

      // Log activity
      if (contactId) {
        const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        fetch(`${appUrl}/api/leads-captured/${contactId}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, type: 'review_requested', title: 'Review request sent', description: `Platform: ${reviewPlatform}` }),
        }).catch(() => {})
      }

      return NextResponse.json({ ok: true, requestId: reqId, subject: emailContent.subject })
    }

    // ── draft_response ──────────────────────────────────────────────────────────
    if (mode === 'draft_response') {
      if (!reviewId) return NextResponse.json({ error: 'reviewId required' }, { status: 400 })

      const revResult = await sql`SELECT * FROM reputation_reviews WHERE id = ${reviewId} LIMIT 1`
      const review = revResult.rows[0]
      if (!review) return NextResponse.json({ error: 'review not found' }, { status: 404 })

      const draft = await runAgent<{ response: string; tone_used: string; key_points: string[] }>(`
You are a ${tone} reputation manager for ${businessName}.
Draft a professional public response to this ${review.source} review.

Review details:
- Rating: ${review.rating}/5
- Sentiment: ${review.sentiment}
- Reviewer: ${review.contact_name || 'a customer'}
- Title: ${review.title || '(no title)'}
- Body: ${review.body || '(no body)'}

Guidelines:
- Thank the reviewer by first name if available
- Acknowledge specific points they raised
- For negative reviews: apologise sincerely, offer to resolve offline (never argue)
- For positive reviews: express genuine gratitude, reinforce what they loved
- End with an invitation to return / contact us
- Keep it under 150 words
- Do NOT use generic template phrases like "we value your feedback"

Return JSON: { "response": "...", "tone_used": "...", "key_points": ["point1", "point2"] }
`)

      return NextResponse.json({ ok: true, draft: draft.response, toneUsed: draft.tone_used, keyPoints: draft.key_points })
    }

    // ── suggest_reply ───────────────────────────────────────────────────────────
    if (mode === 'suggest_reply') {
      if (!reviewId) return NextResponse.json({ error: 'reviewId required' }, { status: 400 })

      const revResult = await sql`SELECT * FROM reputation_reviews WHERE id = ${reviewId} LIMIT 1`
      const review = revResult.rows[0]
      if (!review) return NextResponse.json({ error: 'review not found' }, { status: 404 })

      const suggestions = await runAgent<{ options: Array<{ tone: string; response: string }> }>(`
Draft 3 different response options for this ${review.source} review (rating: ${review.rating}/5):
"${review.body || review.title || '(no content)'}"

Respond for ${businessName} (${tone} tone).
Options should differ in approach: e.g. concise+professional, warm+personal, detailed+solution-focused.

Return JSON: { "options": [{ "tone": "...", "response": "..." }, ...] }
`)

      return NextResponse.json({ ok: true, options: suggestions.options })
    }

    // ── analyze ─────────────────────────────────────────────────────────────────
    if (mode === 'analyze') {
      const [reviewsResult, requestsResult] = await Promise.all([
        sql`SELECT rating, sentiment, status, source, body FROM reputation_reviews WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT status, COUNT(*) as c FROM reputation_requests WHERE workspace_id = ${workspaceId} GROUP BY status`,
      ])
      const reviews = reviewsResult.rows
      const requests = requestsResult.rows

      if (reviews.length === 0) {
        return NextResponse.json({
          ok: true,
          analysis: {
            health: 'no_data',
            score: 0,
            summary: 'No reviews collected yet. Start by sending review requests to recent clients.',
            strengths: [],
            issues: [],
            actions: ['Send review requests to your last 10 completed bookings'],
            requestStats: requests,
          },
        })
      }

      const avgRating = reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.filter(r => r.rating).length
      const negCount = reviews.filter(r => r.sentiment === 'negative').length
      const unanswered = reviews.filter(r => r.status === 'new' && r.sentiment === 'negative').length

      const analysis = await runAgent<{
        health: string
        score: number
        summary: string
        strengths: string[]
        issues: string[]
        actions: string[]
        responseTemplate: string
      }>(`
You are a reputation analyst for ${businessName}.
Analyze these ${reviews.length} reviews and provide actionable insights.

Data:
- Average rating: ${avgRating.toFixed(1)}/5
- Negative reviews: ${negCount}
- Unanswered negative reviews: ${unanswered}
- Review samples (body): ${reviews.slice(0, 10).map(r => `[${r.rating}★ ${r.sentiment}] "${String(r.body || '').slice(0, 100)}"`).join(' | ')}

Return JSON: {
  "health": "excellent|good|fair|poor",
  "score": 0-100,
  "summary": "2-sentence overview",
  "strengths": ["...", "..."],
  "issues": ["...", "..."],
  "actions": ["...", "..."],
  "responseTemplate": "A reusable template for responding to negative reviews"
}
`)

      return NextResponse.json({ ok: true, analysis: { ...analysis, avgRating, totalReviews: reviews.length, unansweredNegative: unanswered, requestStats: requests } })
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 })
  } catch (error) {
    console.error('Reputation agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
