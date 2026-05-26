/**
 * /api/notifications
 *
 * Workspace-scoped notification feed for the bell/inbox dropdown.
 *
 * GET ?workspaceId=xxx
 *   → { items: Notification[], unreadCount: number }
 *
 *   Aggregates from:
 *     - notifications table (explicit notifications)
 *     - approvals table (pending → notification of type 'approval')
 *     - agent_runs (failed runs in last 24h → 'error')
 *     - publish_log (recent publishes → 'success')
 *
 * POST { workspaceId, type, title, body?, link?, severity? }
 *   → creates an explicit notification
 *
 * PATCH ?id=xxx { read: true }
 *   → marks a notification as read
 *
 * PATCH ?workspaceId=xxx { markAllRead: true }
 *   → marks all unread as read
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface Notification {
  id: string
  type: string
  title: string
  body?: string
  link?: string
  severity: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  created_at: string
}

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  try {
    const items: Notification[] = []

    // 1. Explicit notifications from notifications table
    const explicitRes = await sql`
      SELECT id, type, title, body, link, severity, read_at, created_at
      FROM notifications
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT 20
    `
    for (const row of explicitRes.rows as Array<{
      id: string
      type: string
      title: string
      body: string | null
      link: string | null
      severity: string
      read_at: string | null
      created_at: string
    }>) {
      items.push({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body || undefined,
        link: row.link || undefined,
        severity: (row.severity as Notification['severity']) || 'info',
        read: !!row.read_at,
        created_at: row.created_at,
      })
    }

    // 2. Pending approvals (computed)
    const pendingApprovals = await sql`
      SELECT a.id, ar.title, a.created_at
      FROM approvals a
      LEFT JOIN artifacts ar ON ar.id = a.artifact_id
      WHERE a.workspace_id = ${workspaceId} AND a.status = 'pending'
      ORDER BY a.created_at DESC
      LIMIT 5
    `
    for (const row of pendingApprovals.rows as Array<{ id: string; title: string | null; created_at: string }>) {
      items.push({
        id: `apv-${row.id}`,
        type: 'approval',
        title: `Approval needed: ${row.title || 'Untitled artifact'}`,
        link: '/dashboard/approvals',
        severity: 'warning',
        read: false,
        created_at: row.created_at,
      })
    }

    // 3. Recent failed agent runs (last 24h)
    const sinceISO = new Date(Date.now() - 24 * 3600_000).toISOString()
    const failedRuns = await sql`
      SELECT id, agent_name, error_message, created_at
      FROM agent_runs
      WHERE workspace_id = ${workspaceId} AND status = 'failed' AND created_at > ${sinceISO}
      ORDER BY created_at DESC
      LIMIT 5
    `
    for (const row of failedRuns.rows as Array<{
      id: string
      agent_name: string
      error_message: string | null
      created_at: string
    }>) {
      items.push({
        id: `run-${row.id}`,
        type: 'error',
        title: `${row.agent_name} failed`,
        body: row.error_message?.slice(0, 200) || undefined,
        link: '/dashboard/audit',
        severity: 'error',
        read: false,
        created_at: row.created_at,
      })
    }

    // 4. Recent successful publishes (last 24h) — limit 3 (don't spam)
    const recentPublishes = await sql`
      SELECT id, platform, post_url, published_at
      FROM publish_log
      WHERE workspace_id = ${workspaceId} AND published_at > ${sinceISO} AND status = 'published'
      ORDER BY published_at DESC
      LIMIT 3
    `
    for (const row of recentPublishes.rows as Array<{
      id: string
      platform: string
      post_url: string | null
      published_at: string
    }>) {
      items.push({
        id: `pub-${row.id}`,
        type: 'success',
        title: `Published to ${row.platform}`,
        link: row.post_url || '/dashboard/publishing',
        severity: 'success',
        read: false,
        created_at: row.published_at,
      })
    }

    // Sort all by created_at DESC and limit final result
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const limited = items.slice(0, 20)
    const unreadCount = limited.filter(i => !i.read).length

    return NextResponse.json({ items: limited, unreadCount })
  } catch (err) {
    console.error('[/api/notifications GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, userId, type, title, body: msgBody, link, severity } = body as {
      workspaceId: string
      userId?: string
      type: string
      title: string
      body?: string
      link?: string
      severity?: 'info' | 'success' | 'warning' | 'error'
    }
    if (!workspaceId || !type || !title) {
      return NextResponse.json({ error: 'workspaceId, type, title required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    await sql`
      INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link, severity)
      VALUES (${id}, ${workspaceId}, ${userId || null}, ${type}, ${title}, ${msgBody || null}, ${link || null}, ${severity || 'info'})
    `
    return NextResponse.json({ id, ok: true })
  } catch (err) {
    console.error('[/api/notifications POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')
    const body = await req.json().catch(() => ({}))

    if (workspaceId && body.markAllRead) {
      const denied = assertWorkspaceOwnership(req, workspaceId)
      if (denied) return denied
      await sql`UPDATE notifications SET read_at = ${new Date().toISOString()} WHERE workspace_id = ${workspaceId} AND read_at IS NULL`
      return NextResponse.json({ ok: true })
    }

    if (id) {
      // Verify ownership
      const check = await sql`SELECT workspace_id FROM notifications WHERE id = ${id} LIMIT 1`
      const row = check.rows[0] as { workspace_id?: string } | undefined
      if (!row?.workspace_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const denied = assertWorkspaceOwnership(req, row.workspace_id)
      if (denied) return denied
      await sql`UPDATE notifications SET read_at = ${new Date().toISOString()} WHERE id = ${id}`
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'id or workspaceId+markAllRead required' }, { status: 400 })
  } catch (err) {
    console.error('[/api/notifications PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
