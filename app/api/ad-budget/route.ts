/**
 * /api/ad-budget
 *
 * Read-only budget snapshot for a workspace:
 *   - workspace.hard_max_daily_spend (cents)
 *   - workspace.alert_threshold_budget (cents)
 *   - currentActiveSpend = SUM(daily_budget) WHERE status='active'
 *   - currentDeployingSpend = SUM(daily_budget) WHERE status='deploying'
 *   - perCampaign breakdown (active + deploying rows only)
 *
 * Powers the "Global Budget Meter" component on /dashboard/ads.
 *
 *   GET ?workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const wsRes = await sql`
    SELECT hard_max_daily_spend, alert_threshold_budget
    FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `
  const ws = wsRes.rows[0] as { hard_max_daily_spend?: number | string; alert_threshold_budget?: number | string } | undefined
  const hardCap = Number(ws?.hard_max_daily_spend ?? 50_000)
  const alertThreshold = Number(ws?.alert_threshold_budget ?? 25_000)

  const activeRes = await sql`
    SELECT id, name, platform, daily_budget, status
    FROM ad_campaigns
    WHERE workspace_id = ${workspaceId}
      AND status IN ('active', 'deploying')
    ORDER BY status DESC, daily_budget DESC
  `
  const rows = activeRes.rows as unknown as Array<{
    id: string
    name: string
    platform: string
    daily_budget: number | string
    status: string
  }>

  let currentActiveSpend = 0
  let currentDeployingSpend = 0
  for (const r of rows) {
    const b = Number(r.daily_budget || 0)
    if (r.status === 'active') currentActiveSpend += b
    else if (r.status === 'deploying') currentDeployingSpend += b
  }

  const totalCommitted = currentActiveSpend + currentDeployingSpend
  const remainingHeadroom = Math.max(0, hardCap - totalCommitted)
  const crossedAlert = totalCommitted >= alertThreshold
  const crossedHardCap = totalCommitted > hardCap

  return NextResponse.json({
    workspaceId,
    hardCap,
    alertThreshold,
    currentActiveSpend,
    currentDeployingSpend,
    totalCommitted,
    remainingHeadroom,
    crossedAlertThreshold: crossedAlert,
    crossedHardCap,
    activeCampaigns: rows.map(r => ({
      id: r.id, name: r.name, platform: r.platform,
      daily_budget: Number(r.daily_budget || 0), status: r.status,
    })),
  })
}
