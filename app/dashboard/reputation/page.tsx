'use client'

/**
 * /dashboard/reputation
 *
 * Brand-mention triage stream + PR Circuit Breaker control + inline AI
 * Mention Replier. Polls every 20s; the crisis banner reacts to scanner
 * trips in real time.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldAlert, RefreshCw, AlertCircle, Search, ExternalLink, Sparkles,
  CheckCircle2, XCircle, Loader2, Bird, Globe, MessageSquare,
  Hash, Award, Send, Copy, ClipboardCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface BrandMention {
  id: string
  workspace_id: string
  source_platform: string
  source_url: string | null
  author_handle: string | null
  content_text: string
  sentiment_score: number | string
  severity_level: 'low' | 'medium' | 'high' | 'critical' | string
  status: 'unread' | 'flagged_crisis' | 'addressed' | 'dismissed' | string
  detected_at: string | null
  created_at: string
}

interface CrisisState {
  workspaceId: string
  crisisStatus: 'clear' | 'tripped' | 'recovering' | string
  crisisTrippedAt: string | null
  criticalUnreadCount: number
}

interface AIDraft {
  reply: string
  tone: string
  reasoning: string
  platform: string
  charLimit: number
  isHardLimit: boolean
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'
type StatusFilter = 'all' | 'unread' | 'flagged_crisis' | 'addressed' | 'dismissed'

// ─── Helpers ──────────────────────────────────────────────────────────────

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

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-rose-900/40 text-rose-200 border-rose-800',
  high:     'bg-amber-900/40 text-amber-200 border-amber-800',
  medium:   'bg-yellow-900/40 text-yellow-200 border-yellow-800',
  low:      'bg-gray-800 text-gray-400 border-gray-700',
}
const STATUS_PILL: Record<string, string> = {
  unread:         'bg-indigo-900/40 text-indigo-200 border-indigo-800',
  flagged_crisis: 'bg-rose-900/40 text-rose-200 border-rose-800',
  addressed:      'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  dismissed:      'bg-gray-800 text-gray-500 border-gray-700',
}

function PlatformIcon({ p, className = 'w-3.5 h-3.5' }: { p: string; className?: string }) {
  const k = p.toLowerCase()
  if (k === 'twitter' || k === 'x') return <Bird className={`${className} text-gray-300`} />
  if (k === 'reddit') return <Hash className={`${className} text-orange-400`} />
  if (k === 'instagram') return <Hash className={`${className} text-pink-400`} />
  if (k === 'linkedin') return <Award className={`${className} text-sky-400`} />
  if (k === 'news' || k === 'blog' || k === 'brave_search') return <Globe className={`${className} text-emerald-400`} />
  return <MessageSquare className={`${className} text-gray-500`} />
}

function SentimentDot({ score }: { score: number }) {
  const color = score >= 0.7 ? 'bg-emerald-500'
    : score >= 0.5 ? 'bg-yellow-400'
    : score >= 0.3 ? 'bg-amber-500'
    : 'bg-rose-500'
  return (
    <span className="inline-flex items-center gap-1.5" title={`Sentiment ${score.toFixed(2)}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[11px] text-gray-400 tabular-nums">{score.toFixed(2)}</span>
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ReputationPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [crisis, setCrisis] = useState<CrisisState | null>(null)
  const [mentions, setMentions] = useState<BrandMention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unread')

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

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [crisisRes, mentionsRes] = await Promise.all([
        fetch(`/api/crisis-status?workspaceId=${workspaceId}`),
        fetch(`/api/brand-mentions?workspaceId=${workspaceId}&limit=200`),
      ])
      const crisisData = await crisisRes.json() as CrisisState
      const mentionsData = await mentionsRes.json() as BrandMention[]
      setCrisis(crisisData)
      setMentions(Array.isArray(mentionsData) ? mentionsData : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (!workspaceId) return
    const t = setInterval(fetchAll, 20_000)
    return () => clearInterval(t)
  }, [workspaceId, fetchAll])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mentions.filter(m => {
      if (severityFilter !== 'all' && m.severity_level !== severityFilter) return false
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (q) {
        const hay = [m.content_text, m.author_handle, m.source_url, m.source_platform]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [mentions, search, severityFilter, statusFilter])

  const counts = useMemo(() => {
    const c = {
      unread: 0, flagged_crisis: 0, addressed: 0, dismissed: 0,
      critical: 0, high: 0, sumScore: 0, scored: 0,
    }
    for (const m of mentions) {
      const stat = m.status as keyof typeof c
      if (stat in c) c[stat]++
      const sev = m.severity_level as keyof typeof c
      if (sev in c) c[sev]++
      const score = Number(m.sentiment_score || 0)
      if (Number.isFinite(score)) { c.sumScore += score; c.scored++ }
    }
    return c
  }, [mentions])

  const avgSentiment = counts.scored > 0 ? counts.sumScore / counts.scored : 1
  const isInCrisis = (crisis?.crisisStatus || 'clear') !== 'clear'

  const updateMentionStatus = async (id: string, status: BrandMention['status']) => {
    if (!workspaceId) return
    setMentions(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    try {
      await fetch('/api/brand-mentions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId, status }),
      })
    } catch { /* refresh will reconcile */ }
  }

  const overrideCrisis = async (newStatus: 'clear' | 'recovering' | 'tripped') => {
    if (!workspaceId) return
    if (newStatus === 'clear' && (crisis?.criticalUnreadCount || 0) > 0) {
      if (!confirm(`There are still ${crisis?.criticalUnreadCount} unaddressed critical mentions. Clear anyway?`)) return
    }
    try {
      await fetch('/api/crisis-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, status: newStatus, note: 'Manual override from /dashboard/reputation' }),
      })
      fetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-400" /> Reputation
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Live brand-mention triage + PR Circuit Breaker. Inline AI drafts respect platform length budgets.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Crisis banner */}
        {crisis && isInCrisis && (
          <CrisisBanner crisis={crisis} onOverride={overrideCrisis} />
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Unread" value={String(counts.unread)} accent="text-indigo-300" />
          <StatCard label="Flagged crisis" value={String(counts.flagged_crisis)} accent={counts.flagged_crisis > 0 ? 'text-rose-300' : 'text-gray-300'} />
          <StatCard label="Addressed" value={String(counts.addressed)} accent="text-emerald-300" />
          <StatCard
            label="Avg sentiment"
            value={avgSentiment.toFixed(2)}
            accent={avgSentiment >= 0.7 ? 'text-emerald-300' : avgSentiment >= 0.5 ? 'text-yellow-300' : 'text-rose-300'}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search content, author, platform…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <select
            value={severityFilter} onChange={e => setSeverityFilter(e.target.value as SeverityFilter)}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="unread">Unread</option>
            <option value="flagged_crisis">Flagged crisis</option>
            <option value="addressed">Addressed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filtered.length} of {mentions.length} mentions
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading mention stream…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {mentions.length === 0 ? 'No mentions captured yet' : 'No mentions match your filters'}
            </p>
            <p className="text-sm text-gray-600">
              {mentions.length === 0
                ? 'The brand-monitor cron scans every 10 minutes. Add competitor names + ensure BRAVE_SEARCH_API_KEY is configured.'
                : 'Try clearing the search or switching status filter to All.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => (
              <MentionCard
                key={m.id}
                workspaceId={workspaceId!}
                mention={m}
                onMarkAddressed={() => updateMentionStatus(m.id, 'addressed')}
                onDismiss={() => updateMentionStatus(m.id, 'dismissed')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Crisis Banner ─────────────────────────────────────────────────────────

function CrisisBanner({
  crisis, onOverride,
}: { crisis: CrisisState; onOverride: (status: 'clear' | 'recovering' | 'tripped') => void }) {
  const isTripped = crisis.crisisStatus === 'tripped'
  const colorClass = isTripped
    ? 'border-rose-700 bg-rose-950/40'
    : 'border-amber-700 bg-amber-950/40'
  const pulseClass = isTripped ? 'bg-rose-500' : 'bg-amber-500'

  return (
    <div className={`relative overflow-hidden mb-6 border-2 rounded-xl p-5 ${colorClass}`}>
      <div className={`absolute -top-1/2 -right-1/2 w-96 h-96 rounded-full opacity-10 ${pulseClass} animate-pulse pointer-events-none`} />

      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 relative">
            <span className={`absolute inset-0 rounded-full ${pulseClass} opacity-50 animate-ping`} />
            <span className={`relative inline-flex w-3 h-3 rounded-full ${pulseClass}`} />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${isTripped ? 'text-rose-200' : 'text-amber-200'}`}>
              ⚠ PR Circuit Breaker — {crisis.crisisStatus.toUpperCase()}
            </h2>
            <p className={`text-sm mt-1 ${isTripped ? 'text-rose-300/80' : 'text-amber-300/80'}`}>
              {isTripped
                ? 'All outbound dispatch (publishing, ads, email, PR) is paused.'
                : 'Outbound paused while you respond. Flip to clear once handled.'}
              {crisis.crisisTrippedAt && (
                <> Tripped <span className="font-medium">{formatRelative(crisis.crisisTrippedAt)}</span>.</>
              )}
              {' '}
              <span className={isTripped ? 'text-rose-200 font-semibold' : 'text-amber-200 font-semibold'}>
                {crisis.criticalUnreadCount} critical mention{crisis.criticalUnreadCount === 1 ? '' : 's'} still unaddressed.
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {isTripped && (
            <button
              onClick={() => onOverride('recovering')}
              className="px-3 py-1.5 bg-amber-900/50 hover:bg-amber-900/70 border border-amber-700 text-amber-100 text-xs rounded-lg font-medium"
            >
              Mark recovering
            </button>
          )}
          <button
            onClick={() => onOverride('clear')}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg font-medium inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Clear breaker
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mention Card with inline AI Replier ──────────────────────────────────

function MentionCard({
  workspaceId, mention, onMarkAddressed, onDismiss,
}: {
  workspaceId: string
  mention: BrandMention
  onMarkAddressed: () => void
  onDismiss: () => void
}) {
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState<AIDraft | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sentimentScore = Number(mention.sentiment_score || 0)
  const charLimit = draft?.charLimit || 1500
  const charCount = editText.length
  const overLimit = !!draft?.isHardLimit && charCount > charLimit

  const fetchDraft = async () => {
    setDraftLoading(true); setDraftError(null)
    try {
      const res = await fetch('/api/agents/mention-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, mentionId: mention.id }),
      })
      const data = await res.json() as { ok?: boolean; draft?: AIDraft; error?: string }
      if (!res.ok || !data.ok || !data.draft) throw new Error(data.error || 'Draft failed')
      setDraft(data.draft)
      setEditText(data.draft.reply)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err))
    } finally {
      setDraftLoading(false)
    }
  }

  const toggleDraft = () => {
    setDraftOpen(prev => !prev)
    if (!draftOpen && !draft) fetchDraft()
  }

  const sendReply = async () => {
    if (!draft || !editText.trim() || overLimit) return
    setSending(true); setSendResult(null)
    try {
      const platform = mention.source_platform.toLowerCase()
      if (platform === 'twitter' || platform === 'x') {
        const res = await fetch('/api/publish/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            platforms: ['twitter'],
            content: editText,
          }),
        })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (!res.ok || data.ok === false) throw new Error(data.error || 'Publish failed')
        setSendResult({ ok: true, message: 'Reply posted to X.' })
        onMarkAddressed()
      } else {
        try { await navigator.clipboard.writeText(editText) } catch { /* ignore */ }
        setSendResult({
          ok: true,
          message: `Copied to clipboard. ${platform} doesn't have a direct OAuth post route yet — paste it in the original thread, then mark addressed.`,
        })
      }
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <PlatformIcon p={mention.source_platform} />
          <span className="text-gray-300 capitalize">{mention.source_platform.replace('_', ' ')}</span>
          {mention.author_handle && (
            <span className="text-gray-500">· @{mention.author_handle}</span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${SEVERITY_PILL[mention.severity_level] || SEVERITY_PILL.low}`}>
            {mention.severity_level}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_PILL[mention.status] || STATUS_PILL.unread}`}>
            {mention.status.replace('_', ' ')}
          </span>
          <SentimentDot score={sentimentScore} />
        </div>
        <span className="text-[11px] text-gray-500 flex-shrink-0">{formatRelative(mention.created_at)}</span>
      </div>

      {/* Mention content */}
      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed mb-3">
        {mention.content_text}
      </p>

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-800 flex-wrap">
        <div className="flex items-center gap-2">
          {mention.source_url && (
            <a
              href={mention.source_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> Open source
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mention.status !== 'addressed' && (
            <button
              onClick={toggleDraft}
              className="px-2.5 py-1 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              {draftOpen ? 'Hide draft' : 'Draft AI reply'}
            </button>
          )}
          {mention.status !== 'addressed' && (
            <button
              onClick={onMarkAddressed}
              className="px-2.5 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-emerald-800 text-emerald-200 rounded inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3 h-3" /> Mark addressed
            </button>
          )}
          {mention.status !== 'dismissed' && mention.status !== 'addressed' && (
            <button
              onClick={onDismiss}
              className="px-2.5 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1.5"
            >
              <XCircle className="w-3 h-3" /> Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Inline AI Replier */}
      {draftOpen && (
        <div className="mt-3 bg-purple-950/20 border border-purple-900/50 rounded-lg p-4">
          {draftLoading ? (
            <div className="flex items-center justify-center py-6 text-purple-300 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Drafting platform-aware reply…
            </div>
          ) : draftError ? (
            <div className="text-rose-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">{draftError}</div>
              <button onClick={fetchDraft} className="text-xs text-rose-200 underline">retry</button>
            </div>
          ) : draft ? (
            <>
              <div className="flex items-center justify-between mb-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-purple-300">AI Mention Reply</span>
                  <span className="text-[10px] text-purple-400 bg-purple-900/40 border border-purple-800 px-1.5 py-0.5 rounded">
                    {draft.tone}
                  </span>
                  <span className="text-[10px] text-purple-400">
                    · target {draft.charLimit}ch {draft.isHardLimit ? '(hard)' : '(soft)'}
                  </span>
                </div>
                <button
                  onClick={fetchDraft}
                  className="text-purple-300 hover:text-purple-200 p-1"
                  title="Regenerate"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={Math.min(8, Math.max(3, Math.ceil(editText.length / 80)))}
                className={`w-full bg-gray-950 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none ${
                  overLimit ? 'border-rose-700 focus:border-rose-600' : 'border-gray-800 focus:border-indigo-600'
                }`}
              />

              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className={overLimit ? 'text-rose-400 font-medium' : 'text-gray-500'}>
                  {charCount} / {charLimit}
                  {overLimit && ' · over hard limit'}
                </span>
                <p className="text-[11px] text-gray-500 italic truncate max-w-[60%]" title={draft.reasoning}>
                  {draft.reasoning}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <CopyButton text={editText} />
                <button
                  onClick={sendReply}
                  disabled={sending || overLimit || !editText.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded inline-flex items-center gap-1.5"
                >
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>

              {sendResult && (
                <div className={`mt-3 text-xs flex items-start gap-1.5 ${sendResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {sendResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5" />}
                  <span>{sendResult.message}</span>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </article>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">{label}</p>
      <div className={`text-2xl font-bold tabular-nums ${accent || 'text-white'}`}>{value}</div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={copy}
      className="px-2.5 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1.5"
    >
      {copied ? <ClipboardCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
