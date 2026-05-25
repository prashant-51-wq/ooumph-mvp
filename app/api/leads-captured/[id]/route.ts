/**
 * /api/leads-captured/[id] — Full contact view + activity timeline
 * GET  — returns lead + activities + related bookings + inbox conversations
 * PATCH — update lead fields (name, email, phone, tags, custom_fields)
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [leadResult, activitiesResult, bookingsResult, convResult] = await Promise.all([
    sql`SELECT * FROM leads_captured WHERE id = ${id} LIMIT 1`,
    sql`SELECT * FROM lead_activities WHERE lead_id = ${id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, title, start_time, end_time, status, meeting_url FROM bookings WHERE contact_id = ${id} ORDER BY start_time DESC LIMIT 10`,
    sql`SELECT id, subject, channel, status, last_message_at FROM inbox_conversations WHERE contact_id = ${id} ORDER BY last_message_at DESC LIMIT 5`,
  ])

  if (!leadResult.rows[0]) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  return NextResponse.json({
    lead: leadResult.rows[0],
    activities: activitiesResult.rows,
    bookings: bookingsResult.rows,
    conversations: convResult.rows,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json() as {
      name?: string
      email?: string
      phone?: string
      tags?: string[]
      customFields?: Record<string, unknown>
    }

    if (body.name !== undefined || body.email !== undefined || body.phone !== undefined) {
      await sql`
        UPDATE leads_captured
        SET name = COALESCE(${body.name ?? null}, name),
            email = COALESCE(${body.email ?? null}, email),
            phone = COALESCE(${body.phone ?? null}, phone)
        WHERE id = ${id}
      `
    }
    if (body.tags !== undefined) {
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify({ tags: body.tags })} WHERE id = ${id}`
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
