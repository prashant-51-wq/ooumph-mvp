/**
 * /api/calendar — Bookings list + availability config
 * GET  ?workspaceId= [&status=confirmed|cancelled|completed] [&upcoming=1]
 * POST (availability config) { workspaceId, daysOfWeek, startHour, endHour, slotMinutes, timezone, bufferMinutes, advanceDays }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  const upcoming = searchParams.get('upcoming') === '1'

  if (!workspaceId) return NextResponse.json({ bookings: [], availability: null })

  const [bookingsResult, availResult] = await Promise.all([
    upcoming
      ? sql`SELECT * FROM bookings WHERE workspace_id = ${workspaceId} AND start_time >= NOW() AND status NOT IN ('cancelled') ORDER BY start_time ASC LIMIT 50`
      : status
        ? sql`SELECT * FROM bookings WHERE workspace_id = ${workspaceId} AND status = ${status} ORDER BY start_time DESC LIMIT 100`
        : sql`SELECT * FROM bookings WHERE workspace_id = ${workspaceId} ORDER BY start_time DESC LIMIT 100`,
    sql`SELECT * FROM calendar_availability WHERE workspace_id = ${workspaceId} LIMIT 1`,
  ])

  return NextResponse.json({
    bookings: bookingsResult.rows,
    availability: availResult.rows[0] || null,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      daysOfWeek?: number[]
      startHour?: number
      endHour?: number
      slotMinutes?: number
      timezone?: string
      bufferMinutes?: number
      advanceDays?: number
    }
    const { workspaceId, daysOfWeek, startHour, endHour, slotMinutes, timezone, bufferMinutes, advanceDays } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const existing = await sql`SELECT id FROM calendar_availability WHERE workspace_id = ${workspaceId} LIMIT 1`
    const now = new Date().toISOString()

    if (existing.rows[0]) {
      await sql`
        UPDATE calendar_availability
        SET days_of_week = ${daysOfWeek ? JSON.stringify(daysOfWeek) : '[1,2,3,4,5]'},
            start_hour = ${startHour ?? 9},
            end_hour = ${endHour ?? 17},
            slot_minutes = ${slotMinutes ?? 30},
            timezone = ${timezone || 'UTC'},
            buffer_minutes = ${bufferMinutes ?? 10},
            advance_days = ${advanceDays ?? 14},
            updated_at = ${now}
        WHERE workspace_id = ${workspaceId}
      `
    } else {
      await sql`
        INSERT INTO calendar_availability (id, workspace_id, days_of_week, start_hour, end_hour, slot_minutes, timezone, buffer_minutes, advance_days, updated_at)
        VALUES (${newId()}, ${workspaceId}, ${JSON.stringify(daysOfWeek || [1,2,3,4,5])}, ${startHour ?? 9}, ${endHour ?? 17}, ${slotMinutes ?? 30}, ${timezone || 'UTC'}, ${bufferMinutes ?? 10}, ${advanceDays ?? 14}, ${now})
      `
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
