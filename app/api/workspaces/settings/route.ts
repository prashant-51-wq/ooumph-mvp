/**
 * /api/workspaces/settings — Sprint 6H
 *
 * Focused endpoint for merging into workspaces.extra_settings without
 * touching brand_profiles. The full /api/workspaces PATCH endpoint
 * expects the entire brand profile payload — using it for tiny setting
 * tweaks (auto-approve threshold, etc.) would wipe brand profile fields
 * with NULLs.
 *
 * GET  ?workspaceId=…           → returns parsed extra_settings JSON
 * POST { workspaceId, settings } → deep-merges `settings` into extra_settings
 *
 * Keys this endpoint currently understands (extensible — any unknown
 * key is preserved, so callers can store custom flags):
 *   - auto_approve_delay:     'off' | '24h' | '48h' | '72h'
 *   - auto_approve_min_score: number (0-100), defaults 80 if missing
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

function parseSettings(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  // Sprint 7A: session must own this workspace.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const res = await sql`SELECT extra_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const row = res.rows[0] as { extra_settings?: string | null } | undefined
  if (!row) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  return NextResponse.json({ settings: parseSettings(row.extra_settings) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId?: string; settings?: Record<string, unknown> }
    const { workspaceId, settings } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    // Sprint 7A: session must own this workspace. Without this any
    // logged-in user could flip another tenant's auto-approve settings.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings (object) required' }, { status: 400 })
    }

    // Merge — preserve any existing keys not being overwritten. This is
    // important because callers from different surfaces (approvals page,
    // brand settings page) all share the same extra_settings blob.
    const existingRes = await sql`SELECT extra_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const existingRow = existingRes.rows[0] as { extra_settings?: string | null } | undefined
    if (!existingRow) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    const merged = { ...parseSettings(existingRow.extra_settings), ...settings }
    await sql`UPDATE workspaces SET extra_settings = ${JSON.stringify(merged)} WHERE id = ${workspaceId}`
    return NextResponse.json({ ok: true, settings: merged })
  } catch (err) {
    console.error('workspaces/settings POST error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
