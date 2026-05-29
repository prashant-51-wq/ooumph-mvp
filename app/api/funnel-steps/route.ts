/**
 * /api/funnel-steps
 *
 * CRUD for the funnel pages served at /api/f/[slug]. The slug is globally
 * unique (enforced by Sprint-3 Commit-1's UNIQUE constraint), so we
 * gracefully surface that as a 409 to the UI.
 *
 *   GET    ?workspaceId=…  → all funnel steps for a workspace
 *   POST   { workspaceId, slug, htmlContent, funnelId?, stage?, sequence?, isActive? }
 *   PATCH  { id, workspaceId, slug?, htmlContent?, funnelId?, stage?, sequence?, isActive? }
 *   DELETE ?id=…&workspaceId=…
 *
 * Sprint 16F TASK 2: POST/PATCH now accept the new funnel_id / stage /
 * sequence / is_active columns added by Sprint 16A's schema bump.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/** Sprint 16F TASK 2: same VARCHAR(40) the schema allows. We keep an
 *  explicit allow-list rather than open VARCHAR so the UI can't sneak
 *  arbitrary values in (the audit's "stage = 'awareness'" hardcode was
 *  the symptom of this column being a free-form string). */
const ALLOWED_STAGES = new Set([
  'awareness', 'interest', 'consideration', 'conversion', 'retention',
])

interface FunnelRow {
  id: string
  workspace_id: string
  slug: string
  html_content: string
  view_count: number
  conversion_count: number
  created_at: string
  funnel_id: string | null
  stage: string
  sequence: number
  is_active: boolean | number
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
      funnelId?: string | null
      stage?: string
      sequence?: number
      isActive?: boolean
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
    // Sprint 16F TASK 2 — validate new columns.
    const stage = body.stage && ALLOWED_STAGES.has(body.stage) ? body.stage : 'awareness'
    const sequence = typeof body.sequence === 'number' && Number.isFinite(body.sequence)
      ? Math.max(0, Math.floor(body.sequence)) : 0
    // Default TRUE so existing client code keeps the implicit "save = live"
    // behaviour. Callers that want a draft pass isActive: false explicitly.
    const isActive = body.isActive === false ? 0 : 1
    const funnelId = body.funnelId ?? null
    // If funnelId provided, verify it belongs to the same workspace.
    if (funnelId) {
      const f = await sql`SELECT workspace_id FROM funnels WHERE id = ${funnelId} LIMIT 1`
      const fr = f.rows[0] as { workspace_id?: string } | undefined
      if (!fr) return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
      if (fr.workspace_id !== workspaceId) {
        return NextResponse.json({ error: 'Funnel belongs to a different workspace' }, { status: 403 })
      }
    }
    // Pre-check for clean 409 (avoids the raw DB UNIQUE error surface)
    const dup = await sql`SELECT id FROM funnel_steps WHERE slug = ${cleanSlug} LIMIT 1`
    if (dup.rows[0]) {
      return NextResponse.json({ error: `Slug "${cleanSlug}" is already taken.` }, { status: 409 })
    }
    const id = newId()
    await sql`
      INSERT INTO funnel_steps (
        id, workspace_id, slug, html_content,
        view_count, conversion_count, created_at,
        funnel_id, stage, sequence, is_active
      )
      VALUES (
        ${id}, ${workspaceId}, ${cleanSlug}, ${htmlContent},
        0, 0, CURRENT_TIMESTAMP,
        ${funnelId}, ${stage}, ${sequence}, ${isActive}
      )
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
      funnelId?: string | null
      stage?: string
      sequence?: number
      isActive?: boolean
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

    // Sprint 16F TASK 2 — validate new columns. Each is independently
    // optional; if the caller omits the key, we pass null to COALESCE so
    // the existing value sticks.
    const newStage: string | null = body.stage !== undefined
      ? (ALLOWED_STAGES.has(body.stage) ? body.stage : null)
      : null
    const newSequence: number | null = typeof body.sequence === 'number' && Number.isFinite(body.sequence)
      ? Math.max(0, Math.floor(body.sequence)) : null
    const newIsActive: number | null = typeof body.isActive === 'boolean' ? (body.isActive ? 1 : 0) : null
    // funnelId === null means caller wants to UNlink. undefined means leave alone.
    const funnelIdProvided = Object.prototype.hasOwnProperty.call(body, 'funnelId')
    const newFunnelId: string | null = funnelIdProvided ? (body.funnelId ?? null) : null
    if (funnelIdProvided && body.funnelId) {
      const f = await sql`SELECT workspace_id FROM funnels WHERE id = ${body.funnelId} LIMIT 1`
      const fr = f.rows[0] as { workspace_id?: string } | undefined
      if (!fr) return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })
      if (fr.workspace_id !== workspaceId) {
        return NextResponse.json({ error: 'Funnel belongs to a different workspace' }, { status: 403 })
      }
    }

    await sql`
      UPDATE funnel_steps SET
        slug         = COALESCE(${newSlug}, slug),
        html_content = COALESCE(${body.htmlContent ?? null}, html_content),
        funnel_id    = CASE WHEN ${funnelIdProvided ? 1 : 0} = 1 THEN ${newFunnelId} ELSE funnel_id END,
        stage        = COALESCE(${newStage}, stage),
        sequence     = COALESCE(${newSequence}, sequence),
        is_active    = COALESCE(${newIsActive}, is_active)
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
