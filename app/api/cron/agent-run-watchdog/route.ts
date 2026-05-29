/**
 * /api/cron/agent-run-watchdog — Sprint 16D (audit P1 #13)
 *
 * Producer-side notification for failed agent runs.
 *
 * The audit found that `agent_runs.status='failed'` updates happen at dozens
 * of call sites (each agent route catches its own error and UPDATEs). None of
 * them write a notifications row. The bell never lit up for agent failures
 * — only the derived-read path in /api/notifications surfaced them, and
 * marking them as read was a no-op.
 *
 * Rather than sweep ~40 route files (high churn risk), this watchdog is the
 * single producer. It runs every 15 minutes, finds agent_runs.status='failed'
 * rows from the last 60 minutes that don't already have a corresponding
 * notification (`type='agent_run_failed'` keyed by source_id=run.id in body),
 * and INSERTs the missing notifications.
 *
 * Idempotent: re-running within the same window is a no-op because the
 * "already-notified" check uses the run id embedded in the notification.
 *
 * Auth: CRON_SECRET / Vercel Cron header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export const runtime = 'nodejs'

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const x = req.headers.get('x-internal-secret') || ''
  const vercelCronUA = req.headers.get('user-agent')?.includes('vercel-cron')
  if (vercelCronUA) return true
  if (cronSecret && (auth === `Bearer ${cronSecret}` || x === cronSecret)) return true
  if (adminSecret && (auth === `Bearer ${adminSecret}` || x === adminSecret)) return true
  return false
}

interface FailedRun {
  id: string
  workspace_id: string
  agent_name: string
  error_message?: string | null
  completed_at?: string | null
  created_at: string
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return handleSweep()
}
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return handleSweep()
}

async function handleSweep() {
  const sinceMs = Date.now() - 60 * 60_000
  const sinceIso = new Date(sinceMs).toISOString()

  // Pull recent failed runs.
  const runsRes = await sql`
    SELECT id, workspace_id, agent_name, error_message, completed_at, created_at
    FROM agent_runs
    WHERE status = 'failed'
      AND (completed_at >= ${sinceIso} OR (completed_at IS NULL AND created_at >= ${sinceIso}))
    ORDER BY created_at DESC
    LIMIT 200
  `
  const failedRuns = (runsRes.rows || []) as unknown as FailedRun[]
  if (failedRuns.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, notified: 0 })
  }

  // Pull existing 'agent_run_failed' notifications from the same window — we
  // key by the run.id embedded as `run:<id>` in the body so the existence
  // check is a single query rather than per-run.
  const notifsRes = await sql`
    SELECT body FROM notifications
    WHERE type = 'agent_run_failed' AND created_at >= ${sinceIso}
  `
  const seenRunIds = new Set<string>()
  for (const n of notifsRes.rows as { body?: string }[]) {
    const match = (n.body || '').match(/run:([a-zA-Z0-9-]+)/)
    if (match) seenRunIds.add(match[1])
  }

  let notified = 0
  for (const run of failedRuns) {
    if (seenRunIds.has(run.id)) continue
    const title = `${run.agent_name.replace(/_/g, ' ')} run failed`
    // Embed the run id in the body so the next sweep can dedup.
    const body = `${run.error_message || 'No error message'} (run:${run.id})`
    try {
      await sql`
        INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
        VALUES (
          ${newId()}, ${run.workspace_id}, 'agent_run_failed',
          ${title.slice(0, 200)}, ${body.slice(0, 500)},
          ${'/dashboard/agents'}, 'error',
          ${new Date().toISOString()}
        )
      `
      notified++
    } catch (err) {
      console.error('[agent-run-watchdog] insert failed:', err)
    }
  }

  return NextResponse.json({ ok: true, checked: failedRuns.length, notified })
}
