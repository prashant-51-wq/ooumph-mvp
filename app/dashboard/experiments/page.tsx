'use client'

/**
 * /dashboard/experiments
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Header + tabs (All / Running / Completed / Concluded)          │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  Experiment list                                                │
 *   │   ┌──────────────────────────────────────────────────────────┐ │
 *   │   │ Status pill · Name · target_type · started Xd ago        │ │
 *   │   │                                                          │ │
 *   │   │ Conversion Probability Meter:                            │ │
 *   │   │   control  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  41.2%    132/2100  │ │
 *   │   │   variant_a ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  58.8%    158/2089  │ │
 *   │   │                                                          │ │
 *   │   │ 🎯 Winner found! Variant 'variant_a' · 96.4% confidence │ │
 *   │   │ [✓ Promote winner permanently]                           │ │
 *   │   └──────────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Monte Carlo posterior probabilities are computed CLIENT-SIDE (~50ms for
 * 5000 samples per page render) so the dashboard updates in real time as
 * counts tick up.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlaskConical, RefreshCw, AlertCircle, Plus, Loader2, CheckCircle2,
  Trophy, TrendingUp, Activity, Clock, ShieldCheck, X,
  Pause, Play, Trash2, Edit3, Sparkles, Target,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface Experiment {
  id: string
  workspace_id: string
  name: string
  hypothesis: string | null
  target_type: string
  target_reference_id: string
  status: 'draft' | 'running' | 'paused' | 'completed' | 'promoting' | 'concluded' | 'archived' | string
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

interface VariantStats extends Variant {
  conversionRate: number
  probabilityBest: number
  impressions: number
  conversions: number
}

type TabFilter = 'all' | 'running' | 'completed' | 'concluded'

// ─── Helpers ──────────────────────────────────────────────────────────────

const MONTE_CARLO_SAMPLES = 5000  // client-side, kept tight for browser perf

/** Marsaglia–Tsang gamma sampler (same algorithm as the server cron). */
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

function randNormal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sampleBeta(alpha: number, beta: number): number {
  const g1 = sampleGamma(alpha)
  const g2 = sampleGamma(beta)
  return g1 / (g1 + g2)
}

/** Compute posterior P(best) for each variant via Monte Carlo. */
function computeProbabilities(variants: Variant[]): VariantStats[] {
  const arms = variants.map(v => {
    const imp = Math.max(0, Number(v.impression_count || 0))
    const conv = Math.min(imp, Math.max(0, Number(v.conversion_count || 0)))
    return {
      ...v,
      impressions: imp,
      conversions: conv,
      conversionRate: imp > 0 ? conv / imp : 0,
      probabilityBest: 0,
    }
  })
  if (arms.length === 0) return []
  // If no impressions at all, distribute equally so the UI doesn't show 0%
  const totalImpressions = arms.reduce((s, a) => s + a.impressions, 0)
  if (totalImpressions === 0) {
    arms.forEach(a => { a.probabilityBest = 1 / arms.length })
    return arms
  }
  const winCounts = new Array<number>(arms.length).fill(0)
  for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
    let bestIdx = 0
    let bestVal = -1
    for (let j = 0; j < arms.length; j++) {
      const alpha = arms[j].conversions + 1
      const beta = (arms[j].impressions - arms[j].conversions) + 1
      const draw = sampleBeta(alpha, beta)
      if (draw > bestVal) { bestVal = draw; bestIdx = j }
    }
    winCounts[bestIdx]++
  }
  for (let i = 0; i < arms.length; i++) {
    arms[i].probabilityBest = winCounts[i] / MONTE_CARLO_SAMPLES
  }
  return arms
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

function formatPct(p: number): string {
  if (!Number.isFinite(p)) return '0%'
  return `${(p * 100).toFixed(1)}%`
}

const STATUS_PILL: Record<string, string> = {
  draft:      'bg-gray-800 text-gray-400 border-gray-700',
  running:    'bg-blue-900/40 text-blue-200 border-blue-800',
  paused:     'bg-amber-900/40 text-amber-200 border-amber-800',
  completed:  'bg-purple-900/40 text-purple-200 border-purple-800',
  promoting:  'bg-indigo-900/40 text-indigo-200 border-indigo-800',
  concluded:  'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  archived:   'bg-gray-800 text-gray-500 border-gray-700',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_PILL[status] || STATUS_PILL.draft}`}>
      {(status === 'running' || status === 'promoting') && <Loader2 className="w-3 h-3 animate-spin" />}
      {status}
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ExperimentsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [variantsByExpId, setVariantsByExpId] = useState<Record<string, Variant[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabFilter>('running')
  const [showNew, setShowNew] = useState(false)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null)

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

  const fetchExperiments = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/experiments?workspaceId=${workspaceId}`)
      const rows = await res.json() as Experiment[]
      setExperiments(Array.isArray(rows) ? rows : [])
      setError(null)

      // Fetch variants for visible experiments
      const visible = (Array.isArray(rows) ? rows : []).filter(e =>
        e.status === 'running' || e.status === 'completed' || e.status === 'concluded' || e.status === 'paused',
      )
      const variantResults = await Promise.all(
        visible.map(e =>
          fetch(`/api/experiments/${e.id}?workspaceId=${workspaceId}`)
            .then(r => r.ok ? r.json() : null)
            .then((data: { variants?: Variant[] } | null) => ({ id: e.id, variants: data?.variants || [] }))
            .catch(() => ({ id: e.id, variants: [] as Variant[] })),
        ),
      )
      const next: Record<string, Variant[]> = {}
      for (const r of variantResults) next[r.id] = r.variants
      setVariantsByExpId(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchExperiments() }, [fetchExperiments])
  useEffect(() => {
    if (!workspaceId) return
    const anyRunning = experiments.some(e => e.status === 'running')
    const interval = anyRunning ? 30_000 : 60_000
    const t = setInterval(fetchExperiments, interval)
    return () => clearInterval(t)
  }, [workspaceId, experiments, fetchExperiments])

  // Filter by tab
  const filtered = useMemo(() => {
    if (tab === 'all') return experiments
    if (tab === 'running') return experiments.filter(e => e.status === 'running' || e.status === 'paused')
    if (tab === 'completed') return experiments.filter(e => e.status === 'completed' || e.status === 'promoting')
    if (tab === 'concluded') return experiments.filter(e => e.status === 'concluded' || e.status === 'archived')
    return experiments
  }, [experiments, tab])

  const counts = useMemo(() => {
    const c = { all: experiments.length, running: 0, completed: 0, concluded: 0 }
    for (const e of experiments) {
      if (e.status === 'running' || e.status === 'paused') c.running++
      else if (e.status === 'completed' || e.status === 'promoting') c.completed++
      else if (e.status === 'concluded' || e.status === 'archived') c.concluded++
    }
    return c
  }, [experiments])

  // ── Actions ────────────────────────────────────────────────────────────
  const promoteWinner = async (experimentId: string) => {
    if (!workspaceId) return
    setPromotingId(experimentId); setActionResult(null)
    try {
      const res = await fetch(`/api/experiments/${experimentId}/promote-winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; message?: string; fieldsApplied?: string[] }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Promote failed')
      setActionResult({
        ok: true,
        message: data.message || `Winner promoted. Fields applied: ${data.fieldsApplied?.join(', ') || '—'}`,
      })
      fetchExperiments()
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setPromotingId(null)
    }
  }

  const toggleRun = async (experiment: Experiment) => {
    if (!workspaceId) return
    const nextStatus =
      experiment.status === 'draft' || experiment.status === 'paused' ? 'running' :
      experiment.status === 'running' ? 'paused' : null
    if (!nextStatus) return
    try {
      await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: experiment.id, workspaceId, status: nextStatus }),
      })
      fetchExperiments()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const deleteExperiment = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this experiment? All variants and event data will be cascade-deleted.')) return
    try {
      await fetch(`/api/experiments?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      fetchExperiments()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-indigo-400" /> Experiments
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Bayesian A/B testing across email, ads, funnels, PR, and creative. Deterministic SHA-256 traffic splits.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchExperiments}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <a
              href="/dashboard/analytics/ab-testing"
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              Performance ledger →
            </a>
            <button
              onClick={() => setShowNew(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New experiment
            </button>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5 mb-4 w-fit">
          {([
            { id: 'all' as TabFilter,        label: 'All' },
            { id: 'running' as TabFilter,    label: 'Running' },
            { id: 'completed' as TabFilter,  label: 'Awaiting promotion' },
            { id: 'concluded' as TabFilter,  label: 'Concluded' },
          ]).map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs rounded inline-flex items-center gap-1.5 ${
                  active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
                <span className="text-[10px] opacity-70 tabular-nums">{counts[t.id]}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {actionResult && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
            actionResult.ok
              ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-300'
              : 'bg-rose-950/40 border border-rose-900 text-rose-300'
          }`}>
            {actionResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <div className="flex-1">{actionResult.message}</div>
            <button onClick={() => setActionResult(null)} className="opacity-50 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading experiments…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <FlaskConical className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {experiments.length === 0 ? 'No experiments yet' : `No ${tab} experiments`}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {experiments.length === 0
                ? 'A/B-test any email subject, ad headline, funnel page, or PR pitch.'
                : 'Switch tabs to see experiments in other states.'}
            </p>
            {experiments.length === 0 && (
              <button
                onClick={() => setShowNew(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create first experiment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(exp => (
              <ExperimentCard
                key={exp.id}
                experiment={exp}
                variants={variantsByExpId[exp.id] || []}
                onPromote={() => promoteWinner(exp.id)}
                onToggleRun={() => toggleRun(exp)}
                onDelete={() => deleteExperiment(exp.id)}
                promoting={promotingId === exp.id}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && workspaceId && (
        <NewExperimentModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); fetchExperiments() }}
        />
      )}
    </div>
  )
}

// ─── Experiment Card with Conversion Probability Meter ────────────────────

function ExperimentCard({
  experiment, variants, onPromote, onToggleRun, onDelete, promoting,
}: {
  experiment: Experiment
  variants: Variant[]
  onPromote: () => void
  onToggleRun: () => void
  onDelete: () => void
  promoting: boolean
}) {
  // Compute posterior probabilities client-side via Monte Carlo
  const stats = useMemo<VariantStats[]>(
    () => computeProbabilities(variants),
    [variants],
  )

  const threshold = Number(experiment.statistical_significance_threshold || 0.95)
  const leader = useMemo(
    () => stats.reduce<VariantStats | null>((best, cur) =>
      !best || cur.probabilityBest > best.probabilityBest ? cur : best, null),
    [stats],
  )
  const winnerVariant = stats.find(v => v.id === experiment.winner_variant_id) || null
  const showPromoteBanner = experiment.status === 'completed' && winnerVariant
  const totalImpressions = stats.reduce((s, v) => s + v.impressions, 0)
  const totalConversions = stats.reduce((s, v) => s + v.conversions, 0)

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusPill status={experiment.status} />
              <span className="text-[11px] text-gray-500">
                <code className="text-indigo-300">{experiment.target_type}</code>
                <span className="text-gray-700"> · </span>
                <code className="font-mono">{experiment.target_reference_id.slice(0, 12)}…</code>
              </span>
              {experiment.started_at && (
                <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Running {formatRelative(experiment.started_at)}
                </span>
              )}
            </div>
            <h2 className="text-base text-white font-semibold">{experiment.name}</h2>
            {experiment.hypothesis && (
              <p className="text-xs text-gray-500 mt-1 italic">{experiment.hypothesis}</p>
            )}
          </div>
          <div className="flex gap-1">
            {(experiment.status === 'draft' || experiment.status === 'paused' || experiment.status === 'running') && (
              <button
                onClick={onToggleRun}
                className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded"
                title={experiment.status === 'running' ? 'Pause' : 'Start running'}
              >
                {experiment.status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            )}
            {experiment.status !== 'promoting' && experiment.status !== 'concluded' && (
              <button
                onClick={onDelete}
                className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Activity className="w-3 h-3" /> {totalImpressions.toLocaleString()} impressions
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="w-3 h-3" /> {totalConversions.toLocaleString()} conversions
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Threshold {(threshold * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Conversion Probability Meter */}
      <div className="p-5 space-y-3">
        {stats.length === 0 ? (
          <p className="text-xs text-gray-600 italic text-center py-3">No variants attached</p>
        ) : (
          stats.map(arm => {
            const isWinner = experiment.winner_variant_id === arm.id
            const isLeader = leader?.id === arm.id && experiment.status !== 'concluded'
            return (
              <div key={arm.id}>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[11px] ${isWinner ? 'text-emerald-300 font-semibold' : 'text-gray-300'}`}>
                      {arm.variant_label}
                    </span>
                    {isWinner && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-300">
                        <Trophy className="w-3 h-3" /> winner
                      </span>
                    )}
                    {isLeader && !isWinner && (
                      <span className="text-[10px] text-indigo-300">leader</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 tabular-nums">
                    <span>CR <span className="text-gray-300">{formatPct(arm.conversionRate)}</span></span>
                    <span>{arm.conversions.toLocaleString()}/{arm.impressions.toLocaleString()}</span>
                    <span className={`font-semibold ${
                      arm.probabilityBest >= threshold ? 'text-emerald-300'
                      : arm.probabilityBest >= 0.5 ? 'text-indigo-300'
                      : 'text-gray-400'
                    }`}>
                      {formatPct(arm.probabilityBest)} P(best)
                    </span>
                  </div>
                </div>
                {/* The horizontal meter bar */}
                <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isWinner ? 'bg-emerald-500'
                      : isLeader ? 'bg-indigo-500'
                      : 'bg-gray-600'
                    }`}
                    style={{ width: `${Math.max(2, arm.probabilityBest * 100)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Winner-promotion banner */}
      {showPromoteBanner && winnerVariant && (
        <div className="border-t-2 border-emerald-700 bg-emerald-950/30 px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-700 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-emerald-200">
                  🎯 Winner found — promotion ready
                </h3>
                <p className="text-xs text-emerald-300/80 mt-1">
                  Variant <code className="font-mono text-emerald-200">{winnerVariant.variant_label}</code> reached{' '}
                  <span className="font-semibold">{formatPct(winnerVariant.probabilityBest)}</span> posterior probability
                  (CR {formatPct(winnerVariant.conversionRate)} over {winnerVariant.impressions.toLocaleString()} impressions).
                  Click promote to merge its configuration permanently into the underlying <code className="text-emerald-200">{experiment.target_type}</code>.
                </p>
              </div>
            </div>
            <button
              onClick={onPromote}
              disabled={promoting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2 flex-shrink-0"
            >
              {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {promoting ? 'Promoting…' : 'Promote winner permanently'}
            </button>
          </div>
        </div>
      )}

      {/* Concluded summary */}
      {experiment.status === 'concluded' && winnerVariant && (
        <div className="border-t border-gray-800 bg-gray-950/40 px-5 py-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-gray-300">
            Concluded — <code className="font-mono text-emerald-300">{winnerVariant.variant_label}</code> promoted permanently
            {experiment.completed_at && <span className="text-gray-500"> · {formatRelative(experiment.completed_at)}</span>}
          </span>
        </div>
      )}
    </article>
  )
}

// ─── New Experiment Modal ─────────────────────────────────────────────────

interface VariantDraft {
  label: string
  trafficAllocationWeight: number
  configurationOverrideJson: string
}

const TARGET_TYPE_OPTIONS = [
  { id: 'email_campaign', label: 'Email campaign', hint: 'subject, preview text, body, CTA fields' },
  { id: 'ad_creative',    label: 'Ad creative',    hint: 'headline, body_copy, destination_url, media_url' },
  { id: 'funnel_step',    label: 'Funnel step',    hint: 'html_content (full page replace)' },
  { id: 'pr_campaign',    label: 'PR campaign',    hint: 'title, body_content' },
  { id: 'artifact',       label: 'Artifact',       hint: 'content_json (generic merge)' },
]

function NewExperimentModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [targetType, setTargetType] = useState('email_campaign')
  const [targetRefId, setTargetRefId] = useState('')
  const [threshold, setThreshold] = useState(0.95)
  const [variants, setVariants] = useState<VariantDraft[]>([
    { label: 'control', trafficAllocationWeight: 50, configurationOverrideJson: '{}' },
    { label: 'a',       trafficAllocationWeight: 50, configurationOverrideJson: '{}' },
  ])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const updateVariant = (idx: number, patch: Partial<VariantDraft>) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v))
  }
  const addVariant = () => {
    if (variants.length >= 10) return
    const next = String.fromCharCode(97 + variants.length - 1)  // 'a', 'b', 'c'…
    setVariants(prev => [...prev, { label: next, trafficAllocationWeight: 25, configurationOverrideJson: '{}' }])
  }
  const removeVariant = (idx: number) => {
    if (variants.length <= 2) return
    setVariants(prev => prev.filter((_, i) => i !== idx))
  }

  const submit = async () => {
    if (!name.trim() || !targetRefId.trim()) { setErr('Name + target reference ID required'); return }
    setSaving(true); setErr(null)
    try {
      // Validate each override is valid JSON before submission
      for (const v of variants) {
        try { JSON.parse(v.configurationOverrideJson || '{}') }
        catch { throw new Error(`Variant "${v.label}" has invalid JSON override`) }
      }
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, name: name.trim(),
          hypothesis: hypothesis.trim() || undefined,
          targetType, targetReferenceId: targetRefId.trim(),
          statisticalSignificanceThreshold: threshold,
          variants: variants.map(v => ({
            label: v.label,
            trafficAllocationWeight: v.trafficAllocationWeight,
            configurationOverrideJson: JSON.parse(v.configurationOverrideJson || '{}'),
          })),
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; id?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Create failed')
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-400" /> New experiment
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <Field label="Experiment name *" value={name} onChange={setName} placeholder="Q2 subject line vs preview text" />
          <Field
            label="Hypothesis"
            value={hypothesis}
            onChange={setHypothesis}
            placeholder="If we lead the subject line with a question, we'll lift open rate by 10%."
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Target type *</label>
              <select
                value={targetType} onChange={e => setTargetType(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
              >
                {TARGET_TYPE_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-600 mt-1">
                {TARGET_TYPE_OPTIONS.find(t => t.id === targetType)?.hint}
              </p>
            </div>
            <Field label="Target reference ID *" value={targetRefId} onChange={setTargetRefId} placeholder="ec_abc123 (campaign id)" mono />
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">
              Significance threshold ({(threshold * 100).toFixed(1)}%)
            </label>
            <input
              type="range" min="0.80" max="0.99" step="0.01"
              value={threshold} onChange={e => setThreshold(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <p className="text-[10px] text-gray-600">
              Posterior P(best) required before the cron declares a winner. Higher = stricter, more samples needed.
            </p>
          </div>

          {/* Variants editor */}
          <div className="pt-3 border-t border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase text-gray-500 font-medium">Variants ({variants.length})</label>
              {variants.length < 10 && (
                <button onClick={addVariant} className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add variant
                </button>
              )}
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={v.label} onChange={e => updateVariant(i, { label: e.target.value })}
                      placeholder="label"
                      className="flex-1 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-indigo-600 focus:outline-none"
                    />
                    <input
                      type="number" min={1} max={100}
                      value={v.trafficAllocationWeight}
                      onChange={e => updateVariant(i, { trafficAllocationWeight: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white text-right focus:border-indigo-600 focus:outline-none"
                      title="Traffic allocation weight"
                    />
                    <span className="text-[10px] text-gray-500">weight</span>
                    {variants.length > 2 && (
                      <button onClick={() => removeVariant(i)} className="text-gray-500 hover:text-rose-400 p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={v.configurationOverrideJson}
                    onChange={e => updateVariant(i, { configurationOverrideJson: e.target.value })}
                    rows={3}
                    placeholder='{"subject": "alternative subject line"}'
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-[11px] text-white font-mono focus:border-indigo-600 focus:outline-none resize-none"
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              Traffic split is proportional to weights (e.g. 50/50, 70/30). control's override stays at <code className="text-indigo-300">{`{}`}</code> (no change to base).
            </p>
          </div>

          {err && (
            <div className="p-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs">
              <AlertCircle className="w-3 h-3 inline mr-1" /> {err}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {saving ? 'Creating…' : 'Create as draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="block text-xs uppercase text-gray-500 mb-1.5">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

// Unused-import sentinel
void TrendingUp; void Edit3
