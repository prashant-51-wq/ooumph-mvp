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

// ── Mock Data ──────────────────────────────────────────────────────────────────

function minsAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000)
}

const MOCK_EVENTS: ActivityEvent[] = [
  {
    id: 'e1',
    timestamp: minsAgo(2),
    actor: 'CMO Agent',
    actorType: 'agent',
    actorInitials: 'AI',
    actorColor: 'bg-indigo-600',
    eventType: 'agent',
    severity: 'success',
    icon: '🤖',
    title: 'Generated Q2 marketing strategy document',
    description: '14-section strategy deck with competitive analysis and budget allocation',
    tokens: 1240,
    cost: 0.004,
    duration: 3.2,
    details: 'Full output: Q2 Strategy Doc — Sections: Executive Summary, Market Analysis, Competitive Landscape, Target Personas, Channel Strategy, Budget Allocation, KPIs, 90-Day Roadmap...',
  },
  {
    id: 'e2',
    timestamp: minsAgo(4),
    actor: 'Sarah Chen',
    actorType: 'user',
    actorInitials: 'SC',
    actorColor: 'bg-pink-600',
    eventType: 'approval',
    severity: 'success',
    icon: '✅',
    title: 'Approved LinkedIn post #47 — "Why AI is changing marketing"',
    description: 'Content approved and queued for publishing',
  },
  {
    id: 'e3',
    timestamp: minsAgo(6),
    actor: 'Content Agent',
    actorType: 'agent',
    actorInitials: 'CA',
    actorColor: 'bg-blue-600',
    eventType: 'content',
    severity: 'success',
    icon: '📅',
    title: 'Scheduled 5 social posts for next week',
    description: 'Instagram (2), LinkedIn (2), Twitter (1) — Mon–Wed schedule',
    tokens: 880,
    cost: 0.003,
    duration: 2.1,
  },
  {
    id: 'e4',
    timestamp: minsAgo(9),
    actor: 'Email Agent',
    actorType: 'agent',
    actorInitials: 'EA',
    actorColor: 'bg-yellow-600',
    eventType: 'campaign',
    severity: 'success',
    icon: '📧',
    title: 'Email campaign "May Newsletter" sent to 3,420 subscribers',
    description: 'Open rate: 28.4% · Click rate: 6.2% · Bounces: 12',
    platform: 'Mailchimp',
  },
  {
    id: 'e5',
    timestamp: minsAgo(12),
    actor: 'Marcus Rivera',
    actorType: 'user',
    actorInitials: 'MR',
    actorColor: 'bg-green-600',
    eventType: 'user',
    severity: 'info',
    icon: '👤',
    title: 'Marcus Rivera logged in',
    description: 'IP: 192.168.1.42 · Browser: Chrome 124 · Location: New York, US',
  },
  {
    id: 'e6',
    timestamp: minsAgo(15),
    actor: 'Leads Agent',
    actorType: 'agent',
    actorInitials: 'LA',
    actorColor: 'bg-orange-600',
    eventType: 'leads',
    severity: 'success',
    icon: '🎯',
    title: 'Imported 142 leads from LinkedIn Sales Navigator',
    description: 'Enriched with company data, scored, and added to CRM pipeline',
    tokens: 2100,
    cost: 0.008,
    duration: 8.4,
  },
  {
    id: 'e7',
    timestamp: minsAgo(18),
    actor: 'Analytics Agent',
    actorType: 'agent',
    actorInitials: 'AA',
    actorColor: 'bg-cyan-600',
    eventType: 'agent',
    severity: 'success',
    icon: '📊',
    title: 'Weekly performance report generated',
    description: 'Covers: social reach, email metrics, lead velocity, conversion funnel',
    tokens: 1560,
    cost: 0.006,
    duration: 4.7,
  },
  {
    id: 'e8',
    timestamp: minsAgo(22),
    actor: 'System',
    actorType: 'agent',
    actorInitials: 'SY',
    actorColor: 'bg-gray-600',
    eventType: 'system',
    severity: 'warning',
    icon: '⚙',
    title: 'OpenAI API key rotated',
    description: 'Previous key expired. New key stored with AES-256 encryption.',
    flagged: true,
  },
  {
    id: 'e9',
    timestamp: minsAgo(25),
    actor: 'Ads Agent',
    actorType: 'agent',
    actorInitials: 'AD',
    actorColor: 'bg-red-600',
    eventType: 'campaign',
    severity: 'success',
    icon: '🎯',
    title: 'Google Ads campaign "SaaS Summer" launched',
    description: 'Budget: $2,000/mo · Target: SaaS decision-makers · 8 ad groups',
    platform: 'Google Ads',
  },
  {
    id: 'e10',
    timestamp: minsAgo(28),
    actor: 'Sarah Chen',
    actorType: 'user',
    actorInitials: 'SC',
    actorColor: 'bg-pink-600',
    eventType: 'system',
    severity: 'info',
    icon: '⚙',
    title: 'Workspace settings updated',
    description: 'Changed: default AI model → claude-sonnet-4-5, auto-publish threshold → 90%',
  },
  {
    id: 'e11',
    timestamp: minsAgo(31),
    actor: 'Creative Agent',
    actorType: 'agent',
    actorInitials: 'CR',
    actorColor: 'bg-pink-500',
    eventType: 'content',
    severity: 'error',
    icon: '🎨',
    title: 'Failed to generate banner image — Canva API timeout',
    description: 'Retry scheduled in 5 minutes. Error: ETIMEDOUT after 30s',
    flagged: true,
  },
  {
    id: 'e12',
    timestamp: minsAgo(35),
    actor: 'Content Agent',
    actorType: 'agent',
    actorInitials: 'CA',
    actorColor: 'bg-blue-600',
    eventType: 'content',
    severity: 'success',
    icon: '📤',
    title: 'Blog post published to WordPress: "10 AI Tools for Marketers in 2026"',
    description: '2,400 words · SEO score: 87 · Featured image attached',
    platform: 'WordPress',
    tokens: 3200,
    cost: 0.012,
    duration: 6.1,
  },
  {
    id: 'e13',
    timestamp: minsAgo(38),
    actor: 'Funnel Agent',
    actorType: 'agent',
    actorInitials: 'FA',
    actorColor: 'bg-purple-600',
    eventType: 'leads',
    severity: 'success',
    icon: '👥',
    title: '38 new contacts added from webinar registration form',
    description: 'Auto-tagged: webinar-may-2026, top-of-funnel · Pipeline stage: MQL',
  },
  {
    id: 'e14',
    timestamp: minsAgo(42),
    actor: 'System',
    actorType: 'agent',
    actorInitials: 'SY',
    actorColor: 'bg-gray-600',
    eventType: 'system',
    severity: 'info',
    icon: '💳',
    title: 'Subscription payment processed — Pro Plan $299/mo',
    description: 'Card ending 4242 · Invoice #INV-2026-0528 · Next billing: Jun 26',
  },
  {
    id: 'e15',
    timestamp: minsAgo(47),
    actor: 'Marcus Rivera',
    actorType: 'user',
    actorInitials: 'MR',
    actorColor: 'bg-green-600',
    eventType: 'approval',
    severity: 'warning',
    icon: '✅',
    title: 'Rejected email draft "Flash Sale — 40% Off" — requested revisions',
    description: 'Feedback: "Tone too aggressive, soften the urgency. Add testimonial."',
    flagged: true,
  },
  {
    id: 'e16',
    timestamp: minsAgo(51),
    actor: 'Research Agent',
    actorType: 'agent',
    actorInitials: 'RA',
    actorColor: 'bg-teal-600',
    eventType: 'agent',
    severity: 'success',
    icon: '🔍',
    title: 'Competitor analysis complete — 6 brands benchmarked',
    description: 'Analyzed: HubSpot, Marketo, ActiveCampaign, Klaviyo, Brevo, Mailchimp',
    tokens: 4800,
    cost: 0.018,
    duration: 12.3,
  },
  {
    id: 'e17',
    timestamp: minsAgo(55),
    actor: 'Growth Agent',
    actorType: 'agent',
    actorInitials: 'GA',
    actorColor: 'bg-green-500',
    eventType: 'campaign',
    severity: 'success',
    icon: '📈',
    title: 'A/B test launched — landing page headline variants (3 variants)',
    description: 'Traffic split: 33% each · Goal: form submission · Duration: 14 days',
    platform: 'Landing Page',
  },
  {
    id: 'e18',
    timestamp: minsAgo(61),
    actor: 'System',
    actorType: 'agent',
    actorInitials: 'SY',
    actorColor: 'bg-gray-600',
    eventType: 'system',
    severity: 'warning',
    icon: '🔔',
    title: 'Alert: Lead velocity dropped 18% this week',
    description: 'Threshold: -15% week-over-week. CMO Agent notified for analysis.',
    flagged: true,
  },
  {
    id: 'e19',
    timestamp: minsAgo(68),
    actor: 'PR Agent',
    actorType: 'agent',
    actorInitials: 'PR',
    actorColor: 'bg-amber-600',
    eventType: 'content',
    severity: 'success',
    icon: '📰',
    title: 'Press release drafted: "Ooumph raises $2M seed round"',
    description: '680 words · Submitted to 3 distribution services',
    tokens: 920,
    cost: 0.003,
    duration: 2.8,
  },
  {
    id: 'e20',
    timestamp: minsAgo(72),
    actor: 'Sarah Chen',
    actorType: 'user',
    actorInitials: 'SC',
    actorColor: 'bg-pink-600',
    eventType: 'user',
    severity: 'info',
    icon: '🔑',
    title: 'New API key added for HubSpot CRM integration',
    description: 'Key masked after save. Permissions: contacts:read, contacts:write, deals:read',
  },
  {
    id: 'e21',
    timestamp: minsAgo(78),
    actor: 'Email Agent',
    actorType: 'agent',
    actorInitials: 'EA',
    actorColor: 'bg-yellow-600',
    eventType: 'campaign',
    severity: 'success',
    icon: '📧',
    title: 'Drip sequence "Onboarding Flow v2" activated for 89 new users',
    description: '7-email sequence over 14 days. Day 1 sent immediately.',
    platform: 'Klaviyo',
  },
  {
    id: 'e22',
    timestamp: minsAgo(84),
    actor: 'Blog Agent',
    actorType: 'agent',
    actorInitials: 'BA',
    actorColor: 'bg-violet-600',
    eventType: 'content',
    severity: 'success',
    icon: '✍️',
    title: 'Generated 3 blog outlines for approval queue',
    description: 'Topics: AI Marketing ROI, Prompt Engineering for CMOs, ABM in 2026',
    tokens: 1100,
    cost: 0.004,
    duration: 3.6,
  },
  {
    id: 'e23',
    timestamp: minsAgo(91),
    actor: 'Leads Agent',
    actorType: 'agent',
    actorInitials: 'LA',
    actorColor: 'bg-orange-600',
    eventType: 'leads',
    severity: 'error',
    icon: '🎯',
    title: 'Failed to enrich 7 contacts — email validation error',
    description: 'Affected: 7 of 142 imported leads. Hunter.io returned invalid format.',
    flagged: true,
  },
  {
    id: 'e24',
    timestamp: minsAgo(98),
    actor: 'CMO Agent',
    actorType: 'agent',
    actorInitials: 'AI',
    actorColor: 'bg-indigo-600',
    eventType: 'agent',
    severity: 'success',
    icon: '🤖',
    title: 'Monthly KPI dashboard prepared and sent to team',
    description: 'MRR: $24,800 | MoM growth: +12% | CAC: $142 | LTV: $2,840',
    tokens: 680,
    cost: 0.002,
    duration: 1.9,
  },
  {
    id: 'e25',
    timestamp: minsAgo(110),
    actor: 'Marcus Rivera',
    actorType: 'user',
    actorInitials: 'MR',
    actorColor: 'bg-green-600',
    eventType: 'campaign',
    severity: 'info',
    icon: '🎯',
    title: 'Campaign "Spring Promo" paused manually',
    description: 'Reason: Budget exhausted. Remaining impressions: 12,400 saved for next cycle.',
    platform: 'Google Ads',
  },
]

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

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>(MOCK_EVENTS)
  const [search, setSearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>([])
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all')
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [actorFilter, setActorFilter] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(
    new Set(MOCK_EVENTS.filter(e => e.flagged).map(e => e.id))
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(15)
  const [tick, setTick] = useState(0)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

          {filteredEvents.length === 0 && (
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
