/**
 * /api/admin/workspaces-list
 *   GET   — paginated workspace list (does NOT conflict with existing /api/admin/workspaces)
 *   PATCH — workspace actions (suspend / unsuspend / force_reonboard)
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'
import { recordAdminAction } from '@/lib/adminAudit'

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v); if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    const limit = clampInt(url.searchParams.get('limit'), 50, 1, 200)
    const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000)
    const like = `%${q}%`

    const [rows, totalRow] = await Promise.all([
      q
        ? sql`SELECT w.id, w.name, w.owner_email, w.status, w.created_at, w.onboarding_completed_at,
                     (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.workspace_id = w.id LIMIT 1) as plan,
                     (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id) as members,
                     (SELECT MAX(ar.created_at) FROM agent_runs ar WHERE ar.workspace_id = w.id) as last_activity
              FROM workspaces w
              WHERE LOWER(w.name) LIKE ${like} OR LOWER(w.owner_email) LIKE ${like}
              ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT w.id, w.name, w.owner_email, w.status, w.created_at, w.onboarding_completed_at,
                     (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.workspace_id = w.id LIMIT 1) as plan,
                     (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id) as members,
                     (SELECT MAX(ar.created_at) FROM agent_runs ar WHERE ar.workspace_id = w.id) as last_activity
              FROM workspaces w
              ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      q
        ? sql`SELECT COUNT(*)::int as c FROM workspaces WHERE LOWER(name) LIKE ${like} OR LOWER(owner_email) LIKE ${like}`
        : sql`SELECT COUNT(*)::int as c FROM workspaces`,
    ])

    return NextResponse.json({
      workspaces: rows.rows,
      total: Number((totalRow.rows[0] as { c?: number })?.c || 0),
      limit, offset,
    })
  } catch (err) {
    console.error('[admin/workspaces-list GET] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json() as { id?: string; action?: string }
    const id = (body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Missing workspace id' }, { status: 400 })

    if (body.action === 'suspend') {
      await sql`UPDATE workspaces SET status = 'suspended' WHERE id = ${id}`
      await recordAdminAction(req, { action: 'workspace.suspend', resourceType: 'workspace', resourceId: id })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'unsuspend') {
      await sql`UPDATE workspaces SET status = 'active' WHERE id = ${id}`
      await recordAdminAction(req, { action: 'workspace.unsuspend', resourceType: 'workspace', resourceId: id })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'force_reonboard') {
      await sql`UPDATE workspaces SET onboarding_completed_at = NULL WHERE id = ${id}`
      await recordAdminAction(req, { action: 'workspace.force_reonboard', resourceType: 'workspace', resourceId: id })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/workspaces-list PATCH] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
