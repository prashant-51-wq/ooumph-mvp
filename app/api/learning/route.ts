import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const sourcePrefix = searchParams.get('sourcePrefix') // e.g. 'repurpose'
  if (!workspaceId) return NextResponse.json([])
  // Sprint 7E: session must own this workspace.
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const result = sourcePrefix
    ? await sql`
        SELECT ln.*, a.type as artifact_type, a.title as artifact_title
        FROM learning_notes ln
        LEFT JOIN artifacts a ON a.id = ln.source_id
        WHERE ln.workspace_id = ${workspaceId}
          AND ln.source_type LIKE ${sourcePrefix + '%'}
        ORDER BY ln.created_at DESC
      `
    : await sql`
        SELECT ln.*, a.type as artifact_type, a.title as artifact_title
        FROM learning_notes ln
        LEFT JOIN artifacts a ON a.id = ln.source_id
        WHERE ln.workspace_id = ${workspaceId}
        ORDER BY ln.created_at DESC
      `
  return NextResponse.json(result.rows)
}

// POST /api/learning — Create a learning_note (used by the Repurpose page to
// feed items into the CMO Brief).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, note, sourceType, sourceId, confidence } = body as {
      workspaceId: string
      note: string
      sourceType?: string
      sourceId?: string
      confidence?: number
    }

    if (!workspaceId || !note) {
      return NextResponse.json({ error: 'workspaceId and note are required' }, { status: 400 })
    }
    // Sprint 7E: session must own this workspace.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    const conf = typeof confidence === 'number' ? Math.min(1, Math.max(0, confidence)) : 0.8

    await sql`
      INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
      VALUES (
        ${id},
        ${workspaceId},
        ${sourceType || 'manual'},
        ${sourceId || null},
        ${note},
        ${conf},
        NOW()
      )
    `

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
