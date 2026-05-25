/**
 * POST /api/bookings/[id]/complete
 * Marks a booking as completed, fires meeting_completed workflow trigger,
 * and sends a reputation review request (both fire-and-forget).
 *
 * Body: { workspaceId: string, notes?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json() as { workspaceId: string; notes?: string }
    const { workspaceId, notes } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify booking exists and belongs to workspace
    const existing = await sql`
      SELECT id, contact_name, contact_email, contact_id
      FROM bookings
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const booking = existing.rows[0] as {
      id: string
      contact_name: string | null
      contact_email: string | null
      contact_id: string | null
    }

    // Mark booking as completed
    await sql`
      UPDATE bookings
      SET status = 'completed', notes = COALESCE(${notes ?? null}, notes)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `

    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (internalSecret) authHeaders['x-internal-secret'] = internalSecret

    // Fire meeting_completed workflow trigger (fire-and-forget)
    fetch(`${appUrl}/api/workflows/trigger`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        workspaceId,
        triggerType: 'meeting_completed',
        leadId: booking.contact_id || undefined,
        contactEmail: booking.contact_email || undefined,
        data: { bookingId: id, contactName: booking.contact_name },
      }),
    }).catch(e => console.error('meeting_completed workflow trigger failed:', e))

    // Fire reputation review request (fire-and-forget)
    fetch(`${appUrl}/api/agents/reputation`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        workspaceId,
        mode: 'request_review',
        bookingId: id,
        contactName: booking.contact_name,
        contactEmail: booking.contact_email,
        contactId: booking.contact_id,
      }),
    }).catch(e => console.error('reputation review request failed:', e))

    return NextResponse.json({ ok: true, bookingId: id })
  } catch (error) {
    console.error('Booking complete error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
