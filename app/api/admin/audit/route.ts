/**
 * GET /api/admin/audit
 * Returns admin_audit_log + (optionally) approval_events, filterable by actor / action / date.
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

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
    const actor = (url.searchParams.get('actor') || '').trim().toLowerCase()
    const since = url.searchParams.get('since')
    const limit = clampInt(url.searchParams.get('limit'), 50, 1, 200)
    const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000)

    const like = `%${q}%`
    const actorLike = `%${actor}%`

    // Build query — we use COALESCE for the WHERE clauses to keep parameter count consistent.
    let rows: { rows: unknown[] }
    let totalRow: { rows: unknown[] }
    if (q || actor || since) {
      rows = await sql`
        SELECT id, actor_id, actor_email, action, resource_type, resource_id, details_json, ip_address, created_at
        FROM admin_audit_log
        WHERE (${q} = '' OR LOWER(action) LIKE ${like} OR LOWER(COALESCE(resource_id, '')) LIKE ${like})
          AND (${actor} = '' OR LOWER(COALESCE(actor_email, '')) LIKE ${actorLike} OR LOWER(actor_id) LIKE ${actorLike})
          AND (${since ?? ''} = '' OR created_at >= ${since ?? '1970-01-01'})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      totalRow = await sql`
        SELECT COUNT(*)::int as c FROM admin_audit_log
        WHERE (${q} = '' OR LOWER(action) LIKE ${like} OR LOWER(COALESCE(resource_id, '')) LIKE ${like})
          AND (${actor} = '' OR LOWER(COALESCE(actor_email, '')) LIKE ${actorLike} OR LOWER(actor_id) LIKE ${actorLike})
          AND (${since ?? ''} = '' OR created_at >= ${since ?? '1970-01-01'})
      `
    } else {
      rows = await sql`
        SELECT id, actor_id, actor_email, action, resource_type, resource_id, details_json, ip_address, created_at
        FROM admin_audit_log
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      totalRow = await sql`SELECT COUNT(*)::int as c FROM admin_audit_log`
    }

    return NextResponse.json({
      entries: rows.rows,
      total: Number((totalRow.rows[0] as { c?: number })?.c || 0),
      limit, offset,
    })
  } catch (err) {
    console.error('[admin/audit] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
