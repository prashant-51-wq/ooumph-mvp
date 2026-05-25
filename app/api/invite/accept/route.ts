import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import crypto from 'crypto'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha256').toString('hex')
}

interface InviteRow {
  id: string
  workspace_id: string
  email: string
  role: string
  token: string
  status: string
  invited_by: string | null
  expires_at: string
}

interface WorkspaceRow {
  id: string
  name: string
  owner_email: string
}

interface UserRow {
  id: string
  email: string
  name: string
}

interface InviterRow {
  name: string
  email: string
}

// ─── GET: Verify token and return invite details ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    const inviteResult = await sql`
      SELECT id, workspace_id, email, role, status, invited_by, expires_at
      FROM workspace_invites
      WHERE token = ${token}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `
    const invite = inviteResult.rows[0] as unknown as InviteRow | undefined

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found, already used, or expired' }, { status: 404 })
    }

    // Get workspace info
    const wsResult = await sql`
      SELECT id, name FROM workspaces WHERE id = ${invite.workspace_id} LIMIT 1
    `
    const workspace = wsResult.rows[0] as unknown as WorkspaceRow | undefined
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Get inviter info if available
    let inviter: { name: string; email: string } | null = null
    if (invite.invited_by) {
      const inviterResult = await sql`
        SELECT name, email FROM users WHERE id = ${invite.invited_by} LIMIT 1
      `
      const inviterRow = inviterResult.rows[0] as unknown as InviterRow | undefined
      if (inviterRow) {
        inviter = { name: inviterRow.name, email: inviterRow.email }
      }
    }

    // Check if a user account already exists for this email
    const userResult = await sql`
      SELECT id FROM users WHERE email = ${invite.email} LIMIT 1
    `
    const userExists = !!userResult.rows[0]

    return NextResponse.json({
      ok: true,
      invite: {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expires_at,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      inviter,
      userExists,
    })
  } catch (err) {
    console.error('[invite/accept GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST: Accept invite ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      token: string
      password?: string
      name?: string
    }
    const { token, password, name } = body

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    // Find valid invite
    const inviteResult = await sql`
      SELECT id, workspace_id, email, role, status, invited_by, expires_at
      FROM workspace_invites
      WHERE token = ${token}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `
    const invite = inviteResult.rows[0] as unknown as InviteRow | undefined

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found, already used, or expired' }, { status: 404 })
    }

    const { workspace_id: workspaceId, email, role } = invite

    // Resolve or create the user
    let userId: string

    const existingUserResult = await sql`
      SELECT id, email, name FROM users WHERE email = ${email} LIMIT 1
    `
    const existingUser = existingUserResult.rows[0] as unknown as UserRow | undefined

    if (existingUser) {
      // User already exists — just use their account
      userId = existingUser.id
    } else {
      // User does not exist — require name + password to create one
      if (!name || !password) {
        return NextResponse.json(
          { error: 'name and password are required to create a new account' },
          { status: 400 },
        )
      }
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      const salt = crypto.randomBytes(16).toString('hex')
      const passwordHash = hashPassword(password, salt)
      userId = newId()

      await sql`
        INSERT INTO users (id, email, name, password_hash, salt)
        VALUES (${userId}, ${email}, ${name}, ${passwordHash}, ${salt})
      `
    }

    // Check if the user is already a member of this workspace
    const existingMember = await sql`
      SELECT id FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${userId}
      LIMIT 1
    `

    if (existingMember.rows[0]) {
      // Reactivate if previously removed
      await sql`
        UPDATE workspace_members
        SET status = 'active', role = ${role}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `
    } else {
      // Add to workspace_members
      const memberId = newId()
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role, invited_by, status)
        VALUES (${memberId}, ${workspaceId}, ${userId}, ${role}, ${invite.invited_by}, 'active')
      `
    }

    // Mark invite as accepted
    await sql`
      UPDATE workspace_invites
      SET status = 'accepted'
      WHERE id = ${invite.id}
    `

    return NextResponse.json({
      ok: true,
      workspaceId,
      redirectTo: '/dashboard',
    })
  } catch (err) {
    console.error('[invite/accept POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
