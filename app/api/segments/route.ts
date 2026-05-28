/**
 * /api/segments
 *
 * Sprint 15C (P2 #18) — persisted CRM segments.
 *
 * Previously /dashboard/leads-crm computed segments client-side over the live
 * leads_captured rows, which meant segments couldn't be shared, named, or
 * wired into workflow triggers. This endpoint persists named segments with a
 * declarative rule (the same shape the CRM page already uses for filters).
 *
 *   GET    ?workspaceId=…             → list segments
 *   POST   { workspaceId, name, description?, rule } → create
 *   PATCH  { id, workspaceId, ...updates }            → rename / edit rule
 *   DELETE ?id=…&workspaceId=…
 *
 * Rule shape (validated softly — the CRM page is the source of truth):
 *   {
 *     statuses?:      string[]        // new, contacted, hot, lost, ...
 *     sources?:       string[]
 *     campaignLike?:  string
 *     minScore?:      number
 *     maxScore?:      number
 *     rfm?:           { tier?: string[] }
 *     createdSince?:  string  // ISO date
 *   }
 *
 * Auth: workspace ownership required on every method.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface SegmentRule {
  statuses?: string[]
  sources?: string[]
  campaignLike?: string
  minScore?: number
  maxScore?: number
  rfm?: { tier?: string[] }
  createdSince?: string
}

/** Soft validator — drops keys we don't recognise so callers can't sneak
 *  arbitrary SQL through. The CRM page is the source of truth for which
 *  rule keys are honoured. */
function normaliseRule(raw: unknown): SegmentRule {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: SegmentRule = {}
  if (Array.isArray(r.statuses)) out.statuses = r.statuses.filter(x => typeof x === 'string') as string[]
  if (Array.isArray(r.sources)) out.sources = r.sources.filter(x => typeof x === 'string') as string[]
  if (typeof r.campaignLike === 'string') out.campaignLike = r.campaignLike.slice(0, 200)
  if (typeof r.minScore === 'number') out.minScore = r.minScore
  if (typeof r.maxScore === 'number') out.maxScore = r.maxScore
  if (typeof r.createdSince === 'string') out.createdSince = r.createdSince
  if (r.rfm && typeof r.rfm === 'object') {
    const rfm = r.rfm as Record<string, unknown>
    if (Array.isArray(rfm.tier)) out.rfm = { tier: rfm.tier.filter(x => typeof x === 'string') as string[] }
  }
  return out
}

/** Approximate member count given a rule. Best-effort — we don't materialise
 *  a join table; the CRM page computes the live members each render. */
async function countMembers(workspaceId: string, rule: SegmentRule): Promise<number> {
  try {
    // Use a single big WHERE built dynamically — drift-safe because all
    // input is validated above and only inserted as bound params.
    let rows
    if (rule.minScore !== undefined && rule.statuses?.length) {
      rows = await sql`
        SELECT COUNT(*) as c FROM leads_captured
        WHERE workspace_id = ${workspaceId}
          AND status = ANY(${rule.statuses})
          AND COALESCE(score, 0) >= ${rule.minScore}
      `
    } else if (rule.statuses?.length) {
      rows = await sql`
        SELECT COUNT(*) as c FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND status = ANY(${rule.statuses})
      `
    } else if (rule.minScore !== undefined) {
      rows = await sql`
        SELECT COUNT(*) as c FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND COALESCE(score, 0) >= ${rule.minScore}
      `
    } else {
      rows = await sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId}`
    }
    return Number((rows.rows[0] as { c?: number } | undefined)?.c || 0)
  } catch {
    return 0
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const r = await sql`
    SELECT id, name, description, rule_json, member_count, created_at, updated_at
    FROM lead_segments
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
  `
  const rows = (r.rows || []).map(raw => {
    const row = raw as Record<string, unknown>
    if (typeof row.rule_json === 'string') {
      try { row.rule = JSON.parse(row.rule_json) } catch { row.rule = {} }
    } else {
      row.rule = row.rule_json || {}
    }
    delete row.rule_json
    return row
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; name?: string; description?: string; rule?: unknown }
    if (!body.workspaceId || !body.name?.trim()) {
      return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied

    const rule = normaliseRule(body.rule)
    const id = newId()
    const members = await countMembers(body.workspaceId, rule)
    await sql`
      INSERT INTO lead_segments (id, workspace_id, name, description, rule_json, member_count)
      VALUES (${id}, ${body.workspaceId}, ${body.name.trim()}, ${body.description || null}, ${JSON.stringify(rule)}, ${members})
    `
    return NextResponse.json({ ok: true, id, memberCount: members })
  } catch (err) {
    console.error('[/api/segments POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; workspaceId?: string; name?: string; description?: string; rule?: unknown }
    if (!body.id || !body.workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied

    const owner = await sql`SELECT workspace_id FROM lead_segments WHERE id = ${body.id} LIMIT 1`
    const o = owner.rows[0] as { workspace_id?: string } | undefined
    if (!o) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
    if (o.workspace_id !== body.workspaceId) return NextResponse.json({ error: 'Wrong workspace' }, { status: 403 })

    const ruleJson = body.rule !== undefined ? JSON.stringify(normaliseRule(body.rule)) : null
    const newMembers = body.rule !== undefined ? await countMembers(body.workspaceId, normaliseRule(body.rule)) : null
    const now = new Date().toISOString()
    await sql`
      UPDATE lead_segments SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        rule_json = COALESCE(${ruleJson}, rule_json),
        member_count = COALESCE(${newMembers}, member_count),
        updated_at = ${now}
      WHERE id = ${body.id} AND workspace_id = ${body.workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/segments PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  await sql`DELETE FROM lead_segments WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
