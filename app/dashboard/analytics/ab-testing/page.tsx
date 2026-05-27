'use client'

/**
 * /dashboard/analytics/ab-testing
 *
 * Performance ledger across every experiment + variant in the workspace.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Summary tiles: # experiments, total impressions, conv-rate uplift   │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Ledger table: experiment · variant · imp · conv · CR · revenue Δ    │
 *   │   ┌────────────────────────────────────────────────────────────────┐ │
 *   │   │ Subject Line A/B · control     · 2,140 · 132 · 6.17% · —      │ │
 *   │   │ Subject Line A/B · variant_a   · 2,089 · 158 · 7.56% · ████ ✓ │ │
 *   │   └────────────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Stat-confidence column re-uses the same Monte Carlo posterior the
 * /dashboard/experiments page computes — keeps both surfaces consistent.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, AlertCircle, Loader2, Trophy,
  TrendingUp, Activity, ShieldCheck, ArrowUpRight, Crown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface Experiment {
  id: string
  workspace_id: string
  name: string
  hypothesis: string | null
  target_type: string
  target_reference_id: string
  status: string
  statistical_significance_threshold: number | string
  winner_variant_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
}

interface Variant {
  id: string
  experiment_id: string
  variant_label: string
  configuration_override_json: string
  traffic_allocation_weight: number | string
  impression_count: number | string
  conversion_count: number | string
  created_at: string
}

interface VariantStats {
  variantId: string
  variantLabel: string
  impressions: number
  conversions: number
  conversionRate: number
  probabilityBest: number
  isWinner: boolean
  liftPct: number | null  // vs control
}

interface LedgerRow {
  experiment: Experiment
  variants: VariantStats[]
  bestProbability: number
  totalImpressions: number
  totalConversions: number
  uplift: number | null  // best CR vs control CR (relative %)
  baselineCR: number
  bestCR: number
  revenueEstimate: number  // illustrative — derived from conv-count × avgValue when configured
}

// ─── Bayesian client-side sampler (ported from cron) ──────────────────────

const MONTE_CARLO_SAMPLES = 4000

function randNormal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  while (true) {
    let x: number, v: number
    do {
      x = randNormal()
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const g1 = sampleGamma(alpha)
  const g2 = sampleGamma(beta)
  return g1 / (g1 + g2)
}

function computeProbabilities(variants: Variant[], winnerId: string | null): VariantStats[] {
  if (variants.length === 0) return []

  const arms = variants.map(v => {
    const imp = Math.max(0, Number(v.impression_count || 0))
    const conv = Math.min(imp, Math.max(0, Number(v.conversion_count || 0)))
    return {
      variantId: v.id,
      variantLabel: v.variant_label,
      impressions: imp,
      conversions: conv,
      conversionRate: imp > 0 ? conv / imp : 0,
    }
  })

  const wins = new Array<number>(arms.length).fill(0)
  if (arms.some(a => a.impressions > 0)) {
    for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
      let bestIdx = 0
      let bestVal = -1
      for (let j = 0; j < arms.length; j++) {
        const alpha = arms[j].conversions + 1
        const beta = (arms[j].impressions - arms[j].conversions) + 1
        const draw = sampleBeta(alpha, beta)
        if (draw > bestVal) { bestVal = draw; bestIdx = j }
      }
      wins[bestIdx]++
    }
  }

  // Identify the control as the first variant labelled "control" — falls back
  // to the first arm otherwise. Used for the lift% column.
  const controlIdx = Math.max(0, arms.findIndex(a => a.variantLabel.toLowerCase() === 'control'))
  const controlCR = arms[controlIdx]?.conversionRate || 0

  return arms.map((a, i) => ({
    variantId: a.variantId,
    variantLabel: a.variantLabel,
    impressions: a.impressions,
    conversions: a.conversions,
    conversionRate: a.conversionRate,
    probabilityBest: wins[i] / MONTE_CARLO_SAMPLES,
    isWinner: winnerId === a.variantId,
    liftPct: i === controlIdx || controlCR === 0 ? null : ((a.conversionRate - controlCR) / controlCR) * 100,
  }))
}

// ─── Status pill ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    running:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    completed: { bg: 'bg-indigo-500/10',  text: 'text-indigo-400' },
    concluded: { bg: 'bg-purple-500/10',  text: 'text-purple-400' },
    paused:    { bg: 'bg-amber-500/10',   text: 'text-amber-400' },
    draft:     { bg: 'bg-gray-500/10',    text: 'text-gray-400' },
    promoting: { bg: 'bg-blue-500/10',    text: 'text-blue-400' },
    archived:  { bg: 'bg-gray-500/10',    text: 'text-gray-500' },
  }
  const c = map[status] || { bg: 'bg-gray-500/10', text: 'text-gray-400' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text}`}>
      {status}
    </span>
  )
}

// ─── Confidence marker ────────────────────────────────────────────────────

function ConfidenceMarker({ probabilityBest, threshold }: { probabilityBest: number; threshold: number }) {
  const pct = probabilityBest * 100
  let label = 'Inconclusive'
  let color = 'text-gray-500 bg-gray-500/10'
  let icon = <Activity className="w-3 h-3" />
  if (probabilityBest >= threshold) {
    label = 'Significant'
    color = 'text-emerald-400 bg-emerald-500/15'
    icon = <ShieldCheck className="w-3 h-3" />
  } else if (probabilityBest >= 0.8) {
    label = 'Trending'
    color = 'text-amber-400 bg-amber-500/15'
    icon = <TrendingUp className="w-3 h-3" />
  } else if (probabilityBest >= 0.5) {
    label = 'Leaning'
    color = 'text-indigo-400 bg-indigo-500/10'
    icon = <ArrowUpRight className="w-3 h-3" />
  }
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      {icon}
      <span>{label}</span>
      <span className="font-mono">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ABTestingAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'concluded'>('all')

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  const fetchLedger = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/experiments?workspaceId=${workspaceId}`)
      const experiments = await res.json() as Experiment[]
      if (!Array.isArray(experiments)) {
        setRows([])
        setError(null)
        return
      }

      const ledger = await Promise.all(experiments.map(async (exp): Promise<LedgerRow | null> => {
        try {
          const r = await fetch(`/api/experiments/${exp.id}?workspaceId=${workspaceId}`)
          if (!r.ok) return null
          const data = await r.json() as { experiment: Experiment; variants: Variant[] }
          const stats = computeProbabilities(data.variants || [], exp.winner_variant_id)
          const totalImpressions = stats.reduce((acc, s) => acc + s.impressions, 0)
          const totalConversions = stats.reduce((acc, s) => acc + s.conversions, 0)
          const bestProbability = stats.length ? Math.max(...stats.map(s => s.probabilityBest)) : 0
          const controlIdx = Math.max(0, stats.findIndex(s => s.variantLabel.toLowerCase() === 'control'))
          const baselineCR = stats[controlIdx]?.conversionRate || 0
          const winnerIdx = stats.findIndex(s => s.probabilityBest === bestProbability)
          const bestCR = winnerIdx >= 0 ? stats[winnerIdx].conversionRate : baselineCR
          const uplift = baselineCR > 0 ? ((bestCR - baselineCR) / baselineCR) * 100 : null
          // Illustrative revenue Δ — purely a function of incremental conversions over the
          // control rate, multiplied by an internal placeholder of $50 average order value.
          // Once `lib/revenue.ts` exposes per-target-type avg-value lookups this will swap in.
          const incrementalConversions = Math.max(0, totalConversions - Math.round(baselineCR * totalImpressions))
          const revenueEstimate = incrementalConversions * 50

          return {
            experiment: exp,
            variants: stats,
            bestProbability,
            totalImpressions,
            totalConversions,
            uplift,
            baselineCR,
            bestCR,
            revenueEstimate,
          }
        } catch {
          return null
        }
      }))

      setRows(ledger.filter((row): row is LedgerRow => row !== null))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchLedger() }, [workspaceId, fetchLedger])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(r => r.experiment.status === filter)
  }, [rows, filter])

  // ── Summary tiles ──
  const summary = useMemo(() => {
    const totalImpressions = rows.reduce((acc, r) => acc + r.totalImpressions, 0)
    const totalConversions = rows.reduce((acc, r) => acc + r.totalConversions, 0)
    const winnersDeclared = rows.filter(r => r.experiment.winner_variant_id !== null).length
    const incrementalRev = rows.reduce((acc, r) => acc + r.revenueEstimate, 0)
    const avgUplift = (() => {
      const usable = rows.map(r => r.uplift).filter((v): v is number => v !== null)
      if (usable.length === 0) return 0
      return usable.reduce((a, b) => a + b, 0) / usable.length
    })()
    return {
      experiments: rows.length,
      totalImpressions,
      totalConversions,
      winnersDeclared,
      incrementalRev,
      avgUplift,
    }
  }, [rows])

  // ── Tabs ──
  const tabs: Array<{ id: typeof filter; label: string; count: number }> = [
    { id: 'all',       label: 'All',       count: rows.length },
    { id: 'running',   label: 'Running',   count: rows.filter(r => r.experiment.status === 'running').length },
    { id: 'completed', label: 'Completed', count: rows.filter(r => r.experiment.status === 'completed').length },
    { id: 'concluded', label: 'Concluded', count: rows.filter(r => r.experiment.status === 'concluded').length },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <BarChart3 className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">A/B Testing Performance</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Aggregate ledger across every variant arm — impressions, conversions, conversion-rate uplift,
                and revenue impact, with Bayesian confidence markers re-computed in real time.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchLedger()}
            disabled={loading || !workspaceId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">{error}</div>
          </div>
        )}

        {/* ── Summary tiles ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <SummaryTile
            label="Experiments"
            value={summary.experiments.toLocaleString()}
            icon={<Activity className="w-4 h-4" />}
            color="indigo"
          />
          <SummaryTile
            label="Total Impressions"
            value={summary.totalImpressions.toLocaleString()}
            icon={<TrendingUp className="w-4 h-4" />}
            color="blue"
          />
          <SummaryTile
            label="Total Conversions"
            value={summary.totalConversions.toLocaleString()}
            icon={<ShieldCheck className="w-4 h-4" />}
            color="emerald"
          />
          <SummaryTile
            label="Winners Declared"
            value={summary.winnersDeclared.toLocaleString()}
            icon={<Trophy className="w-4 h-4" />}
            color="amber"
          />
          <SummaryTile
            label="Avg Uplift"
            value={`${summary.avgUplift >= 0 ? '+' : ''}${summary.avgUplift.toFixed(1)}%`}
            icon={<ArrowUpRight className="w-4 h-4" />}
            color={summary.avgUplift >= 0 ? 'emerald' : 'rose'}
          />
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                filter === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-gray-500">({t.count})</span>
            </button>
          ))}
        </div>

        {/* ── Ledger ───────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading experiment performance ledger…</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
            <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400">
              {rows.length === 0
                ? 'No experiments yet. Run your first one from the Experiments dashboard.'
                : 'No experiments match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRows.map(row => (
              <LedgerCard key={row.experiment.id} row={row} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Summary tile ─────────────────────────────────────────────────────────

function SummaryTile({
  label, value, icon, color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose'
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400' },
    blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
    rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400' },
  }
  const c = colorMap[color]
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

// ─── Ledger card (one experiment + its variants) ──────────────────────────

function LedgerCard({ row }: { row: LedgerRow }) {
  const { experiment, variants } = row
  const threshold = Math.min(0.999, Math.max(0.5, Number(experiment.statistical_significance_threshold || 0.95)))
  const winnerIdx = variants.findIndex(v => v.probabilityBest === Math.max(...variants.map(s => s.probabilityBest)))

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <StatusPill status={experiment.status} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{experiment.name}</div>
            <div className="text-xs text-gray-500 mt-0.5 font-mono">
              {experiment.target_type} · threshold {(threshold * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-gray-400">
            <span className="font-semibold text-gray-200">{row.totalImpressions.toLocaleString()}</span>
            <span className="ml-1 text-gray-500">imp</span>
          </div>
          <div className="text-gray-400">
            <span className="font-semibold text-gray-200">{row.totalConversions.toLocaleString()}</span>
            <span className="ml-1 text-gray-500">conv</span>
          </div>
          {row.uplift !== null && (
            <div className={`font-semibold ${row.uplift >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.uplift >= 0 ? '+' : ''}{row.uplift.toFixed(1)}% uplift
            </div>
          )}
          {row.revenueEstimate > 0 && (
            <div className="text-emerald-400 font-semibold">
              +${row.revenueEstimate.toLocaleString()} est.
            </div>
          )}
        </div>
      </div>

      {/* Variant table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
              <th className="text-left px-5 py-2.5 font-medium">Variant</th>
              <th className="text-right px-3 py-2.5 font-medium">Impressions</th>
              <th className="text-right px-3 py-2.5 font-medium">Conversions</th>
              <th className="text-right px-3 py-2.5 font-medium">CR</th>
              <th className="text-right px-3 py-2.5 font-medium">Lift vs Control</th>
              <th className="text-left px-5 py-2.5 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const isLeader = i === winnerIdx && variants.length > 1
              const isPromoted = v.isWinner
              return (
                <tr
                  key={v.variantId}
                  className={`border-b border-gray-800/50 last:border-b-0 ${
                    isPromoted ? 'bg-emerald-500/5' : isLeader ? 'bg-indigo-500/5' : ''
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {isPromoted && <Crown className="w-3.5 h-3.5 text-emerald-400" />}
                      <span className="font-mono text-xs text-gray-200">{v.variantLabel}</span>
                      {v.variantLabel.toLowerCase() === 'control' && (
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">baseline</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right px-3 py-3 font-mono text-xs text-gray-300">
                    {v.impressions.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-3 font-mono text-xs text-gray-300">
                    {v.conversions.toLocaleString()}
                  </td>
                  <td className="text-right px-3 py-3 font-mono text-xs text-gray-200 font-semibold">
                    {(v.conversionRate * 100).toFixed(2)}%
                  </td>
                  <td className="text-right px-3 py-3 font-mono text-xs">
                    {v.liftPct === null ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      <span className={v.liftPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {v.liftPct >= 0 ? '+' : ''}{v.liftPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <ConfidenceMarker probabilityBest={v.probabilityBest} threshold={threshold} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
