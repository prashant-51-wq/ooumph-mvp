/**
 * POST /api/calendar/book
 * Creates a booking, sends confirmation email, creates GCal event if connected.
 * Called by the public booking page and the Calendar Agent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      contactName: string
      contactEmail: string
      contactPhone?: string
      startTime: string    // ISO
      endTime: string      // ISO
      timezone?: string
      title?: string
      description?: string
      notes?: string
      source?: string
    }
    const {
      workspaceId, contactName, contactEmail, contactPhone,
      startTime, endTime, timezone = 'UTC',
      title, description, notes, source = 'booking_page',
    } = body

    if (!workspaceId || !contactName || !contactEmail || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check slot is still available
    const conflict = await sql`
      SELECT id FROM bookings
      WHERE workspace_id = ${workspaceId}
        AND status NOT IN ('cancelled')
        AND start_time < ${endTime}
        AND end_time > ${startTime}
      LIMIT 1
    `
    if (conflict.rows[0]) {
      return NextResponse.json({ error: 'This slot is no longer available. Please choose another time.' }, { status: 409 })
    }

    // Get workspace + brand info
    const [wsResult, brandResult] = await Promise.all([
      sql`SELECT name, owner_email FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
      sql`SELECT business_name, tone FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
    ])
    const ws = wsResult.rows[0]
    const brand = brandResult.rows[0]
    const businessName = String(brand?.business_name || ws?.name || 'Us')

    // Find or create CRM contact
    let contactId: string | null = null
    const crmResult = await sql`SELECT id FROM leads_captured WHERE workspace_id = ${workspaceId} AND email = ${contactEmail} LIMIT 1`
    if (crmResult.rows[0]) {
      contactId = String(crmResult.rows[0].id)
      await sql`UPDATE leads_captured SET status = 'contacted', notes = 'Booked a meeting' WHERE id = ${contactId}`
    } else {
      contactId = newId()
      await sql`
        INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, status, score)
        VALUES (${contactId}, ${workspaceId}, ${contactName}, ${contactEmail}, ${contactPhone || null}, 'booking_page', 'contacted', 50)
      `
    }

    const meetingTitle = title || `Discovery Call with ${contactName}`
    const bookingId = newId()
    const now = new Date().toISOString()

    // Try to create Google Calendar event
    let calendarEventId: string | null = null
    let meetingUrl: string | null = null

    try {
      const integResult = await sql`
        SELECT access_token FROM integrations
        WHERE workspace_id = ${workspaceId} AND platform = 'google_calendar' AND status = 'active'
        LIMIT 1
      `
      const token = integResult.rows[0]?.access_token ? String(integResult.rows[0].access_token) : null
      if (token) {
        const eventRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: meetingTitle,
            description: description || `Meeting booked via ${businessName}`,
            start: { dateTime: startTime, timeZone: timezone },
            end: { dateTime: endTime, timeZone: timezone },
            attendees: [
              { email: contactEmail, displayName: contactName },
              ...(ws?.owner_email ? [{ email: String(ws.owner_email), organizer: true }] : []),
            ],
            conferenceData: {
              createRequest: { requestId: bookingId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
            },
          }),
        })
        if (eventRes.ok) {
          const eventData = await eventRes.json() as { id?: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ uri?: string }> } }
          calendarEventId = eventData.id || null
          meetingUrl = eventData.hangoutLink || eventData.conferenceData?.entryPoints?.[0]?.uri || null
        }
      }
    } catch (gcalErr) {
      console.error('GCal event creation failed (non-fatal):', gcalErr)
    }

    // Create booking record
    await sql`
      INSERT INTO bookings (id, workspace_id, contact_id, contact_name, contact_email, contact_phone, title, description, start_time, end_time, timezone, status, meeting_url, calendar_event_id, reminder_sent, notes, source, created_at)
      VALUES (${bookingId}, ${workspaceId}, ${contactId}, ${contactName}, ${contactEmail}, ${contactPhone || null}, ${meetingTitle}, ${description || null}, ${startTime}, ${endTime}, ${timezone}, 'confirmed', ${meetingUrl}, ${calendarEventId}, 0, ${notes || null}, ${source}, ${now})
    `

    // Send confirmation email
    try {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey && contactEmail) {
        const resend = new Resend(resendKey)
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
        const startDate = new Date(startTime)
        const dateLabel = startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        const timeLabel = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone })

        await resend.emails.send({
          from: `${businessName} <${fromEmail}>`,
          to: [contactEmail],
          subject: `✅ Confirmed: ${meetingTitle}`,
          text: [
            `Hi ${contactName},`,
            '',
            `Your meeting is confirmed!`,
            '',
            `📅 ${dateLabel}`,
            `🕐 ${timeLabel} (${timezone})`,
            meetingUrl ? `🎥 Join: ${meetingUrl}` : '',
            '',
            `We're looking forward to speaking with you.`,
            '',
            `— ${businessName}`,
          ].filter(l => l !== undefined).join('\n'),
        })
      }
    } catch (emailErr) {
      console.error('Confirmation email failed (non-fatal):', emailErr)
    }

    // Also create inbox conversation for this booking
    try {
      const convCheck = await sql`
        SELECT id FROM inbox_conversations
        WHERE workspace_id = ${workspaceId} AND contact_email = ${contactEmail} AND channel = 'email' AND status != 'closed'
        LIMIT 1
      `
      if (!convCheck.rows[0]) {
        const convId = newId()
        await sql`
          INSERT INTO inbox_conversations (id, workspace_id, contact_id, contact_email, contact_name, contact_phone, channel, subject, status, tags, last_message_at, unread_count, created_at)
          VALUES (${convId}, ${workspaceId}, ${contactId}, ${contactEmail}, ${contactName}, ${contactPhone || null}, 'email', ${`Meeting: ${meetingTitle}`}, 'open', '["booked"]', ${now}, 0, ${now})
        `
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      bookingId,
      calendarEventId,
      meetingUrl,
      message: 'Booking confirmed! Check your email for details.',
    })
  } catch (error) {
    console.error('Booking error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
