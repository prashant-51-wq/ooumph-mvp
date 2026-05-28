/**
 * /api/account/export — Sprint 7C
 *
 * GDPR-style data export. Returns a single JSON archive of every row
 * tied to the authenticated user + their workspace. Replaces the
 * previous `alert('Export initiated (demo)')` button on the Danger
 * Zone of /dashboard/settings.
 *
 * Response is application/json with a Content-Disposition: attachment
 * header so browsers download it as a file rather than displaying it.
 *
 * Scope of the export:
 *   - User profile (sans password_hash + salt)
 *   - Workspace + brand profile
 *   - Artifacts + approvals
 *   - Leads + activities + sales deals
 *   - Learning notes
 *   - Login events + active sessions metadata (no token hashes)
 *
 * Out of scope (would require dedicated streaming for size):
 *   - Generated media binaries (images, videos, voiceovers)
 *   - Full publish_log + post_metrics history (caps at 500 most recent)
 *
 * Each section caps at 1000 rows to keep the file from blowing up on
 * a high-volume workspace. If a user needs full history they can hit
 * dedicated endpoints — this is the "give me a portable snapshot" path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSessionUserId, assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'
export const maxDuration = 60

const ROW_CAP = 1000
const PUBLISH_CAP = 500

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  // Reject if caller passes a workspaceId they don't own. Mirrors the
  // pattern across the rest of the API.
  if (workspaceId) {
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
  }

  try {
    // User profile (without auth material).
    const userRes = await sql`SELECT id, email, name, is_admin, workspace_id, created_at FROM users WHERE id = ${userId} LIMIT 1`
    const user = userRes.rows[0] as Record<string, unknown> | undefined
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Resolve target workspace — query param wins, else user's primary.
    const targetWsId = workspaceId || (user.workspace_id as string | null) ||
      ((await sql`SELECT id FROM workspaces WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 1`).rows[0] as { id?: string } | undefined)?.id

    const sections: Record<string, unknown> = { user }

    if (targetWsId) {
      const [
        workspace, brand, artifacts, approvals,
        leads, activities, deals, learningNotes,
        sessions, loginEvents, publishLog,
      ] = await Promise.all([
        sql`SELECT * FROM workspaces WHERE id = ${targetWsId} LIMIT 1`,
        sql`SELECT * FROM brand_profiles WHERE workspace_id = ${targetWsId} LIMIT 1`,
        sql`SELECT * FROM artifacts WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        sql`SELECT * FROM approvals WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        sql`SELECT * FROM leads_captured WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        sql`SELECT * FROM lead_activities WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        sql`SELECT * FROM sales_deals WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        sql`SELECT * FROM learning_notes WHERE workspace_id = ${targetWsId} ORDER BY created_at DESC LIMIT ${ROW_CAP}`,
        // Session/login metadata — DO NOT include token_hash.
        sql`SELECT id, user_id, workspace_id, user_agent, ip, created_at, last_seen_at, revoked_at FROM user_sessions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`,
        sql`SELECT id, user_id, ip, user_agent, success, failure_reason, created_at FROM login_events WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 200`,
        sql`SELECT * FROM publish_log WHERE workspace_id = ${targetWsId} ORDER BY published_at DESC LIMIT ${PUBLISH_CAP}`,
      ])

      sections.workspace = workspace.rows[0] || null
      sections.brand_profile = brand.rows[0] || null
      sections.artifacts = artifacts.rows
      sections.approvals = approvals.rows
      sections.leads = leads.rows
      sections.lead_activities = activities.rows
      sections.sales_deals = deals.rows
      sections.learning_notes = learningNotes.rows
      sections.sessions = sessions.rows
      sections.login_events = loginEvents.rows
      sections.publish_log = publishLog.rows
    }

    const archive = {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      requestedBy: userId,
      workspaceId: targetWsId,
      caps: { rowCap: ROW_CAP, publishLogCap: PUBLISH_CAP },
      note: 'This archive includes structured workspace data only. Generated media (images/videos/audio) and full publish_log history beyond the cap are not included — request them separately if needed.',
      sections,
    }

    const json = JSON.stringify(archive, null, 2)
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ooumph-export-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('account/export error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
