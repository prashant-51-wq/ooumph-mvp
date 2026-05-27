/**
 * /api/email-lists/[id]/members
 *
 * Manage which subscribers belong to a list. Subscribers are global to the
 * workspace; lists are addressable cohorts. A subscriber can belong to many
 * lists, hence the email_list_members junction.
 *
 *   GET  ?workspaceId=…
 *     → JOINed list of subscribers in this list with their membership status
 *
 *   POST { workspaceId, subscriberIds?: string[], emails?: string[] }
 *     → Bulk add. Accepts either subscriber_ids (already in our DB) or raw
 *       emails (auto-creates the subscriber if missing, then attaches).
 *
 *   DELETE ?workspaceId=…&subscriberId=…
 *     → Remove a single member (soft — sets status='unsubscribed')
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id: listId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Verify list ownership first
  const listCheck = await sql`SELECT id FROM email_lists WHERE id = ${listId} AND workspace_id = ${workspaceId} LIMIT 1`
  if (!listCheck.rows[0]) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const result = await sql`
    SELECT
      s.id, s.email, s.first_name, s.last_name, s.name,
      s.status AS subscriber_status,
      m.status AS membership_status,
      m.added_at, m.unsubscribed_at
    FROM email_list_members m
    JOIN email_subscribers s ON s.id = m.subscriber_id
    WHERE m.workspace_id = ${workspaceId} AND m.list_id = ${listId}
    ORDER BY m.added_at DESC
    LIMIT 1000
  `
  return NextResponse.json(result.rows)
}

// ── POST (bulk add) ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id: listId } = await ctx.params
    const body = await req.json() as {
      workspaceId?: string
      subscriberIds?: string[]
      emails?: string[]
      source?: string
    }
    const { workspaceId, subscriberIds = [], emails = [], source } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (subscriberIds.length === 0 && emails.length === 0) {
      return NextResponse.json({ error: 'subscriberIds or emails required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify list ownership
    const listCheck = await sql`SELECT id FROM email_lists WHERE id = ${listId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!listCheck.rows[0]) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Step 1: resolve raw emails → subscriber rows (auto-create missing ones).
    const resolvedIds = new Set<string>(subscriberIds)
    let createdSubscribers = 0
    for (const rawEmail of emails) {
      const email = String(rawEmail).trim().toLowerCase()
      if (!email || !email.includes('@')) continue
      const existing = await sql`SELECT id FROM email_subscribers WHERE workspace_id = ${workspaceId} AND email = ${email} LIMIT 1`
      const existingId = (existing.rows[0] as { id?: string } | undefined)?.id
      if (existingId) {
        resolvedIds.add(existingId)
        continue
      }
      const newSubId = newId()
      await sql`
        INSERT INTO email_subscribers (id, workspace_id, email, status, source)
        VALUES (${newSubId}, ${workspaceId}, ${email}, 'subscribed', ${source || 'manual_import'})
      `
      resolvedIds.add(newSubId)
      createdSubscribers++
    }

    // Step 2: insert membership rows (idempotent via the unique index).
    let added = 0
    let alreadyMember = 0
    for (const subId of resolvedIds) {
      // Confirm subscriber belongs to workspace
      const owns = await sql`SELECT id FROM email_subscribers WHERE id = ${subId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (!owns.rows[0]) continue

      const existingM = await sql`SELECT id, status FROM email_list_members WHERE list_id = ${listId} AND subscriber_id = ${subId} LIMIT 1`
      const m = existingM.rows[0] as { id?: string; status?: string } | undefined
      if (m?.id) {
        // Resurrect previously-unsubscribed memberships
        if (m.status !== 'subscribed') {
          await sql`
            UPDATE email_list_members
            SET status = 'subscribed', unsubscribed_at = NULL, added_at = ${new Date().toISOString()}
            WHERE id = ${m.id}
          `
          added++
        } else {
          alreadyMember++
        }
        continue
      }

      await sql`
        INSERT INTO email_list_members (id, workspace_id, list_id, subscriber_id, status)
        VALUES (${newId()}, ${workspaceId}, ${listId}, ${subId}, 'subscribed')
      `
      added++
    }

    // Step 3: refresh denormalised list count.
    const countRes = await sql`
      SELECT COUNT(*) AS c FROM email_list_members
      WHERE list_id = ${listId} AND status = 'subscribed'
    `
    const live = Number((countRes.rows[0] as { c?: number | string } | undefined)?.c || 0)
    await sql`
      UPDATE email_lists SET subscriber_count = ${live}, updated_at = ${new Date().toISOString()}
      WHERE id = ${listId} AND workspace_id = ${workspaceId}
    `

    return NextResponse.json({
      ok: true,
      added,
      alreadyMember,
      createdSubscribers,
      total: live,
    })
  } catch (err) {
    console.error('[/api/email-lists/[id]/members POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { id: listId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const subscriberId = searchParams.get('subscriberId')

  if (!workspaceId || !subscriberId) {
    return NextResponse.json({ error: 'workspaceId and subscriberId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`
    UPDATE email_list_members
    SET status = 'unsubscribed', unsubscribed_at = ${new Date().toISOString()}
    WHERE workspace_id = ${workspaceId}
      AND list_id = ${listId}
      AND subscriber_id = ${subscriberId}
  `

  // Recompute denormalised count
  const countRes = await sql`
    SELECT COUNT(*) AS c FROM email_list_members
    WHERE list_id = ${listId} AND status = 'subscribed'
  `
  const live = Number((countRes.rows[0] as { c?: number | string } | undefined)?.c || 0)
  await sql`
    UPDATE email_lists SET subscriber_count = ${live}, updated_at = ${new Date().toISOString()}
    WHERE id = ${listId} AND workspace_id = ${workspaceId}
  `

  return NextResponse.json({ ok: true, remaining: live })
}
