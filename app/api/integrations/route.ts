import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { prepareAccessTokenWrite, tokenPreview } from '@/lib/integrations'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })
  // Sprint 8A: integrations holds OAuth tokens + account ids — strict
  // tenant isolation required.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Sprint 9B: select both plaintext (legacy) and encrypted token
  // columns. tokenPreview() resolves whichever is populated.
  const result = await sql`
    SELECT id, workspace_id, platform, account_id, status, connected_at,
           access_token, encrypted_access_token
    FROM integrations
    WHERE workspace_id = ${workspaceId}
    ORDER BY connected_at DESC
  `
  // Strip the raw token columns from the response — only return a
  // 4-char preview. Live tokens must never reach the browser.
  const rows = result.rows.map(r => {
    const preview = tokenPreview({
      access_token: r.access_token as string | null,
      encrypted_access_token: r.encrypted_access_token as string | null,
    })
    const safe = { ...r, token_preview: preview }
    delete (safe as Record<string, unknown>).access_token
    delete (safe as Record<string, unknown>).encrypted_access_token
    return safe
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
    const { workspaceId, platform, accessToken, accountId, metadata } = body as {
      workspaceId: string; platform: string; accessToken: string; accountId: string
      metadata?: Record<string, string>
    }
    if (!workspaceId || !platform || !accessToken || !accountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Sprint 8A: session must own this workspace before storing creds.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Upsert — replace existing integration for this platform
    await sql`DELETE FROM integrations WHERE workspace_id = ${workspaceId} AND platform = ${platform}`

    const id = newId()
    const metadataStr = metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
    // Sprint 9B: dual-write the access token. Encrypted column becomes
    // the new source of truth; plaintext column kept for legacy readers
    // that haven't migrated to lib/integrations.readAccessToken() yet.
    const tokenWrite = prepareAccessTokenWrite(accessToken)

    try {
      await sql`INSERT INTO integrations (id, workspace_id, platform, access_token, encrypted_access_token, account_id, status, metadata)
                VALUES (${id}, ${workspaceId}, ${platform}, ${tokenWrite.plaintext}, ${tokenWrite.encrypted}, ${accountId}, 'active', ${metadataStr})`
    } catch {
      // metadata column may not exist yet on older deployments
      await sql`INSERT INTO integrations (id, workspace_id, platform, access_token, encrypted_access_token, account_id, status)
                VALUES (${id}, ${workspaceId}, ${platform}, ${tokenWrite.plaintext}, ${tokenWrite.encrypted}, ${accountId}, 'active')`
    }

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Integration save error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const platform = searchParams.get('platform')
  if (!workspaceId || !platform) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  // Sprint 8A: session must own this workspace before deleting creds.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  await sql`DELETE FROM integrations WHERE workspace_id = ${workspaceId} AND platform = ${platform}`
  return NextResponse.json({ ok: true })
}
