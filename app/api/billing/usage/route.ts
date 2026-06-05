/**
 * GET /api/billing/usage?workspaceId=…
 *
 * Sprint 16E (audit P1 #10) — exposes `getAgentRunQuotaUsage` to the
 * dashboard. The helper existed in lib/quota.ts since Sprint 12C with a
 * rich `{used, limit, remaining, planName, periodStart, periodEnd,
 * percent, nearLimit}` payload, but had no UI consumer — the audit
 * called it a "dead export." This endpoint + the billing-page widget
 * gives users a real meter.
 *
 * Auth: workspace ownership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { getAgentRunQuotaUsage } from '@/lib/quota'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  try {
    const usage = await getAgentRunQuotaUsage(workspaceId)
    return NextResponse.json(usage)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
