/**
 * /api/ad-campaigns
 *
 * CRUD for the canonical paid-ad campaign rows. The status transitions
 * to 'active' / 'deploying' are owned EXCLUSIVELY by /api/ads/[id]/deploy —
 * this endpoint refuses to flip them itself.
 *
 *   GET    ?workspaceId=…[&status=draft|active|paused|failed]
 *   POST   { workspaceId, name, platform, daily_budget, utm_override? }
 *   PATCH  { id, workspaceId, ...updates }
 *   DELETE ?id=…&workspaceId=…   (archives only — historical rows preserved)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const PROTECTED_STATUSES = new Set(['deploying', 'active'])
const ALLOWED_PATCH_STATUSES = new Set(['draft', 'paused', 'archived'])

interface AdCampaignRow {
  id: string
  workspace_id: string
  platform: string
  native_campaign_id: string | null
  name: string
  daily_budget: number
  status: string
  error_log: string | null
  utm_override: string | null
  created_at: string
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = status
    ? await sql`
        SELECT * FROM ad_campaigns
        WHERE workspace_id = ${workspaceId} AND status = ${status}
        ORDER BY created_at DESC LIMIT 200
      `
    : await sql`
        SELECT * FROM ad_campaigns
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC LIMIT 200
      `
  return NextResponse.json(result.rows as unknown as AdCampaignRow[])
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      name?: string
      platform?: string
      dailyBudget?: number      // in cents
      utmOverride?: string
    }
    const { workspaceId, name, platform, dailyBudget, utmOverride } = body
    if (!workspaceId || !name?.trim() || !platform?.trim()) {
      return NextResponse.json({ error: 'workspaceId, name, and platform are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const budget = Number(dailyBudget || 0)
    if (!Number.isFinite(budget) || budget < 0) {
      return NextResponse.json({ error: 'dailyBudget must be a non-negative integer (cents)' }, { status: 400 })
    }

    const id = newId()
    await sql`
      INSERT INTO ad_campaigns (
        id, workspace_id, platform, name, daily_budget,
        status, utm_override, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${platform.toLowerCase()}, ${name.trim()}, ${Math.floor(budget)},
        'draft', ${utmOverride || null}, CURRENT_TIMESTAMP
      )
    `
    return NextResponse.json({ ok: true, id, status: 'draft' })
  } catch (err) {
    console.error('[/api/ad-campaigns POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string
      workspaceId?: string
      name?: string
      platform?: string
      dailyBudget?: number
      utmOverride?: string | null
      status?: string
    }
    const { id, workspaceId, status } = body
    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const existing = await sql`SELECT status FROM ad_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    const row = existing.rows[0] as { status?: string } | undefined
    if (!row) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (PROTECTED_STATUSES.has(row.status || '')) {
      return NextResponse.json(
        { error: `Cannot edit a campaign in '${row.status}' state. Pause it first via /api/ads/[id]/deploy.` },
        { status: 409 },
      )
    }
    if (status && !ALLOWED_PATCH_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Status '${status}' cannot be set here. Use /api/ads/[id]/deploy for activation.` },
        { status: 422 },
      )
    }

    const budgetVal = body.dailyBudget !== undefined ? Math.max(0, Math.floor(Number(body.dailyBudget))) : null
    await sql`
      UPDATE ad_campaigns SET
        name          = COALESCE(${body.name ?? null}, name),
        platform      = COALESCE(${body.platform?.toLowerCase() ?? null}, platform),
        daily_budget  = COALESCE(${budgetVal}, daily_budget),
        utm_override  = COALESCE(${body.utmOverride === undefined ? null : (body.utmOverride || null)}, utm_override),
        status        = COALESCE(${status ?? null}, status)
      WHERE id = ${id} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/ad-campaigns PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE (archive only) ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`SELECT status FROM ad_campaigns WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
  const row = existing.rows[0] as { status?: string } | undefined
  if (!row) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (PROTECTED_STATUSES.has(row.status || '')) {
    return NextResponse.json(
      { error: `Cannot archive a campaign in '${row.status}' state. Pause it first.` },
      { status: 409 },
    )
  }
  await sql`UPDATE ad_campaigns SET status = 'archived' WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
