'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdSet {
  name: string
  platform: string
  objective: string
  audience: string
  dailyBudget: string
  creativeFormat: string
  primaryCta: string
}

interface Campaign {
  id: string
  title: string
  approval_status: string
  created_at: string
  content_json: {
    campaignName: string
    campaignObjective: string
    totalBudget: string
    duration: string
    targetAudience: string
    keyMessage: string
    uniqueAngle: string
    adSets: AdSet[]
    kpis: string[]
  }
}

interface PlatformLink {
  platform: string
  platform_campaign_id: string
  platform_adset_ids: string | string[]
  status: string
  last_synced_at: string | null
}

interface PlatformPerf {
  platform: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
}

interface OptimizationRec {
  id: string
  actionType: string
  platform: string
  adSetName: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  reasoning: string
  expectedImpact: string
  currentMetric: string
  targetMetric: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
}

interface OptReport {
  id: string
  overallHealth: string
  healthScore: number
  summary: string
  kpiStatus: Array<{ kpi: string; target: string; current: string; status: string }>
  recommendations: OptimizationRec[]
  learnings: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  'bg-blue-900/40 text-blue-400',
  instagram: 'bg-pink-900/40 text-pink-400',
  google:    'bg-green-900/40 text-green-400',
  linkedin:  'bg-blue-900/40 text-blue-300',
  youtube:   'bg-red-900/40 text-red-400',
  meta_ads:  'bg-blue-900/40 text-blue-400',
  google_ads:'bg-green-900/40 text-green-400',
  dv360:     'bg-purple-900/40 text-purple-400',
}

const PLATFORM_LABELS: Record<string, { label: string; icon: string; dspKey: string }> = {
  facebook:   { label: 'Meta Ads', icon: '📘', dspKey: 'meta_ads' },
  instagram:  { label: 'Meta Ads', icon: '📸', dspKey: 'meta_ads' },
  meta_ads:   { label: 'Meta Ads', icon: '📘', dspKey: 'meta_ads' },
  google:     { label: 'Google Ads', icon: '🎯', dspKey: 'google_ads' },
  google_ads: { label: 'Google Ads', icon: '🎯', dspKey: 'google_ads' },
  youtube:    { label: 'Google Ads', icon: '📺', dspKey: 'google_ads' },
  dv360:      { label: 'DV360', icon: '📡', dspKey: 'dv360' },
  linkedin:   { label: 'LinkedIn Ads', icon: '💼', dspKey: 'linkedin_ads' },
}

const HEALTH_COLORS: Record<string, string> = {
  excellent:        'text-green-400 bg-green-900/30',
  good:             'text-teal-400 bg-teal-900/30',
  needs_attention:  'text-amber-400 bg-amber-900/30',
  critical:         'text-red-400 bg-red-900/30',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-red-600 bg-red-900/20',
  high:     'border-amber-600 bg-amber-900/20',
  medium:   'border-indigo-600 bg-indigo-900/20',
  low:      'border-gray-600 bg-gray-900',
}

const ACTION_LABELS: Record<string, string> = {
  increase_budget:       '📈 Increase Budget',
  decrease_budget:       '📉 Decrease Budget',
  pause_adset:           '⏸️ Pause Ad Set',
  resume_adset:          '▶️ Resume Ad Set',
  pause_campaign:        '⏹️ Pause Campaign',
  change_bid:            '💰 Change Bid',
  update_targeting:      '🎯 Update Targeting',
  rotate_creative:       '🎨 Rotate Creative',
  adjust_schedule:       '📅 Adjust Schedule',
  expand_audience:       '🔊 Expand Audience',
  narrow_audience:       '🔍 Narrow Audience',
  add_negative_keywords: '🚫 Negative Keywords',
}

const DSP_PLATFORMS: Array<{ id: string; label: string; icon: string; color: string }> = [
  { id: 'meta_ads',   label: 'Meta Ads',    icon: '📘', color: 'border-blue-600 hover:bg-blue-900/20' },
  { id: 'google_ads', label: 'Google Ads',  icon: '🎯', color: 'border-green-600 hover:bg-green-900/20' },
  { id: 'dv360',      label: 'DV360',       icon: '📡', color: 'border-purple-600 hover:bg-purple-900/20' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, prefix = '') {
  if (!n) return '—'
  return prefix + (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(n < 10 ? 2 : 0))
}

function pct(n: number) { return n ? `${(n * 100).toFixed(2)}%` : '—' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [campaignGoal, setCampaignGoal] = useState('')
  const [budget, setBudget] = useState('')
  const [duration, setDuration] = useState('30 days')
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ message: string; creativesGenerated: number } | null>(null)
  const [activeTab, setActiveTab] = useState<'brief' | 'publish' | 'performance' | 'optimize'>('brief')
  const [waLoading, setWaLoading] = useState(false)
  const [waResult, setWaResult] = useState('')
  const [waBroadcastType, setWaBroadcastType] = useState<'MARKETING' | 'UTILITY'>('MARKETING')

  // Performance
  const [perfData, setPerfData] = useState<{ platforms: PlatformPerf[]; links: PlatformLink[] }>({ platforms: [], links: [] })
  const [syncing, setSyncing] = useState(false)
  const [perfError, setPerfError] = useState('')

  // Publish
  const [selectedDSPs, setSelectedDSPs] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<Record<string, unknown> | null>(null)

  // Optimize
  const [optimizing, setOptimizing] = useState(false)
  const [optReport, setOptReport] = useState<OptReport | null>(null)
  const [applyingRec, setApplyingRec] = useState<string | null>(null)
  const [optError, setOptError] = useState('')

  const load = useCallback(async (wid: string) => {
    setLoading(true)
    const res = await fetch(`/api/agents/campaign?workspaceId=${wid}`)
    const data = await res.json()
    if (Array.isArray(data)) setCampaigns(data)
    setLoading(false)
  }, [])

  const loadPerf = useCallback(async (wid: string, campaignId: string) => {
    const res = await fetch(`/api/campaign/sync?workspaceId=${wid}&campaignArtifactId=${campaignId}`)
    const data = await res.json()
    setPerfData({ platforms: data.platforms || [], links: data.links || [] })
  }, [])

  const loadOptReport = useCallback(async (wid: string, campaignId: string) => {
    const res = await fetch(`/api/campaign/optimize?workspaceId=${wid}&campaignArtifactId=${campaignId}`)
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      setOptReport(data[0]?.report_json || null)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) load(wid)
  }, [load])

  const campaign = selected || campaigns[0]

  useEffect(() => {
    if (campaign && workspaceId && activeTab === 'performance') {
      loadPerf(workspaceId, campaign.id)
    }
    if (campaign && workspaceId && activeTab === 'optimize') {
      loadOptReport(workspaceId, campaign.id)
    }
  }, [activeTab, campaign, workspaceId, loadPerf, loadOptReport])

  async function generate() {
    if (!campaignGoal.trim()) { setError('Enter a campaign goal first'); return }
    setGenerating(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/agents/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, campaignGoal: campaignGoal.trim(), budget, duration }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult({ message: data.message, creativesGenerated: data.creativesGenerated })
      setCampaignGoal(''); setBudget('')
      await load(workspaceId)
    } finally { setGenerating(false) }
  }

  async function syncPerformance() {
    if (!campaign) return
    setSyncing(true); setPerfError('')
    try {
      await fetch('/api/campaign/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, campaignArtifactId: campaign.id, days: 7 }),
      })
      await loadPerf(workspaceId, campaign.id)
    } catch (e) { setPerfError(String(e)) }
    finally { setSyncing(false) }
  }

  async function publishToDSPs() {
    if (!campaign || selectedDSPs.length === 0) return
    setPublishing(true); setPublishResult(null)
    try {
      const res = await fetch('/api/campaign/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, campaignArtifactId: campaign.id, platforms: selectedDSPs }),
      })
      const data = await res.json()
      setPublishResult(data)
      await loadPerf(workspaceId, campaign.id)
    } finally { setPublishing(false) }
  }

  async function runOptimizer() {
    if (!campaign) return
    setOptimizing(true); setOptError(''); setOptReport(null)
    try {
      const res = await fetch('/api/campaign/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, campaignArtifactId: campaign.id }),
      })
      const data = await res.json()
      if (data.error) { setOptError(data.error); return }
      setOptReport(data.report)
    } finally { setOptimizing(false) }
  }

  async function applyRecommendation(rec: OptimizationRec, decision: 'approved' | 'rejected') {
    if (!campaign || !optReport) return
    setApplyingRec(rec.id)
    try {
      const reportId = (optReport as unknown as { id?: string })?.id || ''
      await fetch('/api/campaign/optimize', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          campaignArtifactId: campaign.id,
          reportId,
          recommendationId: rec.id,
          decision,
        }),
      })
      // Update local state
      setOptReport(prev => prev ? {
        ...prev,
        recommendations: prev.recommendations.map(r =>
          r.id === rec.id ? { ...r, status: decision === 'approved' ? 'applied' : 'rejected' } : r
        )
      } : null)
    } finally { setApplyingRec(null) }
  }

  function toggleDSP(id: string) {
    setSelectedDSPs(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function runWhatsApp() {
    if (!workspaceId) return
    setWaLoading(true); setWaResult('')
    try {
      const res = await fetch('/api/agents/campaign/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, broadcastType: waBroadcastType }),
      })
      const data = await res.json()
      setWaResult(data.error ? `Error: ${data.error}` : data.message || 'WhatsApp broadcast templates generated — check Approvals')
    } catch (e) { setWaResult(`Error: ${String(e)}`) } finally { setWaLoading(false) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold">📣</div>
          <h1 className="text-2xl font-bold text-white">Campaign Manager</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI campaign briefs → Meta Ads · Google Ads · DV360 · auto-optimization · continuous learning</p>
      </div>

      {/* Cross-agent notice */}
      <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3 mb-6 flex gap-3">
        <span className="text-indigo-400">🔗</span>
        <p className="text-indigo-300 text-xs">
          Campaign Manager generates briefs, creates <strong>ad creatives</strong> and <strong>landing page visuals</strong> via Creative Supervisor, publishes to <strong>Meta Ads · Google Ads · DV360</strong>, syncs performance, and runs <strong>AI optimization</strong> with human approval for every action.
        </p>
      </div>

      {/* Generate form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
        <h2 className="text-white font-semibold mb-4">New Campaign Brief</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-3">
            <label className="text-gray-400 text-xs mb-1.5 block">Campaign Goal</label>
            <input value={campaignGoal} onChange={e => setCampaignGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="e.g. Generate 500 qualified leads for our SaaS at under ₹200 CPL"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">Total Budget (optional)</label>
            <input value={budget} onChange={e => setBudget(e.target.value)}
              placeholder="e.g. ₹50,000"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">Duration</label>
            <select value={duration} onChange={e => setDuration(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
              {['7 days', '14 days', '30 days', '60 days', '90 days'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={generate} disabled={generating || !workspaceId || !campaignGoal.trim()}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-2.5 px-5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {generating
                ? <><Spinner />Generating + Requesting Creatives...</>
                : '📣 Generate Campaign'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {result && (
          <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 flex gap-3">
            <span className="text-green-400">✅</span>
            <div>
              <p className="text-green-300 text-sm">{result.message}</p>
              <a href="/dashboard/approvals" className="text-indigo-400 text-xs hover:underline">Review in Approvals →</a>
            </div>
          </div>
        )}
      </div>

      {/* Campaign list + detail */}
      {loading ? (
        <div className="text-gray-600 text-sm animate-pulse p-8 text-center">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="border border-dashed border-gray-700 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📣</div>
          <p className="text-white font-medium mb-1">No campaigns yet</p>
          <p className="text-gray-500 text-sm">Enter a campaign goal above to generate your first brief + ad creatives</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* Sidebar */}
          <div className="col-span-1 space-y-2">
            {campaigns.map(c => (
              <button key={c.id} onClick={() => { setSelected(c); setActiveTab('brief') }}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  campaign?.id === c.id ? 'border-orange-600 bg-orange-900/20' : 'border-gray-800 hover:border-gray-600'
                }`}>
                <p className="text-white text-xs font-semibold truncate">{c.content_json.campaignName}</p>
                <p className="text-gray-500 text-xs capitalize mt-0.5">{c.content_json.campaignObjective}</p>
                <div className={`mt-1.5 inline-flex text-xs px-2 py-0.5 rounded-full ${
                  c.approval_status === 'approved' ? 'bg-green-900/40 text-green-400' :
                  c.approval_status === 'rejected' ? 'bg-red-900/40 text-red-400' :
                  'bg-yellow-900/40 text-yellow-400'
                }`}>{c.approval_status || 'pending'}</div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {campaign && (
            <div className="col-span-4 space-y-4">
              {/* Tab nav */}
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
                {[
                  { id: 'brief',       label: '📋 Brief', },
                  { id: 'publish',     label: '🚀 Publish to DSPs' },
                  { id: 'performance', label: '📊 Performance' },
                  { id: 'optimize',    label: '🤖 Optimize' },
                ].map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === t.id ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}>{t.label}</button>
                ))}
              </div>

              {/* ── Brief tab ───────────────────────────────────────────────── */}
              {activeTab === 'brief' && (
                <div className="space-y-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-5">
                      <div><p className="text-gray-500 text-xs mb-1">Campaign Name</p><p className="text-white font-bold">{campaign.content_json.campaignName}</p></div>
                      <div><p className="text-gray-500 text-xs mb-1">Objective</p><p className="text-orange-400 font-bold capitalize">{campaign.content_json.campaignObjective}</p></div>
                      <div><p className="text-gray-500 text-xs mb-1">Budget</p><p className="text-white">{campaign.content_json.totalBudget}</p></div>
                      <div><p className="text-gray-500 text-xs mb-1">Duration</p><p className="text-white">{campaign.content_json.duration}</p></div>
                      <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Key Message</p><p className="text-white">{campaign.content_json.keyMessage}</p></div>
                      <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Unique Angle</p><p className="text-gray-300 text-xs">{campaign.content_json.uniqueAngle}</p></div>
                    </div>
                    <div className="mb-4">
                      <p className="text-gray-500 text-xs mb-2">KPIs</p>
                      <div className="flex flex-wrap gap-2">
                        {(campaign.content_json.kpis || []).map((kpi, i) => (
                          <span key={i} className="bg-indigo-900/30 text-indigo-300 text-xs px-3 py-1 rounded-full">{kpi}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-3">Ad Sets ({campaign.content_json.adSets?.length || 0})</p>
                      <div className="space-y-2">
                        {(campaign.content_json.adSets || []).map((adSet, i) => (
                          <div key={i} className="bg-gray-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div><p className="text-gray-500 mb-0.5">Ad Set</p><p className="text-white font-semibold">{adSet.name}</p></div>
                            <div>
                              <p className="text-gray-500 mb-0.5">Platform</p>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[adSet.platform] || 'bg-gray-700 text-gray-300'}`}>
                                {PLATFORM_LABELS[adSet.platform.toLowerCase()]?.icon} {adSet.platform}
                              </span>
                            </div>
                            <div><p className="text-gray-500 mb-0.5">Budget</p><p className="text-white">{adSet.dailyBudget}</p></div>
                            <div><p className="text-gray-500 mb-0.5">CTA</p><p className="text-indigo-400">{adSet.primaryCta}</p></div>
                            <div className="col-span-4"><p className="text-gray-500 mb-0.5">Audience</p><p className="text-gray-300">{adSet.audience}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <a href="/dashboard/approvals" className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">Review Creatives in Approvals →</a>
                    <button onClick={() => setActiveTab('publish')} disabled={campaign.approval_status !== 'approved'}
                      className="flex items-center gap-2 border border-orange-600 hover:bg-orange-900/20 disabled:opacity-40 text-orange-400 text-sm py-2.5 px-5 rounded-xl transition-colors">
                      🚀 Publish to DSPs {campaign.approval_status !== 'approved' && '(approve first)'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Publish tab ─────────────────────────────────────────────── */}
              {activeTab === 'publish' && (
                <div className="space-y-4">
                  {campaign.approval_status !== 'approved' ? (
                    <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-4 flex gap-3">
                      <span className="text-amber-400">⚠️</span>
                      <div>
                        <p className="text-amber-300 font-medium text-sm">Approval required before publishing</p>
                        <p className="text-amber-600 text-xs mt-1">This campaign brief is currently <strong>{campaign.approval_status || 'pending'}</strong>. Review and approve it in the Approvals page before publishing to any ad platform.</p>
                        <a href="/dashboard/approvals" className="text-indigo-400 text-xs mt-2 inline-block hover:underline">Go to Approvals →</a>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 flex gap-3">
                        <span className="text-green-400">✅</span>
                        <p className="text-green-300 text-sm">Campaign approved — ready to publish to ad platforms. All campaigns start in <strong>PAUSED</strong> state for final safety review.</p>
                      </div>

                      {/* Platform selector */}
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <h3 className="text-white font-semibold text-sm mb-4">Select Ad Platforms</h3>
                        <div className="grid grid-cols-3 gap-3 mb-5">
                          {DSP_PLATFORMS.map(dsp => (
                            <button key={dsp.id} onClick={() => toggleDSP(dsp.id)}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${
                                selectedDSPs.includes(dsp.id)
                                  ? 'border-orange-500 bg-orange-900/20'
                                  : `border-gray-700 ${dsp.color}`
                              }`}>
                              <div className="text-2xl mb-2">{dsp.icon}</div>
                              <p className="text-white text-sm font-medium">{dsp.label}</p>
                              <p className="text-gray-500 text-xs mt-1">
                                {selectedDSPs.includes(dsp.id) ? '✓ Selected' : 'Click to select'}
                              </p>
                            </button>
                          ))}
                        </div>

                        <div className="bg-gray-800 rounded-lg p-3 mb-4 text-xs text-gray-400">
                          <p className="font-medium text-gray-300 mb-1">What happens when you publish:</p>
                          <ul className="space-y-1 list-disc list-inside">
                            <li>Campaign + ad sets created on each selected platform</li>
                            <li>All campaigns start in <strong className="text-amber-300">PAUSED</strong> state — review in each platform before activating</li>
                            <li>Platform IDs saved so performance can be synced automatically</li>
                            <li>Make sure {selectedDSPs.join(', ') || 'platforms'} {selectedDSPs.length === 1 ? 'is' : 'are'} connected in <a href="/dashboard/integrations" className="text-indigo-400 hover:underline">Integrations</a></li>
                          </ul>
                        </div>

                        <button onClick={publishToDSPs} disabled={publishing || selectedDSPs.length === 0}
                          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                          {publishing ? <><Spinner />Publishing to {selectedDSPs.join(', ')}...</> : `🚀 Publish to ${selectedDSPs.length ? selectedDSPs.join(', ') : 'selected platforms'}`}
                        </button>
                      </div>

                      {publishResult && (
                        <div className={`rounded-xl p-4 border ${(publishResult.successCount as number) > 0 ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
                          <p className={`text-sm font-medium mb-2 ${(publishResult.successCount as number) > 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {publishResult.message as string}
                          </p>
                          {((publishResult.results as unknown[]) || []).map((r: unknown, i: number) => {
                            const res = r as Record<string, unknown>
                            return (
                              <div key={i} className="bg-gray-800/50 rounded-lg p-3 mt-2 text-xs">
                                <p className="text-white font-medium">{String(res.platform)} — {res.status === 'success' ? '✅ Published' : '❌ Failed'}</p>
                                {!!res.platformCampaignId && <p className="text-gray-400 mt-1">Campaign ID: <code className="text-gray-300">{String(res.platformCampaignId)}</code></p>}
                                {!!res.error && <p className="text-red-400 mt-1">{String(res.error)}</p>}
                                {!!(res.details as Record<string, unknown>)?.note && <p className="text-gray-500 mt-1">{String((res.details as Record<string, unknown>).note)}</p>}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Existing platform links */}
                      {perfData.links.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                          <p className="text-gray-500 text-xs mb-3">Published platforms</p>
                          <div className="space-y-2">
                            {perfData.links.map((link, i) => (
                              <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span>{PLATFORM_LABELS[link.platform]?.icon || '🔗'}</span>
                                  <span className="text-white font-medium">{PLATFORM_LABELS[link.platform]?.label || link.platform}</span>
                                  <code className="text-gray-500">{link.platform_campaign_id}</code>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded-full ${link.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                    {link.status}
                                  </span>
                                  {link.last_synced_at && <span className="text-gray-600">synced {new Date(link.last_synced_at).toLocaleDateString()}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Performance tab ──────────────────────────────────────────── */}
              {activeTab === 'performance' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">Performance Dashboard</h3>
                      <p className="text-gray-500 text-xs mt-0.5">Last 7 days · Synced from Meta Ads, Google Ads, DV360</p>
                    </div>
                    <button onClick={syncPerformance} disabled={syncing}
                      className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                      {syncing ? <><Spinner />Syncing...</> : '🔄 Sync Now'}
                    </button>
                  </div>
                  {perfError && <p className="text-red-400 text-sm">{perfError}</p>}

                  {perfData.links.length === 0 ? (
                    <div className="border border-dashed border-gray-700 rounded-xl p-10 text-center">
                      <div className="text-3xl mb-3">📊</div>
                      <p className="text-white font-medium mb-1">No performance data yet</p>
                      <p className="text-gray-500 text-sm mb-3">Publish the campaign to a DSP first, then sync performance after 24–48 hours of running.</p>
                      <button onClick={() => setActiveTab('publish')} className="text-orange-400 text-sm hover:underline">Go to Publish tab →</button>
                    </div>
                  ) : (
                    <>
                      {/* Platform KPI cards */}
                      <div className="grid grid-cols-3 gap-4">
                        {perfData.platforms.map((p) => (
                          <div key={p.platform} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-lg">{PLATFORM_LABELS[p.platform]?.icon || '📊'}</span>
                              <span className="text-white font-semibold text-sm">{PLATFORM_LABELS[p.platform]?.label || p.platform}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div><p className="text-gray-500 mb-0.5">Impressions</p><p className="text-white font-bold">{fmt(p.impressions)}</p></div>
                              <div><p className="text-gray-500 mb-0.5">Clicks</p><p className="text-white font-bold">{fmt(p.clicks)}</p></div>
                              <div><p className="text-gray-500 mb-0.5">CTR</p><p className={`font-bold ${p.ctr > 0.02 ? 'text-green-400' : p.ctr > 0.01 ? 'text-amber-400' : 'text-red-400'}`}>{pct(p.ctr)}</p></div>
                              <div><p className="text-gray-500 mb-0.5">CPC</p><p className="text-white font-bold">₹{p.cpc.toFixed(2)}</p></div>
                              <div><p className="text-gray-500 mb-0.5">Spend</p><p className="text-white font-bold">₹{fmt(p.spend)}</p></div>
                              <div><p className="text-gray-500 mb-0.5">Conversions</p><p className={`font-bold ${p.conversions > 0 ? 'text-green-400' : 'text-gray-500'}`}>{p.conversions || '—'}</p></div>
                              <div><p className="text-gray-500 mb-0.5">CPA</p><p className="text-white font-bold">{p.cpa ? `₹${p.cpa.toFixed(0)}` : '—'}</p></div>
                              <div><p className="text-gray-500 mb-0.5">ROAS</p><p className={`font-bold ${p.roas >= 3 ? 'text-green-400' : p.roas >= 1 ? 'text-amber-400' : 'text-gray-500'}`}>{p.roas ? `${p.roas.toFixed(1)}x` : '—'}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Aggregate totals */}
                      {perfData.platforms.length > 1 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                          <p className="text-gray-500 text-xs mb-3">Total across all platforms</p>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            {['impressions', 'clicks', 'spend', 'conversions'].map(metric => {
                              const total = perfData.platforms.reduce((s, p) => s + ((p as unknown as Record<string, number>)[metric] || 0), 0)
                              return (
                                <div key={metric}>
                                  <p className="text-gray-500 text-xs capitalize mb-1">{metric}</p>
                                  <p className="text-white font-bold">{metric === 'spend' ? `₹${fmt(total)}` : fmt(total)}</p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button onClick={() => setActiveTab('optimize')} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-colors">
                          🤖 Run AI Optimization →
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Optimize tab ─────────────────────────────────────────────── */}
              {activeTab === 'optimize' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">AI Campaign Optimizer</h3>
                      <p className="text-gray-500 text-xs mt-0.5">Analyzes performance vs KPIs · generates recommendations · all actions require your approval</p>
                    </div>
                    <button onClick={runOptimizer} disabled={optimizing}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-colors">
                      {optimizing ? <><Spinner />Analysing...</> : '🤖 Run Optimizer'}
                    </button>
                  </div>

                  {optError && (
                    <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-4 text-amber-300 text-sm">
                      ⚠️ {optError}
                    </div>
                  )}

                  {!optReport && !optimizing && (
                    <div className="border border-dashed border-gray-700 rounded-xl p-10 text-center">
                      <div className="text-3xl mb-3">🤖</div>
                      <p className="text-white font-medium mb-1">No optimization report yet</p>
                      <p className="text-gray-500 text-sm">Click "Run Optimizer" to analyse your campaign performance and get AI recommendations. Requires performance data from at least one DSP.</p>
                    </div>
                  )}

                  {optReport && (
                    <div className="space-y-4">
                      {/* Health overview */}
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-gray-500 text-xs mb-1">Campaign Health</p>
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium capitalize ${HEALTH_COLORS[optReport.overallHealth] || HEALTH_COLORS.good}`}>
                              {optReport.overallHealth?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 text-xs mb-1">Health Score</p>
                            <p className={`text-3xl font-bold ${optReport.healthScore >= 75 ? 'text-green-400' : optReport.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                              {optReport.healthScore}/100
                            </p>
                          </div>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{optReport.summary}</p>

                        {optReport.kpiStatus?.length > 0 && (
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {optReport.kpiStatus.map((k, i) => (
                              <div key={i} className={`rounded-lg p-3 text-xs ${k.status === 'exceeded' ? 'bg-green-900/20' : k.status === 'on_track' ? 'bg-indigo-900/20' : 'bg-red-900/20'}`}>
                                <p className="text-gray-400 mb-1">{k.kpi}</p>
                                <p className="text-white font-medium">Current: {k.current}</p>
                                <p className="text-gray-500">Target: {k.target}</p>
                                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs ${k.status === 'exceeded' ? 'bg-green-900/40 text-green-400' : k.status === 'on_track' ? 'bg-indigo-900/40 text-indigo-300' : 'bg-red-900/40 text-red-400'}`}>
                                  {k.status.replace('_', ' ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recommendations */}
                      <div>
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                          Recommendations ({optReport.recommendations?.filter(r => r.status === 'pending').length || 0} pending)
                        </p>
                        <div className="space-y-3">
                          {(optReport.recommendations || []).map(rec => (
                            <div key={rec.id} className={`border rounded-xl p-4 ${PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.medium}`}>
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      rec.priority === 'critical' ? 'bg-red-900/40 text-red-400' :
                                      rec.priority === 'high' ? 'bg-amber-900/40 text-amber-400' :
                                      rec.priority === 'medium' ? 'bg-indigo-900/40 text-indigo-300' :
                                      'bg-gray-700 text-gray-400'
                                    }`}>{rec.priority}</span>
                                    <span className="text-gray-400 text-xs">{PLATFORM_LABELS[rec.platform]?.icon} {rec.platform}</span>
                                    <span className="text-gray-600 text-xs">·</span>
                                    <span className="text-gray-400 text-xs">{rec.adSetName}</span>
                                  </div>
                                  <p className="text-white font-semibold text-sm">{ACTION_LABELS[rec.actionType] || rec.actionType}</p>
                                </div>
                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded ml-2 flex-shrink-0">
                                  {Math.round(rec.confidence * 100)}% conf.
                                </span>
                              </div>
                              <p className="text-gray-300 text-xs mb-2 leading-relaxed">{rec.reasoning}</p>
                              <div className="flex items-center gap-4 text-xs mb-3">
                                <div><span className="text-gray-500">Current: </span><span className="text-white">{rec.currentMetric}</span></div>
                                <span className="text-gray-700">→</span>
                                <div><span className="text-gray-500">Target: </span><span className="text-green-400">{rec.targetMetric}</span></div>
                                <div className="ml-auto"><span className="text-gray-500">Impact: </span><span className="text-amber-300">{rec.expectedImpact}</span></div>
                              </div>

                              {rec.status === 'pending' && (
                                <div className="flex gap-2">
                                  <button onClick={() => applyRecommendation(rec, 'approved')} disabled={applyingRec === rec.id}
                                    className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs py-2 rounded-lg font-medium transition-colors">
                                    {applyingRec === rec.id ? 'Applying...' : '✅ Approve & Apply'}
                                  </button>
                                  <button onClick={() => applyRecommendation(rec, 'rejected')} disabled={applyingRec === rec.id}
                                    className="flex-1 border border-gray-600 hover:border-gray-400 text-gray-400 hover:text-white text-xs py-2 rounded-lg transition-colors">
                                    ❌ Reject
                                  </button>
                                </div>
                              )}
                              {rec.status !== 'pending' && (
                                <div className={`text-xs px-3 py-1.5 rounded-lg text-center font-medium ${
                                  rec.status === 'applied' ? 'bg-green-900/30 text-green-400' :
                                  rec.status === 'rejected' ? 'bg-gray-800 text-gray-500' :
                                  rec.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                                  'bg-gray-800 text-gray-400'
                                }`}>
                                  {rec.status === 'applied' ? '✅ Applied' : rec.status === 'rejected' ? '❌ Rejected' : rec.status === 'failed' ? '⚠️ Failed' : rec.status}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Learnings */}
                      {optReport.learnings?.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">🧠 What the AI Learned</p>
                          <div className="space-y-2">
                            {optReport.learnings.map((l, i) => (
                              <div key={i} className="flex gap-2 text-xs">
                                <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
                                <p className="text-gray-300 leading-relaxed">{l}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-gray-600 text-xs mt-3">These learnings are saved and applied to future campaigns automatically.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* WhatsApp Broadcast Worker */}
      <div className="mt-8 bg-gray-900 border border-green-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">💬</span>
          <h2 className="text-white font-semibold">WhatsApp Broadcast</h2>
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/40 text-green-400 border border-green-800">W7</span>
        </div>
        <p className="text-gray-400 text-sm mb-4 ml-9">AI-written WhatsApp message templates with compliance checklist. Send via Meta Cloud API after approval.</p>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-gray-500 text-xs">Broadcast Type</label>
          <select value={waBroadcastType} onChange={e => setWaBroadcastType(e.target.value as 'MARKETING' | 'UTILITY')}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg">
            <option value="MARKETING">MARKETING</option>
            <option value="UTILITY">UTILITY</option>
          </select>
          <button onClick={runWhatsApp} disabled={waLoading || !workspaceId}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2">
            {waLoading ? <><Spinner />Generating...</> : '📲 Generate Templates'}
          </button>
        </div>
        {waResult && (
          <p className={`text-xs ${waResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{waResult}</p>
        )}
        <p className="text-gray-600 text-xs mt-2">Templates saved as artifact → approve in Approvals → send via PUT /api/agents/campaign/whatsapp with recipient list.</p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
