/**
 * /api/projects — Sprint 2 Commit 2
 *
 *   GET    ?workspaceId=…[&status=active]  → list workspace projects
 *   POST   { workspaceId, name }            → create project
 *
 * Replaces the `ooumph_projects_v1` localStorage stash on the CMO dashboard.
 * Backed by the `workspace_projects` table created in Sprint 2 Commit 1.
 *
 * Status vocabulary is OPEN by design (no CHECK constraint on the column)
 * so the product can evolve project states without a migration. Conventions
 * we recognize so far:
 *
 *   active    - default; included in the dashboard project list
 *   archived  - soft-deleted via DELETE on this resource
 *   completed - reserved for future "mark done" flow
 *
 * Update on a project edits `name` and/or `status`. Hard delete is not
 * exposed — DELETE flips status to 'archived' so the audit row survives.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface ProjectRow {
  id: string
  workspace_id: string
  name: string
  status: string
  created_at: string
  updated_at: string | null
}

// Names need a sane upper bound. Postgres column is VARCHAR(255); we enforce
// the same on the application boundary so a typo'd long string fails with a
// readable 400 instead of a 22001 string-too-long Postgres error.
const NAME_MAX_LENGTH = 255

// ─── GET (list) ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const statusFilter = searchParams.get('status')

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Single-status filter is the common UI need ("show only active"). For
  // the all-rows case we still default to excluding 'archived' rows so the
  // dashboard list stays useful — archived projects need an explicit
  // ?status=archived query.
  let rows
  if (statusFilter) {
    rows = await sql`
      SELECT id, workspace_id, name, status, created_at, updated_at
      FROM workspace_projects
      WHERE workspace_id = ${workspaceId} AND status = ${statusFilter}
      ORDER BY created_at DESC LIMIT 500
    `
  } else {
    rows = await sql`
      SELECT id, workspace_id, name, status, created_at, updated_at
      FROM workspace_projects
      WHERE workspace_id = ${workspaceId} AND status != 'archived'
      ORDER BY created_at DESC LIMIT 500
    `
  }
  return NextResponse.json(rows.rows as unknown as ProjectRow[])
}

// ─── POST (create) ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; name?: string; status?: string }
    const { workspaceId, name, status } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    if (name.length > NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `name must be <= ${NAME_MAX_LENGTH} characters` },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    const now = new Date().toISOString()
    // Open status vocabulary — accept whatever the caller passes, default 'active'.
    const initialStatus = (status?.trim() || 'active').slice(0, 20)

    await sql`
      INSERT INTO workspace_projects (id, workspace_id, name, status, created_at, updated_at)
      VALUES (${id}, ${workspaceId}, ${name.trim()}, ${initialStatus}, ${now}, ${now})
    `

    const r = await sql`
      SELECT id, workspace_id, name, status, created_at, updated_at
      FROM workspace_projects
      WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json(r.rows[0])
  } catch (err) {
    console.error('[/api/projects POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
