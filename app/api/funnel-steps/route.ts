/**
 * /api/funnel-steps
 *
 * CRUD for the funnel pages served at /api/f/[slug]. The slug is globally
 * unique (enforced by Sprint-3 Commit-1's UNIQUE constraint), so we
 * gracefully surface that as a 409 to the UI.
 *
 *   GET    ?workspaceId=…  → all funnel steps for a workspace
 *   POST   { workspaceId, slug, htmlContent }
 *   PATCH  { id, workspaceId, slug?, htmlContent? }
 *   DELETE ?id=…&workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

interface FunnelRow {
  id: string
  workspace_id: string
  slug: string
  html_content: string
  view_count: number
  conversion_count: number
  created_at: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const result = await sql`
    SELECT * FROM funnel_steps
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC LIMIT 200
  `
  return NextResponse.json(result.rows as unknown as FunnelRow[])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string; slug?: string; htmlContent?: string
    }
    const { workspaceId, slug, htmlContent } = body
    if (!workspaceId || !slug?.trim() || !htmlContent?.trim()) {
      return NextResponse.json({ error: 'workspaceId, slug, and htmlContent are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const cleanSlug = slug.trim().toLowerCase()
    if (!SLUG_PATTERN.test(cleanSlug)) {
      return NextResponse.json(
        { error: 'Slug must be 1-128 chars: letters, numbers, hyphens, underscores only.' },
        { status: 422 },
      )
    }
    // Pre-check for clean 409 (avoids the raw DB UNIQUE error surface)
    const dup = await sql`SELECT id FROM funnel_steps WHERE slug = ${cleanSlug} LIMIT 1`
    if (dup.rows[0]) {
      return NextResponse.json({ error: `Slug "${cleanSlug}" is already taken.` }, { status: 409 })
    }
    const id = newId()
    await sql`
      INSERT INTO funnel_steps (id, workspace_id, slug, html_content, view_count, conversion_count, created_at)
      VALUES (${id}, ${workspaceId}, ${cleanSlug}, ${htmlContent}, 0, 0, CURRENT_TIMESTAMP)
    `
    return NextResponse.json({ ok: true, id, slug: cleanSlug })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // SQLite + Postgres both surface UNIQUE violations with these substrings
    if (/UNIQUE|unique/i.test(msg)) {
      return NextResponse.json({ error: 'Slug already taken.' }, { status: 409 })
    }
    console.error('[/api/funnel-steps POST]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string; workspaceId?: string
      slug?: string; htmlContent?: string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const existing = await sql`SELECT id, slug FROM funnel_steps WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { id?: string; slug?: string } | undefined
    if (!row) return NextResponse.json({ error: 'Funnel step not found' }, { status: 404 })

    let newSlug: string | null = null
    if (body.slug && body.slug.trim().toLowerCase() !== row.slug) {
      newSlug = body.slug.trim().toLowerCase()
      if (!SLUG_PATTERN.test(newSlug)) {
        return NextResponse.json({ error: 'Invalid slug format' }, { status: 422 })
      }
      const dup = await sql`SELECT id FROM funnel_steps WHERE slug = ${newSlug} LIMIT 1`
      if (dup.rows[0] && (dup.rows[0] as { id?: string }).id !== id) {
        return NextResponse.json({ error: `Slug "${newSlug}" is already taken.` }, { status: 409 })
      }
    }
    await sql`
      UPDATE funnel_steps SET
        slug         = COALESCE(${newSlug}, slug),
        html_content = COALESCE(${body.htmlContent ?? null}, html_content)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true, slug: newSlug || row.slug })
  } catch (err) {
    console.error('[/api/funnel-steps PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  await sql`DELETE FROM funnel_steps WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
