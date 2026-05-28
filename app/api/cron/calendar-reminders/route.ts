/**
 * GET /api/cron/calendar-reminders
 * Runs daily at 8am — sends reminder emails for meetings in the next 24h.
 * Also marks no-shows for meetings that ended 1h+ ago with no completion note.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { Resend } from 'resend'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  let remindersSet = 0
  let noShowsDetected = 0

  try {
    // ── Send reminders for meetings in next 24h ───────────────────────────────
    // Sprint 7E: LIMIT 200 so a single workspace with thousands of confirmed
    // bookings in the next 24h can't drain the cron's maxDuration. Remaining
    // bookings get picked up by the next tick.
    const upcomingResult = await sql`
      SELECT b.*, w.name as workspace_name, w.owner_email, bp.business_name
      FROM bookings b
      JOIN workspaces w ON w.id = b.workspace_id
      LEFT JOIN brand_profiles bp ON bp.workspace_id = b.workspace_id
      WHERE b.status = 'confirmed'
        AND b.reminder_sent = 0
        AND b.start_time >= ${now.toISOString()}
        AND b.start_time <= ${in24h.toISOString()}
      ORDER BY b.start_time ASC
      LIMIT 200
    `

    const resendKey = process.env.RESEND_API_KEY
    const resend = resendKey ? new Resend(resendKey) : null
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'

    for (const booking of upcomingResult.rows) {
      if (!booking.contact_email) continue

      const businessName = String(booking.business_name || booking.workspace_name || 'Us')
      const startDate = new Date(String(booking.start_time))
      const dateLabel = startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const timeLabel = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const hoursUntil = Math.round((startDate.getTime() - now.getTime()) / 3600000)

      try {
        if (resend) {
          await resend.emails.send({
            from: `${businessName} <${fromEmail}>`,
            to: [String(booking.contact_email)],
            subject: `⏰ Reminder: ${String(booking.title)} — ${hoursUntil < 3 ? 'in a few hours' : 'tomorrow'}`,
            text: [
              `Hi ${String(booking.contact_name || 'there')},`,
              '',
              `Just a reminder about your upcoming meeting:`,
              '',
              `📅 ${dateLabel}`,
              `🕐 ${timeLabel}`,
              booking.meeting_url ? `🎥 Join: ${String(booking.meeting_url)}` : '',
              '',
              `Looking forward to speaking with you!`,
              '',
              `— ${businessName}`,
            ].filter(l => l !== undefined).join('\n'),
          })
        }

        await sql`UPDATE bookings SET reminder_sent = 1 WHERE id = ${String(booking.id)}`
        remindersSet++
      } catch (e) {
        console.error(`Reminder failed for booking ${String(booking.id)}:`, e)
      }
    }

    // ── Detect no-shows (meetings that ended 1h+ ago, still 'confirmed') ──────
    const pastResult = await sql`
      SELECT * FROM bookings
      WHERE status = 'confirmed'
        AND end_time < ${oneHourAgo.toISOString()}
      LIMIT 50
    `

    for (const booking of pastResult.rows) {
      await sql`UPDATE bookings SET status = 'no_show' WHERE id = ${String(booking.id)}`

      // Fire-and-forget no-show recovery email via calendar agent
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      fetch(`${appUrl}/api/agents/calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.CRON_SECRET || process.env.ADMIN_SECRET || '',
        },
        body: JSON.stringify({
          workspaceId: String(booking.workspace_id),
          mode: 'handle_noshow',
          bookingId: String(booking.id),
        }),
      }).catch(e => console.error('No-show recovery error:', e))

      noShowsDetected++
    }

    return NextResponse.json({
      ok: true,
      remindersSet,
      noShowsDetected,
      message: `Sent ${remindersSet} reminders, detected ${noShowsDetected} no-shows`,
    })
  } catch (error) {
    console.error('Calendar reminders cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
