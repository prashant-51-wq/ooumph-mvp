/**
 * /api/admin/users
 *   GET    — paginated + searchable list of all users
 *   PATCH  — toggle is_admin or suspended on a single user
 *   DELETE — bulk delete (by ids array)
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'
import { recordAdminAction } from '@/lib/adminAudit'

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
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
        ? sql`SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
                     COALESCE(u.suspended, 0) as suspended,
                     (SELECT COUNT(*)::int FROM workspaces w WHERE w.user_id = u.id) as workspace_count,
                     (SELECT MAX(le.created_at) FROM login_events le WHERE le.user_id = u.id AND le.success = 1) as last_login
              FROM users u
              WHERE LOWER(u.email) LIKE ${like} OR LOWER(u.name) LIKE ${like}
              ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
                     COALESCE(u.suspended, 0) as suspended,
                     (SELECT COUNT(*)::int FROM workspaces w WHERE w.user_id = u.id) as workspace_count,
                     (SELECT MAX(le.created_at) FROM login_events le WHERE le.user_id = u.id AND le.success = 1) as last_login
              FROM users u
              ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      q
        ? sql`SELECT COUNT(*)::int as c FROM users WHERE LOWER(email) LIKE ${like} OR LOWER(name) LIKE ${like}`
        : sql`SELECT COUNT(*)::int as c FROM users`,
    ])

    return NextResponse.json({
      users: rows.rows,
      total: Number((totalRow.rows[0] as { c?: number })?.c || 0),
      limit, offset,
    })
  } catch (err) {
    console.error('[admin/users GET] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json() as { id?: string; action?: string; value?: number | boolean }
    const id = (body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
    const action = body.action

    if (action === 'toggle_admin') {
      const current = await sql`SELECT is_admin FROM users WHERE id = ${id} LIMIT 1`
      const cur = Number((current.rows[0] as { is_admin?: number } | undefined)?.is_admin || 0)
      const next = cur === 1 ? 0 : 1
      await sql`UPDATE users SET is_admin = ${next} WHERE id = ${id}`
      await recordAdminAction(req, { action: 'user.toggle_admin', resourceType: 'user', resourceId: id, details: { newValue: next } })
      return NextResponse.json({ ok: true, is_admin: next })
    }

    if (action === 'toggle_suspend') {
      const current = await sql`SELECT COALESCE(suspended, 0) as suspended FROM users WHERE id = ${id} LIMIT 1`
      const cur = Number((current.rows[0] as { suspended?: number } | undefined)?.suspended || 0)
      const next = cur === 1 ? 0 : 1
      await sql`UPDATE users SET suspended = ${next} WHERE id = ${id}`
      await recordAdminAction(req, { action: 'user.toggle_suspend', resourceType: 'user', resourceId: id, details: { newValue: next } })
      return NextResponse.json({ ok: true, suspended: next })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/users PATCH] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json() as { ids?: string[] }
    const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string' && x.length > 0) : []
    if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

    let deleted = 0
    for (const id of ids) {
      try {
        await sql`DELETE FROM users WHERE id = ${id}`
        deleted++
      } catch (err) {
        console.error('[admin/users DELETE] failed id:', id, err)
      }
    }
    await recordAdminAction(req, { action: 'user.bulk_delete', resourceType: 'user', details: { count: deleted, ids } })
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[admin/users DELETE] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
