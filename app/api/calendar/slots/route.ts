/**
 * GET /api/calendar/slots?workspaceId=&date=YYYY-MM-DD
 * Returns available 30-min slots for a given date.
 * Excludes existing bookings. Optionally checks GCal if token exists.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { readAccessToken } from '@/lib/integrations'

interface TimeSlot {
  start: string   // ISO
  end: string     // ISO
  label: string   // "9:00 AM"
}

function formatHour(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  const displayM = m === 0 ? '00' : String(m).padStart(2, '0')
  return `${displayH}:${displayM} ${period}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const dateStr = searchParams.get('date') // YYYY-MM-DD

  if (!workspaceId || !dateStr) {
    return NextResponse.json({ slots: [] })
  }

  // Get availability config
  const availResult = await sql`SELECT * FROM calendar_availability WHERE workspace_id = ${workspaceId} LIMIT 1`
  const config = availResult.rows[0] || {}

  const daysOfWeek: number[] = (() => {
    try { return JSON.parse(String(config.days_of_week || '[1,2,3,4,5]')) as number[] }
    catch { return [1, 2, 3, 4, 5] }
  })()
  const startHour = Number(config.start_hour ?? 9)
  const endHour = Number(config.end_hour ?? 17)
  const slotMinutes = Number(config.slot_minutes ?? 30)
  const bufferMinutes = Number(config.buffer_minutes ?? 10)
  const timezone = String(config.timezone || 'UTC')

  // Check if this day of week is available
  const targetDate = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = targetDate.getDay()

  if (!daysOfWeek.includes(dayOfWeek)) {
    return NextResponse.json({ slots: [], reason: 'Not a working day' })
  }

  // Get existing bookings for this date
  const dayStart = dateStr + 'T00:00:00.000Z'
  const dayEnd = dateStr + 'T23:59:59.999Z'
  const bookingsResult = await sql`
    SELECT start_time, end_time FROM bookings
    WHERE workspace_id = ${workspaceId}
      AND start_time >= ${dayStart}
      AND start_time <= ${dayEnd}
      AND status NOT IN ('cancelled')
  `
  const bookedSlots = bookingsResult.rows.map(b => ({
    start: new Date(String(b.start_time)).getTime(),
    end: new Date(String(b.end_time)).getTime() + bufferMinutes * 60000,
  }))

  // Try Google Calendar busy times if connected
  let gcalBusy: Array<{ start: number; end: number }> = []
  try {
    // Sprint 10B: select both token columns; readAccessToken() resolves.
    const integResult = await sql`
      SELECT access_token, encrypted_access_token FROM integrations
      WHERE workspace_id = ${workspaceId} AND platform = 'google_calendar' AND status = 'active'
      LIMIT 1
    `
    const _intRow = integResult.rows[0]
    const token = _intRow ? readAccessToken({
      access_token: _intRow.access_token as string | null,
      encrypted_access_token: _intRow.encrypted_access_token as string | null,
    }) : null
    if (token) {
      const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin: dayStart,
          timeMax: dayEnd,
          items: [{ id: 'primary' }],
        }),
      })
      if (freeBusyRes.ok) {
        const fbData = await freeBusyRes.json() as { calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } } }
        const busy = fbData.calendars?.primary?.busy || []
        gcalBusy = busy.map(b => ({
          start: new Date(b.start).getTime(),
          end: new Date(b.end).getTime() + bufferMinutes * 60000,
        }))
      }
    }
  } catch { /* non-fatal */ }

  const allBusy = [...bookedSlots, ...gcalBusy]

  // Generate slots
  const slots: TimeSlot[] = []
  const now = Date.now()

  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      // Build start/end in local date
      const slotStart = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000)

      // Skip past slots
      if (slotStart.getTime() <= now + 3600000) continue // +1h buffer

      // Skip if slot end would go past end of day
      if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > 0)) break

      // Check against busy
      const startMs = slotStart.getTime()
      const endMs = slotEnd.getTime()
      const isBlocked = allBusy.some(b => startMs < b.end && endMs > b.start)

      if (!isBlocked) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: formatHour(h, m),
        })
      }
    }
  }

  return NextResponse.json({ slots, timezone, slotMinutes })
}
