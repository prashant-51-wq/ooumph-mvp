/**
 * GET /api/admin/overview
 * Aggregated stats for the Admin Overview page.
 * Gated by assertSuperAdmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertSuperAdmin } from '@/lib/guards'

interface CountRow { c?: number | string }
interface PlanRow { name?: string; price_monthly?: number; count?: number | string }

function n(v: unknown): number { return Number(v ?? 0) || 0 }

export async function GET(req: NextRequest) {
  const denied = await assertSuperAdmin(req)
  if (denied) return denied

  try {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    const [
      usersC, wsC, activeSubs, mrrRows,
      failedAgents24h, failedPub24h,
      recentUsers, recentWs,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int as c FROM users`,
      sql`SELECT COUNT(*)::int as c FROM workspaces`,
      sql`SELECT COUNT(*)::int as c FROM subscriptions WHERE status = 'active'`,
      sql`SELECT p.name, p.price_monthly, COUNT(s.id)::int as count
          FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'active' GROUP BY p.name, p.price_monthly`,
      sql`SELECT COUNT(*)::int as c FROM agent_runs WHERE status = 'failed' AND created_at >= ${dayAgo}`,
      sql`SELECT COUNT(*)::int as c FROM publish_log WHERE status = 'failed' AND published_at >= ${dayAgo}`,
      sql`SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 10`,
      sql`SELECT id, name, owner_email, status, created_at FROM workspaces ORDER BY created_at DESC LIMIT 10`,
    ])

    // Compute MRR in cents
    let mrr = 0
    for (const row of mrrRows.rows as PlanRow[]) {
      mrr += n(row.price_monthly) * n(row.count)
    }

    // Daily signup sparkline (last 14d)
    const signupRows = await sql`
      SELECT DATE(created_at) as d, COUNT(*)::int as c FROM users
      WHERE created_at >= ${new Date(now.getTime() - 14 * 86_400_000).toISOString()}
      GROUP BY DATE(created_at) ORDER BY d ASC
    `

    return NextResponse.json({
      stats: {
        totalUsers: n((usersC.rows[0] as CountRow)?.c),
        totalWorkspaces: n((wsC.rows[0] as CountRow)?.c),
        activeSubscriptions: n((activeSubs.rows[0] as CountRow)?.c),
        mrrCents: mrr,
        failedAgents24h: n((failedAgents24h.rows[0] as CountRow)?.c),
        failedPublishes24h: n((failedPub24h.rows[0] as CountRow)?.c),
      },
      recentUsers: recentUsers.rows,
      recentWorkspaces: recentWs.rows,
      signupSparkline: signupRows.rows,
    })
  } catch (err) {
    console.error('[admin/overview] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
