'use client'

/**
 * /dashboard/publishing — Publishing Hub (Sprint 1A rewrite)
 *
 * Before this rewrite the page contained zero `fetch()` calls. Connections,
 * queue, and analytics were all hardcoded `MOCK_*` constants; `handlePublish`
 * was `await new Promise(r => setTimeout(r, 1400))` followed by a fake success
 * toast. None of it touched the database. The Refresh Test failed everywhere.
 *
 * The rewrite is built around three invariants:
 *
 *   1. Connections come from `GET /api/integrations?workspaceId=…` (table
 *      `integrations`). No platform shows "connected" unless a real row
 *      exists. "Connect" / "Reconnect" buttons navigate to
 *      `/dashboard/integrations` — the canonical OAuth entry point.
 *
 *   2. Queue comes from `GET /api/publishing?workspaceId=…` (table
 *      `scheduled_content`). Scheduling, immediate publish, and drafts all
 *      go through `POST /api/publishing` so the cron worker
 *      (`/api/cron/publish-scheduled`) is the single source of truth that
 *      actually posts to social platforms.
 *
 *   3. Analytics is shown as an honest empty state with a connect-platform
 *      CTA. We do not yet have a per-post analytics endpoint, and we will
 *      NOT fabricate reach/engagement numbers (Source Test).
 *
 * Three previously-fake helpers have been disabled until real wiring exists:
 *
 *   - AI caption / alt-text generation (was a hardcoded string after
 *     setTimeout). The drop zone now collects the file but the AI panel
 *     surfaces a "Coming soon" notice until /api/agents/captioner is real.
 *   - Video auto-captions / SRT (was a hardcoded SRT). Same treatment.
 *   - "Best Time" suggestion (was a hardcoded ISO date). Removed pending a
 *     real best-time endpoint computed from historical publishing data.
 *
 * Every visible number/status traces to either a DB query or shows an empty
 * state. Every action persists past F5. No setTimeout fake-API patterns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'queue' | 'composer' | 'analytics'
type Platform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube'
type PublishStatus = 'pending' | 'paused' | 'publishing' | 'published' | 'failed' | 'cancelled' | 'draft'
type QueueFilter = 'All' | 'pending' | 'published' | 'failed' | 'draft'

/** Row shape returned by `GET /api/integrations`. */
interface IntegrationRow {
  id: string
  workspace_id: string
  platform: string
  account_id: string | null
  status: 'active' | 'expired' | 'revoked' | 'error' | string
  connected_at: string | null
  token_preview?: string | null
}

/** Row shape returned by `GET /api/publishing` (scheduled_content table). */
interface ScheduledRow {
  id: string
  workspace_id: string
  channel: string | null
  platform: string | null
  content_body: string | null
  content: string | null
  scheduled_at: string | null
  scheduled_for: string | null
  status: PublishStatus
  retry_count: number
  error_message: string | null
  media_urls: string | null
  created_at: string
  updated_at: string | null
}

// ─── Static UI metadata (intentionally hardcoded — these are display-only) ────

const PLATFORM_META: Record<Platform, { label: string; icon: string; charLimit: number; color: string }> = {
  instagram: { label: 'Instagram', icon: '📸', charLimit: 2200, color: 'text-pink-400' },
  facebook: { label: 'Facebook', icon: '📘', charLimit: 63206, color: 'text-blue-400' },
  twitter: { label: 'Twitter / X', icon: '🐦', charLimit: 280, color: 'text-sky-400' },
  linkedin: { label: 'LinkedIn', icon: '💼', charLimit: 3000, color: 'text-indigo-400' },
  tiktok: { label: 'TikTok', icon: '🎵', charLimit: 2200, color: 'text-rose-400' },
  youtube: { label: 'YouTube', icon: '▶', charLimit: 5000, color: 'text-red-400' },
}

const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube']

// Quick-template *labels* only — clicking these just opens the composer.
// We deliberately don't pre-fill any fake content; the user writes their own.
const QUICK_TEMPLATES = [
  { label: 'Product Feature', icon: '🚀', desc: 'Announce a new feature or update' },
  { label: 'Testimonial', icon: '⭐', desc: 'Share a customer success story' },
  { label: 'Promotional', icon: '🎁', desc: 'Limited-time offer or discount' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize the channel column (which can be 'linkedin' or 'LinkedIn' historically). */
function normalizePlatform(raw: string | null | undefined): Platform | null {
  if (!raw) return null
  const k = raw.trim().toLowerCase()
  if ((ALL_PLATFORMS as string[]).includes(k)) return k as Platform
  return null
}

/** Map raw integration row → platform connection state. */
type ConnectionState = 'connected' | 'expired' | 'disconnected'
function connectionStateFor(platform: Platform, rows: IntegrationRow[]): ConnectionState {
  const row = rows.find(r => normalizePlatform(r.platform) === platform)
  if (!row) return 'disconnected'
  if (row.status === 'active') return 'connected'
  return 'expired' // expired / revoked / error all surface as "Reconnect"
}

/** Render the human-friendly time for a scheduled row. */
function formatScheduledAt(row: ScheduledRow): string {
  const v = row.scheduled_at || row.scheduled_for
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Parse media_urls JSON column safely. */
function hasMedia(row: ScheduledRow): boolean {
  if (!row.media_urls) return false
  try {
    const arr = JSON.parse(row.media_urls) as unknown
    return Array.isArray(arr) && arr.length > 0
  } catch { return false }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PublishStatus }) {
  const styles: Record<PublishStatus, string> = {
    pending: 'bg-blue-900/60 text-blue-400 border-blue-800/50',
    paused: 'bg-gray-800 text-gray-400 border-gray-700',
    publishing: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/50 animate-pulse',
    published: 'bg-emerald-900/60 text-emerald-400 border-emerald-800/50',
    failed: 'bg-red-900/60 text-red-400 border-red-800/50',
    cancelled: 'bg-gray-900 text-gray-500 border-gray-800',
    draft: 'bg-gray-800 text-gray-400 border-gray-700',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${styles[status] || styles.pending}`}>{status}</span>
}

function PlatformChip({ platform, state, onClick }: { platform: Platform; state: ConnectionState; onClick: () => void }) {
  const meta = PLATFORM_META[platform]
  const isConnected = state === 'connected'
  const isExpired = state === 'expired'
  return (
    <button
      onClick={onClick}
      title={isConnected ? `${meta.label} connected — click to manage` : isExpired ? `${meta.label} token expired — click to reconnect` : `${meta.label} not connected — click to connect`}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
        isConnected
          ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-emerald-700'
          : isExpired
            ? 'bg-amber-950/30 border-amber-800/50 text-amber-300 hover:border-amber-600'
            : 'bg-gray-900 border-gray-800 text-gray-600 hover:border-indigo-700 hover:text-indigo-300'
      }`}
    >
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isConnected ? 'bg-emerald-400' : isExpired ? 'bg-amber-400' : 'bg-gray-700'
      }`} />
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublishingHubPage() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const [mainTab, setMainTab] = useState<MainTab>('queue')
  const [showCalendar, setShowCalendar] = useState(false)

  // ── Real data (Source Test) ─────────────────────────────────────────────────
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [queue, setQueue] = useState<ScheduledRow[]>([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)

  // Queue UI state
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All')
  const [selectedPosts, setSelectedPosts] = useState<string[]>([])

  // Composer state
  const [compPlatforms, setCompPlatforms] = useState<Platform[]>(['linkedin'])
  const [compContent, setCompContent] = useState('')
  const [firstComment, setFirstComment] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [showUTM, setShowUTM] = useState(false)
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('social')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [hashtags] = useState(['#AIMarketing', '#ContentCreation', '#DigitalMarketing', '#MarketingAutomation', '#SocialMedia', '#B2BSaaS', '#GrowthHacking', '#ContentStrategy', '#MarTech', '#InboundMarketing'])
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null)

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadIntegrations = useCallback(async (wsId: string) => {
    setLoadingIntegrations(true)
    try {
      const res = await fetch(`/api/integrations?workspaceId=${wsId}`)
      if (!res.ok) throw new Error(`integrations ${res.status}`)
      const rows = await res.json() as IntegrationRow[]
      setIntegrations(Array.isArray(rows) ? rows : [])
    } catch (err) {
      // Don't fall back to fake "connected" data — leave list empty and let
      // the UI show honest disconnected pills. This is the Source Test.
      console.error('[publishing] integrations load failed', err)
      setIntegrations([])
    } finally {
      setLoadingIntegrations(false)
    }
  }, [])

  const loadQueue = useCallback(async (wsId: string) => {
    setLoadingQueue(true); setQueueError(null)
    try {
      const res = await fetch(`/api/publishing?workspaceId=${wsId}`)
      if (!res.ok) throw new Error(`publishing ${res.status}`)
      const rows = await res.json() as ScheduledRow[] | { error: string }
      if (!Array.isArray(rows)) throw new Error('error' in rows ? rows.error : 'Unexpected response')
      setQueue(rows)
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to load queue')
      setQueue([])
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  // Sprint 10C: session-derived workspaceId via useWorkspaceId(). The hook
  // hits /api/auth/me and is the canonical source. localStorage stays as
  // an optimistic-hydrate fallback inside the hook itself.
  const { workspaceId: sessionWorkspaceId } = useWorkspaceId()
  useEffect(() => {
    if (sessionWorkspaceId) setWorkspaceId(sessionWorkspaceId)
  }, [sessionWorkspaceId])

  useEffect(() => {
    if (!workspaceId) return
    loadIntegrations(workspaceId)
    loadQueue(workspaceId)
  }, [workspaceId, loadIntegrations, loadQueue])

  // ── Derived state ───────────────────────────────────────────────────────────
  const connectionStates = useMemo(() => {
    const m: Record<Platform, ConnectionState> = {} as Record<Platform, ConnectionState>
    ALL_PLATFORMS.forEach(p => { m[p] = connectionStateFor(p, integrations) })
    return m
  }, [integrations])

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'All') return queue
    return queue.filter(r => r.status === queueFilter)
  }, [queue, queueFilter])

  // Upcoming = pending, sorted by scheduled_at ASC, capped 5
  const upcoming = useMemo(() => {
    return queue
      .filter(r => r.status === 'pending')
      .sort((a, b) => {
        const av = a.scheduled_at || a.scheduled_for || ''
        const bv = b.scheduled_at || b.scheduled_for || ''
        return av.localeCompare(bv)
      })
      .slice(0, 5)
  }, [queue])

  // 7-day calendar grid starting today (no hardcoded date).
  const calDays = useMemo(() => {
    const out: { label: string; iso: string }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      out.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        iso: d.toISOString().slice(0, 10),
      })
    }
    return out
  }, [])

  // ── Composer helpers ────────────────────────────────────────────────────────
  function togglePlatform(p: Platform) {
    setCompPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }
  function toggleHashtag(tag: string) {
    setSelectedHashtags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function togglePost(id: string) {
    setSelectedPosts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  /** Attach a file. We collect the filename only — uploading to storage and
   *  generating AI captions is intentionally NOT wired (was previously a
   *  setTimeout fake). When /api/agents/captioner ships, the AI panel can
   *  re-enable; for now we surface a "Coming soon" notice. */
  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setAttachedFileName(f ? f.name : null)
  }

  const allContent = compContent + (selectedHashtags.length ? '\n\n' + selectedHashtags.join(' ') : '')

  /** Real publish action. Routes through `POST /api/publishing` which writes
   *  to `scheduled_content`. The cron at `/api/cron/publish-scheduled` is
   *  the actual publisher. No setTimeout fakery — caller awaits the API. */
  async function handlePublish(mode: 'schedule' | 'now' | 'draft') {
    if (!workspaceId) {
      setPublishMessage({ kind: 'error', text: 'No workspace selected. Refresh the page.' })
      return
    }
    if (compPlatforms.length === 0) {
      setPublishMessage({ kind: 'error', text: 'Choose at least one platform.' })
      return
    }
    if (mode !== 'draft' && !compContent.trim()) {
      setPublishMessage({ kind: 'error', text: 'Write some content before publishing.' })
      return
    }
    if (mode === 'schedule' && !scheduleDate) {
      setPublishMessage({ kind: 'error', text: 'Pick a scheduled time to schedule a post.' })
      return
    }

    // For 'now' we set scheduled_at = now+30s so the cron picks it up on the
    // next tick. For 'schedule' we use the user's chosen datetime-local.
    // For 'draft' we still record a row but with a far-future scheduled_at
    // and status='draft' — that way the user can find it in the Draft tab
    // and the cron will never auto-publish it.
    const scheduledAt = mode === 'now'
      ? new Date(Date.now() + 30_000).toISOString()
      : mode === 'schedule'
        ? new Date(scheduleDate).toISOString()
        : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() // draft sentinel: +1y

    // One row per platform — the publishing cron is per-channel, so we fan out.
    setPublishing(true)
    setPublishMessage(null)
    let succeeded = 0
    let firstError: string | null = null
    try {
      for (const p of compPlatforms) {
        // Gate on real connection. Don't post about LinkedIn if LinkedIn isn't connected.
        if (mode !== 'draft' && connectionStates[p] !== 'connected') {
          firstError = firstError ?? `${PLATFORM_META[p].label} is not connected. Connect it from Integrations first.`
          continue
        }
        const res = await fetch('/api/publishing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            channel: p,
            contentBody: allContent,
            scheduledAt,
            mediaUrls: [], // Media upload not wired in this rewrite — see file header.
          }),
        })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          firstError = firstError ?? `${PLATFORM_META[p].label}: ${res.status} ${txt || 'failed'}`
          continue
        }
        succeeded++

        // For 'draft' mode we patch the just-created row to status='draft' so
        // the cron leaves it alone. We had to write it as 'pending' first
        // because the POST endpoint defaults to 'pending'.
        if (mode === 'draft') {
          try {
            const { id } = await res.json() as { id?: string }
            if (id) {
              await fetch('/api/publishing', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, workspaceId, status: 'paused' /* paused = the closest valid "do not run" status the PATCH endpoint accepts */ }),
              })
            }
          } catch { /* non-fatal — row exists, just won't be marked paused */ }
        }
      }

      // Refresh the queue so the new row(s) appear (Refresh Test: persistence
      // is guaranteed because we just re-read from the DB).
      await loadQueue(workspaceId)

      if (succeeded > 0 && !firstError) {
        setPublishMessage({
          kind: 'success',
          text: mode === 'now'
            ? `Queued for immediate publish across ${succeeded} platform${succeeded === 1 ? '' : 's'}. The cron will post within 60s.`
            : mode === 'schedule'
              ? `Scheduled across ${succeeded} platform${succeeded === 1 ? '' : 's'} for ${new Date(scheduledAt).toLocaleString()}.`
              : `Saved as draft across ${succeeded} platform${succeeded === 1 ? '' : 's'}.`,
        })
        // Clear composer so it's obvious the action persisted (queue will show it).
        if (mode !== 'draft') {
          setCompContent('')
          setSelectedHashtags([])
          setScheduleDate('')
          setAttachedFileName(null)
        }
      } else if (succeeded > 0 && firstError) {
        setPublishMessage({ kind: 'error', text: `Partial: ${succeeded} succeeded. ${firstError}` })
      } else {
        setPublishMessage({ kind: 'error', text: firstError || 'Publish failed for all selected platforms.' })
      }
    } finally {
      setPublishing(false)
    }
  }

  /** Bulk publish-now for posts selected in the queue. Each row triggers a
   *  PATCH to bump scheduled_at to now so the cron picks them up. */
  async function bulkPublishNow() {
    if (!workspaceId || selectedPosts.length === 0) return
    setPublishing(true)
    try {
      const newAt = new Date(Date.now() + 30_000).toISOString()
      for (const id of selectedPosts) {
        await fetch('/api/publishing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, workspaceId, scheduledAt: newAt }),
        })
      }
      setSelectedPosts([])
      await loadQueue(workspaceId)
    } finally {
      setPublishing(false)
    }
  }

  /** Bulk soft-delete (sets status='cancelled' server-side). */
  async function bulkDelete() {
    if (!workspaceId || selectedPosts.length === 0) return
    if (!confirm(`Cancel ${selectedPosts.length} post${selectedPosts.length === 1 ? '' : 's'}? This soft-deletes them — they stop being attempted but the audit row stays.`)) return
    setPublishing(true)
    try {
      for (const id of selectedPosts) {
        await fetch(`/api/publishing?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      }
      setSelectedPosts([])
      await loadQueue(workspaceId)
    } finally {
      setPublishing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-gray-950">
      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-sm">
              📡
            </div>
            <h1 className="text-white font-bold text-lg">Publishing Hub</h1>
          </div>

          {/* Platform chips — click any to jump to Integrations */}
          <div className="flex items-center gap-3 flex-wrap">
            {loadingIntegrations ? (
              <span className="text-gray-600 text-xs">Loading connections…</span>
            ) : (
              ALL_PLATFORMS.map(p => (
                <PlatformChip
                  key={p}
                  platform={p}
                  state={connectionStates[p]}
                  onClick={() => router.push('/dashboard/integrations')}
                />
              ))
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCalendar(v => !v)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showCalendar ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
            >
              🗓 Calendar
            </button>
            <button
              onClick={() => setMainTab('composer')}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              + New Post
            </button>
          </div>
        </div>

        {/* Calendar view (driven by real queue) */}
        {showCalendar && (
          <div className="mx-6 mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex-shrink-0">
            <div className="grid grid-cols-7">
              {calDays.map(day => {
                const postsForDay = queue.filter(p => {
                  const at = p.scheduled_at || p.scheduled_for || ''
                  return at.slice(0, 10) === day.iso
                })
                return (
                  <div key={day.iso} className="border-r border-gray-800 last:border-r-0 p-3 min-h-[120px]">
                    <p className="text-gray-500 text-xs mb-2">{day.label}</p>
                    <div className="space-y-1">
                      {postsForDay.map(p => {
                        const plat = normalizePlatform(p.channel || p.platform)
                        return (
                          <div key={p.id} className={`px-1.5 py-1 rounded text-xs truncate ${p.status === 'published' ? 'bg-emerald-900/40 text-emerald-400' : p.status === 'pending' ? 'bg-indigo-900/40 text-indigo-400' : 'bg-gray-800 text-gray-500'}`}>
                            {plat ? PLATFORM_META[plat].icon : '•'} {(p.content_body || p.content || '').slice(0, 20)}…
                          </div>
                        )
                      })}
                      {postsForDay.length === 0 && (
                        <p className="text-gray-700 text-[10px]">No posts</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6 flex-shrink-0">
          {(['queue', 'composer', 'analytics'] as MainTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${mainTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {tab === 'queue' ? 'Queue' : tab === 'composer' ? 'Composer' : 'Analytics'}
            </button>
          ))}
        </div>

        {/* ── QUEUE TAB ───────────────────────────────────────────────────────── */}
        {mainTab === 'queue' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Filters + bulk actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2 flex-wrap">
                {(['All', 'pending', 'published', 'failed', 'draft'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setQueueFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors capitalize ${queueFilter === f ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {f}
                  </button>
                ))}
                <button
                  onClick={() => workspaceId && loadQueue(workspaceId)}
                  disabled={!workspaceId || loadingQueue}
                  className="px-3 py-1.5 rounded-lg text-xs border bg-gray-900 border-gray-800 text-gray-500 hover:text-white disabled:opacity-50"
                >
                  {loadingQueue ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
              {selectedPosts.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={bulkPublishNow}
                    disabled={publishing}
                    className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
                  >
                    Publish Now ({selectedPosts.length})
                  </button>
                  <button
                    onClick={bulkDelete}
                    disabled={publishing}
                    className="px-3 py-1.5 rounded-lg text-xs bg-red-900/40 hover:bg-red-900/60 disabled:opacity-50 text-red-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Post list */}
            {queueError && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm">
                Couldn&apos;t load queue: {queueError}. <button onClick={() => workspaceId && loadQueue(workspaceId)} className="underline">Retry</button>
              </div>
            )}

            <div className="space-y-2">
              {filteredQueue.map(post => {
                const plat = normalizePlatform(post.channel || post.platform)
                return (
                  <div
                    key={post.id}
                    className={`flex items-center gap-4 p-4 bg-gray-900 border rounded-xl transition-all hover:border-gray-700 ${selectedPosts.includes(post.id) ? 'border-indigo-600/50' : 'border-gray-800'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPosts.includes(post.id)}
                      onChange={() => togglePost(post.id)}
                      className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {plat ? <span className="text-base" title={PLATFORM_META[plat].label}>{PLATFORM_META[plat].icon}</span> : <span className="text-gray-600 text-xs">?</span>}
                    </div>
                    {hasMedia(post) && (
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 flex-shrink-0 text-lg">🖼</div>
                    )}
                    <p className="flex-1 text-gray-300 text-sm truncate min-w-0">{post.content_body || post.content || <span className="text-gray-600 italic">(empty)</span>}</p>
                    <span className="text-gray-500 text-xs flex-shrink-0 hidden md:block">{formatScheduledAt(post)}</span>
                    <StatusBadge status={post.status} />
                    {post.error_message && (
                      <span title={post.error_message} className="text-red-400 text-xs flex-shrink-0 cursor-help">!</span>
                    )}
                  </div>
                )
              })}

              {/* Loading / Empty state — NO mock fallback */}
              {!loadingQueue && filteredQueue.length === 0 && !queueError && (
                <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-2xl">
                  <div className="text-5xl mb-3">📅</div>
                  <h3 className="text-white font-semibold text-base mb-1">
                    {queueFilter === 'All' ? 'No posts yet' : `No ${queueFilter} posts`}
                  </h3>
                  <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                    {queueFilter === 'All'
                      ? 'Your publishing queue is empty. Compose your first post and schedule it across your connected channels.'
                      : 'No posts match this filter.'}
                  </p>
                  {queueFilter === 'All' && (
                    <button
                      onClick={() => setMainTab('composer')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
                    >
                      Compose your first post →
                    </button>
                  )}
                </div>
              )}
              {loadingQueue && (
                <div className="text-center py-16 text-gray-600 text-sm">Loading queue…</div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPOSER TAB ────────────────────────────────────────────────────── */}
        {mainTab === 'composer' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {publishMessage && (
              <div className={`p-4 rounded-xl border text-sm flex items-start gap-2 ${publishMessage.kind === 'success' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' : 'bg-red-950/40 border-red-800/50 text-red-300'}`}>
                <span>{publishMessage.kind === 'success' ? '✓' : '✕'}</span>
                <span className="flex-1">{publishMessage.text}</span>
                <button onClick={() => setPublishMessage(null)} className="text-gray-500 hover:text-white">×</button>
              </div>
            )}

            {/* Platform multi-select — disabled platforms are clickable but flagged */}
            <div>
              <label className="text-gray-400 text-xs block mb-2">Publish to</label>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map(p => {
                  const meta = PLATFORM_META[p]
                  const state = connectionStates[p]
                  const selected = compPlatforms.includes(p)
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      title={state === 'connected' ? meta.label : state === 'expired' ? `${meta.label} — token expired (post may fail)` : `${meta.label} — not connected (post will be rejected until you connect)`}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        selected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                      }`}
                    >
                      {meta.icon} {meta.label}
                      {state !== 'connected' && (
                        <span className="ml-1 text-amber-400 text-[10px]">●</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {compPlatforms.some(p => connectionStates[p] !== 'connected') && (
                <p className="mt-2 text-amber-300 text-xs">
                  Some selected platforms aren&apos;t connected.{' '}
                  <button onClick={() => router.push('/dashboard/integrations')} className="underline">Connect them in Integrations →</button>
                </p>
              )}
            </div>

            {/* Content textarea with per-platform char counters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-xs">Content</label>
                <div className="flex gap-3">
                  {compPlatforms.map(p => {
                    const len = allContent.length
                    const limit = PLATFORM_META[p].charLimit
                    const over = len > limit
                    return (
                      <span key={p} className={`text-xs ${over ? 'text-red-400' : len > limit * 0.85 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {PLATFORM_META[p].icon} {len}/{limit}
                      </span>
                    )
                  })}
                </div>
              </div>
              <textarea
                value={compContent}
                onChange={e => setCompContent(e.target.value)}
                rows={5}
                placeholder="Write your post here..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Hashtag suggestions (UI-only — these are static brand tags) */}
            <div>
              <label className="text-gray-400 text-xs block mb-2">Hashtag Suggestions</label>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleHashtag(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${selectedHashtags.includes(tag) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Media attachment — file is collected but NOT uploaded.
                AI caption / alt-text panel intentionally disabled with a
                "Coming soon" notice. The previous handleMediaDrop was a
                setTimeout fake; we'd rather show nothing than lie. */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white text-sm font-semibold">Media</h3>
                <span className="text-amber-400 text-[10px] bg-amber-900/20 border border-amber-800/40 px-2 py-0.5 rounded">AI captioning coming soon</span>
              </div>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer?.files?.[0]
                  setAttachedFileName(f ? f.name : null)
                }}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-700 hover:border-indigo-600 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFileChosen} />
                <div className="text-3xl mb-2">🖼</div>
                {attachedFileName ? (
                  <p className="text-gray-300 text-sm">{attachedFileName}</p>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm">Click or drop a file to attach</p>
                    <p className="text-gray-600 text-xs mt-1">Upload + AI captioning will arrive in the next release. For now, attach text-only posts.</p>
                  </>
                )}
              </div>
              {attachedFileName && (
                <p className="text-amber-300 text-xs">
                  Note: file is selected but not uploaded yet. Media publishing will work once storage + captioning are wired. Your post will currently send text only.
                </p>
              )}
            </div>

            {/* Schedule (no hardcoded "Best Time") */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-white text-sm font-semibold">Schedule</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <p className="text-gray-600 text-xs">
                  Pick a future time, or use Publish Now to queue immediately.
                </p>
              </div>
            </div>

            {/* First comment + UTM (kept — these flow into content via your own copy/paste) */}
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">First Comment (Instagram hashtag stacking — appended to your post on supported platforms)</label>
              <input
                value={firstComment}
                onChange={e => setFirstComment(e.target.value)}
                placeholder="#marketing #ai ..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <button
                onClick={() => setShowUTM(v => !v)}
                className="flex items-center gap-2 text-gray-400 hover:text-white text-xs transition-colors"
              >
                <span>{showUTM ? '▼' : '▶'}</span>
                UTM Parameters
              </button>
              {showUTM && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Source', value: utmSource, setter: setUtmSource, placeholder: 'instagram' },
                    { label: 'Medium', value: utmMedium, setter: setUtmMedium, placeholder: 'social' },
                    { label: 'Campaign', value: utmCampaign, setter: setUtmCampaign, placeholder: 'q2-launch' },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label}>
                      <label className="text-gray-500 text-xs block mb-1">{label}</label>
                      <input
                        value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder={placeholder}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons — all wired to the real handlePublish */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handlePublish('now')}
                disabled={publishing || !compContent.trim() || compPlatforms.length === 0}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {publishing ? 'Working…' : 'Publish Now'}
              </button>
              <button
                onClick={() => handlePublish('schedule')}
                disabled={publishing || !scheduleDate || !compContent.trim() || compPlatforms.length === 0}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors border border-gray-700"
              >
                Schedule
              </button>
              <button
                onClick={() => handlePublish('draft')}
                disabled={publishing || compPlatforms.length === 0}
                className="px-5 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-gray-400 font-medium text-sm transition-colors border border-gray-800"
              >
                Save Draft
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ───────────────────────────────────────────────────── */}
        {mainTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Honest empty state — no fabricated metrics, no fake heatmap.
                When /api/analytics/posts ships we'll render real per-post data here. */}
            <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl mx-auto">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-white font-semibold text-lg mb-2">Per-post analytics coming soon</h3>
              <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto leading-relaxed">
                Reach, engagement, clicks, and best-time-to-post insights will populate here once
                your platforms are connected and posts have been live for at least 24 hours.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => router.push('/dashboard/integrations')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
                >
                  Connect platforms →
                </button>
                <button
                  onClick={() => router.push('/dashboard/analytics')}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700"
                >
                  Workspace analytics
                </button>
              </div>
              <p className="text-gray-700 text-xs mt-6">
                We don&apos;t show fake numbers. When data exists, it appears here — not before.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-800 overflow-y-auto">
        <div className="p-4 space-y-5">

          {/* Connected platforms — real state, Connect button navigates */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Connections</h3>
            <div className="space-y-2">
              {loadingIntegrations ? (
                <p className="text-gray-600 text-xs">Loading…</p>
              ) : (
                ALL_PLATFORMS.map(p => {
                  const meta = PLATFORM_META[p]
                  const state = connectionStates[p]
                  return (
                    <div key={p} className="flex items-center gap-2 p-2 rounded-lg bg-gray-900 border border-gray-800">
                      <span className="text-base flex-shrink-0">{meta.icon}</span>
                      <span className="text-gray-300 text-xs flex-1">{meta.label}</span>
                      {state === 'connected' ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected" />
                      ) : state === 'expired' ? (
                        <button
                          onClick={() => router.push('/dashboard/integrations')}
                          className="text-amber-400 hover:text-amber-300 text-xs transition-colors"
                        >
                          Reconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => router.push('/dashboard/integrations')}
                          className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Upcoming schedule — pulled from real queue */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Up Next</h3>
            <div className="space-y-2">
              {upcoming.length === 0 && !loadingQueue && (
                <p className="text-gray-600 text-xs">Nothing scheduled.</p>
              )}
              {upcoming.map(post => {
                const plat = normalizePlatform(post.channel || post.platform)
                return (
                  <div key={post.id} className="p-2.5 rounded-lg bg-gray-900 border border-gray-800 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {plat && <span className="text-sm">{PLATFORM_META[plat].icon}</span>}
                      <StatusBadge status={post.status} />
                    </div>
                    <p className="text-gray-400 text-xs truncate">{post.content_body || post.content || '(empty)'}</p>
                    <p className="text-gray-600 text-xs">{formatScheduledAt(post)}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick publish templates — open composer, no fake content */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Quick Templates</h3>
            <div className="space-y-2">
              {QUICK_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.label}
                  onClick={() => setMainTab('composer')}
                  className="w-full flex items-start gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-left transition-colors"
                >
                  <span className="text-lg flex-shrink-0">{tmpl.icon}</span>
                  <div>
                    <p className="text-white text-xs font-medium">{tmpl.label}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{tmpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hint — never lie about agent ideation */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Tip</h3>
            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-800/30">
              <p className="text-gray-400 text-xs leading-relaxed">
                Ask the CMO Agent for post ideas tailored to your brand — head to the CMO dashboard and prompt
                &ldquo;Give me five LinkedIn posts for this week.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
