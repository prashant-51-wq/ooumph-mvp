/**
 * /api/email-subscribers
 * Internal admin endpoint for managing a workspace's mailing list.
 *
 * Sprint 9A: added workspace ownership.
 * - GET / POST / DELETE all assert ownership.
 * - Public subscribe-from-landing-page flows go through
 *   /api/lp-submit and /api/f/submit which are intentionally
 *   anonymous; this admin endpoint is NOT that path.
 * - DELETE soft-marks status='unsubscribed' rather than hard-delete,
 *   so unsubscribe history stays auditable. We resolve the subscriber's
 *   workspace from the row before asserting ownership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

async function workspaceForSubscriber(id: string): Promise<string | null> {
  const r = await sql`SELECT workspace_id FROM email_subscribers WHERE id = ${id} LIMIT 1`
  return (r.rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const result = await sql`SELECT * FROM email_subscribers WHERE workspace_id = ${workspaceId} ORDER BY subscribed_at DESC LIMIT 500`
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, email, name } = await req.json()
    if (!workspaceId || !email) return NextResponse.json({ error: 'workspaceId and email required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT id FROM email_subscribers WHERE workspace_id = ${workspaceId} AND email = ${email.toLowerCase()} LIMIT 1`
    if (existing.rows.length > 0) return NextResponse.json({ ok: true, existing: true })

    const id = newId()
    await sql`INSERT INTO email_subscribers (id, workspace_id, email, name) VALUES (${id}, ${workspaceId}, ${email.toLowerCase()}, ${name || null})`
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const wsId = await workspaceForSubscriber(id)
  if (!wsId) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
  const denied = assertWorkspaceOwnership(req, wsId)
  if (denied) return denied
  await sql`UPDATE email_subscribers SET status = 'unsubscribed' WHERE id = ${id} AND workspace_id = ${wsId}`
  return NextResponse.json({ ok: true })
}
