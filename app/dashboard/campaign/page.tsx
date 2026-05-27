'use client'

/**
 * /dashboard/campaign
 *
 * Performance ledger that fuses ad_campaigns rows with funnel_steps
 * conversion counters. For every campaign we render:
 *   - the canonical status pill (active / deploying / failed / paused / draft)
 *   - the per-campaign daily budget
 *   - linked funnel performance: total views, conversions, conversion rate
 *
 * Funnels are matched to campaigns by best-effort heuristic — if a campaign
 * has any ad_creatives whose destination_url path matches a funnel_steps.slug,
 * those funnel rows roll up under the campaign. Standalone funnels (no
 * matching campaign) are surfaced at the bottom in a separate "Unlinked"
 * section so they remain visible.
 *
 * Polls every 15s. Click-through to /api/f/[slug] for live preview.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, AlertCircle, ExternalLink, Loader2,
  TrendingUp, Users, Target, Megaphone, Briefcase, Bird, Globe, Layers,
  Eye, MousePointerClick, ChevronRight,
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
  destination_url: string
  artifact_id: string | null
  headline: string
}

interface FunnelStep {
  id: string
  workspace_id: string
  slug: string
  view_count: number | string
  conversion_count: number | string
  created_at: string
}

interface RowMetrics {
  views: number
  conversions: number
  conversionRate: number      // 0..1
  funnelSlugs: string[]       // matched funnel slugs (for inline link-out)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function centsToCurrency(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

function PlatformIcon({ platform, className = 'w-3.5 h-3.5' }: { platform: string; className?: string }) {
  const p = platform.toLowerCase()
  if (p.startsWith('meta') || p === 'facebook' || p === 'instagram')
    return <span className={`${className} inline-flex items-center justify-center text-xs font-bold text-sky-400`}>𝙼</span>
  if (p.startsWith('google'))
    return <span className={`${className} inline-flex items-center justify-center text-xs font-bold text-yellow-400`}>G</span>
  if (p === 'linkedin' || p === 'linkedin_ads') return <Briefcase className={`${className} text-sky-400`} />
  if (p === 'twitter' || p === 'x') return <Bird className={`${className} text-gray-300`} />
  if (p === 'wordpress') return <Globe className={`${className} text-emerald-400`} />
  return <Layers className={`${className} text-gray-500`} />
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return '0.0%'
  return `${(rate * 100).toFixed(1)}%`
}
function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

/**
 * Extract a funnel slug candidate from a destination URL.
 * We match anything served at the canonical /api/f/<slug> path PLUS
 * a friendlier /lp/<slug> alias many UIs use.
 */
function extractFunnelSlugFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '')
    const apiMatch = path.match(/\/api\/f\/([A-Za-z0-9_-]+)$/)
    if (apiMatch) return apiMatch[1].toLowerCase()
    const lpMatch = path.match(/\/lp\/([A-Za-z0-9_-]+)$/)
    if (lpMatch) return lpMatch[1].toLowerCase()
    return null
  } catch {
    return null
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CampaignPerformancePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [creatives, setCreatives] = useState<AdCreative[]>([])
  const [funnels, setFunnels] = useState<FunnelStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [campRes, crRes, funnelRes] = await Promise.all([
        fetch(`/api/ad-campaigns?workspaceId=${workspaceId}`),
        fetch(`/api/ad-creatives?workspaceId=${workspaceId}`),
        fetch(`/api/funnel-steps?workspaceId=${workspaceId}`),
      ])
      const [c, cr, f] = await Promise.all([
        campRes.json() as Promise<AdCampaign[]>,
        crRes.json() as Promise<AdCreative[]>,
        funnelRes.json() as Promise<FunnelStep[]>,
      ])
      setCampaigns(Array.isArray(c) ? c : [])
      setCreatives(Array.isArray(cr) ? cr : [])
      setFunnels(Array.isArray(f) ? f : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (!workspaceId) return
    const t = setInterval(fetchAll, 15_000)
    return () => clearInterval(t)
  }, [workspaceId, fetchAll])

  // Build funnel slug → row index once
  const funnelBySlug = useMemo(() => {
    const map = new Map<string, FunnelStep>()
    for (const f of funnels) map.set(f.slug.toLowerCase(), f)
    return map
  }, [funnels])

  // Roll up funnel performance under each campaign via creative destination URLs
  const campaignMetrics = useMemo(() => {
    const out = new Map<string, RowMetrics>()
    for (const camp of campaigns) {
      const linkedCreatives = creatives.filter(cr => cr.ad_campaign_id === camp.id)
      const slugs = new Set<string>()
      let views = 0
      let conversions = 0
      for (const cr of linkedCreatives) {
        const slug = extractFunnelSlugFromUrl(cr.destination_url)
        if (slug && funnelBySlug.has(slug)) {
          slugs.add(slug)
          const f = funnelBySlug.get(slug)!
          views += Number(f.view_count || 0)
          conversions += Number(f.conversion_count || 0)
        }
      }
      out.set(camp.id, {
        views, conversions,
        conversionRate: views > 0 ? conversions / views : 0,
        funnelSlugs: Array.from(slugs),
      })
    }
    return out
  }, [campaigns, creatives, funnelBySlug])

  // Funnels that are NOT linked to any campaign — surface separately
  const unlinkedFunnels = useMemo(() => {
    const linkedSlugs = new Set<string>()
    for (const m of campaignMetrics.values()) m.funnelSlugs.forEach(s => linkedSlugs.add(s))
    return funnels.filter(f => !linkedSlugs.has(f.slug.toLowerCase()))
  }, [campaignMetrics, funnels])

  // Workspace-wide stat-card rollups
  const totals = useMemo(() => {
    let totalViews = 0, totalConversions = 0, totalDailyBudget = 0
    for (const m of campaignMetrics.values()) {
      totalViews += m.views
      totalConversions += m.conversions
    }
    for (const f of funnels) {
      // include unlinked funnels in views/conversions roll-up
      if (![...campaignMetrics.values()].some(m => m.funnelSlugs.includes(f.slug.toLowerCase()))) {
        totalViews += Number(f.view_count || 0)
        totalConversions += Number(f.conversion_count || 0)
      }
    }
    for (const c of campaigns) {
      if (c.status === 'active' || c.status === 'deploying') {
        totalDailyBudget += Number(c.daily_budget || 0)
      }
    }
    return {
      totalViews, totalConversions, totalDailyBudget,
      rate: totalViews > 0 ? totalConversions / totalViews : 0,
      activeCount: campaigns.filter(c => c.status === 'active').length,
    }
  }, [campaignMetrics, funnels, campaigns])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-indigo-400" /> Campaign Performance
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Live ledger of every ad campaign with funnel-conversion roll-ups.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Megaphone} label="Active campaigns" value={String(totals.activeCount)} accent="text-indigo-300" />
          <StatCard icon={TrendingUp} label="Daily budget (live)" value={centsToCurrency(totals.totalDailyBudget)} accent="text-emerald-300" />
          <StatCard icon={Eye} label="Funnel views (total)" value={totals.totalViews.toLocaleString()} accent="text-sky-300" />
          <StatCard icon={Target} label="Conversion rate" value={formatRate(totals.rate)} accent="text-amber-300" sub={`${totals.totalConversions.toLocaleString()} conversions`} />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Campaigns ledger */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">No campaigns yet</p>
            <p className="text-sm text-gray-600 mb-4">
              Head to <a href="/dashboard/ads" className="text-indigo-400 hover:text-indigo-300">/dashboard/ads</a> to draft your first campaign.
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Daily budget</th>
                  <th className="px-4 py-3 font-medium">Views</th>
                  <th className="px-4 py-3 font-medium">Conversions</th>
                  <th className="px-4 py-3 font-medium">CR</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {campaigns.map(c => {
                  const m = campaignMetrics.get(c.id) || { views: 0, conversions: 0, conversionRate: 0, funnelSlugs: [] }
                  const cents = Number(c.daily_budget || 0)
                  return (
                    <tr key={c.id} className="hover:bg-gray-950/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={c.platform} />
                          <div>
                            <div className="text-white font-medium">{c.name}</div>
                            <div className="text-[11px] text-gray-500">
                              {c.platform}
                              {c.native_campaign_id && (
                                <span className="ml-2 font-mono">{c.native_campaign_id.slice(0, 24)}{c.native_campaign_id.length > 24 ? '…' : ''}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {c.error_log && c.status === 'failed' && (
                          <div className="mt-1 text-[11px] text-rose-400 line-clamp-2 max-w-[420px]" title={c.error_log}>
                            <AlertCircle className="w-3 h-3 inline mr-1" /> {c.error_log}
                          </div>
                        )}
                        {m.funnelSlugs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.funnelSlugs.map(slug => (
                              <a
                                key={slug}
                                href={`/api/f/${slug}`}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800 rounded hover:bg-emerald-900/60"
                              >
                                /lp/{slug} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{centsToCurrency(cents)}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3 h-3 text-gray-500" />
                          {m.views.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <MousePointerClick className="w-3 h-3 text-gray-500" />
                          {m.conversions.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={m.conversionRate >= 0.05 ? 'text-emerald-300' : m.conversionRate > 0 ? 'text-amber-300' : 'text-gray-500'}>
                          {formatRate(m.conversionRate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(c.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Unlinked funnels */}
        {unlinkedFunnels.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium flex items-center gap-2">
                <Users className="w-4 h-4" /> Unlinked funnels
              </h2>
              <p className="text-[11px] text-gray-600">
                Funnels with traffic but no matching campaign creative
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-950 border-b border-gray-800">
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Views</th>
                    <th className="px-4 py-3 font-medium">Conversions</th>
                    <th className="px-4 py-3 font-medium">CR</th>
                    <th className="px-4 py-3 font-medium text-right">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {unlinkedFunnels.map(f => {
                    const v = Number(f.view_count || 0)
                    const conv = Number(f.conversion_count || 0)
                    const cr = v > 0 ? conv / v : 0
                    return (
                      <tr key={f.id} className="hover:bg-gray-950/50">
                        <td className="px-4 py-3">
                          <code className="text-sm text-emerald-300">/lp/{f.slug}</code>
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{v.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{conv.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={cr >= 0.05 ? 'text-emerald-300' : cr > 0 ? 'text-amber-300' : 'text-gray-500'}>
                            {formatRate(cr)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/api/f/${f.slug}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            View <ChevronRight className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, accent, sub }: {
  icon: typeof BarChart3
  label: string
  value: string
  accent?: string
  sub?: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
        <Icon className={`w-3.5 h-3.5 ${accent || 'text-gray-400'}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent || 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}
