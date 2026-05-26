'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_STRATEGY_CARDS: Record<Timeframe, StrategyCard> = {
  daily: {
    id: 'strat-d-1',
    timeframe: 'daily',
    version: 4,
    generatedAt: '2026-05-26T08:00:00Z',
    performanceScore: 82,
    positioning: 'Focus on quick-win engagement tactics — respond to comments within 2h, post one story, send one DM follow-up sequence.',
    objective: 'Generate 3 qualified leads today by engaging top-of-funnel content and activating the email nurture sequence for this morning\'s webinar sign-ups.',
    kpis: [
      { metric: 'New Leads', target: 3, actual: 2, unit: '' },
      { metric: 'Story Views', target: 500, actual: 612, unit: '' },
      { metric: 'Email Opens', target: 35, actual: 41, unit: '%' },
      { metric: 'DM Replies', target: 10, actual: 7, unit: '' },
    ],
    tactics: [
      'Post 1 educational carousel on Instagram by 10 AM',
      'Send follow-up DM to 20 webinar registrants',
      'Reply to all LinkedIn comments within 2 hours',
      'Publish one short-form video (Reels/TikTok) at 12 PM',
      'Send a promotional email to warm leads at 3 PM',
    ],
    channels: ['Instagram', 'LinkedIn', 'Email', 'TikTok'],
  },
  weekly: {
    id: 'strat-w-1',
    timeframe: 'weekly',
    version: 7,
    generatedAt: '2026-05-20T09:00:00Z',
    performanceScore: 74,
    positioning: 'Establish thought leadership this week with two long-form posts, one live session, and a feature spotlight campaign driving free trial sign-ups.',
    objective: 'Add 50 newsletter subscribers and 15 trial activations this week through content + retargeting ads running Mon-Fri.',
    kpis: [
      { metric: 'Newsletter Subs', target: 50, actual: 38, unit: '' },
      { metric: 'Trial Activations', target: 15, actual: 9, unit: '' },
      { metric: 'Ad Spend ROI', target: 3.5, actual: 2.8, unit: 'x' },
      { metric: 'Content Reach', target: 25000, actual: 31200, unit: '' },
    ],
    tactics: [
      'Publish 2 long-form LinkedIn articles (Mon + Thu)',
      'Run retargeting ads to website visitors (budget $500)',
      'Host a 30-min live Q&A on Instagram Thursday 6 PM',
      'Send 3-email nurture sequence to cold leads',
      'Publish 4 short-form videos across platforms',
    ],
    channels: ['LinkedIn', 'Instagram', 'Paid Ads', 'Email'],
  },
  monthly: {
    id: 'strat-m-1',
    timeframe: 'monthly',
    version: 2,
    generatedAt: '2026-05-01T09:00:00Z',
    performanceScore: 91,
    positioning: 'June is acquisition month — push the annual plan promotion, double ad spend on highest-converting audiences, and launch the partner referral program.',
    objective: 'Achieve $28K MRR by June 30 through 120 new paid subscriptions and a 15% reduction in churn via the new onboarding sequence.',
    kpis: [
      { metric: 'New Paid Subs', target: 120, actual: 87, unit: '' },
      { metric: 'MRR Growth', target: 28000, actual: 22400, unit: '$' },
      { metric: 'Churn Rate', target: 3.5, actual: 4.1, unit: '%' },
      { metric: 'CAC', target: 45, actual: 38, unit: '$' },
    ],
    tactics: [
      'Launch annual plan promo (40% off for 72 hours) on June 3',
      'Onboard 5 new affiliate partners this month',
      'Run full-funnel paid campaign ($3K budget) June 1–15',
      'Deploy new in-app onboarding flow on June 1',
      'Publish 1 case study and 1 detailed guide per week',
    ],
    channels: ['Paid Ads', 'Email', 'Partnerships', 'In-App', 'Content'],
  },
}

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
  {
    id: 'proj-4',
    name: 'LinkedIn Thought Leadership',
    description: 'Establish CEO as top voice in AI marketing niche.',
    timeframe: 'monthly',
    status: 'completed',
    performanceScore: 95,
    startDate: '2026-03-01',
    team: ['James W.', 'Sarah K.'],
    kpis: [
      { metric: 'Post Impressions', target: 50000, actual: 73200, unit: '' },
      { metric: 'Profile Views', target: 5000, actual: 6800, unit: '' },
      { metric: 'Inbound Leads', target: 25, actual: 31, unit: '' },
    ],
  },
  {
    id: 'proj-5',
    name: 'Daily Engagement System',
    description: 'Build a repeatable daily content + reply system.',
    timeframe: 'daily',
    status: 'completed',
    performanceScore: 89,
    startDate: '2026-04-15',
    team: ['Ava M.'],
    kpis: [
      { metric: 'Avg Daily Reach', target: 3000, actual: 3820, unit: '' },
      { metric: 'Engagement Rate', target: 5, actual: 6.2, unit: '%' },
    ],
  },
]

const MOCK_HISTORY: StrategyVersion[] = [
  { id: 'h-1', version: 7, timeframe: 'weekly', generatedAt: '2026-05-20T09:00:00Z', performanceScore: 74, summary: 'Thought leadership + trial activation push' },
  { id: 'h-2', version: 6, timeframe: 'weekly', generatedAt: '2026-05-13T09:00:00Z', performanceScore: 68, summary: 'Content volume sprint, 4 posts/day' },
  { id: 'h-3', version: 4, timeframe: 'daily', generatedAt: '2026-05-26T08:00:00Z', performanceScore: 82, summary: 'Lead gen focus, DM sequences' },
  { id: 'h-4', version: 3, timeframe: 'daily', generatedAt: '2026-05-25T08:00:00Z', performanceScore: 77, summary: 'Story engagement + email opens' },
  { id: 'h-5', version: 2, timeframe: 'monthly', generatedAt: '2026-05-01T09:00:00Z', performanceScore: 91, summary: 'Annual plan promo, acquisition month' },
  { id: 'h-6', version: 1, timeframe: 'monthly', generatedAt: '2026-04-01T09:00:00Z', performanceScore: 83, summary: 'Q2 foundation — brand + SEO' },
  { id: 'h-7', version: 5, timeframe: 'weekly', generatedAt: '2026-05-06T09:00:00Z', performanceScore: 71, summary: 'Ad spend ramp-up, retargeting focus' },
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
  const pct = kpi.actual / kpi.target
  // For churn rate: lower is better
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
  const pct = Math.min(Math.round((kpi.actual / kpi.target) * 100), 150)
  const colorMap = {
    green: { bar: 'bg-green-500', text: 'text-green-400', badge: 'bg-green-900/40 border-green-800 text-green-300', label: 'On Track' },
    yellow: { bar: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-900/40 border-yellow-800 text-yellow-300', label: 'Lagging' },
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
      <SparkBar value={kpi.actual} max={Math.max(kpi.target * 1.2, kpi.actual)} color={c.bar} />
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
  const [activeTab, setActiveTab] = useState<Timeframe>('daily')
  const [cards, setCards] = useState<Record<Timeframe, StrategyCard>>(MOCK_STRATEGY_CARDS)
  const [generating, setGenerating] = useState<Timeframe | null>(null)
  const [projects, setProjects] = useState<StrategyProject[]>(MOCK_PROJECTS)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) router.push('/dashboard/onboarding')
  }, [router])

  const generateStrategy = async (timeframe: Timeframe) => {
    setGenerating(timeframe)
    await new Promise(r => setTimeout(r, 1800))
    setCards(prev => ({
      ...prev,
      [timeframe]: {
        ...prev[timeframe],
        version: prev[timeframe].version + 1,
        generatedAt: new Date().toISOString(),
        performanceScore: Math.floor(Math.random() * 20) + 75,
      },
    }))
    setGenerating(null)
  }

  const restoreVersion = async (version: StrategyVersion) => {
    setRestoringId(version.id)
    await new Promise(r => setTimeout(r, 800))
    setRestoringId(null)
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
  const totalGenerated = Object.values(cards).reduce((a, c) => a + c.version, 0)
  const roiTracked = '$142K'

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

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Projects', value: activeCount, sub: 'in progress' },
          { label: 'Avg Performance', value: `${avgScore}%`, sub: 'across projects' },
          { label: 'Strategies Generated', value: totalGenerated, sub: 'this month' },
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

          {/* Strategy card */}
          <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-white font-semibold text-lg capitalize">{TF_LABELS[activeTab]} Strategy</h2>
                  <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">v{activeCard.version}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${scoreBg(activeCard.performanceScore)}`}>
                    {activeCard.performanceScore}% score
                  </span>
                </div>
                <p className="text-gray-500 text-xs">Last generated {formatDate(activeCard.generatedAt)}</p>
              </div>
              <button
                onClick={() => generateStrategy(activeTab)}
                disabled={generating === activeTab}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {generating === activeTab ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                ) : (
                  `⚡ Generate ${TF_LABELS[activeTab]} Strategy`
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Positioning</p>
                <p className="text-gray-200 text-sm leading-relaxed">{activeCard.positioning}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Objective</p>
                <p className="text-gray-200 text-sm leading-relaxed">{activeCard.objective}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Key Tactics</p>
                <ul className="space-y-1.5">
                  {activeCard.tactics.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Channels</p>
                <div className="flex flex-wrap gap-2">
                  {activeCard.channels.map(ch => (
                    <span key={ch} className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs">{ch}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Performance Metrics */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">📊 KPI Performance Tracker</h3>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {activeCard.kpis.map((kpi, i) => (
                <KPICard key={i} kpi={kpi} />
              ))}
            </div>
          </div>

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
              <div className="space-y-3">
                {MOCK_HISTORY.map(version => (
                  <div key={version.id} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-white text-xs font-semibold capitalize">{version.timeframe}</span>
                          <span className="text-gray-600 text-xs">v{version.version}</span>
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">{formatDate(version.generatedAt)}</p>
                      </div>
                      <span className={`text-xs font-bold ${scoreColor(version.performanceScore)}`}>{version.performanceScore}%</span>
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
    </div>
  )
}
