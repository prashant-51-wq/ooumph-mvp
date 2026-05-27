/**
 * /api/lead-activities
 *
 * Timeline reader + writer for the lead detail view.
 *
 *   GET  ?workspaceId=…&leadId=…[&type=enrichment|outreach|note|…][&limit=100]
 *        → activities for a single lead, newest first
 *
 *   GET  ?workspaceId=…&activityType=agent_enrichment&limit=50
 *        → workspace-wide feed of a single activity type (research-feed uses this)
 *
 *   POST { workspaceId, leadId, activityType, title, description?, metadataJson? }
 *        → manually log an activity (call notes, meeting recap, etc.)
 *
 * The lead-scoped GET uses the composite (lead_id, created_at DESC) index for
 * O(log n) timeline reads even on workspaces with millions of activity rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface ActivityRow {
  id: string
  workspace_id: string
  lead_id: string
  type: string                 // legacy column
  activity_type: string | null // Sprint-4 canonical column
  title: string
  description: string | null
  metadata_json: string | null
  created_at: string
}

const ACTIVITY_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

// ── GET ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const leadId = searchParams.get('leadId')
  const typeFilter = searchParams.get('type') || searchParams.get('activityType')
  const rawLimit = parseInt(searchParams.get('limit') || '100', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500)

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Verify lead ownership when leadId is provided — prevents leaking activity
  // rows from a different workspace via guessed lead ids.
  if (leadId) {
    const own = await sql`SELECT id FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!own.rows[0]) return NextResponse.json({ error: 'Lead not found in this workspace' }, { status: 404 })
  }

  let result
  if (leadId && typeFilter) {
    result = await sql`
      SELECT * FROM lead_activities
      WHERE workspace_id = ${workspaceId}
        AND lead_id = ${leadId}
        AND (activity_type = ${typeFilter} OR type = ${typeFilter})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else if (leadId) {
    // Hot-path query — uses idx_lead_activities_lead (lead_id, created_at DESC)
    result = await sql`
      SELECT * FROM lead_activities
      WHERE workspace_id = ${workspaceId} AND lead_id = ${leadId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else if (typeFilter) {
    // Workspace-wide feed — uses idx_lead_activities_workspace_type
    result = await sql`
      SELECT * FROM lead_activities
      WHERE workspace_id = ${workspaceId}
        AND (activity_type = ${typeFilter} OR type = ${typeFilter})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  } else {
    result = await sql`
      SELECT * FROM lead_activities
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }

  const rows = (result.rows as unknown as ActivityRow[]).map(r => {
    // Surface the Sprint-4 canonical name first; fall back to legacy `type`.
    return { ...r, activity_type: r.activity_type || r.type }
  })
  return NextResponse.json(rows)
}

// ── POST ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      leadId?: string
      activityType?: string
      title?: string
      description?: string
      metadataJson?: Record<string, unknown> | string
    }
    const { workspaceId, leadId, activityType, title, description, metadataJson } = body

    if (!workspaceId || !leadId || !activityType?.trim() || !title?.trim()) {
      return NextResponse.json(
        { error: 'workspaceId, leadId, activityType, and title are required' },
        { status: 400 },
      )
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const cleanType = activityType.trim().toLowerCase()
    if (!ACTIVITY_TYPE_PATTERN.test(cleanType)) {
      return NextResponse.json(
        { error: 'activityType must be lowercase a-z 0-9 underscore, starting with a letter, max 64 chars' },
        { status: 422 },
      )
    }

    // Lead ownership verification — without this, a forged leadId could pin
    // activity rows to leads in OTHER workspaces.
    const own = await sql`SELECT id FROM leads_captured WHERE id = ${leadId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!own.rows[0]) return NextResponse.json({ error: 'Lead not found in this workspace' }, { status: 404 })

    const metaStr = typeof metadataJson === 'string'
      ? metadataJson.slice(0, 8000)
      : metadataJson
      ? JSON.stringify(metadataJson).slice(0, 8000)
      : '{}'

    const id = newId()
    try {
      // Write to BOTH the canonical activity_type AND legacy type column so
      // any reader that filters on either column sees the new row.
      await sql`
        INSERT INTO lead_activities (
          id, workspace_id, lead_id, type, activity_type, title, description, metadata_json, created_at
        ) VALUES (
          ${id}, ${workspaceId}, ${leadId},
          ${cleanType}, ${cleanType},
          ${title.trim()}, ${description?.trim() || null}, ${metaStr},
          CURRENT_TIMESTAMP
        )
      `
    } catch (err) {
      // Fallback for legacy installs that haven't received the activity_type
      // ALTER yet — write to the legacy `type` column only.
      console.warn('[lead-activities] activity_type column missing; falling back', err)
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${id}, ${workspaceId}, ${leadId}, ${cleanType}, ${title.trim()}, ${description?.trim() || null}, ${metaStr}, CURRENT_TIMESTAMP)
      `
    }
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[/api/lead-activities POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
