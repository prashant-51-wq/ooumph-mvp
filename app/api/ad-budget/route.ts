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
import { notifyBudgetAlert } from '@/lib/notifications'

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

  // Sprint 18H: fire a budget_alert notification at most once per
  // workspace per UTC day when a threshold is crossed. Same-day dedup
  // is a single SELECT against the notifications table — no separate
  // state column, no race risk. Non-blocking: the dashboard caller
  // doesn't wait on the insert.
  if (crossedAlert || crossedHardCap) {
    const todayMidnightIso = new Date(
      Math.floor(Date.now() / 86_400_000) * 86_400_000,
    ).toISOString()
    sql`
      SELECT id FROM notifications
      WHERE workspace_id = ${workspaceId}
        AND type = 'budget_alert'
        AND created_at >= ${todayMidnightIso}
      LIMIT 1
    `.then(existing => {
      if (existing.rows[0]) return
      const pct = hardCap > 0 ? (totalCommitted / hardCap) * 100 : 0
      const scope: 'daily' | 'monthly' = 'daily'
      const campaignName = rows.length === 1
        ? rows[0].name
        : `${rows.length} active campaigns`
      return notifyBudgetAlert(workspaceId, campaignName, pct, scope)
    }).catch(err => console.error('[ad-budget] alert fire failed:', err))
  }

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
