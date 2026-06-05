/**
 * GET /api/form-submissions?workspaceId=…&limit=20[&funnelStepId=…]
 *
 * Sprint 17H (audit pass #3 P2 #43) — exposes the canonical
 * form_submissions table for the funnel-analytics page. Previously the
 * page joined lead_activities of type='form_submitted', which could
 * under-count when the activity write failed (it's wrapped in
 * best-effort try/catch in app/api/f/submit/route.ts:262). The activity
 * miss didn't roll back the actual form_submissions insert, so reading
 * from the activities table silently lost rows. Read from the source.
 *
 * Auth: workspace ownership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 20), 1), 200)
  const funnelStepId = searchParams.get('funnelStepId')

  const rows = funnelStepId
    ? await sql`
        SELECT id, workspace_id, funnel_step_id, email, submitted_data, created_at
        FROM form_submissions
        WHERE workspace_id = ${workspaceId} AND funnel_step_id = ${funnelStepId}
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : await sql`
        SELECT id, workspace_id, funnel_step_id, email, submitted_data, created_at
        FROM form_submissions
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC LIMIT ${limit}
      `
  return NextResponse.json(rows.rows)
}
