'use client'

import { useEffect, useState, useCallback } from 'react'

// ── GA4 Intelligence types ────────────────────────────────────────────────────

type GA4Highlight = {
  metric: string
  value: string
  trend: 'up' | 'down' | 'stable'
  insight: string
}

type ChannelBreakdown = {
  channel: string
  sessions: number
  recommendation: string
}

type GA4Intelligence = {
  summary: string
  healthScore: number
  highlights: GA4Highlight[]
  topOpportunities: string[]
  contentGaps: string[]
  channelBreakdown: ChannelBreakdown[]
  weeklyActions: string[]
}

// ── SEO Intelligence types ────────────────────────────────────────────────────

type WinningKeyword = {
  keyword: string
  clicks: number
  position: number
  opportunity: string
}

type SEOIntelligence = {
  summary: string
  seoHealthScore: number
  topWinningKeywords: WinningKeyword[]
  quickWins: string[]
  contentRecommendations: string[]
  technicalIssues: string[]
  competitorGaps: string[]
  monthlyActions: string[]
}

type KPIStatus = {
  metric: string
  target: string
  current: string | number
  status: 'on_track' | 'at_risk' | 'behind' | 'exceeded'
  delta: string
}

type PlatformSummary = {
  platform: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  revenue: number
  ctr: number
  roas: number
  postsPublished: number
}

type ContentSummary = {
  totalArtifacts: number
  approved: number
  pending: number
  byType: Record<string, number>
  topPerformingType: string
}

type AgentActivity = {
  totalRuns: number
  completed: number
  failed: number
  byAgent: Record<string, number>
  activeAgents: string[]
}

type LiveData = {
  platformPerformance: PlatformSummary[]
  contentSummary: ContentSummary
  agentActivity: AgentActivity
  kpis: KPIStatus[]
  days: number
}

type AnalyticsReport = {
  id: string
  title: string
  content_json: {
    executiveSummary: string
    overallHealthScore: number
    overallHealth: string
    kpis: KPIStatus[]
    platformPerformance: PlatformSummary[]
    contentSummary: ContentSummary
    agentActivity: AgentActivity
    topInsights: string[]
    recommendations: string[]
    forecastedImpact: string
    generatedAt: string
    period: string
  }
  created_at: string
  approval_status: string
}

const STATUS_COLORS: Record<string, string> = {
  on_track: 'text-green-400 bg-green-400/10',
  exceeded: 'text-emerald-400 bg-emerald-400/10',
  at_risk: 'text-amber-400 bg-amber-400/10',
  behind: 'text-red-400 bg-red-400/10',
}

const STATUS_DOT: Record<string, string> = {
  on_track: 'bg-green-400',
  exceeded: 'bg-emerald-400',
  at_risk: 'bg-amber-400',
  behind: 'bg-red-400',
}

const HEALTH_COLOR: Record<string, string> = {
  excellent: 'text-green-400',
  good: 'text-blue-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
}

const HEALTH_RING: Record<string, string> = {
  excellent: 'stroke-green-400',
  good: 'stroke-blue-400',
  fair: 'stroke-amber-400',
  poor: 'stroke-red-400',
}

const PLATFORM_ICONS: Record<string, string> = {
  meta_ads: '🟦',
  google_ads: '🔴',
  dv360: '📺',
  instagram: '📸',
  linkedin: '💼',
  twitter: '🐦',
  youtube: '▶️',
  whatsapp: '💬',
}

const DAYS_OPTIONS = [7, 14, 30, 90]

interface KPITargets {
  targetImpressions: number
  targetROAS: number
  targetApprovalRate: number
  targetAgentRuns: number
  targetConversions: number
  targetCPA: number
}

export default function AnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [liveData, setLiveData] = useState<LiveData | null>(null)
  const [reports, setReports] = useState<AnalyticsReport[]>([])
  const [selectedReport, setSelectedReport] = useState<AnalyticsReport | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'agents' | 'targets' | 'ga4' | 'seo'>('overview')

  // GA4 Intelligence state
  const [ga4Intelligence, setGa4Intelligence] = useState<GA4Intelligence | null>(null)
  const [ga4Loading, setGa4Loading] = useState(false)
  const [ga4Error, setGa4Error] = useState<{ error: string; configured: boolean } | null>(null)

  // SEO Intelligence state
  const [seoIntelligence, setSeoIntelligence] = useState<SEOIntelligence | null>(null)
  const [seoLoading, setSeoLoading] = useState(false)
  const [seoError, setSeoError] = useState<{ error: string; configured: boolean } | null>(null)
  const [kpiTargets, setKpiTargets] = useState<KPITargets | null>(null)
  const [savingTargets, setSavingTargets] = useState(false)
  const [targetsResult, setTargetsResult] = useState('')

  const fetchAll = useCallback(async (wid: string, d: number) => {
    setLoading(true)
    try {
      const [liveRes, reportsRes, targetsRes] = await Promise.all([
        fetch(`/api/agents/analytics?workspaceId=${wid}&mode=live&days=${d}`),
        fetch(`/api/agents/analytics?workspaceId=${wid}`),
        fetch(`/api/agents/analytics/targets?workspaceId=${wid}`),
      ])
      if (liveRes.ok) setLiveData(await liveRes.json())
      if (reportsRes.ok) {
        const r = await reportsRes.json()
        setReports(r)
        if (r.length && !selectedReport) setSelectedReport(r[0])
      }
      if (targetsRes.ok) setKpiTargets(await targetsRes.json())
    } finally {
      setLoading(false)
    }
  }, [selectedReport])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) fetchAll(wid, days)
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateReport() {
    if (!workspaceId) return
    setGenerating(true)
    try {
      const res = await fetch('/api/agents/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, days }),
      })
      if (res.ok) {
        await fetchAll(workspaceId, days)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function saveTargets() {
    if (!workspaceId || !kpiTargets) return
    setSavingTargets(true); setTargetsResult('')
    try {
      const res = await fetch('/api/agents/analytics/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...kpiTargets }),
      })
      const data = await res.json()
      setTargetsResult(data.error ? `Error: ${data.error}` : 'KPI targets saved successfully.')
      if (data.targets) setKpiTargets(data.targets)
    } catch (e) { setTargetsResult(`Error: ${String(e)}`) } finally { setSavingTargets(false) }
  }

  async function fetchGA4Intelligence() {
    if (!workspaceId) return
    setGa4Loading(true)
    setGa4Error(null)
    try {
      const res = await fetch('/api/agents/analytics/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, days }),
      })
      const data = await res.json()
      if (data.configured === false || data.error) {
        setGa4Error({ error: data.error, configured: data.configured ?? true })
      } else {
        setGa4Intelligence(data.intelligence)
      }
    } catch (e) {
      setGa4Error({ error: String(e), configured: true })
    } finally {
      setGa4Loading(false)
    }
  }

  async function fetchSEOIntelligence() {
    if (!workspaceId) return
    setSeoLoading(true)
    setSeoError(null)
    try {
      const res = await fetch('/api/agents/analytics/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, days }),
      })
      const data = await res.json()
      if (data.configured === false || data.error) {
        setSeoError({ error: data.error, configured: data.configured ?? true })
      } else {
        setSeoIntelligence(data.intelligence)
      }
    } catch (e) {
      setSeoError({ error: String(e), configured: true })
    } finally {
      setSeoLoading(false)
    }
  }

  const report = selectedReport?.content_json
  const circumference = 2 * Math.PI * 40
  const healthScore = report?.overallHealthScore ?? 0
  const dashOffset = circumference - (healthScore / 100) * circumference

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics & Reporting</h1>
          <p className="text-gray-400 text-sm mt-1">
            Data Aggregator · Report Generator · KPI Tracker
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Days selector */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded text-sm transition-colors ${days === d ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={generateReport}
            disabled={generating || !workspaceId}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {generating ? '⏳ Generating...' : '📊 Generate AI Report'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
        {([
          { id: 'overview', label: '📈 Overview' },
          { id: 'reports', label: '📋 AI Reports' },
          { id: 'agents', label: '🤖 Agent Activity' },
          { id: 'targets', label: '🎯 KPI Targets' },
          { id: 'ga4', label: '🌐 GA4 Intelligence' },
          { id: 'seo', label: '🔍 SEO Intelligence' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading analytics...</div>
      ) : (
        <>
          {/* ── Overview Tab ─────────────────────────────────────── */}
          {activeTab === 'overview' && liveData && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div>
                <h2 className="text-white font-semibold mb-3">KPI Tracker</h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveData.kpis.map(kpi => (
                    <div key={kpi.metric} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-xs">{kpi.metric}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[kpi.status] || 'text-gray-400 bg-gray-800'}`}>
                          {kpi.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xl font-bold text-white mb-1">
                        {typeof kpi.current === 'number' ? kpi.current.toLocaleString() : kpi.current}
                      </div>
                      <div className="text-xs text-gray-500">Target: {kpi.target}</div>
                      <div className="text-xs text-gray-500 mt-1">{kpi.delta}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform Performance */}
              {liveData.platformPerformance.length > 0 && (
                <div>
                  <h2 className="text-white font-semibold mb-3">Platform Performance</h2>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          {['Platform', 'Impressions', 'Clicks', 'CTR', 'Spend', 'ROAS', 'Posts'].map(h => (
                            <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.platformPerformance.map(p => (
                          <tr key={p.platform} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3 text-sm text-white">
                              {PLATFORM_ICONS[p.platform] || '📱'} {p.platform.replace('_', ' ')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">{p.impressions.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-gray-300">{p.clicks.toLocaleString()}</td>
                            <td className={`px-4 py-3 text-sm font-medium ${p.ctr >= 0.02 ? 'text-green-400' : p.ctr >= 0.01 ? 'text-amber-400' : 'text-gray-400'}`}>
                              {p.impressions > 0 ? `${(p.ctr * 100).toFixed(2)}%` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">
                              {p.spend > 0 ? `$${p.spend.toFixed(2)}` : '—'}
                            </td>
                            <td className={`px-4 py-3 text-sm font-medium ${p.roas >= 2.5 ? 'text-green-400' : p.roas > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                              {p.roas > 0 ? `${p.roas.toFixed(2)}x` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300">{p.postsPublished}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {liveData.platformPerformance.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        No performance data yet — publish campaigns to platforms to see data here.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Summary */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-4">Content Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Total Artifacts</span>
                      <span className="text-white font-medium">{liveData.contentSummary.totalArtifacts}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Approved</span>
                      <span className="text-green-400 font-medium">{liveData.contentSummary.approved}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Pending Review</span>
                      <span className="text-amber-400 font-medium">{liveData.contentSummary.pending}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Top Content Type</span>
                      <span className="text-indigo-400 font-medium">{liveData.contentSummary.topPerformingType}</span>
                    </div>
                  </div>
                  {/* Type breakdown bar */}
                  <div className="mt-4 space-y-2">
                    {Object.entries(liveData.contentSummary.byType).slice(0, 5).map(([type, count]) => (
                      <div key={type}>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{type}</span><span>{count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(100, (count / liveData.contentSummary.totalArtifacts) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* No data empty state */}
                {liveData.platformPerformance.length === 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col items-center justify-center text-center">
                    <div className="text-4xl mb-3">📣</div>
                    <h3 className="text-white font-semibold mb-1">No Ad Data Yet</h3>
                    <p className="text-gray-400 text-sm">Publish campaigns to Meta Ads, Google Ads, or DV360 to see performance data here.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Reports Tab ─────────────────────────────────────── */}
          {activeTab === 'reports' && (
            <div className="grid grid-cols-3 gap-6">
              {/* Report list */}
              <div className="space-y-2">
                <p className="text-gray-400 text-xs mb-3">SAVED REPORTS</p>
                {reports.length === 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-sm">No reports yet.</p>
                    <p className="text-gray-600 text-xs mt-1">Click "Generate AI Report" to create one.</p>
                  </div>
                )}
                {reports.map(r => {
                  const content = r.content_json
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedReport(r)}
                      className={`w-full text-left bg-gray-900 border rounded-xl p-4 transition-colors ${
                        selectedReport?.id === r.id ? 'border-indigo-500' : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${HEALTH_COLOR[content?.overallHealth] || 'text-white'}`}>
                          {content?.overallHealth?.toUpperCase() || 'REPORT'}
                        </span>
                        <span className="text-xl font-bold text-white">{content?.overallHealthScore ?? '—'}</span>
                      </div>
                      <p className="text-gray-400 text-xs">{content?.period || r.title}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </button>
                  )
                })}
              </div>

              {/* Report detail */}
              <div className="col-span-2">
                {report ? (
                  <div className="space-y-5">
                    {/* Health score + summary */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex gap-6">
                      <div className="flex-shrink-0">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
                          <circle
                            cx="50" cy="50" r="40" fill="none"
                            className={HEALTH_RING[report.overallHealth] || 'stroke-gray-400'}
                            strokeWidth="10"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                          <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                            className="text-white" fill="white" fontSize="20" fontWeight="bold">
                            {healthScore}
                          </text>
                        </svg>
                        <p className={`text-center text-sm font-semibold capitalize ${HEALTH_COLOR[report.overallHealth] || 'text-white'}`}>
                          {report.overallHealth}
                        </p>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-semibold mb-2">Executive Summary</h3>
                        <p className="text-gray-300 text-sm leading-relaxed">{report.executiveSummary}</p>
                        <p className="text-gray-500 text-xs mt-2">{report.period} · Generated {new Date(report.generatedAt).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* KPIs */}
                    <div>
                      <h3 className="text-white font-semibold mb-3">KPI Status</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {report.kpis?.map(kpi => (
                          <div key={kpi.metric} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${STATUS_DOT[kpi.status] || 'bg-gray-400'}`} />
                              <span className="text-gray-400 text-xs">{kpi.metric}</span>
                            </div>
                            <div className="text-white font-semibold text-sm">
                              {typeof kpi.current === 'number' ? kpi.current.toLocaleString() : kpi.current}
                            </div>
                            <div className="text-gray-500 text-xs">Target: {kpi.target}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Insights */}
                    {report.topInsights?.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-white font-semibold mb-3">💡 Top Insights</h3>
                        <ul className="space-y-2">
                          {report.topInsights.map((insight, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                              <span className="text-indigo-400 mt-0.5">→</span>
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {report.recommendations?.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-white font-semibold mb-3">🎯 Recommendations</h3>
                        <ol className="space-y-2">
                          {report.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                              <span className="bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              <span className="text-gray-300">{rec}</span>
                            </li>
                          ))}
                        </ol>
                        {report.forecastedImpact && (
                          <div className="mt-4 bg-indigo-950/50 border border-indigo-800/50 rounded-lg p-3">
                            <p className="text-indigo-300 text-xs font-medium mb-1">Expected Impact</p>
                            <p className="text-gray-300 text-sm">{report.forecastedImpact}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-500">
                    <div className="text-4xl mb-3">📊</div>
                    <p>Select a report or generate a new one.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Agent Activity Tab ─────────────────────────────── */}
          {activeTab === 'agents' && liveData && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Runs', value: liveData.agentActivity.totalRuns, color: 'text-white' },
                  { label: 'Completed', value: liveData.agentActivity.completed, color: 'text-green-400' },
                  { label: 'Failed', value: liveData.agentActivity.failed, color: 'text-red-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="text-gray-400 text-xs mb-1">{stat.label}</div>
                    <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Agent breakdown */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">Agent Run Breakdown</h3>
                {Object.keys(liveData.agentActivity.byAgent).length === 0 ? (
                  <p className="text-gray-500 text-sm">No agent runs in this period.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(liveData.agentActivity.byAgent)
                      .sort(([, a], [, b]) => b - a)
                      .map(([agent, count]) => (
                        <div key={agent}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">{agent.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400">{count} runs</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${(count / liveData.agentActivity.totalRuns) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Active agents list */}
              {liveData.agentActivity.activeAgents.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-3">Active Agents</h3>
                  <div className="flex flex-wrap gap-2">
                    {liveData.agentActivity.activeAgents.map(a => (
                      <span key={a} className="bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs px-3 py-1.5 rounded-full">
                        🤖 {a.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── KPI Targets Tab ─────────────────────────────────── */}
          {activeTab === 'targets' && (
            <div className="space-y-6">
              <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold">🎯 KPI Targets</h3>
                    <p className="text-gray-500 text-xs mt-1">Set custom thresholds for your KPI tracker. Weekly alerts email you when any KPI falls below target.</p>
                  </div>
                  <button onClick={saveTargets} disabled={savingTargets || !kpiTargets}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {savingTargets ? '⏳ Saving...' : '💾 Save Targets'}
                  </button>
                </div>
                {targetsResult && <p className={`text-xs mb-4 ${targetsResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{targetsResult}</p>}
                {kpiTargets && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {([
                      { key: 'targetImpressions', label: 'Target Impressions', step: 1000 },
                      { key: 'targetROAS', label: 'Target ROAS (x)', step: 0.1 },
                      { key: 'targetApprovalRate', label: 'Approval Rate (%)', step: 5 },
                      { key: 'targetAgentRuns', label: 'Agent Runs Target', step: 1 },
                      { key: 'targetConversions', label: 'Conversion Target', step: 1 },
                      { key: 'targetCPA', label: 'Max CPA (USD)', step: 1 },
                    ] as Array<{ key: keyof KPITargets; label: string; step: number }>).map(({ key, label, step }) => (
                      <div key={key} className="bg-gray-800 rounded-lg p-4">
                        <label className="text-gray-400 text-xs block mb-2">{label}</label>
                        <input
                          type="number"
                          value={kpiTargets[key]}
                          onChange={e => setKpiTargets(prev => prev ? ({ ...prev, [key]: parseFloat(e.target.value) || 0 }) : prev)}
                          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 text-white text-sm rounded-lg"
                          step={step}
                          min={0}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                  <p className="text-gray-500 text-xs">
                    Weekly alert fires every Monday 08:00 UTC — emails your approval address when any KPI is behind. Powered by <code className="text-gray-400">/api/cron/kpi-alert</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── GA4 Intelligence Tab ─────────────────────────────── */}
          {activeTab === 'ga4' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-semibold">🌐 GA4 Intelligence</h2>
                  <p className="text-gray-500 text-xs mt-1">AI-powered analysis of your Google Analytics 4 data</p>
                </div>
                <button
                  onClick={fetchGA4Intelligence}
                  disabled={ga4Loading || !workspaceId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {ga4Loading ? '⏳ Analyzing your traffic data...' : '🌐 Fetch GA4 Insights'}
                </button>
              </div>

              {/* Not configured */}
              {ga4Error && ga4Error.configured === false && (
                <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-5">
                  <h3 className="text-amber-300 font-semibold mb-2">GA4 Not Configured</h3>
                  <p className="text-amber-200/70 text-sm mb-3">{ga4Error.error}</p>
                  <ol className="space-y-1.5 text-sm text-gray-300">
                    <li className="flex items-start gap-2"><span className="text-indigo-400">1.</span> Go to <a href="/dashboard/settings?tab=api-keys" className="text-indigo-400 underline">Settings → API Keys</a></li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">2.</span> Add your GA4 Property ID (found in GA4 Admin → Property Settings)</li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">3.</span> Add your Google Analytics Access Token (OAuth2 Bearer token with read access)</li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">4.</span> Return here and click "Fetch GA4 Insights"</li>
                  </ol>
                </div>
              )}

              {/* Generic error */}
              {ga4Error && ga4Error.configured !== false && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
                  <p className="text-red-300 text-sm">{ga4Error.error}</p>
                </div>
              )}

              {/* Results */}
              {ga4Intelligence && (
                <div className="space-y-5">
                  {/* Health score + summary */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex gap-6">
                    <div className="flex-shrink-0">
                      {(() => {
                        const score = ga4Intelligence.healthScore
                        const circ = 2 * Math.PI * 40
                        const offset = circ - (score / 100) * circ
                        const color = score >= 75 ? '#34d399' : score >= 50 ? '#60a5fa' : score >= 25 ? '#fbbf24' : '#f87171'
                        return (
                          <svg width="100" height="100" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
                            <circle cx="50" cy="50" r="40" fill="none" stroke={color}
                              strokeWidth="10" strokeDasharray={circ} strokeDashoffset={offset}
                              strokeLinecap="round" transform="rotate(-90 50 50)" />
                            <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                              fill="white" fontSize="20" fontWeight="bold">{score}</text>
                          </svg>
                        )
                      })()}
                      <p className="text-center text-xs text-gray-400 mt-1">Health Score</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-2">Executive Summary</h3>
                      <p className="text-gray-300 text-sm leading-relaxed">{ga4Intelligence.summary}</p>
                    </div>
                  </div>

                  {/* Highlights */}
                  {ga4Intelligence.highlights?.length > 0 && (
                    <div>
                      <h3 className="text-white font-semibold mb-3">Key Highlights</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ga4Intelligence.highlights.map((h, i) => (
                          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-gray-400 text-xs">{h.metric}</span>
                              <span className={`text-xs font-bold ${h.trend === 'up' ? 'text-green-400' : h.trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                                {h.trend === 'up' ? '↑' : h.trend === 'down' ? '↓' : '→'}
                              </span>
                            </div>
                            <div className="text-white font-bold text-lg mb-1">{h.value}</div>
                            <p className="text-gray-400 text-xs">{h.insight}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Opportunities */}
                  {ga4Intelligence.topOpportunities?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">🚀 Top Opportunities</h3>
                      <ul className="space-y-2">
                        {ga4Intelligence.topOpportunities.map((opp, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <span className="bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                            <span className="text-gray-300">{opp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content Gaps */}
                  {ga4Intelligence.contentGaps?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">📋 Content Gaps</h3>
                      <ul className="space-y-2">
                        {ga4Intelligence.contentGaps.map((gap, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                            <span className="text-amber-400 mt-0.5">•</span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Channel Breakdown */}
                  {ga4Intelligence.channelBreakdown?.length > 0 && (
                    <div>
                      <h3 className="text-white font-semibold mb-3">Channel Breakdown</h3>
                      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              {['Channel', 'Sessions', 'Recommendation'].map(h => (
                                <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ga4Intelligence.channelBreakdown.map((ch, i) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-3 text-sm text-white">{ch.channel}</td>
                                <td className="px-4 py-3 text-sm text-gray-300">{ch.sessions?.toLocaleString() || '—'}</td>
                                <td className="px-4 py-3 text-sm text-gray-400">{ch.recommendation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Weekly Actions */}
                  {ga4Intelligence.weeklyActions?.length > 0 && (
                    <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">⚡ Weekly Actions</h3>
                      <ul className="space-y-2">
                        {ga4Intelligence.weeklyActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-indigo-400 mt-0.5">→</span>
                            <span className="text-gray-300">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!ga4Intelligence && !ga4Error && !ga4Loading && (
                <div className="text-center py-20 text-gray-500">
                  <div className="text-4xl mb-3">🌐</div>
                  <p className="mb-1">No GA4 analysis yet.</p>
                  <p className="text-gray-600 text-xs">Click "Fetch GA4 Insights" to analyze your traffic data.</p>
                </div>
              )}
            </div>
          )}

          {/* ── SEO Intelligence Tab ──────────────────────────────── */}
          {activeTab === 'seo' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-semibold">🔍 SEO Intelligence</h2>
                  <p className="text-gray-500 text-xs mt-1">AI-powered analysis of your Google Search Console data</p>
                </div>
                <button
                  onClick={fetchSEOIntelligence}
                  disabled={seoLoading || !workspaceId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {seoLoading ? '⏳ Analyzing search performance...' : '🔍 Fetch SEO Report'}
                </button>
              </div>

              {/* Not configured */}
              {seoError && seoError.configured === false && (
                <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-5">
                  <h3 className="text-amber-300 font-semibold mb-2">Search Console Not Configured</h3>
                  <p className="text-amber-200/70 text-sm mb-3">{seoError.error}</p>
                  <ol className="space-y-1.5 text-sm text-gray-300">
                    <li className="flex items-start gap-2"><span className="text-indigo-400">1.</span> Go to <a href="/dashboard/settings?tab=api-keys" className="text-indigo-400 underline">Settings → API Keys</a></li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">2.</span> Add your Search Console Site URL (e.g. https://yoursite.com/)</li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">3.</span> Add your Google Access Token (or reuse your GA4 token if using the same Google account)</li>
                    <li className="flex items-start gap-2"><span className="text-indigo-400">4.</span> Return here and click "Fetch SEO Report"</li>
                  </ol>
                </div>
              )}

              {/* Generic error */}
              {seoError && seoError.configured !== false && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
                  <p className="text-red-300 text-sm">{seoError.error}</p>
                </div>
              )}

              {/* Results */}
              {seoIntelligence && (
                <div className="space-y-5">
                  {/* SEO health score + summary */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex gap-6">
                    <div className="flex-shrink-0">
                      {(() => {
                        const score = seoIntelligence.seoHealthScore
                        const circ = 2 * Math.PI * 40
                        const offset = circ - (score / 100) * circ
                        const color = score >= 75 ? '#34d399' : score >= 50 ? '#60a5fa' : score >= 25 ? '#fbbf24' : '#f87171'
                        return (
                          <svg width="100" height="100" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
                            <circle cx="50" cy="50" r="40" fill="none" stroke={color}
                              strokeWidth="10" strokeDasharray={circ} strokeDashoffset={offset}
                              strokeLinecap="round" transform="rotate(-90 50 50)" />
                            <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                              fill="white" fontSize="20" fontWeight="bold">{score}</text>
                          </svg>
                        )
                      })()}
                      <p className="text-center text-xs text-gray-400 mt-1">SEO Score</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-2">SEO Summary</h3>
                      <p className="text-gray-300 text-sm leading-relaxed">{seoIntelligence.summary}</p>
                    </div>
                  </div>

                  {/* Top Keywords table */}
                  {seoIntelligence.topWinningKeywords?.length > 0 && (
                    <div>
                      <h3 className="text-white font-semibold mb-3">🏆 Top Winning Keywords</h3>
                      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              {['Keyword', 'Clicks', 'Avg. Position', 'Opportunity'].map(h => (
                                <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {seoIntelligence.topWinningKeywords.map((kw, i) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-3 text-sm text-white font-medium">{kw.keyword}</td>
                                <td className="px-4 py-3 text-sm text-gray-300">{kw.clicks?.toLocaleString() || '—'}</td>
                                <td className={`px-4 py-3 text-sm font-medium ${
                                  kw.position <= 3 ? 'text-green-400' :
                                  kw.position <= 10 ? 'text-amber-400' : 'text-gray-400'
                                }`}>
                                  #{kw.position?.toFixed(1) || '—'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-400">{kw.opportunity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Quick Wins */}
                  {seoIntelligence.quickWins?.length > 0 && (
                    <div className="bg-green-950/30 border border-green-800/40 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">⚡ Quick Wins (Page 1 Opportunities)</h3>
                      <ul className="space-y-2">
                        {seoIntelligence.quickWins.map((win, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-green-400 mt-0.5">✓</span>
                            <span className="text-gray-300">{win}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content Recommendations */}
                  {seoIntelligence.contentRecommendations?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">📝 Content Recommendations</h3>
                      <ul className="space-y-2">
                        {seoIntelligence.contentRecommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <span className="bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                            <span className="text-gray-300">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Technical Issues */}
                  {seoIntelligence.technicalIssues?.length > 0 && (
                    <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">🔧 Technical Issues</h3>
                      <ul className="space-y-2">
                        {seoIntelligence.technicalIssues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-red-400 mt-0.5">!</span>
                            <span className="text-gray-300">{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Competitor Gaps */}
                  {seoIntelligence.competitorGaps?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">🎯 Competitor Gaps</h3>
                      <ul className="space-y-2">
                        {seoIntelligence.competitorGaps.map((gap, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                            <span className="text-indigo-400 mt-0.5">→</span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Monthly Actions */}
                  {seoIntelligence.monthlyActions?.length > 0 && (
                    <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-3">🗓 30-Day SEO Roadmap</h3>
                      <ul className="space-y-2">
                        {seoIntelligence.monthlyActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-indigo-400 mt-0.5">→</span>
                            <span className="text-gray-300">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!seoIntelligence && !seoError && !seoLoading && (
                <div className="text-center py-20 text-gray-500">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="mb-1">No SEO analysis yet.</p>
                  <p className="text-gray-600 text-xs">Click "Fetch SEO Report" to analyze your search performance.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
