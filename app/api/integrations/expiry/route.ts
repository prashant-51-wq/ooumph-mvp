/**
 * /api/integrations/expiry — Sprint 17E (audit P1 #19)
 *
 * Returns OAuth token expiry status per platform for a workspace so the
 * Integrations page can render a visible expiry badge on each provider
 * card. Before this endpoint the only place users could see expiry was
 * the bell dropdown (driven by /api/cron/oauth-health-check), which was
 * easy to miss between sweeps.
 *
 * Shape:
 *   [{ platform: 'linkedin', expires_at: '...', daysLeft: 14 }]
 *
 * daysLeft is rounded down — a token expiring in 47 hours reports 1.
 * Tokens without an expires_at are omitted (provider issues non-expiring
 * tokens, e.g. some PATs).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface ExpiryRow {
  platform: string
  expires_at: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let rows: ExpiryRow[] = []
  try {
    const result = await sql`
      SELECT platform, expires_at
      FROM oauth_tokens
      WHERE workspace_id = ${workspaceId}
        AND status = 'active'
        AND expires_at IS NOT NULL
    `
    rows = result.rows as unknown as ExpiryRow[]
  } catch {
    // oauth_tokens table may not exist in older deployments — fail soft.
    return NextResponse.json([], { status: 200 })
  }

  const now = Date.now()
  const out = rows
    .filter(r => !!r.expires_at)
    .map(r => {
      const ms = new Date(r.expires_at as string).getTime() - now
      const daysLeft = Math.floor(ms / (24 * 3600_000))
      return { platform: r.platform, expires_at: r.expires_at, daysLeft }
    })

  return NextResponse.json(out)
}
