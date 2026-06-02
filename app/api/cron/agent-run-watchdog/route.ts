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
import { sql } from '@/lib/db'
import { notifyAgentRunFailed } from '@/lib/notifications'

export const runtime = 'nodejs'

function isCronAuthorized(req: NextRequest): boolean {
  // Sprint 18Z (audit pass #8 P0): UA-only auth was spoofable — any
  // client can send `User-Agent: ...vercel-cron...`. Removed. Vercel
  // Cron automatically sends `Authorization: Bearer ${CRON_SECRET}`
  // when CRON_SECRET is set in the project env, which is the path we
  // rely on now.
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const x = req.headers.get('x-internal-secret') || ''
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
    // Sprint 18H: route through the notifyAgentRunFailed helper so the
    // workspace opt-out toggle (notifications.inApp.agentTasks) is
    // honoured. Helper appends the run:<id> marker that the dedup check
    // above keys on, so re-runs within the 60-min window stay no-op.
    try {
      await notifyAgentRunFailed(
        run.workspace_id,
        run.agent_name.replace(/_/g, ' '),
        `${run.error_message || 'No error message'} (run:${run.id})`,
        run.id,
      )
      notified++
    } catch (err) {
      console.error('[agent-run-watchdog] notify failed:', err)
    }
  }

  return NextResponse.json({ ok: true, checked: failedRuns.length, notified })
}
