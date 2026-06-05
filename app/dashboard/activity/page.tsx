'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType = 'agent' | 'user' | 'content' | 'campaign' | 'approval' | 'leads' | 'error' | 'system'
type Severity = 'info' | 'success' | 'warning' | 'error'
type DateRange = 'today' | '7d' | '30d' | 'custom'

interface ActivityEvent {
  id: string
  timestamp: Date
  actor: string
  actorType: 'agent' | 'user'
  actorInitials: string
  actorColor: string
  eventType: EventType
  severity: Severity
  icon: string
  title: string
  description?: string
  tokens?: number
  cost?: number
  duration?: number
  platform?: string
  details?: string
  flagged?: boolean
  expanded?: boolean
}

// Sprint 3C: removed MOCK_EVENTS — a ~365-line array of fake activity rows
// (declared but never referenced anywhere). The `events` state is hydrated
// from the real /api/agent-runs + /api/approvals + /api/notifications merge
// later in this file; this constant was a Sprint 0 holdover that became
// dead code once the real merge shipped. Also dropped the `minsAgo` helper
// which was used only by MOCK_EVENTS.


// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const BORDER_COLOR: Record<Severity, string> = {
  info: 'border-l-blue-500',
  success: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  error: 'border-l-red-500',
}

const SEVERITY_BADGE: Record<Severity, string> = {
  info: 'bg-blue-900/40 text-blue-400 border-blue-800',
  success: 'bg-green-900/40 text-green-400 border-green-800',
  warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  error: 'bg-red-900/40 text-red-400 border-red-800',
}

const TYPE_LABELS: Record<EventType, string> = {
  agent: 'Agent Actions',
  user: 'User Actions',
  content: 'Content',
  campaign: 'Campaigns',
  approval: 'Approvals',
  leads: 'Leads',
  error: 'Errors',
  system: 'System',
}

const ALL_TYPES: EventType[] = ['agent', 'user', 'content', 'campaign', 'approval', 'leads', 'error', 'system']

// Heatmap data — events per hour (0–23)
const HEATMAP = [0, 0, 1, 0, 0, 2, 3, 5, 8, 12, 9, 7, 6, 10, 11, 8, 5, 4, 3, 6, 9, 7, 4, 2]
const MAX_HEAT = Math.max(...HEATMAP)

// ── Component ──────────────────────────────────────────────────────────────────

// Map agent name → emoji icon
const AGENT_ICONS: Record<string, string> = {
  cmo: '🤖', strategy: '📊', content: '✍', branding: '🎨', creative: '🖼',
  growth: '📈', sales: '💼', research: '🔍', email: '📧', publish: '📤',
  funnel: '🔻', leads: '👥', scheduling: '📅', voiceover: '🎙', video: '🎬',
  brand_monitor: '👁', reputation: '⭐', inbox: '💬', analytics: '📉',
  workflow: '⚙', notify: '🔔', pr: '📰', ads: '📢', repurpose: '♻',
}

function pickAgentIcon(name: string): string {
  const key = name.toLowerCase().replace(/_/g, '_')
  for (const k of Object.keys(AGENT_ICONS)) {
    if (key.includes(k)) return AGENT_ICONS[k]
  }
  return '🤖'
}

function pickAgentColor(name: string): string {
  const colors = ['bg-indigo-600', 'bg-purple-600', 'bg-pink-600', 'bg-blue-600', 'bg-teal-600', 'bg-green-600', 'bg-orange-600', 'bg-red-600']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]
}

function timeFromIso(iso: string | Date): Date {
  if (iso instanceof Date) return iso
  return new Date(iso)
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>([])
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all')
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [actorFilter, setActorFilter] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(15)
  const [tick, setTick] = useState(0)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch real activity events from multiple sources
  const loadActivity = useCallback(async () => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) { setLoading(false); return }
    try {
      const [runsRes, approvalsRes, notifsRes] = await Promise.all([
        fetch(`/api/agent-runs?workspaceId=${wid}&limit=50`),
        fetch(`/api/approvals?workspaceId=${wid}`),
        fetch(`/api/notifications?workspaceId=${wid}`),
      ])

      const merged: ActivityEvent[] = []

      // Agent runs → events
      if (runsRes.ok) {
        const runs = await runsRes.json() as Array<{
          id: string
          workspace_id: string
          agent_name: string
          status: string
          cost_estimate?: number
          input_json?: string
          output_json?: string
          error_message?: string
          created_at: string
          completed_at?: string
        }>
        for (const r of (Array.isArray(runs) ? runs : [])) {
          const sev: Severity = r.status === 'failed' ? 'error' : r.status === 'running' ? 'info' : 'success'
          const title =
            r.status === 'running' ? `${r.agent_name} is running`
            : r.status === 'failed' ? `${r.agent_name} failed`
            : `${r.agent_name} completed task`
          let duration: number | undefined
          if (r.completed_at && r.created_at) {
            duration = (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 1000
          }
          merged.push({
            id: `run-${r.id}`,
            timestamp: timeFromIso(r.created_at),
            actor: r.agent_name,
            actorType: 'agent',
            actorInitials: 'AI',
            actorColor: pickAgentColor(r.agent_name),
            eventType: r.status === 'failed' ? 'error' : 'agent',
            severity: sev,
            icon: pickAgentIcon(r.agent_name),
            title,
            description: r.error_message || undefined,
            cost: r.cost_estimate || undefined,
            duration,
            details: r.error_message
              ? `Error: ${r.error_message}`
              : r.output_json
                ? `Output:\n${String(r.output_json).slice(0, 600)}`
                : undefined,
          })
        }
      }

      // Approvals → events
      if (approvalsRes.ok) {
        const approvals = await approvalsRes.json() as Array<{
          id: string
          status: string
          notes?: string
          title?: string
          artifact_type?: string
          created_at: string
          updated_at?: string
        }>
        for (const a of (Array.isArray(approvals) ? approvals : [])) {
          const sev: Severity = a.status === 'rejected' ? 'warning' : a.status === 'approved' ? 'success' : 'info'
          const title =
            a.status === 'pending' ? `Approval needed: ${a.title || a.artifact_type || 'artifact'}`
            : a.status === 'approved' ? `Approved: ${a.title || a.artifact_type || 'artifact'}`
            : a.status === 'rejected' ? `Rejected: ${a.title || a.artifact_type || 'artifact'}`
            : `${a.status}: ${a.title || a.artifact_type || 'artifact'}`
          merged.push({
            id: `apv-${a.id}`,
            timestamp: timeFromIso(a.updated_at || a.created_at),
            actor: 'Approvals',
            actorType: 'user',
            actorInitials: 'AP',
            actorColor: 'bg-yellow-600',
            eventType: 'approval',
            severity: sev,
            icon: a.status === 'approved' ? '✅' : a.status === 'rejected' ? '❌' : '⏳',
            title,
            description: a.notes || undefined,
          })
        }
      }

      // Notifications → events
      if (notifsRes.ok) {
        const data = await notifsRes.json()
        const notifs = (data?.items || []) as Array<{
          id: string
          type: string
          title: string
          body?: string
          severity: string
          created_at: string
        }>
        for (const n of notifs) {
          if (n.id.startsWith('run-') || n.id.startsWith('apv-')) continue // already added
          merged.push({
            id: `notif-${n.id}`,
            timestamp: timeFromIso(n.created_at),
            actor: 'System',
            actorType: 'user',
            actorInitials: 'SY',
            actorColor: 'bg-gray-600',
            eventType: 'system',
            severity: (n.severity as Severity) || 'info',
            icon: n.severity === 'error' ? '⚠' : n.severity === 'success' ? '✅' : 'ℹ',
            title: n.title,
            description: n.body,
          })
        }
      }

      // Sort by timestamp DESC
      merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      setEvents(merged)
    } catch (err) {
      console.error('[activity] load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial + on-tick refresh
  useEffect(() => { loadActivity() }, [loadActivity, tick])

  // Auto-refresh ticker
  useEffect(() => {
    if (autoRefresh) {
      refreshRef.current = setInterval(() => setTick(t => t + 1), 10000)
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [autoRefresh])

  const toggleType = (t: EventType) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleFlag = (id: string) => {
    setFlaggedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const resolveFlag = (id: string) => {
    setFlaggedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  const filteredEvents = events.filter(e => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) &&
        !e.actor.toLowerCase().includes(search.toLowerCase())) return false
    if (selectedTypes.length > 0 && !selectedTypes.includes(e.eventType)) return false
    if (selectedSeverity !== 'all' && e.severity !== selectedSeverity) return false
    if (actorFilter !== 'all') {
      if (actorFilter === 'agents' && e.actorType !== 'agent') return false
      if (actorFilter === 'users' && e.actorType !== 'user') return false
    }
    return true
  })

  const activeFilterCount =
    (search ? 1 : 0) +
    selectedTypes.length +
    (selectedSeverity !== 'all' ? 1 : 0) +
    (actorFilter !== 'all' ? 1 : 0)

  // Stats
  const today = events
  const agentActions = today.filter(e => e.actorType === 'agent').length
  const userActions = today.filter(e => e.actorType === 'user').length
  const errors = today.filter(e => e.severity === 'error').length
  const agentsActive = 6
  const costToday = today.reduce((s, e) => s + (e.cost || 0), 0)
  const errorRate = today.length ? ((errors / today.length) * 100).toFixed(1) : '0.0'

  // Top actors
  const actorCounts: Record<string, number> = {}
  today.forEach(e => { actorCounts[e.actor] = (actorCounts[e.actor] || 0) + 1 })
  const topActors = Object.entries(actorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Flagged events
  const flaggedEvents = events.filter(e => flaggedIds.has(e.id))

  const handleExport = () => {
    const csv = [
      'Time,Actor,Type,Severity,Event',
      ...filteredEvents.map(e =>
        `"${formatDate(e.timestamp)}","${e.actor}","${e.eventType}","${e.severity}","${e.title.replace(/"/g, '""')}"`
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'activity-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/60 border border-red-800 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 text-xs font-semibold">Live</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-indigo-900 border border-indigo-700 text-indigo-300 text-xs font-semibold rounded-full">
              {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              autoRefresh
                ? 'bg-green-900/30 border-green-800 text-green-400'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <span className={autoRefresh ? 'animate-spin' : ''} style={{ display: 'inline-block', animationDuration: '3s' }}>↻</span>
            Auto-refresh {autoRefresh ? 'On' : 'Off'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
          >
            ⬇ Export Activity Log
          </button>
        </div>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Events Today', value: today.length, color: 'text-white' },
          { label: 'AI Actions', value: agentActions, color: 'text-indigo-400' },
          { label: 'User Actions', value: userActions, color: 'text-blue-400' },
          { label: 'Errors', value: errors, color: errors > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Agents Active', value: agentsActive, color: 'text-green-400' },
          { label: 'Cost Today', value: `$${costToday.toFixed(3)}`, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Summary Widgets ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Heatmap */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Today's Activity Heatmap</p>
          <div className="flex items-end gap-0.5 h-12">
            {HEATMAP.map((count, hour) => (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full rounded-sm bg-indigo-600 transition-all"
                  style={{ height: `${MAX_HEAT > 0 ? (count / MAX_HEAT) * 44 : 2}px`, minHeight: count > 0 ? '3px' : '2px', opacity: count > 0 ? 0.4 + (count / MAX_HEAT) * 0.6 : 0.15 }}
                />
                <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  {hour}:00 — {count} events
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600 text-[10px]">12am</span>
            <span className="text-gray-600 text-[10px]">6am</span>
            <span className="text-gray-600 text-[10px]">12pm</span>
            <span className="text-gray-600 text-[10px]">6pm</span>
            <span className="text-gray-600 text-[10px]">11pm</span>
          </div>
        </div>

        {/* Top Actors + Error Rate */}
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Top Actors Today</p>
            <div className="space-y-2">
              {topActors.map(([actor, count], i) => {
                const ev = events.find(e => e.actor === actor)
                return (
                  <div key={actor} className="flex items-center gap-2">
                    <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                    <div className={`w-6 h-6 rounded-full ${ev?.actorColor || 'bg-gray-700'} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-[9px] font-bold">{ev?.actorInitials || '?'}</span>
                    </div>
                    <span className="text-gray-300 text-xs flex-1 truncate">{actor}</span>
                    <span className="text-indigo-400 text-xs font-semibold">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className={`bg-gray-900 border rounded-xl p-4 ${parseFloat(errorRate) > 5 ? 'border-red-800' : 'border-gray-800'}`}>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Error Rate</p>
            <p className={`text-2xl font-bold ${parseFloat(errorRate) > 5 ? 'text-red-400' : 'text-green-400'}`}>{errorRate}%</p>
            <p className="text-gray-600 text-xs mt-0.5">{errors} error{errors !== 1 ? 's' : ''} of {today.length} events</p>
          </div>
        </div>
      </div>

      {/* ── Main Layout ────────────────────────────────────────────────────── */}
      <div className="flex gap-4">
        {/* Timeline + Filters */}
        <div className="flex-1 min-w-0">
          {/* Filter Bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search events, actors..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setSearch(''); setSelectedTypes([]); setSelectedSeverity('all'); setActorFilter('all') }}
                  className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Type pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedTypes([])}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTypes.length === 0
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              {ALL_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedTypes.includes(t)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Row 2: actor + date + severity */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={actorFilter}
                onChange={e => setActorFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none"
              >
                <option value="all">All Actors</option>
                <option value="agents">Agents only</option>
                <option value="users">Users only</option>
              </select>

              <div className="flex gap-1">
                {(['today', '7d', '30d'] as DateRange[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setDateRange(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      dateRange === d
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {d === 'today' ? 'Today' : d === '7d' ? 'Last 7d' : 'Last 30d'}
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                {(['all', 'info', 'success', 'warning', 'error'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedSeverity(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedSeverity === s
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              <span className="ml-auto text-gray-500 text-xs">{filteredEvents.length} events</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-0">
            {filteredEvents.slice(0, visibleCount).map((event, idx) => {
              const isExpanded = expandedIds.has(event.id)
              const isFlagged = flaggedIds.has(event.id)
              const hasDetails = !!(event.tokens || event.details || event.platform)
              return (
                <div key={event.id} className="flex gap-4 group">
                  {/* Left: timestamp + actor */}
                  <div className="w-40 flex-shrink-0 pt-3 text-right">
                    <p className="text-gray-400 text-xs font-mono">{formatTime(event.timestamp)}</p>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <span className="text-gray-500 text-[10px] truncate max-w-[100px]">{event.actor}</span>
                      <div className={`w-5 h-5 rounded-full ${event.actorColor} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-[8px] font-bold">{event.actorInitials}</span>
                      </div>
                    </div>
                  </div>

                  {/* Connector */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-px bg-gray-800 flex-1" style={{ minHeight: '12px' }} />
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      event.severity === 'error' ? 'bg-red-500' :
                      event.severity === 'warning' ? 'bg-yellow-500' :
                      event.severity === 'success' ? 'bg-green-500' : 'bg-blue-500'
                    }`} />
                    <div className="w-px bg-gray-800 flex-1" />
                  </div>

                  {/* Right: event card */}
                  <div className={`flex-1 mb-2 bg-gray-900 border border-gray-800 border-l-2 ${BORDER_COLOR[event.severity]} rounded-r-xl rounded-bl-xl overflow-hidden`}>
                    <div className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base flex-shrink-0 mt-0.5">{event.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium">{event.title}</p>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${SEVERITY_BADGE[event.severity]}`}>
                              {event.severity}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 text-[10px]">
                              {TYPE_LABELS[event.eventType]}
                            </span>
                            {event.platform && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-400 text-[10px]">
                                {event.platform}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-gray-400 text-xs mt-1 leading-relaxed">{event.description}</p>
                          )}
                          {/* Token/cost line */}
                          {(event.tokens || event.cost || event.duration) && (
                            <p className="text-gray-600 text-xs mt-1 font-mono">
                              {event.tokens && `→ ${event.tokens.toLocaleString()} tokens`}
                              {event.cost && ` · $${event.cost.toFixed(3)}`}
                              {event.duration && ` · ${event.duration}s`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          {isFlagged && (
                            <span className="text-yellow-500 text-xs" title="Flagged for review">🚩</span>
                          )}
                          <button
                            onClick={() => toggleFlag(event.id)}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded-lg border ${
                              isFlagged
                                ? 'bg-yellow-900/30 border-yellow-800 text-yellow-400'
                                : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-yellow-400'
                            }`}
                          >
                            {isFlagged ? 'Unflag' : 'Flag'}
                          </button>
                          {hasDetails && (
                            <button
                              onClick={() => toggleExpand(event.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          )}
                          {event.eventType === 'agent' && event.severity === 'success' && (
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded-lg bg-indigo-900 border border-indigo-700 text-indigo-300 hover:text-white">
                              Deploy
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 bg-gray-950 rounded-lg p-3 border border-gray-800">
                          {event.details && (
                            <p className="text-gray-300 text-xs leading-relaxed mb-2">{event.details}</p>
                          )}
                          {event.tokens && (
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="text-gray-600 uppercase tracking-wider text-[10px] mb-0.5">Tokens</p>
                                <p className="text-white font-mono">{event.tokens.toLocaleString()}</p>
                              </div>
                              {event.cost && (
                                <div>
                                  <p className="text-gray-600 uppercase tracking-wider text-[10px] mb-0.5">Cost</p>
                                  <p className="text-white font-mono">${event.cost.toFixed(4)}</p>
                                </div>
                              )}
                              {event.duration && (
                                <div>
                                  <p className="text-gray-600 uppercase tracking-wider text-[10px] mb-0.5">Duration</p>
                                  <p className="text-white font-mono">{event.duration}s</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Load More */}
          {visibleCount < filteredEvents.length && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setVisibleCount(v => v + 15)}
                className="px-6 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
              >
                Load More ({filteredEvents.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="w-6 h-6 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading activity…</p>
            </div>
          )}
          {!loading && events.length === 0 && (
            <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="text-4xl mb-2">🌙</div>
              <p className="text-gray-300 text-sm font-medium">No activity yet</p>
              <p className="text-gray-500 text-xs mt-1 max-w-sm mx-auto">
                Your workspace is brand new. When agents run, approvals happen, or content gets published, you&apos;ll see it here.
              </p>
            </div>
          )}
          {!loading && events.length > 0 && filteredEvents.length === 0 && (
            <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-gray-500 text-sm">No events match your filters</p>
              <button
                onClick={() => { setSearch(''); setSelectedTypes([]); setSelectedSeverity('all'); setActorFilter('all') }}
                className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* ── Flagged Items Panel ─────────────────────────────────────────── */}
        <div className={`flex-shrink-0 transition-all ${sidebarCollapsed ? 'w-8' : 'w-64'}`}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden sticky top-4">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <span className="text-yellow-500 text-sm">🚩</span>
                  <p className="text-white text-xs font-semibold">Flagged Items</p>
                  {flaggedEvents.length > 0 && (
                    <span className="bg-yellow-900 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                      {flaggedEvents.length}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(v => !v)}
                className="text-gray-500 hover:text-white text-xs transition-colors ml-auto"
              >
                {sidebarCollapsed ? '◀' : '▶'}
              </button>
            </div>

            {!sidebarCollapsed && (
              <div className="p-3">
                {flaggedEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-green-400 text-sm">✅</p>
                    <p className="text-gray-500 text-xs mt-1">No flagged items</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {flaggedEvents.map(e => (
                      <div key={e.id} className="bg-gray-950 border border-gray-800 rounded-lg p-2.5">
                        <p className="text-gray-300 text-xs font-medium leading-snug line-clamp-2">{e.title}</p>
                        <p className="text-gray-600 text-[10px] mt-1">{formatDate(e.timestamp)}</p>
                        <button
                          onClick={() => resolveFlag(e.id)}
                          className="mt-2 w-full px-2 py-1 bg-green-900/30 border border-green-800 text-green-400 text-[10px] rounded-lg font-medium hover:bg-green-900/50 transition-colors"
                        >
                          Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
