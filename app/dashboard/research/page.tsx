'use client'

import { useState, useEffect, useCallback } from 'react'

type ResearchType = 'market' | 'competitor' | 'keyword' | 'general'
type TrendCategory = 'Industry' | 'Competitor' | 'Consumer' | 'Tech' | 'Social'
type HypothesisStatus = 'Untested' | 'Testing' | 'Validated' | 'Rejected'
type ActiveTab = 'trending' | 'hypotheses' | 'competitors' | 'reports'

interface ResearchReport {
  title: string
  summary: string
  keyFindings: string[]
  opportunities: string[]
  threats: string[]
  recommendations: string[]
  sources: { title: string; url: string }[]
  type: ResearchType
  query: string
  businessName?: string
}

interface SavedReport {
  id: string
  title: string
  content_json: ResearchReport
  created_at: string
}

interface Trend {
  id: string
  topic: string
  momentum: 'up' | 'down'
  momentumPct: number
  volume: string
  sentiment: 'positive' | 'neutral' | 'negative'
  relatedKeywords: string[]
  category: TrendCategory
  addedToStrategy: boolean
}

interface Hypothesis {
  id: string
  text: string
  confidence: number
  dataPoints: string[]
  status: HypothesisStatus
  abTestId?: string
}

interface Competitor {
  id: string
  name: string
  recentActivity: string
  strategyShift: string
  sentiment: 'positive' | 'neutral' | 'negative'
  monitored: boolean
  lastUpdated: string
}

const RESEARCH_TYPES: { id: ResearchType; icon: string; label: string; description: string }[] = [
  { id: 'market', icon: '🔍', label: 'Market Research', description: 'Market trends, size, growth opportunities' },
  { id: 'competitor', icon: '🏢', label: 'Competitor Analysis', description: 'Analyse a competitor website' },
  { id: 'keyword', icon: '🔑', label: 'Keyword Intelligence', description: 'SEO / AEO keyword opportunities' },
  { id: 'general', icon: '💡', label: 'General Research', description: 'Deep-dive into any topic' },
]

const DEMO_TRENDS: Trend[] = [
  { id: 't1', topic: 'AI-Generated Marketing Content', momentum: 'up', momentumPct: 84, volume: '2.4M mentions', sentiment: 'positive', relatedKeywords: ['generative AI', 'content automation', 'GPT marketing'], category: 'Tech', addedToStrategy: false },
  { id: 't2', topic: 'Short-Form Video Ads', momentum: 'up', momentumPct: 67, volume: '1.8M mentions', sentiment: 'positive', relatedKeywords: ['TikTok ads', 'Reels', 'YouTube Shorts'], category: 'Social', addedToStrategy: false },
  { id: 't3', topic: 'Zero-Party Data Collection', momentum: 'up', momentumPct: 52, volume: '890K mentions', sentiment: 'neutral', relatedKeywords: ['first-party data', 'privacy', 'cookie-less'], category: 'Industry', addedToStrategy: true },
  { id: 't4', topic: 'Influencer Micro-Campaigns', momentum: 'down', momentumPct: -12, volume: '650K mentions', sentiment: 'neutral', relatedKeywords: ['micro influencer', 'nano influencer', 'authentic reach'], category: 'Consumer', addedToStrategy: false },
  { id: 't5', topic: 'Competitor HubSpot Rebranding', momentum: 'up', momentumPct: 31, volume: '340K mentions', sentiment: 'negative', relatedKeywords: ['HubSpot 2026', 'CRM rebrand'], category: 'Competitor', addedToStrategy: false },
]

const DEMO_HYPOTHESES: Hypothesis[] = [
  { id: 'h1', text: 'B2B buyers who consume 3+ pieces of educational content before purchasing have 40% higher LTV', confidence: 78, dataPoints: ['HubSpot 2026 report', 'Internal cohort analysis', 'Gartner buyer journey study'], status: 'Validated' },
  { id: 'h2', text: 'Email campaigns sent Tuesday 8-10am outperform Friday sends by 23% open rate in our vertical', confidence: 65, dataPoints: ['12 months send-time analysis', 'Mailchimp benchmark data'], status: 'Testing' },
  { id: 'h3', text: 'Social proof (testimonial + stat) in CTA buttons increases conversion by 15-20% vs generic copy', confidence: 72, dataPoints: ['3 competitor landing pages', 'ConversionXL research', '5 A/B test results'], status: 'Untested' },
  { id: 'h4', text: 'Chatbot-first onboarding reduces churn in first 30 days for SMB segment', confidence: 55, dataPoints: ['Intercom benchmark 2025', 'Internal churn analysis Q1'], status: 'Rejected' },
]

const DEMO_COMPETITORS: Competitor[] = [
  { id: 'c1', name: 'HubSpot', recentActivity: 'Launched AI-powered content suite "Breeze"', strategyShift: 'Moving upmarket, reducing SMB-focused features', sentiment: 'neutral', monitored: true, lastUpdated: '2h ago' },
  { id: 'c2', name: 'Mailchimp', recentActivity: 'Acquired Intuit-backed journey analytics tool', strategyShift: 'Pivoting to full-funnel analytics play', sentiment: 'negative', monitored: true, lastUpdated: '1d ago' },
  { id: 'c3', name: 'ActiveCampaign', recentActivity: 'Announced pricing cut for teams under 10 seats', strategyShift: 'Aggressive SMB land-grab campaign', sentiment: 'positive', monitored: false, lastUpdated: '3d ago' },
]

const DEMO_PAST_REPORTS = [
  { id: 'r1', date: '2026-05-20', topic: 'AI Marketing Tools Landscape Q2 2026', keyFindings: 'Market growing at 34% CAGR, consolidation ongoing among mid-tier players' },
  { id: 'r2', date: '2026-05-10', topic: 'SMB Buyer Journey Analysis', keyFindings: '73% of SMB buyers begin with organic search; average 4.2 touchpoints before conversion' },
  { id: 'r3', date: '2026-04-28', topic: 'Keyword Intelligence: Marketing Automation', keyFindings: '840 high-intent keywords identified, 12 with <KD 30 and >5K monthly searches' },
]

const TREND_CAT_STYLES: Record<TrendCategory, string> = {
  Industry: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
  Competitor: 'bg-red-900/40 text-red-300 border border-red-700/50',
  Consumer: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
  Tech: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50',
  Social: 'bg-pink-900/40 text-pink-300 border border-pink-700/50',
}

const HYPO_STATUS_STYLES: Record<HypothesisStatus, string> = {
  Untested: 'bg-gray-700 text-gray-400',
  Testing: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
  Validated: 'bg-green-900/40 text-green-300 border border-green-700/50',
  Rejected: 'bg-red-900/40 text-red-300 border border-red-700/50',
}

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-green-500',
  neutral: 'bg-yellow-500',
  negative: 'bg-red-500',
}

export default function ResearchPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('trending')
  const [type, setType] = useState<ResearchType>('market')
  const [query, setQuery] = useState('')
  const [competitorUrl, setCompetitorUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [savedLoading, setSavedLoading] = useState(true)

  // Trends state
  const [trends, setTrends] = useState<Trend[]>(DEMO_TRENDS)
  const [trendCategory, setTrendCategory] = useState<TrendCategory | 'All'>('All')

  // Hypotheses state
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(DEMO_HYPOTHESES)

  // Competitors state
  const [competitors, setCompetitors] = useState<Competitor[]>(DEMO_COMPETITORS)
  const [addingCompetitor, setAddingCompetitor] = useState(false)
  const [newCompetitorName, setNewCompetitorName] = useState('')

  // New Research modal
  const [newResearchOpen, setNewResearchOpen] = useState(false)

  // Export modal
  const [exportOpen, setExportOpen] = useState(false)
  const [exportDateFrom, setExportDateFrom] = useState('2026-05-01')
  const [exportDateTo, setExportDateTo] = useState('2026-05-26')

  // Selected insights to feed to strategy
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set())

  // Toast
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const loadSaved = useCallback(async (wid: string) => {
    setSavedLoading(true)
    try {
      const res = await fetch(`/api/agents/research?workspaceId=${wid}`)
      const data = await res.json()
      if (Array.isArray(data)) setSaved(data)
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) loadSaved(wid)
  }, [loadSaved])

  async function research() {
    if (!query.trim()) { setError('Enter a research query'); return }
    if (type === 'competitor' && !competitorUrl.trim()) { setError('Enter a competitor URL'); return }
    setLoading(true); setError(''); setReport(null)
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: query.trim(), type, competitorUrl: type === 'competitor' ? competitorUrl.trim() : undefined }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setReport(data.report)
      await loadSaved(workspaceId)
      setNewResearchOpen(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const addToStrategy = (trendId: string, trendTopic: string) => {
    setTrends(prev => prev.map(t => t.id === trendId ? { ...t, addedToStrategy: true } : t))
    showToast(`✓ "${trendTopic}" added to Strategy`)
  }

  const feedSelectedToStrategy = () => {
    const count = selectedInsights.size
    if (count === 0) { showToast('Select insights to feed first'); return }
    setSelectedInsights(new Set())
    showToast(`✓ ${count} insight${count > 1 ? 's' : ''} sent to Strategy — they'll appear in next generation`)
  }

  const toggleMonitor = (id: string) => {
    setCompetitors(prev => prev.map(c => c.id === id ? { ...c, monitored: !c.monitored } : c))
  }

  const addCompetitor = () => {
    if (!newCompetitorName.trim()) return
    const newComp: Competitor = {
      id: `c${Date.now()}`,
      name: newCompetitorName,
      recentActivity: 'Monitoring started',
      strategyShift: 'Pending analysis',
      sentiment: 'neutral',
      monitored: true,
      lastUpdated: 'just now',
    }
    setCompetitors(prev => [...prev, newComp])
    setNewCompetitorName('')
    setAddingCompetitor(false)
    showToast(`${newCompetitorName} added to competitor watch list`)
  }

  const testHypothesis = (hypoId: string) => {
    setHypotheses(prev => prev.map(h => h.id === hypoId ? { ...h, status: 'Testing' } : h))
    showToast('Hypothesis queued for A/B test — opening Testing Lab')
  }

  const deployHypothesisToStrategy = (text: string) => {
    showToast('Hypothesis deployed to Strategy agent')
    const existing = JSON.parse(localStorage.getItem('pendingCMOInsights') || '[]')
    existing.push({ context: `Research Hypothesis: ${text}`, timestamp: new Date().toISOString(), source: 'research' })
    localStorage.setItem('pendingCMOInsights', JSON.stringify(existing))
  }

  const downloadExport = () => {
    const payload = { generated: new Date().toISOString(), dateRange: { from: exportDateFrom, to: exportDateTo }, trends, hypotheses, competitors, reports: DEMO_PAST_REPORTS }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `research-export-${exportDateTo}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
    showToast('Export downloaded')
  }

  const filteredTrends = trendCategory === 'All' ? trends : trends.filter(t => t.category === trendCategory)

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: 'trending', label: '🔥 Trending Now' },
    { key: 'hypotheses', label: '💡 Hypotheses' },
    { key: 'competitors', label: '🏢 Competitor Intel' },
    { key: 'reports', label: '📄 Research Reports' },
  ]

  return (
    <div className="p-8 max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🔍 Market Research</h1>
          <p className="text-gray-400 text-sm mt-1">Trending intelligence, competitor monitoring, and AI-generated hypotheses.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExportOpen(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors">
            📊 Export
          </button>
          <button onClick={() => setNewResearchOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
            🔍 New Research
          </button>
        </div>
      </div>

      {/* Feed to Strategy bar */}
      {selectedInsights.size > 0 && (
        <div className="mb-4 bg-indigo-950 border border-indigo-700 rounded-xl px-5 py-3 flex items-center justify-between">
          <p className="text-indigo-300 text-sm"><span className="font-bold">{selectedInsights.size}</span> insight{selectedInsights.size > 1 ? 's' : ''} selected</p>
          <div className="flex gap-2">
            <button onClick={() => setSelectedInsights(new Set())} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">Clear</button>
            <button onClick={feedSelectedToStrategy} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors">
              Feed to Strategy →
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.key ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Trending Now Tab */}
      {activeTab === 'trending' && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            {(['All', 'Industry', 'Competitor', 'Consumer', 'Tech', 'Social'] as const).map(cat => (
              <button key={cat} onClick={() => setTrendCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${trendCategory === cat ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredTrends.map(trend => (
              <div key={trend.id}
                className={`bg-gray-900 border rounded-xl p-5 space-y-3 cursor-pointer transition-colors ${selectedInsights.has(trend.id) ? 'border-indigo-600' : 'border-gray-800 hover:border-gray-700'}`}
                onClick={() => {
                  setSelectedInsights(prev => {
                    const next = new Set(prev)
                    if (next.has(trend.id)) next.delete(trend.id); else next.add(trend.id)
                    return next
                  })
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-white font-semibold text-sm">{trend.topic}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${TREND_CAT_STYLES[trend.category]}`}>{trend.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${trend.momentum === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        {trend.momentum === 'up' ? '↑' : '↓'} {Math.abs(trend.momentumPct)}%
                      </span>
                      <span className="text-gray-500 text-xs">{trend.volume}</span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SENTIMENT_DOT[trend.sentiment]}`} />
                      <span className="text-gray-500 text-xs capitalize">{trend.sentiment}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {trend.relatedKeywords.map(kw => (
                    <span key={kw} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">{kw}</span>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-1" onClick={e => e.stopPropagation()}>
                  {selectedInsights.has(trend.id) && (
                    <span className="text-indigo-400 text-xs">✓ Selected</span>
                  )}
                  {!selectedInsights.has(trend.id) && <span />}
                  {trend.addedToStrategy ? (
                    <span className="text-green-400 text-xs">✓ Added to Strategy</span>
                  ) : (
                    <button onClick={() => addToStrategy(trend.id, trend.topic)}
                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                      Add to Strategy
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hypotheses Tab */}
      {activeTab === 'hypotheses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">AI-generated market hypotheses ready for testing or deployment.</p>
            <button onClick={feedSelectedToStrategy} disabled={selectedInsights.size === 0}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40">
              Feed Selected to Strategy
            </button>
          </div>
          {hypotheses.map(hypo => (
            <div key={hypo.id}
              className={`bg-gray-900 border rounded-xl p-5 space-y-3 cursor-pointer transition-colors ${selectedInsights.has(hypo.id) ? 'border-indigo-600' : 'border-gray-800 hover:border-gray-700'}`}
              onClick={() => {
                setSelectedInsights(prev => {
                  const next = new Set(prev)
                  if (next.has(hypo.id)) next.delete(hypo.id); else next.add(hypo.id)
                  return next
                })
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-white text-sm leading-relaxed flex-1">{hypo.text}</p>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${HYPO_STATUS_STYLES[hypo.status]}`}>{hypo.status}</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${hypo.confidence >= 70 ? 'bg-green-500' : hypo.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${hypo.confidence}%` }} />
                </div>
                <span className="text-gray-400 text-xs w-24 flex-shrink-0">{hypo.confidence}% confidence</span>
              </div>

              <div>
                <p className="text-gray-600 text-xs mb-1.5">Supporting data:</p>
                <div className="flex flex-wrap gap-2">
                  {hypo.dataPoints.map(dp => (
                    <span key={dp} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">{dp}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
                {hypo.status === 'Untested' && (
                  <button onClick={() => testHypothesis(hypo.id)}
                    className="px-3 py-1.5 text-xs bg-yellow-700/60 hover:bg-yellow-700 text-yellow-200 rounded-lg transition-colors">
                    Test This Hypothesis
                  </button>
                )}
                <button onClick={() => deployHypothesisToStrategy(hypo.text)}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                  Deploy to Strategy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Competitor Intel Tab */}
      {activeTab === 'competitors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">Monitor competitor movements and strategy shifts in real-time.</p>
            <button onClick={() => setAddingCompetitor(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
              + Add Competitor
            </button>
          </div>

          {addingCompetitor && (
            <div className="bg-gray-900 border border-indigo-700/60 rounded-xl p-4 flex gap-3">
              <input value={newCompetitorName} onChange={e => setNewCompetitorName(e.target.value)}
                placeholder="Competitor name..."
                onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              <button onClick={addCompetitor} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">Add</button>
              <button onClick={() => setAddingCompetitor(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
            </div>
          )}

          {competitors.map(comp => (
            <div key={comp.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-400">
                    {comp.name[0]}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{comp.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${SENTIMENT_DOT[comp.sentiment]}`} />
                      <span className="text-gray-500 text-xs capitalize">{comp.sentiment} sentiment</span>
                      <span className="text-gray-600 text-xs">Updated {comp.lastUpdated}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleMonitor(comp.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${comp.monitored ? 'bg-green-900/40 text-green-300 border border-green-700/50' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {comp.monitored ? '● Monitoring' : 'Monitor'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Recent Activity</p>
                  <p className="text-gray-200 text-sm">{comp.recentActivity}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-yellow-500 text-xs mb-1">⚡ Strategy Shift Detected</p>
                  <p className="text-gray-200 text-sm">{comp.strategyShift}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => {
                  setSelectedInsights(prev => { const next = new Set(prev); next.add(comp.id); return next })
                  showToast(`${comp.name} intel added to feed`)
                }} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">
                  Add to Strategy Feed
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Research Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">Saved deep-dive research reports and AI-generated market analysis.</p>
            <button onClick={() => setNewResearchOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
              + Generate New Report
            </button>
          </div>

          {/* Past reports (static demo) */}
          <div className="space-y-3">
            {DEMO_PAST_REPORTS.map(r => (
              <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white font-medium text-sm">{r.topic}</p>
                    <p className="text-gray-500 text-xs mt-1">{r.date}</p>
                    <p className="text-gray-400 text-xs mt-2 leading-relaxed">{r.keyFindings}</p>
                  </div>
                  <span className="px-2 py-1 text-xs bg-indigo-900/40 text-indigo-300 rounded-lg flex-shrink-0">View</span>
                </div>
              </div>
            ))}

            {savedLoading && <div className="text-gray-600 text-sm text-center py-6 animate-pulse">Loading saved reports...</div>}

            {!savedLoading && saved.map(s => (
              <button key={s.id} onClick={() => setReport(s.content_json)}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{RESEARCH_TYPES.find(t => t.id === s.content_json?.type)?.icon || '📄'}</span>
                    <div>
                      <p className="text-white text-sm font-medium">{s.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">
                    {s.content_json?.type?.replace('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Report Display (when a saved report is opened) */}
      {report && activeTab === 'reports' && (
        <div className="mt-6 space-y-5">
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{RESEARCH_TYPES.find(t => t.id === report.type)?.icon}</span>
              <div>
                <h2 className="text-white font-bold text-lg">{report.title}</h2>
                <span className="text-indigo-400 text-xs uppercase tracking-wide">{report.type?.replace('_', ' ')} Report</span>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{report.summary}</p>
          </div>

          {report.keyFindings?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Key Findings</h3>
              <ol className="space-y-3">
                {report.keyFindings.map((f, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-indigo-400 font-bold flex-shrink-0 w-5">{i + 1}.</span>
                    <span className="text-gray-300 leading-relaxed">{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {report.opportunities?.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Opportunities</h3>
                <div className="space-y-2">
                  {report.opportunities.map((o, i) => (
                    <div key={i} className="bg-green-900/20 border border-green-800/30 rounded-lg px-3 py-2">
                      <p className="text-green-300 text-xs leading-relaxed">{o}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {report.threats?.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Threats & Risks</h3>
                <div className="space-y-2">
                  {report.threats.map((t, i) => (
                    <div key={i} className="bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                      <p className="text-red-300 text-xs leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setReport(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors">
            Close Report
          </button>
        </div>
      )}

      {/* New Research Modal */}
      {newResearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewResearchOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">New Research</h2>
              <button onClick={() => setNewResearchOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RESEARCH_TYPES.map(t => (
                <button key={t.id} onClick={() => { setType(t.id); setError('') }}
                  className={`p-3 rounded-xl border text-left transition-all ${type === t.id ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-800 bg-gray-800 hover:border-gray-600'}`}>
                  <div className="text-xl mb-1">{t.icon}</div>
                  <p className={`font-semibold text-xs ${type === t.id ? 'text-indigo-300' : 'text-white'}`}>{t.label}</p>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {type === 'competitor' ? (
                <>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Competitor name"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  <input value={competitorUrl} onChange={e => setCompetitorUrl(e.target.value)} placeholder="https://competitor.com" type="url"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </>
              ) : (
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && research()}
                  placeholder={type === 'market' ? 'e.g. AI marketing tools for SMBs' : type === 'keyword' ? 'e.g. social media scheduling software' : 'Research query...'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              )}
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setNewResearchOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={research} disabled={loading || !workspaceId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Researching...</> : '🔍 Research Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setExportOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">📊 Export Research Data</h2>
              <button onClick={() => setExportOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">From</label>
                <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">To</label>
                <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
            </div>
            <p className="text-gray-500 text-xs">Exports: trends, hypotheses, competitor intel, and report summaries as JSON.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setExportOpen(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={downloadExport} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">Export</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
