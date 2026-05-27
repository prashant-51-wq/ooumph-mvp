'use client'

/**
 * /dashboard/system-health
 *
 * Live monitoring console driven by /api/system-health. Layout:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Header · window-picker dropdown (24h / 7d / 30d / 90d)              │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Tiles: Total Ops · Error Rate · p50 · p95 · p99 · Avg               │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Latency-over-time histogram (12 buckets, hover for detail)          │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  By Department bars — count · error rate · p95                       │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Recent Incidents Ledger — 25 most recent error rows in a            │
 *   │     monospace dark-code container with clip controls                 │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Auto-refresh: every 30 seconds when the page is visible.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, RefreshCw, AlertCircle, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Zap, Clock,
  Bug, ShieldCheck, ChevronDown, ChevronUp, X,
} from 'lucide-react'

// ─── Types (mirror /api/system-health) ────────────────────────────────────

interface OperationRollup {
  operationName: string
  departmentLabel: string
  count: number
  errorCount: number
  errorRate: number
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
  operations: number
}

interface TimeseriesPoint {
  bucketStart: string
  count: number
  avgDurationMs: number
  errorCount: number
  errorRate: number
}

interface RecentError {
  id: string
  operationName: string
  departmentLabel: string
  status: string
  errorCaptured: string | null
  durationMs: number
  createdAt: string
}

interface SystemHealthPayload {
  workspaceId: string
  samplingNote: string | null
  summary: {
    windowHours: number
    windowStart: string
    totalOperations: number
    errorCount: number
    errorRate: number
    avgDurationMs: number
    p50: number
    p95: number
    p99: number
  }
  byOperation: OperationRollup[]
  byDepartment: DepartmentRollup[]
  timeseries: TimeseriesPoint[]
  recentErrors: RecentError[]
}

interface WindowOption {
  hours: number
  label: string
}

const WINDOW_OPTIONS: WindowOption[] = [
  { hours: 1,    label: 'Last hour' },
  { hours: 24,   label: '24 hours' },
  { hours: 168,  label: '7 days' },
  { hours: 720,  label: '30 days' },
]

const REFRESH_MS = 30_000

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`
  return `${(ms / 60_000).toFixed(2)} min`
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '0%'
  if (rate === 0) return '0%'
  if (rate < 0.001) return '< 0.1%'
  return `${(rate * 100).toFixed(2)}%`
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function formatBucket(iso: string, windowHours: number): string {
  const d = new Date(iso)
  if (windowHours <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [data, setData] = useState<SystemHealthPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [windowHours, setWindowHours] = useState<number>(24)

  // ── Session ──
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(payload => {
        if (cancelled) return
        const id: string | null = payload?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  // ── Fetcher ──
  const fetchHealth = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/system-health?workspaceId=${workspaceId}&windowHours=${windowHours}`)
      const body = await res.json() as SystemHealthPayload | { error: string }
      if (!res.ok || 'error' in body) {
        throw new Error('error' in body ? body.error : `HTTP ${res.status}`)
      }
      setData(body)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, windowHours])

  useEffect(() => { if (workspaceId) fetchHealth() }, [workspaceId, fetchHealth])

  // Auto-refresh — pause when the tab is hidden so we don't burn API budget
  // for monitors no one is looking at.
  useEffect(() => {
    if (!workspaceId) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      fetchHealth()
    }
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [workspaceId, fetchHealth])

  // ── Derived ──
  const peakBucketCount = useMemo(
    () => Math.max(1, ...(data?.timeseries.map(b => b.count) || [1])),
    [data],
  )
  const peakBucketLatency = useMemo(
    () => Math.max(1, ...(data?.timeseries.map(b => b.avgDurationMs) || [1])),
    [data],
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Activity className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Live operational telemetry: latency percentiles, error rates, and incident drill-down
                across every department. Auto-refreshes every 30 seconds while this tab is visible.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WindowPicker value={windowHours} onChange={setWindowHours} />
            <button
              onClick={() => fetchHealth()}
              disabled={loading || !workspaceId}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-300">{error}</div>
          </div>
        )}

        {/* ── Sampling note ───────────────────────────────────────────── */}
        {data?.samplingNote && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">{data.samplingNote}</div>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading telemetry…</span>
          </div>
        ) : !data || data.summary.totalOperations === 0 ? (
          <EmptyState />
        ) : (
          <>
            <SummaryTiles summary={data.summary} />
            <Histogram
              series={data.timeseries}
              windowHours={data.summary.windowHours}
              peakBucketCount={peakBucketCount}
              peakBucketLatency={peakBucketLatency}
            />
            <DepartmentBars rows={data.byDepartment} />
            <RecentIncidentsLedger errors={data.recentErrors} />
          </>
        )}

      </div>
    </div>
  )
}

// ─── Window picker ────────────────────────────────────────────────────────

function WindowPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const [open, setOpen] = useState(false)
  const current = WINDOW_OPTIONS.find(o => o.hours === value) || WINDOW_OPTIONS[1]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition"
      >
        <Clock className="w-4 h-4 text-gray-400" />
        {current.label}
        {open ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 overflow-hidden">
            {WINDOW_OPTIONS.map(o => (
              <button
                key={o.hours}
                onClick={() => { onChange(o.hours); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  o.hours === value
                    ? 'bg-indigo-500/15 text-indigo-200'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
      <div className="inline-flex w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-4">
        <ShieldCheck className="w-6 h-6 text-emerald-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-100">All quiet on the wire</h3>
      <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
        No operations recorded in this window. Run an agent, send a campaign, or trigger any backend
        cron to start populating the telemetry ledger.
      </p>
    </div>
  )
}

// ─── Summary tiles ────────────────────────────────────────────────────────

function SummaryTiles({ summary }: { summary: SystemHealthPayload['summary'] }) {
  const errorRatePct = summary.errorRate * 100
  const errorColor =
    errorRatePct >= 5  ? { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-300' } :
    errorRatePct >= 1  ? { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-300' } :
                         { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-300' }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <Tile label="Total ops"   value={summary.totalOperations.toLocaleString()} icon={<Activity className="w-4 h-4" />} accent="indigo" />
      <div className={`p-4 rounded-lg border ${errorColor.bg} ${errorColor.border}`}>
        <div className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${errorColor.text} mb-2.5 ${errorColor.bg} border ${errorColor.border}`}>
          {errorRatePct >= 1 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        </div>
        <div className={`text-xl font-semibold tracking-tight ${errorColor.text}`}>{formatRate(summary.errorRate)}</div>
        <div className="text-xs text-gray-500 mt-0.5">Error rate · {summary.errorCount} fails</div>
      </div>
      <Tile label="Avg latency" value={formatMs(summary.avgDurationMs)} icon={<Zap className="w-4 h-4" />} accent="blue" />
      <Tile label="p50"         value={formatMs(summary.p50)}           icon={<Clock className="w-4 h-4" />} accent="indigo" />
      <Tile label="p95"         value={formatMs(summary.p95)}           icon={<Clock className="w-4 h-4" />} accent="amber" />
      <Tile label="p99"         value={formatMs(summary.p99)}           icon={<Clock className="w-4 h-4" />} accent="rose" />
    </div>
  )
}

function Tile({
  label, value, icon, accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent: 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple'
}) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400' },
    blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
    rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400' },
    purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  text: 'text-purple-400' },
  }
  const c = colors[accent]
  return (
    <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-800">
      <div className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${c.bg} ${c.border} border ${c.text} mb-2.5`}>
        {icon}
      </div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// ─── Latency histogram ────────────────────────────────────────────────────

function Histogram({
  series, windowHours, peakBucketCount, peakBucketLatency,
}: {
  series: TimeseriesPoint[]
  windowHours: number
  peakBucketCount: number
  peakBucketLatency: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const hoveredBucket = hovered !== null ? series[hovered] : null

  return (
    <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Latency across the window</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            12 evenly-spaced buckets · bar height = operation count · indigo line = avg latency
          </p>
        </div>
        {hoveredBucket && (
          <div className="text-xs text-gray-400 font-mono">
            <span className="text-gray-200">{hoveredBucket.count}</span> ops ·
            avg <span className="text-indigo-300">{formatMs(hoveredBucket.avgDurationMs)}</span> ·
            errors <span className={hoveredBucket.errorCount > 0 ? 'text-rose-300' : 'text-emerald-300'}>{hoveredBucket.errorCount}</span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-1 h-40">
        {series.map((b, i) => {
          const heightPct = (b.count / peakBucketCount) * 100
          const latencyPct = (b.avgDurationMs / peakBucketLatency) * 100
          const hasError = b.errorCount > 0
          const isHovered = hovered === i
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(prev => (prev === i ? null : prev))}
              className="flex-1 relative cursor-default group"
            >
              {/* Count bar */}
              <div
                className={`absolute bottom-0 left-0 right-0 rounded-t transition-all ${
                  hasError
                    ? 'bg-rose-500/25 group-hover:bg-rose-500/40'
                    : 'bg-indigo-500/25 group-hover:bg-indigo-500/40'
                } ${isHovered ? 'ring-1 ring-indigo-400/40' : ''}`}
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
              {/* Latency line indicator */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-indigo-400/70"
                style={{ bottom: `${Math.max(0, latencyPct)}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* X-axis */}
      <div className="flex items-center gap-1 mt-2">
        {series.map((b, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] text-gray-600 font-mono"
            style={{ visibility: i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2) ? 'visible' : 'hidden' }}
          >
            {formatBucket(b.bucketStart, windowHours)}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Department bars ──────────────────────────────────────────────────────

function DepartmentBars({ rows }: { rows: DepartmentRollup[] }) {
  if (rows.length === 0) return null
  const maxCount = Math.max(1, ...rows.map(r => r.count))

  return (
    <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">By department</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Operation volume rolled up by the prefix of <code className="font-mono text-gray-400">operation_name</code>.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500">
          {rows.length} department{rows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map(r => {
          const widthPct = (r.count / maxCount) * 100
          const errPct = r.errorRate * 100
          const errColor =
            errPct >= 5 ? 'text-rose-300'
            : errPct >= 1 ? 'text-amber-300'
            : 'text-emerald-300'
          return (
            <div key={r.departmentSlug} className="text-xs">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-gray-200 font-medium">{r.departmentLabel}</span>
                  <span className="text-gray-600 text-[10px] font-mono">
                    {r.operations} op{r.operations === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-gray-300">{r.count.toLocaleString()}</span>
                  <span className={errColor}>{formatRate(r.errorRate)}</span>
                  <span className="text-gray-400">p95 {formatMs(r.p95)}</span>
                </div>
              </div>
              <div className="h-2 bg-gray-800/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    errPct >= 5 ? 'bg-gradient-to-r from-rose-500 to-rose-400'
                    : errPct >= 1 ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                  }`}
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Recent Incidents Ledger ──────────────────────────────────────────────

function RecentIncidentsLedger({ errors }: { errors: RecentError[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Recent Incidents</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            25 most recent non-<code className="font-mono text-gray-400">ok</code> operations. Click an entry to expand the captured error.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
          <Bug className="w-3 h-3" />
          {errors.length} incident{errors.length === 1 ? '' : 's'}
        </div>
      </div>

      {errors.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-emerald-400 gap-2">
          <ShieldCheck className="w-5 h-5" />
          <span className="text-sm">No incidents in this window — all green.</span>
        </div>
      ) : (
        <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-800/60">
            {errors.map(e => {
              const expanded = expandedIds.has(e.id)
              const statusColor =
                e.status === 'timeout' ? 'text-amber-400'
                : e.status === 'rate_limited' ? 'text-purple-400'
                : 'text-rose-400'
              return (
                <div key={e.id} className="font-mono text-xs">
                  <button
                    onClick={() => toggle(e.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-900/60 transition flex items-start gap-3"
                  >
                    <span className={`mt-0.5 ${statusColor} flex-shrink-0`}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-200">{e.operationName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${statusColor} bg-gray-800/60`}>
                          {e.status}
                        </span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-500">{e.departmentLabel}</span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-500">{formatMs(e.durationMs)}</span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-500">{formatRelative(e.createdAt)}</span>
                      </div>
                      {!expanded && e.errorCaptured && (
                        <div className="text-gray-500 truncate mt-1">{e.errorCaptured}</div>
                      )}
                    </div>
                    {expanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                      : <ChevronDown className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                    }
                  </button>

                  {/* Expanded clip view */}
                  {expanded && (
                    <div className="px-4 pb-3 pt-1">
                      <div className="rounded-md bg-gray-900 border border-gray-800 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500">
                            Captured error
                          </div>
                          {e.errorCaptured && (
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation()
                                navigator.clipboard.writeText(e.errorCaptured || '').catch(() => { /* clipboard blocked */ })
                              }}
                              className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-indigo-300 transition"
                            >
                              Copy
                            </button>
                          )}
                        </div>
                        <pre className="text-[11px] text-rose-200/90 whitespace-pre-wrap break-words leading-relaxed">
{e.errorCaptured || '(no error message captured)'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

// Keep import shape stable across future cleanups
void X
