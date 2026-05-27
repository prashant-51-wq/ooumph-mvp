/**
 * GET /api/system-health
 *
 * Aggregates `system_performance_audits` into the metrics that drive the
 * /dashboard/system-health graphs.
 *
 *   ?workspaceId=…[&windowHours=24]
 *
 * Returns:
 *   • summary: total ops in window, avg latency, error rate, p50/p95/p99
 *   • byOperation: per-operation_name rollup (count, p50, p95, error rate)
 *   • byDepartment: same but bucketed into operational departments derived
 *                   from the operation_name prefix (e.g. 'email.send' → 'Email')
 *   • timeseries: 12 buckets across the window for the latency-over-time chart
 *   • recentErrors: 25 most-recent error rows (operation, timestamp, message)
 *
 * Performance posture:
 *   The composite index idx_perf_audits_workspace_op_recent (workspace_id,
 *   operation_name, created_at DESC) covers the per-operation rollup. The
 *   secondary idx_perf_audits_status (workspace_id, status, created_at DESC)
 *   covers the error-rate panel and the recent-errors list.
 *
 *   We pull at most AUDIT_PULL_LIMIT rows in one shot and do the math in JS.
 *   For workspaces with > AUDIT_PULL_LIMIT events in a 24h window the
 *   percentiles become representative-of-tail (the most recent N) rather
 *   than truly window-wide — documented in the response under
 *   `samplingNote`. Real-MVP volumes won't hit this; a future commit
 *   replaces the in-process math with SQL percentile_cont() when needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const AUDIT_PULL_LIMIT = 5000
const DEFAULT_WINDOW_HOURS = 24
const TIMESERIES_BUCKETS = 12

// ─── Department mapping ──────────────────────────────────────────────────
//
// operation_name convention is `<department>.<verb>` (e.g. `email.send`,
// `voice.transcribe`, `ads.deploy`). We bucket the prefix → display label.

const DEPARTMENT_LABELS: Record<string, string> = {
  email:        'Email',
  publishing:   'Publishing',
  ads:          'Paid Ads',
  leads:        'Lead Gen',
  crm:          'CRM',
  pr:           'PR & Reputation',
  creative:     'Creative Studio',
  experiments:  'Growth',
  voice:        'Voice AI',
  webhooks:     'Webhooks',
  integrations: 'Integrations',
  agents:       'AI Agents',
  cron:         'Cron Workers',
  system:       'Platform',
}

function departmentOf(operationName: string): { slug: string; label: string } {
  const prefix = operationName.split('.')[0]?.toLowerCase() || 'system'
  return { slug: prefix, label: DEPARTMENT_LABELS[prefix] || prefix.replace(/_/g, ' ') }
}

// ─── Types ────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string
  workspace_id: string
  operation_name: string
  duration_ms: number | string
  status: string
  error_captured: string | null
  created_at: string
}

interface NormalisedAudit {
  id: string
  operationName: string
  departmentSlug: string
  departmentLabel: string
  durationMs: number
  status: string
  errorCaptured: string | null
  createdAt: string
  createdAtMs: number
}

interface OperationRollup {
  operationName: string
  departmentLabel: string
  count: number
  errorCount: number
  errorRate: number      // 0..1
  avgDurationMs: number
  p50: number
  p95: number
  p99: number
}

interface DepartmentRollup {
  departmentSlug: string
  departmentLabel: string
  count: number
  errorCount: number
  errorRate: number
  avgDurationMs: number
  p95: number
  operations: number     // distinct operation_names in this department
}

interface TimeseriesPoint {
  bucketStart: string
  count: number
  avgDurationMs: number
  errorCount: number
  errorRate: number
}

// ─── Stats helpers ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const w = rank - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

// ─── Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const windowHours = Math.max(1, Math.min(720, Number(searchParams.get('windowHours') || DEFAULT_WINDOW_HOURS) || DEFAULT_WINDOW_HOURS))
  const windowStartMs = Date.now() - windowHours * 3_600_000
  const windowStartIso = new Date(windowStartMs).toISOString()

  const pull = await sql`
    SELECT id, workspace_id, operation_name, duration_ms, status, error_captured, created_at
    FROM system_performance_audits
    WHERE workspace_id = ${workspaceId} AND created_at >= ${windowStartIso}
    ORDER BY created_at DESC
    LIMIT ${AUDIT_PULL_LIMIT}
  `
  const rows = pull.rows as unknown as AuditRow[]
  const samplingNote: string | null = rows.length >= AUDIT_PULL_LIMIT
    ? `Window contains ≥ ${AUDIT_PULL_LIMIT} audit rows; percentiles reflect the most recent ${AUDIT_PULL_LIMIT} only.`
    : null

  const audits: NormalisedAudit[] = rows.map(r => {
    const dept = departmentOf(r.operation_name)
    return {
      id: r.id,
      operationName: r.operation_name,
      departmentSlug: dept.slug,
      departmentLabel: dept.label,
      durationMs: Math.max(0, Number(r.duration_ms || 0)),
      status: r.status,
      errorCaptured: r.error_captured,
      createdAt: r.created_at,
      createdAtMs: new Date(r.created_at).getTime(),
    }
  })

  // ── Summary ────────────────────────────────────────────────────────────
  const durations = audits.map(a => a.durationMs).sort((a, b) => a - b)
  const errorCount = audits.filter(a => a.status !== 'ok').length
  const summary = {
    windowHours,
    windowStart: windowStartIso,
    totalOperations: audits.length,
    errorCount,
    errorRate: audits.length === 0 ? 0 : errorCount / audits.length,
    avgDurationMs: Math.round(mean(durations)),
    p50: Math.round(percentile(durations, 50)),
    p95: Math.round(percentile(durations, 95)),
    p99: Math.round(percentile(durations, 99)),
  }

  // ── Per-operation rollup ───────────────────────────────────────────────
  const opGroups = new Map<string, NormalisedAudit[]>()
  for (const a of audits) {
    const arr = opGroups.get(a.operationName) || []
    arr.push(a)
    opGroups.set(a.operationName, arr)
  }
  const byOperation: OperationRollup[] = Array.from(opGroups.entries()).map(([op, arr]) => {
    const ds = arr.map(a => a.durationMs).sort((a, b) => a - b)
    const errs = arr.filter(a => a.status !== 'ok').length
    return {
      operationName: op,
      departmentLabel: arr[0].departmentLabel,
      count: arr.length,
      errorCount: errs,
      errorRate: errs / arr.length,
      avgDurationMs: Math.round(mean(ds)),
      p50: Math.round(percentile(ds, 50)),
      p95: Math.round(percentile(ds, 95)),
      p99: Math.round(percentile(ds, 99)),
    }
  }).sort((a, b) => b.count - a.count)

  // ── Per-department rollup ──────────────────────────────────────────────
  const deptGroups = new Map<string, { ops: Set<string>; rows: NormalisedAudit[] }>()
  for (const a of audits) {
    const slot = deptGroups.get(a.departmentSlug) || { ops: new Set<string>(), rows: [] }
    slot.ops.add(a.operationName)
    slot.rows.push(a)
    deptGroups.set(a.departmentSlug, slot)
  }
  const byDepartment: DepartmentRollup[] = Array.from(deptGroups.entries()).map(([slug, slot]) => {
    const ds = slot.rows.map(a => a.durationMs).sort((a, b) => a - b)
    const errs = slot.rows.filter(a => a.status !== 'ok').length
    return {
      departmentSlug: slug,
      departmentLabel: DEPARTMENT_LABELS[slug] || slug,
      count: slot.rows.length,
      errorCount: errs,
      errorRate: errs / slot.rows.length,
      avgDurationMs: Math.round(mean(ds)),
      p95: Math.round(percentile(ds, 95)),
      operations: slot.ops.size,
    }
  }).sort((a, b) => b.count - a.count)

  // ── Time-series buckets ────────────────────────────────────────────────
  const totalWindowMs = windowHours * 3_600_000
  const bucketMs = Math.max(60_000, Math.floor(totalWindowMs / TIMESERIES_BUCKETS))
  const buckets: TimeseriesPoint[] = []
  for (let i = 0; i < TIMESERIES_BUCKETS; i++) {
    const start = windowStartMs + i * bucketMs
    const end = i === TIMESERIES_BUCKETS - 1 ? Date.now() : start + bucketMs
    const inBucket = audits.filter(a => a.createdAtMs >= start && a.createdAtMs < end)
    const errs = inBucket.filter(a => a.status !== 'ok').length
    buckets.push({
      bucketStart: new Date(start).toISOString(),
      count: inBucket.length,
      avgDurationMs: Math.round(mean(inBucket.map(a => a.durationMs))),
      errorCount: errs,
      errorRate: inBucket.length === 0 ? 0 : errs / inBucket.length,
    })
  }

  // ── Recent errors (25 most recent non-ok rows in window) ───────────────
  const recentErrors = audits
    .filter(a => a.status !== 'ok')
    .slice(0, 25)
    .map(a => ({
      id: a.id,
      operationName: a.operationName,
      departmentLabel: a.departmentLabel,
      status: a.status,
      errorCaptured: a.errorCaptured ? a.errorCaptured.slice(0, 600) : null,
      durationMs: a.durationMs,
      createdAt: a.createdAt,
    }))

  return NextResponse.json({
    workspaceId,
    samplingNote,
    summary,
    byOperation,
    byDepartment,
    timeseries: buckets,
    recentErrors,
  })
}
