/**
 * GET /api/admin/agents
 * Agent monitoring — totals over 24h/7d/30d, slowest agents, recent failures, per-agent rates.
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
    const now = Date.now()
    const d1 = new Date(now - 24 * 3600_000).toISOString()
    const d7 = new Date(now - 7 * 86_400_000).toISOString()
    const d30 = new Date(now - 30 * 86_400_000).toISOString()

    const [c1, c7, c30, failures, slowest, perAgent] = await Promise.all([
      sql`SELECT COUNT(*)::int as c FROM agent_runs WHERE created_at >= ${d1}`,
      sql`SELECT COUNT(*)::int as c FROM agent_runs WHERE created_at >= ${d7}`,
      sql`SELECT COUNT(*)::int as c FROM agent_runs WHERE created_at >= ${d30}`,
      sql`SELECT id, workspace_id, agent_name, error_message, created_at, completed_at
          FROM agent_runs WHERE status = 'failed' AND created_at >= ${d7}
          ORDER BY created_at DESC LIMIT 25`,
      sql`SELECT agent_name,
                 AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::int as avg_ms,
                 COUNT(*)::int as runs
          FROM agent_runs
          WHERE status = 'completed' AND completed_at IS NOT NULL AND created_at >= ${d7}
          GROUP BY agent_name HAVING COUNT(*) > 0 ORDER BY avg_ms DESC LIMIT 10`,
      sql`SELECT agent_name,
                 COUNT(*)::int as total,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int as completed,
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int as failed
          FROM agent_runs WHERE created_at >= ${d30}
          GROUP BY agent_name ORDER BY total DESC LIMIT 30`,
    ])

    return NextResponse.json({
      totals: {
        day: n((c1.rows[0] as { c?: number })?.c),
        week: n((c7.rows[0] as { c?: number })?.c),
        month: n((c30.rows[0] as { c?: number })?.c),
      },
      recentFailures: failures.rows,
      slowest: slowest.rows,
      perAgent: perAgent.rows,
    })
  } catch (err) {
    console.error('[admin/agents] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
