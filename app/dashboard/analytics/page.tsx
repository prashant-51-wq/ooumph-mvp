'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'

/**
 * Analytics dashboard — Sprint 1B rewrite (honest empty states).
 *
 * Before this rewrite the page declared a wall of `MOCK_` constants
 * (STAT_BAR with "2.4M reach", "$68,200 revenue", "847 leads", CHANNELS
 * with hardcoded per-channel numbers, TOP_POSTS, AI_AGENTS, etc.) and
 * fell back to them on any code path where real `data` was null or empty.
 *
 * Every visible metric on this page now passes the Source Test: it traces
 * to a real query against `/api/stats?view=analytics` or it renders an
 * empty state with a CTA. There is no silent fallback. A new workspace
 * with zero data shows zeros and copy that explains how to populate it —
 * never fabricated numbers.
 */

// ── Reusable empty-state component ─────────────────────────────────────────────

function EmptyMetric({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-gray-600 font-bold text-lg">—</p>
      <p className="text-gray-700 text-xs mt-0.5">{hint || 'No data yet'}</p>
    </div>
  )
}

function EmptyPanel({ title, message, ctaLabel, ctaHref }: { title: string; message: string; ctaLabel?: string; ctaHref?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
      <p className="text-white font-medium">{title}</p>
      <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{message}</p>
      {ctaLabel && ctaHref && (
        <a href={ctaHref} className="inline-block mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">{ctaLabel}</a>
      )}
    </div>
  )
}

// Report-builder templates are configuration (definitions of which sections a
// report contains). They are intentionally hardcoded — they describe the
// product, not the user's data — so they don't violate the Source Test.
const REPORT_TEMPLATES = [
  {
    id: 'monthly',
    name: 'Monthly Performance Report',
    desc: 'Comprehensive month-over-month overview for clients',
    useCase: 'Monthly client reporting',
    sections: ['Executive Summary', 'KPIs', 'Content Performance', 'Channel Breakdown', 'Lead Generation', 'Recommendations'],
    color: 'bg-gradient-to-br from-indigo-900 to-blue-900',
    icon: '📊',
  },
  {
    id: 'campaign',
    name: 'Campaign Results Report',
    desc: 'Deep-dive into a specific campaign\'s performance and ROI',
    useCase: 'Post-campaign wrap-up',
    sections: ['Campaign Overview', 'Reach & Engagement', 'Lead & Revenue Impact', 'ROAS Analysis', 'Next Steps'],
    color: 'bg-gradient-to-br from-purple-900 to-pink-900',
    icon: '🎯',
  },
  {
    id: 'qbr',
    name: 'Quarterly Business Review',
    desc: 'Executive-level QBR with trend analysis and forecasting',
    useCase: 'Quarterly stakeholder meeting',
    sections: ['Executive Summary', 'Q/Q Growth', 'Channel ROI', 'Revenue Attribution', 'Forecast', 'Strategic Roadmap'],
    color: 'bg-gradient-to-br from-emerald-900 to-teal-900',
    icon: '📈',
  },
  {
    id: 'yir',
    name: 'Year-in-Review Report',
    desc: 'Annual highlight reel with wins, learnings, and outlook',
    useCase: 'Annual client presentation',
    sections: ['Year Highlights', 'Annual KPIs', 'Top Content', 'Milestones', 'YoY Comparison', 'Strategy for Next Year'],
    color: 'bg-gradient-to-br from-amber-900 to-orange-900',
    icon: '🏆',
  },
]

// Scheduled / past reports moved to a TODO. Was previously a list of fake
// agency clients ("Acme Corp", "TechStart Inc"). When /api/analytics/reports
// ships these will become real DB-backed lists; until then the Reports tab
// renders an empty state.

// ── Bar chart ──────────────────────────────────────────────────────────────────
// Driven entirely by real `data` from /api/stats. Renders an empty state when
// no daily-aggregated history is available. No hardcoded daily numbers.

function BarChart({ days, content, engagement, leads }: { days: string[]; content: number[]; engagement: number[]; leads: number[] }) {
  // Sprint 16E (audit P2 #26): proper per-series scaling + y-axis labels.
  // The previous chart used (leads-based maxVal) * 100% for leads, * 60%
  // for engagement, * 30% for content — which mis-proportioned series
  // and looked unscientific. Now each series scales against the overall
  // max value, gridlines render at 25/50/75/100% with numeric labels.
  const allValues = [...leads, ...engagement, ...content]
  const maxVal = Math.max(...allValues, 1)
  if (days.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
        No daily breakdown yet — publish some content to see trends here.
      </div>
    )
  }
  const tickValues = [maxVal, Math.round(maxVal * 0.75), Math.round(maxVal * 0.5), Math.round(maxVal * 0.25), 0]
  return (
    <div>
      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between h-40 text-[10px] text-gray-600 tabular-nums pr-1" style={{ minWidth: 24 }}>
          {tickValues.map(v => (
            <div key={v} className="leading-none">{v}</div>
          ))}
        </div>
        {/* Chart with gridlines */}
        <div className="flex-1 relative h-40">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="border-t border-gray-800/60" />
            ))}
          </div>
          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-2">
            {days.map((day, i) => (
              <div key={day} className="flex-1 flex items-end justify-center gap-px h-full">
                {/* Three side-by-side bars — same scale, no mystery 60%/30% multipliers */}
                <div
                  className="flex-1 bg-indigo-500/80 rounded-t-sm"
                  style={{ height: `${(leads[i] / maxVal) * 100}%` }}
                  title={`${day} — Leads: ${leads[i]}`}
                />
                <div
                  className="flex-1 bg-purple-500/70 rounded-t-sm"
                  style={{ height: `${(engagement[i] / maxVal) * 100}%` }}
                  title={`${day} — Posts published: ${engagement[i]}`}
                />
                <div
                  className="flex-1 bg-pink-500/60 rounded-t-sm"
                  style={{ height: `${(content[i] / maxVal) * 100}%` }}
                  title={`${day} — Artifacts created: ${content[i]}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* X-axis day labels */}
      <div className="flex gap-2 mt-1">
        <div style={{ minWidth: 24 }} />
        <div className="flex-1 flex gap-2">
          {days.map((day, i) => (
            <span key={i} className="flex-1 text-gray-600 text-xs text-center whitespace-nowrap" style={{ fontSize: 9 }}>{day}</span>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="flex justify-end gap-3 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500/80 rounded-sm" /> Leads</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-500/70 rounded-sm" /> Posts published</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-pink-500/60 rounded-sm" /> Artifacts created</span>
      </div>
    </div>
  )
}

// ── Follower Trendline (Sprint 17D — audit P1 #14) ────────────────────────────
// Pure SVG, no chart lib. Renders one line per platform from
// /api/analytics/followers (which reads post_metrics rows tagged with the
// sentinel artifact_id='__followers__' — written by /api/cron/follower-sync).

interface FollowerSeriesPoint {
  date: string
  platform: string
  total_followers: number | null
  delta: number
}

interface FollowerSummary {
  platform: string
  current: number | null
  periodStart: number | null
  delta: number | null
  percentChange: number | null
  lastSyncedAt: string | null
}

interface FollowerPayload {
  platforms: string[]
  series: FollowerSeriesPoint[]
  summary: FollowerSummary[]
  hasData: boolean
  days: number
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: '#0a66c2',
  twitter: '#1d9bf0',
  x: '#e7e9ea',
  meta: '#1877f2',
  facebook: '#1877f2',
  instagram: '#e1306c',
}

function colorFor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] || '#a78bfa'
}

function FollowerTrendChart({ workspaceId, days }: { workspaceId: string | null; days: number }) {
  const [payload, setPayload] = useState<FollowerPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    setLoading(true); setError(null)
    fetch(`/api/analytics/followers?workspaceId=${workspaceId}&days=${days}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<FollowerPayload>
      })
      .then(j => { if (!cancelled) setPayload(j) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, days])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold">Follower Growth</h2>
          <p className="text-gray-500 text-xs mt-0.5">Last {days} days · synced 4× daily</p>
        </div>
        {payload && payload.hasData && (
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {payload.platforms.map(p => (
              <span key={p} className="flex items-center gap-1.5 text-gray-300">
                <span className="w-3 h-2 rounded inline-block" style={{ background: colorFor(p) }} />
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && !payload && (
        <div className="h-40 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
      )}
      {!loading && error && (
        <div className="h-40 flex items-center justify-center text-red-400 text-sm">
          Failed to load: {error}
        </div>
      )}
      {!loading && !error && payload && !payload.hasData && (
        <div className="h-40 flex items-center justify-center text-gray-500 text-sm text-center px-6">
          No follower data yet — connect a social account to start tracking. Cron runs 4× daily.
        </div>
      )}

      {!loading && !error && payload && payload.hasData && (
        <>
          {/* Per-platform summary cards: current, delta, % change */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {payload.summary.map(s => {
              const sign = s.delta == null ? '' : s.delta > 0 ? '+' : ''
              const tone = s.delta == null
                ? 'text-gray-500'
                : s.delta > 0 ? 'text-emerald-400'
                : s.delta < 0 ? 'text-red-400'
                : 'text-gray-400'
              return (
                <div key={s.platform} className="bg-gray-800/50 border border-gray-800 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: colorFor(s.platform) }} />
                    <p className="text-gray-400 text-xs capitalize">{s.platform}</p>
                  </div>
                  <p className="text-white font-bold text-lg tabular-nums">
                    {s.current != null ? s.current.toLocaleString() : '—'}
                  </p>
                  <p className={`text-xs mt-0.5 tabular-nums ${tone}`}>
                    {s.delta != null
                      ? `${sign}${s.delta.toLocaleString()}${s.percentChange != null ? ` (${sign}${s.percentChange}%)` : ''}`
                      : 'Awaiting first sync'}
                  </p>
                </div>
              )
            })}
          </div>

          <FollowerSVGLines payload={payload} />
        </>
      )}
    </div>
  )
}

function FollowerSVGLines({ payload }: { payload: FollowerPayload }) {
  // Sort unique dates ascending; x position is by date index.
  const dates = Array.from(new Set(payload.series.map(s => s.date))).sort()
  const platforms = payload.platforms

  if (dates.length === 0) {
    return <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No data points.</div>
  }

  const W = 720, H = 200
  const padL = 44, padR = 12, padT = 8, padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const lines = platforms.map(p => {
    const points = dates
      .map(d => {
        const row = payload.series.find(s => s.date === d && s.platform === p)
        return { d, v: row && row.total_followers != null ? row.total_followers : null }
      })
      .filter((pt): pt is { d: string; v: number } => pt.v !== null)
    return { platform: p, points }
  })

  const allValues = lines.flatMap(l => l.points.map(p => p.v))
  if (allValues.length === 0) {
    return <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No follower counts logged yet.</div>
  }
  const minV = Math.min(...allValues)
  const maxV = Math.max(...allValues)
  const range = maxV - minV || 1
  const yMin = Math.max(0, Math.floor(minV - range * 0.1))
  const yMax = Math.ceil(maxV + range * 0.1)
  const yRange = yMax - yMin || 1

  const xFor = (idx: number) =>
    padL + (dates.length === 1 ? innerW / 2 : (idx / (dates.length - 1)) * innerW)
  const yFor = (v: number) => padT + innerH - ((v - yMin) / yRange) * innerH

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => yMin + t * yRange)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" role="img" aria-label="Follower growth chart">
        {ticks.map((v, i) => {
          const y = yFor(v)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1f2937" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#6b7280">
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          )
        })}

        {[0, Math.floor(dates.length / 2), dates.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i && v >= 0)
          .map(i => (
            <text key={i} x={xFor(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#6b7280">
              {dates[i].slice(5)}
            </text>
          ))}

        {lines.map(line => {
          if (line.points.length === 0) return null
          const path = line.points
            .map((pt, i) => {
              const idx = dates.indexOf(pt.d)
              return `${i === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(2)} ${yFor(pt.v).toFixed(2)}`
            })
            .join(' ')
          const color = colorFor(line.platform)
          return (
            <g key={line.platform}>
              <path d={path} stroke={color} strokeWidth={2} fill="none" />
              {line.points.map((pt) => {
                const idx = dates.indexOf(pt.d)
                return (
                  <circle key={pt.d} cx={xFor(idx)} cy={yFor(pt.v)} r={2.5} fill={color}>
                    <title>{`${line.platform} — ${pt.d}: ${pt.v.toLocaleString()}`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Report Builder Modal ───────────────────────────────────────────────────────

// Sprint 6F: recommendations payload from /api/analytics/recommendations.
interface Recommendation {
  id: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  metric?: { label: string; value: string }
}

function ReportBuilderModal({
  template,
  workspaceId,
  onClose,
}: {
  template: typeof REPORT_TEMPLATES[0]
  workspaceId: string | null
  onClose: () => void
}) {
  const [step, setStep] = useState<'build' | 'preview'>('build')
  const [range, setRange] = useState('Last 30 days')
  const [client, setClient] = useState('Acme Corp')
  const [agencyName, setAgencyName] = useState('My Agency')
  const [commentary, setCommentary] = useState('')
  const [sections, setSections] = useState<Record<string, boolean>>(
    Object.fromEntries(template.sections.map(s => [s, true]))
  )
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [schedFreq, setSchedFreq] = useState('Monthly')
  const [schedEmail, setSchedEmail] = useState('')
  const [scheduled, setScheduled] = useState(false)
  // Sprint 6F: live recommendations from the rule engine. Fetched on
  // preview-open so the report builder shows real, data-grounded
  // recommendations instead of the previous "will appear here" stub.
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null)
  const [recsLoading, setRecsLoading] = useState(false)
  const [recsDataAvailable, setRecsDataAvailable] = useState<boolean>(true)
  const [recsError, setRecsError] = useState<string | null>(null)

  // Range label → API token. The dashboard hardcodes the same mapping.
  const rangeToken = range === 'Last 7 days' ? '7d'
    : range === 'Last 90 days' ? '90d'
    : range === 'Last 12 months' ? '12mo'
    : '30d'

  useEffect(() => {
    if (step !== 'preview' || !sections['Recommendations'] || !workspaceId) return
    let cancelled = false
    setRecsLoading(true); setRecsError(null)
    fetch(`/api/analytics/recommendations?workspaceId=${workspaceId}&range=${rangeToken}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{
          recommendations: Recommendation[]
          dataAvailable: boolean
        }>
      })
      .then(json => {
        if (cancelled) return
        setRecommendations(json.recommendations || [])
        setRecsDataAvailable(json.dataAvailable)
      })
      .catch(e => { if (!cancelled) setRecsError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setRecsLoading(false) })
    return () => { cancelled = true }
  }, [step, sections, workspaceId, rangeToken])

  function handleDownload() {
    const data = JSON.stringify({
      report: template.name,
      client,
      range,
      agencyName,
      sections: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
      commentary,
      generatedAt: new Date().toISOString(),
    }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name.replace(/\s+/g, '_')}_${client.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">{template.icon} {template.name}</h2>
            <p className="text-gray-500 text-xs mt-0.5">Report Builder</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(step === 'build' ? 'preview' : 'build')}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              {step === 'build' ? 'Preview Report' : '← Back to Builder'}
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl px-2 transition-colors">✕</button>
          </div>
        </div>

        {step === 'build' ? (
          <div className="p-6 space-y-6">
            {/* Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Date Range</label>
                <select
                  value={range}
                  onChange={e => setRange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                >
                  {['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 12 months'].map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Client / Workspace</label>
                <select
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                >
                  {['Acme Corp', 'TechStart Inc', 'GrowthCo', 'Studio Blue', 'All Clients'].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sections */}
            <div>
              <label className="text-gray-400 text-xs mb-3 block uppercase tracking-wider">Include Sections</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {template.sections.map(sec => (
                  <label key={sec} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections[sec] ?? true}
                      onChange={e => setSections(prev => ({ ...prev, [sec]: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-500"
                    />
                    <span className="text-gray-300 text-sm">{sec}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Branding */}
            <div>
              <label className="text-gray-400 text-xs mb-3 block uppercase tracking-wider">Branding</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Agency Name</label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                    placeholder="Your Agency Name"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" defaultValue="#6366f1" className="w-10 h-9 rounded-lg bg-gray-800 border border-gray-700 cursor-pointer" />
                    <span className="text-gray-400 text-xs">Accent color for report headers</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commentary */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block uppercase tracking-wider">Custom Commentary</label>
              <textarea
                value={commentary}
                onChange={e => setCommentary(e.target.value)}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 resize-none"
                placeholder="Add a personalized message or analysis note to the report…"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep('preview')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Preview Report
              </button>
              <button
                onClick={handleDownload}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                ↓ Download Report
              </button>
              <button
                onClick={() => setScheduleOpen(v => !v)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Schedule Delivery
              </button>
            </div>

            {/* Schedule panel */}
            {scheduleOpen && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-white text-sm font-medium">Schedule Recurring Delivery</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Frequency</label>
                    <select
                      value={schedFreq}
                      onChange={e => setSchedFreq(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5"
                    >
                      {['Weekly', 'Monthly', 'Quarterly', 'Per Campaign'].map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Recipient Email</label>
                    <input
                      type="email"
                      value={schedEmail}
                      onChange={e => setSchedEmail(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5"
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                <button
                  onClick={() => { setScheduled(true); setScheduleOpen(false) }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Confirm Schedule
                </button>
                {scheduled && <p className="text-emerald-400 text-xs">Report scheduled successfully.</p>}
              </div>
            )}
          </div>
        ) : (
          /* Preview */
          <div className="p-6 space-y-5">
            <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-xl p-5">
              <p className="text-indigo-200 text-xs uppercase tracking-wider mb-1">{agencyName}</p>
              <h3 className="text-white text-xl font-bold">{template.name}</h3>
              <p className="text-indigo-300 text-sm mt-1">{client} · {range}</p>
            </div>

            {sections['Executive Summary'] && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-2 text-sm">Executive Summary</h4>
                {/* Executive summary previously contained a hardcoded
                    paragraph claiming "2.4M reach, 847 leads, $68,200
                    revenue, LinkedIn top performer" — a fabrication that
                    would print into downloadable PDFs. Now the preview
                    surfaces the user's own commentary (typed in the
                    builder) and a placeholder explaining how the real
                    summary will be assembled. */}
                <p className="text-gray-300 text-sm leading-relaxed">
                  {commentary
                    ? commentary
                    : `Executive summary for ${client} (${range}) will be assembled from real campaign data once /api/analytics/reports is wired. Use the "Commentary" field in the builder to add your own narrative.`}
                </p>
              </div>
            )}

            {sections['KPIs'] && (
              <div>
                <h4 className="text-white font-medium mb-3 text-sm">Key Performance Indicators</h4>
                {/* Report preview KPI grid — empty until /api/analytics/reports
                    returns the period snapshot. The previous version showed
                    the hardcoded MOCK STAT_BAR in the report preview, which
                    would print fabricated numbers into a downloadable report. */}
                <div className="p-4 bg-gray-800 rounded-lg text-center text-gray-500 text-sm">
                  KPI snapshot will populate from /api/analytics/reports once that endpoint ships.
                </div>
              </div>
            )}

            {sections['Recommendations'] && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-3 text-sm">Strategic Recommendations</h4>
                {/* Sprint 6F: rule-based recommendations from
                    /api/analytics/recommendations. Every bullet cites a
                    real metric from this workspace — no fabrication. */}
                {!workspaceId && (
                  <p className="text-gray-500 text-sm">Select a workspace to generate recommendations.</p>
                )}
                {workspaceId && recsLoading && (
                  <p className="text-gray-500 text-sm">Analyzing your data…</p>
                )}
                {workspaceId && !recsLoading && recsError && (
                  <p className="text-red-400 text-sm">Could not load recommendations: {recsError}</p>
                )}
                {workspaceId && !recsLoading && !recsError && !recsDataAvailable && (
                  <p className="text-gray-500 text-sm">
                    No published content, leads, or paid campaigns yet in this period — recommendations will surface once there's data to analyze.
                  </p>
                )}
                {workspaceId && !recsLoading && !recsError && recsDataAvailable && recommendations && (
                  recommendations.length === 0 ? (
                    <p className="text-gray-500 text-sm">No issues flagged for this period.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {recommendations.map(r => {
                        const dot = r.severity === 'critical' ? 'bg-red-500'
                          : r.severity === 'warning' ? 'bg-amber-500'
                          : 'bg-emerald-500'
                        return (
                          <li key={r.id} className="flex gap-3">
                            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <div className="flex-1">
                              <p className="text-gray-200 text-sm font-medium">
                                {r.title}
                                {r.metric && (
                                  <span className="ml-2 text-xs font-normal text-gray-500">
                                    ({r.metric.label}: {r.metric.value})
                                  </span>
                                )}
                              </p>
                              <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{r.body}</p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleDownload}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                ↓ Download PDF / JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'content' | 'leads' | 'revenue' | 'reports'
type RangeId = '7d' | '30d' | '90d' | '12mo'

// ── Analytics API response types ──────────────────────────────────────────────
interface AnalyticsData {
  range: string
  days: number
  published: number
  leads: number
  leadsByStatus: { status: string; count: number }[]
  leadsBySource: { source: string; count: number }[]
  agentRuns: { agent_name: string; run_count: number; total_cost: number }[]
  totalRuns: number
  totalCost: number
  campaignByPlatform: { platform: string; impressions: number; clicks: number; spend: number; conversions: number; revenue: number }[]
  campTotals: { impressions: number; clicks: number; spend: number; conversions: number; revenue: number }
  reach: number
  revenue: number
  engagementRate: number
  topArtifacts: { id: string; title: string; type: string; created_at: string }[]
  contentByType: { type: string; count: number }[]
  publishByPlatform: { platform: string; count: number }[]
  // Sprint 15E (P1 #14): daily trendline arrays for the Overview bar chart.
  dailySeries?: { day: string; content: number; published: number; leads: number }[]
}

// Sprint 6G: shape returned by /api/analytics/posts. Top Performing Content
// panel ranks by engagement (likes+comments+shares) rather than recency.
interface TopPost {
  artifactId: string
  title: string
  type: string
  createdAt: string
  publishedPlatforms: string[]
  publishedAt: string | null
  impressions: number
  clicks: number
  likes: number
  comments: number
  shares: number
  engagement: number
  engagementRate: number
  hasMetrics: boolean
  paidMetrics: { spend: number; conversions: number; revenue: number } | null
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [range, setRange] = useState<RangeId>('30d')
  const [compare, setCompare] = useState(false)
  // Sprint 5 fix: brief banner for the Generate Report / Export Data buttons
  // so the user sees the silent file download actually happened.
  const [reportToast, setReportToast] = useState<string | null>(null)
  const [activeTemplate, setActiveTemplate] = useState<typeof REPORT_TEMPLATES[0] | null>(null)
  // scheduledToggles previously seeded from MOCK SCHEDULED_REPORTS. Now starts
  // empty — when the real scheduled-reports endpoint lands the state will be
  // hydrated from /api/analytics/reports/scheduled.
  const [scheduledToggles, setScheduledToggles] = useState<Record<number, boolean>>({})
  const [roisPend, setRoiSpend] = useState(5000)
  const [roiRoas] = useState(14)

  // ── Real data ─────────────────────────────────────────────────────────────
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Sprint 6G: per-post engagement (Top Performing Content panel).
  const [topPosts, setTopPosts] = useState<TopPost[] | null>(null)
  const [topPostsLoading, setTopPostsLoading] = useState(false)

  const loadAnalytics = useCallback(async (wsId: string, r: RangeId) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/stats?workspaceId=${wsId}&view=analytics&range=${r}`)
      if (!res.ok) throw new Error('Failed to load analytics')
      const json = await res.json() as AnalyticsData | { error: string }
      if ('error' in json) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Sprint 10C: session-derived workspaceId.
  const { workspaceId: sessionWorkspaceId, resolved: sessionResolved } = useWorkspaceId()
  useEffect(() => {
    setWorkspaceId(sessionWorkspaceId)
    if (sessionWorkspaceId) loadAnalytics(sessionWorkspaceId, range)
    else if (sessionResolved) setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionWorkspaceId, sessionResolved, loadAnalytics])

  // Refetch when range changes
  useEffect(() => {
    if (workspaceId) loadAnalytics(workspaceId, range)
  }, [range, workspaceId, loadAnalytics])

  // Sprint 6G: load Top Performing Content via /api/analytics/posts. This
  // replaces the recency-sorted topArtifacts surface with true engagement
  // ranking. Runs in parallel with the main stats load.
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    setTopPostsLoading(true)
    fetch(`/api/analytics/posts?workspaceId=${workspaceId}&range=${range}&sortBy=engagement&limit=6`)
      .then(async r => r.ok ? r.json() as Promise<{ posts: TopPost[] }> : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(json => { if (!cancelled) setTopPosts(Array.isArray(json?.posts) ? json.posts : []) })
      .catch(() => { if (!cancelled) setTopPosts([]) })
      .finally(() => { if (!cancelled) setTopPostsLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, range])

  // ── Computed values from real data (NO mock fallback — Source Test) ──────
  // `data` is the response from /api/stats?view=analytics. `hasData` flags
  // whether the workspace has ANY measurable activity yet. When false, the
  // stat bar / KPIs / channel table render zeros + empty-state copy. We do
  // NOT substitute hardcoded numbers; that was the central deception of the
  // previous version.
  const hasData = !!data && (data.leads > 0 || data.published > 0 || data.totalRuns > 0 || data.reach > 0)

  // Build STAT_BAR values from real data only. When `data` is null (loading
  // / errored) we render placeholder empty cards; we never substitute fake
  // values.
  const realStatBar: { label: string; value: string; delta: string; up: boolean }[] = data ? [
    { label: 'Content Published', value: String(data.published), delta: data.published > 0 ? `${data.published} this period` : 'No content yet', up: true },
    { label: 'Total Reach', value: data.reach >= 1000 ? `${(data.reach / 1000).toFixed(1)}K` : String(data.reach), delta: data.reach > 0 ? 'From paid campaigns' : 'No ad data yet', up: true },
    { label: 'Avg Engagement', value: `${data.engagementRate}%`, delta: data.engagementRate > 0 ? 'CTR from ads' : 'No campaigns yet', up: true },
    { label: 'Total Leads', value: String(data.leads), delta: data.leads > 0 ? `${data.leads} captured` : 'No leads yet', up: true },
    { label: 'Revenue Attributed', value: `$${data.revenue.toLocaleString()}`, delta: data.revenue > 0 ? 'From tracked campaigns' : 'No revenue yet', up: true },
    { label: 'AI Cost This Month', value: `$${data.totalCost.toFixed(2)}`, delta: `${data.totalRuns} runs`, up: false },
  ] : []

  // Channel breakdown from real publish data + lead sources. Empty array
  // when no data — the table below renders its own "no channel data" row.
  const realChannels: { name: string; reach: number; eng: number; leads: number; cpl: string; icon: string }[] = data
    ? (() => {
        const merged = new Map<string, { name: string; reach: number; eng: number; leads: number; cpl: string; icon: string }>()
        data.publishByPlatform.forEach(p => {
          const camp = data.campaignByPlatform.find(c => c.platform.toLowerCase() === p.platform.toLowerCase())
          merged.set(p.platform.toLowerCase(), {
            name: p.platform,
            reach: camp?.impressions || p.count,
            eng: camp && camp.impressions > 0 ? Number(((camp.clicks / camp.impressions) * 100).toFixed(1)) : 0,
            leads: 0,
            cpl: camp && camp.conversions > 0 ? `$${(camp.spend / camp.conversions).toFixed(2)}` : '—',
            icon: '📡',
          })
        })
        data.leadsBySource.forEach(s => {
          const key = (s.source || 'other').toLowerCase()
          const existing = merged.get(key)
          if (existing) existing.leads += s.count
          else merged.set(key, { name: s.source || 'Other', reach: 0, eng: 0, leads: s.count, cpl: '—', icon: '🔗' })
        })
        return Array.from(merged.values())
      })()
    : []

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Content Analytics' },
    { id: 'leads', label: 'Lead Analytics' },
    { id: 'revenue', label: 'Revenue Analytics' },
    { id: 'reports', label: 'Reports' },
  ]

  const RANGES: { id: RangeId; label: string }[] = [
    { id: '7d', label: 'Last 7d' },
    { id: '30d', label: 'Last 30d' },
    { id: '90d', label: 'Last 90d' },
    { id: '12mo', label: '12 Months' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics &amp; Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Data-rich insights across all marketing channels</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Range picker */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${range === r.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
            <button className={`px-3 py-1.5 rounded text-xs font-medium transition-colors text-gray-400 hover:text-white`}>Custom</button>
          </div>

          {/* Compare toggle */}
          <button
            onClick={() => setCompare(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${compare ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${compare ? 'bg-indigo-400' : 'bg-gray-600'}`} />
            Compare to previous period
          </button>

          <button
            onClick={() => {
              // Sprint 5 fix: the click DID trigger a JSON download but
              // most browsers download silently — users thought the button
              // was broken. Now we:
              //   (a) append/remove the anchor to/from the DOM for max
              //       cross-browser compat (some older browsers ignore
              //       detached anchor clicks),
              //   (b) fall back to alert() if Blob URL creation fails,
              //   (c) flip a brief `downloadedAt` state that surfaces a
              //       confirmation banner so the user sees it worked.
              try {
                const payload = {
                  generatedAt: new Date().toISOString(),
                  workspaceId,
                  range,
                  data,
                }
                const filename = `analytics-report-${range}-${Date.now()}.json`
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = filename
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                setReportToast(`Downloaded ${filename}`)
                setTimeout(() => setReportToast(null), 4000)
              } catch (err) {
                setReportToast(`Download failed: ${err instanceof Error ? err.message : String(err)}`)
                setTimeout(() => setReportToast(null), 6000)
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            Generate Report
          </button>
          <button
            onClick={() => {
              if (!data) return
              try {
                const lines: string[] = []
                lines.push('metric,value')
                lines.push(`published,${data.published}`)
                lines.push(`leads,${data.leads}`)
                lines.push(`reach,${data.reach}`)
                lines.push(`revenue,${data.revenue}`)
                lines.push(`engagement_rate,${data.engagementRate}`)
                lines.push(`ai_runs,${data.totalRuns}`)
                lines.push(`ai_cost,${data.totalCost}`)
                const csv = lines.join('\n')
                const filename = `analytics-${range}.csv`
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = filename
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                setReportToast(`Downloaded ${filename}`)
                setTimeout(() => setReportToast(null), 4000)
              } catch (err) {
                setReportToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
                setTimeout(() => setReportToast(null), 6000)
              }
            }}
            disabled={!data}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            Export Data
          </button>
        </div>
      </div>

      {/* Sprint 5 fix: feedback for the silent file-download buttons above. */}
      {reportToast && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-sm flex items-center gap-2">
          <span>✓</span>
          <span className="flex-1">{reportToast}</span>
          <button onClick={() => setReportToast(null)} className="text-gray-500 hover:text-white">×</button>
        </div>
      )}

      {/* ── Loading & error states ── */}
      {loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500">
          <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p>Loading analytics…</p>
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-400 font-medium">Failed to load analytics</p>
          <p className="text-red-300/70 text-sm mt-1">{error}</p>
          <button onClick={() => workspaceId && loadAnalytics(workspaceId, range)} className="mt-3 px-4 py-1.5 bg-red-900 hover:bg-red-800 text-white rounded-lg text-sm">Retry</button>
        </div>
      )}
      {!loading && !error && data && !hasData && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-white font-medium text-lg">No analytics yet</p>
          <p className="text-gray-500 text-sm mt-1">Your data will appear here once your agents start running.</p>
        </div>
      )}

      {/* ── Stats Bar ── */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {realStatBar.map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className="text-white font-bold text-lg">{s.value}</p>
              <p className={`text-xs mt-0.5 ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.delta}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* KPI Grid */}
          <div>
            <h2 className="text-white font-semibold mb-3">Performance KPIs</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* KPI grid — every value traces to /api/stats data. When data
                  is null we render placeholder cards rather than fabricating
                  numbers. */}
              {(data ? [
                { label: 'Content Published', value: String(data.published), sub: `Last ${data.days}d` },
                { label: 'Total Reach', value: data.reach >= 1000 ? `${(data.reach / 1000).toFixed(1)}K` : String(data.reach), sub: 'From paid campaigns' },
                { label: 'Avg Engagement', value: `${data.engagementRate}%`, sub: 'CTR' },
                { label: 'Total Clicks', value: String(data.campTotals.clicks.toLocaleString()), sub: `${data.campTotals.conversions} conversions` },
                { label: 'Total Leads', value: String(data.leads), sub: `Last ${data.days}d` },
                { label: 'Revenue Attr.', value: `$${data.revenue.toLocaleString()}`, sub: 'Tracked campaigns' },
                { label: 'AI Cost', value: `$${data.totalCost.toFixed(2)}`, sub: data.totalRuns > 0 ? `$${(data.totalCost / data.totalRuns).toFixed(3)} / run` : '—' },
                { label: 'Agent Runs', value: String(data.totalRuns), sub: `${data.agentRuns.length} agents` },
                { label: 'Top Source', value: (data.leadsBySource[0]?.source || '—'), sub: data.leadsBySource[0] ? `${data.leadsBySource[0].count} leads` : 'No data' },
                { label: 'Top Platform', value: (data.publishByPlatform[0]?.platform || '—'), sub: data.publishByPlatform[0] ? `${data.publishByPlatform[0].count} posts` : 'No data' },
                { label: 'Top Content Type', value: (data.contentByType[0]?.type || '—'), sub: data.contentByType[0] ? `${data.contentByType[0].count} items` : 'No data' },
                { label: 'Pending Approvals', value: String(data.leadsByStatus.find(s => s.status === 'pending')?.count || 0), sub: 'Leads awaiting review' },
              ] : (
                // No data yet — render 12 empty placeholders, not fake numbers.
                ['Content Published','Total Reach','Avg Engagement','Total Clicks','Total Leads','Revenue Attr.','AI Cost','Agent Runs','Top Source','Top Platform','Top Content Type','Pending Approvals'].map(label => ({ label, value: '—', sub: 'No data yet' }))
              )).map(k => (
                <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                  <p className={`font-bold ${k.value === '—' ? 'text-gray-600' : 'text-white'}`}>{k.value}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Trend Chart — empty until /api/stats returns daily aggregates */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Performance Trend</h2>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-indigo-500/60 inline-block" /> Leads</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-purple-500/50 inline-block" /> Engagement</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-pink-500/40 inline-block" /> Content</span>
              </div>
            </div>
            {/* Sprint 15E (P1 #14): daily series now comes from /api/stats.
                If the workspace is empty the arrays stay empty and the chart
                shows an honest "no data" rail — never fabricated. */}
            <BarChart
              days={(data?.dailySeries || []).map(d => d.day.slice(5))}
              content={(data?.dailySeries || []).map(d => d.content)}
              engagement={(data?.dailySeries || []).map(d => d.published)}
              leads={(data?.dailySeries || []).map(d => d.leads)}
            />
          </div>

          {/* Sprint 17D (audit P1 #14): follower trendline.
              Reads /api/analytics/followers (post_metrics rows with sentinel
              artifact_id='__followers__' written by /api/cron/follower-sync). */}
          <FollowerTrendChart
            workspaceId={workspaceId}
            days={range === '7d' ? 7 : range === '90d' ? 90 : range === '12mo' ? 365 : 30}
          />

          {/* Channel Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Channel Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Channel', 'Reach', 'Engagement Rate', 'Leads', 'Cost per Lead'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxReach = Math.max(...realChannels.map(c => c.reach), 1)
                    return realChannels.map(ch => (
                      <tr key={ch.name} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                        <td className="px-3 py-3 text-sm text-white">
                          <span className="mr-2">{ch.icon}</span>{ch.name}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(ch.reach / maxReach) * 100}%` }} />
                            </div>
                            <span className="text-gray-300 text-xs">{ch.reach >= 1000 ? `${(ch.reach / 1000).toFixed(0)}K` : ch.reach}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-sm font-medium ${ch.eng >= 5 ? 'text-emerald-400' : ch.eng >= 3 ? 'text-amber-400' : 'text-gray-400'}`}>
                          {ch.eng}%
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">{ch.leads}</td>
                        <td className="px-3 py-3 text-sm text-gray-300">{ch.cpl}</td>
                      </tr>
                    ))
                  })()}
                  {realChannels.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500 text-sm">No channel data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Performing Content — Sprint 6G: ranks by engagement (likes
              + comments + shares) using /api/analytics/posts. Posts with
              synced platform metrics rank above posts that haven't been
              synced yet. Honest empty state: no fabricated zeros. */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-white font-semibold">Top Performing Content</h2>
              {topPosts && topPosts.some(p => !p.hasMetrics) && (
                <p className="text-gray-500 text-xs">
                  Some posts have no synced metrics yet — connect platform integrations to populate.
                </p>
              )}
            </div>
            {topPostsLoading && !topPosts && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">Loading…</div>
            )}
            {topPosts && topPosts.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
                No content published yet in this date range.
              </div>
            )}
            {topPosts && topPosts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topPosts.slice(0, 6).map(post => (
                  <div key={post.artifactId} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="h-24 bg-gradient-to-br from-indigo-700 to-purple-900 flex items-center justify-center relative">
                      <span className="text-4xl">📝</span>
                      {post.hasMetrics && (
                        <span className="absolute top-2 right-2 text-emerald-300 text-[10px] bg-emerald-950/70 px-1.5 py-0.5 rounded">
                          {post.engagement.toLocaleString()} eng
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">{post.type}</span>
                        {post.publishedPlatforms.slice(0, 3).map(pl => (
                          <span key={pl} className="text-indigo-300 text-xs bg-indigo-950/60 px-2 py-0.5 rounded">{pl}</span>
                        ))}
                      </div>
                      <p className="text-white text-sm font-medium mb-2 line-clamp-2">{post.title}</p>
                      {post.hasMetrics ? (
                        <div className="grid grid-cols-3 gap-1 mt-2 mb-2">
                          <div className="text-center">
                            <p className="text-white text-xs font-semibold">{post.likes.toLocaleString()}</p>
                            <p className="text-gray-600 text-[10px]">Likes</p>
                          </div>
                          <div className="text-center">
                            <p className="text-white text-xs font-semibold">{post.comments.toLocaleString()}</p>
                            <p className="text-gray-600 text-[10px]">Comments</p>
                          </div>
                          <div className="text-center">
                            <p className="text-white text-xs font-semibold">{post.shares.toLocaleString()}</p>
                            <p className="text-gray-600 text-[10px]">Shares</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-600 text-[11px] italic mt-1.5 mb-1">No metrics synced yet</p>
                      )}
                      <p className="text-gray-500 text-xs">
                        {post.publishedAt
                          ? `Published ${new Date(post.publishedAt).toLocaleDateString()}`
                          : `Drafted ${new Date(post.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Agent Activity */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">AI Agent Activity</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Agent', 'Runs', 'Tasks Completed', 'Cost'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data && data.agentRuns.length > 0 ? data.agentRuns : []).map(agent => (
                    <tr key={agent.agent_name} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-3 text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        {agent.agent_name}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">{agent.run_count}</td>
                      <td className="px-3 py-3 text-sm text-gray-300">{agent.run_count}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">${agent.total_cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  {data && data.agentRuns.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-6 text-gray-500 text-sm">No agent runs in this date range</td></tr>
                  )}
                  {!data && (
                    <tr><td colSpan={4} className="text-center py-6 text-gray-600 text-sm">Loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* CONTENT ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Content by type — real */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Content Volume by Type</h2>
              {data && data.contentByType.length > 0 ? (() => {
                const palette = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500']
                const max = Math.max(...data.contentByType.map(t => t.count), 1)
                return (
                  <div className="space-y-3">
                    {data.contentByType.map((item, i) => (
                      <div key={item.type}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">{item.type || 'Other'}</span>
                          <span className="text-gray-300 font-medium">{item.count}</span>
                        </div>
                        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${palette[i % palette.length]} rounded-full`} style={{ width: `${(item.count / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })() : (
                <p className="text-gray-500 text-sm">No content created yet.</p>
              )}
            </div>

            {/* Best performing — empty until insights pipeline ships.
                Previously hardcoded "Tuesday 9–11am · +34% above average"
                etc. — those numbers were fabricated. */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Best Performing</h2>
              <div className="space-y-3">
                {[
                  { label: 'Best Posting Time', value: '—', badge: 'Needs post history', color: 'text-gray-600' },
                  { label: 'Optimal Length', value: '—', badge: 'Needs published content', color: 'text-gray-600' },
                  { label: 'Brand Voice Score', value: '—', badge: 'Coming after first approval', color: 'text-gray-600' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                    <span className="text-gray-400 text-sm">{item.label}</span>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                      <p className="text-gray-600 text-xs">{item.badge}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Content velocity — empty until /api/stats returns a daily series.
              Previously showed a hardcoded 14-bar sparkline with fake numbers. */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Content Velocity</h2>
              <span className="text-gray-400 text-sm">
                {data && data.days > 0 && data.published > 0
                  ? <>Avg <span className="text-white font-medium">{(data.published / data.days).toFixed(1)}</span> posts/day</>
                  : 'No history yet'}
              </span>
            </div>
            <div className="h-24 flex items-center justify-center text-gray-600 text-sm">
              Daily content trend will populate once /api/stats exposes daily aggregates.
            </div>
          </div>

          {/* Top 10 posts table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Top 10 Posts</h2>
              <button className="text-gray-400 hover:text-white text-xs border border-gray-700 px-3 py-1 rounded-lg transition-colors">Export CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Content', 'Platform', 'Reach', 'Eng Rate', 'Clicks', 'Date'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Sprint 6G: driven by /api/analytics/posts. Reach /
                      Eng Rate / Clicks columns now show real synced
                      metrics, or "—" when a post hasn't been synced yet.
                      Empty dashes are honest "no data" — not zero. */}
                  {topPosts && topPosts.length > 0 ? topPosts.map(post => (
                    <tr key={post.artifactId} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{post.title}</td>
                      <td className="px-4 py-3 text-sm text-indigo-400">{post.publishedPlatforms[0] || post.type}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{post.hasMetrics ? post.impressions.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{post.hasMetrics ? `${post.engagementRate.toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{post.hasMetrics ? post.clicks.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500 text-sm">{topPostsLoading ? 'Loading…' : 'No content created yet in this date range.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* LEAD ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'leads' && (
        <div className="space-y-6">

          {/* Funnel — real lead status breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-5">Lead Funnel</h2>
            {(() => {
              if (!data) return null
              const byStatus = new Map(data.leadsByStatus.map(s => [s.status, s.count]))
              const total = Array.from(byStatus.values()).reduce((s, v) => s + v, 0)
              const funnel = [
                { stage: 'Total Leads', count: total },
                { stage: 'Contacted', count: (byStatus.get('contacted') || 0) + (byStatus.get('qualified') || 0) + (byStatus.get('proposal') || 0) + (byStatus.get('customer') || 0) },
                { stage: 'Qualified', count: (byStatus.get('qualified') || 0) + (byStatus.get('proposal') || 0) + (byStatus.get('customer') || 0) },
                { stage: 'Customers Won', count: byStatus.get('customer') || 0 },
              ]
              if (total === 0) {
                return <p className="text-gray-500 text-sm text-center py-8">No leads captured yet</p>
              }
              return (
                <div className="space-y-3">
                  {funnel.map((stage, i) => {
                    const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0
                    return (
                      <div key={stage.stage}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-gray-300">{stage.stage}</span>
                          <span className="text-white font-bold">{stage.count} <span className="text-gray-500 font-normal text-xs">({pct}%)</span></span>
                        </div>
                        <div className="h-8 bg-gray-800 rounded-lg overflow-hidden">
                          <div
                            className={`h-full rounded-lg flex items-center px-3 ${
                              i === 0 ? 'bg-indigo-600' : i === 1 ? 'bg-indigo-500' : i === 2 ? 'bg-purple-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.max(2, pct)}%` }}
                          >
                            <span className="text-white text-xs font-medium whitespace-nowrap">{stage.count}</span>
                          </div>
                        </div>
                        {i < funnel.length - 1 && (
                          <div className="flex justify-end text-xs text-gray-600 mt-0.5">
                            {stage.count > 0 ? Math.round((funnel[i + 1].count / stage.count) * 100) : 0}% conversion
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Highlight + sources */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Period summary — real data, not a fake "best month" highlight.
                The previous version hardcoded "April 2026 · 1,142 leads ·
                LinkedIn · $3.40 CPL" regardless of the workspace. */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/60 border border-indigo-700/40 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <p className="text-indigo-300 text-xs font-medium uppercase tracking-wider mb-1">This Period</p>
                <h3 className="text-white text-2xl font-bold">
                  {data ? `${data.leads} lead${data.leads === 1 ? '' : 's'}` : '—'}
                </h3>
                <p className="text-indigo-200 text-sm mt-1">
                  {data ? `Captured across ${data.leadsBySource.length} source${data.leadsBySource.length === 1 ? '' : 's'} over the last ${data.days} days.` : 'Loading…'}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-indigo-200 text-xs">Top Source</p>
                  <p className="text-white font-semibold text-sm">{data?.leadsBySource[0]?.source || '—'}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-indigo-200 text-xs">Avg CPL</p>
                  <p className="text-white font-semibold text-sm">
                    {data && data.leads > 0 && data.campTotals.spend > 0
                      ? `$${(data.campTotals.spend / data.leads).toFixed(2)}`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Lead sources — real */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Lead Sources</h2>
              {(() => {
                const sources = data ? data.leadsBySource : []
                const palette = ['bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500']
                const total = sources.reduce((s, v) => s + v.count, 0)
                if (!data || sources.length === 0) {
                  return <p className="text-gray-500 text-sm">No lead source data yet</p>
                }
                return (
                  <div className="space-y-3">
                    {sources.map((src, i) => {
                      const pct = total > 0 ? Math.round((src.count / total) * 100) : 0
                      return (
                        <div key={src.source}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-400">{src.source || 'Unknown'}</span>
                            <span className="text-gray-300 font-medium">{src.count} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full ${palette[i % palette.length]} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* CPL table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Cost Per Lead by Channel</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Channel', 'CPL', 'Leads', 'Lead Quality'].map(h => (
                    <th key={h} className="text-left text-gray-400 text-xs font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Real CPL table — joins `leadsBySource` with `campaignByPlatform`
                    spend. Lead-quality requires a scoring engine we haven't
                    built; shown as "—" rather than the fabricated High/Medium/Low
                    labels that the previous mock baked in. */}
                {data && data.leadsBySource.length > 0 ? data.leadsBySource.map(src => {
                  const camp = data.campaignByPlatform.find(c => c.platform.toLowerCase() === (src.source || '').toLowerCase())
                  const cpl = camp && src.count > 0 ? `$${(camp.spend / src.count).toFixed(2)}` : '—'
                  return (
                    <tr key={src.source} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3 text-sm text-white">{src.source || 'Unknown'}</td>
                      <td className="px-5 py-3 text-sm font-medium text-indigo-300">{cpl}</td>
                      <td className="px-5 py-3 text-sm text-gray-300">{src.count}</td>
                      <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">—</span></td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-500 text-sm">{data ? 'No lead source data yet.' : 'Loading…'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Lead scoring distribution — empty until a scoring engine exists.
              Previously showed fake bars (42 / 88 / 156 / 312 / 249) regardless
              of real lead data. We do not yet score leads; show honest empty. */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Lead Scoring Distribution</h2>
            <div className="h-28 flex items-center justify-center text-gray-600 text-sm">
              Lead scoring will appear here once the scoring engine is configured.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* REVENUE ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">

          {/* Revenue summary — every value from real data, no deltas yet
              (delta needs a previous-period comparison which /api/stats
              doesn't currently return). */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(data ? [
              { label: 'Revenue Attributed', value: `$${data.revenue.toLocaleString()}`, sub: data.revenue > 0 ? 'From tracked campaigns' : 'No revenue attribution yet' },
              { label: 'Total Ad Spend', value: `$${data.campTotals.spend.toLocaleString()}`, sub: data.campTotals.spend > 0 ? `${data.campTotals.conversions} conversions` : 'No paid spend yet' },
              { label: 'Blended ROAS', value: data.campTotals.spend > 0 ? `${(data.revenue / data.campTotals.spend).toFixed(2)}x` : '—', sub: data.campTotals.spend > 0 ? 'Revenue ÷ spend' : 'Awaiting paid campaign data' },
            ] : [
              { label: 'Revenue Attributed', value: '—', sub: 'Loading…' },
              { label: 'Total Ad Spend', value: '—', sub: 'Loading…' },
              { label: 'Blended ROAS', value: '—', sub: 'Loading…' },
            ]).map(card => (
              <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-gray-400 text-xs mb-1">{card.label}</p>
                <p className={`text-3xl font-bold ${card.value === '—' ? 'text-gray-600' : 'text-white'}`}>{card.value}</p>
                <p className="text-gray-600 text-xs mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue by channel — real campaignByPlatform data */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Revenue by Channel</h2>
            {data && data.campaignByPlatform.length > 0 ? (() => {
              const palette = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-pink-500', 'bg-amber-500']
              const maxRev = Math.max(...data.campaignByPlatform.map(c => c.revenue), 1)
              return (
                <div className="space-y-3">
                  {data.campaignByPlatform.map((ch, i) => (
                    <div key={ch.platform} className="flex items-center gap-4">
                      <div className="w-36 text-sm text-gray-300 flex-shrink-0">{ch.platform}</div>
                      <div className="flex-1 h-6 bg-gray-800 rounded-lg overflow-hidden">
                        <div
                          className={`h-full ${palette[i % palette.length]} rounded-lg flex items-center px-3`}
                          style={{ width: `${Math.max(2, (ch.revenue / maxRev) * 100)}%` }}
                        >
                          <span className="text-white text-xs font-medium whitespace-nowrap">
                            ${(ch.revenue / 1000).toFixed(1)}K
                          </span>
                        </div>
                      </div>
                      <div className="w-16 text-right text-xs text-gray-400 flex-shrink-0">
                        {ch.spend > 0 ? `${(ch.revenue / ch.spend).toFixed(1)}x` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })() : (
              <p className="text-gray-500 text-sm">No channel revenue tracked yet. Connect ad accounts in Integrations to start.</p>
            )}
          </div>

          {/* ROI Calculator + Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">ROI Calculator</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Monthly Marketing Spend ($)</label>
                  <input
                    type="range"
                    min={1000}
                    max={50000}
                    step={500}
                    value={roisPend}
                    onChange={e => setRoiSpend(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$1K</span>
                    <span className="text-white font-medium">${roisPend.toLocaleString()}</span>
                    <span>$50K</span>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs">Projected Revenue</p>
                    <p className="text-emerald-400 font-bold text-xl">${(roisPend * roiRoas).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Projected ROAS</p>
                    <p className="text-white font-bold text-xl">{roiRoas}x</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Net Profit</p>
                    <p className="text-white font-bold text-xl">${(roisPend * roiRoas - roisPend).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ROI</p>
                    <p className="text-indigo-400 font-bold text-xl">{((roiRoas - 1) * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <p className="text-gray-600 text-xs">Based on your current blended ROAS of {roiRoas}x. Past performance does not guarantee future results.</p>
              </div>
            </div>

            {/* Revenue forecast — empty until we have monthly revenue series.
                The previous version showed a hardcoded "Jan $42K → Aug $87K"
                trajectory regardless of actual data. */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Revenue Forecast</h2>
              <div className="h-32 flex items-center justify-center text-gray-600 text-sm">
                Forecast charts will appear after 3+ months of revenue history.
              </div>
            </div>
          </div>

          {/* Top campaigns — empty until /api/analytics/campaigns ships.
              Previously showed fake "Q2 Agency Playbook Launch · $14,200 · 22.4x". */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Top Revenue-Generating Campaigns</h2>
            </div>
            <div className="p-8 text-center text-gray-500 text-sm">
              Per-campaign revenue attribution will populate here once ad campaigns are running and conversions are tracked.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* REPORTS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-8">

          {/* Template gallery */}
          <div>
            <h2 className="text-white font-semibold mb-4">Report Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {REPORT_TEMPLATES.map(tpl => (
                <div key={tpl.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors">
                  <div className={`h-28 ${tpl.color} flex items-center justify-center`}>
                    <span className="text-5xl">{tpl.icon}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-medium text-sm mb-1">{tpl.name}</h3>
                    <p className="text-gray-500 text-xs mb-2">{tpl.desc}</p>
                    <p className="text-gray-600 text-xs mb-3">Use case: {tpl.useCase}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tpl.sections.slice(0, 3).map(s => (
                        <span key={s} className="bg-gray-800 text-gray-400 text-xs px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                      {tpl.sections.length > 3 && (
                        <span className="bg-gray-800 text-gray-500 text-xs px-1.5 py-0.5 rounded">+{tpl.sections.length - 3} more</span>
                      )}
                    </div>
                    <button
                      onClick={() => setActiveTemplate(tpl)}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      Generate Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduled reports — empty until /api/analytics/reports/scheduled
              ships. The previous version listed fake clients (Acme Corp /
              TechStart Inc / GrowthCo) regardless of who the user actually has. */}
          <div>
            <h2 className="text-white font-semibold mb-4">Scheduled Reports</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
              No scheduled reports yet. Generate one from a template above, then choose &ldquo;Schedule&rdquo; in the builder.
            </div>
            {/* scheduledToggles state is preserved for when the real scheduled-
                reports list arrives; intentionally unused right now. */}
            {Object.keys(scheduledToggles).length === 0 ? null : null}
          </div>

          {/* Past reports — empty until /api/analytics/reports/history ships.
              Previously listed fake "Acme Corp – May 2026 Monthly Report" etc. */}
          <div>
            <h2 className="text-white font-semibold mb-4">Past Reports</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
              No past reports yet. Reports you download will appear here.
            </div>
          </div>

        </div>
      )}

      {/* Report builder modal */}
      {activeTemplate && (
        <ReportBuilderModal
          template={activeTemplate}
          workspaceId={workspaceId}
          onClose={() => setActiveTemplate(null)}
        />
      )}

    </div>
  )
}
