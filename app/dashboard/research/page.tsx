'use client'

/**
 * /dashboard/research
 *
 * Market Intelligence dashboard powered by /api/research-feed.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Stat cards: Total enriched · With tech stack · Coverage rate · Win │
 *   ├────────────────────────────────────┬────────────────────────────────┤
 *   │  Trending industries (bar list)    │  Tool concentrations (bars)   │
 *   ├────────────────────────────────────┴────────────────────────────────┤
 *   │  SDR Provider Leaderboard (runs · avg · p95)                        │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Recent enrichments feed (scannable B2B cards)                      │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Polls every 30s. Window filter (7 / 30 / 90 days) reshapes the summary.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Telescope, RefreshCw, AlertCircle, TrendingUp, Layers,
  Building2, Briefcase, Bird, ExternalLink, Activity,
  Gauge, Sparkles, Award,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface FeedItem {
  lead_id: string
  contact_name: string | null
  contact_email: string | null
  company_name: string | null
  industry: string | null
  company_size: string | null
  estimated_revenue: string | null
  linkedin_url: string | null
  twitter_url: string | null
  tech_stack: string[]
  enrichment_summary: string | null
  enriched_at: string
  source_count: number
}

interface ResearchFeed {
  window: { fromIso: string; toIso: string; days: number }
  summary: {
    totalEnriched: number
    withCompanyName: number
    withTechStack: number
    industries: Array<{ name: string; count: number }>
    topTechStack: Array<{ name: string; count: number }>
    providers: Array<{ provider: string; runs: number; avgMs: number; p95Ms: number }>
  }
  items: FeedItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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
function pct(part: number, whole: number): string {
  if (!whole) return '0%'
  return `${((part / whole) * 100).toFixed(0)}%`
}

const PROVIDER_BADGE_COLOR: Record<string, string> = {
  brave_search: 'bg-orange-900/30 text-orange-300 border-orange-800',
  apollo:       'bg-blue-900/30 text-blue-300 border-blue-800',
  clearbit:     'bg-purple-900/30 text-purple-300 border-purple-800',
  hunter:       'bg-emerald-900/30 text-emerald-300 border-emerald-800',
}
function providerColor(p: string): string {
  return PROVIDER_BADGE_COLOR[p] || 'bg-gray-900 text-gray-300 border-gray-800'
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [feed, setFeed] = useState<ResearchFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30)
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)

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
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  const fetchFeed = useCallback(async () => {
    if (!workspaceId) return
    try {
      const params = new URLSearchParams({
        workspaceId,
        windowDays: String(windowDays),
        limit: '30',
      })
      if (industryFilter) params.set('industry', industryFilter)
      const res = await fetch(`/api/research-feed?${params}`)
      if (!res.ok) throw new Error(`Research feed ${res.status}`)
      const data = await res.json() as ResearchFeed
      setFeed(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, windowDays, industryFilter])

  useEffect(() => { fetchFeed() }, [fetchFeed])
  useEffect(() => {
    if (!workspaceId) return
    const t = setInterval(fetchFeed, 30_000)
    return () => clearInterval(t)
  }, [workspaceId, fetchFeed])

  const summary = feed?.summary
  const maxIndustry = useMemo(
    () => Math.max(1, ...(summary?.industries.map(i => i.count) || [1])),
    [summary?.industries],
  )
  const maxTech = useMemo(
    () => Math.max(1, ...(summary?.topTechStack.map(t => t.count) || [1])),
    [summary?.topTechStack],
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Telescope className="w-6 h-6 text-indigo-400" /> Market Intelligence
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Aggregated insights from every AI-enriched lead in your workspace.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
              {([7, 30, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`px-3 py-1 text-xs rounded ${
                    windowDays === d ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={fetchFeed}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Industry filter chip */}
        {industryFilter && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-900/30 border border-indigo-800 rounded-lg text-sm">
            <Briefcase className="w-3.5 h-3.5 text-indigo-300" />
            <span className="text-indigo-200">
              Industry: <span className="font-semibold">{industryFilter}</span>
            </span>
            <button
              onClick={() => setIndustryFilter(null)}
              className="ml-2 px-1.5 py-0.5 text-xs text-indigo-300 hover:text-white hover:bg-indigo-800/40 rounded"
            >
              Clear
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading && !feed ? (
          <div className="text-center py-20 text-gray-500 text-sm">Loading research feed…</div>
        ) : !summary ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Telescope className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">No research data yet</p>
            <p className="text-sm text-gray-600">
              Enrich some leads from <a href="/dashboard/leads" className="text-indigo-400 hover:text-indigo-300">/dashboard/leads</a> to populate the market intelligence feed.
            </p>
          </div>
        ) : summary.totalEnriched === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">No enriched leads in this window</p>
            <p className="text-sm text-gray-600 mb-4">
              Run AI enrichment on leads to see industry trends, tech-stack concentrations, and provider performance.
            </p>
            <a
              href="/dashboard/leads"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Go to Leads
            </a>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                Icon={Activity} label="Total enriched"
                value={summary.totalEnriched.toLocaleString()}
                accent="text-indigo-300"
              />
              <StatCard
                Icon={Building2} label="With company data"
                value={summary.withCompanyName.toLocaleString()}
                sub={pct(summary.withCompanyName, summary.totalEnriched) + ' coverage'}
                accent="text-emerald-300"
              />
              <StatCard
                Icon={Layers} label="With tech stack"
                value={summary.withTechStack.toLocaleString()}
                sub={pct(summary.withTechStack, summary.totalEnriched) + ' coverage'}
                accent="text-purple-300"
              />
              <StatCard
                Icon={TrendingUp} label="Industries observed"
                value={String(summary.industries.length)}
                sub={summary.industries[0]?.name || 'none'}
                accent="text-amber-300"
              />
            </div>

            {/* 2-col: Trending industries + Tech concentrations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> Trending industries
                </h2>
                {summary.industries.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">No industry data captured yet.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.industries.map(i => {
                      const w = (i.count / maxIndustry) * 100
                      const active = industryFilter === i.name
                      return (
                        <button
                          key={i.name}
                          onClick={() => setIndustryFilter(active ? null : i.name)}
                          className={`w-full text-left group ${active ? 'opacity-100' : ''}`}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={active ? 'text-indigo-200 font-medium' : 'text-gray-300 group-hover:text-white'}>
                              {i.name}
                            </span>
                            <span className="text-gray-500 tabular-nums">{i.count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-950 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${active ? 'bg-indigo-500' : 'bg-indigo-700 group-hover:bg-indigo-600'}`}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Top tech-stack tools
                </h2>
                {summary.topTechStack.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">No tech-stack data captured yet.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.topTechStack.map(t => {
                      const w = (t.count / maxTech) * 100
                      return (
                        <div key={t.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-300">{t.name}</span>
                            <span className="text-gray-500 tabular-nums">{t.count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-950 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-700" style={{ width: `${w}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* SDR Provider Leaderboard */}
            <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> SDR Provider Leaderboard
                </h2>
                <p className="text-[11px] text-gray-600">
                  Last {windowDays} days · sorted by run count
                </p>
              </div>
              {summary.providers.length === 0 ? (
                <div className="text-sm text-gray-600 italic p-5">
                  No provider runs in this window yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-950 border-b border-gray-800">
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="px-5 py-3 font-medium">Provider</th>
                      <th className="px-5 py-3 font-medium">Runs</th>
                      <th className="px-5 py-3 font-medium">Avg latency</th>
                      <th className="px-5 py-3 font-medium">P95 latency</th>
                      <th className="px-5 py-3 font-medium">Performance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {summary.providers.map(p => {
                      const healthBar = p.p95Ms < 1500
                        ? { color: 'bg-emerald-500', label: 'Healthy' }
                        : p.p95Ms < 3000
                        ? { color: 'bg-amber-500', label: 'Acceptable' }
                        : { color: 'bg-rose-500', label: 'Slow' }
                      return (
                        <tr key={p.provider} className="hover:bg-gray-950/50">
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${providerColor(p.provider)}`}>
                              {p.provider}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-300 tabular-nums">{p.runs.toLocaleString()}</td>
                          <td className="px-5 py-3 text-gray-300 tabular-nums">{p.avgMs}ms</td>
                          <td className="px-5 py-3 text-gray-300 tabular-nums">{p.p95Ms}ms</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${healthBar.color}`} />
                              <span className="text-xs text-gray-400">{healthBar.label}</span>
                              <Gauge className="w-3 h-3 text-gray-600 ml-auto" />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Recent enrichments feed */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Recent enrichments
                </h2>
                {feed && feed.items.length > 0 && (
                  <p className="text-[11px] text-gray-600">
                    {feed.items.length} most-recent items
                  </p>
                )}
              </div>
              {feed && feed.items.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-500">
                  No recent enrichments in this window or industry filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {feed?.items.map(item => <ResearchCard key={item.lead_id} item={item} />)}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({ Icon, label, value, sub, accent }: {
  Icon: typeof Activity
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
        <Icon className={`w-3.5 h-3.5 ${accent || 'text-gray-400'}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent || 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1 truncate" title={sub}>{sub}</div>}
    </div>
  )
}

function ResearchCard({ item }: { item: FeedItem }) {
  return (
    <a
      href={`/dashboard/leads?lead=${item.lead_id}`}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-white font-medium truncate">
            {item.company_name || item.contact_name || item.contact_email || 'Unknown lead'}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {item.industry || '—'}{item.company_size ? ` · ${item.company_size}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-gray-500">{formatRelative(item.enriched_at)}</span>
          <span
            className="text-[10px] text-purple-300 bg-purple-900/30 border border-purple-800 px-1.5 py-0.5 rounded"
            title="Number of providers that contributed data"
          >
            {item.source_count} src
          </span>
        </div>
      </div>

      {item.enrichment_summary && (
        <p className="text-xs text-gray-400 line-clamp-4 mb-3 flex-1">
          {item.enrichment_summary}
        </p>
      )}

      {item.tech_stack.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tech_stack.slice(0, 6).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-950 border border-gray-800 rounded text-gray-400">
              {t}
            </span>
          ))}
          {item.tech_stack.length > 6 && (
            <span className="text-[10px] text-gray-600">+{item.tech_stack.length - 6}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-800 text-[11px]">
        {item.estimated_revenue && (
          <span className="text-emerald-300">{item.estimated_revenue}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {item.linkedin_url && (
            <span title="Has LinkedIn"><Briefcase className="w-3 h-3 text-sky-400" /></span>
          )}
          {item.twitter_url && (
            <span title="Has Twitter"><Bird className="w-3 h-3 text-gray-400" /></span>
          )}
          <ExternalLink className="w-3 h-3 text-gray-600" />
        </div>
      </div>
    </a>
  )
}
