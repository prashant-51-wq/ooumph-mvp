/**
 * /api/admin/approvals
 *   GET   — all pending approvals across all workspaces, with aging buckets
 *   PATCH — bulk approve / reject (action: 'approve' | 'reject', ids: [])
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin, getSessionUserId } from '@/lib/guards'
import { recordAdminAction } from '@/lib/adminAudit'

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const pendingRes = await sql`
      SELECT a.id, a.workspace_id, a.artifact_id, a.status, a.approver_email, a.notes, a.created_at,
             ar.title as artifact_title, ar.type as artifact_type, w.name as workspace_name
      FROM approvals a
      LEFT JOIN artifacts ar ON ar.id = a.artifact_id
      LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.status = 'pending'
      ORDER BY a.created_at ASC
      LIMIT 200
    `

    const now = Date.now()
    const buckets = { under1d: 0, d1to3: 0, d3to7: 0, over7d: 0 }
    for (const r of pendingRes.rows as Array<{ created_at?: string }>) {
      if (!r.created_at) continue
      const ageMs = now - new Date(r.created_at).getTime()
      const days = ageMs / 86_400_000
      if (days < 1) buckets.under1d++
      else if (days < 3) buckets.d1to3++
      else if (days < 7) buckets.d3to7++
      else buckets.over7d++
    }

    return NextResponse.json({
      pending: pendingRes.rows,
      buckets,
      total: pendingRes.rows.length,
    })
  } catch (err) {
    console.error('[admin/approvals GET] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json() as { ids?: string[]; action?: string; notes?: string }
    const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string') : []
    if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
    }
    const targetStatus = body.action === 'approve' ? 'approved' : 'rejected'
    const userId = getSessionUserId(req) || 'admin'

    let updated = 0
    for (const id of ids) {
      try {
        await sql`UPDATE approvals SET status = ${targetStatus}, updated_at = NOW(), notes = COALESCE(${body.notes ?? null}, notes) WHERE id = ${id}`
        // Mirror status to artifacts table (matches existing /api/approvals pattern).
        const r = await sql`SELECT artifact_id, workspace_id FROM approvals WHERE id = ${id} LIMIT 1`
        const row = r.rows[0] as { artifact_id?: string; workspace_id?: string } | undefined
        if (row?.artifact_id) {
          await sql`UPDATE artifacts SET status = ${targetStatus} WHERE id = ${row.artifact_id}`
        }
        // approval_events log if the table exists
        try {
          await sql`INSERT INTO approval_events (id, workspace_id, approval_id, artifact_id, actor_id, action, notes)
            VALUES (${'ae_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)}, ${row?.workspace_id ?? ''}, ${id}, ${row?.artifact_id ?? null}, ${userId}, ${body.action}, ${body.notes ?? null})`
        } catch { /* table may have different shape — non-fatal */ }
        updated++
      } catch (err) {
        console.error('[admin/approvals PATCH] failed id:', id, err)
      }
    }

    await recordAdminAction(req, {
      action: `approval.bulk_${body.action}`,
      resourceType: 'approval',
      details: { count: updated, ids },
    })

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    console.error('[admin/approvals PATCH] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
