import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

// Map convenient type aliases to actual artifact.type values stored by agent routes.
const TYPE_ALIASES: Record<string, string[]> = {
  image: ['generated_image'],
  video: ['video_task', 'avatar_video', 'video_brief'],
  voiceover: ['voiceover'],
  repurpose: ['repurposed_content'],
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const type = searchParams.get('type')
  const id = searchParams.get('id')
  const agentRunId = searchParams.get('agentRunId')
  const limit = parseInt(searchParams.get('limit') || '50')
  if (!workspaceId) return NextResponse.json([])

  // Sprint 7E: session must own this workspace.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Children of a specific agent run — used by Workspace Hub middle panel.
  // Walks the parent_run_id chain by joining agent_runs so we capture
  // artifacts from sub-agent runs spawned by this master run too.
  if (agentRunId) {
    const rows = (await sql`
      SELECT a.* FROM artifacts a
      WHERE a.workspace_id = ${workspaceId}
        AND (
          a.agent_run_id = ${agentRunId}
          OR a.agent_run_id IN (
            SELECT id FROM agent_runs WHERE parent_run_id = ${agentRunId}
          )
        )
      ORDER BY a.created_at ASC
    `).rows
    const items = rows.map((r) => {
      let parsed: unknown = r.content_json
      if (typeof r.content_json === 'string') {
        try { parsed = JSON.parse(r.content_json) } catch { /* keep raw */ }
      }
      return { ...r, content_json: parsed }
    })
    return NextResponse.json(items)
  }

  // Single-artifact lookup by id (used by ReviewRequiredModal + detail views)
  if (id) {
    const single = await sql`
      SELECT * FROM artifacts
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `
    const row = single.rows[0] as Record<string, unknown> | undefined
    if (!row) return NextResponse.json(null, { status: 404 })
    let parsedCj: unknown = row.content_json
    if (typeof row.content_json === 'string') {
      try { parsedCj = JSON.parse(row.content_json) } catch { /* keep raw */ }
    }
    return NextResponse.json({ ...row, content_json: parsedCj })
  }

  let rows
  if (type && TYPE_ALIASES[type]) {
    const types = TYPE_ALIASES[type]
    rows = (await sql`
      SELECT * FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = ANY(${types}::text[])
      ORDER BY created_at DESC LIMIT ${limit}
    `).rows
  } else if (type) {
    rows = (await sql`
      SELECT * FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = ${type}
      ORDER BY created_at DESC LIMIT ${limit}
    `).rows
  } else {
    rows = (await sql`
      SELECT * FROM artifacts
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT ${limit}
    `).rows
  }

  // Parse content_json strings into objects for convenience.
  const items = rows.map((r) => {
    let parsed: unknown = r.content_json
    if (typeof r.content_json === 'string') {
      try { parsed = JSON.parse(r.content_json) } catch { /* keep as string */ }
    }
    return { ...r, content_json: parsed }
  })

  return NextResponse.json(items)
}

// POST /api/artifacts — Create an artifact + approval row.
// Used by tools that produce client-side content (e.g. Repurpose "Send to Approvals").
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, type, title, content_json } = body as {
      workspaceId: string
      type: string
      title: string
      content_json: unknown
    }

    if (!workspaceId || !type || !title) {
      return NextResponse.json({ error: 'workspaceId, type and title are required' }, { status: 400 })
    }
    // Sprint 7E: session must own this workspace.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const artifactId = newId()
    const payload = typeof content_json === 'string' ? content_json : JSON.stringify(content_json ?? {})

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (${artifactId}, ${workspaceId}, ${type}, ${title.slice(0, 500)}, ${payload}, ${'pending_approval'}, NOW())
    `

    const approvalId = newId()
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id)
      VALUES (${approvalId}, ${workspaceId}, ${artifactId})
    `

    return NextResponse.json({ ok: true, artifactId, approvalId })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { artifactId, content_json } = await req.json()
    if (!artifactId || content_json === undefined) {
      return NextResponse.json({ error: 'Missing artifactId or content_json' }, { status: 400 })
    }
    // Sprint 7E: resolve artifact's workspace and assert ownership before
    // the UPDATE. Previously this endpoint accepted any artifactId and
    // rewrote content_json — a workspace-leakage bug for an authenticated
    // caller who guessed an ID.
    const wsRes = await sql`SELECT workspace_id FROM artifacts WHERE id = ${artifactId} LIMIT 1`
    const wsRow = wsRes.rows[0] as { workspace_id?: string } | undefined
    if (!wsRow?.workspace_id) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    const denied = assertWorkspaceOwnership(req, wsRow.workspace_id)
    if (denied) return denied
    await sql`UPDATE artifacts SET content_json = ${JSON.stringify(content_json)} WHERE id = ${artifactId} AND workspace_id = ${wsRow.workspace_id}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
