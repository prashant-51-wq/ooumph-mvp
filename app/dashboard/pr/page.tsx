'use client'

/**
 * /dashboard/pr — Press-release composer + journalist outreach console.
 *
 *   ┌──────────────┬──────────────────────────┬─────────────────────────┐
 *   │  Campaigns   │  Composer / Preview      │  Journalists (filtered) │
 *   │  list        │  - title + body          │  - beat multi-select    │
 *   │  (drafts,    │  - HITL approval button  │  - search by name/outlet│
 *   │  approved,   │  - "Distribute" CTA →    │  - per-row last_contact │
 *   │  distributed)│    ReviewRequiredModal   │                         │
 *   └──────────────┴──────────────────────────┴─────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Newspaper, RefreshCw, AlertCircle, Plus, Send, Loader2,
  CheckCircle2, Search, ExternalLink, X, ShieldCheck,
  Users, Edit3, Mail, Filter,
} from 'lucide-react'
import ReviewRequiredModal from '@/components/ReviewRequiredModal'

// ─── Types ────────────────────────────────────────────────────────────────

interface PRCampaign {
  id: string
  workspace_id: string
  artifact_id: string | null
  title: string
  body_content: string
  status: 'draft' | 'pending_review' | 'approved' | 'distributing' | 'distributed' | 'failed' | 'archived' | string
  error_log: string | null
  created_at: string
  updated_at: string | null
}

interface MediaContact {
  id: string
  workspace_id: string
  journalist_name: string
  email: string | null
  outlet_name: string | null
  beat_focus: string | null
  last_contacted_at: string | null
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

const STATUS_PILL: Record<string, string> = {
  draft:          'bg-gray-800 text-gray-400 border-gray-700',
  pending_review: 'bg-amber-900/40 text-amber-200 border-amber-800',
  approved:       'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  distributing:   'bg-blue-900/40 text-blue-200 border-blue-800',
  distributed:    'bg-indigo-900/40 text-indigo-200 border-indigo-800',
  failed:         'bg-rose-900/40 text-rose-200 border-rose-800',
  archived:       'bg-gray-800 text-gray-500 border-gray-700',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_PILL[status] || STATUS_PILL.draft}`}>
      {status === 'distributing' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status.replace('_', ' ')}
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PRDeskPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<PRCampaign[]>([])
  const [contacts, setContacts] = useState<MediaContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [beatFilter, setBeatFilter] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())

  const [reviewModal, setReviewModal] = useState<{ approvalId: string; artifactId: string } | null>(null)
  const [distributing, setDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<{ ok: boolean; message: string } | null>(null)

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
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/pr-campaigns?workspaceId=${workspaceId}`),
        fetch(`/api/media-contacts?workspaceId=${workspaceId}`),
      ])
      const [c, m] = await Promise.all([
        cRes.json() as Promise<PRCampaign[]>,
        mRes.json() as Promise<MediaContact[]>,
      ])
      setCampaigns(Array.isArray(c) ? c : [])
      setContacts(Array.isArray(m) ? m : [])
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
    const anyDistributing = campaigns.some(c => c.status === 'distributing')
    const interval = anyDistributing ? 4_000 : 30_000
    const t = setInterval(fetchAll, interval)
    return () => clearInterval(t)
  }, [workspaceId, campaigns, fetchAll])

  const selected = useMemo(
    () => campaigns.find(c => c.id === selectedId) || null,
    [campaigns, selectedId],
  )
  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title)
      setEditBody(selected.body_content)
      setSaveError(null); setDistributeResult(null)
    }
  }, [selected])

  const isDirty = useMemo(() => {
    if (!selected) return false
    return editTitle !== selected.title || editBody !== selected.body_content
  }, [selected, editTitle, editBody])

  const allBeats = useMemo(() => {
    const set = new Set<string>()
    for (const c of contacts) if (c.beat_focus) set.add(c.beat_focus.trim())
    return Array.from(set).sort()
  }, [contacts])

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase()
    return contacts.filter(c => {
      if (!c.email) return false
      if (beatFilter && (c.beat_focus || '').toLowerCase() !== beatFilter.toLowerCase()) return false
      if (q) {
        const hay = [c.journalist_name, c.email, c.outlet_name, c.beat_focus].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [contacts, beatFilter, contactSearch])

  const saveEdits = async (): Promise<boolean> => {
    if (!workspaceId || !selected) return false
    setSavingEdit(true); setSaveError(null)
    try {
      const res = await fetch('/api/pr-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id, workspaceId,
          title: editTitle, bodyContent: editBody,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed')
      await fetchAll()
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      return false
    } finally { setSavingEdit(false) }
  }

  const openReview = async () => {
    if (!workspaceId || !selected) return
    if (!selected.artifact_id) {
      setSaveError('This campaign has no linked artifact. Use "Mark approved" instead.')
      return
    }
    try {
      const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
      const rows = await res.json() as Array<{ id: string; artifact_id: string; status: string }>
      const approval = rows.find(r => r.artifact_id === selected.artifact_id && r.status === 'pending')
      if (!approval) {
        setSaveError('No pending approval row found — try Distribute directly.')
        return
      }
      setReviewModal({ approvalId: approval.id, artifactId: selected.artifact_id })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  const markApproved = async () => {
    if (!workspaceId || !selected) return
    setSavingEdit(true); setSaveError(null)
    try {
      const res = await fetch('/api/pr-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, workspaceId, status: 'approved' }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Update failed')
      await fetchAll()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally { setSavingEdit(false) }
  }

  const distribute = async () => {
    if (!workspaceId || !selected) return
    if (selected.status !== 'approved') {
      setSaveError('Campaign must be in "approved" state before distribution.')
      return
    }
    if (selectedContactIds.size === 0 && !beatFilter) {
      if (!confirm(`Distribute to ALL ${filteredContacts.length} journalists with an email?`)) return
    }
    setDistributing(true); setDistributeResult(null); setSaveError(null)
    try {
      const body: { workspaceId: string; contactIds?: string[]; beatFilter?: string } = { workspaceId }
      if (selectedContactIds.size > 0) {
        body.contactIds = Array.from(selectedContactIds)
      } else if (beatFilter) {
        body.beatFilter = beatFilter
      }
      const res = await fetch(`/api/pr-campaigns/${selected.id}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok?: boolean; error?: string; recipientCount?: number; message?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Distribute failed')
      setDistributeResult({
        ok: true,
        message: data.message || `Distribution started for ${data.recipientCount || 0} journalists.`,
      })
      setSelectedContactIds(new Set())
      fetchAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDistributeResult({ ok: false, message: msg })
    } finally { setDistributing(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Newspaper className="w-6 h-6 text-indigo-400" /> PR Desk
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Compose press releases, route through HITL approval, blast to a beat-filtered journalist list.
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
              <Plus className="w-4 h-4" /> New release
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* 3-pane layout */}
        <div className="grid grid-cols-12 gap-4 min-h-[640px]">
          {/* Left: campaigns list */}
          <aside className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Press releases</p>
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 text-center text-xs text-gray-500">Loading…</div>
              ) : campaigns.length === 0 ? (
                <div className="p-6 text-center">
                  <Newspaper className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-xs text-gray-500 mb-2">No releases yet</p>
                  <button onClick={() => setShowNew(true)} className="text-xs text-indigo-400 hover:text-indigo-300">
                    Draft your first →
                  </button>
                </div>
              ) : campaigns.map(c => {
                const active = selectedId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-900 transition-colors ${
                      active ? 'bg-indigo-900/15 border-l-2 border-l-indigo-500' : 'hover:bg-gray-950/50'
                    }`}
                  >
                    <div className="text-sm text-white font-medium truncate">{c.title}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusPill status={c.status} />
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1">{formatRelative(c.updated_at || c.created_at)}</div>
                    {c.error_log && c.status === 'failed' && (
                      <div className="text-[10px] text-rose-400 mt-1 line-clamp-2" title={c.error_log}>{c.error_log}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Middle: composer */}
          <section className="col-span-5 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-center text-gray-500 text-sm p-6">
                <div>
                  <Edit3 className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  Select a press release from the left to edit, approve, and distribute.
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Newspaper className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <StatusPill status={selected.status} />
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Updated {formatRelative(selected.updated_at || selected.created_at)}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-3">
                  <div>
                    <label className="block text-xs uppercase text-gray-500 mb-1.5">Title</label>
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      disabled={selected.status === 'distributing' || selected.status === 'distributed'}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase text-gray-500 mb-1.5">Body</label>
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      disabled={selected.status === 'distributing' || selected.status === 'distributed'}
                      rows={14}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none resize-none disabled:opacity-60"
                    />
                    <p className="text-[10px] text-gray-600 mt-1">
                      Tokens: <code className="text-indigo-300">{'{first_name}'}</code>, <code className="text-indigo-300">{'{outlet_name}'}</code>, <code className="text-indigo-300">{'{beat}'}</code> are substituted per-journalist at send.
                    </p>
                  </div>

                  {saveError && (
                    <div className="p-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs">
                      <AlertCircle className="w-3 h-3 inline mr-1" />
                      {saveError}
                    </div>
                  )}
                  {distributeResult && (
                    <div className={`p-2 rounded text-xs ${distributeResult.ok ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-300' : 'bg-rose-950/40 border border-rose-900 text-rose-300'}`}>
                      {distributeResult.ok ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
                      {distributeResult.message}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-gray-950/50">
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={saveEdits}
                      disabled={!isDirty || savingEdit || selected.status === 'distributing' || selected.status === 'distributed'}
                      className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 disabled:opacity-50 text-gray-200 text-xs rounded inline-flex items-center gap-1.5"
                    >
                      {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      {savingEdit ? 'Saving…' : 'Save edits'}
                    </button>
                    {selected.artifact_id && (selected.status === 'draft' || selected.status === 'pending_review') && (
                      <button
                        onClick={openReview}
                        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-xs rounded inline-flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-3 h-3" /> Review & approve
                      </button>
                    )}
                    {!selected.artifact_id && (selected.status === 'draft' || selected.status === 'pending_review') && (
                      <button
                        onClick={markApproved}
                        disabled={savingEdit}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark approved
                      </button>
                    )}
                  </div>

                  <button
                    onClick={distribute}
                    disabled={distributing || selected.status !== 'approved' || filteredContacts.length === 0}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded inline-flex items-center gap-1.5"
                    title={selected.status !== 'approved' ? 'Approve campaign first' : filteredContacts.length === 0 ? 'No journalists in current filter' : 'Distribute to journalists'}
                  >
                    {distributing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {distributing
                      ? 'Distributing…'
                      : `Distribute → ${selectedContactIds.size || filteredContacts.length} journalists`}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Right: journalists */}
          <aside className="col-span-4 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Journalists
              </p>
              <a
                href="/dashboard/media-contacts"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
              >
                Manage <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="px-3 py-2 border-b border-gray-800 bg-gray-950/40">
              <div className="flex items-center gap-1.5 mb-2">
                <Filter className="w-3 h-3 text-gray-500" />
                <span className="text-[10px] uppercase text-gray-500 tracking-wider font-medium">Beat focus</span>
                {beatFilter && (
                  <button onClick={() => setBeatFilter(null)} className="ml-auto text-[10px] text-gray-500 hover:text-gray-300">clear</button>
                )}
              </div>
              {allBeats.length === 0 ? (
                <p className="text-[11px] text-gray-600 italic">No beats tagged. Add beat_focus on contacts to enable filtering.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allBeats.map(b => {
                    const active = beatFilter === b
                    return (
                      <button
                        key={b}
                        onClick={() => setBeatFilter(active ? null : b)}
                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                          active
                            ? 'bg-indigo-900/40 border-indigo-700 text-indigo-200'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                        }`}
                      >
                        {b}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="relative mt-2">
                <Search className="w-3 h-3 text-gray-600 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search name / outlet / email…"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">
                {filteredContacts.length} matching
                {selectedContactIds.size > 0 && (
                  <span className="ml-1 text-indigo-300">
                    · {selectedContactIds.size} hand-picked
                    <button onClick={() => setSelectedContactIds(new Set())} className="ml-1.5 underline">clear</button>
                  </span>
                )}
              </p>
            </div>

            <div className="flex-1 overflow-auto">
              {filteredContacts.length === 0 ? (
                <div className="p-6 text-center">
                  <Mail className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-xs text-gray-500 mb-2">
                    {contacts.length === 0 ? 'No journalists yet' : 'No journalists match filters'}
                  </p>
                  {contacts.length === 0 && (
                    <a href="/dashboard/media-contacts" className="text-xs text-indigo-400 hover:text-indigo-300">
                      Add contacts →
                    </a>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-900">
                  {filteredContacts.map(c => {
                    const picked = selectedContactIds.has(c.id)
                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-2 p-3 cursor-pointer transition-colors ${picked ? 'bg-indigo-900/15' : 'hover:bg-gray-950/50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={e => {
                            setSelectedContactIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(c.id); else next.delete(c.id)
                              return next
                            })
                          }}
                          className="mt-1 accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{c.journalist_name}</div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {c.outlet_name && <span>{c.outlet_name} · </span>}
                            <span className="font-mono text-[10px]">{c.email}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {c.beat_focus && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-950 border border-gray-800 rounded text-gray-400">
                                {c.beat_focus}
                              </span>
                            )}
                            {c.last_contacted_at && (
                              <span className="text-[10px] text-amber-400" title={`Last contacted: ${c.last_contacted_at}`}>
                                Last touched {formatRelative(c.last_contacted_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {showNew && workspaceId && (
        <NewReleaseModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); fetchAll(); setSelectedId(id) }}
        />
      )}

      {reviewModal && workspaceId && (
        <ReviewRequiredModal
          isOpen={true}
          approvalId={reviewModal.approvalId}
          artifactId={reviewModal.artifactId}
          workspaceId={workspaceId}
          publishDestination="pr"
          onApproved={() => {
            setReviewModal(null)
            markApproved()
          }}
          onRejected={() => setReviewModal(null)}
          onClose={() => setReviewModal(null)}
        />
      )}
    </div>
  )
}

function NewReleaseModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!title.trim() || !body.trim()) { setErr('Title and body required'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/pr-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, title: title.trim(), bodyContent: body.trim() }),
      })
      const data = await res.json() as { ok?: boolean; id?: string; error?: string }
      if (!res.ok || !data.ok || !data.id) throw new Error(data.error || 'Create failed')
      onCreated(data.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-indigo-400" /> New press release
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Acme launches AI-native CRM for SaaS scale-ups"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Body *</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              placeholder="FOR IMMEDIATE RELEASE — Acme today announced…"
              rows={12}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none resize-none"
            />
          </div>
          <p className="text-[11px] text-gray-600">
            Campaign starts as <span className="text-gray-400">draft</span>. Approve via the Review modal or Mark approved before distributing.
          </p>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Saving…' : 'Create draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
