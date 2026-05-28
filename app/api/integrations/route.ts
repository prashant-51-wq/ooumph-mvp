import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })
  // Sprint 8A: integrations holds OAuth tokens + account ids — strict
  // tenant isolation required.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = await sql`
    SELECT id, workspace_id, platform, account_id, status, connected_at,
           SUBSTR(access_token, 1, 4) as token_preview
    FROM integrations
    WHERE workspace_id = ${workspaceId}
    ORDER BY connected_at DESC
  `
  return NextResponse.json(result.rows)
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

    try {
      await sql`INSERT INTO integrations (id, workspace_id, platform, access_token, account_id, status, metadata)
                VALUES (${id}, ${workspaceId}, ${platform}, ${accessToken}, ${accountId}, 'active', ${metadataStr})`
    } catch {
      // metadata column may not exist yet on older deployments
      await sql`INSERT INTO integrations (id, workspace_id, platform, access_token, account_id, status)
                VALUES (${id}, ${workspaceId}, ${platform}, ${accessToken}, ${accountId}, 'active')`
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
