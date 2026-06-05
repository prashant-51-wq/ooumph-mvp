/**
 * PATCH /api/artifacts/[id]/lp-slug
 *
 * Sprint 13A. Sets (or clears) the custom slug for a landing_page
 * artifact so the public URL becomes /lp/<slug> instead of /lp/<uuid>.
 *
 * Body: { slug: string | null }
 *   - non-null: validated against SLUG_PATTERN (3-64 chars,
 *     lowercase letters/numbers/hyphens, must start with a letter).
 *   - null or empty: clears the slug. URL falls back to /lp/<uuid>.
 *
 * Errors:
 *   404 — artifact not found / not type='landing_page'
 *   400 — slug fails format validation
 *   409 — slug already taken by a different artifact (UNIQUE index)
 *
 * Auth: must own the workspace the artifact belongs to.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

/** Conservative slug pattern: 3-64 chars, starts with a letter, then
 *  lowercase letters / digits / single hyphens. Blocks URL-unsafe
 *  characters and reserved words at the start (numbers-only slugs are
 *  also rejected — too easy to confuse with ids). */
const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,63}$/

interface RouteCtx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Look up the artifact's workspace + verify it's a landing_page.
  const lookup = await sql`
    SELECT workspace_id, type, lp_slug FROM artifacts WHERE id = ${id} LIMIT 1
  `
  const row = lookup.rows[0] as { workspace_id?: string; type?: string; lp_slug?: string | null } | undefined
  if (!row) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  if (row.type !== 'landing_page') {
    return NextResponse.json({ error: `Slugs only apply to landing_page artifacts (this one is ${row.type})` }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, row.workspace_id || null)
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { slug?: string | null }
  const rawSlug = (body.slug ?? '').toString().trim().toLowerCase()

  // Clear path: empty/null → remove the slug, URL falls back to UUID.
  if (!rawSlug) {
    await sql`UPDATE artifacts SET lp_slug = NULL WHERE id = ${id}`
    return NextResponse.json({ ok: true, slug: null, publicUrl: `/lp/${id}` })
  }

  if (!SLUG_PATTERN.test(rawSlug)) {
    return NextResponse.json({
      error: 'Invalid slug. Use 3-64 lowercase letters/digits/hyphens, starting with a letter (e.g. "acme-launch").',
    }, { status: 400 })
  }

  // Reserve a small set of paths that we use for our own routes so a
  // slug can't shadow /lp/thanks etc.
  const RESERVED = new Set(['thanks', 'api', 'admin', 'dashboard', 'auth', 'lp', 'login', 'signup'])
  if (RESERVED.has(rawSlug)) {
    return NextResponse.json({ error: 'That slug is reserved. Pick another.' }, { status: 400 })
  }

  // Conflict check (the UNIQUE index also enforces this, but we want
  // a clean error message rather than a generic 500).
  const conflict = await sql`SELECT id FROM artifacts WHERE lp_slug = ${rawSlug} AND id <> ${id} LIMIT 1`
  if (conflict.rows[0]) {
    return NextResponse.json({
      error: `That slug is already used by another landing page. Pick a different one.`,
    }, { status: 409 })
  }

  try {
    await sql`UPDATE artifacts SET lp_slug = ${rawSlug} WHERE id = ${id}`
  } catch (e) {
    // Unique-index violation if we raced the check above. Surface as 409.
    return NextResponse.json({
      error: `Could not save slug (taken by another row). ${e instanceof Error ? e.message : ''}`,
    }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    slug: rawSlug,
    publicUrl: `/lp/${rawSlug}`,
  })
}
