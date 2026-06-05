/**
 * /api/projects/[id] — single-project operations (Sprint 2 Commit 2)
 *
 *   GET    ?workspaceId=…                       → fetch one project
 *   PATCH  { workspaceId, name?, status? }       → rename / status change
 *   DELETE ?workspaceId=…                        → soft delete (status='archived')
 *
 * The DELETE is intentionally soft — flips status to 'archived' instead of
 * removing the row — so historical references survive and the action can
 * be undone via a PATCH back to 'active'. If we ever need hard delete
 * (e.g. GDPR purge) it should be a separate admin-gated endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

const NAME_MAX_LENGTH = 255

interface ProjectRow {
  id: string
  workspace_id: string
  name: string
  status: string
  created_at: string
  updated_at: string | null
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const r = await sql`
    SELECT id, workspace_id, name, status, created_at, updated_at
    FROM workspace_projects
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const row = r.rows[0] as unknown as ProjectRow | undefined
  if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json(row)
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = await req.json() as { workspaceId?: string; name?: string; status?: string }
    const { workspaceId } = body

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Validate the optional fields we accept.
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      if (body.name.length > NAME_MAX_LENGTH) {
        return NextResponse.json(
          { error: `name must be <= ${NAME_MAX_LENGTH} characters` },
          { status: 400 },
        )
      }
    }

    const existing = await sql`
      SELECT id FROM workspace_projects
      WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    if (!existing.rows[0]) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Open status vocabulary — accept any reasonable token, capped to the
    // VARCHAR(20) column width.
    const nextStatus = body.status?.trim() ? body.status.trim().slice(0, 20) : null
    const nextName = body.name?.trim() ?? null

    await sql`
      UPDATE workspace_projects SET
        name = COALESCE(${nextName}, name),
        status = COALESCE(${nextStatus}, status),
        updated_at = ${new Date().toISOString()}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `

    const r = await sql`
      SELECT id, workspace_id, name, status, created_at, updated_at
      FROM workspace_projects
      WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    return NextResponse.json(r.rows[0])
  } catch (err) {
    console.error('[/api/projects/[id] PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`
    SELECT id FROM workspace_projects
    WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
  `
  if (!existing.rows[0]) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Soft delete — preserves audit trail and supports undo via PATCH.
  await sql`
    UPDATE workspace_projects
    SET status = 'archived', updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true, archived: true })
}
