import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const result = await sql`SELECT * FROM email_subscribers WHERE workspace_id = ${workspaceId} ORDER BY subscribed_at DESC LIMIT 500`
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, email, name } = await req.json()
    if (!workspaceId || !email) return NextResponse.json({ error: 'workspaceId and email required' }, { status: 400 })

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
  await sql`UPDATE email_subscribers SET status = 'unsubscribed' WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
