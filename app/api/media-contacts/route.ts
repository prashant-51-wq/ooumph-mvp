/**
 * /api/media-contacts
 *
 * Journalist CRM. UNIQUE(workspace_id, email) at the DB level is surfaced
 * as a clean 409 here so the UI can show a friendly "already imported"
 * message instead of a raw SQL error.
 *
 *   GET    ?workspaceId=…[&beat=…][&search=…]
 *   POST   { workspaceId, journalistName, email, outletName?, beatFocus?, ... }
 *          OR
 *          { workspaceId, bulk: [...rows] }     ← bulk import path
 *   PATCH  { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const MAX_BULK_ROWS = 500

interface MediaContactRow {
  id: string
  workspace_id: string
  journalist_name: string
  email: string | null
  outlet_name: string | null
  beat_focus: string | null
  linkedin_url: string | null
  twitter_url: string | null
  notes: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string | null
}

interface BulkInputRow {
  journalistName?: string
  email?: string
  outletName?: string
  beatFocus?: string
  linkedinUrl?: string
  twitterUrl?: string
  notes?: string
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const beat = searchParams.get('beat')?.trim()
  const search = searchParams.get('search')?.trim()
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (beat && search) {
    const beatP = `%${beat.toLowerCase()}%`
    const searchP = `%${search.toLowerCase()}%`
    result = await sql`
      SELECT * FROM media_contacts
      WHERE workspace_id = ${workspaceId}
        AND LOWER(COALESCE(beat_focus, '')) LIKE ${beatP}
        AND (
          LOWER(COALESCE(journalist_name, '')) LIKE ${searchP}
          OR LOWER(COALESCE(outlet_name, '')) LIKE ${searchP}
          OR LOWER(COALESCE(email, '')) LIKE ${searchP}
        )
      ORDER BY created_at DESC LIMIT 500
    `
  } else if (beat) {
    const beatP = `%${beat.toLowerCase()}%`
    result = await sql`
      SELECT * FROM media_contacts
      WHERE workspace_id = ${workspaceId}
        AND LOWER(COALESCE(beat_focus, '')) LIKE ${beatP}
      ORDER BY created_at DESC LIMIT 500
    `
  } else if (search) {
    const searchP = `%${search.toLowerCase()}%`
    result = await sql`
      SELECT * FROM media_contacts
      WHERE workspace_id = ${workspaceId}
        AND (
          LOWER(COALESCE(journalist_name, '')) LIKE ${searchP}
          OR LOWER(COALESCE(outlet_name, '')) LIKE ${searchP}
          OR LOWER(COALESCE(email, '')) LIKE ${searchP}
        )
      ORDER BY created_at DESC LIMIT 500
    `
  } else {
    result = await sql`
      SELECT * FROM media_contacts
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT 500
    `
  }
  return NextResponse.json(result.rows as unknown as MediaContactRow[])
}

// ── POST (single OR bulk) ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      // single
      journalistName?: string; email?: string; outletName?: string
      beatFocus?: string; linkedinUrl?: string; twitterUrl?: string; notes?: string
      // bulk
      bulk?: BulkInputRow[]
    }
    const { workspaceId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── BULK IMPORT PATH ──────────────────────────────────────────────────
    if (Array.isArray(body.bulk)) {
      const rows = body.bulk.slice(0, MAX_BULK_ROWS)
      if (rows.length === 0) {
        return NextResponse.json({ error: 'bulk array is empty' }, { status: 400 })
      }
      let inserted = 0
      const skipped: Array<{ row: number; email: string; reason: string }> = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const journalistName = (r.journalistName || '').trim()
        const email = (r.email || '').trim().toLowerCase()
        if (!journalistName) { skipped.push({ row: i, email, reason: 'missing journalistName' }); continue }
        if (email && !EMAIL_PATTERN.test(email)) { skipped.push({ row: i, email, reason: 'invalid email format' }); continue }
        try {
          await sql`
            INSERT INTO media_contacts (
              id, workspace_id, journalist_name, email, outlet_name, beat_focus,
              linkedin_url, twitter_url, notes, created_at, updated_at
            ) VALUES (
              ${newId()}, ${workspaceId}, ${journalistName}, ${email || null},
              ${r.outletName?.trim() || null}, ${r.beatFocus?.trim() || null},
              ${r.linkedinUrl?.trim() || null}, ${r.twitterUrl?.trim() || null},
              ${r.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `
          inserted++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (/UNIQUE|unique/i.test(msg)) {
            skipped.push({ row: i, email, reason: 'duplicate (email already in workspace)' })
          } else {
            skipped.push({ row: i, email, reason: msg.slice(0, 200) })
          }
        }
      }
      return NextResponse.json({
        ok: true,
        inserted,
        skipped: skipped.length,
        skippedDetails: skipped,
        total: rows.length,
      })
    }

    // ── SINGLE INSERT PATH ────────────────────────────────────────────────
    const { journalistName, email, outletName, beatFocus, linkedinUrl, twitterUrl, notes } = body
    if (!journalistName?.trim()) {
      return NextResponse.json({ error: 'journalistName is required' }, { status: 400 })
    }
    const cleanEmail = (email || '').trim().toLowerCase() || null
    if (cleanEmail && !EMAIL_PATTERN.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Pre-check returns a clean 409 with the existing contact id
    if (cleanEmail) {
      const dup = await sql`SELECT id FROM media_contacts WHERE workspace_id = ${workspaceId} AND email = ${cleanEmail} LIMIT 1`
      if (dup.rows[0]) {
        return NextResponse.json(
          {
            error: `A media contact with email ${cleanEmail} already exists in this workspace.`,
            existingId: String((dup.rows[0] as { id?: string }).id || ''),
          },
          { status: 409 },
        )
      }
    }

    const id = newId()
    try {
      await sql`
        INSERT INTO media_contacts (
          id, workspace_id, journalist_name, email, outlet_name, beat_focus,
          linkedin_url, twitter_url, notes, created_at, updated_at
        ) VALUES (
          ${id}, ${workspaceId}, ${journalistName.trim()}, ${cleanEmail},
          ${outletName?.trim() || null}, ${beatFocus?.trim() || null},
          ${linkedinUrl?.trim() || null}, ${twitterUrl?.trim() || null},
          ${notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/UNIQUE|unique/i.test(msg)) {
        return NextResponse.json({ error: 'Duplicate contact (race condition).' }, { status: 409 })
      }
      throw err
    }
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/media-contacts POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string; workspaceId?: string
      journalistName?: string; email?: string; outletName?: string
      beatFocus?: string; linkedinUrl?: string; twitterUrl?: string; notes?: string
    }
    const { id, workspaceId } = body
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT id, email FROM media_contacts WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { id?: string; email?: string | null } | undefined
    if (!row) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    let newEmail: string | null = null
    if (body.email !== undefined) {
      const cleaned = (body.email || '').trim().toLowerCase()
      if (cleaned && cleaned !== row.email) {
        if (!EMAIL_PATTERN.test(cleaned)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
        }
        const dup = await sql`SELECT id FROM media_contacts WHERE workspace_id = ${workspaceId} AND email = ${cleaned} LIMIT 1`
        const dupRow = dup.rows[0] as { id?: string } | undefined
        if (dupRow?.id && dupRow.id !== id) {
          return NextResponse.json({ error: `Email ${cleaned} is already taken by another contact.` }, { status: 409 })
        }
        newEmail = cleaned
      } else if (!cleaned) {
        newEmail = null  // explicit clear
      }
    }

    try {
      await sql`
        UPDATE media_contacts SET
          journalist_name = COALESCE(${body.journalistName?.trim() ?? null}, journalist_name),
          email           = COALESCE(${body.email === undefined ? null : (newEmail ?? null)}, email),
          outlet_name     = COALESCE(${body.outletName?.trim() ?? null}, outlet_name),
          beat_focus      = COALESCE(${body.beatFocus?.trim() ?? null}, beat_focus),
          linkedin_url    = COALESCE(${body.linkedinUrl?.trim() ?? null}, linkedin_url),
          twitter_url     = COALESCE(${body.twitterUrl?.trim() ?? null}, twitter_url),
          notes           = COALESCE(${body.notes?.trim() ?? null}, notes),
          updated_at      = ${new Date().toISOString()}
        WHERE id = ${id} AND workspace_id = ${workspaceId}
      `
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/UNIQUE|unique/i.test(msg)) {
        return NextResponse.json({ error: 'Email collision — another contact already uses this address.' }, { status: 409 })
      }
      throw err
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/media-contacts PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`DELETE FROM media_contacts WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
