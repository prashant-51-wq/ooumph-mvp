'use client'

/**
 * /dashboard/ads
 *
 * Paid-Ads command center with three sections:
 *
 *   1. Global Budget Meter — visualises today's committed daily spend
 *      against the workspace's alert_threshold_budget and hard_max_daily_spend.
 *      Polls /api/ad-budget every 8s.
 *
 *   2. Campaigns table — every ad_campaigns row (drafts, deploying, active,
 *      paused, failed) with inline Deploy / Pause / Archive controls.
 *
 *   3. Detail panel — when a row is selected, shows its creatives (each
 *      linked to its source artifact for HITL review) and the most recent
 *      provider error_log if any.
 *
 * The Deploy button is the only path from draft → active and runs the full
 * 7-gate orchestrator at /api/ads/[id]/deploy. All error states (budget
 * exceeded, artifact not approved, provider rejection) are surfaced inline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Megaphone, Plus, RefreshCw, Rocket, Pause, Archive, AlertCircle,
  Loader2, ShieldCheck, ExternalLink, X, Edit3, CheckCircle2,
  XCircle, Briefcase, Bird, Globe, Layers, ChevronRight,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface AdCampaign {
  id: string
  workspace_id: string
  platform: string
  native_campaign_id: string | null
  name: string
  daily_budget: number | string
  status: string
  error_log: string | null
  utm_override: string | null
  created_at: string
}

interface AdCreative {
  id: string
  ad_campaign_id: string
  artifact_id: string | null
  headline: string
  body_copy: string
  media_url: string | null
  destination_url: string
  created_at: string
}

interface BudgetSnapshot {
  hardCap: number
  alertThreshold: number
  currentActiveSpend: number
  currentDeployingSpend: number
  totalCommitted: number
  remainingHeadroom: number
  crossedAlertThreshold: boolean
  crossedHardCap: boolean
  activeCampaigns: Array<{ id: string; name: string; platform: string; daily_budget: number; status: string }>
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function centsToCurrency(cents: number, opts: { compact?: boolean } = {}): string {
  const dollars = (cents || 0) / 100
  if (opts.compact && dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const STATUS_PILL: Record<string, string> = {
  draft:     'bg-gray-800 text-gray-400 border-gray-700',
  deploying: 'bg-blue-900/40 text-blue-200 border-blue-800',
  active:    'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  paused:    'bg-amber-900/40 text-amber-200 border-amber-800',
  failed:    'bg-rose-900/40 text-rose-200 border-rose-800',
  archived:  'bg-gray-800 text-gray-500 border-gray-700',
}
function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_PILL[status] || STATUS_PILL.draft}`}>
      {status === 'deploying' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status}
    </span>
  )
}

function PlatformIcon({ platform, className = 'w-4 h-4' }: { platform: string; className?: string }) {
  const p = platform.toLowerCase()
  if (p === 'meta_ads' || p === 'meta' || p === 'facebook' || p === 'instagram')
    return <span className={`${className} inline-flex items-center justify-center text-xs font-bold text-sky-400`}>𝙼</span>
  if (p === 'google_ads' || p === 'google')
    return <span className={`${className} inline-flex items-center justify-center text-xs font-bold text-yellow-400`}>G</span>
  if (p === 'linkedin' || p === 'linkedin_ads') return <Briefcase className={`${className} text-sky-400`} />
  if (p === 'twitter' || p === 'x') return <Bird className={`${className} text-gray-300`} />
  if (p === 'wordpress') return <Globe className={`${className} text-emerald-400`} />
  return <Layers className={`${className} text-gray-500`} />
}

const PLATFORM_OPTIONS = [
  { id: 'meta_ads', label: 'Meta Ads' },
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'linkedin_ads', label: 'LinkedIn Ads' },
  { id: 'tiktok', label: 'TikTok' },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [budget, setBudget] = useState<BudgetSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatives, setCreatives] = useState<AdCreative[]>([])
  const [loadingCreatives, setLoadingCreatives] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [deployingId, setDeployingId] = useState<string | null>(null)

  // Resolve workspace
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
      })
      .catch(() => { /* fallthrough */ })
    return () => { cancelled = true }
  }, [])

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [campRes, budgetRes] = await Promise.all([
        fetch(`/api/ad-campaigns?workspaceId=${workspaceId}`),
        fetch(`/api/ad-budget?workspaceId=${workspaceId}`),
      ])
      const camps = await campRes.json() as AdCampaign[]
      const bud = await budgetRes.json() as BudgetSnapshot
      setCampaigns(Array.isArray(camps) ? camps : [])
      setBudget(bud && typeof bud.hardCap === 'number' ? bud : null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll while any campaign is deploying
  useEffect(() => {
    if (!workspaceId) return
    const anyActive = campaigns.some(c => c.status === 'deploying')
    if (!anyActive) {
      // still poll budget every 30s for live updates from external syncs
      const t = setInterval(fetchAll, 30_000)
      return () => clearInterval(t)
    }
    const t = setInterval(fetchAll, 3_000)
    return () => clearInterval(t)
  }, [workspaceId, campaigns, fetchAll])

  // Fetch creatives for selected campaign
  useEffect(() => {
    if (!workspaceId || !selectedId) { setCreatives([]); return }
    setLoadingCreatives(true)
    fetch(`/api/ad-creatives?workspaceId=${workspaceId}&campaignId=${selectedId}`)
      .then(r => r.json())
      .then((rows: AdCreative[]) => setCreatives(Array.isArray(rows) ? rows : []))
      .catch(() => setCreatives([]))
      .finally(() => setLoadingCreatives(false))
  }, [workspaceId, selectedId])

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedId) || null,
    [campaigns, selectedId],
  )

  // ── Actions ─────────────────────────────────────────────────────────────
  const deploy = async (id: string) => {
    if (!workspaceId) return
    setDeployingId(id); setActionError(null); setActionSuccess(null)
    try {
      const res = await fetch(`/api/ads/${id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as {
        ok?: boolean
        error?: string
        currentActiveSpend?: number
        proposedDailyBudget?: number
        hardMaxDailySpend?: number
        nativeCampaignId?: string
        usedMock?: boolean
        budgetSummary?: { totalAfterActivation: number; crossedAlertThreshold: boolean }
      }
      if (!res.ok || !data.ok) {
        const detail = data.currentActiveSpend != null
          ? ` (today's spend: ${centsToCurrency(data.currentActiveSpend)}, cap: ${centsToCurrency(data.hardMaxDailySpend || 0)})`
          : ''
        throw new Error((data.error || 'Deploy failed') + detail)
      }
      const mockTag = data.usedMock ? ' (mock — connect integration to push live)' : ''
      const warnTag = data.budgetSummary?.crossedAlertThreshold ? ' · ⚠ over alert threshold' : ''
      setActionSuccess(`Campaign deployed to ${selectedCampaign?.platform || 'platform'}${mockTag}${warnTag}`)
      fetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeployingId(null)
    }
  }

  const pause = async (id: string) => {
    if (!workspaceId) return
    setActionError(null); setActionSuccess(null)
    try {
      const res = await fetch('/api/ad-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId, status: 'paused' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || `Pause failed (${res.status})`)
      }
      setActionSuccess('Campaign paused — no further spend will accrue.')
      fetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const archive = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Archive this campaign? It will stay in the audit trail but disappear from active views.')) return
    try {
      const res = await fetch(`/api/ad-campaigns?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'Archive failed')
      }
      if (selectedId === id) setSelectedId(null)
      fetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-indigo-400" /> Paid Ads
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every campaign is gated by HITL approval and the workspace's Dual-Key Budget Lock.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowNew(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New campaign
            </button>
          </div>
        </div>

        {/* Global Budget Meter */}
        {budget && <BudgetMeter snapshot={budget} />}

        {/* Action toast */}
        {actionError && (
          <div className="mt-3 mb-3 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">{actionError}</div>
            <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {actionSuccess && (
          <div className="mt-3 mb-3 p-3 bg-emerald-950/40 border border-emerald-900 rounded-lg text-emerald-300 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">{actionSuccess}</div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
          {/* Campaigns list */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="text-center py-16 text-gray-500 text-sm">Loading campaigns…</div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
                <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                <p className="text-gray-300 text-lg mb-1">No campaigns yet</p>
                <p className="text-sm text-gray-600 mb-6">
                  Create your first campaign or ask the AI Media Buyer to draft one from a strategy.
                </p>
                <button
                  onClick={() => setShowNew(true)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create campaign
                </button>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-950 border-b border-gray-800">
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-4 py-3 font-medium">Platform</th>
                      <th className="px-4 py-3 font-medium">Daily budget</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {campaigns.map(c => {
                      const cents = Number(c.daily_budget || 0)
                      const isSelected = selectedId === c.id
                      const isDeploying = deployingId === c.id || c.status === 'deploying'
                      const canDeploy = c.status === 'draft'
                      const canPause = c.status === 'active'
                      const canArchive = c.status !== 'deploying' && c.status !== 'archived'
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-900/15' : 'hover:bg-gray-950/50'}`}
                        >
                          <td className="px-4 py-3">
                            <div className="text-white font-medium">{c.name}</div>
                            {c.error_log && c.status === 'failed' && (
                              <div className="text-xs text-rose-400 mt-0.5 truncate max-w-[320px]" title={c.error_log}>
                                {c.error_log}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-gray-300">
                              <PlatformIcon platform={c.platform} />
                              {c.platform}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{centsToCurrency(cents)}</td>
                          <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            {canDeploy && (
                              <button
                                onClick={() => deploy(c.id)}
                                disabled={isDeploying}
                                className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
                              >
                                {isDeploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                                {isDeploying ? 'Deploying…' : 'Deploy'}
                              </button>
                            )}
                            {canPause && (
                              <button
                                onClick={() => pause(c.id)}
                                className="px-3 py-1 text-xs bg-amber-900/40 hover:bg-amber-900/60 border border-amber-800 text-amber-200 rounded inline-flex items-center gap-1.5"
                              >
                                <Pause className="w-3 h-3" /> Pause
                              </button>
                            )}
                            {canArchive && c.status !== 'active' && (
                              <button
                                onClick={() => archive(c.id)}
                                className="ml-1 p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded"
                                title="Archive"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selectedCampaign ? (
              <CampaignDetail
                workspaceId={workspaceId!}
                campaign={selectedCampaign}
                creatives={creatives}
                loadingCreatives={loadingCreatives}
                onChanged={fetchAll}
              />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
                <ChevronRight className="w-6 h-6 mx-auto mb-2 text-gray-700" />
                Select a campaign to inspect its creatives + HITL gate status
              </div>
            )}
          </div>
        </div>

        {showNew && workspaceId && (
          <NewCampaignModal
            workspaceId={workspaceId}
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); fetchAll() }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Global Budget Meter ───────────────────────────────────────────────────

function BudgetMeter({ snapshot }: { snapshot: BudgetSnapshot }) {
  const { hardCap, alertThreshold, currentActiveSpend, currentDeployingSpend, totalCommitted } = snapshot
  // Percentages on the bar
  const activePct = Math.min(100, hardCap > 0 ? (currentActiveSpend / hardCap) * 100 : 0)
  const deployingPct = Math.min(100 - activePct, hardCap > 0 ? (currentDeployingSpend / hardCap) * 100 : 0)
  const alertPct = Math.min(100, hardCap > 0 ? (alertThreshold / hardCap) * 100 : 0)
  const remaining = Math.max(0, hardCap - totalCommitted)
  const utilizationColor = snapshot.crossedHardCap
    ? 'bg-rose-500'
    : snapshot.crossedAlertThreshold
    ? 'bg-amber-500'
    : 'bg-emerald-500'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
            Global Budget Meter · daily
          </p>
          <p className="text-2xl font-bold text-white tabular-nums">
            {centsToCurrency(totalCommitted)}
            <span className="text-sm text-gray-500 font-normal ml-2">
              of {centsToCurrency(hardCap)} hard cap
            </span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <Metric label="Active" value={centsToCurrency(currentActiveSpend)} tone="emerald" />
          <Metric label="Deploying" value={centsToCurrency(currentDeployingSpend)} tone="blue" />
          <Metric label="Headroom" value={centsToCurrency(remaining)} tone={remaining > 0 ? 'gray' : 'rose'} />
        </div>
      </div>

      {/* The bar */}
      <div className="relative h-3 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
        {/* Active portion */}
        <div
          className={`absolute top-0 left-0 h-full transition-all ${utilizationColor}`}
          style={{ width: `${activePct}%` }}
        />
        {/* Deploying portion (lighter overlay) */}
        <div
          className="absolute top-0 h-full bg-blue-500/60 transition-all"
          style={{ left: `${activePct}%`, width: `${deployingPct}%` }}
        />
        {/* Alert threshold marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-amber-300 opacity-80"
          style={{ left: `${alertPct}%` }}
          title={`Alert threshold: ${centsToCurrency(alertThreshold)}`}
        />
      </div>

      {/* Legend + threshold pill */}
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Legend dot="bg-emerald-500" label="Active" />
          <Legend dot="bg-blue-500/60" label="Deploying" />
          <Legend dot="bg-amber-300" label={`Alert ${centsToCurrency(alertThreshold)}`} bar />
        </div>
        <div>
          {snapshot.crossedHardCap
            ? <span className="text-rose-300 font-medium">⛔ Over hard cap — no new deploys allowed</span>
            : snapshot.crossedAlertThreshold
            ? <span className="text-amber-300 font-medium">⚠ Past alert threshold — admin notification fired</span>
            : <span>Healthy</span>}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'blue' | 'gray' | 'rose' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-300' :
    tone === 'blue' ? 'text-blue-300' :
    tone === 'rose' ? 'text-rose-300' :
    'text-gray-300'
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}
function Legend({ dot, label, bar = false }: { dot: string; label: string; bar?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${dot} ${bar ? 'w-0.5 h-2.5' : 'w-2 h-2 rounded-full'}`} />
      {label}
    </span>
  )
}

// ─── Campaign detail panel ────────────────────────────────────────────────

function CampaignDetail({
  workspaceId, campaign, creatives, loadingCreatives, onChanged,
}: {
  workspaceId: string
  campaign: AdCampaign
  creatives: AdCreative[]
  loadingCreatives: boolean
  onChanged: () => void
}) {
  const [showAddCreative, setShowAddCreative] = useState(false)
  const cents = Number(campaign.daily_budget || 0)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col max-h-[700px]">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-white font-semibold truncate">{campaign.name}</div>
            <div className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1.5">
              <PlatformIcon platform={campaign.platform} className="w-3 h-3" />
              {campaign.platform} · {centsToCurrency(cents)}/day
            </div>
          </div>
          <StatusPill status={campaign.status} />
        </div>
        {campaign.native_campaign_id && (
          <div className="text-[11px] text-gray-500 font-mono mt-2">
            native_id: {campaign.native_campaign_id}
          </div>
        )}
        {campaign.error_log && (
          <div className="mt-2 p-2 bg-rose-950/30 border border-rose-900 rounded text-xs text-rose-300">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            {campaign.error_log}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">
            Creatives ({creatives.length})
          </p>
          <button
            onClick={() => setShowAddCreative(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add creative
          </button>
        </div>

        {loadingCreatives ? (
          <div className="text-center py-6 text-gray-500 text-xs">Loading…</div>
        ) : creatives.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-800 rounded text-xs text-gray-600">
            No creatives yet. Add at least one before deploying.
          </div>
        ) : (
          <div className="space-y-2">
            {creatives.map(cr => (
              <div key={cr.id} className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm text-white font-medium truncate flex-1">{cr.headline}</div>
                  {cr.artifact_id ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-900/30 border border-purple-800 px-1.5 py-0.5 rounded">
                      <ShieldCheck className="w-2.5 h-2.5" /> gated
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400">
                      no gate
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 line-clamp-3 mb-2">{cr.body_copy}</p>
                <a
                  href={cr.destination_url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 truncate max-w-full"
                  title={cr.destination_url}
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{cr.destination_url}</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddCreative && (
        <AddCreativeModal
          workspaceId={workspaceId}
          campaignId={campaign.id}
          onClose={() => setShowAddCreative(false)}
          onCreated={() => { setShowAddCreative(false); onChanged() }}
        />
      )}
    </div>
  )
}

// ─── Modals ────────────────────────────────────────────────────────────────

function NewCampaignModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('meta_ads')
  const [dailyBudgetDollars, setDailyBudgetDollars] = useState('25')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    const dollars = Number(dailyBudgetDollars)
    if (!Number.isFinite(dollars) || dollars < 1) { setErr('Daily budget must be at least $1'); return }
    setSaving(true); setErr(null)
    try {
      const cents = Math.floor(dollars * 100)
      const res = await fetch('/api/ad-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: name.trim(), platform, dailyBudget: cents }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Create failed')
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">New ad campaign</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Campaign name *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Q2 SaaS founders LinkedIn"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Platform *</label>
              <select
                value={platform} onChange={e => setPlatform(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
              >
                {PLATFORM_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Daily budget (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-gray-500">$</span>
                <input
                  type="number" min="1" step="1"
                  value={dailyBudgetDollars} onChange={e => setDailyBudgetDollars(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-600">
            Status starts as <span className="text-gray-400">draft</span>. Deploy through the campaign list once you've attached approved creatives.
          </p>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddCreativeModal({
  workspaceId, campaignId, onClose, onCreated,
}: { workspaceId: string; campaignId: string; onClose: () => void; onCreated: () => void }) {
  const [headline, setHeadline] = useState('')
  const [bodyCopy, setBodyCopy] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [artifactId, setArtifactId] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!headline.trim() || !bodyCopy.trim() || !destinationUrl.trim()) {
      setErr('Headline, body copy, and destination URL are required'); return
    }
    try { new URL(destinationUrl.trim()) } catch { setErr('Destination URL is malformed'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/ad-creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, campaignId,
          headline: headline.trim(), bodyCopy: bodyCopy.trim(),
          destinationUrl: destinationUrl.trim(),
          artifactId: artifactId.trim() || undefined,
          mediaUrl: mediaUrl.trim() || undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Create failed')
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Add creative</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Headline *</label>
            <input
              value={headline} onChange={e => setHeadline(e.target.value)}
              maxLength={120}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Body copy *</label>
            <textarea
              value={bodyCopy} onChange={e => setBodyCopy(e.target.value)}
              rows={4} maxLength={600}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Destination URL *</label>
            <input
              value={destinationUrl} onChange={e => setDestinationUrl(e.target.value)}
              placeholder="https://acme.com/signup"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-600 focus:outline-none"
            />
            <p className="text-[11px] text-gray-600 mt-1">
              UTM params are auto-injected at deploy. Don't add them here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Artifact ID (HITL gate)</label>
              <input
                value={artifactId} onChange={e => setArtifactId(e.target.value)}
                placeholder="optional"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Media URL</label>
              <input
                value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                placeholder="optional"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Saving…' : 'Save creative'}
          </button>
        </div>
      </div>
    </div>
  )
}
