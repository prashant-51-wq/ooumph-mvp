'use client'

/**
 * <LinkClickROIWidget />
 *
 * Two-up dashboard widget for click-attribution ROI:
 *
 *   ┌─────────────────────┐  ┌──────────────────────────────────────┐
 *   │  TOTAL CLICKS       │  │   ▁▃▅▇█▆▄                            │
 *   │  1,240              │  │   ━━━━━━━━━━━━━━━━━━━━━━━━━           │
 *   │  ↑ +18% vs last wk  │  │   Mon  Tue  Wed  Thu  Fri  Sat  Sun  │
 *   └─────────────────────┘  └──────────────────────────────────────┘
 *
 * Polls /api/links/analytics?days=14 (we need 14 days so we can compute
 * "vs last week" by comparing the trailing-7 vs the prior-7). The mini
 * chart renders the most recent 7 days only.
 *
 * Self-resolves workspaceId from /api/auth/me so it can drop into any
 * dashboard view with zero props. Falls back gracefully on empty / error.
 *
 * Pure SVG sparkline — no chart library dependency. Renders responsively
 * via viewBox + preserveAspectRatio so it scales cleanly to any width.
 */

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, MousePointerClick, Minus } from 'lucide-react'

interface DailyPoint {
  date: string
  clicks: number
}

interface AnalyticsResponse {
  totalClicks: number
  windowDays: number
  dailySeries: DailyPoint[]
  topLinks: Array<{ slug: string; original_url: string; channel: string | null; click_count: number }>
  byChannel: Record<string, number>
}

interface WidgetState {
  status: 'loading' | 'empty' | 'ready' | 'error'
  totalClicks: number
  last7Total: number
  prior7Total: number
  weeklyDelta: number | null      // null when prior week has zero clicks (avoid /0)
  series7: DailyPoint[]
  errorMsg?: string
}

const POLL_MS = 60_000

export interface LinkClickROIWidgetProps {
  /** Optionally override the workspace (defaults to session workspace). */
  workspaceId?: string | null
  /** Compact mode renders single-column for narrow rails. Default: stacked. */
  compact?: boolean
  /** Optional className for the outer wrapper. */
  className?: string
}

export default function LinkClickROIWidget({
  workspaceId: workspaceIdProp,
  compact = false,
  className = '',
}: LinkClickROIWidgetProps) {
  const [resolvedWid, setResolvedWid] = useState<string | null>(workspaceIdProp ?? null)
  const [state, setState] = useState<WidgetState>({
    status: 'loading',
    totalClicks: 0,
    last7Total: 0,
    prior7Total: 0,
    weeklyDelta: null,
    series7: [],
  })

  // Resolve workspace id once if not supplied by parent.
  useEffect(() => {
    if (workspaceIdProp) { setResolvedWid(workspaceIdProp); return }
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const wid: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setResolvedWid(wid)
      })
      .catch(() => { if (!cancelled) setResolvedWid(null) })
    return () => { cancelled = true }
  }, [workspaceIdProp])

  // Fetch + poll analytics. We pull 14 days so we can compute a real
  // week-over-week delta.
  useEffect(() => {
    if (!resolvedWid) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/links/analytics?workspaceId=${resolvedWid}&days=14`)
        if (!res.ok) {
          if (cancelled) return
          setState(s => ({ ...s, status: 'error', errorMsg: `HTTP ${res.status}` }))
          return
        }
        const data = await res.json() as AnalyticsResponse
        if (cancelled) return

        const series14 = Array.isArray(data.dailySeries) ? data.dailySeries : []
        const last7 = series14.slice(-7)
        const prior7 = series14.slice(0, Math.max(0, series14.length - 7))
        const last7Total = last7.reduce((a, p) => a + (p.clicks || 0), 0)
        const prior7Total = prior7.reduce((a, p) => a + (p.clicks || 0), 0)
        const weeklyDelta = prior7Total > 0
          ? ((last7Total - prior7Total) / prior7Total) * 100
          : (last7Total > 0 ? 100 : null)

        setState({
          status: (data.totalClicks === 0 && series14.every(p => p.clicks === 0)) ? 'empty' : 'ready',
          totalClicks: Number(data.totalClicks || 0),
          last7Total,
          prior7Total,
          weeklyDelta,
          series7: last7,
        })
      } catch (err) {
        if (cancelled) return
        setState(s => ({ ...s, status: 'error', errorMsg: err instanceof Error ? err.message : String(err) }))
      }
    }

    load()
    const t = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [resolvedWid])

  const containerClass = `${compact ? 'flex flex-col gap-3' : 'grid grid-cols-1 sm:grid-cols-5 gap-3'} ${className}`

  return (
    <div className={containerClass}>
      {/* ─── Left: total clicks card ──────────────────────────────────────── */}
      <div className={`${compact ? '' : 'sm:col-span-2'} bg-gray-900 border border-gray-800 rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Total Clicks</p>
          <MousePointerClick className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="text-3xl font-bold text-white tabular-nums">
          {state.status === 'loading' ? <SkeletonNumber />
            : (state.totalClicks || 0).toLocaleString()}
        </div>
        <DeltaPill state={state} />
        <p className="text-[10px] text-gray-600 mt-1">All-time, tracked redirector clicks</p>
      </div>

      {/* ─── Right: 7-day sparkline ───────────────────────────────────────── */}
      <div className={`${compact ? '' : 'sm:col-span-3'} bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">7-Day Trend</p>
          <p className="text-[11px] text-gray-500 tabular-nums">{state.last7Total.toLocaleString()} clicks</p>
        </div>
        <Sparkline series={state.series7} status={state.status} />
      </div>
    </div>
  )
}

// ─── Δ pill ────────────────────────────────────────────────────────────────

function DeltaPill({ state }: { state: WidgetState }) {
  if (state.status === 'loading') return <div className="h-4 mt-2 w-32 bg-gray-800 rounded animate-pulse" />
  if (state.status === 'error') return <p className="mt-2 text-[11px] text-rose-400">Failed to load · {state.errorMsg || 'unknown'}</p>
  if (state.status === 'empty') return <p className="mt-2 text-[11px] text-gray-600">No clicks yet — publish a tracked post to start</p>

  const delta = state.weeklyDelta
  if (delta === null) {
    return (
      <p className="mt-1 text-[11px] text-gray-500 inline-flex items-center gap-1">
        <Minus className="w-3 h-3" /> No prior-week baseline yet
      </p>
    )
  }
  const up = delta >= 0
  const Icon = up ? TrendingUp : TrendingDown
  const color = up ? 'text-emerald-400' : 'text-rose-400'
  const sign = up ? '+' : ''
  return (
    <p className={`mt-1 text-[11px] inline-flex items-center gap-1 font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {sign}{delta.toFixed(1)}% vs last week
    </p>
  )
}

// ─── Sparkline (pure SVG) ──────────────────────────────────────────────────

function Sparkline({ series, status }: { series: DailyPoint[]; status: WidgetState['status'] }) {
  if (status === 'loading') {
    return <div className="flex-1 min-h-[60px] bg-gray-800/50 rounded animate-pulse" />
  }
  if (status === 'error') {
    return <div className="flex-1 min-h-[60px] flex items-center justify-center text-rose-400 text-xs">Chart unavailable</div>
  }
  if (status === 'empty' || series.length === 0 || series.every(p => p.clicks === 0)) {
    return (
      <div className="flex-1 min-h-[60px] flex items-center justify-center text-gray-600 text-xs">
        ▁▁▁▁▁▁▁ &nbsp; awaiting clicks
      </div>
    )
  }

  // Layout: 100x36 viewBox; path scales horizontally to fill container.
  const VB_W = 100
  const VB_H = 36
  const TOP_PAD = 4
  const BOTTOM_PAD = 4
  const maxClicks = Math.max(...series.map(p => p.clicks), 1)
  const stepX = series.length > 1 ? VB_W / (series.length - 1) : VB_W
  const usableH = VB_H - TOP_PAD - BOTTOM_PAD

  const points = series.map((p, i) => {
    const x = i * stepX
    const y = TOP_PAD + (1 - p.clicks / maxClicks) * usableH
    return { x, y, ...p }
  })
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  // Fill area under line
  const areaD = `${pathD} L ${VB_W} ${VB_H} L 0 ${VB_H} Z`

  const lastY = points[points.length - 1].y
  const trendingUp = points[points.length - 1].clicks >= (points[0]?.clicks || 0)
  const strokeColor = trendingUp ? '#34d399' : '#f87171' // emerald-400 / rose-400
  const fillColor = trendingUp ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)'

  return (
    <div className="flex-1 flex flex-col">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-[60px]"
        preserveAspectRatio="none"
        aria-label="7-day click trend"
      >
        {/* baseline (subtle) */}
        <line x1="0" y1={VB_H - BOTTOM_PAD} x2={VB_W} y2={VB_H - BOTTOM_PAD} stroke="rgba(75,85,99,0.4)" strokeWidth="0.4" />
        <path d={areaD} fill={fillColor} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* trailing dot */}
        <circle cx={VB_W} cy={lastY} r="1.5" fill={strokeColor} />
      </svg>
      {/* Day labels */}
      <div className="flex justify-between mt-1 text-[10px] text-gray-600 tabular-nums">
        {series.map((p) => (
          <span key={p.date} title={`${p.date}: ${p.clicks} clicks`} className="flex-1 text-center">
            {weekdayShort(p.date)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function weekdayShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)
  } catch { return '' }
}

function SkeletonNumber() {
  return <div className="h-8 w-24 bg-gray-800 rounded animate-pulse" />
}
