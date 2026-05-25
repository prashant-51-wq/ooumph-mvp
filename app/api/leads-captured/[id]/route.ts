/**
 * /api/leads-captured/[id]
 * GET   — return a single lead by ID (workspace-scoped)
 * PATCH — update lead fields: status, score, notes, tags, custom_fields
 * DELETE — GDPR soft-delete: clears PII, sets status='deleted'
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership, getSessionWorkspaceId } from '@/lib/guards'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sessionWorkspaceId = getSessionWorkspaceId(req)
    if (!sessionWorkspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const [leadResult, activitiesResult, bookingsResult, convResult] = await Promise.all([
      sql`SELECT * FROM leads_captured WHERE id = ${id} AND workspace_id = ${sessionWorkspaceId} LIMIT 1`,
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
  } catch (error) {
    console.error('GET lead error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json() as {
      workspaceId?: string
      status?: string
      score?: number
      notes?: string
      tags?: string[]
      custom_fields?: Record<string, unknown>
      name?: string
      email?: string
      phone?: string
    }

    const workspaceId = body.workspaceId
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (body.status !== undefined) {
      await sql`UPDATE leads_captured SET status = ${body.status} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.score !== undefined) {
      await sql`UPDATE leads_captured SET score = ${body.score} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.notes !== undefined) {
      await sql`UPDATE leads_captured SET notes = ${body.notes} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.name !== undefined) {
      await sql`UPDATE leads_captured SET name = ${body.name} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.email !== undefined) {
      await sql`UPDATE leads_captured SET email = ${body.email} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.phone !== undefined) {
      await sql`UPDATE leads_captured SET phone = ${body.phone} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.tags !== undefined) {
      const existing = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
      const current = (existing.rows[0] as { custom_fields?: unknown })?.custom_fields || {}
      const merged = typeof current === 'object' && current !== null
        ? { ...current as Record<string, unknown>, tags: body.tags }
        : { tags: body.tags }
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(merged)} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }
    if (body.custom_fields !== undefined) {
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(body.custom_fields)} WHERE id = ${id} AND workspace_id = ${workspaceId}`
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH lead error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT id FROM leads_captured WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // GDPR soft-delete: clear all PII fields
    await sql`
      UPDATE leads_captured
      SET name = '[deleted]', email = '[deleted]', phone = NULL, notes = NULL, status = 'deleted'
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `

    // Remove activity timeline for this lead
    await sql`DELETE FROM lead_activities WHERE lead_id = ${id} AND workspace_id = ${workspaceId}`

    return NextResponse.json({ ok: true, deleted: id })
  } catch (error) {
    console.error('DELETE lead error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
