'use client'

/**
 * /dashboard/settings/learning-hub
 *
 * Interactive timeline of every `learning_notes` row our agents have logged —
 * winning copy formulas, repurposing patterns, experiment outcomes, manual
 * highlights. This is the institutional memory of the workspace: the longer
 * you run the platform, the better your agents get because of what's here.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Source filter chips: All · Experiment Winners · Repurpose · Manual  │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Timeline                                                            │
 *   │   ● Today                                                            │
 *   │     ┌──────────────────────────────────────────────────────────────┐ │
 *   │     │ 🎯 Experiment winner · variant_a · 96.4% confidence          │ │
 *   │     │ "Subject line with curiosity gap outperformed direct ask…"   │ │
 *   │     └──────────────────────────────────────────────────────────────┘ │
 *   │   ● Yesterday                                                        │
 *   │     ┌──────────────────────────────────────────────────────────────┐ │
 *   │     │ 📚 Repurpose · blog_post → twitter_thread                    │ │
 *   │     │ "Listicle openers convert best when first 3 items are…"      │ │
 *   │     └──────────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen, RefreshCw, AlertCircle, Loader2, Search,
  Trophy, Sparkles, Repeat, ScrollText, Star,
  Filter, Calendar, Lightbulb,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface LearningNote {
  id: string
  workspace_id: string
  source_type: string
  source_id: string | null
  note: string
  confidence: number | string
  created_at: string
  // Joined fields from the API
  artifact_type?: string | null
  artifact_title?: string | null
}

type FilterId = 'all' | 'experiment' | 'repurpose' | 'manual' | 'other'

// ─── Source classification ────────────────────────────────────────────────

function classifySource(sourceType: string): FilterId {
  const lower = (sourceType || '').toLowerCase()
  if (lower.startsWith('experiment') || lower.includes('winner')) return 'experiment'
  if (lower.startsWith('repurpose')) return 'repurpose'
  if (lower === 'manual') return 'manual'
  return 'other'
}

function sourceIconColor(filterId: FilterId): { icon: React.ReactNode; color: string; bg: string; border: string } {
  switch (filterId) {
    case 'experiment':
      return {
        icon: <Trophy className="w-4 h-4" />,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
      }
    case 'repurpose':
      return {
        icon: <Repeat className="w-4 h-4" />,
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/20',
      }
    case 'manual':
      return {
        icon: <ScrollText className="w-4 h-4" />,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
      }
    default:
      return {
        icon: <Sparkles className="w-4 h-4" />,
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
      }
  }
}

// ─── Date grouping for timeline ───────────────────────────────────────────

function formatGroup(d: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - noteDay.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Confidence chip ──────────────────────────────────────────────────────

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  let color = 'text-gray-400 bg-gray-500/10'
  if (pct >= 90) color = 'text-emerald-400 bg-emerald-500/15'
  else if (pct >= 75) color = 'text-indigo-400 bg-indigo-500/15'
  else if (pct >= 60) color = 'text-amber-400 bg-amber-500/15'
  else color = 'text-rose-400 bg-rose-500/10'
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      <Star className="w-2.5 h-2.5" />
      <span className="font-mono">{pct}%</span>
      <span>confidence</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function LearningHubPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

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

  const fetchNotes = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/learning?workspaceId=${workspaceId}`)
      const rows = await res.json() as LearningNote[]
      setNotes(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchNotes() }, [workspaceId, fetchNotes])

  // ── Filter + search ──
  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter(n => {
      const cls = classifySource(n.source_type)
      if (filter !== 'all' && filter !== cls) return false
      if (q) {
        const hay = `${n.note} ${n.source_type} ${n.artifact_title || ''} ${n.artifact_type || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [notes, filter, query])

  // ── Group by date for timeline ──
  const grouped = useMemo(() => {
    const map = new Map<string, LearningNote[]>()
    for (const n of filteredNotes) {
      const d = new Date(n.created_at)
      const key = formatGroup(d)
      const arr = map.get(key) || []
      arr.push(n)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [filteredNotes])

  // ── Filter chips ──
  const filterChips: Array<{ id: FilterId; label: string; icon: React.ReactNode; count: number }> = [
    {
      id: 'all',
      label: 'All Insights',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      count: notes.length,
    },
    {
      id: 'experiment',
      label: 'Experiment Winners',
      icon: <Trophy className="w-3.5 h-3.5" />,
      count: notes.filter(n => classifySource(n.source_type) === 'experiment').length,
    },
    {
      id: 'repurpose',
      label: 'Repurpose Patterns',
      icon: <Repeat className="w-3.5 h-3.5" />,
      count: notes.filter(n => classifySource(n.source_type) === 'repurpose').length,
    },
    {
      id: 'manual',
      label: 'Manual Notes',
      icon: <ScrollText className="w-3.5 h-3.5" />,
      count: notes.filter(n => classifySource(n.source_type) === 'manual').length,
    },
    {
      id: 'other',
      label: 'Other Sources',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      count: notes.filter(n => classifySource(n.source_type) === 'other').length,
    },
  ]

  // ── Stats summary ──
  const summary = useMemo(() => {
    const totalConfidence = notes.reduce((acc, n) => acc + Number(n.confidence || 0), 0)
    const avgConfidence = notes.length > 0 ? totalConfidence / notes.length : 0
    const winners = notes.filter(n => classifySource(n.source_type) === 'experiment').length
    const sevenDays = notes.filter(n => {
      const d = new Date(n.created_at)
      return (Date.now() - d.getTime()) < 7 * 86_400_000
    }).length
    return {
      total: notes.length,
      avgConfidence: Math.round(avgConfidence * 100),
      winners,
      sevenDays,
    }
  }, [notes])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <BookOpen className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Learning Hub</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Institutional memory for your AI agents. Every winning copy formula, structural pattern,
                and experiment outcome they&apos;ve flagged — searchable, chronological, and feeding directly
                into your next CMO Brief.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchNotes()}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryTile
            label="Total Insights"
            value={summary.total.toLocaleString()}
            icon={<Lightbulb className="w-4 h-4" />}
            color="purple"
          />
          <SummaryTile
            label="Avg Confidence"
            value={`${summary.avgConfidence}%`}
            icon={<Star className="w-4 h-4" />}
            color="amber"
          />
          <SummaryTile
            label="Experiment Wins"
            value={summary.winners.toLocaleString()}
            icon={<Trophy className="w-4 h-4" />}
            color="emerald"
          />
          <SummaryTile
            label="Past 7 Days"
            value={summary.sevenDays.toLocaleString()}
            icon={<Calendar className="w-4 h-4" />}
            color="indigo"
          />
        </div>

        {/* ── Search + filter chips ────────────────────────────────────── */}
        <div className="mb-4">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search learning notes… (copy patterns, subject lines, agents)"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-gray-500 mr-0.5" />
            {filterChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => setFilter(chip.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  filter === chip.id
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                {chip.icon}
                {chip.label}
                <span className="text-gray-500 font-mono ml-0.5">({chip.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Timeline ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading learning notes…</span>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
            <BookOpen className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {notes.length === 0
                ? 'No learning notes yet. Your agents will start logging insights as they run experiments and repurpose content.'
                : 'No notes match your search.'}
            </p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Timeline rail */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-purple-500/30 via-gray-800 to-transparent" />

            {grouped.map(([groupLabel, items]) => (
              <div key={groupLabel} className="mb-6 last:mb-0">
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3 -ml-6 relative">
                  <div className="w-4 h-4 rounded-full bg-gray-950 border-2 border-purple-500/40 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {groupLabel}
                  </h3>
                  <span className="text-[10px] text-gray-600">({items.length})</span>
                </div>

                {/* Notes */}
                <div className="space-y-2.5">
                  {items.map(note => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </div>
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
  color: 'purple' | 'amber' | 'emerald' | 'indigo'
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  text: 'text-purple-400' },
    amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400' },
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

// ─── Note card ────────────────────────────────────────────────────────────

function NoteCard({ note }: { note: LearningNote }) {
  const cls = classifySource(note.source_type)
  const style = sourceIconColor(cls)
  const created = new Date(note.created_at)
  const confidence = Math.min(1, Math.max(0, Number(note.confidence || 0)))

  return (
    <div className={`group rounded-lg bg-gray-900/60 border ${style.border} hover:border-gray-700 transition`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Source icon */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-md ${style.bg} ${style.border} border ${style.color} flex items-center justify-center`}>
            {style.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Meta line */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${style.color}`}>
                {note.source_type.replace(/_/g, ' ')}
              </span>
              {note.artifact_title && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-400 truncate max-w-[240px]">
                    {note.artifact_title}
                  </span>
                </>
              )}
              {note.artifact_type && (
                <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded bg-gray-800/60">
                  {note.artifact_type}
                </span>
              )}
              <span className="text-gray-700">·</span>
              <span className="text-[10px] text-gray-500">{formatTime(created)}</span>
              <ConfidenceChip value={confidence} />
            </div>

            {/* Note body */}
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
              {note.note}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
