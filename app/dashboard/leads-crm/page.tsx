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

export default function LeadsCRMPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editScore, setEditScore] = useState(0)

  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', source: 'manual', campaign: '', notes: '' })

  const load = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setLoading(true)
    const res = await fetch(`/api/leads-captured?workspaceId=${wid}&status=${filter}`)
    const data = await res.json()
    setLeads(data)
    setLoading(false)
  }, [router, filter])

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

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    converted: leads.filter(l => l.status === 'converted').length,
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  return (
    <div className="p-8">
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Leads', value: stats.total, color: 'border-gray-700' },
          { label: 'New', value: stats.new, color: 'border-blue-800' },
          { label: 'Qualified', value: stats.qualified, color: 'border-purple-800' },
          { label: 'Converted', value: stats.converted, color: 'border-green-800' },
        ].map(s => (
          <div key={s.label} className={`bg-gray-900 border ${s.color} rounded-xl p-4`}>
            <p className="text-gray-400 text-xs">{s.label}</p>
            <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        {['all', 'new', 'contacted', 'qualified', 'converted', 'lost'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
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
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">Loading leads...</td></tr>
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

      {/* Lead Detail Panel */}
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
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
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
