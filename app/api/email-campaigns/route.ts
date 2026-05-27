/**
 * /api/email-campaigns
 *
 * CRUD for email campaigns. The send-dispatch path lives in
 * /api/email-campaigns/[id]/send because it has different safety semantics
 * (artifact-approval gate, BYOK key resolution, side-effect logging).
 *
 *   GET  ?workspaceId=…[&status=draft|scheduled|sending|sent|failed]
 *     → list campaigns for a workspace, newest first
 *
 *   POST { workspaceId, name, subject?, listId?, artifactId?, fromName?,
 *          fromEmail?, replyTo?, previewText?, contentJson?, scheduledFor? }
 *     → create a draft campaign. Returns { ok, id }.
 *
 *   PATCH { id, workspaceId, …updates }
 *     → mutate campaign metadata. Refuses to touch a campaign in 'sending'
 *       or 'sent' state. Status transitions can only set draft→scheduled
 *       or scheduled→draft from here; the send route owns sending→sent.
 *
 *   DELETE ?id=…&workspaceId=…
 *     → soft-delete by setting status='archived'. Sent campaigns stay queryable.
 *
 * Workspace ownership is enforced on every method.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface CampaignRow {
  id: string
  workspace_id: string
  name: string
  subject: string | null
  status: string
  artifact_id: string | null
  list_id: string | null
  scheduled_for: string | null
  from_name: string | null
  from_email: string | null
  reply_to: string | null
  preview_text: string | null
  provider: string | null
  provider_campaign_id: string | null
  recipient_count: number
  sent_count: number
  open_count: number
  click_count: number
  bounce_count: number
  unsubscribe_count: number
  failed_count: number
  error_message: string | null
  content_json: string | Record<string, unknown>
  sent_at: string | null
  created_at: string
  updated_at: string | null
  created_by: string | null
}

function parseContentJson(row: CampaignRow): CampaignRow {
  if (typeof row.content_json === 'string') {
    try { row.content_json = JSON.parse(row.content_json) } catch { /* keep raw */ }
  }
  return row
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = status
    ? await sql`
        SELECT * FROM email_campaigns
        WHERE workspace_id = ${workspaceId} AND status = ${status}
        ORDER BY created_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT * FROM email_campaigns
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT 200
      `

  const rows = (result.rows as unknown as CampaignRow[]).map(parseContentJson)
  return NextResponse.json(rows)
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      name?: string
      subject?: string
      listId?: string
      artifactId?: string
      fromName?: string
      fromEmail?: string
      replyTo?: string
      previewText?: string
      contentJson?: Record<string, unknown>
      scheduledFor?: string | null
      createdBy?: string
    }
    const {
      workspaceId, name, subject, listId, artifactId,
      fromName, fromEmail, replyTo, previewText,
      contentJson, scheduledFor, createdBy,
    } = body

    if (!workspaceId || !name) {
      return NextResponse.json({ error: 'workspaceId and name are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Validate list ownership if provided
    if (listId) {
      const listCheck = await sql`SELECT id FROM email_lists WHERE id = ${listId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!listCheck.rows[0]) {
        return NextResponse.json({ error: 'List not found in this workspace' }, { status: 404 })
      }
    }

    // Validate artifact ownership if provided (does not yet require approval —
    // approval is checked only on dispatch, so users can attach a draft artifact)
    if (artifactId) {
      const artCheck = await sql`SELECT id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!artCheck.rows[0]) {
        return NextResponse.json({ error: 'Artifact not found in this workspace' }, { status: 404 })
      }
    }

    const id = newId()
    const status = scheduledFor ? 'scheduled' : 'draft'
    const contentStr = JSON.stringify(contentJson || {})

    await sql`
      INSERT INTO email_campaigns (
        id, workspace_id, name, subject, status,
        artifact_id, list_id, scheduled_for,
        from_name, from_email, reply_to, preview_text,
        content_json, created_by
      ) VALUES (
        ${id}, ${workspaceId}, ${name}, ${subject || null}, ${status},
        ${artifactId || null}, ${listId || null}, ${scheduledFor || null},
        ${fromName || null}, ${fromEmail || null}, ${replyTo || null}, ${previewText || null},
        ${contentStr}, ${createdBy || null}
      )
    `

    return NextResponse.json({ ok: true, id, status })
  } catch (err) {
    console.error('[/api/email-campaigns POST]', err)
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
      subject?: string
      listId?: string | null
      artifactId?: string | null
      fromName?: string
      fromEmail?: string
      replyTo?: string
      previewText?: string
      contentJson?: Record<string, unknown>
      scheduledFor?: string | null
      status?: string
    }
    const { id, workspaceId, status } = body

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Refuse to mutate a campaign that's already in flight — sending/sent
    // states are owned exclusively by the send route. The user must clone
    // a sent campaign to re-use it.
    const existing = await sql`
      SELECT status FROM email_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
    `
    const current = existing.rows[0] as { status?: string } | undefined
    if (!current) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    if (current.status === 'sending' || current.status === 'sent') {
      return NextResponse.json(
        { error: `Cannot edit campaign in '${current.status}' state. Clone it instead.` },
        { status: 409 },
      )
    }
    // Whitelist of valid status transitions from this endpoint
    if (status && !['draft', 'scheduled', 'archived'].includes(status)) {
      return NextResponse.json(
        { error: `Status '${status}' cannot be set from this endpoint. Use /send for dispatch.` },
        { status: 422 },
      )
    }

    // Coalesce updates — only touch columns the caller explicitly provided.
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.subject !== undefined) updates.subject = body.subject
    if (body.listId !== undefined) updates.list_id = body.listId
    if (body.artifactId !== undefined) updates.artifact_id = body.artifactId
    if (body.fromName !== undefined) updates.from_name = body.fromName
    if (body.fromEmail !== undefined) updates.from_email = body.fromEmail
    if (body.replyTo !== undefined) updates.reply_to = body.replyTo
    if (body.previewText !== undefined) updates.preview_text = body.previewText
    if (body.contentJson !== undefined) updates.content_json = JSON.stringify(body.contentJson)
    if (body.scheduledFor !== undefined) updates.scheduled_for = body.scheduledFor
    if (status) updates.status = status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noChange: true })
    }

    // Build column-by-column COALESCE to avoid string-interpolation in SQL.
    // (Each column gets its own ${} placeholder.)
    const u = updates as {
      name?: string; subject?: string; list_id?: string | null
      artifact_id?: string | null; from_name?: string; from_email?: string
      reply_to?: string; preview_text?: string; content_json?: string
      scheduled_for?: string | null; status?: string
    }
    await sql`
      UPDATE email_campaigns SET
        name              = COALESCE(${u.name ?? null}, name),
        subject           = COALESCE(${u.subject ?? null}, subject),
        list_id           = COALESCE(${u.list_id ?? null}, list_id),
        artifact_id       = COALESCE(${u.artifact_id ?? null}, artifact_id),
        from_name         = COALESCE(${u.from_name ?? null}, from_name),
        from_email        = COALESCE(${u.from_email ?? null}, from_email),
        reply_to          = COALESCE(${u.reply_to ?? null}, reply_to),
        preview_text      = COALESCE(${u.preview_text ?? null}, preview_text),
        content_json      = COALESCE(${u.content_json ?? null}, content_json),
        scheduled_for     = COALESCE(${u.scheduled_for ?? null}, scheduled_for),
        status            = COALESCE(${u.status ?? null}, status),
        updated_at        = ${new Date().toISOString()}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/email-campaigns PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (soft) ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`SELECT status FROM email_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
  const row = existing.rows[0] as { status?: string } | undefined
  if (!row) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (row.status === 'sending') {
    return NextResponse.json({ error: 'Cannot archive a campaign currently sending' }, { status: 409 })
  }

  await sql`
    UPDATE email_campaigns
    SET status = 'archived', updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND workspace_id = ${workspaceId}
  `
  return NextResponse.json({ ok: true })
}
