/**
 * POST /api/leads-captured/[id]/activity
 * Log an activity event on a lead's timeline.
 * Called internally by booking agent, inbox agent, and score agent.
 * Also callable from the UI for manual notes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  try {
    const body = await req.json() as {
      workspaceId: string
      type: string
      title: string
      description?: string
      metadata?: Record<string, unknown>
    }
    const { workspaceId, type, title, description, metadata } = body

    if (!workspaceId || !type || !title) {
      return NextResponse.json({ error: 'workspaceId, type, title required' }, { status: 400 })
    }

    const actId = newId()
    const now = new Date().toISOString()

    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
      VALUES (${actId}, ${workspaceId}, ${leadId}, ${type}, ${title}, ${description || null}, ${JSON.stringify(metadata || {})}, ${now})
    `

    return NextResponse.json({ ok: true, id: actId })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const result = await sql`
    SELECT * FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 50
  `
  return NextResponse.json(result.rows)
}
