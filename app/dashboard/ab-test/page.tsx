'use client'

import { useState, useEffect } from 'react'

type ContentType = 'headline' | 'cta' | 'email_subject' | 'ad_copy' | 'social_post' | 'landing_page_copy'
type TestStatus = 'Running' | 'Completed' | 'Paused'
type GoalMetric = 'Conversion Rate' | 'Click Rate' | 'Open Rate'
type ReportFormat = 'PDF' | 'CSV'

interface ABVariant {
  label: string
  content: string
  conversionRate: number
  impressions: number
  clicks: number
  isWinner?: boolean
}

interface ABTest {
  id: string
  name: string
  hypothesis: string
  status: TestStatus
  contentType: string
  goalMetric: string
  duration: number
  startDate: string
  confidence: number
  variants: ABVariant[]
  aiInsight?: string
  createdAt: string
}

interface AIInsight {
  id: string
  text: string
  lift: number
  sourceTest: string
  deployed: boolean
}

interface Stats {
  active: number
  completed: number
  total: number
  avgLift: number
  bestConversionRate: number
}

const STATUS_STYLES: Record<TestStatus, string> = {
  Running: 'bg-green-900/40 text-green-300 border border-green-700/50',
  Completed: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50',
  Paused: 'bg-gray-700 text-gray-400',
}

const CONTENT_TYPES: { key: ContentType; label: string }[] = [
  { key: 'email_subject', label: 'Email Subject' },
  { key: 'cta', label: 'CTA Button' },
  { key: 'headline', label: 'Ad Headline' },
  { key: 'landing_page_copy', label: 'Landing Page Hero' },
  { key: 'ad_copy', label: 'Ad Copy' },
  { key: 'social_post', label: 'Social Post' },
]

const GOAL_METRICS: GoalMetric[] = ['Conversion Rate', 'Click Rate', 'Open Rate']

export default function ABTestLabPage() {
  const [tests, setTests] = useState<ABTest[]>([])
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [stats, setStats] = useState<Stats>({ active: 0, completed: 0, total: 0, avgLift: 0, bestConversionRate: 0 })
  const [loading, setLoading] = useState(true)
  const [insightsOpen, setInsightsOpen] = useState(true)

  // New Test modal
  const [newTestOpen, setNewTestOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTest, setNewTest] = useState({
    name: '',
    hypothesis: '',
    variantA: '',
    variantB: '',
    contentType: 'email_subject' as ContentType,
    goalMetric: 'Conversion Rate' as GoalMetric,
    duration: 7,
  })

  // Report download modal
  const [reportOpen, setReportOpen] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState('2026-05-01')
  const [reportDateTo, setReportDateTo] = useState('2026-05-26')
  const [reportFormat, setReportFormat] = useState<ReportFormat>('CSV')
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set())

  // Toast
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const loadData = async () => {
    try {
      const res = await fetch('/api/ab-test')
      const data = await res.json()
      setTests(data.tests || [])
      setStats(data.stats || stats)

      const insRes = await fetch('/api/ab-test?type=insights')
      const insData = await insRes.json()
      setInsights(Array.isArray(insData) ? insData : [])
    } catch {
      // Use demo data fallback
      setTests([
        {
          id: 'abt_001', name: 'Q3 Email Subject Line Test',
          hypothesis: 'Question-based subject lines drive higher open rates than statement-based ones',
          status: 'Completed', contentType: 'Email Subject', goalMetric: 'Open Rate', duration: 14,
          startDate: '2026-05-01', confidence: 94,
          variants: [
            { label: 'A', content: 'Your marketing is costing you sales', conversionRate: 18.2, impressions: 4500, clicks: 819 },
            { label: 'B', content: 'Are you leaving sales on the table?', conversionRate: 24.7, impressions: 4500, clicks: 1112, isWinner: true },
          ],
          aiInsight: 'Question-format subject lines outperform statement formats by 35.7%. Curiosity-gap framing drives stronger open intent.',
          createdAt: '2026-05-01T09:00:00Z',
        },
        {
          id: 'abt_002', name: 'Hero CTA Button Copy',
          hypothesis: 'Action-oriented CTAs with urgency signals increase click-through vs generic "Learn More"',
          status: 'Running', contentType: 'CTA Button', goalMetric: 'Click Rate', duration: 7,
          startDate: '2026-05-20', confidence: 71,
          variants: [
            { label: 'A', content: 'Learn More', conversionRate: 3.1, impressions: 12000, clicks: 372 },
            { label: 'B', content: 'Start Growing Today →', conversionRate: 5.8, impressions: 12000, clicks: 696 },
          ],
          createdAt: '2026-05-20T10:00:00Z',
        },
        {
          id: 'abt_003', name: 'Ad Headline Emotional Angle',
          hypothesis: 'Pain-point headlines outperform aspiration headlines for B2B audiences',
          status: 'Paused', contentType: 'Ad Headline', goalMetric: 'Conversion Rate', duration: 10,
          startDate: '2026-04-15', confidence: 58,
          variants: [
            { label: 'A', content: 'Scale Your Business with AI Marketing', conversionRate: 2.4, impressions: 8200, clicks: 197 },
            { label: 'B', content: 'Stop Wasting Ad Budget — Let AI Optimize', conversionRate: 3.9, impressions: 8200, clicks: 320 },
          ],
          createdAt: '2026-04-15T08:00:00Z',
        },
      ])
      setStats({ active: 1, completed: 1, total: 3, avgLift: 36, bestConversionRate: 24.7 })
      setInsights([
        { id: 'ins_001', text: 'Subject lines with questions outperform statements by 23% on average across all tests', lift: 23, sourceTest: 'Q3 Email Subject Line Test', deployed: false },
        { id: 'ins_002', text: 'CTAs with directional arrows (→) increase click-through by 18% vs plain text', lift: 18, sourceTest: 'Hero CTA Button Copy', deployed: true },
        { id: 'ins_003', text: 'Pain-point framing resonates 60% more than aspiration framing for B2B SaaS audiences', lift: 60, sourceTest: 'Ad Headline Emotional Angle', deployed: false },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const createTest = async () => {
    if (!newTest.name.trim() || !newTest.variantA.trim() || !newTest.variantB.trim()) return
    setCreating(true)
    try {
      await fetch('/api/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTest),
      })
      await loadData()
      setNewTestOpen(false)
      setNewTest({ name: '', hypothesis: '', variantA: '', variantB: '', contentType: 'email_subject', goalMetric: 'Conversion Rate', duration: 7 })
      showToast('Test created successfully')
    } catch {
      showToast('Failed to create test')
    } finally {
      setCreating(false)
    }
  }

  const updateTestStatus = async (id: string, status: TestStatus) => {
    try {
      await fetch(`/api/ab-test?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await loadData()
    } catch {
      setTests(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    }
  }

  const deployInsight = (insightId: string) => {
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, deployed: true } : i))
    showToast('Insight deployed to Brand Memory')
  }

  const downloadReport = () => {
    const includedTests = tests.filter(t => selectedTestIds.size === 0 || selectedTestIds.has(t.id))
    const payload = {
      generated: new Date().toISOString(),
      dateRange: { from: reportDateFrom, to: reportDateTo },
      format: reportFormat,
      tests: includedTests,
      insights,
      summary: stats,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ab-test-report-${reportDateTo}.${reportFormat.toLowerCase()}`
    a.click()
    URL.revokeObjectURL(url)
    setReportOpen(false)
    showToast('Report downloaded')
  }

  const toggleTestSelection = (id: string) => {
    setSelectedTestIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const confidenceColor = (conf: number) => {
    if (conf >= 90) return 'bg-green-500'
    if (conf >= 70) return 'bg-yellow-500'
    return 'bg-red-500'
  }

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
          <h1 className="text-2xl font-bold text-white">🧪 A/B Testing Lab</h1>
          <p className="text-gray-400 text-sm mt-1">Run experiments, measure results, and let AI extract winning patterns.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReportOpen(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors">
            📊 Download Report
          </button>
          <button onClick={() => setNewTestOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
            + New Test
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.active}</p>
          <p className="text-gray-500 text-xs mt-1">Active Tests</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-400">{stats.completed}</p>
          <p className="text-gray-500 text-xs mt-1">Completed</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.avgLift}%</p>
          <p className="text-gray-500 text-xs mt-1">Avg Lift</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.bestConversionRate}%</p>
          <p className="text-gray-500 text-xs mt-1">Best Conv. Rate</p>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <span className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {/* AI Learning Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
            <button
              onClick={() => setInsightsOpen(p => !p)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="text-white font-semibold">What I&apos;ve Learned</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 text-xs">{insights.length} insights</span>
              </div>
              <span className="text-gray-500 text-sm">{insightsOpen ? '▲' : '▼'}</span>
            </button>

            {insightsOpen && (
              <div className="px-5 pb-5 space-y-3 border-t border-gray-800 pt-4">
                <p className="text-gray-500 text-xs">AI-extracted patterns from completed tests. Deploy to Brand Memory to influence all future content generation.</p>
                {insights.map(insight => (
                  <div key={insight.id} className="bg-gray-800 rounded-lg p-4 flex items-start gap-4">
                    <div className="flex-1">
                      <p className="text-white text-sm leading-relaxed">{insight.text}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-green-400 text-xs font-semibold">+{insight.lift}% lift</span>
                        <span className="text-gray-600 text-xs">Source: {insight.sourceTest}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {insight.deployed ? (
                        <span className="px-2 py-1 rounded bg-green-900/40 text-green-400 text-xs border border-green-700/50">Deployed</span>
                      ) : (
                        <button onClick={() => deployInsight(insight.id)}
                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors">
                          Deploy to Brand Memory
                        </button>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-3 h-3 accent-indigo-500" />
                        <span className="text-gray-500 text-xs">Apply to future content</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Cards */}
          <div className="space-y-4">
            {tests.map(test => {
              const winner = test.variants.find(v => v.isWinner)
              const maxRate = Math.max(...test.variants.map(v => v.conversionRate))

              return (
                <div key={test.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                  {/* Test header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-semibold">{test.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[test.status]}`}>
                          {test.status}
                        </span>
                        {test.status === 'Completed' && test.aiInsight && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-purple-900/40 text-purple-300 border border-purple-700/50">
                            📚 AI Learned From This
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-1">{test.hypothesis}</p>
                      <div className="flex gap-3 mt-1.5 flex-wrap">
                        <span className="text-gray-600 text-xs">{test.contentType}</span>
                        <span className="text-gray-600 text-xs">Goal: {test.goalMetric}</span>
                        <span className="text-gray-600 text-xs">Duration: {test.duration}d</span>
                        <span className="text-gray-600 text-xs">Started: {test.startDate}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {test.status === 'Running' && (
                        <button onClick={() => updateTestStatus(test.id, 'Paused')}
                          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">
                          Pause
                        </button>
                      )}
                      {test.status === 'Paused' && (
                        <button onClick={() => updateTestStatus(test.id, 'Running')}
                          className="px-3 py-1.5 text-xs bg-green-900/40 hover:bg-green-900/60 text-green-300 rounded-lg transition-colors">
                          Resume
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-500 text-xs">Statistical Confidence</span>
                      <span className={`text-xs font-semibold ${test.confidence >= 90 ? 'text-green-400' : test.confidence >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {test.confidence}% confident
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${confidenceColor(test.confidence)}`} style={{ width: `${test.confidence}%` }} />
                    </div>
                  </div>

                  {/* Variants */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {test.variants.map(variant => {
                      const isTopPerformer = variant.conversionRate === maxRate && test.status === 'Completed'
                      return (
                        <div key={variant.label} className={`rounded-lg p-4 border ${variant.isWinner ? 'bg-green-950/30 border-green-700/60' : 'bg-gray-800 border-gray-700'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${variant.label === 'A' ? 'bg-indigo-600' : 'bg-purple-600'} text-white`}>
                                {variant.label}
                              </span>
                              <span className="text-gray-300 text-sm font-medium">Variant {variant.label}</span>
                            </div>
                            {variant.isWinner && (
                              <span className="px-2 py-0.5 rounded-full bg-green-700 text-green-100 text-xs font-bold">Winner</span>
                            )}
                            {isTopPerformer && !variant.isWinner && (
                              <span className="px-2 py-0.5 rounded-full bg-yellow-700/60 text-yellow-300 text-xs">Leading</span>
                            )}
                          </div>
                          <p className="text-white text-sm mb-3 italic">&ldquo;{variant.content}&rdquo;</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <p className={`font-bold text-sm ${variant.isWinner ? 'text-green-400' : 'text-white'}`}>{variant.conversionRate}%</p>
                              <p className="text-gray-600 text-xs">{test.goalMetric.split(' ')[0]}</p>
                            </div>
                            <div>
                              <p className="text-white text-sm font-bold">{variant.impressions.toLocaleString()}</p>
                              <p className="text-gray-600 text-xs">Impressions</p>
                            </div>
                            <div>
                              <p className="text-white text-sm font-bold">{variant.clicks.toLocaleString()}</p>
                              <p className="text-gray-600 text-xs">Clicks</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* AI Insight */}
                  {test.aiInsight && (
                    <div className="bg-purple-950/30 border border-purple-800/40 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-purple-400 flex-shrink-0">🧠</span>
                      <p className="text-purple-200 text-xs leading-relaxed">{test.aiInsight}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {tests.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <p className="text-4xl mb-4">🧪</p>
              <p className="text-white font-semibold mb-2">No tests yet</p>
              <p className="text-gray-500 text-sm mb-4">Create your first A/B test to start optimizing your content.</p>
              <button onClick={() => setNewTestOpen(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                + New Test
              </button>
            </div>
          )}
        </>
      )}

      {/* New Test Modal */}
      {newTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewTestOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">New A/B Test</h2>
              <button onClick={() => setNewTestOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Test Name *</label>
                <input value={newTest.name} onChange={e => setNewTest(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Q3 Email Subject Line Test"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Hypothesis</label>
                <input value={newTest.hypothesis} onChange={e => setNewTest(p => ({ ...p, hypothesis: e.target.value }))}
                  placeholder="e.g. Question-based subjects drive higher open rates than statements"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-2">Content Type</label>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_TYPES.map(ct => (
                    <button key={ct.key} onClick={() => setNewTest(p => ({ ...p, contentType: ct.key }))}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${newTest.contentType === ct.key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Variant A *</label>
                  <textarea value={newTest.variantA} onChange={e => setNewTest(p => ({ ...p, variantA: e.target.value }))}
                    placeholder="Variant A content..."
                    rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Variant B *</label>
                  <textarea value={newTest.variantB} onChange={e => setNewTest(p => ({ ...p, variantB: e.target.value }))}
                    placeholder="Variant B content..."
                    rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Goal Metric</label>
                  <select value={newTest.goalMetric} onChange={e => setNewTest(p => ({ ...p, goalMetric: e.target.value as GoalMetric }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                    {GOAL_METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Duration (days)</label>
                  <input type="number" min={1} max={90} value={newTest.duration} onChange={e => setNewTest(p => ({ ...p, duration: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setNewTestOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={createTest} disabled={creating || !newTest.name || !newTest.variantA || !newTest.variantB}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setReportOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">📊 Download Report</h2>
              <button onClick={() => setReportOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">From</label>
                <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">To</label>
                <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-2">Format</label>
              <div className="flex gap-2">
                {(['PDF', 'CSV'] as ReportFormat[]).map(f => (
                  <button key={f} onClick={() => setReportFormat(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportFormat === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-2">Include Tests (leave unselected for all)</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {tests.map(t => (
                  <label key={t.id} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={selectedTestIds.has(t.id)} onChange={() => toggleTestSelection(t.id)}
                      className="w-4 h-4 accent-indigo-500" />
                    <span className="text-gray-300 text-sm">{t.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLES[t.status]}`}>{t.status}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setReportOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={downloadReport}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                Generate Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
