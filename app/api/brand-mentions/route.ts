/**
 * /api/brand-mentions
 *
 * Read + triage interface for the brand_mentions table.
 *
 *   GET    ?workspaceId=…[&status=unread|flagged_crisis|addressed][&severity=critical|high|…][&limit=100]
 *   PATCH  { id, workspaceId, status?: 'unread'|'flagged_crisis'|'addressed'|'dismissed' }
 *   DELETE ?id=…&workspaceId=…    (hard-delete; useful for cleaning false positives)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['unread', 'flagged_crisis', 'addressed', 'dismissed'])

interface MentionRow {
  id: string
  workspace_id: string
  source_platform: string
  source_url: string | null
  author_handle: string | null
  content_text: string
  sentiment_score: number | string
  severity_level: string
  status: string
  detected_at: string | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  const severity = searchParams.get('severity')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (status && severity) {
    result = await sql`
      SELECT * FROM brand_mentions
      WHERE workspace_id = ${workspaceId} AND status = ${status} AND severity_level = ${severity}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else if (status) {
    result = await sql`
      SELECT * FROM brand_mentions
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else if (severity) {
    result = await sql`
      SELECT * FROM brand_mentions
      WHERE workspace_id = ${workspaceId} AND severity_level = ${severity}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else {
    result = await sql`
      SELECT * FROM brand_mentions
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  }
  return NextResponse.json(result.rows as unknown as MentionRow[])
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; workspaceId?: string; status?: string }
    const { id, workspaceId, status } = body
    if (!id || !workspaceId || !status) {
      return NextResponse.json({ error: 'id, workspaceId, status required' }, { status: 400 })
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: `Status must be one of ${[...ALLOWED_STATUSES].join(' | ')}` }, { status: 422 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    await sql`
      UPDATE brand_mentions SET status = ${status}
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/brand-mentions PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  await sql`DELETE FROM brand_mentions WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
