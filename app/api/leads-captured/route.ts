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

  // Sprint 18C: pagination. Previously this endpoint returned up to 100
  // rows hard-coded; a workspace with 50k leads would still fetch the
  // first 100 fine, but the page contract was opaque. We now accept
  // ?limit= (default 50, max 200) and ?offset= (default 0). Offset-style
  // matches what the CRM page can already build from search params; a
  // cursor-by-id scheme would require composite ordering and the current
  // ORDER BY created_at DESC, id makes offset stable enough for the
  // dashboard's "load more" use-case.
  const rawLimit = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 50
  const rawOffset = Number(searchParams.get('offset') ?? '0')
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0

  const result = status && status !== 'all'
    ? await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND status = ${status} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`
    : await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`

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
    const body = await req.json() as {
      id?: string
      ids?: string[]
      status?: string
      notes?: string
      score?: number
      addTag?: string
    }

    // Sprint 18C: bulk PATCH. Wire shape `{ ids: string[], addTag?, status? }`
    // used by the CRM bulk-action bar. Single-row PATCH (`{ id, ... }`) is
    // unchanged so existing callers (slideover, kanban drop, CSV import)
    // keep working.
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids.filter(x => typeof x === 'string' && x.length > 0)
      if (ids.length === 0) return NextResponse.json({ error: 'no valid ids' }, { status: 400 })

      // Look up workspace for each lead and reject if any belongs to a
      // different workspace than the caller. The first lead's workspace
      // is the one we authorise against — all others must match.
      const firstWs = await workspaceForLead(ids[0])
      if (!firstWs) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      const denied = assertWorkspaceOwnership(req, firstWs)
      if (denied) return denied
      // Verify all ids belong to firstWs (single query is cheaper than N).
      let updated = 0
      for (const id of ids) {
        const ws = await workspaceForLead(id)
        if (ws !== firstWs) continue
        if (body.status) {
          await sql`UPDATE leads_captured SET status = ${body.status} WHERE id = ${id} AND workspace_id = ${firstWs}`
        }
        if (body.addTag && typeof body.addTag === 'string') {
          // Tags live inside custom_fields.tags as a JSON array. Read,
          // merge, write — no SQL JSON ops since we need to stay portable
          // across Postgres + SQLite.
          const tag = body.addTag.trim()
          if (tag) {
            const r = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${id} AND workspace_id = ${firstWs} LIMIT 1`
            const row = r.rows[0] as { custom_fields?: string | Record<string, unknown> | null } | undefined
            let cf: Record<string, unknown> = {}
            const raw = row?.custom_fields
            if (typeof raw === 'string') {
              try { cf = JSON.parse(raw) as Record<string, unknown> } catch { cf = {} }
            } else if (raw && typeof raw === 'object') {
              cf = raw as Record<string, unknown>
            }
            const existing = Array.isArray(cf.tags) ? cf.tags as string[] : []
            if (!existing.includes(tag)) existing.push(tag)
            cf.tags = existing
            await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(cf)} WHERE id = ${id} AND workspace_id = ${firstWs}`
          }
        }
        updated++
      }
      return NextResponse.json({ ok: true, updated })
    }

    const { id, status, notes, score } = body
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
  // Sprint 18C: bulk DELETE via JSON body `{ ids }`. Single-row delete via
  // ?id=… is preserved for the legacy slideover / row trash icon.
  const { searchParams } = new URL(req.url)
  const singleId = searchParams.get('id')

  if (!singleId) {
    // Try to read bulk ids from body. If neither id nor ids present, 400.
    let ids: string[] = []
    try {
      const body = await req.json() as { ids?: string[] }
      if (Array.isArray(body.ids)) ids = body.ids.filter(x => typeof x === 'string' && x.length > 0)
    } catch { /* no body — fall through to error */ }
    if (ids.length === 0) return NextResponse.json({ error: 'id or ids required' }, { status: 400 })

    const firstWs = await workspaceForLead(ids[0])
    if (!firstWs) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, firstWs)
    if (denied) return denied
    let deleted = 0
    for (const id of ids) {
      const ws = await workspaceForLead(id)
      if (ws !== firstWs) continue
      await sql`DELETE FROM leads_captured WHERE id = ${id} AND workspace_id = ${firstWs}`
      deleted++
    }
    return NextResponse.json({ ok: true, deleted })
  }

  const wsId = await workspaceForLead(singleId)
  if (!wsId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const denied = assertWorkspaceOwnership(req, wsId)
  if (denied) return denied
  await sql`DELETE FROM leads_captured WHERE id = ${singleId} AND workspace_id = ${wsId}`
  return NextResponse.json({ ok: true })
}
