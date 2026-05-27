/**
 * /api/developer-tokens
 *
 * Personal Access Tokens for the public Ooumph API. These power the
 * /dashboard/developer-api console, programmatic CI integrations, and
 * third-party tools that call our REST surface on a workspace's behalf.
 *
 *   GET    ?workspaceId=…                 → list (NO cleartext, hashes are
 *                                            never returned anywhere)
 *
 *   POST   { workspaceId, tokenName, scopes?: string[] }
 *          → Generates a high-entropy plaintext token prefixed `oo_`,
 *            stores ONLY its SHA-256 hex hash, and returns the cleartext
 *            inside the JSON response EXACTLY ONCE. Subsequent fetches
 *            never see it again.
 *
 * Security invariants
 * ───────────────────
 *   1. Plaintext leaves this file only via the POST response body — never
 *      logged, never echoed elsewhere, never recoverable from a future GET.
 *   2. The DB row stores `token_hash` only. The lookup index is on that
 *      column, plain B-tree, no compound (the gateway hasn't attributed
 *      the request yet when it runs the lookup).
 *   3. Listing returns a masked preview (`oo_xxxx…last4`) so the user can
 *      visually disambiguate keys without ever seeing the secret again.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const TOKEN_PREFIX = 'oo_'
const TOKEN_ENTROPY_BYTES = 32  // 256-bit secret
const MAX_TOKENS_PER_WORKSPACE = 25

interface DeveloperTokenRow {
  id: string
  workspace_id: string
  token_name: string
  token_hash: string
  scopes_json: string
  last_used_at: string | null
  created_at: string
}

interface PublicTokenRow {
  id: string
  workspace_id: string
  token_name: string
  scopes: string[]
  last_used_at: string | null
  created_at: string
  /** Best-effort preview ("oo_••••••••a1b2") so the UI can disambiguate.
   *  We can't show full plaintext because we never stored it. */
  hashPreview: string
}

function sha256Hex(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

function generateToken(): string {
  // url-safe base64 of high-entropy random bytes; strip '=' padding so the
  // header value never carries reserved characters.
  const raw = crypto.randomBytes(TOKEN_ENTROPY_BYTES).toString('base64')
  const urlSafe = raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${TOKEN_PREFIX}${urlSafe}`
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 64)
    }
  } catch { /* fall through */ }
  return []
}

function maskHash(hash: string): string {
  // Show last 4 of the hash so the user can see *something* unique per row.
  // Hash bytes are not the token, so this reveals nothing — but we still
  // gate display by ownership check above.
  if (!hash || hash.length < 8) return 'oo_••••••••'
  return `oo_••••••••${hash.slice(-4)}`
}

// ─── GET (list — never returns cleartext) ─────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, token_name, token_hash, scopes_json, last_used_at, created_at
    FROM developer_tokens
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC LIMIT 200
  `
  const rows = result.rows as unknown as DeveloperTokenRow[]
  const publicRows: PublicTokenRow[] = rows.map(r => ({
    id: r.id,
    workspace_id: r.workspace_id,
    token_name: r.token_name,
    scopes: parseScopes(r.scopes_json),
    last_used_at: r.last_used_at,
    created_at: r.created_at,
    hashPreview: maskHash(r.token_hash),
  }))
  return NextResponse.json(publicRows)
}

// ─── POST (create — returns cleartext ONCE) ──────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string
      tokenName?: string
      scopes?: string[]
    }
    const { workspaceId, tokenName } = body
    if (!workspaceId || !tokenName?.trim()) {
      return NextResponse.json({ error: 'workspaceId and tokenName required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Quota guard — prevents accidental enumeration / runaway token sprawl.
    const countRes = await sql`
      SELECT COUNT(*)::int AS n FROM developer_tokens WHERE workspace_id = ${workspaceId}
    `
    const n = Number((countRes.rows[0] as { n?: number } | undefined)?.n || 0)
    if (n >= MAX_TOKENS_PER_WORKSPACE) {
      return NextResponse.json(
        {
          error: `Token limit reached (${MAX_TOKENS_PER_WORKSPACE}). Revoke an unused token before issuing a new one.`,
        },
        { status: 409 },
      )
    }

    // Sanitise scopes: lowercase, snake_case-with-colons (read:leads etc).
    const scopes = Array.isArray(body.scopes)
      ? Array.from(new Set(body.scopes
          .filter((s): s is string => typeof s === 'string')
          .map(s => s.trim().toLowerCase())
          .filter(s => /^[a-z]+:[a-z_]+$/.test(s)))).slice(0, 32)
      : []

    const plaintext = generateToken()
    const tokenHash = sha256Hex(plaintext)
    const id = newId()

    await sql`
      INSERT INTO developer_tokens (
        id, workspace_id, token_name, token_hash, scopes_json, created_at
      ) VALUES (
        ${id}, ${workspaceId}, ${tokenName.trim()}, ${tokenHash},
        ${JSON.stringify(scopes)}, CURRENT_TIMESTAMP
      )
    `

    // ⚠️  This is the ONLY response that ever contains the cleartext. After
    // this returns we cannot reconstruct it — only the SHA-256 was saved.
    return NextResponse.json({
      ok: true,
      id,
      token: plaintext,
      scopes,
      warning: 'Copy this token now — it will never be shown again. Anthropic-grade entropy, store it in a secret manager.',
    })
  } catch (err) {
    console.error('[/api/developer-tokens POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
