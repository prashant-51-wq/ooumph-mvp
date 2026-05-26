/**
 * /dashboard/workspace
 *
 * The Projects & Artifacts Hub — a 3-panel workspace explorer.
 *
 *   ┌────────────────┬──────────────────┬─────────────────────────┐
 *   │ INITIATIVES    │ ASSETS           │ LIVE CANVAS             │
 *   │ (master runs)  │ (children of run)│ (selected artifact view)│
 *   │                │                  │                         │
 *   │ [Client▼] *    │ Strategy doc     │ # Q2 Lead-Gen Strategy  │
 *   │ [Search]       │ Email sequence   │                         │
 *   │ [Chan][Date]   │ Social posts     │ Positioning: …          │
 *   │                │ Video brief      │ Objective: …            │
 *   │ ▸ Q2 strategy  │ Ad copy          │ ...                     │
 *   │ ▸ Launch plan  │                  │ [Approve & Queue]       │
 *   │ ▸ Webinar prep │                  │ [Reject]                │
 *   └────────────────┴──────────────────┴─────────────────────────┘
 *
 *   * Admin-only — agencies see a Client Account switcher; regular users
 *     see their own workspace anchored.
 *
 * Data flow:
 *   1. /api/auth/me        → user + isAdmin + default workspaceId
 *   2. /api/workspaces     → list (admins only, for the switcher)
 *   3. /api/agent-runs?parentNull=true → initiatives (left panel)
 *   4. /api/artifacts?agentRunId=…     → assets for selected initiative
 *   5. /api/artifacts?id=… (full)      → canvas content
 *   6. /api/approvals + /api/publish/direct → approval pipeline
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, ChevronDown, Check, Briefcase, Clock,
  Brain, MessageSquare, Mail, Video, Megaphone, FileText, Mic,
  Image as ImageIcon, Hash, Pencil, X as XIcon, AlertCircle, Loader2,
  ArrowRight, Sparkles, ListChecks,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface SessionUser {
  id: string
  email: string
  name: string
  isAdmin: boolean
  workspaceId: string | null
  workspaceName?: string | null
}

interface WorkspaceRow {
  id: string
  name: string
  industry?: string | null
}

interface AgentRunRow {
  id: string
  workspace_id: string
  agent_name: string
  parent_run_id: string | null
  status: string
  input_json: string | Record<string, unknown> | null
  output_json: string | Record<string, unknown> | null
  cost_estimate: number | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface ArtifactRow {
  id: string
  workspace_id: string
  agent_run_id: string | null
  type: string
  title: string
  content_json: Record<string, unknown> | string | null
  status: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────

type ChannelId = 'all' | 'strategy' | 'social' | 'email' | 'video' | 'ads'

const CHANNEL_FILTERS: Array<{ id: ChannelId; label: string }> = [
  { id: 'all',      label: 'All channels' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'social',   label: 'Social' },
  { id: 'email',    label: 'Email' },
  { id: 'video',    label: 'Video' },
  { id: 'ads',      label: 'Ads' },
]

type DateId = 'all' | 'recent' | '30d'

const DATE_FILTERS: Array<{ id: DateId; label: string; days?: number }> = [
  { id: 'recent', label: 'Most recent (7 days)', days: 7 },
  { id: '30d',    label: 'Past 30 days',         days: 30 },
  { id: 'all',    label: 'All time' },
]

// Map artifact.type → channel category for the filter
function artifactToChannel(type: string): ChannelId | null {
  const t = type.toLowerCase()
  if (t.includes('strateg')) return 'strategy'
  if (t.includes('social') || t === 'visual_post' || t === 'visual_carousel' || t === 'visual_story') return 'social'
  if (t.includes('email') || t === 'newsletter') return 'email'
  if (t.includes('video') || t === 'voiceover' || t === 'avatar_video') return 'video'
  if (t.includes('ad') || t === 'visual_ad' || t === 'ad_copy') return 'ads'
  return null
}

// Lucide icon for an artifact type
function iconForType(type: string) {
  const t = type.toLowerCase()
  if (t.includes('strateg')) return Brain
  if (t.includes('social') || t === 'visual_post') return MessageSquare
  if (t.includes('email') || t === 'newsletter') return Mail
  if (t.includes('video') || t === 'avatar_video') return Video
  if (t === 'voiceover') return Mic
  if (t === 'generated_image' || t.includes('visual')) return ImageIcon
  if (t.includes('ad')) return Megaphone
  if (t.includes('blog') || t === 'repurposed_content') return FileText
  return FileText
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft:     { bg: 'bg-gray-800',         text: 'text-gray-400',    border: 'border-gray-700',    label: 'Draft' },
  pending:   { bg: 'bg-yellow-900/40',    text: 'text-yellow-300',  border: 'border-yellow-700',  label: 'Pending Review' },
  approved:  { bg: 'bg-emerald-900/40',   text: 'text-emerald-300', border: 'border-emerald-700', label: 'Approved' },
  rejected:  { bg: 'bg-red-900/40',       text: 'text-red-300',     border: 'border-red-700',     label: 'Rejected' },
  generated: { bg: 'bg-indigo-900/40',    text: 'text-indigo-300',  border: 'border-indigo-700',  label: 'Generated' },
}
const statusFor = (s: string) => STATUS_STYLES[s] || STATUS_STYLES.draft

// ─── Helpers ──────────────────────────────────────────────────────────────

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
  }
  return {}
}

function extractPrompt(run: AgentRunRow): string {
  const input = asObject(run.input_json)
  const pick = ['message', 'prompt', 'goal', 'description', 'topic']
  for (const k of pick) {
    if (typeof input[k] === 'string' && input[k]) return String(input[k])
  }
  return `${run.agent_name.replace(/_/g, ' ')} run`
}

function extractPrimaryText(content: Record<string, unknown>): string {
  const PRIMARY = ['copy', 'body', 'content', 'text', 'description', 'message', 'headline', 'positioning']
  for (const k of PRIMARY) {
    if (typeof content[k] === 'string' && content[k]) return content[k] as string
  }
  return JSON.stringify(content, null, 2)
}

function extractPublishDestination(content: Record<string, unknown>): string | undefined {
  for (const k of ['platform', 'publishDestination', 'destination', 'channel']) {
    const v = content[k]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════

export default function WorkspaceHubPage() {
  const router = useRouter()

  // ─── Session + workspace context ───────────────────────────────────────
  const [me, setMe] = useState<SessionUser | null>(null)
  const [meLoading, setMeLoading] = useState(true)
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceRow[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [workspaceSearch, setWorkspaceSearch] = useState('')

  // ─── Filters ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelId>('all')
  const [dateFilter, setDateFilter] = useState<DateId>('30d')

  // ─── Data ──────────────────────────────────────────────────────────────
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [runChannels, setRunChannels] = useState<Record<string, ChannelId[]>>({})

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRow | null>(null)
  const [artifactLoading, setArtifactLoading] = useState(false)

  // ─── Canvas editor ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [submitting, setSubmitting] = useState<'approve' | 'queue' | 'reject' | 'save' | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitWarning, setSubmitWarning] = useState<string | null>(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Close workspace menu on outside click
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!workspaceMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [workspaceMenuOpen])

  // ─── 1. Load session ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: { user: SessionUser | null }) => {
        if (cancelled) return
        if (!data.user) {
          router.push('/login')
          return
        }
        setMe(data.user)
        // Default to the user's own workspace; admins can switch via dropdown.
        const initial = data.user.workspaceId || localStorage.getItem('workspaceId')
        if (initial) setCurrentWorkspaceId(initial)
      })
      .catch(() => router.push('/login'))
      .finally(() => { if (!cancelled) setMeLoading(false) })
    return () => { cancelled = true }
  }, [router])

  // ─── 2. For admins: load all workspaces for the switcher ───────────────
  useEffect(() => {
    if (!me?.isAdmin) return
    fetch('/api/workspaces')
      .then(r => r.json())
      .then((list: unknown) => {
        if (Array.isArray(list)) setAllWorkspaces(list as WorkspaceRow[])
      })
      .catch(() => {})
  }, [me])

  // ─── 3. Load master initiatives for the active workspace ───────────────
  const loadRuns = useCallback(async () => {
    if (!currentWorkspaceId) return
    setRunsLoading(true)
    const dateConfig = DATE_FILTERS.find(d => d.id === dateFilter)
    const since = dateConfig?.days
      ? new Date(Date.now() - dateConfig.days * 86400_000).toISOString()
      : ''
    const url = new URL('/api/agent-runs', window.location.origin)
    url.searchParams.set('workspaceId', currentWorkspaceId)
    url.searchParams.set('parentNull', 'true')
    url.searchParams.set('limit', '100')
    if (since) url.searchParams.set('since', since)
    try {
      const res = await fetch(url.toString())
      const data = await res.json()
      if (Array.isArray(data)) setRuns(data)
    } catch (err) {
      console.error('[workspace] failed to load runs', err)
    } finally {
      setRunsLoading(false)
    }
  }, [currentWorkspaceId, dateFilter])

  useEffect(() => {
    // Reset selection when the workspace or date filter changes
    setSelectedRunId(null)
    setSelectedArtifactId(null)
    setSelectedArtifact(null)
    setArtifacts([])
    setRunChannels({})
    void loadRuns()
  }, [loadRuns])

  // ─── 4. Pre-load channel chips for every initiative (one batch) ────────
  // We do this in the background so the channel filter works without N round trips
  // per click. For workspaces with many initiatives, we cap to the first 30 visible.
  useEffect(() => {
    if (!currentWorkspaceId || runs.length === 0) return
    let cancelled = false
    const toLoad = runs.slice(0, 30).filter(r => !(r.id in runChannels))
    if (toLoad.length === 0) return

    void Promise.all(
      toLoad.map(run =>
        fetch(`/api/artifacts?workspaceId=${currentWorkspaceId}&agentRunId=${run.id}`)
          .then(r => r.ok ? r.json() : [])
          .then((items: ArtifactRow[]) => {
            const channels = new Set<ChannelId>()
            for (const a of items) {
              const ch = artifactToChannel(a.type)
              if (ch) channels.add(ch)
            }
            return [run.id, Array.from(channels)] as [string, ChannelId[]]
          })
          .catch(() => [run.id, []] as [string, ChannelId[]])
      )
    ).then(pairs => {
      if (cancelled) return
      setRunChannels(prev => {
        const next = { ...prev }
        for (const [id, ch] of pairs) next[id] = ch
        return next
      })
    })

    return () => { cancelled = true }
  }, [runs, currentWorkspaceId, runChannels])

  // ─── 5. Load artifacts when a run is selected ──────────────────────────
  useEffect(() => {
    if (!selectedRunId || !currentWorkspaceId) {
      setArtifacts([])
      return
    }
    let cancelled = false
    setArtifactsLoading(true)
    fetch(`/api/artifacts?workspaceId=${currentWorkspaceId}&agentRunId=${selectedRunId}`)
      .then(r => r.json())
      .then((data: ArtifactRow[]) => {
        if (!cancelled && Array.isArray(data)) setArtifacts(data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setArtifactsLoading(false) })
    return () => { cancelled = true }
  }, [selectedRunId, currentWorkspaceId])

  // ─── 6. Load full artifact when one is selected ────────────────────────
  useEffect(() => {
    if (!selectedArtifactId || !currentWorkspaceId) {
      setSelectedArtifact(null)
      return
    }
    let cancelled = false
    setArtifactLoading(true)
    // Reset editor state on artifact change
    setEditMode(false)
    setEditText('')
    setSubmitError(null)
    setSubmitWarning(null)
    setShowRejectInput(false)
    setRejectReason('')

    fetch(`/api/artifacts?workspaceId=${currentWorkspaceId}&id=${selectedArtifactId}`)
      .then(r => r.json())
      .then((data: ArtifactRow | null) => {
        if (!cancelled && data) {
          setSelectedArtifact(data)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setArtifactLoading(false) })
    return () => { cancelled = true }
  }, [selectedArtifactId, currentWorkspaceId])

  // ─── Filter runs by search + channel ───────────────────────────────────
  // (Date filter is applied server-side via the `since` param.)
  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      // Search
      if (search.trim()) {
        const prompt = extractPrompt(run).toLowerCase()
        if (!prompt.includes(search.trim().toLowerCase())) return false
      }
      // Channel — uses our pre-loaded chip cache
      if (channelFilter !== 'all') {
        const channels = runChannels[run.id] || []
        if (!channels.includes(channelFilter)) return false
      }
      return true
    })
  }, [runs, search, channelFilter, runChannels])

  // ─── Detect an approved strategy in the selected initiative ────────────
  //
  // The middle panel pivots into a live Task Board the moment we find an
  // artifact of type='strategy' AND status='approved' in the selected
  // initiative's artifact bag. The board polls /api/project-tasks every
  // 2s and renders the autonomous sub-agent execution as it unfolds.
  const approvedStrategy = useMemo(
    () => artifacts.find(a => a.type === 'strategy' && a.status === 'approved') || null,
    [artifacts],
  )

  // ─── Filter workspaces in switcher ─────────────────────────────────────
  const filteredWorkspaces = useMemo(() => {
    if (!workspaceSearch.trim()) return allWorkspaces
    const q = workspaceSearch.trim().toLowerCase()
    return allWorkspaces.filter(w => w.name?.toLowerCase().includes(q))
  }, [allWorkspaces, workspaceSearch])

  // ─── Active workspace display name ─────────────────────────────────────
  const activeWorkspaceName = useMemo(() => {
    if (!currentWorkspaceId) return 'No workspace'
    const found = allWorkspaces.find(w => w.id === currentWorkspaceId)
    if (found) return found.name
    if (currentWorkspaceId === me?.workspaceId) return me?.workspaceName || 'Your workspace'
    return 'Workspace'
  }, [currentWorkspaceId, allWorkspaces, me])

  // ─── Approval / publish handlers ───────────────────────────────────────
  const findApprovalId = async (artifactId: string): Promise<string | null> => {
    if (!currentWorkspaceId) return null
    try {
      const res = await fetch(`/api/approvals?workspaceId=${currentWorkspaceId}`)
      const list = await res.json() as Array<{ id: string; artifact_id: string; status: string }>
      const row = list.find(a => a.artifact_id === artifactId)
      return row?.id || null
    } catch {
      return null
    }
  }

  const refreshArtifact = async () => {
    if (!selectedArtifactId || !currentWorkspaceId) return
    try {
      const fresh = await fetch(`/api/artifacts?workspaceId=${currentWorkspaceId}&id=${selectedArtifactId}`).then(r => r.json())
      if (fresh) setSelectedArtifact(fresh as ArtifactRow)
    } catch { /* ignore */ }
  }

  const handleApprove = async (alsoQueue: boolean) => {
    if (!selectedArtifact || !currentWorkspaceId) return
    setSubmitting(alsoQueue ? 'queue' : 'approve')
    setSubmitError(null)
    setSubmitWarning(null)
    try {
      const approvalId = await findApprovalId(selectedArtifact.id)
      if (!approvalId) throw new Error('No approval row exists for this artifact')

      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          action: 'approve',
          workspaceId: currentWorkspaceId,
        }),
      })
      if (!res.ok) throw new Error(`Approve failed (${res.status})`)

      // If queueing, also fire publish (best-effort)
      if (alsoQueue) {
        const content = asObject(selectedArtifact.content_json)
        const dest = extractPublishDestination(content)
        if (dest) {
          try {
            const pubRes = await fetch('/api/publish/direct', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workspaceId: currentWorkspaceId,
                platforms: [dest],
                content: extractPrimaryText(content),
                artifactId: selectedArtifact.id,
              }),
            })
            if (!pubRes.ok) {
              const errText = await pubRes.text().catch(() => '')
              setSubmitWarning(`Approved, but publish to ${dest} failed: ${errText.slice(0, 120) || pubRes.statusText}`)
            }
          } catch (e) {
            setSubmitWarning(`Approved, but publish couldn't be queued: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
      await refreshArtifact()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setSubmitting(null)
    }
  }

  const handleReject = async () => {
    if (!selectedArtifact || !currentWorkspaceId) return
    setSubmitting('reject')
    setSubmitError(null)
    try {
      const approvalId = await findApprovalId(selectedArtifact.id)
      if (!approvalId) throw new Error('No approval row exists')
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          action: 'reject',
          notes: rejectReason.trim() || 'Rejected from Workspace Hub',
          workspaceId: currentWorkspaceId,
        }),
      })
      if (!res.ok) throw new Error(`Reject failed (${res.status})`)
      await refreshArtifact()
      setShowRejectInput(false)
      setRejectReason('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setSubmitting(null)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedArtifact || !currentWorkspaceId) return
    setSubmitting('save')
    setSubmitError(null)
    try {
      const current = asObject(selectedArtifact.content_json)
      // Find the primary key (e.g. body / copy) and overwrite it with edited text.
      const PRIMARY = ['copy', 'body', 'content', 'text', 'description', 'message', 'headline', 'positioning']
      let primaryKey: string | null = null
      for (const k of PRIMARY) {
        if (typeof current[k] === 'string' && current[k]) { primaryKey = k; break }
      }
      const updated = primaryKey
        ? { ...current, [primaryKey]: editText }
        : { ...current, body: editText }

      const res = await fetch(`/api/artifacts?id=${selectedArtifact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_json: updated }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      await refreshArtifact()
      setEditMode(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(null)
    }
  }

  // ─── Derived: content for canvas ───────────────────────────────────────
  const canvasContent = useMemo(() => asObject(selectedArtifact?.content_json), [selectedArtifact])
  const canvasPrimary = useMemo(() => extractPrimaryText(canvasContent), [canvasContent])
  const canvasDestination = useMemo(() => extractPublishDestination(canvasContent), [canvasContent])
  const canvasIsPending = selectedArtifact?.status === 'pending'

  // Sync edit text whenever the source changes
  useEffect(() => { setEditText(canvasPrimary) }, [canvasPrimary])

  // ─── Loading boot ──────────────────────────────────────────────────────
  if (meLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex min-w-0 min-h-0">
      {/* ╔═════════════════════════════════════════════════════════════╗
          ║  LEFT PANEL: Initiatives                                    ║
          ╚═════════════════════════════════════════════════════════════╝ */}
      <aside className="w-[300px] flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950 min-w-0">

        {/* ─── Admin client switcher (only when user.isAdmin) ─── */}
        {me?.isAdmin && (
          <div className="p-3 border-b border-gray-800 relative" ref={workspaceMenuRef}>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> Client Account
            </p>
            <button
              onClick={() => setWorkspaceMenuOpen(v => !v)}
              className="w-full px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-indigo-700 rounded-lg flex items-center gap-2 text-sm text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="flex-1 text-left truncate text-xs font-medium">{activeWorkspaceName}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {workspaceMenuOpen && (
              <div className="absolute left-3 right-3 top-[5rem] z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-xl flex flex-col max-h-[70vh]">
                <div className="p-2 border-b border-gray-800">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                    <input
                      type="text"
                      value={workspaceSearch}
                      onChange={e => setWorkspaceSearch(e.target.value)}
                      placeholder="Search clients…"
                      className="w-full bg-gray-950 border border-gray-800 rounded-md pl-7 pr-2 py-1 text-xs text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="overflow-y-auto py-1">
                  {filteredWorkspaces.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-500 text-center">No workspaces match</p>
                  )}
                  {filteredWorkspaces.map(w => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWorkspaceId(w.id)
                        setWorkspaceMenuOpen(false)
                        setWorkspaceSearch('')
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 flex items-center gap-2 ${currentWorkspaceId === w.id ? 'bg-indigo-950/60 text-indigo-300' : 'text-gray-300'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${currentWorkspaceId === w.id ? 'bg-indigo-400' : 'bg-gray-600'}`} />
                      <span className="flex-1 truncate">{w.name}</span>
                      {currentWorkspaceId === w.id && <Check className="w-3 h-3 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Search + filters ─── */}
        <div className="p-3 border-b border-gray-800 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search initiatives…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value as ChannelId)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-indigo-600 focus:outline-none cursor-pointer"
            >
              {CHANNEL_FILTERS.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as DateId)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-indigo-600 focus:outline-none cursor-pointer"
            >
              {DATE_FILTERS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Initiative list ─── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {runsLoading && (
            <div className="p-8 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              Loading initiatives…
            </div>
          )}
          {!runsLoading && filteredRuns.length === 0 && (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2 opacity-50">📋</div>
              <p className="text-gray-400 text-xs font-medium">
                {runs.length === 0 ? 'No initiatives yet' : 'No matches'}
              </p>
              <p className="text-gray-500 text-[11px] mt-1 leading-relaxed max-w-[200px] mx-auto">
                {runs.length === 0
                  ? 'Start a project from the CMO chat or Strategy page — top-level runs appear here.'
                  : 'Try clearing your filters above.'}
              </p>
            </div>
          )}
          <div className="p-2 space-y-1">
            {filteredRuns.map(run => {
              const isSelected = selectedRunId === run.id
              const channels = runChannels[run.id] || []
              const statusDot = run.status === 'completed' ? 'bg-emerald-500'
                              : run.status === 'failed'    ? 'bg-red-500'
                              : run.status === 'running'   ? 'bg-yellow-500 animate-pulse'
                              : 'bg-gray-600'
              return (
                <button
                  key={run.id}
                  onClick={() => {
                    setSelectedRunId(run.id)
                    setSelectedArtifactId(null)
                    setSelectedArtifact(null)
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${isSelected ? 'bg-indigo-950/60 border-indigo-700 ring-1 ring-indigo-700/40' : 'bg-gray-900 border-gray-800 hover:border-gray-700 hover:bg-gray-900/80'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-snug line-clamp-2 ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {extractPrompt(run)}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{timeAgo(run.created_at)}</span>
                      </div>
                      {channels.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {channels.map(c => {
                            const meta = CHANNEL_FILTERS.find(cf => cf.id === c)
                            return (
                              <span
                                key={c}
                                className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[9px] uppercase tracking-wider text-gray-400"
                              >
                                {meta?.label || c}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ╔═════════════════════════════════════════════════════════════╗
          ║  MIDDLE PANEL: Assets OR live Task Board                    ║
          ║                                                             ║
          ║  Pivots based on selected initiative state:                 ║
          ║    • approved strategy present → TaskBoard (live polling)   ║
          ║    • otherwise → flat artifact list                         ║
          ╚═════════════════════════════════════════════════════════════╝ */}
      {selectedRunId && approvedStrategy && currentWorkspaceId ? (
        <TaskBoard
          workspaceId={currentWorkspaceId}
          initiativeRunId={selectedRunId}
          strategyArtifact={approvedStrategy}
          selectedArtifactId={selectedArtifactId}
          onSelectArtifact={(id) => setSelectedArtifactId(id)}
        />
      ) : (
        <section className="w-[360px] flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950 min-w-0">
          <div className="p-3 border-b border-gray-800">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Generated Assets</p>
            <p className="text-sm text-white font-medium mt-0.5">
              {selectedRunId
                ? (artifactsLoading
                  ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
                  : `${artifacts.length} ${artifacts.length === 1 ? 'artifact' : 'artifacts'}`
                )
                : <span className="text-gray-500 text-xs">Select an initiative →</span>}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-2">
            {!selectedRunId && (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2 opacity-40">📦</div>
                <p className="text-gray-500 text-xs leading-relaxed">Pick an initiative from the left to see the artifacts it produced.</p>
              </div>
            )}
            {selectedRunId && !artifactsLoading && artifacts.length === 0 && (
              <div className="p-6 text-center">
                <div className="text-3xl mb-2 opacity-40">∅</div>
                <p className="text-gray-400 text-xs font-medium">No artifacts produced</p>
                <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">This initiative didn&apos;t generate any saveable content (maybe it failed early).</p>
              </div>
            )}

            <div className="space-y-1">
              {artifacts.map(a => {
                const Icon = iconForType(a.type)
                const isSelected = selectedArtifactId === a.id
                const status = statusFor(a.status)
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedArtifactId(a.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-start gap-3 ${isSelected ? 'bg-indigo-950/60 border-indigo-700 ring-1 ring-indigo-700/40' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isSelected ? 'text-indigo-300' : 'text-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {a.title || 'Untitled artifact'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${status.bg} ${status.text} ${status.border}`}>
                          {status.label}
                        </span>
                        <span className="text-gray-600 text-[10px] capitalize">{a.type.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ╔═════════════════════════════════════════════════════════════╗
          ║  RIGHT PANEL: Live Canvas                                   ║
          ╚═════════════════════════════════════════════════════════════╝ */}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-gray-950">
        {!selectedArtifactId && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <div className="text-5xl mb-3 opacity-40">📄</div>
              <p className="text-gray-300 text-sm font-medium">Select an asset to view</p>
              <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                The full content of any artifact renders here — review it, edit it inline, then approve to publish.
              </p>
            </div>
          </div>
        )}

        {selectedArtifactId && (artifactLoading || !selectedArtifact) && (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading canvas…
          </div>
        )}

        {selectedArtifact && (
          <>
            {/* ── Canvas header ── */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {(() => {
                    const Icon = iconForType(selectedArtifact.type)
                    return <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  })()}
                  <h2 className="text-white font-semibold text-base truncate">{selectedArtifact.title || 'Untitled'}</h2>
                  {(() => {
                    const s = statusFor(selectedArtifact.status)
                    return (
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-semibold ${s.bg} ${s.text} ${s.border}`}>
                        {s.label}
                      </span>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="capitalize">{selectedArtifact.type.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span>{timeAgo(selectedArtifact.created_at)}</span>
                  <span>·</span>
                  <span className="font-mono text-gray-600">#{selectedArtifact.id.slice(0, 8)}</span>
                  {canvasDestination && (
                    <>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300 text-[10px]">
                        → {canvasDestination}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {selectedArtifact.status === 'pending' && !editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 rounded-lg transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {/* ── Canvas body: viewer OR editor ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-3xl mx-auto px-6 py-6">
                {!editMode ? (
                  <ArtifactReader content={canvasContent} primary={canvasPrimary} type={selectedArtifact.type} />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Editing primary content</p>
                      <span className="text-[10px] text-gray-500">{editText.length} chars</span>
                    </div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={20}
                      className="w-full bg-gray-900 border border-indigo-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-gray-100 text-sm font-sans leading-relaxed resize-y outline-none"
                      placeholder="Edit the content…"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={submitting !== null || editText === canvasPrimary}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {submitting === 'save' ? 'Saving…' : '💾 Save Changes'}
                      </button>
                      <button
                        onClick={() => { setEditMode(false); setEditText(canvasPrimary) }}
                        disabled={submitting !== null}
                        className="px-3 py-1.5 border border-gray-700 hover:border-gray-500 text-gray-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <span className="text-[10px] text-gray-600 ml-auto">Saving updates the artifact and requires re-approval if rejected.</span>
                    </div>
                  </div>
                )}

                {/* Reject reason inline */}
                {showRejectInput && (
                  <div className="mt-6 bg-red-950/30 border border-red-900/50 rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Reject — what should the agent learn?
                    </p>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. tone is too aggressive, missing a CTA, wrong audience…"
                      className="w-full bg-gray-950 border border-red-900/50 focus:border-red-700 rounded-lg px-3 py-2 text-gray-200 text-xs resize-none outline-none"
                      autoFocus
                    />
                    <p className="text-[10px] text-red-400/70 mt-2">Your reason is saved as a learning note so future generations adjust.</p>
                  </div>
                )}

                {/* Submit error / warning toasts */}
                {submitError && (
                  <div className="mt-4 bg-red-950/40 border border-red-800 rounded-xl px-3 py-2 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}
                {submitWarning && (
                  <div className="mt-4 bg-yellow-950/40 border border-yellow-800 rounded-xl px-3 py-2 text-yellow-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{submitWarning}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Canvas footer: approval action bar ── */}
            {canvasIsPending && !editMode && (
              <div className="border-t border-gray-800 px-6 py-3 flex items-center gap-2 flex-shrink-0 bg-gray-950">
                {showRejectInput ? (
                  <>
                    <button
                      onClick={() => { setShowRejectInput(false); setRejectReason('') }}
                      disabled={submitting !== null}
                      className="px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={handleReject}
                      disabled={submitting !== null}
                      className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {submitting === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XIcon className="w-3 h-3" />}
                      Confirm Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowRejectInput(true)}
                      disabled={submitting !== null}
                      className="px-3 py-2 border border-red-900 hover:border-red-700 text-red-400 hover:text-red-300 text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <XIcon className="w-3 h-3" /> Reject
                    </button>
                    <div className="flex-1" />
                    {canvasDestination ? (
                      <button
                        onClick={() => handleApprove(true)}
                        disabled={submitting !== null}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {submitting === 'queue' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve &amp; Queue for {canvasDestination}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApprove(false)}
                        disabled={submitting !== null}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {submitting === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve &amp; Save
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// ArtifactReader — Claude-style content renderer
// ═════════════════════════════════════════════════════════════════════════
// Renders artifact content_json intelligently:
//   - Strategy artifacts → labeled sections (Positioning, Objective, etc.)
//   - Posts / Emails     → primary body text + metadata pills
//   - Anything else      → primary text + key/value pills

function ArtifactReader({ content, primary, type }: { content: Record<string, unknown>; primary: string; type: string }) {
  // Specialised renderer for strategy artifacts which have structured fields
  if (type === 'strategy' || content.positioning || content.objective) {
    return <StrategyReader content={content} />
  }
  return <GenericReader content={content} primary={primary} />
}

function StrategyReader({ content }: { content: Record<string, unknown> }) {
  const sections: Array<{ label: string; key: string }> = [
    { label: 'Positioning',         key: 'positioning' },
    { label: '30-Day Objective',    key: 'objective' },
    { label: 'Unique Value Prop',   key: 'uvp' },
    { label: 'Ideal Customer (ICP)',key: 'icp' },
  ]
  const kpis = Array.isArray(content.kpis) ? content.kpis as Array<Record<string, unknown>> : []
  const pillars = Array.isArray(content.pillars) ? content.pillars as string[] : []
  const channels = Array.isArray(content.channels) ? content.channels as Array<Record<string, unknown>> : []
  const tactics = Array.isArray(content.tactics) ? content.tactics as string[] : []

  return (
    <div className="space-y-5 text-gray-200">
      {sections.map(s => {
        const val = content[s.key]
        if (typeof val !== 'string' || !val) return null
        return (
          <div key={s.key}>
            <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">{s.label}</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{val}</p>
          </div>
        )
      })}

      {kpis.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-2">KPIs</p>
          <div className="space-y-1.5">
            {kpis.map((kpi, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
                <p className="text-white font-medium">{String(kpi.name || kpi.metric || `KPI ${i + 1}`)}</p>
                <p className="text-gray-500 mt-0.5">
                  Target: <span className="text-emerald-400">{String(kpi.target ?? '—')}</span>
                  {kpi.actual !== undefined && (
                    <> · Actual: <span className="text-gray-300">{String(kpi.actual ?? '—')}</span></>
                  )}
                  {!!kpi.timeframe && <> · {String(kpi.timeframe)}</>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pillars.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-2">Content Pillars</p>
          <div className="flex flex-wrap gap-1.5">
            {pillars.map((p, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-800 text-indigo-300 text-xs">{p}</span>
            ))}
          </div>
        </div>
      )}

      {channels.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-2">Channel Strategy</p>
          <div className="space-y-1.5">
            {channels.map((ch, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
                <p className="text-white font-medium">{String(ch.name || `Channel ${i + 1}`)}</p>
                {!!ch.frequency && <p className="text-gray-500 mt-0.5">Frequency: {String(ch.frequency)}</p>}
                {!!ch.purpose && <p className="text-gray-400 mt-0.5">{String(ch.purpose)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tactics.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-2">Tactics</p>
          <ul className="space-y-1.5 text-sm">
            {tactics.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-indigo-400 flex-shrink-0">{i + 1}.</span>
                <span className="text-gray-300">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function GenericReader({ content, primary }: { content: Record<string, unknown>; primary: string }) {
  // Pull out any non-primary scalar fields to show as metadata pills
  const PRIMARY = new Set(['copy', 'body', 'content', 'text', 'description', 'message', 'headline', 'positioning'])
  const metadata = Object.entries(content)
    .filter(([k, v]) => !PRIMARY.has(k) && v != null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .slice(0, 10)

  return (
    <div className="space-y-4 text-gray-200">
      {/* Primary content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-gray-200 break-words">
          {primary || <span className="text-gray-500 italic">No primary content</span>}
        </pre>
      </div>

      {/* Metadata pills */}
      {metadata.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Metadata</p>
          <div className="flex flex-wrap gap-1.5">
            {metadata.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[11px]"
              >
                <span className="text-gray-500">{k}:</span>
                <span className="text-gray-300 truncate max-w-[200px]">{String(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// TaskBoard — live-polling autonomous execution view
// ═════════════════════════════════════════════════════════════════════════
//
// Replaces the flat artifact list in the middle panel when the selected
// initiative has an approved strategy. Polls /api/project-tasks every 2s
// until every task has hit a terminal state (completed | failed), then
// stops to save battery + DB cycles.

type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed'

interface ProjectTaskRow {
  id: string
  workspace_id: string
  initiative_run_id: string
  parent_artifact_id: string
  task_index: number
  agent: string
  task_type: string
  task_brief: string
  status: TaskStatus
  agent_run_id: string | null
  produced_artifact_id: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  produced_artifact_title: string | null
  produced_artifact_type: string | null
  produced_artifact_status: string | null
}

interface TaskCounts {
  total: number
  pending: number
  queued: number
  running: number
  completed: number
  failed: number
}

interface TaskBoardProps {
  workspaceId: string
  initiativeRunId: string
  strategyArtifact: ArtifactRow
  selectedArtifactId: string | null
  onSelectArtifact: (artifactId: string) => void
}

// Maps task.agent slug → Lucide icon (reuses iconForType conceptually but
// for agent slugs not artifact types)
function iconForAgent(agent: string) {
  const a = agent.toLowerCase()
  if (a === 'social' || a === 'copywriter' || a === 'content') return MessageSquare
  if (a === 'email') return Mail
  if (a === 'blog') return FileText
  if (a === 'ads' || a === 'pr') return Megaphone
  if (a === 'video') return Video
  if (a === 'creative') return ImageIcon
  return FileText
}

// Status pill styling — color-coded per TaskStatus
const TASK_STATUS_PILL: Record<TaskStatus, { bg: string; text: string; border: string; label: string; pulse?: boolean }> = {
  pending:   { bg: 'bg-gray-800',         text: 'text-gray-400',    border: 'border-gray-700',    label: 'Pending' },
  queued:    { bg: 'bg-blue-950/40',      text: 'text-blue-300',    border: 'border-blue-700/60', label: 'Queued' },
  running:   { bg: 'bg-yellow-950/40',    text: 'text-yellow-300',  border: 'border-yellow-700',  label: 'Running', pulse: true },
  completed: { bg: 'bg-emerald-950/40',   text: 'text-emerald-300', border: 'border-emerald-700', label: 'Completed' },
  failed:    { bg: 'bg-red-950/40',       text: 'text-red-300',     border: 'border-red-700',     label: 'Failed' },
}

function TaskBoard({
  workspaceId,
  initiativeRunId,
  strategyArtifact,
  selectedArtifactId,
  onSelectArtifact,
}: TaskBoardProps) {
  const [tasks, setTasks] = useState<ProjectTaskRow[]>([])
  const [counts, setCounts] = useState<TaskCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Track when we last polled so the UI can show a "live · just refreshed" indicator
  const [lastPoll, setLastPoll] = useState<number>(0)

  // ─── Fetch tasks ───────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/project-tasks?workspaceId=${workspaceId}&initiativeRunId=${initiativeRunId}`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json() as { tasks: ProjectTaskRow[]; counts: TaskCounts }
      setTasks(Array.isArray(data.tasks) ? data.tasks : [])
      setCounts(data.counts || null)
      setError(null)
      setLastPoll(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, initiativeRunId])

  // Initial fetch on mount / initiative change
  useEffect(() => {
    setLoading(true)
    setTasks([])
    setCounts(null)
    setError(null)
    void fetchTasks()
  }, [fetchTasks])

  // ─── Active polling — every 2s while there's in-flight work ───────
  //
  // Polling stops automatically when every task is in a terminal state
  // (completed | failed). It also stops if counts.total is 0 AND we've
  // been polling for more than 60s (decomposition probably failed —
  // user can click Retry below).
  const isPollingActive = useMemo(() => {
    if (!counts) return true  // still loading first response
    const stillRunning = counts.pending + counts.queued + counts.running > 0
    return stillRunning
  }, [counts])

  useEffect(() => {
    if (!isPollingActive) return
    const interval = setInterval(() => { void fetchTasks() }, 2000)
    return () => clearInterval(interval)
  }, [isPollingActive, fetchTasks])

  // ─── Retry decomposition (when 0 tasks after a while) ─────────────
  const [retrying, setRetrying] = useState(false)
  const handleRetryDecomposition = useCallback(async () => {
    setRetrying(true)
    try {
      // Clear existing (empty) tasks first, then re-trigger.
      await fetch(`/api/project-tasks?workspaceId=${workspaceId}&parentArtifactId=${strategyArtifact.id}`, { method: 'DELETE' })
      await fetch('/api/agents/decompose-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, artifactId: strategyArtifact.id }),
      })
      await fetchTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }, [workspaceId, strategyArtifact.id, fetchTasks])

  // ─── Render ───────────────────────────────────────────────────────
  const completedCount = counts?.completed ?? 0
  const runningCount = counts?.running ?? 0
  const totalCount = counts?.total ?? 0
  const failedCount = counts?.failed ?? 0
  const allDone = totalCount > 0 && completedCount + failedCount === totalCount

  return (
    <section className="w-[360px] flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950 min-w-0">
      {/* Header — board summary + live indicator */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-0.5">
          <ListChecks className="w-3.5 h-3.5 text-indigo-400" />
          <p className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold">Autonomous Task Board</p>
          {isPollingActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-950/50 border border-yellow-800 text-yellow-300 text-[9px] font-semibold uppercase tracking-wider">
              <span className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
              Live
            </span>
          )}
          {allDone && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-[9px] font-semibold uppercase tracking-wider">
              <Check className="w-2 h-2" /> Done
            </span>
          )}
        </div>
        <p className="text-sm text-white font-medium">
          {loading
            ? <span className="flex items-center gap-1.5 text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading tasks…</span>
            : totalCount === 0
              ? <span className="text-gray-400">Awaiting decomposition…</span>
              : (
                <span>
                  {completedCount} of {totalCount} done
                  {runningCount > 0 && <span className="text-yellow-400 ml-1.5">· {runningCount} running</span>}
                  {failedCount > 0 && <span className="text-red-400 ml-1.5">· {failedCount} failed</span>}
                </span>
              )
          }
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={strategyArtifact.title}>
          From: {strategyArtifact.title}
        </p>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {/* Error state */}
        {error && (
          <div className="m-2 p-3 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Decomposing in progress (no tasks yet) */}
        {!loading && !error && totalCount === 0 && (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2">✨</div>
            <p className="text-gray-300 text-xs font-medium">Decomposing strategy…</p>
            <p className="text-gray-500 text-[11px] mt-1 leading-relaxed max-w-[220px] mx-auto">
              The CMO is breaking your approved strategy into concrete execution tasks. This usually takes ~10 seconds.
            </p>
            <button
              onClick={handleRetryDecomposition}
              disabled={retrying}
              className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {retrying ? 'Retrying…' : 'Retry decomposition'}
            </button>
          </div>
        )}

        {/* Live task rows */}
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const Icon = iconForAgent(task.agent)
            const pill = TASK_STATUS_PILL[task.status] || TASK_STATUS_PILL.pending
            const isCompleted = task.status === 'completed' && task.produced_artifact_id
            const isFailed = task.status === 'failed'
            const isSelected = !!task.produced_artifact_id && task.produced_artifact_id === selectedArtifactId
            const durationMs = task.started_at && task.completed_at
              ? new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()
              : null

            return (
              <div
                key={task.id}
                className={`px-3 py-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-indigo-950/60 border-indigo-700 ring-1 ring-indigo-700/40'
                    : isFailed
                      ? 'bg-red-950/20 border-red-900/50'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    task.status === 'running'  ? 'text-yellow-300'
                    : task.status === 'completed' ? 'text-emerald-300'
                    : task.status === 'failed'   ? 'text-red-400'
                    : 'text-gray-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    {/* Top row: agent + status pill */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{task.agent}</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-[10px] text-gray-500 capitalize truncate">{task.task_type.replace(/_/g, ' ')}</span>
                      <span
                        className={`ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold flex items-center gap-1 ${pill.bg} ${pill.text} ${pill.border}`}
                      >
                        {pill.pulse && <span className="w-1 h-1 rounded-full bg-current animate-pulse" />}
                        {pill.label}
                      </span>
                    </div>

                    {/* Brief excerpt */}
                    <p className="text-xs text-gray-300 leading-snug line-clamp-2">{task.task_brief}</p>

                    {/* Failure details */}
                    {isFailed && task.error_message && (
                      <p className="text-[10px] text-red-400 mt-1.5 leading-snug line-clamp-2" title={task.error_message}>
                        ⚠ {task.error_message}
                      </p>
                    )}

                    {/* Completed: View asset CTA + duration */}
                    {isCompleted && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => task.produced_artifact_id && onSelectArtifact(task.produced_artifact_id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                            isSelected
                              ? 'bg-indigo-700 text-white'
                              : 'bg-indigo-950/60 text-indigo-300 hover:bg-indigo-950 hover:text-indigo-200 border border-indigo-800'
                          }`}
                        >
                          <span>View asset</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        {durationMs != null && (
                          <span className="text-[10px] text-gray-600">
                            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                          </span>
                        )}
                        {task.produced_artifact_title && (
                          <span className="text-[10px] text-gray-500 truncate flex-1" title={task.produced_artifact_title}>
                            → {task.produced_artifact_title}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Running: show elapsed time */}
                    {task.status === 'running' && task.started_at && (
                      <p className="text-[10px] text-yellow-400/70 mt-1.5 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Started {timeAgo(task.started_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer — last poll timestamp + manual refresh */}
      {totalCount > 0 && (
        <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-600">
          <span>
            {lastPoll
              ? `Last poll ${timeAgo(new Date(lastPoll).toISOString())}`
              : '—'}
          </span>
          <button
            onClick={() => void fetchTasks()}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      )}
    </section>
  )
}
