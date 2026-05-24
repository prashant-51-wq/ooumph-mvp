import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  if (!workspaceId) return NextResponse.json([])

  const result = status && status !== 'all'
    ? await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND status = ${status} ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 100`

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, name, email, phone, source, campaign, status, score, notes } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const id = newId()
    await sql`
      INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, campaign, status, score, notes)
      VALUES (${id}, ${workspaceId}, ${name || null}, ${email || null}, ${phone || null},
              ${source || 'manual'}, ${campaign || null}, ${status || 'new'}, ${score || 0}, ${notes || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes, score } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await sql`UPDATE leads_captured SET status = ${status}, notes = ${notes || null}, score = ${score || 0} WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await sql`DELETE FROM leads_captured WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
