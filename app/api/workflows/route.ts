/**
 * /api/workflows — Workflow CRUD
 * GET  ?workspaceId=
 * POST { workspaceId, name, description, triggerType, triggerConfig, nodes }
 * PATCH { id, status?, name?, nodes?, description?, triggerConfig? }
 * DELETE ?id=
 *
 * Sprint 8A — added workspace ownership guards.
 * PATCH and DELETE accept an id only; we look up the workflow's workspace
 * before asserting against the session, then include workspace_id in the
 * UPDATE/DELETE WHERE clauses as defense-in-depth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

async function workspaceForWorkflow(id: string): Promise<string | null> {
  const r = await sql`SELECT workspace_id FROM workflows WHERE id = ${id} LIMIT 1`
  return (r.rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT w.*,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id = w.id) as total_runs,
      (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id = w.id AND r.status = 'completed') as successful_runs
    FROM workflows w
    WHERE w.workspace_id = ${workspaceId}
    ORDER BY w.created_at DESC
  `
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      name: string
      description?: string
      triggerType: string
      triggerConfig?: Record<string, unknown>
      nodes?: unknown[]
      status?: string
    }
    const { workspaceId, name, description, triggerType, triggerConfig, nodes, status } = body
    if (!workspaceId || !name || !triggerType) {
      return NextResponse.json({ error: 'workspaceId, name, triggerType required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO workflows (id, workspace_id, name, description, trigger_type, trigger_config, nodes, status, run_count, created_at, updated_at)
      VALUES (${id}, ${workspaceId}, ${name}, ${description || null}, ${triggerType}, ${JSON.stringify(triggerConfig || {})}, ${JSON.stringify(nodes || [])}, ${status || 'draft'}, 0, ${now}, ${now})
    `
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string
      status?: string
      name?: string
      description?: string
      nodes?: unknown[]
      triggerConfig?: Record<string, unknown>
    }
    const { id, status, name, description, nodes, triggerConfig } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const wsId = await workspaceForWorkflow(id)
    if (!wsId) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, wsId)
    if (denied) return denied

    const now = new Date().toISOString()
    await sql`
      UPDATE workflows
      SET status = COALESCE(${status ?? null}, status),
          name = COALESCE(${name ?? null}, name),
          description = COALESCE(${description ?? null}, description),
          nodes = COALESCE(${nodes ? JSON.stringify(nodes) : null}, nodes),
          trigger_config = COALESCE(${triggerConfig ? JSON.stringify(triggerConfig) : null}, trigger_config),
          updated_at = ${now}
      WHERE id = ${id} AND workspace_id = ${wsId}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const wsId = await workspaceForWorkflow(id)
  if (!wsId) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  const denied = assertWorkspaceOwnership(req, wsId)
  if (denied) return denied
  await sql`DELETE FROM workflow_pending_steps WHERE workflow_id = ${id} AND workspace_id = ${wsId}`
  await sql`DELETE FROM workflow_runs WHERE workflow_id = ${id} AND workspace_id = ${wsId}`
  await sql`DELETE FROM workflows WHERE id = ${id} AND workspace_id = ${wsId}`
  return NextResponse.json({ ok: true })
}
