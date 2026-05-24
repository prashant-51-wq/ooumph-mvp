'use client'

import { useEffect, useState, useCallback } from 'react'

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
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'agents' | 'targets'>('overview')
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
      <div className="flex gap-1 mb-6 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
        {(['overview', 'reports', 'agents', 'targets'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? '📈 Overview' : tab === 'reports' ? '📋 AI Reports' : tab === 'agents' ? '🤖 Agent Activity' : '🎯 KPI Targets'}
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
        </>
      )}
    </div>
  )
}
