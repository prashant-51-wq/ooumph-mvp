/**
 * /api/developer-tokens/[id]
 *
 *   GET    ?workspaceId=…     → fetch a single token's *metadata* (never hash,
 *                                never cleartext — used by the rotate-prompt UI)
 *   DELETE ?workspaceId=…     → revoke. The row vanishes; the next gateway
 *                                lookup hashes the bearer and finds nothing,
 *                                so the request 401s. There is no soft-delete:
 *                                a revoked token must be unusable immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface DeveloperTokenRow {
  id: string
  workspace_id: string
  token_name: string
  token_hash: string
  scopes_json: string
  last_used_at: string | null
  created_at: string
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : []
  } catch {
    return []
  }
}

// ─── GET (metadata only) ──────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, token_name, token_hash, scopes_json, last_used_at, created_at
    FROM developer_tokens
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const row = result.rows[0] as unknown as DeveloperTokenRow | undefined
  if (!row) return NextResponse.json({ error: 'Token not found' }, { status: 404 })

  // Hash is never returned to the client — we redact it server-side here so
  // even if a future caller forgets to filter, the wire is safe.
  return NextResponse.json({
    id: row.id,
    workspace_id: row.workspace_id,
    token_name: row.token_name,
    scopes: parseScopes(row.scopes_json),
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    hashPreview: `oo_••••••••${row.token_hash.slice(-4)}`,
  })
}

// ─── DELETE (hard revoke) ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!id || !workspaceId) {
    return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const existing = await sql`
    SELECT id FROM developer_tokens
    WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1
  `
  if (!existing.rows[0]) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  await sql`DELETE FROM developer_tokens WHERE id = ${id} AND workspace_id = ${workspaceId}`
  return NextResponse.json({ ok: true })
}
