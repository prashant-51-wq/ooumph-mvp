'use client'

/**
 * /dashboard/content
 *
 * Content library. Merges two live data sources:
 *   1. scheduled_content rows (the queue — pending / publishing / failed)
 *   2. published_content rows (the historical log — links to permalinks)
 *
 * Renders a unified grid sorted newest-first with explicit status pills,
 * channel chips, and an outbound "View live →" anchor on every row that
 * has a real permalink. The grid filters by channel + status + a search box.
 *
 * Polls /api/publishing every 20s so freshly-published rows show up
 * without a manual refresh.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText, RefreshCw, Search, ExternalLink, AlertCircle,
  Briefcase, Bird, Globe, Layers, ShieldCheck, Clock,
  CheckCircle2, XCircle, Loader2, AlertTriangle, ChevronRight,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ScheduledItem {
  id: string
  workspace_id: string
  artifact_id: string | null
  channel: string | null
  platform: string | null
  content_body: string | null
  content: string | null
  scheduled_at: string | null
  scheduled_for: string | null
  status: string
  retry_count: number
  error_message: string | null
  created_at: string
  updated_at: string | null
}

interface PublishedRow {
  id: string
  scheduled_content_id: string | null
  artifact_id: string | null
  channel: string | null
  platform: string | null
  native_post_id: string | null
  post_id: string | null
  permalink: string | null
  post_url: string | null
  title: string | null
  published_at: string
  metadata_json?: string | Record<string, unknown> | null
}

interface UnifiedRow {
  id: string                      // scheduled_content.id or publish_log.id
  source: 'scheduled' | 'published'
  channel: string
  body: string
  status: string                  // pending | publishing | published | failed | …
  artifact_id: string | null
  scheduled_at: string | null
  published_at: string | null
  permalink: string | null
  retry_count: number
  error_message: string | null
  shortenedUrls?: number
}

type ChannelFilter = 'all' | 'linkedin' | 'twitter' | 'wordpress'
type StatusFilter = 'all' | 'pending' | 'publishing' | 'published' | 'failed' | 'cancelled'

const CHANNEL_OPTIONS: Array<{ id: ChannelFilter; label: string; Icon: typeof Briefcase }> = [
  { id: 'all', label: 'All', Icon: Layers },
  { id: 'linkedin', label: 'LinkedIn', Icon: Briefcase },
  { id: 'twitter', label: 'X / Twitter', Icon: Bird },
  { id: 'wordpress', label: 'WordPress', Icon: Globe },
]
const STATUS_OPTIONS: StatusFilter[] = ['all', 'pending', 'publishing', 'published', 'failed', 'cancelled']

const POLL_MS = 20_000

// ─── Helpers ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { pill: string; Icon: typeof Clock }> = {
  pending:    { pill: 'bg-amber-900/40 text-amber-200 border-amber-800',       Icon: Clock },
  publishing: { pill: 'bg-blue-900/40 text-blue-200 border-blue-800',          Icon: Loader2 },
  published:  { pill: 'bg-emerald-900/40 text-emerald-200 border-emerald-800', Icon: CheckCircle2 },
  failed:     { pill: 'bg-rose-900/40 text-rose-200 border-rose-800',          Icon: XCircle },
  cancelled:  { pill: 'bg-gray-800 text-gray-400 border-gray-700',             Icon: XCircle },
  paused:     { pill: 'bg-gray-800 text-gray-400 border-gray-700',             Icon: Clock },
}
function statusOf(status: string) {
  return STATUS_STYLE[status] || { pill: 'bg-gray-800 text-gray-400 border-gray-700', Icon: AlertTriangle }
}

function ChannelIcon({ channel, className = 'w-3.5 h-3.5' }: { channel: string; className?: string }) {
  const ch = channel.toLowerCase()
  if (ch === 'linkedin') return <Briefcase className={`${className} text-sky-400`} />
  if (ch === 'twitter' || ch === 'x') return <Bird className={`${className} text-gray-300`} />
  if (ch === 'wordpress' || ch === 'blog') return <Globe className={`${className} text-emerald-400`} />
  return <Layers className={`${className} text-gray-500`} />
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

function parseMeta(raw: PublishedRow['metadata_json']): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
  }
  return raw
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ContentLibraryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([])
  const [published, setPublished] = useState<PublishedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  // Resolve workspace
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
      const params = new URLSearchParams({ workspaceId })
      if (channel !== 'all') params.set('channel', channel)
      const [schedRes, pubRes] = await Promise.all([
        fetch(`/api/publishing?${params}`),
        fetch(`/api/publish?workspaceId=${workspaceId}`),
      ])
      if (!schedRes.ok) throw new Error(`Publishing ${schedRes.status}`)
      const schedRows = (await schedRes.json()) as ScheduledItem[]
      setScheduled(Array.isArray(schedRows) ? schedRows : [])
      if (pubRes.ok) {
        const pubRows = (await pubRes.json()) as PublishedRow[]
        setPublished(Array.isArray(pubRows) ? pubRows : [])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, channel])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (!workspaceId) return
    const t = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(t)
  }, [workspaceId, fetchAll])

  // Merge into a unified row set, newest first.
  const rows = useMemo<UnifiedRow[]>(() => {
    const published_by_sched = new Map<string, PublishedRow>()
    for (const p of published) {
      if (p.scheduled_content_id) published_by_sched.set(p.scheduled_content_id, p)
    }

    const merged: UnifiedRow[] = []

    for (const s of scheduled) {
      const ch = (s.channel || s.platform || '').toLowerCase()
      const body = s.content_body || s.content || ''
      const pub = published_by_sched.get(s.id)
      const meta = pub ? parseMeta(pub.metadata_json) : null
      merged.push({
        id: s.id,
        source: 'scheduled',
        channel: ch,
        body,
        status: s.status,
        artifact_id: s.artifact_id,
        scheduled_at: s.scheduled_at || s.scheduled_for,
        published_at: pub?.published_at || null,
        permalink: pub?.permalink || pub?.post_url || null,
        retry_count: Number(s.retry_count || 0),
        error_message: s.error_message,
        shortenedUrls: meta && typeof meta.shortenedUrls === 'number' ? meta.shortenedUrls : undefined,
      })
    }

    // Add ad-hoc published_content rows that have no scheduled_content link
    // (e.g. one-shot direct publishes via /api/publish). De-dup against
    // anything we already added by scheduled id.
    const consumed = new Set(merged.map(r => r.id))
    for (const p of published) {
      if (p.scheduled_content_id && consumed.has(p.scheduled_content_id)) continue
      merged.push({
        id: p.id,
        source: 'published',
        channel: (p.channel || p.platform || '').toLowerCase(),
        body: p.title || '',
        status: 'published',
        artifact_id: p.artifact_id,
        scheduled_at: null,
        published_at: p.published_at,
        permalink: p.permalink || p.post_url || null,
        retry_count: 0,
        error_message: null,
      })
    }

    // Sort newest-first by (published_at OR scheduled_at OR fallback)
    merged.sort((a, b) => {
      const aT = new Date(a.published_at || a.scheduled_at || 0).getTime()
      const bT = new Date(b.published_at || b.scheduled_at || 0).getTime()
      return bT - aT
    })
    return merged
  }, [scheduled, published])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (channel !== 'all' && r.channel !== channel) return false
      if (status !== 'all' && r.status !== status) return false
      if (q && !r.body.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, channel, status, search])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-400" /> Content Library
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every scheduled draft and published post in one searchable grid.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {CHANNEL_OPTIONS.map(opt => {
            const Icon = opt.Icon
            const active = channel === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setChannel(opt.id)}
                className={`px-3 py-1.5 text-sm rounded-lg border inline-flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-indigo-900/40 border-indigo-700 text-indigo-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            )
          })}

          <select
            value={status}
            onChange={e => setStatus(e.target.value as StatusFilter)}
            className="ml-2 bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:border-indigo-600 focus:outline-none"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <div className="relative flex-1 max-w-sm ml-auto">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search content body…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filtered.length} of {rows.length} items
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500 text-sm">Loading content…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {rows.length === 0 ? 'No content yet' : 'No items match your filters'}
            </p>
            <p className="text-sm text-gray-600">
              {rows.length === 0
                ? 'Schedule a post or have an agent draft one to see it here.'
                : 'Try clearing the search or switching the channel/status filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(row => <ContentCard key={`${row.source}:${row.id}`} row={row} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Content card ──────────────────────────────────────────────────────────

function ContentCard({ row }: { row: UnifiedRow }) {
  const stat = statusOf(row.status)
  const StatIcon = stat.Icon
  const ts = row.published_at || row.scheduled_at
  const tsLabel = row.published_at ? 'Published' : 'Scheduled'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col hover:border-gray-700 transition-colors">
      {/* Top row: channel + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <ChannelIcon channel={row.channel} />
          <span className="capitalize">{row.channel || 'unknown'}</span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${stat.pill}`}>
          <StatIcon className={`w-3 h-3 ${row.status === 'publishing' ? 'animate-spin' : ''}`} />
          {row.status}
        </span>
      </div>

      {/* Body */}
      <p className="text-sm text-gray-200 whitespace-pre-wrap line-clamp-4 mb-3 flex-1">
        {row.body || <span className="text-gray-600 italic">empty body</span>}
      </p>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-3">
        {ts && (
          <span title={ts}>
            {tsLabel}: {formatRelative(ts)}
          </span>
        )}
        {row.artifact_id && (
          <span className="inline-flex items-center gap-1 text-purple-300">
            <ShieldCheck className="w-2.5 h-2.5" /> gated
          </span>
        )}
        {typeof row.shortenedUrls === 'number' && row.shortenedUrls > 0 && (
          <span className="text-emerald-300">
            {row.shortenedUrls} tracked URL{row.shortenedUrls === 1 ? '' : 's'}
          </span>
        )}
        {row.retry_count > 0 && row.status !== 'published' && (
          <span className="text-amber-400">retry {row.retry_count}/3</span>
        )}
      </div>

      {row.error_message && (
        <div className="text-[11px] text-rose-300 mb-3 inline-flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{row.error_message}</span>
        </div>
      )}

      {/* Footer action: View live → permalink */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
        {row.permalink ? (
          <a
            href={row.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-emerald-900/30 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-200 rounded transition-colors"
            title={row.permalink}
          >
            View live <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-[11px] text-gray-600 inline-flex items-center gap-1">
            {row.status === 'pending' ? 'Awaiting publish' : 'No permalink yet'}
            <ChevronRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  )
}
