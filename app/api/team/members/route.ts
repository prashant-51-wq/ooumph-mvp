import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership, getSessionUserId } from '@/lib/guards'

// ─── GET: List team members ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const result = await sql`
      SELECT
        wm.user_id   AS "userId",
        u.name,
        u.email,
        wm.role,
        wm.joined_at AS "joinedAt",
        wm.status
      FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${workspaceId}
        AND wm.status = 'active'
      ORDER BY wm.joined_at ASC
    `

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[team/members GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Remove team member ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string; userId: string }
    const { workspaceId, userId } = body

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'workspaceId and userId are required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify the session user is the workspace owner
    const sessionUserId = getSessionUserId(req)
    const wsResult = await sql`
      SELECT user_id AS "ownerId" FROM workspaces WHERE id = ${workspaceId} LIMIT 1
    `
    const workspace = wsResult.rows[0] as { ownerId: string } | undefined
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Allow internal/admin bypass (assertWorkspaceOwnership already passed), but also
    // guard against a member trying to remove someone else — only the owner may do this.
    // We check session userId equals the workspace owner_id, falling back gracefully if
    // sessionUserId is null (internal service call scenario).
    if (sessionUserId && workspace.ownerId && sessionUserId !== workspace.ownerId) {
      return NextResponse.json({ error: 'Only the workspace owner can remove members' }, { status: 403 })
    }

    // Prevent owner from removing themselves
    if (userId === workspace.ownerId) {
      return NextResponse.json({ error: 'Cannot remove the workspace owner' }, { status: 400 })
    }

    // Soft-remove the member
    await sql`
      UPDATE workspace_members
      SET status = 'removed'
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${userId}
        AND status = 'active'
    `

    return NextResponse.json({ ok: true, userId })
  } catch (err) {
    console.error('[team/members DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
