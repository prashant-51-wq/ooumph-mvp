import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { fireSegmentTriggersForNewLead } from '@/lib/segment-trigger'

// Sprint 8A: workspace ownership guards on the in-dashboard CRM path.
// Public form submission flows (/api/lp-submit, /api/f/submit) are
// separate routes and intentionally exempt — they capture leads from
// anonymous web visitors.

async function workspaceForLead(id: string): Promise<string | null> {
  const r = await sql`SELECT workspace_id FROM leads_captured WHERE id = ${id} LIMIT 1`
  return (r.rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = status && status !== 'all'
    ? await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND status = ${status} ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 100`

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, name, email, phone, source, campaign, status, score, notes } = await req.json() as {
      workspaceId: string
      name?: string
      email?: string
      phone?: string
      source?: string
      campaign?: string
      status?: string
      score?: number
      notes?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    await sql`
      INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, campaign, status, score, notes)
      VALUES (${id}, ${workspaceId}, ${name || null}, ${email || null}, ${phone || null},
              ${source || 'manual'}, ${campaign || null}, ${status || 'new'}, ${score || 0}, ${notes || null})
    `

    // Auto-score the new lead (fire-and-forget, non-blocking) — only if a scoring model exists
    const modelResult = await sql`
      SELECT id FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'lead_scoring_model'
      LIMIT 1
    `
    if (modelResult.rows[0]) {
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      fetch(`${appUrl}/api/agents/funnel/qualify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          mode: 'score_lead',
          leadData: { id, name, email, phone, company: notes, source },
        }),
      }).then(async r => {
        if (r.ok) {
          const data = await r.json() as { score?: { totalScore?: number; tier?: string } }
          if (data.score?.totalScore !== undefined) {
            await sql`
              UPDATE leads_captured
              SET score = ${data.score.totalScore},
                  status = ${data.score.tier === 'hot' ? 'contacted' : 'new'}
              WHERE id = ${id}
            `
          }
        }
      }).catch(e => console.error('Auto-score failed (non-fatal):', e))
    }

    // Fire lead_captured workflow trigger (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/workflows/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, triggerType: 'lead_captured', leadId: id, data: { source, campaign } }),
    }).catch(e => console.error('Workflow trigger failed (non-fatal):', e))

    // Sprint 17C (audit P1 #7): fire lead_added_to_segment workflow
    // triggers for every persisted segment this new lead matches.
    void fireSegmentTriggersForNewLead({
      workspaceId,
      leadId: id,
      contactEmail: email ?? null,
    })

    // Log lead_created activity
    fetch(`${appUrl}/api/leads-captured/${id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, type: 'lead_created', title: `Lead captured from ${source || 'manual'}`, description: campaign ? `Campaign: ${campaign}` : null }),
    }).catch(() => {})

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes, score } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const wsId = await workspaceForLead(id)
    if (!wsId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, wsId)
    if (denied) return denied
    await sql`UPDATE leads_captured SET status = ${status}, notes = ${notes || null}, score = ${score || 0} WHERE id = ${id} AND workspace_id = ${wsId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const wsId = await workspaceForLead(id)
  if (!wsId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const denied = assertWorkspaceOwnership(req, wsId)
  if (denied) return denied
  await sql`DELETE FROM leads_captured WHERE id = ${id} AND workspace_id = ${wsId}`
  return NextResponse.json({ ok: true })
}
