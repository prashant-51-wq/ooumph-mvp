/**
 * /api/email-lists
 *
 * Address-book "lists" — groups of subscribers a campaign can target.
 *
 *   GET  ?workspaceId=…[&status=active|archived]
 *     → list-of-lists with denormalised subscriber_count
 *
 *   POST { workspaceId, name, description?, defaultFromName?, defaultFromEmail?,
 *          doubleOptIn? }
 *     → create. Returns { ok, id }.
 *
 *   PATCH { id, workspaceId, …updates }
 *     → mutate metadata. To add/remove members use /api/email-lists/[id]/members.
 *
 *   DELETE ?id=…&workspaceId=…
 *     → archive (soft). Existing campaigns referencing this list are unaffected.
 *
 * Workspace ownership is enforced on every method.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Recompute subscriber_count lazily on every read — denormalised count on
  // the list row may drift if members were inserted directly via DB.
  const result = status
    ? await sql`
        SELECT l.*,
          (
            SELECT COUNT(*) FROM email_list_members m
            WHERE m.list_id = l.id AND m.status = 'subscribed'
          ) AS live_subscriber_count
        FROM email_lists l
        WHERE l.workspace_id = ${workspaceId} AND l.status = ${status}
        ORDER BY l.created_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT l.*,
          (
            SELECT COUNT(*) FROM email_list_members m
            WHERE m.list_id = l.id AND m.status = 'subscribed'
          ) AS live_subscriber_count
        FROM email_lists l
        WHERE l.workspace_id = ${workspaceId}
        ORDER BY l.created_at DESC
        LIMIT 200
      `

  return NextResponse.json(result.rows)
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      name?: string
      description?: string
      defaultFromName?: string
      defaultFromEmail?: string
      doubleOptIn?: boolean
    }
    const {
      workspaceId, name, description,
      defaultFromName, defaultFromEmail, doubleOptIn,
    } = body

    if (!workspaceId || !name?.trim()) {
      return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    await sql`
      INSERT INTO email_lists (
        id, workspace_id, name, description,
        default_from_name, default_from_email, double_opt_in
      ) VALUES (
        ${id}, ${workspaceId}, ${name.trim()}, ${description || null},
        ${defaultFromName || null}, ${defaultFromEmail || null},
        ${doubleOptIn ? 1 : 0}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/email-lists POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      name?: string
      description?: string
      defaultFromName?: string
      defaultFromEmail?: string
      doubleOptIn?: boolean
      status?: string
    }
    const { id, workspaceId, status } = body

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    if (status && !['active', 'archived'].includes(status)) {
      return NextResponse.json({ error: `Status '${status}' not allowed` }, { status: 422 })
    }

    await sql`
      UPDATE email_lists SET
        name               = COALESCE(${body.name ?? null}, name),
        description        = COALESCE(${body.description ?? null}, description),
        default_from_name  = COALESCE(${body.defaultFromName ?? null}, default_from_name),
        default_from_email = COALESCE(${body.defaultFromEmail ?? null}, default_from_email),
        double_opt_in      = COALESCE(${body.doubleOptIn === undefined ? null : (body.doubleOptIn ? 1 : 0)}, double_opt_in),
        status             = COALESCE(${status ?? null}, status),
        updated_at         = ${new Date().toISOString()}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/email-lists PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (archive) ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`
    UPDATE email_lists
    SET status = 'archived', updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true })
}
