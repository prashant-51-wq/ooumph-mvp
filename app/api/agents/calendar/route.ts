/**
 * Calendar Agent — Phase 1 item 2
 * POST { workspaceId, mode, ... }
 *
 * modes:
 *   find_slots       — AI suggests best meeting times based on context
 *   handle_noshow    — Detect no-shows, generate follow-up sequence
 *   send_followup    — After meeting, generate personalised follow-up email
 *   reschedule       — Help reschedule a booking
 *   analyze_pipeline — Summarise booking pipeline (booked, completed, no-shows)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { Resend } from 'resend'
import { assertWorkspaceOwnership } from '@/lib/guards'

const SYSTEM = `You are the Calendar Agent for Ooumph AI Marketing OS.
You manage appointment scheduling, reminders, no-show recovery, and post-meeting follow-ups.
You understand sales context: who the contact is, what stage they're at, what was discussed.
Write in a professional, warm tone. Always respond with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'find_slots' | 'handle_noshow' | 'send_followup' | 'reschedule' | 'analyze_pipeline'
      bookingId?: string
      contactEmail?: string
      context?: string
    }
    const { workspaceId, mode, bookingId, contactEmail, context } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const wsResult = await sql`SELECT name, owner_email FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] || {}
    const ws = wsResult.rows[0] || {}
    const businessName = String(brand.business_name || ws.name || 'Our company')

    // ── analyze_pipeline ─────────────────────────────────────────────────────
    if (mode === 'analyze_pipeline') {
      const [upcoming, completed, noShows, cancelled] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM bookings WHERE workspace_id = ${workspaceId} AND status = 'confirmed' AND start_time >= NOW()`,
        sql`SELECT COUNT(*) as count FROM bookings WHERE workspace_id = ${workspaceId} AND status = 'completed'`,
        sql`SELECT COUNT(*) as count FROM bookings WHERE workspace_id = ${workspaceId} AND status = 'no_show'`,
        sql`SELECT COUNT(*) as count FROM bookings WHERE workspace_id = ${workspaceId} AND status = 'cancelled'`,
      ])
      const recentBookings = await sql`SELECT * FROM bookings WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 10`

      interface PipelineResult { summary: string; insights: string[]; recommendations: string[]; conversionRate: string }
      const result = await runAgent<PipelineResult>(
        SYSTEM,
        `Analyze the booking pipeline for ${businessName}.

Pipeline stats:
- Upcoming confirmed: ${String(upcoming.rows[0]?.count || 0)}
- Completed: ${String(completed.rows[0]?.count || 0)}
- No-shows: ${String(noShows.rows[0]?.count || 0)}
- Cancelled: ${String(cancelled.rows[0]?.count || 0)}

Recent bookings: ${JSON.stringify(recentBookings.rows.map(b => ({ title: b.title, status: b.status, start: b.start_time })))}

${context ? `Additional context: ${context}` : ''}

Respond with JSON: { "summary": "...", "insights": ["...", "..."], "recommendations": ["...", "..."], "conversionRate": "X%" }`,
      )
      return NextResponse.json({ ok: true, pipeline: result })
    }

    // ── find_slots ────────────────────────────────────────────────────────────
    if (mode === 'find_slots') {
      const availResult = await sql`SELECT * FROM calendar_availability WHERE workspace_id = ${workspaceId} LIMIT 1`
      const config = availResult.rows[0] || {}

      interface SlotsResult { suggestedDates: string[]; reasoning: string; bookingUrl: string }
      const result = await runAgent<SlotsResult>(
        SYSTEM,
        `Suggest meeting times for ${businessName}.

Availability config: Mon-Fri ${String(config.start_hour || 9)}am-${String(config.end_hour || 17)}pm, ${String(config.slot_minutes || 30)}-min slots
Timezone: ${String(config.timezone || 'UTC')}
${context ? `Context: ${context}` : ''}
Contact: ${contactEmail || 'not specified'}

Today is ${new Date().toDateString()}.

Respond with JSON: { "suggestedDates": ["YYYY-MM-DD", "YYYY-MM-DD", "YYYY-MM-DD"], "reasoning": "why these dates", "bookingUrl": "${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}" }`,
      )
      return NextResponse.json({ ok: true, ...result })
    }

    // Modes below require a bookingId
    if (!bookingId) return NextResponse.json({ error: 'bookingId required for this mode' }, { status: 400 })

    const bookingResult = await sql`SELECT * FROM bookings WHERE id = ${bookingId} AND workspace_id = ${workspaceId} LIMIT 1`
    const booking = bookingResult.rows[0]
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const leadResult = await sql`SELECT * FROM leads_captured WHERE id = ${String(booking.contact_id || '')} LIMIT 1`
    const lead = leadResult.rows[0] || {}

    // ── handle_noshow ─────────────────────────────────────────────────────────
    if (mode === 'handle_noshow') {
      // Mark as no-show
      await sql`UPDATE bookings SET status = 'no_show' WHERE id = ${bookingId}`

      interface NoShowResult { subject: string; body: string; reschedulePrompt: string; reasoning: string }
      const result = await runAgent<NoShowResult>(
        SYSTEM,
        `Generate a no-show recovery email for ${String(booking.contact_name || 'the contact')}.

Business: ${businessName}
Meeting that was missed: ${String(booking.title)} on ${new Date(String(booking.start_time)).toDateString()}
Contact background: ${String(lead.notes || 'No notes')}
Lead score: ${String(lead.score || 'unknown')}

Write a warm, non-judgmental email that:
1. Acknowledges we missed them
2. Offers to reschedule easily
3. Includes a direct booking link
4. Keeps it brief (3-4 sentences max)

Booking link: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}

Respond with JSON: { "subject": "...", "body": "...", "reschedulePrompt": "one-liner CTA", "reasoning": "..." }`,
      )

      // Send the recovery email
      if (booking.contact_email) {
        try {
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            const resend = new Resend(resendKey)
            await resend.emails.send({
              from: `${businessName} <${process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'}>`,
              to: [String(booking.contact_email)],
              subject: result.subject,
              text: result.body,
            })
          }
        } catch (e) { console.error('No-show email error:', e) }
      }

      // Create inbox conversation message
      try {
        const convResult = await sql`
          SELECT id FROM inbox_conversations
          WHERE workspace_id = ${workspaceId} AND contact_email = ${String(booking.contact_email)} AND status != 'closed'
          LIMIT 1
        `
        if (convResult.rows[0]) {
          const now = new Date().toISOString()
          await sql`
            INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, to_address, subject, body, channel, status, ai_generated, sent_at, created_at)
            VALUES (${newId()}, ${String(convResult.rows[0].id)}, ${workspaceId}, 'outbound', ${String(booking.contact_email)}, ${result.subject}, ${result.body}, 'email', 'sent', 1, ${now}, ${now})
          `
          await sql`UPDATE inbox_conversations SET last_message_at = ${now} WHERE id = ${String(convResult.rows[0].id)}`
        }
      } catch { /* non-fatal */ }

      return NextResponse.json({ ok: true, email: result })
    }

    // ── send_followup ─────────────────────────────────────────────────────────
    if (mode === 'send_followup') {
      await sql`UPDATE bookings SET status = 'completed' WHERE id = ${bookingId}`

      interface FollowupResult { subject: string; body: string; nextStep: string }
      const result = await runAgent<FollowupResult>(
        SYSTEM,
        `Generate a post-meeting follow-up email.

Business: ${businessName}
Meeting: ${String(booking.title)} on ${new Date(String(booking.start_time)).toDateString()}
Contact: ${String(booking.contact_name)}, ${String(booking.contact_email)}
Lead score: ${String(lead.score || 'unknown')} | Status: ${String(lead.status || 'unknown')}
Meeting notes: ${String(booking.notes || context || 'No notes provided')}

Write a personalised follow-up that:
1. Thanks them for their time
2. Summarises what was discussed (use context/notes if available)
3. States clear next steps
4. Is warm and professional

Respond with JSON: { "subject": "...", "body": "...", "nextStep": "specific next action e.g. send proposal, schedule demo" }`,
      )

      if (booking.contact_email) {
        try {
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            const resend = new Resend(resendKey)
            await resend.emails.send({
              from: `${businessName} <${process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'}>`,
              to: [String(booking.contact_email)],
              subject: result.subject,
              text: result.body,
            })
          }
        } catch (e) { console.error('Follow-up email error:', e) }
      }

      // Update CRM
      if (booking.contact_id) {
        await sql`UPDATE leads_captured SET status = 'qualified', notes = ${`Meeting completed: ${result.nextStep}`} WHERE id = ${String(booking.contact_id)}`
      }

      return NextResponse.json({ ok: true, email: result })
    }

    // ── reschedule ─────────────────────────────────────────────────────────────
    if (mode === 'reschedule') {
      await sql`UPDATE bookings SET status = 'rescheduled' WHERE id = ${bookingId}`

      const bookingLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}`
      interface RescheduleResult { subject: string; body: string }
      const result = await runAgent<RescheduleResult>(
        SYSTEM,
        `Generate a rescheduling email for ${String(booking.contact_name)}.

Original meeting: ${String(booking.title)} on ${new Date(String(booking.start_time)).toDateString()}
Reason: ${context || 'Schedule conflict'}
Booking link for new time: ${bookingLink}

Write a brief, friendly email to reschedule.
Respond with JSON: { "subject": "...", "body": "..." }`,
      )

      if (booking.contact_email) {
        try {
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            const resend = new Resend(resendKey)
            await resend.emails.send({
              from: `${businessName} <${process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'}>`,
              to: [String(booking.contact_email)],
              subject: result.subject,
              text: result.body,
            })
          }
        } catch (e) { console.error('Reschedule email error:', e) }
      }

      return NextResponse.json({ ok: true, email: result })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (error) {
    console.error('Calendar agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
