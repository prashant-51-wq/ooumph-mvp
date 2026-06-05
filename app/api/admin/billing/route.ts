/**
 * GET /api/admin/billing
 * Billing overview — MRR, ARR, sub breakdown by plan, recent transactions.
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

function n(v: unknown): number { return Number(v ?? 0) || 0 }

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const [planRows, statusRows, failedSubs, txns] = await Promise.all([
      sql`SELECT p.name, p.slug, p.price_monthly, COUNT(s.id)::int as active_count
          FROM plans p LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
          GROUP BY p.id, p.name, p.slug, p.price_monthly ORDER BY p.sort_order ASC`,
      sql`SELECT status, COUNT(*)::int as c FROM subscriptions GROUP BY status`,
      sql`SELECT s.id, s.workspace_id, s.status, s.current_period_end, p.name as plan_name, w.owner_email
          FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          LEFT JOIN workspaces w ON w.id = s.workspace_id
          WHERE s.status IN ('past_due', 'unpaid', 'incomplete', 'canceled')
          ORDER BY s.updated_at DESC LIMIT 30`,
      sql`SELECT id, vendor_workspace_id, gross_amount, commission_amount, description, created_at
          FROM commission_ledger ORDER BY created_at DESC LIMIT 25`,
    ])

    let mrrCents = 0
    for (const r of planRows.rows as Array<{ price_monthly?: number; active_count?: number }>) {
      mrrCents += n(r.price_monthly) * n(r.active_count)
    }
    const arrCents = mrrCents * 12

    const statusBreakdown: Record<string, number> = {}
    for (const r of statusRows.rows as Array<{ status?: string; c?: number }>) {
      if (r.status) statusBreakdown[r.status] = n(r.c)
    }

    return NextResponse.json({
      mrrCents,
      arrCents,
      plans: planRows.rows,
      statusBreakdown,
      failedSubscriptions: failedSubs.rows,
      recentTransactions: txns.rows,
    })
  } catch (err) {
    console.error('[admin/billing] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
