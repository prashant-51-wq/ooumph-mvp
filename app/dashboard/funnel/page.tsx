'use client'

/**
 * /dashboard/funnel
 *
 * Live analytics overview for every funnel landing page in the workspace.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Stat cards: Total views · Conversions · Avg CR · Top funnel │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Funnels table — sortable by views / conv / CR              │
 *   │  Each row: slug · views · conversions · CR bar · open       │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Recent submissions feed (last 20 form_submissions rows)    │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Polls /api/funnel-steps every 12s. Click "Open builder →" to edit a
 * page; click "View live ↗" to open /api/f/[slug] in a new tab.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Workflow, RefreshCw, AlertCircle, Plus, ExternalLink, Edit3,
  Eye, MousePointerClick, TrendingUp, Target, ChevronRight, Mail,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────

interface FunnelStep {
  id: string
  workspace_id: string
  slug: string
  html_content: string
  view_count: number | string
  conversion_count: number | string
  created_at: string
}

interface FormSubmission {
  id: string
  workspace_id: string
  funnel_step_id: string
  email: string
  submitted_data: string | null
  created_at: string
}

type SortKey = 'recent' | 'views' | 'conversions' | 'rate'

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
function rate(views: number, conv: number): number {
  return views > 0 ? conv / views : 0
}
function formatRate(r: number): string {
  if (!Number.isFinite(r) || r < 0) return '0.0%'
  return `${(r * 100).toFixed(1)}%`
}
function parseSubmittedData(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FunnelOverviewPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [funnels, setFunnels] = useState<FunnelStep[]>([])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('recent')

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

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      // Fetch funnels (always); submissions endpoint is workspace-scoped via
      // a small helper — if not present we degrade gracefully.
      const funnelRes = await fetch(`/api/funnel-steps?workspaceId=${workspaceId}`)
      const fRows = await funnelRes.json() as FunnelStep[]
      setFunnels(Array.isArray(fRows) ? fRows : [])

      // Best-effort: per-funnel last-N submissions roll-up.
      // We don't have a workspace-wide submissions endpoint yet; instead pull
      // recent submissions via lead-activities if any exist (form_submitted).
      try {
        const actRes = await fetch(`/api/lead-activities?workspaceId=${workspaceId}&activityType=form_submitted&limit=20`)
        const acts = await actRes.json() as Array<{ id: string; lead_id: string; metadata_json: string | null; created_at: string; description: string | null }>
        if (Array.isArray(acts)) {
          // Convert activity rows into a submission-shaped feed for the bottom panel
          setSubmissions(acts.map(a => {
            const meta = (a.metadata_json && (() => { try { return JSON.parse(a.metadata_json) as Record<string, unknown> } catch { return null } })()) || {}
            const fsId = String((meta as { funnel_step_id?: string }).funnel_step_id || '')
            return {
              id: a.id,
              workspace_id: workspaceId,
              funnel_step_id: fsId,
              email: (meta as { email?: string }).email || a.description?.split('·')[0]?.trim() || '',
              submitted_data: a.metadata_json,
              created_at: a.created_at,
            }
          }).filter(s => s.email.length > 0))
        }
      } catch { /* non-fatal — submissions panel just stays empty */ }

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
    const t = setInterval(fetchAll, 12_000)
    return () => clearInterval(t)
  }, [workspaceId, fetchAll])

  const totals = useMemo(() => {
    let totalViews = 0, totalConv = 0
    for (const f of funnels) {
      totalViews += Number(f.view_count || 0)
      totalConv += Number(f.conversion_count || 0)
    }
    const avgRate = totalViews > 0 ? totalConv / totalViews : 0
    const top = [...funnels].sort((a, b) =>
      rate(Number(b.view_count || 0), Number(b.conversion_count || 0))
      - rate(Number(a.view_count || 0), Number(a.conversion_count || 0))
    )[0] || null
    return { totalViews, totalConv, avgRate, top }
  }, [funnels])

  const sortedFunnels = useMemo(() => {
    const arr = [...funnels]
    if (sortKey === 'views') {
      arr.sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0))
    } else if (sortKey === 'conversions') {
      arr.sort((a, b) => Number(b.conversion_count || 0) - Number(a.conversion_count || 0))
    } else if (sortKey === 'rate') {
      arr.sort((a, b) =>
        rate(Number(b.view_count || 0), Number(b.conversion_count || 0))
        - rate(Number(a.view_count || 0), Number(a.conversion_count || 0)),
      )
    } else {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return arr
  }, [funnels, sortKey])

  const funnelBySlug = useMemo(() => {
    const m = new Map<string, FunnelStep>()
    for (const f of funnels) m.set(f.id, f)
    return m
  }, [funnels])

  const maxBarValue = useMemo(() => {
    return Math.max(1, ...funnels.map(f => Number(f.view_count || 0)))
  }, [funnels])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Workflow className="w-6 h-6 text-indigo-400" /> Funnels Overview
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time analytics across every landing page in your workspace.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link
              href="/dashboard/funnel/form-builder"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New funnel
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading && funnels.length === 0 ? (
          <div className="text-center py-20 text-gray-500 text-sm">Loading funnels…</div>
        ) : funnels.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Workflow className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">No funnels yet</p>
            <p className="text-sm text-gray-600 mb-4">
              Build your first landing page with the form-builder. Templates ship pre-wired with capture forms.
            </p>
            <Link
              href="/dashboard/funnel/form-builder"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Open Funnel Builder
            </Link>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard Icon={Eye} label="Total views" value={totals.totalViews.toLocaleString()} accent="text-sky-300" />
              <StatCard Icon={MousePointerClick} label="Conversions" value={totals.totalConv.toLocaleString()} accent="text-emerald-300" />
              <StatCard
                Icon={Target} label="Avg conversion rate"
                value={formatRate(totals.avgRate)}
                accent={totals.avgRate >= 0.05 ? 'text-emerald-300' : totals.avgRate > 0 ? 'text-amber-300' : 'text-gray-400'}
              />
              <StatCard
                Icon={TrendingUp} label="Top performing"
                value={totals.top ? `/lp/${totals.top.slug}` : '—'}
                sub={totals.top ? formatRate(rate(Number(totals.top.view_count || 0), Number(totals.top.conversion_count || 0))) + ' CR' : undefined}
                accent="text-indigo-300"
              />
            </div>

            {/* Sort tabs */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-500">
                {funnels.length} funnel{funnels.length === 1 ? '' : 's'}
              </div>
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
                {([
                  { id: 'recent' as SortKey, label: 'Recent' },
                  { id: 'views' as SortKey, label: 'By views' },
                  { id: 'conversions' as SortKey, label: 'By conv.' },
                  { id: 'rate' as SortKey, label: 'By CR' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSortKey(opt.id)}
                    className={`px-3 py-1 text-xs rounded ${sortKey === opt.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Funnels table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead className="bg-gray-950 border-b border-gray-800">
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Views</th>
                    <th className="px-4 py-3 font-medium">Conversions</th>
                    <th className="px-4 py-3 font-medium">Conversion rate</th>
                    <th className="px-4 py-3 font-medium">Volume</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {sortedFunnels.map(f => {
                    const v = Number(f.view_count || 0)
                    const c = Number(f.conversion_count || 0)
                    const cr = rate(v, c)
                    const barW = (v / maxBarValue) * 100
                    return (
                      <tr key={f.id} className="hover:bg-gray-950/50">
                        <td className="px-4 py-3">
                          <a
                            href={`/api/f/${f.slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-emerald-300 hover:text-emerald-200 font-mono text-sm inline-flex items-center gap-1"
                          >
                            /lp/{f.slug}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{v.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{c.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={cr >= 0.05 ? 'text-emerald-300' : cr > 0 ? 'text-amber-300' : 'text-gray-500'}>
                            {formatRate(cr)}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-32">
                          <div className="h-1.5 bg-gray-950 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600"
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(f.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href="/dashboard/funnel/form-builder"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded"
                          >
                            <Edit3 className="w-3 h-3" /> Builder
                          </Link>
                          <a
                            href={`/api/f/${f.slug}`} target="_blank" rel="noopener noreferrer"
                            className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-900/30 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-200 rounded"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Recent submissions */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Recent submissions
                </h2>
                <p className="text-[11px] text-gray-600">Last 20 form fills (across all funnels)</p>
              </div>
              {submissions.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-500">
                  No submissions yet. They'll stream in here as visitors fill your funnel forms.
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-950 border-b border-gray-800">
                      <tr className="text-left text-xs uppercase text-gray-500">
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Funnel</th>
                        <th className="px-4 py-3 font-medium">Submitted</th>
                        <th className="px-4 py-3 font-medium">Captured fields</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {submissions.map(s => {
                        const funnel = funnelBySlug.get(s.funnel_step_id)
                        const data = parseSubmittedData(s.submitted_data)
                        const otherFields = Object.entries(data).filter(([k]) =>
                          !['email', 'slug', 'funnel_step_id', 'submitted_data'].includes(k),
                        )
                        return (
                          <tr key={s.id} className="hover:bg-gray-950/50">
                            <td className="px-4 py-3 text-gray-200 font-mono text-xs">{s.email}</td>
                            <td className="px-4 py-3">
                              {funnel ? (
                                <a
                                  href={`/api/f/${funnel.slug}`} target="_blank" rel="noopener noreferrer"
                                  className="text-emerald-300 hover:text-emerald-200 text-xs inline-flex items-center gap-1"
                                >
                                  /lp/{funnel.slug}
                                  <ChevronRight className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-gray-600 text-xs italic">unknown</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(s.created_at)}</td>
                            <td className="px-4 py-3">
                              {otherFields.length === 0 ? (
                                <span className="text-gray-600 text-xs italic">email only</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {otherFields.slice(0, 4).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="text-[10px] px-1.5 py-0.5 bg-gray-950 border border-gray-800 rounded text-gray-400"
                                      title={`${k}: ${String(v)}`}
                                    >
                                      {k}={String(v).slice(0, 16)}{String(v).length > 16 ? '…' : ''}
                                    </span>
                                  ))}
                                  {otherFields.length > 4 && (
                                    <span className="text-[10px] text-gray-600">+{otherFields.length - 4}</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────

function StatCard({ Icon, label, value, sub, accent }: {
  Icon: typeof Eye
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
      <div className={`text-2xl font-bold tabular-nums truncate ${accent || 'text-white'}`} title={value}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1 truncate" title={sub}>{sub}</div>}
    </div>
  )
}
