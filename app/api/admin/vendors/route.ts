/**
 * GET  /api/admin/vendors  — list all vendors with commission + client stats
 * PATCH /api/admin/vendors — adjust commission rate, approve/suspend
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const result = await sql`
      SELECT
        w.id as workspace_id,
        w.name as workspace_name,
        w.owner_email,
        w.created_at,
        vp.stripe_connect_account_id,
        vp.stripe_connect_status,
        vp.commission_rate_override,
        vp.white_label_name,
        vp.is_approved,
        p.name as plan_name,
        p.slug as plan_slug,
        p.commission_rate as plan_commission_rate,
        s.status as subscription_status,
        s.current_period_end,
        COUNT(DISTINCT ca.id) as client_count,
        COALESCE(SUM(cl.gross_amount), 0) as total_gmv,
        COALESCE(SUM(cl.commission_amount), 0) as total_commission_earned
      FROM workspaces w
      LEFT JOIN vendor_profiles vp ON vp.workspace_id = w.id
      LEFT JOIN subscriptions s ON s.workspace_id = w.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN client_accounts ca ON ca.vendor_workspace_id = w.id AND ca.status = 'active'
      LEFT JOIN commission_ledger cl ON cl.vendor_workspace_id = w.id
      WHERE p.slug IN ('agency', 'agency_scale') OR vp.id IS NOT NULL
      GROUP BY w.id, w.name, w.owner_email, w.created_at,
               vp.stripe_connect_account_id, vp.stripe_connect_status,
               vp.commission_rate_override, vp.white_label_name, vp.is_approved,
               p.name, p.slug, p.commission_rate,
               s.status, s.current_period_end
      ORDER BY total_gmv DESC
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json() as {
      workspaceId: string
      commissionRateOverride?: number | null
      isApproved?: number
      action?: 'suspend' | 'activate'
    }
    const { workspaceId, commissionRateOverride, isApproved, action } = body

    const now = new Date().toISOString()
    const existing = await sql`SELECT id FROM vendor_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`

    if (existing.rows[0]) {
      await sql`
        UPDATE vendor_profiles SET
          commission_rate_override = COALESCE(${commissionRateOverride !== undefined ? commissionRateOverride : null}, commission_rate_override),
          is_approved = COALESCE(${isApproved ?? null}, is_approved),
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId}
      `
    }

    if (action === 'suspend') {
      await sql`UPDATE subscriptions SET status = 'paused' WHERE workspace_id = ${workspaceId}`
    } else if (action === 'activate') {
      await sql`UPDATE subscriptions SET status = 'active' WHERE workspace_id = ${workspaceId}`
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
