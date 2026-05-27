'use client'

/**
 * /dashboard/leads
 *
 * Lead directory with live enrichment status. Three interactive surfaces:
 *
 *   1. Master directory grid — fetches /api/leads-captured, polls every 8s
 *      while any row is in 'enriching' state so status pills flip live.
 *
 *   2. Detail Drawer — slide-out for the selected lead. Renders Claude's
 *      enrichment_summary, the firmographic block (company, size, industry,
 *      revenue, links), and the tech_stack as clickable badges.
 *
 *   3. Tech-stack lookalike filter — clicking any tech badge inside the
 *      drawer instantly narrows the master grid to leads sharing that tool.
 *      A chip above the table makes the active filter dismissible.
 *
 * Transparency: when a lead's `conflicts_resolved` log shows a field was
 * overridden by a live Brave Search signal, a small "Live News Signal"
 * radar pulse appears next to that field in the drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users, Search, RefreshCw, Plus, Sparkles, Filter, X,
  Building2, Briefcase, Bird, ExternalLink, AlertCircle,
  CheckCircle2, Loader2, Clock, XCircle, Radar, Layers,
  Mail, Phone, DollarSign, Tag, ChevronRight,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  workspace_id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  campaign: string | null
  status: string
  score: number
  notes: string | null
  // Sprint-4 enrichment columns
  enrichment_status: 'pending' | 'enriching' | 'completed' | 'failed' | string | null
  company_name: string | null
  company_size: string | null
  estimated_revenue: string | null
  industry: string | null
  linkedin_url: string | null
  twitter_url: string | null
  tech_stack: string | string[] | null
  enrichment_summary: string | null
  created_at: string
}

interface ActivityRow {
  id: string
  lead_id: string
  type: string
  activity_type: string | null
  title: string
  description: string | null
  metadata_json: string | null
  created_at: string
}

interface EnrichmentMetaConflict {
  field?: string
  loser?: string
  winner?: string
  reason?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseTechStack(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw !== 'string') return []
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    // legacy CSV / loose strings
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
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

const ENRICH_PILL: Record<string, { cls: string; Icon: typeof Clock; label: string }> = {
  pending:   { cls: 'bg-gray-800 text-gray-400 border-gray-700',                   Icon: Clock,         label: 'Pending' },
  enriching: { cls: 'bg-blue-900/40 text-blue-200 border-blue-800',                Icon: Loader2,       label: 'Enriching' },
  completed: { cls: 'bg-emerald-900/40 text-emerald-200 border-emerald-800',      Icon: CheckCircle2,  label: 'Enriched' },
  failed:    { cls: 'bg-rose-900/40 text-rose-200 border-rose-800',                Icon: XCircle,       label: 'Failed' },
}
function EnrichmentPill({ status }: { status: string | null }) {
  const key = status || 'pending'
  const cfg = ENRICH_PILL[key] || ENRICH_PILL.pending
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.cls}`}>
      <Icon className={`w-3 h-3 ${key === 'enriching' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

const LEAD_STATUS_PILL: Record<string, string> = {
  new:        'bg-indigo-900/40 text-indigo-200 border-indigo-800',
  qualified:  'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  contacted:  'bg-blue-900/40 text-blue-200 border-blue-800',
  unqualified:'bg-gray-800 text-gray-400 border-gray-700',
  lost:       'bg-rose-900/40 text-rose-200 border-rose-800',
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'enriching' | 'completed' | 'failed'>('all')
  const [techFilter, setTechFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrichingId, setEnrichingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

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

  const fetchLeads = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/leads-captured?workspaceId=${workspaceId}`)
      const rows = await res.json() as Lead[]
      setLeads(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Poll faster while anything is enriching
  useEffect(() => {
    if (!workspaceId) return
    const anyEnriching = leads.some(l => l.enrichment_status === 'enriching')
    const interval = anyEnriching ? 4_000 : 30_000
    const t = setInterval(fetchLeads, interval)
    return () => clearInterval(t)
  }, [workspaceId, leads, fetchLeads])

  // Filtered grid
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter(l => {
      if (statusFilter !== 'all' && (l.enrichment_status || 'pending') !== statusFilter) return false
      if (techFilter) {
        const stack = parseTechStack(l.tech_stack).map(s => s.toLowerCase())
        if (!stack.includes(techFilter.toLowerCase())) return false
      }
      if (q) {
        const hay = [
          l.name, l.email, l.phone, l.company_name, l.industry,
          parseTechStack(l.tech_stack).join(' '),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, search, statusFilter, techFilter])

  const selected = useMemo(
    () => leads.find(l => l.id === selectedId) || null,
    [leads, selectedId],
  )

  const triggerEnrichment = async (leadId: string) => {
    if (!workspaceId) return
    setEnrichingId(leadId)
    setError(null)
    try {
      const res = await fetch('/api/agents/enrich-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, leadId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Enrichment failed')
      fetchLeads()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEnrichingId(null)
    }
  }

  const enrichmentCounts = useMemo(() => {
    const c = { all: leads.length, pending: 0, enriching: 0, completed: 0, failed: 0 }
    for (const l of leads) {
      const s = (l.enrichment_status || 'pending') as keyof typeof c
      if (s in c) c[s]++
    }
    return c
  }, [leads])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-400" /> Leads
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI enrichment uses Parallel Multi-Source Synthesis: Brave Search · Apollo · Clearbit · Hunter.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLeads}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowNew(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New lead
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, company, industry, tech…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
            {(['all', 'pending', 'enriching', 'completed', 'failed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded inline-flex items-center gap-1.5 ${
                  statusFilter === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="text-[10px] opacity-70 tabular-nums">{enrichmentCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active filters chip strip */}
        {techFilter && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-800 rounded-lg text-sm">
            <Layers className="w-3.5 h-3.5 text-purple-300" />
            <span className="text-purple-200">
              Showing leads using <span className="font-mono font-semibold">{techFilter}</span>
            </span>
            <button
              onClick={() => setTechFilter(null)}
              className="ml-2 p-0.5 text-purple-300 hover:text-white hover:bg-purple-800/40 rounded"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filtered.length} of {leads.length} leads
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {leads.length === 0
                ? 'Capture leads via funnel forms, AI outreach campaigns, or manual entry.'
                : 'Clear filters or adjust your search to see more.'}
            </p>
            {leads.length === 0 && (
              <button
                onClick={() => setShowNew(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add first lead
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Enrichment</th>
                  <th className="px-4 py-3 font-medium">Captured</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(l => {
                  const enrichStatus = l.enrichment_status || 'pending'
                  const canEnrich = enrichStatus === 'pending' || enrichStatus === 'failed'
                  const isEnriching = enrichingId === l.id || enrichStatus === 'enriching'
                  const techStack = parseTechStack(l.tech_stack)
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedId(l.id)}
                      className={`cursor-pointer transition-colors ${selectedId === l.id ? 'bg-indigo-900/15' : 'hover:bg-gray-950/50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{l.name || '—'}</div>
                        <div className="text-xs text-gray-500">{l.email || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {l.company_name || (
                          <span className="text-gray-600 italic text-xs">
                            {enrichStatus === 'completed' ? 'unknown' : 'pending enrichment'}
                          </span>
                        )}
                        {techStack.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {techStack.slice(0, 3).map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-950 border border-gray-800 rounded text-gray-400">
                                {t}
                              </span>
                            ))}
                            {techStack.length > 3 && (
                              <span className="text-[10px] text-gray-600">+{techStack.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{l.industry || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{l.company_size || '—'}</td>
                      <td className="px-4 py-3"><EnrichmentPill status={enrichStatus} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(l.created_at)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {canEnrich && (
                          <button
                            onClick={() => triggerEnrichment(l.id)}
                            disabled={isEnriching}
                            className="px-3 py-1 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
                            title="Run Parallel Multi-Source Synthesis"
                          >
                            {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {isEnriching ? 'Working…' : 'Enrich'}
                          </button>
                        )}
                        {enrichStatus === 'completed' && (
                          <button
                            onClick={() => setSelectedId(l.id)}
                            className="px-3 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1.5"
                          >
                            <ChevronRight className="w-3 h-3" /> Open
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

      {/* Detail drawer */}
      {selected && workspaceId && (
        <LeadDrawer
          lead={selected}
          workspaceId={workspaceId}
          onClose={() => setSelectedId(null)}
          onApplyTechFilter={(tool) => { setTechFilter(tool); setSelectedId(null) }}
          onTriggerEnrich={() => triggerEnrichment(selected.id)}
          isEnriching={enrichingId === selected.id || selected.enrichment_status === 'enriching'}
        />
      )}

      {/* New lead modal */}
      {showNew && workspaceId && (
        <NewLeadModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); fetchLeads() }}
        />
      )}
    </div>
  )
}

// ─── Lead Detail Drawer ────────────────────────────────────────────────────

function LeadDrawer({
  lead, workspaceId, onClose, onApplyTechFilter, onTriggerEnrich, isEnriching,
}: {
  lead: Lead
  workspaceId: string
  onClose: () => void
  onApplyTechFilter: (tool: string) => void
  onTriggerEnrich: () => void
  isEnriching: boolean
}) {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loadingActivities, setLoadingActivities] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingActivities(true)
    fetch(`/api/lead-activities?workspaceId=${workspaceId}&leadId=${lead.id}&limit=50`)
      .then(r => r.json())
      .then((rows: ActivityRow[]) => { if (!cancelled) setActivities(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setActivities([]) })
      .finally(() => { if (!cancelled) setLoadingActivities(false) })
    return () => { cancelled = true }
  }, [workspaceId, lead.id])

  // Pull conflicts_resolved out of the most recent enrichment activity so we
  // can render the "Live News Signal" pulse on the right fields.
  const liveSignalFields = useMemo<Set<string>>(() => {
    const result = new Set<string>()
    const enrichActivity = activities.find(a =>
      (a.activity_type === 'agent_enrichment' || a.type === 'agent_enrichment'),
    )
    if (!enrichActivity) return result
    const meta = parseMeta(enrichActivity.metadata_json)
    const conflicts = meta?.conflicts_resolved
    if (!Array.isArray(conflicts)) return result
    for (const raw of conflicts) {
      if (typeof raw === 'string') {
        // Best-effort: pattern match "newer signal for X" / "X overridden"
        const m = raw.toLowerCase().match(/(company_name|company_size|industry|estimated_revenue|linkedin_url|twitter_url|tech_stack)/)
        if (m) result.add(m[1])
        // Also accept "newer signal" / "live signal" / "brave search" as a hint
        if (/brave|live signal|news signal/i.test(raw)) {
          // mark any field name found in the string
          for (const k of ['company_name','company_size','industry','estimated_revenue','linkedin_url','twitter_url','tech_stack']) {
            if (raw.toLowerCase().includes(k.replace('_', ' ')) || raw.toLowerCase().includes(k)) result.add(k)
          }
        }
      } else if (raw && typeof raw === 'object') {
        const c = raw as EnrichmentMetaConflict
        if (c.field) result.add(String(c.field))
      }
    }
    return result
  }, [activities])

  const techStack = parseTechStack(lead.tech_stack)

  // Pull provider performance from the most recent enrichment for the audit row.
  const providers = useMemo(() => {
    const enrichActivity = activities.find(a =>
      (a.activity_type === 'agent_enrichment' || a.type === 'agent_enrichment'),
    )
    if (!enrichActivity) return [] as Array<{ provider: string; ok: boolean; durationMs: number }>
    const meta = parseMeta(enrichActivity.metadata_json)
    const arr = meta?.providers
    if (!Array.isArray(arr)) return []
    return arr.map(p => {
      const o = (p && typeof p === 'object') ? p as Record<string, unknown> : {}
      return {
        provider: String(o.provider || 'unknown'),
        ok: !!o.ok,
        durationMs: Number(o.durationMs || 0),
      }
    })
  }, [activities])

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-out drawer */}
      <aside className="absolute top-0 right-0 h-full w-full max-w-2xl bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{lead.name || lead.email || 'Unnamed lead'}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <EnrichmentPill status={lead.enrichment_status} />
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${LEAD_STATUS_PILL[lead.status] || LEAD_STATUS_PILL.new}`}>
                {lead.status}
              </span>
              {lead.source && (
                <span className="text-[11px] text-gray-500">via {lead.source}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Enrichment summary */}
          {lead.enrichment_status === 'completed' && lead.enrichment_summary ? (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> AI Enrichment Summary
              </h3>
              <div className="bg-purple-950/20 border border-purple-900/50 rounded-lg p-4">
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {lead.enrichment_summary}
                </p>
                {providers.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-900/40 flex flex-wrap gap-1.5">
                    {providers.map(p => (
                      <span
                        key={p.provider}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          p.ok
                            ? 'bg-emerald-900/30 text-emerald-300 border-emerald-800'
                            : 'bg-gray-900 text-gray-500 border-gray-800'
                        }`}
                        title={`${p.provider}: ${p.ok ? 'success' : 'failed'} (${p.durationMs}ms)`}
                      >
                        {p.provider} · {p.durationMs}ms
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : lead.enrichment_status === 'failed' ? (
            <section>
              <div className="bg-rose-950/30 border border-rose-900 rounded-lg p-4">
                <h3 className="text-sm text-rose-200 font-medium mb-1 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" /> Enrichment failed
                </h3>
                {lead.enrichment_summary && (
                  <p className="text-xs text-rose-300/80 mb-3">{lead.enrichment_summary}</p>
                )}
                <button
                  onClick={onTriggerEnrich}
                  disabled={isEnriching}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded inline-flex items-center gap-1.5"
                >
                  {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isEnriching ? 'Working…' : 'Retry enrichment'}
                </button>
              </div>
            </section>
          ) : lead.enrichment_status === 'pending' ? (
            <section>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                <Sparkles className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                <p className="text-sm text-gray-300 mb-3">
                  Run Parallel Multi-Source Synthesis to enrich this lead with firmographic and tech-stack data.
                </p>
                <button
                  onClick={onTriggerEnrich}
                  disabled={isEnriching}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded inline-flex items-center gap-2"
                >
                  {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isEnriching ? 'Synthesising…' : 'Enrich now'}
                </button>
                <p className="text-[11px] text-gray-600 mt-2">
                  Brave Search · Apollo · Clearbit · Hunter — fired in parallel
                </p>
              </div>
            </section>
          ) : (
            <section>
              <div className="bg-blue-950/30 border border-blue-900 rounded-lg p-4 text-center">
                <Loader2 className="w-6 h-6 mx-auto mb-2 text-blue-300 animate-spin" />
                <p className="text-sm text-blue-200">Synthesising sources…</p>
                <p className="text-[11px] text-blue-300/70 mt-1">
                  Status will update automatically when complete (~10-20s).
                </p>
              </div>
            </section>
          )}

          {/* Firmographic block */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
              Firmographics
            </h3>
            <dl className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              <FieldRow
                Icon={Building2} label="Company"
                value={lead.company_name}
                liveSignal={liveSignalFields.has('company_name')}
              />
              <FieldRow
                Icon={Briefcase} label="Industry"
                value={lead.industry}
                liveSignal={liveSignalFields.has('industry')}
              />
              <FieldRow
                Icon={Users} label="Company size"
                value={lead.company_size}
                liveSignal={liveSignalFields.has('company_size')}
              />
              <FieldRow
                Icon={DollarSign} label="Est. revenue"
                value={lead.estimated_revenue}
                liveSignal={liveSignalFields.has('estimated_revenue')}
              />
              <FieldRow
                Icon={Briefcase} label="LinkedIn"
                value={lead.linkedin_url}
                liveSignal={liveSignalFields.has('linkedin_url')}
                href={lead.linkedin_url || undefined}
              />
              <FieldRow
                Icon={Bird} label="Twitter / X"
                value={lead.twitter_url}
                liveSignal={liveSignalFields.has('twitter_url')}
                href={lead.twitter_url || undefined}
              />
            </dl>
          </section>

          {/* Tech stack — clickable badges */}
          {techStack.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Tech stack
                {liveSignalFields.has('tech_stack') && (
                  <LiveSignalIcon title="Updated via live news signal" />
                )}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {techStack.map(t => (
                  <button
                    key={t}
                    onClick={() => onApplyTechFilter(t)}
                    className="px-2 py-1 text-xs bg-gray-900 hover:bg-purple-900/40 border border-gray-800 hover:border-purple-700 text-gray-300 hover:text-purple-200 rounded transition-colors inline-flex items-center gap-1"
                    title={`Find all leads using ${t}`}
                  >
                    {t}
                    <Filter className="w-2.5 h-2.5 opacity-60" />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-2">
                Click any tool to filter the directory to other leads using it.
              </p>
            </section>
          )}

          {/* Contact */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
              Contact
            </h3>
            <dl className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              <FieldRow Icon={Mail} label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
              <FieldRow Icon={Phone} label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
              <FieldRow Icon={Tag} label="Source" value={lead.source} />
              <FieldRow Icon={Tag} label="Campaign" value={lead.campaign} />
            </dl>
          </section>

          {/* Activity timeline */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
              Activity timeline
            </h3>
            {loadingActivities ? (
              <div className="text-xs text-gray-500 py-3">Loading…</div>
            ) : activities.length === 0 ? (
              <div className="text-xs text-gray-600 py-3 italic">No activity logged yet.</div>
            ) : (
              <div className="space-y-2">
                {activities.map(a => (
                  <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-sm text-white font-medium">{a.title}</div>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{formatRelative(a.created_at)}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      {a.activity_type || a.type}
                    </div>
                    {a.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-3">{a.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

function FieldRow({
  Icon, label, value, href, liveSignal,
}: {
  Icon: typeof Building2
  label: string
  value: string | null
  href?: string
  liveSignal?: boolean
}) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex-1 text-right min-w-0">
        {value ? (
          href ? (
            <a
              href={href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 truncate max-w-full"
              title={value}
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="text-gray-200">{value}</span>
          )
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </div>
      {liveSignal && <LiveSignalIcon />}
    </div>
  )
}

function LiveSignalIcon({ title = 'Updated via live Brave Search signal — newer than structured snapshot' }: { title?: string }) {
  return (
    <span title={title} className="relative inline-flex items-center text-emerald-400 flex-shrink-0">
      <Radar className="w-3.5 h-3.5" />
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping opacity-75" />
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full" />
    </span>
  )
}

// ─── New Lead Modal ────────────────────────────────────────────────────────

function NewLeadModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [source, setSource] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() && !name.trim()) {
      setErr('At least one of name or email is required')
      return
    }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: name.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          phone: phone.trim() || undefined,
          source: source.trim() || 'manual',
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; id?: string }
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`)
      // If user supplied company_name, PATCH it in via a follow-up.
      // (POST endpoint doesn't currently accept it.)
      if (companyName.trim() && data.id) {
        try {
          await fetch(`/api/leads-captured/${data.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, company_name: companyName.trim() }),
          })
        } catch { /* non-fatal */ }
      }
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">New lead</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name" value={name} onChange={setName} placeholder="Jane Doe" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="jane@acme.com" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="optional" />
          <Field label="Company name" value={companyName} onChange={setCompanyName} placeholder="optional · improves enrichment quality" />
          <Field label="Source" value={source} onChange={setSource} placeholder="manual" />
          <p className="text-[11px] text-gray-600">
            Lead lands as <span className="text-gray-400">enrichment_status='pending'</span>. Run AI enrichment from the directory once saved.
          </p>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Saving…' : 'Create lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs uppercase text-gray-500 mb-1.5">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
      />
    </div>
  )
}
