/**
 * /api/pr-campaigns
 *
 * CRUD for press-release drafts. Status transitions to 'distributing' /
 * 'distributed' / 'failed' are owned EXCLUSIVELY by the distribution
 * worker at /api/pr-campaigns/[id]/distribute — this endpoint refuses to
 * flip those states itself.
 *
 *   GET    ?workspaceId=…[&status=draft|approved|distributed|…]
 *   POST   { workspaceId, title, bodyContent, artifactId? }
 *   PATCH  { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const PROTECTED_STATUSES = new Set(['distributing'])
const ALLOWED_PATCH_STATUSES = new Set(['draft', 'pending_review', 'approved', 'archived'])

interface PRCampaignRow {
  id: string
  workspace_id: string
  artifact_id: string | null
  title: string
  body_content: string
  status: string
  error_log: string | null
  created_at: string
  updated_at: string | null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = status
    ? await sql`
        SELECT * FROM pr_campaigns
        WHERE workspace_id = ${workspaceId} AND status = ${status}
        ORDER BY created_at DESC LIMIT 200
      `
    : await sql`
        SELECT * FROM pr_campaigns
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC LIMIT 200
      `
  return NextResponse.json(result.rows as unknown as PRCampaignRow[])
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      title?: string
      bodyContent?: string
      artifactId?: string | null
    }
    const { workspaceId, title, bodyContent, artifactId } = body
    if (!workspaceId || !title?.trim() || !bodyContent?.trim()) {
      return NextResponse.json({ error: 'workspaceId, title, and bodyContent are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify artifact ownership if linked
    if (artifactId) {
      const check = await sql`SELECT id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!check.rows[0]) {
        return NextResponse.json({ error: 'Artifact not found in this workspace' }, { status: 404 })
      }
    }

    const id = newId()
    await sql`
      INSERT INTO pr_campaigns (
        id, workspace_id, artifact_id, title, body_content, status, created_at, updated_at
      ) VALUES (
        ${id}, ${workspaceId}, ${artifactId || null},
        ${title.trim()}, ${bodyContent.trim()}, 'draft',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({ ok: true, id, status: 'draft' })
  } catch (err) {
    console.error('[/api/pr-campaigns POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string; workspaceId?: string
      title?: string; bodyContent?: string
      artifactId?: string | null
      status?: string
    }
    const { id, workspaceId, status } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT status FROM pr_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { status?: string } | undefined
    if (!row) return NextResponse.json({ error: 'PR campaign not found' }, { status: 404 })
    if (PROTECTED_STATUSES.has(row.status || '')) {
      return NextResponse.json(
        { error: `Cannot edit a campaign in '${row.status}' state. Wait for distribution to finish.` },
        { status: 409 },
      )
    }
    if (status && !ALLOWED_PATCH_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Status '${status}' cannot be set here. Use /distribute for activation.` },
        { status: 422 },
      )
    }

    await sql`
      UPDATE pr_campaigns SET
        title        = COALESCE(${body.title ?? null}, title),
        body_content = COALESCE(${body.bodyContent ?? null}, body_content),
        artifact_id  = COALESCE(${body.artifactId === undefined ? null : (body.artifactId || null)}, artifact_id),
        status       = COALESCE(${status ?? null}, status),
        updated_at   = ${new Date().toISOString()}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/pr-campaigns PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (archive) ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`SELECT status FROM pr_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
  const row = existing.rows[0] as { status?: string } | undefined
  if (!row) return NextResponse.json({ error: 'PR campaign not found' }, { status: 404 })
  if (PROTECTED_STATUSES.has(row.status || '')) {
    return NextResponse.json(
      { error: `Cannot archive a campaign in '${row.status}' state.` },
      { status: 409 },
    )
  }
  await sql`
    UPDATE pr_campaigns SET status = 'archived', updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true })
}
