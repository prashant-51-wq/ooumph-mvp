'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  source: string
  campaign: string
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  score: number
  notes: string
  created_at: string
}

type ViewTab = 'pipeline' | 'list'

const PIPELINE_STAGES: { key: Lead['status']; label: string; color: string; headerBg: string; border: string }[] = [
  { key: 'new',       label: 'New',       color: 'text-blue-300',   headerBg: 'bg-blue-950/60',   border: 'border-blue-800' },
  { key: 'contacted', label: 'Contacted', color: 'text-yellow-300', headerBg: 'bg-yellow-950/60', border: 'border-yellow-800' },
  { key: 'qualified', label: 'Qualified', color: 'text-purple-300', headerBg: 'bg-purple-950/60', border: 'border-purple-800' },
  { key: 'converted', label: 'Converted', color: 'text-green-300',  headerBg: 'bg-green-950/60',  border: 'border-green-800' },
  { key: 'lost',      label: 'Lost',      color: 'text-gray-400',   headerBg: 'bg-gray-800/60',   border: 'border-gray-700' },
]

const STAGE_ORDER: Lead['status'][] = ['new', 'contacted', 'qualified', 'converted', 'lost']

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-900 text-blue-300 border-blue-800',
  contacted: 'bg-yellow-900 text-yellow-300 border-yellow-800',
  qualified: 'bg-purple-900 text-purple-300 border-purple-800',
  converted: 'bg-green-900 text-green-300 border-green-800',
  lost: 'bg-gray-800 text-gray-400 border-gray-700',
}

const SOURCE_ICONS: Record<string, string> = {
  manual: '✋', landing_page: '🏠', campaign: '📣',
  form: '📋', organic: '🌱', referral: '🤝',
}

// ─── Skeleton components ──────────────────────────────────────────────────────

function SkeletonTableRows() {
  return (
    <>
      {[1, 2, 3, 4].map(i => (
        <tr key={i} className="border-b border-gray-800">
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-4 w-28" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-4 w-36" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-4 w-20" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-4 w-16" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-3 w-16" /></td>
          <td className="px-4 py-3"><div className="animate-pulse bg-gray-800 rounded h-4 w-16" /></td>
          <td className="px-4 py-3" />
        </tr>
      ))}
    </>
  )
}

function SkeletonKanbanCards() {
  return (
    <div className="space-y-2">
      {[1, 2].map(i => (
        <div key={i} className="bg-gray-800 rounded-lg p-3 animate-pulse space-y-2">
          <div className="h-4 bg-gray-700 rounded w-3/4" />
          <div className="h-3 bg-gray-700 rounded w-1/2" />
          <div className="h-2 bg-gray-700 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Lead score bar ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const barColor = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-600'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-700">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{score}</span>
    </div>
  )
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({ lead, onSelect, onAdvance, isLastStage }: {
  lead: Lead
  onSelect: (lead: Lead) => void
  onAdvance: (lead: Lead) => void
  isLastStage: boolean
}) {
  return (
    <div
      className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg p-3 cursor-pointer transition-all group"
      onClick={() => onSelect(lead)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{lead.name || 'No name'}</p>
          <p className="text-gray-500 text-xs truncate">{lead.email || '—'}</p>
        </div>
        {!isLastStage && (
          <button
            onClick={e => { e.stopPropagation(); onAdvance(lead) }}
            title="Move to next stage"
            className="flex-shrink-0 w-6 h-6 rounded bg-gray-800 hover:bg-indigo-700 text-gray-500 hover:text-white flex items-center justify-center text-xs transition-colors opacity-0 group-hover:opacity-100"
          >
            →
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs">{SOURCE_ICONS[lead.source] || '📌'}</span>
        <span className="text-gray-500 text-xs capitalize">{lead.source.replace('_', ' ')}</span>
      </div>

      <ScoreBar score={lead.score || 0} />

      <p className="text-gray-600 text-xs mt-2">
        {new Date(lead.created_at).toLocaleDateString()}
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadsCRMPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [viewTab, setViewTab] = useState<ViewTab>('pipeline')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editScore, setEditScore] = useState(0)

  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', source: 'manual', campaign: '', notes: '' })

  // Always fetch all leads for kanban; list view uses filter param separately
  const load = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setLoading(true)
    const statusParam = viewTab === 'pipeline' ? 'all' : filter
    const res = await fetch(`/api/leads-captured?workspaceId=${wid}&status=${statusParam}`)
    const data = await res.json()
    setLeads(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [router, filter, viewTab])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selected) {
      setEditNotes(selected.notes || '')
      setEditStatus(selected.status)
      setEditScore(selected.score || 0)
    }
  }, [selected])

  const addLead = async () => {
    const wid = localStorage.getItem('workspaceId')
    setSaving(true)
    await fetch('/api/leads-captured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: wid, ...addForm }),
    })
    setSaving(false)
    setShowAdd(false)
    setAddForm({ name: '', email: '', phone: '', source: 'manual', campaign: '', notes: '' })
    load()
  }

  const updateLead = async () => {
    if (!selected) return
    setSaving(true)
    await fetch('/api/leads-captured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, status: editStatus, notes: editNotes, score: editScore }),
    })
    setSaving(false)
    setSelected(null)
    load()
  }

  const deleteLead = async (id: string) => {
    await fetch(`/api/leads-captured?id=${id}`, { method: 'DELETE' })
    setSelected(null)
    load()
  }

  // Advance a lead to the next stage
  const advanceLead = async (lead: Lead) => {
    const idx = STAGE_ORDER.indexOf(lead.status)
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return
    const nextStatus = STAGE_ORDER[idx + 1]
    await fetch('/api/leads-captured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, status: nextStatus, notes: lead.notes, score: lead.score }),
    })
    load()
  }

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">👥 Leads CRM</h1>
          <p className="text-gray-400 text-sm mt-1">All captured leads from campaigns, forms, and landing pages</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          + Add Lead
        </button>
      </div>

      {/* Pipeline Value Stats */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 col-span-1">
          <p className="text-gray-500 text-xs">Total</p>
          <p className="text-white text-xl font-bold mt-0.5">{stats.total}</p>
        </div>
        {PIPELINE_STAGES.map(stage => (
          <div key={stage.key} className={`bg-gray-900 border ${stage.border} rounded-xl p-3`}>
            <p className={`text-xs ${stage.color}`}>{stage.label}</p>
            <p className="text-white text-xl font-bold mt-0.5">{stats[stage.key]}</p>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-gray-800 mb-5">
        {([
          { id: 'pipeline' as ViewTab, label: '🗂 Pipeline', icon: '' },
          { id: 'list' as ViewTab, label: '☰ List', icon: '' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              viewTab === tab.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PIPELINE / KANBAN VIEW ──────────────────────────────────────────── */}
      {viewTab === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage.key)
            const isLastStage = stage.key === 'lost'
            return (
              <div key={stage.key} className={`flex-shrink-0 w-60 rounded-xl border ${stage.border} overflow-hidden flex flex-col`}
                style={{ minWidth: '220px' }}>
                {/* Column header */}
                <div className={`${stage.headerBg} px-3 py-2.5 border-b ${stage.border} flex items-center justify-between`}>
                  <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-gray-900/60 ${stage.color}`}>{stageLeads.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto bg-gray-950/50">
                  {loading ? (
                    <SkeletonKanbanCards />
                  ) : stageLeads.length === 0 ? (
                    <div className="text-center py-8 text-gray-700 text-xs">No leads</div>
                  ) : (
                    stageLeads.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        onSelect={setSelected}
                        onAdvance={advanceLead}
                        isLastStage={isLastStage}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── LIST VIEW ───────────────────────────────────────────────────────── */}
      {viewTab === 'list' && (
        <>
          {/* Status filters */}
          <div className="flex gap-2 mb-5">
            {['all', 'new', 'contacted', 'qualified', 'converted', 'lost'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Email', 'Source', 'Status', 'Score', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows />
                ) : leads.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="text-white font-medium">No leads yet</p>
                    <p className="text-gray-500 text-sm mt-1">Leads from campaigns, forms, and landing pages will appear here</p>
                    <button onClick={() => setShowAdd(true)} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Add First Lead</button>
                  </td></tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelected(lead)}>
                    <td className="px-4 py-3 text-white text-sm font-medium">{lead.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{lead.email || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-gray-400">{SOURCE_ICONS[lead.source] || '📌'} {lead.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}>{lead.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-700">
                          <div className={`h-1.5 rounded-full ${lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-gray-600'}`}
                            style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); deleteLead(lead.id) }}
                        className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Lead Detail Panel ──────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50" onClick={() => setSelected(null)}>
          <div className="w-96 h-full bg-gray-900 border-l border-gray-800 p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-semibold">Lead Details</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-white font-semibold text-lg">{selected.name || 'No name'}</p>
                <p className="text-gray-400 text-sm">{selected.email}</p>
                {selected.phone && <p className="text-gray-400 text-sm">{selected.phone}</p>}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className={inputCls}>
                  {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Lead Score (0–100)</label>
                <input type="number" min={0} max={100} value={editScore} onChange={e => setEditScore(Number(e.target.value))} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4} className={inputCls + ' resize-none'} placeholder="Add notes about this lead..." />
              </div>

              <div className="text-xs text-gray-600 space-y-1">
                <p>Source: {SOURCE_ICONS[selected.source] || '📌'} {selected.source}</p>
                {selected.campaign && <p>Campaign: {selected.campaign}</p>}
                <p>Added: {new Date(selected.created_at).toLocaleString()}</p>
              </div>

              <button onClick={updateLead} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <button onClick={() => deleteLead(selected.id)}
                className="w-full py-2 rounded-lg border border-red-900 hover:bg-red-950 text-red-400 text-sm transition-colors">
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Lead Modal ─────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold mb-5">Add Lead Manually</h2>
            <div className="space-y-3">
              {[
                { label: 'Name', key: 'name', placeholder: 'Full name' },
                { label: 'Email', key: 'email', placeholder: 'email@company.com' },
                { label: 'Phone', key: 'phone', placeholder: '+91 98765 43210' },
                { label: 'Campaign', key: 'campaign', placeholder: 'Which campaign brought them?' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                  <input value={(addForm as Record<string, string>)[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} className={inputCls} />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Source</label>
                <select value={addForm.source} onChange={e => setAddForm(p => ({ ...p, source: e.target.value }))} className={inputCls}>
                  {['manual', 'landing_page', 'campaign', 'form', 'organic', 'referral'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Any initial notes..." className={inputCls + ' resize-none'} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={addLead} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {saving ? 'Adding...' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
