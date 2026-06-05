/**
 * GET /api/admin/stats?adminSecret=
 * Returns platform-wide revenue and usage stats for the super admin dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const [
      workspacesResult,
      subscriptionsResult,
      commissionResult,
      vendorsResult,
      clientsResult,
      plansResult,
      recentCommissions,
    ] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM workspaces`,
      sql`SELECT s.status, p.name as plan_name, p.price_monthly, COUNT(*) as count FROM subscriptions s JOIN plans p ON p.id = s.plan_id GROUP BY s.status, p.name, p.price_monthly`,
      sql`SELECT SUM(commission_amount) as total_commission, SUM(gross_amount) as total_gmv, COUNT(*) as total_transactions FROM commission_ledger`,
      sql`SELECT COUNT(*) as total FROM vendor_profiles WHERE is_approved = 1`,
      sql`SELECT COUNT(*) as total FROM client_accounts WHERE status IN ('active', 'trial')`,
      sql`SELECT p.name, p.slug, p.price_monthly, COUNT(s.id) as subscriber_count FROM plans p LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active' GROUP BY p.id, p.name, p.slug, p.price_monthly ORDER BY p.sort_order`,
      sql`SELECT cl.*, vp.workspace_id as vendor_ws FROM commission_ledger cl LEFT JOIN vendor_profiles vp ON vp.workspace_id = cl.vendor_workspace_id ORDER BY cl.created_at DESC LIMIT 10`,
    ])

    // Calculate MRR from active subscriptions
    let mrr = 0
    for (const row of subscriptionsResult.rows) {
      if (row.status === 'active') {
        mrr += (Number(row.price_monthly) || 0) * (Number(row.count) || 0)
      }
    }

    // Commission this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const monthlyCommission = await sql`
      SELECT SUM(commission_amount) as total FROM commission_ledger
      WHERE created_at >= ${startOfMonth.toISOString()}
    `

    return NextResponse.json({
      platform: {
        totalWorkspaces: Number(workspacesResult.rows[0]?.total || 0),
        totalVendors: Number(vendorsResult.rows[0]?.total || 0),
        totalClients: Number(clientsResult.rows[0]?.total || 0),
      },
      revenue: {
        mrr: mrr, // cents
        mrrFormatted: `$${(mrr / 100).toFixed(0)}`,
        totalGmv: Number(commissionResult.rows[0]?.total_gmv || 0),
        totalCommissionEarned: Number(commissionResult.rows[0]?.total_commission || 0),
        totalTransactions: Number(commissionResult.rows[0]?.total_transactions || 0),
        commissionThisMonth: Number(monthlyCommission.rows[0]?.total || 0),
      },
      subscriptions: subscriptionsResult.rows,
      plans: plansResult.rows,
      recentCommissions: recentCommissions.rows,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
