import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership, getSessionUserId } from '@/lib/guards'
import { Resend } from 'resend'
import crypto from 'crypto'

// ─── POST: Send invite ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      email: string
      role: 'admin' | 'member' | 'viewer'
    }
    const { workspaceId, email, role } = body

    if (!workspaceId || !email || !role) {
      return NextResponse.json({ error: 'workspaceId, email, and role are required' }, { status: 400 })
    }
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'role must be admin, member, or viewer' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const invitedBy = getSessionUserId(req)

    // Get workspace name for the email
    const wsResult = await sql`SELECT name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    if (!wsResult.rows[0]) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    const workspaceName = wsResult.rows[0].name as string

    // Check if user already has active access to this workspace
    const existingMember = await sql`
      SELECT wm.id
      FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${workspaceId}
        AND u.email = ${email}
        AND wm.status = 'active'
      LIMIT 1
    `
    if (existingMember.rows[0]) {
      return NextResponse.json({ error: 'User already has access to this workspace' }, { status: 409 })
    }

    // Check for an existing pending invite for this email
    const existingInvite = await sql`
      SELECT id FROM workspace_invites
      WHERE workspace_id = ${workspaceId}
        AND email = ${email}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `
    if (existingInvite.rows[0]) {
      return NextResponse.json({ error: 'A pending invite already exists for this email' }, { status: 409 })
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex')
    const inviteId = newId()
    // Expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await sql`
      INSERT INTO workspace_invites (id, workspace_id, email, role, token, status, invited_by, expires_at)
      VALUES (${inviteId}, ${workspaceId}, ${email}, ${role}, ${token}, 'pending', ${invitedBy}, ${expiresAt})
    `

    // Send invite email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const acceptUrl = `${baseUrl}/invite/${token}`
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.com',
      to: email,
      subject: `You've been invited to join ${workspaceName} on Ooumph`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 16px">You've been invited!</h2>
          <p style="margin:0 0 12px;color:#374151">
            You've been invited to join <strong>${workspaceName}</strong> on Ooumph as a <strong>${role}</strong>.
          </p>
          <p style="margin:0 0 24px;color:#374151">
            Click the link below to accept the invitation. This link expires in 7 days.
          </p>
          <a
            href="${acceptUrl}"
            style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:600"
          >
            Accept Invitation
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#6B7280">
            Or copy this link: ${acceptUrl}
          </p>
        </div>
      `,
    })
    } // end if resendKey

    // Sprint 16D (audit P1 #20): surface "email not sent" so the user
    // knows to copy the inviteUrl manually. Previously this silently
    // succeeded — invitee never got the link, inviter thought they did.
    const emailSent = !!resendKey
    if (!emailSent) {
      console.warn(`[team/invite] RESEND_API_KEY missing — invite for ${email} created but no email was dispatched. Use inviteUrl to share manually.`)
    }
    return NextResponse.json({
      ok: true,
      inviteId,
      email,
      inviteUrl: acceptUrl,
      emailSent,
      ...(emailSent ? {} : { warning: 'Email not sent — RESEND_API_KEY missing. Share the inviteUrl manually.' }),
    })
  } catch (err) {
    console.error('[team/invite POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET: List pending invites ─────────────────────────────────────────────────

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
      SELECT id, workspace_id, email, role, status, invited_by, expires_at, created_at
      FROM workspace_invites
      WHERE workspace_id = ${workspaceId}
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[team/invite GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Revoke invite ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { workspaceId: string; inviteId: string }
    const { workspaceId, inviteId } = body

    if (!workspaceId || !inviteId) {
      return NextResponse.json({ error: 'workspaceId and inviteId are required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const result = await sql`
      UPDATE workspace_invites
      SET status = 'expired'
      WHERE id = ${inviteId}
        AND workspace_id = ${workspaceId}
        AND status = 'pending'
    `

    // Check if any row was affected (sqlite returns rows: [], postgres returns affected count via rows)
    // We re-query to confirm
    const check = await sql`
      SELECT id FROM workspace_invites WHERE id = ${inviteId} AND status = 'expired' LIMIT 1
    `
    if (!check.rows[0] && result.rows.length === 0) {
      return NextResponse.json({ error: 'Invite not found or already revoked' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, inviteId })
  } catch (err) {
    console.error('[team/invite DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
