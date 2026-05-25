/**
 * /api/integrations/ghl
 * GHL OAuth integration connect/disconnect endpoint.
 *
 * GET    ?workspaceId=...  → returns current GHL integration status
 * POST   { workspaceId, locationId, accessToken, refreshToken?, apiKey? } → upsert integration
 * DELETE { workspaceId }  → remove GHL integration
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

// ─── GET: Return GHL integration status ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, platform, account_id, status, connected_at,
           SUBSTR(access_token, 1, 8) AS token_preview,
           metadata
    FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = 'ghl'
    LIMIT 1
  `

  if (!result.rows[0]) {
    return NextResponse.json({ connected: false, platform: 'ghl' })
  }

  const row = result.rows[0]
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(String(row.metadata || '{}')) as Record<string, unknown>
  } catch { /* ignore */ }

  return NextResponse.json({
    connected: true,
    platform: 'ghl',
    id: row.id,
    locationId: row.account_id,
    status: row.status,
    connectedAt: row.connected_at,
    tokenPreview: row.token_preview,
    hasRefreshToken: Boolean(meta.refresh_token),
    hasApiKey: Boolean(meta.api_key),
  })
}

// ─── POST: Upsert GHL integration ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    workspaceId: string
    locationId: string
    accessToken: string
    refreshToken?: string
    apiKey?: string
  }

  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, locationId, accessToken, refreshToken, apiKey } = body

  if (!workspaceId || !locationId || !accessToken) {
    return NextResponse.json(
      { error: 'workspaceId, locationId, and accessToken are required' },
      { status: 400 },
    )
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const metadata = JSON.stringify({
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(apiKey ? { api_key: apiKey } : {}),
  })

  const now = new Date().toISOString()

  // Upsert: remove existing, insert fresh
  await sql`
    DELETE FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = 'ghl'
  `

  const id = newId()
  await sql`
    INSERT INTO integrations
      (id, workspace_id, platform, access_token, account_id, metadata, status, connected_at)
    VALUES
      (${id}, ${workspaceId}, 'ghl', ${accessToken}, ${locationId}, ${metadata}, 'active', ${now})
  `

  return NextResponse.json({ ok: true, connected: true, id, locationId })
}

// ─── DELETE: Remove GHL integration ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  let body: { workspaceId: string }

  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId } = body

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`
    DELETE FROM integrations
    WHERE workspace_id = ${workspaceId} AND platform = 'ghl'
  `

  return NextResponse.json({ ok: true, connected: false })
}
