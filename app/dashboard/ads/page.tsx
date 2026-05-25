'use client'

import { useState, useEffect, useCallback } from 'react'

type AdPlatform = 'meta' | 'google' | 'linkedin'
type AdGoal = 'Brand Awareness' | 'Drive Traffic' | 'Generate Leads' | 'Drive Sales'
type AdTone = 'Professional' | 'Friendly' | 'Urgent' | 'Inspirational'

interface Campaign {
  id: string
  name: string
  status: string
  objective?: string
  effective_status?: string
  insights?: {
    impressions?: number | string
    clicks?: number | string
    ctr?: number | string
    spend?: number | string
  }
  // Google-specific
  campaign_budget_amount_micros?: number
  // LinkedIn-specific
  type?: string
}

interface AdVariation {
  headline: string
  primaryText?: string
  description: string
  callToAction: string
  hook: string
  targetingHint: string
  estimatedCtr: string
  psychologyPrinciple: string
}

interface AdGenResult {
  variations: AdVariation[]
  campaignStrategy: string
  budgetAllocation: string
  keywordSuggestions: string[]
}

const PLATFORM_CONFIG = {
  meta: { label: 'Meta Ads', icon: '📘', color: 'blue' },
  google: { label: 'Google Ads', icon: '🔍', color: 'red' },
  linkedin: { label: 'LinkedIn Ads', icon: '💼', color: 'blue' },
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'text-green-400 bg-green-400/10',
  active: 'text-green-400 bg-green-400/10',
  enabled: 'text-green-400 bg-green-400/10',
  PAUSED: 'text-amber-400 bg-amber-400/10',
  paused: 'text-amber-400 bg-amber-400/10',
  ARCHIVED: 'text-gray-500 bg-gray-500/10',
  archived: 'text-gray-500 bg-gray-500/10',
  REMOVED: 'text-red-400 bg-red-400/10',
  removed: 'text-red-400 bg-red-400/10',
  CANCELED: 'text-red-400 bg-red-400/10',
  canceled: 'text-red-400 bg-red-400/10',
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status?.toUpperCase()] || STATUS_STYLES[status] || 'text-gray-400 bg-gray-400/10'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style}`}>
      {status}
    </span>
  )
}

function fmt(n: number | string | undefined, isCurrency = false): string {
  if (n === undefined || n === null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  if (isCurrency) return `$${num.toFixed(2)}`
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toFixed(num < 1 ? 4 : 0)
}

export default function AdsPage() {
  const [activeTab, setActiveTab] = useState<AdPlatform>('meta')
  const [campaigns, setCampaigns] = useState<{ meta: Campaign[]; google: Campaign[]; linkedin: Campaign[] }>({
    meta: [],
    google: [],
    linkedin: [],
  })
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [accountInfo, setAccountInfo] = useState<Record<string, unknown> | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<Record<AdPlatform, boolean | null>>({
    meta: null,
    google: null,
    linkedin: null,
  })
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', objective: 'OUTCOME_TRAFFIC', dailyBudget: 10 })
  const [creatingCampaign, setCreatingCampaign] = useState(false)

  const [adGenForm, setAdGenForm] = useState({
    product: '',
    audience: '',
    goal: 'Generate Leads' as AdGoal,
    tone: 'Professional' as AdTone,
    count: 3,
  })
  const [adVariations, setAdVariations] = useState<AdGenResult | null>(null)
  const [selectedVariation, setSelectedVariation] = useState(0)
  const [generatingAds, setGeneratingAds] = useState(false)
  const [adGenError, setAdGenError] = useState('')
  const [savedArtifact, setSavedArtifact] = useState(false)

  const [workspaceId, setWorkspaceId] = useState('')
  const [campaignError, setCampaignError] = useState('')
  const [loadedTabs, setLoadedTabs] = useState<Set<AdPlatform>>(new Set())

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
  }, [])

  const fetchCampaigns = useCallback(
    async (platform: AdPlatform, wid: string) => {
      if (!wid) return
      setLoadingCampaigns(true)
      setCampaignError('')
      try {
        const action = platform === 'meta' ? 'list' : 'campaigns'
        const res = await fetch(`/api/agents/ads/${platform}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: wid, action }),
        })
        const data = await res.json()
        if (data.requiresSetup) {
          setConnectionStatus(prev => ({ ...prev, [platform]: false }))
          setCampaigns(prev => ({ ...prev, [platform]: [] }))
        } else if (data.ok) {
          setConnectionStatus(prev => ({ ...prev, [platform]: true }))
          setCampaigns(prev => ({
            ...prev,
            [platform]: Array.isArray(data.campaigns) ? data.campaigns : [],
          }))
        } else {
          setCampaignError(data.error || 'Failed to load campaigns')
        }
      } catch (e) {
        setCampaignError(String(e))
      } finally {
        setLoadingCampaigns(false)
      }
    },
    []
  )

  const fetchMetaAccount = useCallback(async (wid: string) => {
    if (!wid) return
    try {
      const res = await fetch('/api/agents/ads/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wid, action: 'account' }),
      })
      const data = await res.json()
      if (data.ok && data.account) setAccountInfo(data.account)
    } catch {
      // ignore
    }
  }, [])

  // Load campaigns for active tab when it changes (lazy load per tab)
  useEffect(() => {
    if (!workspaceId) return
    if (loadedTabs.has(activeTab)) return
    setLoadedTabs(prev => new Set([...prev, activeTab]))
    fetchCampaigns(activeTab, workspaceId)
    if (activeTab === 'meta') fetchMetaAccount(workspaceId)
  }, [activeTab, workspaceId, loadedTabs, fetchCampaigns, fetchMetaAccount])

  async function handleRefresh() {
    if (!workspaceId) return
    // Force re-fetch by removing from loaded set
    setLoadedTabs(prev => {
      const next = new Set(prev)
      next.delete(activeTab)
      return next
    })
    await fetchCampaigns(activeTab, workspaceId)
    if (activeTab === 'meta') fetchMetaAccount(workspaceId)
  }

  async function handleCreateCampaign() {
    if (!workspaceId || !newCampaign.name) return
    setCreatingCampaign(true)
    try {
      const res = await fetch('/api/agents/ads/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'create',
          name: newCampaign.name,
          objective: newCampaign.objective,
          dailyBudget: newCampaign.dailyBudget,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowNewCampaign(false)
        setNewCampaign({ name: '', objective: 'OUTCOME_TRAFFIC', dailyBudget: 10 })
        // Refresh campaign list
        setLoadedTabs(prev => { const n = new Set(prev); n.delete('meta'); return n })
        fetchCampaigns('meta', workspaceId)
      } else {
        setCampaignError(data.error || 'Failed to create campaign')
      }
    } catch (e) {
      setCampaignError(String(e))
    } finally {
      setCreatingCampaign(false)
    }
  }

  async function handleToggleCampaign(campaign: Campaign) {
    if (!workspaceId) return
    const isActive = campaign.status?.toUpperCase() === 'ACTIVE' || campaign.status === 'enabled'
    const action = isActive ? 'pause' : 'activate'
    try {
      const res = await fetch(`/api/agents/ads/${activeTab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action, campaignId: campaign.id }),
      })
      const data = await res.json()
      if (data.ok) {
        // Optimistically update status
        setCampaigns(prev => ({
          ...prev,
          [activeTab]: prev[activeTab].map(c =>
            c.id === campaign.id
              ? { ...c, status: isActive ? 'PAUSED' : 'ACTIVE' }
              : c
          ),
        }))
      }
    } catch {
      // ignore
    }
  }

  async function handleGenerateAds() {
    if (!workspaceId || !adGenForm.product || !adGenForm.audience) return
    setGeneratingAds(true)
    setAdGenError('')
    setAdVariations(null)
    setSavedArtifact(false)
    try {
      const res = await fetch('/api/agents/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          platform: activeTab,
          product: adGenForm.product,
          audience: adGenForm.audience,
          goal: adGenForm.goal,
          tone: adGenForm.tone,
          count: adGenForm.count,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setAdVariations({
          variations: data.variations || [],
          campaignStrategy: data.campaignStrategy || '',
          budgetAllocation: data.budgetAllocation || '',
          keywordSuggestions: data.keywordSuggestions || [],
        })
        setSelectedVariation(0)
        if (data.artifactId) setSavedArtifact(true)
      } else {
        setAdGenError(data.error || 'Generation failed')
      }
    } catch (e) {
      setAdGenError(String(e))
    } finally {
      setGeneratingAds(false)
    }
  }

  const currentCampaigns = campaigns[activeTab]
  const isConnected = connectionStatus[activeTab]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🎯 Paid Ads Manager</h1>
          <p className="text-gray-400 text-sm mt-1">Manage Meta, Google &amp; LinkedIn ad campaigns with AI</p>
        </div>
      </div>

      {/* Platform Tabs */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(PLATFORM_CONFIG) as AdPlatform[]).map(platform => {
          const cfg = PLATFORM_CONFIG[platform]
          return (
            <button
              key={platform}
              onClick={() => { setActiveTab(platform); setCampaignError('') }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                activeTab === platform
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
              }`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              {connectionStatus[platform] === true && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
              {connectionStatus[platform] === false && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              )}
            </button>
          )
        })}
      </div>

      {/* Connection Status Banner */}
      {isConnected === false && (
        <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-950/30 flex items-center gap-3">
          <span className="text-red-400 text-xl">✗</span>
          <div>
            <p className="text-red-300 text-sm font-medium">Not configured</p>
            <p className="text-red-400/70 text-xs mt-0.5">
              Add API credentials in{' '}
              <a href="/dashboard/settings?tab=api-keys" className="underline hover:text-red-300">
                Settings → API Keys
              </a>
            </p>
          </div>
        </div>
      )}
      {isConnected === true && (
        <div className="mb-6 p-3 rounded-xl border border-green-800 bg-green-950/20 flex items-center gap-2 text-sm">
          <span className="text-green-400">✓</span>
          <span className="text-green-300 font-medium">Connected</span>
          {accountInfo && (activeTab === 'meta') && (
            <span className="text-green-400/70">
              — {String((accountInfo as Record<string, unknown>).name || (accountInfo as Record<string, unknown>).account_id || '')}
            </span>
          )}
        </div>
      )}

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── LEFT: Campaign Overview ────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Campaign Overview</h2>
            <button
              onClick={handleRefresh}
              disabled={loadingCampaigns}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
            >
              {loadingCampaigns ? '⏳ Loading...' : '↻ Refresh Campaigns'}
            </button>
          </div>

          {/* Error banner */}
          {campaignError && (
            <div className="p-3 rounded-lg border border-red-800 bg-red-950/30 text-red-300 text-xs">
              {campaignError}
            </div>
          )}

          {/* Campaign cards */}
          <div className="space-y-3">
            {loadingCampaigns && currentCampaigns.length === 0 && (
              <div className="text-center py-10 text-gray-500 text-sm">Loading campaigns...</div>
            )}
            {!loadingCampaigns && currentCampaigns.length === 0 && isConnected && (
              <div className="text-center py-10 bg-gray-900 border border-gray-800 rounded-xl text-gray-500 text-sm">
                <p>No campaigns found.</p>
                <p className="text-gray-600 text-xs mt-1">Create your first campaign below.</p>
              </div>
            )}
            {currentCampaigns.map(campaign => {
              const isActive =
                campaign.status?.toUpperCase() === 'ACTIVE' || campaign.status === 'enabled'
              return (
                <div
                  key={campaign.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{campaign.name}</p>
                      {campaign.objective && (
                        <span className="text-xs text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full mt-1 inline-block">
                          {campaign.objective.replace('OUTCOME_', '')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <StatusBadge status={campaign.effective_status || campaign.status || 'unknown'} />
                      <button
                        onClick={() => handleToggleCampaign(campaign)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                          isActive
                            ? 'border-amber-700 text-amber-400 hover:bg-amber-900/30'
                            : 'border-green-700 text-green-400 hover:bg-green-900/30'
                        }`}
                      >
                        {isActive ? 'Pause' : 'Activate'}
                      </button>
                    </div>
                  </div>

                  {/* Metrics row */}
                  {campaign.insights && (
                    <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-800">
                      {[
                        { label: 'Impressions', value: fmt(campaign.insights.impressions) },
                        { label: 'Clicks', value: fmt(campaign.insights.clicks) },
                        { label: 'CTR', value: campaign.insights.ctr !== undefined ? `${fmt(campaign.insights.ctr)}%` : '—' },
                        { label: 'Spend', value: fmt(campaign.insights.spend, true) },
                      ].map(({ label, value }) => (
                        <div key={label} className="text-center">
                          <p className="text-white text-sm font-semibold">{value}</p>
                          <p className="text-gray-500 text-xs">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* New Campaign button — only for Meta */}
          {activeTab === 'meta' && isConnected && (
            <div>
              {!showNewCampaign ? (
                <button
                  onClick={() => setShowNewCampaign(true)}
                  className="w-full py-2.5 border border-dashed border-gray-700 hover:border-indigo-500 text-gray-400 hover:text-indigo-400 rounded-xl text-sm font-medium transition-colors"
                >
                  + New Campaign
                </button>
              ) : (
                <div className="bg-gray-900 border border-indigo-500/40 rounded-xl p-4 space-y-3">
                  <h3 className="text-white text-sm font-medium">Create Meta Campaign</h3>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Campaign Name</label>
                    <input
                      type="text"
                      value={newCampaign.name}
                      onChange={e => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Summer Sale 2026"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Objective</label>
                    <select
                      value={newCampaign.objective}
                      onChange={e => setNewCampaign(prev => ({ ...prev, objective: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                    >
                      <option value="OUTCOME_AWARENESS">Awareness</option>
                      <option value="OUTCOME_TRAFFIC">Traffic</option>
                      <option value="OUTCOME_LEADS">Leads</option>
                      <option value="OUTCOME_SALES">Sales</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Daily Budget ($)</label>
                    <input
                      type="number"
                      min={1}
                      value={newCampaign.dailyBudget}
                      onChange={e => setNewCampaign(prev => ({ ...prev, dailyBudget: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateCampaign}
                      disabled={creatingCampaign || !newCampaign.name}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {creatingCampaign ? '⏳ Creating...' : 'Create Campaign'}
                    </button>
                    <button
                      onClick={() => setShowNewCampaign(false)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: AI Ad Generator ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-white font-semibold">AI Ad Generator</h2>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Product / Service</label>
              <input
                type="text"
                value={adGenForm.product}
                onChange={e => setAdGenForm(prev => ({ ...prev, product: e.target.value }))}
                placeholder="e.g. AI marketing platform for small businesses"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Target Audience</label>
              <input
                type="text"
                value={adGenForm.audience}
                onChange={e => setAdGenForm(prev => ({ ...prev, audience: e.target.value }))}
                placeholder="e.g. E-commerce founders aged 25-45 in North America"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Goal</label>
                <select
                  value={adGenForm.goal}
                  onChange={e => setAdGenForm(prev => ({ ...prev, goal: e.target.value as AdGoal }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option>Brand Awareness</option>
                  <option>Drive Traffic</option>
                  <option>Generate Leads</option>
                  <option>Drive Sales</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Tone</label>
                <select
                  value={adGenForm.tone}
                  onChange={e => setAdGenForm(prev => ({ ...prev, tone: e.target.value as AdTone }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option>Professional</option>
                  <option>Friendly</option>
                  <option>Urgent</option>
                  <option>Inspirational</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Variations (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={adGenForm.count}
                onChange={e => setAdGenForm(prev => ({ ...prev, count: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)) }))}
                className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            {adGenError && (
              <div className="p-3 rounded-lg border border-red-800 bg-red-950/30 text-red-300 text-xs">
                {adGenError}
              </div>
            )}

            <button
              onClick={handleGenerateAds}
              disabled={generatingAds || !adGenForm.product || !adGenForm.audience}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
            >
              {generatingAds ? '✨ Generating...' : `✨ Generate Ad Copy for ${PLATFORM_CONFIG[activeTab].label}`}
            </button>
          </div>

          {/* Results */}
          {adVariations && adVariations.variations.length > 0 && (
            <div className="space-y-4">
              {/* Variation tabs */}
              <div className="flex gap-2">
                {adVariations.variations.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedVariation(i)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      selectedVariation === i
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    #{i + 1}
                  </button>
                ))}
              </div>

              {/* Variation card */}
              {(() => {
                const v = adVariations.variations[selectedVariation]
                if (!v) return null
                return (
                  <div className="bg-gray-900 border border-indigo-500/30 rounded-xl p-5 space-y-4">
                    {/* Headline */}
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Headline</p>
                      <p className="text-white text-xl font-bold">{v.headline}</p>
                    </div>

                    {/* Primary Text */}
                    {v.primaryText && (
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Primary Text</p>
                        <p className="text-gray-200 text-sm leading-relaxed">{v.primaryText}</p>
                      </div>
                    )}

                    {/* Description */}
                    {v.description && (
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Description</p>
                        <p className="text-gray-300 text-sm">{v.description}</p>
                      </div>
                    )}

                    {/* CTA preview */}
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Call to Action</p>
                      <span className="inline-block px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg">
                        {v.callToAction}
                      </span>
                    </div>

                    {/* Hook & Psychology */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800">
                      <div>
                        <p className="text-gray-500 text-xs mb-0.5">Hook</p>
                        <p className="text-gray-400 text-xs">{v.hook}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs mb-0.5">Psychology</p>
                        <p className="text-gray-400 text-xs capitalize">{v.psychologyPrinciple}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs mb-0.5">Est. CTR</p>
                        <p className="text-green-400 text-xs font-medium">{v.estimatedCtr}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs mb-0.5">Targeting Hint</p>
                        <p className="text-gray-400 text-xs">{v.targetingHint}</p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Campaign Strategy */}
              {adVariations.campaignStrategy && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-400 text-xs font-medium mb-2">Campaign Strategy</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{adVariations.campaignStrategy}</p>
                  {adVariations.budgetAllocation && (
                    <>
                      <p className="text-gray-400 text-xs font-medium mt-3 mb-1">Budget Allocation</p>
                      <p className="text-gray-300 text-sm">{adVariations.budgetAllocation}</p>
                    </>
                  )}
                  {adVariations.keywordSuggestions && adVariations.keywordSuggestions.length > 0 && (
                    <>
                      <p className="text-gray-400 text-xs font-medium mt-3 mb-2">Keyword Suggestions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {adVariations.keywordSuggestions.map((kw, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-full">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Save to Artifacts */}
              <div className="flex items-center gap-3">
                {savedArtifact ? (
                  <span className="text-green-400 text-sm">✓ Saved to Artifacts</span>
                ) : (
                  <button
                    onClick={handleGenerateAds}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    Save to Artifacts
                  </button>
                )}
                <button
                  onClick={() => { setAdVariations(null); setSavedArtifact(false) }}
                  className="text-gray-500 hover:text-gray-400 text-sm transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
