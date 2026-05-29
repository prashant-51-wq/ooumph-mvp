'use client'

/**
 * /dashboard/calendar
 *
 * Publishing timeline. Pulls live rows from /api/publishing and renders
 * them in three views: month grid, week list, agenda flat list. A master
 * channel filter chip strip across the top globally narrows the schedule
 * to LinkedIn, X/Twitter, WordPress, or "all".
 *
 * Polls every 15s so the calendar reflects the queue in near-real-time
 * (the cron worker re-paints statuses as items move pending → publishing
 * → published).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'
import {
  Calendar as CalendarIcon, RefreshCw, AlertCircle, ChevronLeft, ChevronRight,
  Briefcase, Bird, Globe, Layers, Loader2, ShieldCheck, AlertTriangle,
  Clock, CheckCircle2, XCircle, Send, ExternalLink, MoreVertical, Pencil, Trash2, Check, Plus,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ScheduledItem {
  id: string
  workspace_id: string
  artifact_id: string | null
  channel: string | null
  platform: string | null            // legacy
  content_body: string | null
  content: string | null             // legacy
  scheduled_at: string | null
  scheduled_for: string | null       // legacy
  status: string
  retry_count: number
  error_message: string | null
  media_urls: string | null
  created_at: string
  updated_at: string | null
}

interface PublishedRow {
  id: string
  scheduled_content_id: string | null
  channel: string | null
  platform: string | null
  native_post_id: string | null
  permalink: string | null
  post_url: string | null
  published_at: string
}

type ChannelFilter = 'all' | 'linkedin' | 'twitter' | 'wordpress'
type ViewMode = 'agenda' | 'week' | 'month'

const CHANNEL_OPTIONS: Array<{ id: ChannelFilter; label: string; Icon: typeof Briefcase }> = [
  { id: 'all', label: 'All channels', Icon: Layers },
  { id: 'linkedin', label: 'LinkedIn', Icon: Briefcase },
  { id: 'twitter', label: 'X / Twitter', Icon: Bird },
  { id: 'wordpress', label: 'WordPress', Icon: Globe },
]

const POLL_MS = 15_000

// ─── Helpers ───────────────────────────────────────────────────────────────

function getScheduledAt(item: ScheduledItem): string | null {
  return item.scheduled_at || item.scheduled_for
}
function getChannel(item: ScheduledItem): string {
  return (item.channel || item.platform || '').toLowerCase()
}
function getBody(item: ScheduledItem): string {
  return item.content_body || item.content || ''
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfWeek(d: Date): Date {
  const x = startOfDay(d); const day = x.getDay(); return addDays(x, -day)
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }

const STATUS_STYLE: Record<string, { pill: string; Icon: typeof Clock }> = {
  pending:    { pill: 'bg-amber-900/40 text-amber-200 border-amber-800',    Icon: Clock },
  publishing: { pill: 'bg-blue-900/40 text-blue-200 border-blue-800',       Icon: Loader2 },
  published:  { pill: 'bg-emerald-900/40 text-emerald-200 border-emerald-800', Icon: CheckCircle2 },
  failed:     { pill: 'bg-rose-900/40 text-rose-200 border-rose-800',       Icon: XCircle },
  cancelled:  { pill: 'bg-gray-800 text-gray-400 border-gray-700',          Icon: XCircle },
  paused:     { pill: 'bg-gray-800 text-gray-400 border-gray-700',          Icon: Clock },
}
function statusOf(status: string) {
  return STATUS_STYLE[status] || { pill: 'bg-gray-800 text-gray-400 border-gray-700', Icon: AlertTriangle }
}

// Sprint 14D: drag-to-reschedule helpers. Only items the cron isn't actively
// handling can be moved. publishing/published rows refuse the PATCH anyway
// (publishing/route.ts line ~212), but we filter here for visual feedback
// — a non-draggable cursor on the locked tile is clearer than a 409 toast
// after the user already tried.
const DRAGGABLE_STATUSES = new Set(['pending', 'paused', 'failed'])
function isDraggable(item: ScheduledItem): boolean {
  return DRAGGABLE_STATUSES.has(item.status)
}
// Sprint 16I (P2 #25): same gating drives Edit/Cancel availability. The
// server PATCH refuses to mutate 'publishing'/'published' rows; we mirror
// that here so the kebab menu hides actions that would 409.
function isEditable(item: ScheduledItem): boolean {
  return DRAGGABLE_STATUSES.has(item.status)
}
/** Build a new ISO timestamp on `targetDay` preserving the time-of-day
 *  from `originalIso`. If the original has no time component we default
 *  to 09:00 local. */
function rescheduleTo(originalIso: string | null, targetDay: Date): string {
  const target = new Date(targetDay)
  if (originalIso) {
    const orig = new Date(originalIso)
    if (!Number.isNaN(orig.getTime())) {
      target.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
      return target.toISOString()
    }
  }
  target.setHours(9, 0, 0, 0)
  return target.toISOString()
}

function ChannelIcon({ channel, className = 'w-3.5 h-3.5' }: { channel: string; className?: string }) {
  const ch = channel.toLowerCase()
  if (ch === 'linkedin') return <Briefcase className={`${className} text-sky-400`} />
  if (ch === 'twitter' || ch === 'x') return <Bird className={`${className} text-gray-300`} />
  if (ch === 'wordpress' || ch === 'blog') return <Globe className={`${className} text-emerald-400`} />
  return <Layers className={`${className} text-gray-500`} />
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [items, setItems] = useState<ScheduledItem[]>([])
  const [publishedMap, setPublishedMap] = useState<Record<string, PublishedRow>>({})
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [view, setView] = useState<ViewMode>('agenda')
  const [anchorDate, setAnchorDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Resolve workspace
  // Sprint 10C: useWorkspaceId() replaces the ad-hoc fetch('/api/auth/me')
  // + localStorage fallback that lived here. The hook does the same work
  // with a 60s cache shared across the dashboard so multiple pages don't
  // each fire their own /me probe on the same load.
  const { workspaceId: sessionWorkspaceId, resolved: sessionResolved, loading: sessionLoading } = useWorkspaceId()
  useEffect(() => {
    setWorkspaceId(sessionWorkspaceId)
    if (sessionResolved && !sessionLoading && !sessionWorkspaceId) {
      setError('No workspace selected — finish onboarding first.')
    }
  }, [sessionWorkspaceId, sessionResolved, sessionLoading])

  // Fetch + poll the schedule
  const fetchItems = useCallback(async () => {
    if (!workspaceId) return
    try {
      const params = new URLSearchParams({ workspaceId })
      if (channel !== 'all') params.set('channel', channel)
      const [schedRes, publishedRes] = await Promise.all([
        fetch(`/api/publishing?${params}`),
        fetch(`/api/publish?workspaceId=${workspaceId}`),  // legacy publish_log for permalinks
      ])
      if (!schedRes.ok) throw new Error(`Publishing ${schedRes.status}`)
      const rows = (await schedRes.json()) as ScheduledItem[]
      setItems(Array.isArray(rows) ? rows : [])

      // Try to merge published_content permalinks. The publish-log endpoint
      // is best-effort — if it's not there, the agenda still renders fine.
      if (publishedRes.ok) {
        const pub = (await publishedRes.json()) as PublishedRow[]
        if (Array.isArray(pub)) {
          const map: Record<string, PublishedRow> = {}
          for (const p of pub) {
            if (p.scheduled_content_id) map[p.scheduled_content_id] = p
          }
          setPublishedMap(map)
        }
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, channel])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => {
    if (!workspaceId) return
    const t = setInterval(fetchItems, POLL_MS)
    return () => clearInterval(t)
  }, [workspaceId, fetchItems])

  // Sprint 14D: drag-to-reschedule. Optimistically patches the local row
  // so the tile snaps to the new day immediately, then commits via PATCH.
  // On error we revert and surface the message.
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const reschedule = useCallback(async (itemId: string, newScheduledAt: string) => {
    if (!workspaceId) return
    const prevSnapshot = items
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, scheduled_at: newScheduledAt, scheduled_for: newScheduledAt }
        : it
    ))
    try {
      const res = await fetch('/api/publishing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, workspaceId, scheduledAt: newScheduledAt }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `PATCH ${res.status}`)
      }
      setRescheduleError(null)
      // Pick up server-side updated_at + any state reset on the next poll.
      fetchItems()
    } catch (err) {
      setItems(prevSnapshot)
      setRescheduleError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, items, fetchItems])

  // Sprint 16I (P2 #25): tile-action plumbing — edit modal, approval lookup,
  // and cancel. The modal is also used for "+ New post" (editingItem = null).
  const [editingItem, setEditingItem] = useState<ScheduledItem | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionInfo, setActionInfo] = useState<string | null>(null)
  // Pending approvals keyed by artifact_id, so a tile can know if its
  // backing artifact has something approve-able.
  const [pendingApprovalByArtifact, setPendingApprovalByArtifact] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    fetch(`/api/approvals?workspaceId=${workspaceId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ id: string; artifact_id: string; status: string }>) => {
        if (cancelled || !Array.isArray(rows)) return
        const map: Record<string, string> = {}
        for (const r of rows) {
          if (r.status === 'pending' && r.artifact_id) map[r.artifact_id] = r.id
        }
        setPendingApprovalByArtifact(map)
      })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [workspaceId, items.length])

  const editTile = useCallback(async (
    item: ScheduledItem | null,
    payload: { contentBody: string; scheduledAt: string; channel?: string },
  ) => {
    if (!workspaceId) return
    setActionError(null)
    try {
      if (item) {
        const res = await fetch('/api/publishing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id, workspaceId,
            contentBody: payload.contentBody,
            scheduledAt: payload.scheduledAt,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(data.error || `PATCH ${res.status}`)
        }
        setActionInfo('Post updated.')
      } else {
        const res = await fetch('/api/publishing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            channel: payload.channel || 'linkedin',
            contentBody: payload.contentBody,
            scheduledAt: payload.scheduledAt,
            mediaUrls: [],
          }),
        })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(`POST ${res.status} ${txt}`)
        }
        setActionInfo('Post scheduled.')
      }
      setEditingItem(null); setShowNewModal(false)
      await fetchItems()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, fetchItems])

  const approveTile = useCallback(async (item: ScheduledItem) => {
    if (!workspaceId || !item.artifact_id) return
    const approvalId = pendingApprovalByArtifact[item.artifact_id]
    if (!approvalId) {
      setActionError('No pending approval for this post.')
      return
    }
    setActionError(null)
    try {
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, workspaceId, action: 'approve' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `PATCH ${res.status}`)
      }
      setActionInfo('Approval recorded.')
      setPendingApprovalByArtifact(prev => {
        const next = { ...prev }
        if (item.artifact_id) delete next[item.artifact_id]
        return next
      })
      await fetchItems()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, pendingApprovalByArtifact, fetchItems])

  /** Sprint 17E (audit P2 #25): retry a terminal-failed publish from a
   *  calendar tile. Mirrors the /publishing page Retry button — flipping
   *  status back to 'pending' is enough; the cron picks it up next sweep.
   *  Without this, users seeing a red tile had to context-switch to the
   *  Publishing surface to do anything about it. */
  const retryTile = useCallback(async (item: ScheduledItem) => {
    if (!workspaceId) return
    setActionError(null)
    try {
      const res = await fetch('/api/publishing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, workspaceId, status: 'pending' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `PATCH ${res.status}`)
      }
      setActionInfo('Re-queued. The cron will retry on its next sweep.')
      await fetchItems()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, fetchItems])

  const cancelTile = useCallback(async (item: ScheduledItem) => {
    if (!workspaceId) return
    if (!confirm('Cancel this scheduled post? It will be soft-deleted (audit row preserved).')) return
    setActionError(null)
    const prev = items
    setItems(curr => curr.filter(it => it.id !== item.id))
    try {
      const res = await fetch(`/api/publishing?id=${item.id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `DELETE ${res.status}`)
      }
      setActionInfo('Post cancelled.')
      await fetchItems()
    } catch (err) {
      setItems(prev)
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, items, fetchItems])

  // Empty-state check (filtered)
  const isEmpty = !loading && items.length === 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-indigo-400" /> Publishing Calendar
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Live view of every scheduled post across all connected channels.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActionError(null); setActionInfo(null); setShowNewModal(true) }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> New post
            </button>
            <button
              onClick={fetchItems}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Master channel filter + view toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
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

          <div className="ml-auto flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {(['agenda', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded ${
                  view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {rescheduleError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-lg text-amber-300 text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Reschedule failed: {rescheduleError}</span>
            <button onClick={() => setRescheduleError(null)} className="text-xs text-amber-400 hover:text-amber-200">Dismiss</button>
          </div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-xs text-rose-400 hover:text-rose-200">Dismiss</button>
          </div>
        )}
        {actionInfo && (
          <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-900 rounded-lg text-emerald-300 text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {actionInfo}</span>
            <button onClick={() => setActionInfo(null)} className="text-xs text-emerald-400 hover:text-emerald-200">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-500 text-sm">Loading schedule…</div>
        ) : isEmpty ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Send className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">Nothing scheduled</p>
            <p className="text-sm text-gray-600 mb-6">
              {channel === 'all'
                ? 'Schedule your first post from Content → Schedule, or have an agent draft one for you.'
                : `No ${channel} posts scheduled. Switch filter to "All channels" to see the full queue.`}
            </p>
          </div>
        ) : (
          <>
            {view === 'agenda' && (
              <AgendaView
                items={items} publishedMap={publishedMap}
                pendingApprovalByArtifact={pendingApprovalByArtifact}
                onEdit={setEditingItem}
                onApprove={approveTile}
                onCancel={cancelTile}
                onRetry={retryTile}
              />
            )}
            {view === 'week' && (
              <WeekView
                items={items} publishedMap={publishedMap}
                anchorDate={anchorDate} onAnchorChange={setAnchorDate}
                onReschedule={reschedule}
                pendingApprovalByArtifact={pendingApprovalByArtifact}
                onEdit={setEditingItem}
                onApprove={approveTile}
                onCancel={cancelTile}
                onRetry={retryTile}
              />
            )}
            {view === 'month' && (
              <MonthView
                items={items} publishedMap={publishedMap}
                anchorDate={anchorDate} onAnchorChange={setAnchorDate}
                onReschedule={reschedule}
              />
            )}
          </>
        )}

        {(editingItem || showNewModal) && (
          <EditTileModal
            item={editingItem}
            defaultDay={anchorDate}
            onClose={() => { setEditingItem(null); setShowNewModal(false) }}
            onSave={(p) => editTile(editingItem, p)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Tile action menu (kebab) ─────────────────────────────────────────────

function TileMenu({
  item, hasPendingApproval,
  onEdit, onApprove, onCancel, onRetry,
  compact = false,
}: {
  item: ScheduledItem
  hasPendingApproval: boolean
  onEdit: (item: ScheduledItem) => void
  onApprove: (item: ScheduledItem) => void
  onCancel: (item: ScheduledItem) => void
  // Sprint 17E (audit P2 #25): only set on failed tiles. Undefined elsewhere
  // so the menu doesn't render the row.
  onRetry?: (item: ScheduledItem) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const editable = isEditable(item)
  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(v => !v) }}
        className={`p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 ${compact ? 'text-[10px]' : ''}`}
        title="Actions"
        aria-label="Tile actions"
      >
        <MoreVertical className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-30 min-w-[140px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1"
          onClick={e => { e.stopPropagation() }}
        >
          {editable && (
            <button
              onClick={() => { setOpen(false); onEdit(item) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {hasPendingApproval && (
            <button
              onClick={() => { setOpen(false); onApprove(item) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-300 hover:bg-gray-800"
            >
              <Check className="w-3 h-3" /> Approve
            </button>
          )}
          {/* Sprint 17E (audit P2 #25): parity with /publishing — terminal
              failed rows can be re-queued straight from the calendar tile. */}
          {item.status === 'failed' && onRetry && (
            <button
              onClick={() => { setOpen(false); onRetry(item) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-indigo-300 hover:bg-gray-800"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
          {editable && (
            <button
              onClick={() => { setOpen(false); onCancel(item) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-300 hover:bg-gray-800"
            >
              <Trash2 className="w-3 h-3" /> Cancel
            </button>
          )}
          {!editable && !hasPendingApproval && item.status !== 'failed' && (
            <div className="px-3 py-1.5 text-[11px] text-gray-500 italic">No actions — row locked</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Edit / New modal ─────────────────────────────────────────────────────

function EditTileModal({
  item, defaultDay, onClose, onSave,
}: {
  item: ScheduledItem | null
  defaultDay: Date
  onClose: () => void
  onSave: (p: { contentBody: string; scheduledAt: string; channel?: string }) => void
}) {
  const initialAt = useMemo(() => {
    const iso = item ? getScheduledAt(item) : null
    const d = iso ? new Date(iso) : (() => {
      const x = new Date(defaultDay); x.setHours(9, 0, 0, 0); return x
    })()
    // datetime-local needs YYYY-MM-DDTHH:MM in local TZ
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }, [item, defaultDay])

  const [content, setContent] = useState(item ? getBody(item) : '')
  const [when, setWhen] = useState(initialAt)
  const [channel, setChannel] = useState<string>(item ? (getChannel(item) || 'linkedin') : 'linkedin')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!content.trim()) return
    if (!when) return
    setSubmitting(true)
    try {
      const scheduledAt = new Date(when).toISOString()
      await onSave({ contentBody: content, scheduledAt, channel })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-white font-semibold text-sm">{item ? 'Edit scheduled post' : 'New scheduled post'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {!item && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1.5">Channel</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">X / Twitter</option>
                <option value="wordpress">WordPress</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="What do you want to publish?"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1.5">Scheduled for</label>
            <input
              type="datetime-local"
              value={when}
              onChange={e => setWhen(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !content.trim() || !when}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agenda view ───────────────────────────────────────────────────────────

function AgendaView({
  items, publishedMap, pendingApprovalByArtifact, onEdit, onApprove, onCancel, onRetry,
}: {
  items: ScheduledItem[]; publishedMap: Record<string, PublishedRow>
  pendingApprovalByArtifact: Record<string, string>
  onEdit: (item: ScheduledItem) => void
  onApprove: (item: ScheduledItem) => void
  onCancel: (item: ScheduledItem) => void
  onRetry: (item: ScheduledItem) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledItem[]>()
    const sorted = [...items].sort((a, b) => {
      const aT = new Date(getScheduledAt(a) || a.created_at).getTime()
      const bT = new Date(getScheduledAt(b) || b.created_at).getTime()
      return aT - bT
    })
    for (const item of sorted) {
      const t = getScheduledAt(item) || item.created_at
      const dayKey = t.slice(0, 10)
      const arr = map.get(dayKey) || []
      arr.push(item)
      map.set(dayKey, arr)
    }
    return Array.from(map.entries())
  }, [items])

  return (
    <div className="space-y-6">
      {grouped.map(([dayKey, dayItems]) => (
        <div key={dayKey}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 sticky top-0 bg-gray-950 py-1">
            {new Date(dayKey + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'long', month: 'short', day: 'numeric',
            })}
          </h3>
          <div className="space-y-2">
            {dayItems.map(item => (
              <AgendaCard
                key={item.id}
                item={item}
                published={publishedMap[item.id] || null}
                hasPendingApproval={!!(item.artifact_id && pendingApprovalByArtifact[item.artifact_id])}
                onEdit={onEdit}
                onApprove={onApprove}
                onCancel={onCancel}
                onRetry={onRetry}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AgendaCard({
  item, published, hasPendingApproval, onEdit, onApprove, onCancel, onRetry,
}: {
  item: ScheduledItem; published: PublishedRow | null
  hasPendingApproval: boolean
  onEdit: (item: ScheduledItem) => void
  onApprove: (item: ScheduledItem) => void
  onCancel: (item: ScheduledItem) => void
  onRetry: (item: ScheduledItem) => void
}) {
  const channel = getChannel(item)
  const body = getBody(item)
  const at = getScheduledAt(item)
  const stat = statusOf(item.status)
  const StatIcon = stat.Icon
  const permalink = published?.permalink || published?.post_url || null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4 hover:border-gray-700 transition-colors">
      {/* Time gutter */}
      <div className="flex-shrink-0 w-16 text-right">
        <div className="text-xs text-gray-300 font-medium tabular-nums">{formatTime(at)}</div>
        <ChannelIcon channel={channel} className="w-3.5 h-3.5 ml-auto mt-1" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${stat.pill}`}>
            <StatIcon className={`w-3 h-3 ${item.status === 'publishing' ? 'animate-spin' : ''}`} />
            {item.status}
          </span>
          {item.artifact_id && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-300 bg-purple-900/30 border border-purple-800">
              <ShieldCheck className="w-2.5 h-2.5" /> artifact-gated
            </span>
          )}
          {item.retry_count > 0 && (
            <span className="text-[10px] text-amber-400">
              retry {item.retry_count}/3
            </span>
          )}
        </div>
        <p className="text-sm text-gray-200 whitespace-pre-wrap line-clamp-3">{body || <span className="text-gray-600 italic">empty body</span>}</p>
        {item.error_message && (
          <div className="mt-1.5 text-[11px] text-rose-300 inline-flex items-start gap-1">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {item.error_message}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {permalink && (
          <a
            href={permalink}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-900/30 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-200 rounded transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> View
          </a>
        )}
        <TileMenu
          item={item}
          hasPendingApproval={hasPendingApproval}
          onEdit={onEdit}
          onApprove={onApprove}
          onCancel={onCancel}
          onRetry={onRetry}
        />
      </div>
    </div>
  )
}

// ─── Week view ─────────────────────────────────────────────────────────────

function WeekView({
  items, publishedMap, anchorDate, onAnchorChange, onReschedule,
  pendingApprovalByArtifact, onEdit, onApprove, onCancel, onRetry,
}: {
  items: ScheduledItem[]; publishedMap: Record<string, PublishedRow>
  anchorDate: Date; onAnchorChange: (d: Date) => void
  onReschedule: (itemId: string, newScheduledAt: string) => void
  pendingApprovalByArtifact: Record<string, string>
  onEdit: (item: ScheduledItem) => void
  onApprove: (item: ScheduledItem) => void
  onCancel: (item: ScheduledItem) => void
  onRetry: (item: ScheduledItem) => void
}) {
  const weekStart = startOfWeek(anchorDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ScheduledItem[]>()
    for (const item of items) {
      const t = getScheduledAt(item)
      if (!t) continue
      const key = t.slice(0, 10)
      const arr = map.get(key) || []
      arr.push(item)
      map.set(key, arr)
    }
    return map
  }, [items])

  // Sprint 14D: dragOverDay highlights the cell the user is hovering so the
  // drop zone is unambiguous before they release.
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const itemById = useMemo(() => {
    const m = new Map<string, ScheduledItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault()
    setDragOverDay(null)
    const id = e.dataTransfer.getData('text/calendar-item-id')
    if (!id) return
    const item = itemById.get(id)
    if (!item || !isDraggable(item)) return
    const originalIso = getScheduledAt(item)
    if (originalIso && sameDay(new Date(originalIso), day)) return  // no-op
    onReschedule(id, rescheduleTo(originalIso, day))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onAnchorChange(addDays(weekStart, -7))}
          className="p-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg">
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <h2 className="text-white font-semibold">
          Week of {weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </h2>
        <button onClick={() => onAnchorChange(addDays(weekStart, 7))}
          className="p-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg">
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        Drag a tile to a different day to reschedule. Time-of-day is preserved.
        Locked rows (publishing / published / cancelled) can&apos;t be moved.
      </p>

      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const key = day.toISOString().slice(0, 10)
          const dayItems = itemsByDay.get(key) || []
          const isToday = sameDay(day, new Date())
          const isDragTarget = dragOverDay === key
          return (
            <div
              key={key}
              onDragOver={e => { e.preventDefault(); setDragOverDay(key) }}
              onDragLeave={() => setDragOverDay(prev => prev === key ? null : prev)}
              onDrop={e => handleDrop(e, day)}
              className={`bg-gray-900 border rounded-xl p-2 min-h-[180px] transition-colors ${
                isDragTarget ? 'border-indigo-500 bg-indigo-950/30'
                : isToday ? 'border-indigo-700' : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase text-gray-500">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className={`text-sm font-bold ${isToday ? 'text-indigo-400' : 'text-gray-200'}`}>{day.getDate()}</div>
              </div>
              <div className="space-y-1.5">
                {dayItems.length === 0 ? (
                  <div className="text-[10px] text-gray-700 italic mt-3">No posts</div>
                ) : dayItems.map(item => (
                  <WeekTile
                    key={item.id}
                    item={item}
                    published={publishedMap[item.id] || null}
                    hasPendingApproval={!!(item.artifact_id && pendingApprovalByArtifact[item.artifact_id])}
                    onEdit={onEdit}
                    onApprove={onApprove}
                    onCancel={onCancel}
                    onRetry={onRetry}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekTile({
  item, published, hasPendingApproval, onEdit, onApprove, onCancel, onRetry,
}: {
  item: ScheduledItem; published: PublishedRow | null
  hasPendingApproval: boolean
  onEdit: (item: ScheduledItem) => void
  onApprove: (item: ScheduledItem) => void
  onCancel: (item: ScheduledItem) => void
  onRetry: (item: ScheduledItem) => void
}) {
  const channel = getChannel(item)
  const stat = statusOf(item.status)
  const StatIcon = stat.Icon
  const permalink = published?.permalink || published?.post_url || null
  const body = getBody(item)
  const draggable = isDraggable(item)
  // Sprint 14D: draggable for unlocked rows. We stop propagation on dragStart
  // so clicking through to the permalink link inside the tile still works.
  // Sprint 16I: kebab menu lives in the header row so it doesn't interfere
  // with the drag handle.
  const inner = (
    <div
      draggable={draggable}
      onDragStart={e => {
        e.dataTransfer.setData('text/calendar-item-id', item.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      title={draggable ? 'Drag to a different day to reschedule' : `${item.status} — locked from rescheduling`}
      className={`bg-gray-950 border border-gray-800 rounded p-1.5 hover:border-gray-700 transition-colors ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-80'
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <ChannelIcon channel={channel} className="w-2.5 h-2.5" />
        <span className="text-[9px] text-gray-500 tabular-nums">{formatTime(getScheduledAt(item))}</span>
        <StatIcon className={`w-2.5 h-2.5 ml-auto ${item.status === 'publishing' ? 'animate-spin' : ''} ${stat.pill.split(' ').find(c => c.startsWith('text-'))}`} />
        <TileMenu
          item={item}
          hasPendingApproval={hasPendingApproval}
          onEdit={onEdit}
          onApprove={onApprove}
          onCancel={onCancel}
          onRetry={onRetry}
          compact
        />
      </div>
      <p className="text-[10px] text-gray-300 line-clamp-2 leading-snug">{body || '(empty)'}</p>
    </div>
  )
  return permalink
    ? <a href={permalink} target="_blank" rel="noopener noreferrer">{inner}</a>
    : inner
}

// ─── Month view ────────────────────────────────────────────────────────────

function MonthView({
  items, publishedMap, anchorDate, onAnchorChange, onReschedule,
}: {
  items: ScheduledItem[]; publishedMap: Record<string, PublishedRow>
  anchorDate: Date; onAnchorChange: (d: Date) => void
  onReschedule: (itemId: string, newScheduledAt: string) => void
}) {
  const monthStart = startOfMonth(anchorDate)
  const gridStart = startOfWeek(monthStart)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ScheduledItem[]>()
    for (const item of items) {
      const t = getScheduledAt(item)
      if (!t) continue
      const key = t.slice(0, 10)
      const arr = map.get(key) || []
      arr.push(item)
      map.set(key, arr)
    }
    return map
  }, [items])

  const itemById = useMemo(() => {
    const m = new Map<string, ScheduledItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault()
    setDragOverDay(null)
    const id = e.dataTransfer.getData('text/calendar-item-id')
    if (!id) return
    const item = itemById.get(id)
    if (!item || !isDraggable(item)) return
    const originalIso = getScheduledAt(item)
    if (originalIso && sameDay(new Date(originalIso), day)) return
    onReschedule(id, rescheduleTo(originalIso, day))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onAnchorChange(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
          className="p-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg">
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <h2 className="text-white font-semibold">
          {monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={() => onAnchorChange(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
          className="p-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg">
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        Drag a chip into another day to reschedule. Time-of-day is preserved.
      </p>

      <div className="grid grid-cols-7 gap-px bg-gray-800 border border-gray-800 rounded-xl overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-gray-950 text-[10px] uppercase text-gray-500 font-medium text-center py-1.5">{d}</div>
        ))}
        {cells.map(day => {
          const key = day.toISOString().slice(0, 10)
          const dayItems = itemsByDay.get(key) || []
          const inMonth = day.getMonth() === monthStart.getMonth()
          const isToday = sameDay(day, new Date())
          const isDragTarget = dragOverDay === key
          return (
            <div
              key={key}
              onDragOver={e => { e.preventDefault(); setDragOverDay(key) }}
              onDragLeave={() => setDragOverDay(prev => prev === key ? null : prev)}
              onDrop={e => handleDrop(e, day)}
              className={`min-h-[80px] p-1.5 transition-colors ${
                isDragTarget ? 'bg-indigo-950/40 ring-1 ring-indigo-500'
                : 'bg-gray-950'
              } ${!inMonth ? 'opacity-30' : ''}`}
            >
              <div className={`text-[10px] mb-1 ${isToday ? 'text-indigo-400 font-bold' : 'text-gray-500'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayItems.slice(0, 3).map(item => (
                  <MonthChip
                    key={item.id}
                    item={item}
                    published={publishedMap[item.id] || null}
                  />
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[9px] text-gray-600">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthChip({ item, published }: { item: ScheduledItem; published: PublishedRow | null }) {
  const ch = getChannel(item)
  const stat = statusOf(item.status)
  const permalink = published?.permalink || published?.post_url || null
  const draggable = isDraggable(item)
  // Sprint 14D: the dot is itself the drag handle in month view. We rely on
  // dataTransfer rather than React state so the drop target (a different
  // sibling) can read the id without prop-drilling.
  const chip = (
    <div
      draggable={draggable}
      onDragStart={e => {
        if (!draggable) return
        e.dataTransfer.setData('text/calendar-item-id', item.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      title={draggable ? 'Drag to another day to reschedule' : `${item.status} — locked`}
      className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] truncate ${stat.pill} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'
      }`}
    >
      <ChannelIcon channel={ch} className="w-2 h-2 flex-shrink-0" />
      <span className="truncate">{formatTime(getScheduledAt(item))}</span>
    </div>
  )
  return permalink
    ? <a href={permalink} target="_blank" rel="noopener noreferrer">{chip}</a>
    : chip
}
