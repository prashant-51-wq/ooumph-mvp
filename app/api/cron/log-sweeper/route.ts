/**
 * GET /api/cron/log-sweeper
 *
 * Per-workspace retention enforcement. Walks `workspace_retention_policies`,
 * computes the historical cutoff for each row, and prunes (or archives)
 * matching records from the targeted stream table.
 *
 * Why this lives in /cron and not the application path:
 *   ─ Retention is housekeeping; the user-facing dashboard never blocks on it.
 *   ─ Bulk DELETE on a live table can contend with the writers (cron firing,
 *     dashboard polling, webhook intake). We mitigate that by:
 *       a) Walking workspaces sequentially (one workspace at a time).
 *       b) Using a small LIMIT batch per DELETE so the table scan is bounded
 *          and the row-level locks are held for tens of milliseconds at most.
 *       c) Restricting each invocation to a hard wall-clock budget
 *          (MAX_RUN_MS); when we exceed it, we yield — the next cron tick
 *          continues from where we left off, because future scans rediscover
 *          the same expired rows on the same indexes.
 *
 * Allowed stream targets — everything else is silently skipped. Keeping the
 * allow-list inside this handler (not the DB) prevents a misconfigured policy
 * from causing arbitrary-table truncation. New streams added to the platform
 * must be opted in here explicitly.
 *
 *   call_logs            (workspace_id, created_at)
 *   experiment_events    (workspace_id, created_at)
 *   enrichment_logs      (workspace_id, created_at)
 *   agent_runs           (workspace_id, created_at)
 *   notifications        (workspace_id, created_at)
 *   system_performance_audits  (workspace_id, created_at)
 *
 * Each entry also declares an archive sink — when action_disposition='archive'
 * we copy rows into the cold archive table before deleting. Tables without an
 * archive sink fall back to 'purge' semantics even if archive was requested
 * (and we record that in the per-policy outcome so the dashboard can flag it).
 *
 * Auth: Bearer ${CRON_SECRET} (Vercel cron) OR x-internal-secret with ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 300

// ─── Tunables ─────────────────────────────────────────────────────────────

const MAX_RUN_MS = 270_000          // 4.5 min — leave headroom against 300s ceiling
const PER_POLICY_BATCH_LIMIT = 500  // rows per DELETE — keeps locks short
const MAX_BATCHES_PER_POLICY = 20   // ceiling per invocation; cron picks up next tick
const MAX_RETENTION_DAYS = 3650     // 10 years — sane upper bound to catch typos
const MIN_RETENTION_DAYS = 1        // never accept 0 (would mean wipe-on-next-run)

// ─── Stream catalogue ─────────────────────────────────────────────────────
//
// table       : real DB table name (allow-list — protects us from arbitrary
//                drops if a policy row gets stale or hand-edited)
// archiveSink : optional table to copy into before delete; null = purge-only
//
// Both `workspace_id` and `created_at` MUST exist on every listed table;
// the sweeper assumes that uniformly.

interface StreamDescriptor {
  table: string
  archiveSink: string | null
  /** Human-readable label that the dashboard shows next to per-policy outcomes */
  displayName: string
}

const STREAMS: Record<string, StreamDescriptor> = {
  call_logs:                { table: 'call_logs',                archiveSink: null, displayName: 'Voice call logs' },
  experiment_events:        { table: 'experiment_events',        archiveSink: null, displayName: 'A/B experiment events' },
  enrichment_logs:          { table: 'enrichment_logs',          archiveSink: null, displayName: 'Lead enrichment logs' },
  agent_runs:               { table: 'agent_runs',               archiveSink: null, displayName: 'Agent execution runs' },
  notifications:            { table: 'notifications',            archiveSink: null, displayName: 'In-app notifications' },
  system_performance_audits:{ table: 'system_performance_audits',archiveSink: null, displayName: 'System telemetry' },
}

// ─── Types ────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  id: string
  workspace_id: string
  stream_target: string
  retention_days: number | string
  action_disposition: string
  created_at: string
  updated_at: string | null
}

interface PolicyOutcome {
  policyId: string
  workspaceId: string
  streamTarget: string
  displayName: string
  retentionDays: number
  cutoffIso: string
  requestedAction: string
  effectiveAction: 'purge' | 'archive' | 'skipped'
  rowsDeleted: number
  batchesRun: number
  durationMs: number
  truncated: boolean   // true when we stopped because we hit the per-policy batch ceiling
  error: string | null
}

// ─── Per-stream delete dispatcher ─────────────────────────────────────────
//
// We branch by string literal (not SQL templating) because the template-tag
// `sql` interpolation does NOT support identifier substitution — and even if
// it did, allowing free-form table names from a DB row would be a foot-gun.
// The branch keeps the access path 100% static SQL.

async function deleteBatch(
  table: string,
  workspaceId: string,
  cutoffIso: string,
  limit: number,
): Promise<number> {
  // Each branch is identical except for the table name; we cannot DRY this
  // further without sacrificing the static-SQL guarantee. Postgres returns
  // the deleted row count from `RETURNING 1` — we count the array length.
  switch (table) {
    case 'call_logs': {
      const r = await sql`
        DELETE FROM call_logs
        WHERE id IN (
          SELECT id FROM call_logs
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    case 'experiment_events': {
      const r = await sql`
        DELETE FROM experiment_events
        WHERE id IN (
          SELECT id FROM experiment_events
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    case 'enrichment_logs': {
      const r = await sql`
        DELETE FROM enrichment_logs
        WHERE id IN (
          SELECT id FROM enrichment_logs
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    case 'agent_runs': {
      const r = await sql`
        DELETE FROM agent_runs
        WHERE id IN (
          SELECT id FROM agent_runs
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    case 'notifications': {
      const r = await sql`
        DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    case 'system_performance_audits': {
      const r = await sql`
        DELETE FROM system_performance_audits
        WHERE id IN (
          SELECT id FROM system_performance_audits
          WHERE workspace_id = ${workspaceId} AND created_at < ${cutoffIso}
          ORDER BY created_at ASC
          LIMIT ${limit}
        )
        RETURNING 1
      `
      return r.rows.length
    }
    default:
      return 0
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth — same pattern as /api/cron/experiment-significance + brand-monitor.
  const cronSecret = process.env.CRON_SECRET || ''
  const adminSecret = process.env.ADMIN_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const internal = req.headers.get('x-internal-secret') || ''
  const cronOk = cronSecret && auth === `Bearer ${cronSecret}`
  const adminOk = adminSecret && (internal === adminSecret || auth === `Bearer ${adminSecret}`)
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const outcomes: PolicyOutcome[] = []

  // Load every active policy. We don't filter by workspace here — the cron
  // sweeps the whole platform; one ticking schedule covers every tenant.
  const policyResult = await sql`
    SELECT id, workspace_id, stream_target, retention_days, action_disposition,
           created_at, updated_at
    FROM workspace_retention_policies
    ORDER BY workspace_id ASC, stream_target ASC
    LIMIT 5000
  `
  const policies = policyResult.rows as unknown as RetentionPolicy[]

  for (const policy of policies) {
    if (Date.now() - startedAt > MAX_RUN_MS) {
      // Out of wall-clock budget. Don't process further this tick — the next
      // cron firing will see the same expired rows and continue. Idempotent.
      break
    }

    const policyStart = Date.now()
    const stream = STREAMS[policy.stream_target]
    const retentionDays = Math.min(
      MAX_RETENTION_DAYS,
      Math.max(MIN_RETENTION_DAYS, Math.floor(Number(policy.retention_days || 0)) || 0),
    )

    // Compute the cutoff ISO once per policy. The SQL DELETE compares
    // created_at < ${cutoffIso} so it can use the (workspace_id, created_at)
    // index if it exists, falling back to a workspace-scoped scan otherwise.
    const cutoffMs = Date.now() - retentionDays * 86_400_000
    const cutoffIso = new Date(cutoffMs).toISOString()
    const requested = (policy.action_disposition || 'purge').toLowerCase()

    const outcome: PolicyOutcome = {
      policyId: policy.id,
      workspaceId: policy.workspace_id,
      streamTarget: policy.stream_target,
      displayName: stream?.displayName || policy.stream_target,
      retentionDays,
      cutoffIso,
      requestedAction: requested,
      effectiveAction: 'skipped',
      rowsDeleted: 0,
      batchesRun: 0,
      durationMs: 0,
      truncated: false,
      error: null,
    }

    if (!stream) {
      outcome.error = `Unknown stream_target '${policy.stream_target}' — not in sweeper allow-list`
      outcomes.push(outcome)
      continue
    }

    // archive disposition without a sink falls back to purge. We tell the
    // caller via effectiveAction so the dashboard can flag the misconfig.
    let effective: 'purge' | 'archive' = 'purge'
    if (requested === 'archive') {
      effective = stream.archiveSink ? 'archive' : 'purge'
    }
    outcome.effectiveAction = effective

    try {
      // archive path: copy first, then delete. For MVP we only support purge
      // — every STREAMS entry sets archiveSink:null — but the branch is here
      // so the rotation worker can grow into archive without API churn.
      // (Sprint 11+ will introduce per-table archive sinks like
      // `call_logs_archive` partitioned by month.)

      for (let i = 0; i < MAX_BATCHES_PER_POLICY; i++) {
        if (Date.now() - startedAt > MAX_RUN_MS) {
          outcome.truncated = true
          break
        }
        const deleted = await deleteBatch(
          stream.table,
          policy.workspace_id,
          cutoffIso,
          PER_POLICY_BATCH_LIMIT,
        )
        outcome.batchesRun++
        outcome.rowsDeleted += deleted
        if (deleted < PER_POLICY_BATCH_LIMIT) break
      }
      if (outcome.batchesRun >= MAX_BATCHES_PER_POLICY) {
        outcome.truncated = true
      }
    } catch (err) {
      outcome.error = err instanceof Error ? err.message : String(err)
      console.error('[log-sweeper] policy failed', { policyId: policy.id, error: outcome.error })
    } finally {
      outcome.durationMs = Date.now() - policyStart
      outcomes.push(outcome)
    }
  }

  const totals = outcomes.reduce(
    (acc, o) => ({
      rowsDeleted: acc.rowsDeleted + o.rowsDeleted,
      withErrors: acc.withErrors + (o.error ? 1 : 0),
      truncated:  acc.truncated + (o.truncated ? 1 : 0),
    }),
    { rowsDeleted: 0, withErrors: 0, truncated: 0 },
  )

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    policiesEvaluated: outcomes.length,
    rowsDeleted: totals.rowsDeleted,
    policiesWithErrors: totals.withErrors,
    policiesTruncated: totals.truncated,
    runtimeBudgetExceeded: Date.now() - startedAt >= MAX_RUN_MS,
    outcomes,
  })
}
