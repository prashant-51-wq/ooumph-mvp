'use client'

import { useState, useEffect, useCallback } from 'react'

const GROWTH_WORKERS = [
  {
    id: 'trend-scout',
    icon: '🔭',
    label: 'Trend Scout',
    description: 'Discover trending topics and viral content opportunities in your industry',
    endpoint: '/api/agents/growth/trend-scout',
    body: {},
    resultKey: 'trendCount',
    resultLabel: 'trends found',
  },
  {
    id: 'hashtag-seo',
    icon: '🔍',
    label: 'Hashtag & SEO',
    description: 'Platform-optimised hashtag sets and SEO keyword strategies',
    endpoint: '/api/agents/growth/hashtag-seo',
    body: {},
    resultKey: 'keywordCount',
    resultLabel: 'SEO keywords',
  },
  {
    id: 'engagement',
    icon: '💬',
    label: 'Engagement Agent',
    description: 'Reply templates, DM sequences, and community management playbook',
    endpoint: '/api/agents/growth/engagement',
    body: {},
    resultKey: 'templateCount',
    resultLabel: 'reply templates',
  },
  {
    id: 'influencer',
    icon: '🤝',
    label: 'Influencer Mapper',
    description: 'Influencer profiles, outreach scripts, and collaboration frameworks',
    endpoint: '/api/agents/growth/influencer',
    body: {},
    resultKey: 'profileCount',
    resultLabel: 'profiles mapped',
  },
  {
    id: 'youtube',
    icon: '▶️',
    label: 'YouTube Growth',
    description: 'Channel strategy, video ideas, SEO titles, and growth roadmap',
    endpoint: '/api/agents/growth/youtube',
    body: {},
    resultKey: 'videoCount',
    resultLabel: 'video ideas',
  },
]

interface GrowthTactic {
  type: string
  title: string
  description: string
  expectedImpact: string
  effort: 'low' | 'medium' | 'high'
  timeframe: string
  creativeNeeds: string[]
}

interface GrowthPlan {
  id: string
  title: string
  approval_status: string
  created_at: string
  content_json: {
    growthGoal: string
    currentGap: string
    primaryChannel: string
    viralMechanism: string
    tactics: GrowthTactic[]
    contentPillars: string[]
    engagementHooks: string[]
    postingFrequency: string
    weeklyMilestones: string[]
    businessName: string
    tone: string
  }
}

const EFFORT_COLORS: Record<string, string> = {
  low:    'bg-green-900/40 text-green-400',
  medium: 'bg-amber-900/40 text-amber-400',
  high:   'bg-red-900/40 text-red-400',
}

const TACTIC_ICONS: Record<string, string> = {
  viral_hook:       '🔥',
  engagement_loop:  '🔄',
  reach_expansion:  '📡',
  collaboration:    '🤝',
  seo_content:      '🔍',
  community:        '👥',
}

export default function GrowthPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [plans, setPlans] = useState<GrowthPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [growthGoal, setGrowthGoal] = useState('')
  const [selected, setSelected] = useState<GrowthPlan | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ message: string; creativesGenerated: number } | null>(null)
  const [workerLoading, setWorkerLoading] = useState<Record<string, boolean>>({})
  const [workerResults, setWorkerResults] = useState<Record<string, string>>({})

  const load = useCallback(async (wid: string) => {
    setLoading(true)
    const res = await fetch(`/api/agents/growth?workspaceId=${wid}`)
    const data = await res.json()
    if (Array.isArray(data)) setPlans(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) load(wid)
  }, [load])

  async function generate() {
    setGenerating(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/agents/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, growthGoal: growthGoal.trim() || undefined }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult({ message: data.message, creativesGenerated: data.creativesGenerated })
      setGrowthGoal('')
      await load(workspaceId)
    } finally { setGenerating(false) }
  }

  async function runWorker(worker: typeof GROWTH_WORKERS[number]) {
    if (!workspaceId) return
    setWorkerLoading(prev => ({ ...prev, [worker.id]: true }))
    setWorkerResults(prev => ({ ...prev, [worker.id]: '' }))
    try {
      const res = await fetch(worker.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...worker.body }),
      })
      const data = await res.json()
      if (data.error) {
        setWorkerResults(prev => ({ ...prev, [worker.id]: `Error: ${data.error}` }))
      } else {
        const count = data[worker.resultKey]
        setWorkerResults(prev => ({ ...prev, [worker.id]: data.message || `${count} ${worker.resultLabel}. Check Approvals.` }))
      }
    } catch (e) {
      setWorkerResults(prev => ({ ...prev, [worker.id]: `Error: ${String(e)}` }))
    } finally {
      setWorkerLoading(prev => ({ ...prev, [worker.id]: false }))
    }
  }

  const plan = selected || plans[0]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">📈</div>
          <h1 className="text-2xl font-bold text-white">Growth Engine</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Viral growth strategies + automatic creative generation for your best hooks and pillars</p>
      </div>

      {/* Cross-agent notice */}
      <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3 mb-6 flex gap-3">
        <span className="text-indigo-400">🔗</span>
        <p className="text-indigo-300 text-xs">
          Growth Engine reads your <strong>Marketing Strategy</strong> and <strong>Content Calendar</strong>, then automatically requests a <strong>static post</strong>, <strong>story cover</strong>, and <strong>reel storyboard</strong> from the Creative Supervisor for your best engagement hooks. All assets appear in <a href="/dashboard/approvals" className="underline">Approvals</a> before anything is published.
        </p>
      </div>

      {/* Worker Agents */}
      <div className="mb-8">
        <h2 className="text-white font-semibold mb-3">Growth Worker Agents</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {GROWTH_WORKERS.map(worker => (
            <div key={worker.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{worker.icon}</span>
                <span className="text-white font-medium text-sm">{worker.label}</span>
              </div>
              <p className="text-gray-400 text-xs mb-3 leading-relaxed">{worker.description}</p>
              {workerResults[worker.id] && (
                <p className={`text-xs mb-2 ${workerResults[worker.id].startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {workerResults[worker.id]}
                </p>
              )}
              <button
                onClick={() => runWorker(worker)}
                disabled={workerLoading[worker.id] || !workspaceId}
                className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {workerLoading[worker.id] ? '⏳ Running...' : `Run ${worker.label}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Generate form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
        <h2 className="text-white font-semibold mb-4">New Growth Plan</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-gray-400 text-xs mb-1.5 block">Growth Goal (optional — leave blank to use strategy defaults)</label>
            <input value={growthGoal} onChange={e => setGrowthGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="e.g. Grow Instagram from 2K to 10K followers in 90 days with organic content"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="flex items-end">
            <button onClick={generate} disabled={generating || !workspaceId}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap">
              {generating ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating + Creatives...</>
              ) : '📈 Generate Growth Plan'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        {result && (
          <div className="mt-4 bg-green-900/20 border border-green-800/40 rounded-xl p-3 flex gap-3">
            <span className="text-green-400">✅</span>
            <div>
              <p className="text-green-300 text-sm">{result.message}</p>
              <a href="/dashboard/approvals" className="text-indigo-400 text-xs hover:underline">Review creatives in Approvals →</a>
            </div>
          </div>
        )}
      </div>

      {/* Plan list + detail */}
      {loading ? (
        <div className="text-gray-600 text-sm animate-pulse p-8 text-center">Loading growth plans...</div>
      ) : plans.length === 0 ? (
        <div className="border border-dashed border-gray-700 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-white font-medium mb-1">No growth plans yet</p>
          <p className="text-gray-500 text-sm">Generate your first growth plan above — requires Strategy to be completed first</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {/* Plan list */}
          <div className="col-span-1 space-y-2">
            {plans.map(p => (
              <button key={p.id} onClick={() => setSelected(p)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  plan?.id === p.id ? 'border-emerald-600 bg-emerald-900/20' : 'border-gray-800 hover:border-gray-600'
                }`}>
                <p className="text-white text-xs font-semibold truncate">{p.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{p.content_json.primaryChannel}</p>
                <div className={`mt-1.5 inline-flex text-xs px-2 py-0.5 rounded-full ${
                  p.approval_status === 'approved' ? 'bg-green-900/40 text-green-400' :
                  p.approval_status === 'rejected' ? 'bg-red-900/40 text-red-400' :
                  'bg-yellow-900/40 text-yellow-400'
                }`}>{p.approval_status || 'pending'}</div>
              </button>
            ))}
          </div>

          {/* Plan detail */}
          {plan && (
            <div className="col-span-3 space-y-5">
              {/* Overview */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="grid grid-cols-2 gap-4 text-sm mb-5">
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Growth Goal</p>
                    <p className="text-white font-bold">{plan.content_json.growthGoal}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Primary Channel</p>
                    <p className="text-emerald-400 font-bold capitalize">{plan.content_json.primaryChannel}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Posting Frequency</p>
                    <p className="text-white text-xs">{plan.content_json.postingFrequency}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Current Gap</p>
                    <p className="text-gray-300 text-xs">{plan.content_json.currentGap}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Viral Mechanism</p>
                    <p className="text-amber-300 text-xs">{plan.content_json.viralMechanism}</p>
                  </div>
                </div>

                {/* Content pillars */}
                <div className="mb-4">
                  <p className="text-gray-500 text-xs mb-2">Content Pillars</p>
                  <div className="flex flex-wrap gap-2">
                    {(plan.content_json.contentPillars || []).map((p, i) => (
                      <span key={i} className="bg-indigo-900/30 text-indigo-300 text-xs px-3 py-1 rounded-full">{p}</span>
                    ))}
                  </div>
                </div>

                {/* Engagement hooks */}
                <div>
                  <p className="text-gray-500 text-xs mb-2">Scroll-Stopping Hooks to Test</p>
                  <div className="space-y-1.5">
                    {(plan.content_json.engagementHooks || []).map((hook, i) => (
                      <div key={i} className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200">
                        <span className="text-emerald-500 font-bold mr-2">{i + 1}.</span>{hook}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tactics */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-3">Growth Tactics ({plan.content_json.tactics?.length || 0})</p>
                <div className="space-y-3">
                  {(plan.content_json.tactics || []).map((tactic, i) => (
                    <div key={i} className="bg-gray-800 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{TACTIC_ICONS[tactic.type] || '💡'}</span>
                          <div>
                            <p className="text-white text-sm font-semibold">{tactic.title}</p>
                            <p className="text-gray-500 text-xs capitalize">{tactic.type?.replace(/_/g, ' ')} · {tactic.timeframe}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 ml-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${EFFORT_COLORS[tactic.effort] || EFFORT_COLORS.medium}`}>
                            {tactic.effort} effort
                          </span>
                          <span className="text-xs bg-teal-900/40 text-teal-400 px-2 py-0.5 rounded-full">{tactic.expectedImpact}</span>
                        </div>
                      </div>
                      <p className="text-gray-400 text-xs mb-2 leading-relaxed">{tactic.description}</p>
                      {tactic.creativeNeeds?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tactic.creativeNeeds.map((need, j) => (
                            <span key={j} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">{need}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly milestones */}
              {(plan.content_json.weeklyMilestones || []).length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-3">4-Week Milestones</p>
                  <div className="grid grid-cols-2 gap-3">
                    {plan.content_json.weeklyMilestones.map((milestone, i) => (
                      <div key={i} className="bg-gray-800 rounded-lg px-4 py-3 flex gap-3 items-start">
                        <span className="text-emerald-500 font-bold text-xs mt-0.5 flex-shrink-0">W{i + 1}</span>
                        <p className="text-gray-300 text-xs leading-relaxed">{milestone}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <a href="/dashboard/approvals" className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">
                  Review Creatives in Approvals →
                </a>
                <a href="/dashboard/creative" className="flex items-center justify-center border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 px-5 rounded-xl transition-colors">
                  Creative Studio
                </a>
                <a href="/dashboard/content" className="flex items-center justify-center border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 px-5 rounded-xl transition-colors">
                  Content Calendar
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
