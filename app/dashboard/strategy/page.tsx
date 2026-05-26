'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentStream } from '@/lib/use-agent-stream'
import AgentConsole from '@/components/AgentConsole'
import ReviewRequiredModal from '@/components/ReviewRequiredModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type Timeframe = 'daily' | 'weekly' | 'monthly'

interface KPI {
  metric: string
  target: number
  actual: number
  unit: string
}

interface StrategyVersion {
  id: string
  version: number
  timeframe: Timeframe
  generatedAt: string
  performanceScore: number
  summary: string
}

interface StrategyProject {
  id: string
  name: string
  description: string
  timeframe: Timeframe
  status: 'planning' | 'active' | 'completed'
  performanceScore: number
  startDate: string
  team: string[]
  kpis: KPI[]
}

interface StrategyCard {
  id: string
  timeframe: Timeframe
  version: number
  generatedAt: string
  performanceScore: number
  positioning: string
  objective: string
  kpis: KPI[]
  tactics: string[]
  channels: string[]
}

interface ArtifactRow {
  id: string
  workspace_id: string
  type: string
  title: string
  content_json: unknown
  status: string
  created_at: string
}

// ─── AI shape returned by /api/agents/strategy ─────────────────────────────────

interface AIStrategy {
  positioning?: string
  uniqueValueProposition?: string
  thirtyDayObjective?: string
  icp?: {
    demographics?: string
    psychographics?: string
    painPoints?: string[]
    buyingTriggers?: string[]
    objections?: string[]
  }
  contentPillars?: Array<{ name?: string; description?: string; topics?: string[] }>
  kpis?: Array<{ metric: string; target: string; timeframe: string }>
  channelStrategy?: Array<{ channel: string; frequency?: string; contentType?: string }>
  // Optional metadata (we set this when saving locally)
  _timeframe?: Timeframe
}

// ─── Default empty card ───────────────────────────────────────────────────────

const EMPTY_CARD = (tf: Timeframe): StrategyCard => ({
  id: `empty-${tf}`,
  timeframe: tf,
  version: 0,
  generatedAt: new Date().toISOString(),
  performanceScore: 0,
  positioning: '',
  objective: '',
  kpis: [],
  tactics: [],
  channels: [],
})

// ─── Convert AI shape → display card ──────────────────────────────────────────

function parseTargetNumber(target: string): { value: number; unit: string } {
  if (!target) return { value: 0, unit: '' }
  const trimmed = String(target).trim()
  const m = trimmed.match(/^([$₹€£]?)\s*([0-9.,]+)\s*([a-zA-Z%]*)/)
  if (!m) return { value: 0, unit: '' }
  const prefix = m[1] || ''
  const numStr = m[2].replace(/,/g, '')
  const suffix = m[3] || ''
  const value = parseFloat(numStr)
  const unit = prefix || (suffix === '%' ? '%' : suffix === 'x' ? 'x' : suffix)
  return { value: isNaN(value) ? 0 : value, unit }
}

function aiToCard(
  artifact: ArtifactRow,
  timeframe: Timeframe,
  version: number,
): StrategyCard {
  const ai: AIStrategy =
    typeof artifact.content_json === 'string'
      ? JSON.parse(artifact.content_json)
      : (artifact.content_json as AIStrategy) || {}

  const kpis: KPI[] = (ai.kpis || []).slice(0, 6).map(k => {
    const parsed = parseTargetNumber(k.target)
    return {
      metric: k.metric || '—',
      target: parsed.value,
      actual: 0,
      unit: parsed.unit,
    }
  })

  const tactics: string[] = []
  ;(ai.contentPillars || []).forEach(p => {
    if (p?.topics) tactics.push(...p.topics.slice(0, 2))
  })
  ;(ai.channelStrategy || []).forEach(c => {
    if (c.channel) tactics.push(`${c.channel}: ${c.frequency || 'regular cadence'} ${c.contentType || ''}`.trim())
  })

  const channels = (ai.channelStrategy || []).map(c => c.channel).filter(Boolean)

  return {
    id: artifact.id,
    timeframe,
    version,
    generatedAt: artifact.created_at,
    performanceScore: 0,
    positioning: ai.positioning || '',
    objective: ai.thirtyDayObjective || ai.uniqueValueProposition || '',
    kpis,
    tactics: tactics.slice(0, 5),
    channels: channels.slice(0, 6),
  }
}

// ─── Mock projects (kept for now — no projects API exists) ────────────────────

const MOCK_PROJECTS: StrategyProject[] = [
  {
    id: 'proj-1',
    name: 'Q2 Acquisition Push',
    description: 'Drive 500 new trial signups through paid + organic channels.',
    timeframe: 'monthly',
    status: 'active',
    performanceScore: 88,
    startDate: '2026-04-01',
    team: ['Sarah K.', 'Marcus T.', 'Lena R.'],
    kpis: [
      { metric: 'Trial Signups', target: 500, actual: 412, unit: '' },
      { metric: 'CAC', target: 45, actual: 51, unit: '$' },
      { metric: 'Conversion Rate', target: 8, actual: 6.4, unit: '%' },
    ],
  },
  {
    id: 'proj-2',
    name: 'Brand Awareness Sprint',
    description: 'Reach 100K new people organically in 4 weeks.',
    timeframe: 'weekly',
    status: 'active',
    performanceScore: 72,
    startDate: '2026-05-05',
    team: ['Ava M.', 'James W.'],
    kpis: [
      { metric: 'Organic Reach', target: 100000, actual: 68000, unit: '' },
      { metric: 'Follower Growth', target: 2000, actual: 1540, unit: '' },
    ],
  },
  {
    id: 'proj-3',
    name: 'Email Re-Engagement',
    description: 'Win back 200 churned subscribers with a 5-email sequence.',
    timeframe: 'weekly',
    status: 'planning',
    performanceScore: 0,
    startDate: '2026-06-01',
    team: ['Lena R.'],
    kpis: [
      { metric: 'Win-Back Rate', target: 20, actual: 0, unit: '%' },
      { metric: 'Revenue Recovered', target: 4000, actual: 0, unit: '$' },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBg(score: number) {
  if (score >= 80) return 'bg-green-900 text-green-300 border-green-800'
  if (score >= 60) return 'bg-yellow-900 text-yellow-300 border-yellow-800'
  return 'bg-red-900 text-red-300 border-red-800'
}

function kpiStatus(kpi: KPI): 'green' | 'yellow' | 'red' {
  if (!kpi.target) return 'yellow'
  const pct = kpi.actual / kpi.target
  const lowerIsBetter = kpi.metric.toLowerCase().includes('churn') || kpi.metric.toLowerCase().includes('cac')
  if (lowerIsBetter) {
    if (pct <= 1.05) return 'green'
    if (pct <= 1.2) return 'yellow'
    return 'red'
  }
  if (pct >= 0.9) return 'green'
  if (pct >= 0.65) return 'yellow'
  return 'red'
}

const STATUS_LABELS: Record<StrategyProject['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
}

const STATUS_STYLES: Record<StrategyProject['status'], string> = {
  planning: 'bg-blue-900 text-blue-300 border-blue-800',
  active: 'bg-indigo-900 text-indigo-300 border-indigo-800',
  completed: 'bg-green-900 text-green-300 border-green-800',
}

const TF_LABELS: Record<Timeframe, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

function summarizeArtifact(artifact: ArtifactRow): string {
  try {
    const ai: AIStrategy =
      typeof artifact.content_json === 'string'
        ? JSON.parse(artifact.content_json)
        : (artifact.content_json as AIStrategy)
    return ai?.positioning?.slice(0, 80) || ai?.thirtyDayObjective?.slice(0, 80) || artifact.title || 'Marketing strategy'
  } catch {
    return artifact.title || 'Marketing strategy'
  }
}

function detectTimeframe(artifact: ArtifactRow): Timeframe {
  try {
    const ai: AIStrategy =
      typeof artifact.content_json === 'string'
        ? JSON.parse(artifact.content_json)
        : (artifact.content_json as AIStrategy)
    if (ai?._timeframe && ['daily', 'weekly', 'monthly'].includes(ai._timeframe)) {
      return ai._timeframe
    }
  } catch { /* ignore */ }
  return 'weekly'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const bars = 12
  const filled = Math.round((value / max) * bars)
  return (
    <div className="flex items-end gap-px h-6">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-all ${i < filled ? color : 'bg-gray-800'}`}
          style={{ height: `${30 + Math.sin((i / bars) * Math.PI) * 70}%` }}
        />
      ))}
    </div>
  )
}

function KPICard({ kpi }: { kpi: KPI }) {
  const status = kpiStatus(kpi)
  const pct = kpi.target ? Math.min(Math.round((kpi.actual / kpi.target) * 100), 150) : 0
  const colorMap = {
    green: { bar: 'bg-green-500', text: 'text-green-400', badge: 'bg-green-900/40 border-green-800 text-green-300', label: 'On Track' },
    yellow: { bar: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-900/40 border-yellow-800 text-yellow-300', label: 'Pending' },
    red: { bar: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-900/40 border-red-800 text-red-300', label: 'Missing' },
  }
  const c = colorMap[status]
  const lowerIsBetter = kpi.metric.toLowerCase().includes('churn') || kpi.metric.toLowerCase().includes('cac')

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-gray-400 text-xs font-medium">{kpi.metric}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs border ${c.badge}`}>{c.label}</span>
      </div>
      <div className="flex items-end gap-3 mb-3">
        <span className={`text-2xl font-bold ${c.text}`}>
          {kpi.unit === '$' ? `$${kpi.actual.toLocaleString()}` : `${kpi.actual.toLocaleString()}${kpi.unit}`}
        </span>
        <span className="text-gray-600 text-sm pb-0.5">
          / {kpi.unit === '$' ? `$${kpi.target.toLocaleString()}` : `${kpi.target.toLocaleString()}${kpi.unit}`} target
        </span>
      </div>
      <SparkBar value={kpi.actual} max={Math.max(kpi.target * 1.2, kpi.actual || 1)} color={c.bar} />
      <div className="flex items-center justify-between mt-2">
        <div className="w-full bg-gray-800 rounded-full h-1.5 mr-2">
          <div
            className={`h-1.5 rounded-full ${c.bar}`}
            style={{ width: `${Math.min(lowerIsBetter ? (2 - pct / 100) * 100 : pct, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-semibold whitespace-nowrap ${c.text}`}>{pct}%</span>
      </div>
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: StrategyProject; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-950 border border-gray-800 hover:border-gray-700 rounded-xl p-4 cursor-pointer transition-all hover:bg-gray-900"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-white text-sm font-semibold leading-snug">{project.name}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs border flex-shrink-0 ml-2 ${STATUS_STYLES[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
      </div>
      <p className="text-gray-500 text-xs mb-3 line-clamp-2">{project.description}</p>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="bg-gray-800 px-2 py-0.5 rounded">{TF_LABELS[project.timeframe]}</span>
        {project.performanceScore > 0 && (
          <span className={`font-semibold ${scoreColor(project.performanceScore)}`}>{project.performanceScore}%</span>
        )}
        <span>{formatDate(project.startDate)}</span>
      </div>
      <div className="flex items-center gap-1 mt-3">
        {project.team.slice(0, 3).map((t, i) => (
          <div key={i} className="w-6 h-6 rounded-full bg-indigo-800 border border-gray-800 flex items-center justify-center text-white text-xs font-bold" title={t}>
            {t[0]}
          </div>
        ))}
        {project.team.length > 3 && <span className="text-gray-600 text-xs">+{project.team.length - 3}</span>}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Partial<StrategyProject>) => void }) {
  const [form, setForm] = useState({ name: '', description: '', timeframe: 'weekly' as Timeframe, goals: '' })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onCreate({
      name: form.name,
      description: form.description,
      timeframe: form.timeframe,
      status: 'planning',
      performanceScore: 0,
      startDate: new Date().toISOString().split('T')[0],
      team: ['You'],
      kpis: [],
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold">New Strategy Project</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Project Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Q3 Acquisition Sprint"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this project aim to achieve?"
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Timeframe</label>
            <select
              value={form.timeframe}
              onChange={e => setForm(f => ({ ...f, timeframe: e.target.value as Timeframe }))}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Goal KPIs</label>
            <input
              value={form.goals}
              onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
              placeholder="e.g. 200 signups, $15K MRR, 3x ROAS"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Timeframe>('daily')
  const [cards, setCards] = useState<Record<Timeframe, StrategyCard | null>>({
    daily: null,
    weekly: null,
    monthly: null,
  })
  const [allArtifacts, setAllArtifacts] = useState<ArtifactRow[]>([])
  const [history, setHistory] = useState<StrategyVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<Timeframe | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [projects, setProjects] = useState<StrategyProject[]>(MOCK_PROJECTS)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  // ── Agent Console (floating) state ────────────────────────────────────────
  // Closed by default; auto-opens on Generate click; auto-collapses 30s after
  // the run completes IF the user isn't hovering/interacting with the console.
  const [consoleOpen, setConsoleOpen] = useState(false)
  // ReviewRequiredModal state — opens when approval_pending arrives
  const [reviewModal, setReviewModal] = useState<{
    approvalId: string
    artifactId: string
    publishDestination?: string
  } | null>(null)
  // Idle timer that collapses the console 30s after a run reaches a
  // terminal status — cancelled if the user is interacting with it.
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) {
      router.push('/dashboard/onboarding')
      return
    }
    setWorkspaceId(wid)
  }, [router])

  // Load existing strategies on mount
  const loadStrategies = useCallback(async (wid: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/artifacts?workspaceId=${wid}&type=strategy&limit=50`)
      const rows: ArtifactRow[] = await res.json()
      setAllArtifacts(rows)

      // Build version history (most-recent first)
      const tfCounters: Record<Timeframe, number> = { daily: 0, weekly: 0, monthly: 0 }
      // Walk oldest→newest to assign incrementing version numbers
      const reversed = [...rows].reverse()
      const versionMap = new Map<string, number>()
      const tfMap = new Map<string, Timeframe>()
      for (const a of reversed) {
        const tf = detectTimeframe(a)
        tfMap.set(a.id, tf)
        tfCounters[tf] += 1
        versionMap.set(a.id, tfCounters[tf])
      }

      const newCards: Record<Timeframe, StrategyCard | null> = {
        daily: null,
        weekly: null,
        monthly: null,
      }
      // Find latest per timeframe
      for (const a of rows) {
        const tf = tfMap.get(a.id) || 'weekly'
        if (!newCards[tf]) {
          newCards[tf] = aiToCard(a, tf, versionMap.get(a.id) || 1)
        }
      }
      setCards(newCards)

      // Build history list
      const hist: StrategyVersion[] = rows.slice(0, 20).map(a => ({
        id: a.id,
        version: versionMap.get(a.id) || 1,
        timeframe: tfMap.get(a.id) || 'weekly',
        generatedAt: a.created_at,
        performanceScore: 0,
        summary: summarizeArtifact(a),
      }))
      setHistory(hist)
    } catch (e) {
      console.error('Failed to load strategies:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (workspaceId) loadStrategies(workspaceId)
  }, [workspaceId, loadStrategies])

  // ── Streaming hook ───────────────────────────────────────────────────────
  // One shared useAgentStream instance per page. Each Generate click invokes
  // .start({ body }) which auto-resets state and begins a new SSE stream.
  const stream = useAgentStream({
    endpoint: '/api/agents/strategy',
    body: null, // overridden per-call via stream.start({ body })
    onDone: () => {
      // Refresh artifact list to capture the freshly-saved strategy
      if (workspaceId) void loadStrategies(workspaceId)
      setGenerating(null)
    },
    onError: (msg) => {
      setGenError(msg)
      setGenerating(null)
    },
    onApprovalPending: ({ approvalId, artifactId, publishDestination }) => {
      // Open the Review Required modal directly over the workspace —
      // user keeps their place + console feed visible behind the backdrop.
      setReviewModal({ approvalId, artifactId, publishDestination })
    },
  })

  // ── Auto-collapse: 30s after stream reaches a terminal state ────────────
  // The timer is armed when status becomes 'done' | 'error' | 'cancelled'
  // AND the console is currently open. It's cancelled if the user hovers
  // into the console (the wrapper below handles onMouseEnter/Leave). When
  // it fires, the console smoothly collapses to the hidden floating state.
  const armCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = setTimeout(() => {
      setConsoleOpen(false)
      collapseTimerRef.current = null
    }, 30_000)
  }, [])

  const cancelCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const isTerminal =
      stream.status === 'done' ||
      stream.status === 'error' ||
      stream.status === 'cancelled'
    if (isTerminal && consoleOpen) {
      armCollapseTimer()
    } else {
      // Streaming / connecting / idle (pre-start) → no auto-collapse
      cancelCollapseTimer()
    }
    return cancelCollapseTimer
  }, [stream.status, consoleOpen, armCollapseTimer, cancelCollapseTimer])

  // ── Generate strategy (streaming) ────────────────────────────────────────
  const generateStrategy = async (timeframe: Timeframe) => {
    if (!workspaceId) return
    setGenerating(timeframe)
    setGenError(null)
    // Auto-open the console so the user sees live progress
    setConsoleOpen(true)
    cancelCollapseTimer()
    setActiveTab(timeframe)
    // Fire the stream — lifecycle + artifact_created + approval_pending
    // events arrive in real time. onDone / onError handle terminal state.
    void stream.start({
      body: { workspaceId, timeframe },
    })
  }

  const restoreVersion = async (version: StrategyVersion) => {
    setRestoringId(version.id)
    try {
      const artifact = allArtifacts.find(a => a.id === version.id)
      if (!artifact) return
      const card = aiToCard(artifact, version.timeframe, version.version)
      setCards(prev => ({ ...prev, [version.timeframe]: card }))
      setActiveTab(version.timeframe)
    } finally {
      setRestoringId(null)
    }
  }

  const kanbanCols: Array<{ key: StrategyProject['status']; label: string; color: string }> = [
    { key: 'planning', label: 'Planning', color: 'border-blue-800' },
    { key: 'active', label: 'Active', color: 'border-indigo-800' },
    { key: 'completed', label: 'Completed', color: 'border-green-800' },
  ]

  const activeCard = cards[activeTab]

  // Stats bar
  const activeCount = projects.filter(p => p.status === 'active').length
  const avgScore = Math.round(
    projects.filter(p => p.performanceScore > 0).reduce((a, p) => a + p.performanceScore, 0) /
    Math.max(projects.filter(p => p.performanceScore > 0).length, 1)
  )
  const totalGenerated = allArtifacts.length
  const roiTracked = '—'

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🧠 Marketing Strategy</h1>
          <p className="text-gray-400 text-sm mt-0.5">AI-powered strategy across daily, weekly, and monthly timeframes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${historyOpen ? 'bg-indigo-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
          >
            📋 History
          </button>
          <button
            onClick={() => router.push('/dashboard/content')}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
          >
            Next: Content Calendar →
          </button>
        </div>
      </div>

      {/* Error banner */}
      {genError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm flex items-center justify-between">
          <span>⚠ {genError}</span>
          <button onClick={() => setGenError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Projects', value: activeCount, sub: 'in progress' },
          { label: 'Avg Performance', value: `${avgScore || 0}%`, sub: 'across projects' },
          { label: 'Strategies Generated', value: totalGenerated, sub: 'all-time' },
          { label: 'ROI Tracked', value: roiTracked, sub: 'attributed revenue' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs font-medium mb-1">{stat.label}</p>
            <p className="text-white text-2xl font-bold">{stat.value}</p>
            <p className="text-gray-600 text-xs mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className={`flex gap-6 ${historyOpen ? '' : ''}`}>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Timeframe tabs */}
          <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
            {(['daily', 'weekly', 'monthly'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => setActiveTab(tf)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${activeTab === tf ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                {TF_LABELS[tf]}
              </button>
            ))}
          </div>

          {/* Strategy card / loading / empty */}
          {loading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 flex items-center justify-center gap-3 mb-6">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading strategies...</p>
            </div>
          ) : !activeCard ? (
            <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-10 text-center mb-6">
              <div className="text-5xl mb-3">🧠</div>
              <p className="text-white font-medium mb-2">No strategies yet — generate your first one</p>
              <p className="text-gray-500 text-sm mb-5">Click below to have the AI Strategy Agent analyze your brand and build a {TF_LABELS[activeTab].toLowerCase()} marketing strategy.</p>
              <button
                onClick={() => generateStrategy(activeTab)}
                disabled={generating === activeTab}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                {generating === activeTab ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating with Claude...</>
                ) : (
                  `⚡ Generate ${TF_LABELS[activeTab]} Strategy`
                )}
              </button>
            </div>
          ) : (
            <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-white font-semibold text-lg capitalize">{TF_LABELS[activeTab]} Strategy</h2>
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">v{activeCard.version}</span>
                    {activeCard.performanceScore > 0 && (
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${scoreBg(activeCard.performanceScore)}`}>
                        {activeCard.performanceScore}% score
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs">Last generated {formatDate(activeCard.generatedAt)}</p>
                </div>
                <button
                  onClick={() => generateStrategy(activeTab)}
                  disabled={generating === activeTab}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {generating === activeTab ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating with Claude...</>
                  ) : (
                    `⚡ Generate ${TF_LABELS[activeTab]} Strategy`
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Positioning</p>
                  <p className="text-gray-200 text-sm leading-relaxed">{activeCard.positioning || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Objective</p>
                  <p className="text-gray-200 text-sm leading-relaxed">{activeCard.objective || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Key Tactics</p>
                  {activeCard.tactics.length === 0 ? (
                    <p className="text-gray-600 text-xs italic">No tactics extracted</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {activeCard.tactics.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Channels</p>
                  <div className="flex flex-wrap gap-2">
                    {activeCard.channels.length === 0 ? (
                      <p className="text-gray-600 text-xs italic">No channels listed</p>
                    ) : (
                      activeCard.channels.map(ch => (
                        <span key={ch} className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs">{ch}</span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* KPI Performance Metrics */}
          {activeCard && activeCard.kpis.length > 0 && (
            <div className="mb-6">
              <h3 className="text-white font-semibold mb-3">📊 KPI Performance Tracker</h3>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {activeCard.kpis.map((kpi, i) => (
                  <KPICard key={i} kpi={kpi} />
                ))}
              </div>
            </div>
          )}

          {/* Strategy Projects Board */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">🗂 Strategy Projects</h3>
              <button
                onClick={() => setShowNewProject(true)}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                + New Strategy Project
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {kanbanCols.map(col => (
                <div key={col.key}>
                  <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${col.color}`}>
                    <p className="text-gray-300 text-sm font-semibold">{col.label}</p>
                    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs">
                      {projects.filter(p => p.status === col.key).length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {projects.filter(p => p.status === col.key).map(project => (
                      <div key={project.id}>
                        <ProjectCard
                          project={project}
                          onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                        />
                        {expandedProject === project.id && (
                          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-2 space-y-2">
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">KPIs</p>
                            {project.kpis.map((kpi, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-gray-400 text-xs">{kpi.metric}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-semibold ${scoreColor(Math.round((kpi.actual / kpi.target) * 100))}`}>
                                    {kpi.unit === '$' ? `$${kpi.actual.toLocaleString()}` : `${kpi.actual.toLocaleString()}${kpi.unit}`}
                                  </span>
                                  <span className="text-gray-600 text-xs">
                                    / {kpi.unit === '$' ? `$${kpi.target.toLocaleString()}` : `${kpi.target.toLocaleString()}${kpi.unit}`}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History sidebar */}
        {historyOpen && (
          <div className="w-72 flex-shrink-0">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold text-sm">Version History</h3>
                <button onClick={() => setHistoryOpen(false)} className="text-gray-600 hover:text-gray-400 transition-colors text-sm">✕</button>
              </div>
              {history.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-6">No history yet — generate a strategy to start.</p>
              ) : (
                <div className="space-y-3">
                  {history.map(version => (
                    <div key={version.id} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white text-xs font-semibold capitalize">{version.timeframe}</span>
                            <span className="text-gray-600 text-xs">v{version.version}</span>
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{formatDate(version.generatedAt)}</p>
                        </div>
                        {version.performanceScore > 0 && (
                          <span className={`text-xs font-bold ${scoreColor(version.performanceScore)}`}>{version.performanceScore}%</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mb-2 line-clamp-2">{version.summary}</p>
                      <button
                        onClick={() => restoreVersion(version)}
                        disabled={restoringId === version.id}
                        className="w-full py-1 rounded text-xs text-indigo-400 border border-indigo-800 hover:bg-indigo-950 transition-colors disabled:opacity-50"
                      >
                        {restoringId === version.id ? 'Restoring...' : '↩ Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={(partial) => {
            const newProject: StrategyProject = {
              id: `proj-${Date.now()}`,
              name: partial.name || 'New Project',
              description: partial.description || '',
              timeframe: partial.timeframe || 'weekly',
              status: 'planning',
              performanceScore: 0,
              startDate: partial.startDate || new Date().toISOString().split('T')[0],
              team: partial.team || ['You'],
              kpis: [],
            }
            setProjects(prev => [newProject, ...prev])
          }}
        />
      )}

      {/* ── Floating Agent Console ──────────────────────────────────────────
            Bottom-right popover that auto-opens on Generate click and
            auto-collapses 30s after the stream completes (idle timer is
            cancelled when the user hovers over the console). */}
      <div
        onMouseEnter={cancelCollapseTimer}
        onMouseLeave={() => {
          const isTerminal =
            stream.status === 'done' ||
            stream.status === 'error' ||
            stream.status === 'cancelled'
          if (isTerminal && consoleOpen) armCollapseTimer()
        }}
      >
        <AgentConsole
          mode="floating"
          open={consoleOpen}
          events={stream.events}
          status={stream.status}
          totalCost={stream.cost}
          errorMessage={stream.error}
          onClose={() => setConsoleOpen(false)}
          onApprovalClick={({ approvalId, artifactId }) => {
            // Same modal — keeps the user in-context on the Strategy page
            setReviewModal({ approvalId, artifactId })
          }}
          onArtifactClick={() => {
            // Already viewing strategy artifacts on this page — no-op for now
          }}
          title="Strategy Agent"
        />
      </div>

      {/* ── Floating "▶ open console" button when closed during/after run ──
            If the stream has produced events but the user closed/dismissed
            the console, this lightweight launcher lets them re-open it
            without having to re-run anything. */}
      {!consoleOpen && stream.events.length > 0 && (
        <button
          onClick={() => {
            setConsoleOpen(true)
            cancelCollapseTimer()
          }}
          className="fixed bottom-4 right-4 z-30 px-3 py-2 rounded-full bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-indigo-700 text-white text-xs font-medium shadow-lg shadow-black/40 flex items-center gap-2 transition-colors"
          aria-label="Open Agent Console"
        >
          <span>🤖</span>
          <span>Open Console</span>
          {(stream.status === 'streaming' || stream.status === 'connecting') && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          )}
          <span className="text-gray-500 text-[10px]">{stream.events.length}</span>
        </button>
      )}

      {/* ── Review Required Modal ───────────────────────────────────────────
            Triggered by approval_pending events. Overlays the strategy
            workspace so the user retains context while reviewing. */}
      {reviewModal && workspaceId && (
        <ReviewRequiredModal
          isOpen={true}
          approvalId={reviewModal.approvalId}
          artifactId={reviewModal.artifactId}
          publishDestination={reviewModal.publishDestination}
          workspaceId={workspaceId}
          onClose={() => setReviewModal(null)}
          onApproved={() => {
            // Refresh the strategy list so the approved version is reflected.
            if (workspaceId) void loadStrategies(workspaceId)
          }}
          onRejected={() => {
            // Even after rejection, refresh to update status indicators.
            if (workspaceId) void loadStrategies(workspaceId)
          }}
        />
      )}
    </div>
  )
}
