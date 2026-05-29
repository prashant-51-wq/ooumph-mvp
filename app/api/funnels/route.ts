/**
 * /api/funnels
 *
 * Sprint 16F TASK 2 — parent CRUD for the `funnels` table introduced by
 * Sprint 16A. Funnels group funnel_steps (landing pages / forms) into a
 * single named journey with a goal and a publish toggle. This closes the
 * audit's "no narrative grouping of steps" finding (P0 #6).
 *
 *   GET    ?workspaceId=…   → list active funnels + a `steps_count` subselect
 *   POST   { workspaceId, name, goal? }
 *   PATCH  { id, workspaceId, name?, goal?, isActive? }   // publish/unpublish via isActive
 *   DELETE ?id=…&workspaceId=…                            // archives (soft-delete)
 *
 * Auth: workspace ownership required on every method. Archive is a soft
 * delete — we set archived_at instead of dropping the row, so downstream
 * analytics (form_submissions, funnel_steps) keep their foreign keys
 * intact.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface FunnelRow {
  id: string
  workspace_id: string
  name: string
  goal: string | null
  is_active: boolean | number
  archived_at: string | null
  created_at: string
  updated_at: string
  steps_count?: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Two queries — main rows + per-funnel step counts. Doing it in two
  // round-trips keeps the SQL portable across the SQLite test harness
  // and Postgres production (LEFT JOIN + GROUP BY in a single statement
  // surfaces inconsistent type coercions for `is_active` between the two).
  const main = await sql`
    SELECT id, workspace_id, name, goal, is_active, archived_at, created_at, updated_at
    FROM funnels
    WHERE workspace_id = ${workspaceId} AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT 200
  `
  const rows = ((main.rows || []) as unknown) as FunnelRow[]
  if (rows.length === 0) return NextResponse.json([])

  const counts = await sql`
    SELECT funnel_id, COUNT(*) as c
    FROM funnel_steps
    WHERE workspace_id = ${workspaceId} AND funnel_id IS NOT NULL
    GROUP BY funnel_id
  `
  const countByFunnel = new Map<string, number>()
  for (const row of (counts.rows || [])) {
    const r = row as { funnel_id?: string; c?: number | string }
    if (r.funnel_id) countByFunnel.set(String(r.funnel_id), Number(r.c || 0))
  }
  const out = rows.map(r => ({ ...r, steps_count: countByFunnel.get(r.id) || 0 }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; name?: string; goal?: string }
    if (!body.workspaceId || !body.name?.trim()) {
      return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied

    const id = newId()
    const goal = body.goal?.trim() || null
    // is_active defaults FALSE per the schema — a fresh funnel is a draft
    // until the user clicks publish. This matches the public-render gate
    // added by Sprint 16F TASK 4 in /api/f/[slug].
    await sql`
      INSERT INTO funnels (id, workspace_id, name, goal, is_active)
      VALUES (${id}, ${body.workspaceId}, ${body.name.trim()}, ${goal}, 0)
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/funnels POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string; workspaceId?: string
      name?: string; goal?: string | null; isActive?: boolean
    }
    if (!body.id || !body.workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied

    const owner = await sql`SELECT workspace_id FROM funnels WHERE id = ${body.id} LIMIT 1`
    const o = owner.rows[0] as { workspace_id?: string } | undefined
    if (!o) return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
    if (o.workspace_id !== body.workspaceId) {
      return NextResponse.json({ error: 'Wrong workspace' }, { status: 403 })
    }

    const newName = body.name?.trim() || null
    // Goal can be explicitly cleared to null — only treat undefined as "leave alone".
    const goalProvided = Object.prototype.hasOwnProperty.call(body, 'goal')
    const newGoal: string | null = goalProvided
      ? (typeof body.goal === 'string' ? body.goal.trim() || null : null)
      : null
    const newIsActive: number | null = typeof body.isActive === 'boolean' ? (body.isActive ? 1 : 0) : null
    const now = new Date().toISOString()

    await sql`
      UPDATE funnels SET
        name = COALESCE(${newName}, name),
        goal = CASE WHEN ${goalProvided ? 1 : 0} = 1 THEN ${newGoal} ELSE goal END,
        is_active = COALESCE(${newIsActive}, is_active),
        updated_at = ${now}
      WHERE id = ${body.id} AND workspace_id = ${body.workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/funnels PATCH]', err)
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

  // Soft archive — keeps funnel_steps.funnel_id references resolvable
  // (so old form submissions stay attributable in /dashboard/funnel).
  const now = new Date().toISOString()
  await sql`
    UPDATE funnels SET archived_at = ${now}, is_active = 0
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true, archived: true })
}
