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

/** Allow-list of CRM stage values we'll inline into a SQL IN-list. Used by
 *  countMembers to stay safe against injection even though the sql template
 *  tag doesn't support array parameter expansion (= no Postgres ANY() on
 *  SQLite). Sprint 17C (audit P1 #8).
 *
 *  Keep in sync with the values used in /dashboard/leads-crm filters and
 *  the leads_captured.status column. */
const ALLOWED_STATUSES = new Set(['new', 'contacted', 'qualified', 'won', 'lost'])

/** Approximate member count given a rule. Best-effort — we don't materialise
 *  a join table; the CRM page computes the live members each render.
 *
 *  Sprint 17C (audit P1 #8): the previous version used `status = ANY(...)`,
 *  a Postgres-only operator. On SQLite that's a syntax error and the entire
 *  count silently returns 0. Replaced with a hand-built `IN ('a','b',...)`
 *  clause whose values are validated against ALLOWED_STATUSES — so we don't
 *  reintroduce injection. */
async function countMembers(workspaceId: string, rule: SegmentRule): Promise<number> {
  try {
    const safeStatuses = (rule.statuses || [])
      .filter(s => typeof s === 'string' && ALLOWED_STATUSES.has(s))
    // The sql template tag doesn't support spreading an array as a SQL
    // value list and we don't have an `unsafe()` escape hatch. Pull the
    // candidate rows by workspace, then filter the rest in-memory. Cardinality
    // per workspace is small enough that this stays fast — leads_captured is
    // paginated by the CRM page itself, and this helper runs at segment
    // create/edit time only (not per-render).
    //
    // Sprint 18C: previously only `minScore` and `statuses` were honored,
    // which silently returned the wrong member count for any segment that
    // used sources / maxScore / campaignLike / createdSince / rfm.tier.
    // Pull all needed columns and apply each rule field.
    const rows = await sql`
      SELECT status, source, campaign, score, created_at
      FROM leads_captured
      WHERE workspace_id = ${workspaceId}
    `
    const statusSet = safeStatuses.length ? new Set(safeStatuses) : null
    const sourceSet = (rule.sources && rule.sources.length)
      ? new Set(rule.sources.filter(s => typeof s === 'string'))
      : null
    const campaignLike = rule.campaignLike ? rule.campaignLike.toLowerCase() : null
    const createdSinceMs = rule.createdSince ? new Date(rule.createdSince).getTime() : null

    const data = rows.rows as Array<{
      status?: string
      source?: string
      campaign?: string
      score?: number
      created_at?: string
    }>

    return data.filter(r => {
      if (statusSet && !(r.status && statusSet.has(r.status))) return false
      if (sourceSet && !(r.source && sourceSet.has(r.source))) return false
      if (rule.minScore !== undefined && Number(r.score ?? 0) < rule.minScore) return false
      if (rule.maxScore !== undefined && Number(r.score ?? 0) > rule.maxScore) return false
      if (campaignLike && !String(r.campaign || '').toLowerCase().includes(campaignLike)) return false
      if (createdSinceMs !== null && Number.isFinite(createdSinceMs)) {
        const t = new Date(String(r.created_at || '')).getTime()
        if (!Number.isFinite(t) || t < createdSinceMs) return false
      }
      // Note: `rfm.tier` is computed client-side from R/F/M scores in the
      // CRM page (see leadToContact). We don't materialise RFM tiers in
      // leads_captured, so the count here doesn't apply rfm.tier — it is
      // documented as "approximate" at the top of this file. The CRM page
      // still applies the rfm filter at render time.
      return true
    }).length
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
