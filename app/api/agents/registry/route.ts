/**
 * /api/agents/registry — bulk read of the agent lifecycle registry
 *
 * Sprint 2 Commit 3 — added so the Agents page can hydrate every agent's
 * current pause state in a single round-trip instead of N (one per
 * canonical slug). The page reads this on mount and after every PATCH to
 * /api/agents/[name]/status to keep its in-memory view in sync.
 *
 * Why a sub-route (.../registry) instead of the bare /api/agents:
 * The /api/agents/ directory is conventionally used as a namespace for
 * agent EXECUTION endpoints (e.g. POST /api/agents/cmo invokes the CMO
 * agent run). Putting a list at /api/agents would shadow that intent.
 * /api/agents/registry is unambiguous: "the lifecycle registry."
 *
 * Returns the raw row shape from the agents table — no JOIN with
 * agent_configs to keep this hot path narrow. The Agents page fetches
 * config lazily via /api/agents/[name]/config when the operator opens
 * the config modal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface AgentRow {
  id: string
  workspace_id: string
  name: string
  status: 'active' | 'paused' | 'error' | 'disabled'
  paused_at: string | null
  paused_by: string | null
  created_at: string
  updated_at: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const r = await sql`
    SELECT id, workspace_id, name, status, paused_at, paused_by, created_at, updated_at
    FROM agents
    WHERE workspace_id = ${workspaceId}
    ORDER BY name ASC
  `
  return NextResponse.json(r.rows as unknown as AgentRow[])
}
