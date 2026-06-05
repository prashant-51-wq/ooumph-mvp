/**
 * GET  /api/agents/analytics/targets — fetch KPI targets for a workspace
 * POST /api/agents/analytics/targets — save/update KPI targets
 */
import { NextRequest, NextResponse } from 'next/server'
import { getKPITargets, saveKPITargets, DEFAULT_KPI_TARGETS } from '@/lib/agents/analytics'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json(DEFAULT_KPI_TARGETS)
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const targets = await getKPITargets(workspaceId)
  return NextResponse.json(targets)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, ...targets } = await req.json() as { workspaceId: string } & Record<string, number>
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const saved = await saveKPITargets(workspaceId, targets)
    return NextResponse.json({ ok: true, targets: saved })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
