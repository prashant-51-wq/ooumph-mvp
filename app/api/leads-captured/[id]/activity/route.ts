/**
 * POST /api/leads-captured/[id]/activity
 * Log an activity event on a lead's timeline.
 * Called internally by booking agent, inbox agent, and score agent.
 * Also callable from the UI for manual notes.
 *
 * Sprint 9A: added workspace ownership guards. Activity rows hold
 * notes + metadata about leads — cross-tenant exposure would leak
 * customer interaction history.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

async function workspaceForLead(leadId: string): Promise<string | null> {
  const r = await sql`SELECT workspace_id FROM leads_captured WHERE id = ${leadId} LIMIT 1`
  return (r.rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null
}

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
    // Sprint 9A: session must own this workspace. Defense in depth:
    // also verify the lead actually belongs to this workspace before
    // attaching activity rows (so a stolen leadId from another tenant
    // can't have activities written against it).
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const leadWsId = await workspaceForLead(leadId)
    if (!leadWsId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (leadWsId !== workspaceId) {
      return NextResponse.json({ error: 'Lead does not belong to this workspace' }, { status: 403 })
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  // Sprint 9A: ownership before reading activity history. Look up
  // the lead's workspace from the row.
  const leadWsId = await workspaceForLead(leadId)
  if (!leadWsId) return NextResponse.json([], { status: 200 })
  const denied = assertWorkspaceOwnership(req, leadWsId)
  if (denied) return denied
  const result = await sql`
    SELECT * FROM lead_activities WHERE lead_id = ${leadId} AND workspace_id = ${leadWsId} ORDER BY created_at DESC LIMIT 50
  `
  return NextResponse.json(result.rows)
}
