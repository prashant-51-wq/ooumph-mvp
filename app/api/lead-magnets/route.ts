/**
 * /api/lead-magnets
 *
 * Sprint 16E (audit P2 #28) — CRUD for the lead_magnets table added in
 * Sprint 16A. Lead magnets are downloadable assets (PDFs, eBooks, swipe
 * files) that funnels offer in exchange for an email — distinct from
 * landing-page HTML or generic media_assets.
 *
 *   GET    ?workspaceId=…[&funnelId=…]  → list
 *   POST   { workspaceId, title, description?, assetUrl, funnelId? }
 *   PATCH  { id, workspaceId, …updates }
 *   DELETE ?id=…&workspaceId=…
 *
 * Ownership-guarded on every method.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const funnelId = searchParams.get('funnelId')
  const rows = funnelId
    ? await sql`SELECT * FROM lead_magnets WHERE workspace_id = ${workspaceId} AND funnel_id = ${funnelId} ORDER BY created_at DESC`
    : await sql`SELECT * FROM lead_magnets WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC`
  return NextResponse.json(rows.rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; title?: string; description?: string; assetUrl?: string; funnelId?: string }
    if (!body.workspaceId || !body.title?.trim() || !body.assetUrl?.trim()) {
      return NextResponse.json({ error: 'workspaceId, title, assetUrl required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied
    const id = newId()
    await sql`
      INSERT INTO lead_magnets (id, workspace_id, title, description, asset_url, funnel_id)
      VALUES (${id}, ${body.workspaceId}, ${body.title.trim()}, ${body.description || null}, ${body.assetUrl.trim()}, ${body.funnelId || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; workspaceId?: string; title?: string; description?: string; assetUrl?: string; funnelId?: string }
    if (!body.id || !body.workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, body.workspaceId)
    if (denied) return denied
    const owner = await sql`SELECT workspace_id FROM lead_magnets WHERE id = ${body.id} LIMIT 1`
    const o = owner.rows[0] as { workspace_id?: string } | undefined
    if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (o.workspace_id !== body.workspaceId) return NextResponse.json({ error: 'Wrong workspace' }, { status: 403 })
    await sql`
      UPDATE lead_magnets SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        asset_url = COALESCE(${body.assetUrl ?? null}, asset_url),
        funnel_id = COALESCE(${body.funnelId ?? null}, funnel_id)
      WHERE id = ${body.id} AND workspace_id = ${body.workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
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
  await sql`DELETE FROM lead_magnets WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
