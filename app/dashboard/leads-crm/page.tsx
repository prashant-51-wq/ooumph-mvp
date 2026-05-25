'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────
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

interface SmartList {
  id: string
  label: string
  count: number
  color: string
  description: string
}

interface Activity {
  id: string
  type: string
  title: string
  description: string | null
  created_at: string
}

interface Booking {
  id: string
  title: string
  start_time: string
  status: string
}

interface ContactDetail {
  lead: Lead
  activities: Activity[]
  bookings: Booking[]
  conversations: Array<{ id: string; subject: string; channel: string; status: string }>
}

type ViewTab = 'pipeline' | 'list'
type DetailTab = 'details' | 'timeline' | 'ai'

// ── Constants ──────────────────────────────────────────────────────────────────
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
  form: '📋', organic: '🌱', referral: '🤝', booking_page: '📅', inbound_email: '✉️',
}
const ACTIVITY_ICONS: Record<string, string> = {
  lead_created: '🌱', email_sent: '📤', email_received: '📥',
  meeting_booked: '📅', meeting_completed: '✅', meeting_noshow: '👻',
  score_changed: '📊', status_changed: '🔄', tag_added: '🏷️',
  note_added: '📝', agent_action: '🤖', form_submitted: '📋',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function scoreBadge(score: number): string {
  if (score >= 80) return '🔥'
  if (score >= 50) return '🟡'
  return '🔵'
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Skeleton loaders ───────────────────────────────────────────────────────────
function SkeletonTableRows() {
  return (
    <>
      {[1, 2, 3, 4].map(i => (
        <tr key={i} className="border-b border-gray-800">
          {[28, 36, 20, 16, 16, 16, 8].map((w, j) => (
            <td key={j} className="px-4 py-3"><div className={`animate-pulse bg-gray-800 rounded h-4 w-${w}`} /></td>
          ))}
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

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const barColor = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-600'
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm leading-none">{scoreBadge(score)}</span>
      <div className="h-1.5 flex-1 rounded-full bg-gray-700">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{score}</span>
    </div>
  )
}

// ── Kanban card ────────────────────────────────────────────────────────────────
function KanbanCard({ lead, onSelect, onAdvance, isLastStage }: {
  lead: Lead; onSelect: (l: Lead) => void; onAdvance: (l: Lead) => void; isLastStage: boolean
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
            className="flex-shrink-0 w-6 h-6 rounded bg-gray-800 hover:bg-indigo-700 text-gray-500 hover:text-white flex items-center justify-center text-xs transition-colors opacity-0 group-hover:opacity-100"
          >→</button>
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs">{SOURCE_ICONS[lead.source] || '📌'}</span>
        <span className="text-gray-500 text-xs capitalize">{lead.source?.replace('_', ' ')}</span>
      </div>
      <ScoreBar score={lead.score || 0} />
      <p className="text-gray-600 text-xs mt-2">{new Date(lead.created_at).toLocaleDateString()}</p>
    </div>
  )
}

// ── Activity item ──────────────────────────────────────────────────────────────
function ActivityItem({ activity }: { activity: Activity }) {
  return (
    <div className="flex gap-3 py-3 border-b border-gray-800/60 last:border-0">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs">
        {ACTIVITY_ICONS[activity.type] || '•'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-300 text-xs font-medium">{activity.title}</p>
        {activity.description && (
          <p className="text-gray-600 text-xs mt-0.5 line-clamp-2">{activity.description}</p>
        )}
        <p className="text-gray-700 text-xs mt-1">{timeAgo(activity.created_at)}</p>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LeadsCRMPage() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState('')
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

  // v2 state
  const [smartLists, setSmartLists] = useState<SmartList[]>([])
  const [activeList, setActiveList] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')

  // Load workspace id
  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const ws = raw ? (JSON.parse(raw) as { id?: string }) : null
    const id = ws?.id || localStorage.getItem('workspaceId') || ''
    setWorkspaceId(id)
    if (!id) router.push('/dashboard/onboarding')
  }, [router])

  // Load smart lists
  const loadSmartLists = useCallback(async () => {
    if (!workspaceId) return
    const res = await fetch(`/api/leads-captured/smart-lists?workspaceId=${workspaceId}`)
    if (res.ok) setSmartLists(await res.json() as SmartList[])
  }, [workspaceId])

  useEffect(() => { void loadSmartLists() }, [loadSmartLists])

  // Load leads (normal or from smart list)
  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    let res: Response
    if (activeList) {
      res = await fetch(`/api/leads-captured/smart-lists?workspaceId=${workspaceId}&list=${activeList}`)
    } else {
      const statusParam = viewTab === 'pipeline' ? 'all' : filter
      res = await fetch(`/api/leads-captured?workspaceId=${workspaceId}&status=${statusParam}`)
    }
    const data = await res.json()
    setLeads(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [workspaceId, filter, viewTab, activeList])

  useEffect(() => { void load() }, [load])

  // Load contact detail when selected
  useEffect(() => {
    if (!selected) { setContactDetail(null); return }
    setDetailLoading(true)
    setAgentResult(null)
    setNoteText('')
    setEditNotes(selected.notes || '')
    setEditStatus(selected.status)
    setEditScore(selected.score || 0)
    void (async () => {
      const res = await fetch(`/api/leads-captured/${selected.id}`)
      if (res.ok) setContactDetail(await res.json() as ContactDetail)
      setDetailLoading(false)
    })()
  }, [selected])

  // ── Actions ───────────────────────────────────────────────────────────────────
  const addLead = async () => {
    setSaving(true)
    const res = await fetch('/api/leads-captured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...addForm }),
    })
    if (res.ok) {
      // Log activity
      const data = await res.json() as { id?: string }
      if (data.id) {
        await fetch(`/api/leads-captured/${data.id}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, type: 'lead_created', title: `Lead created manually`, description: addForm.notes || null }),
        })
      }
    }
    setSaving(false)
    setShowAdd(false)
    setAddForm({ name: '', email: '', phone: '', source: 'manual', campaign: '', notes: '' })
    void load(); void loadSmartLists()
  }

  const updateLead = async () => {
    if (!selected) return
    setSaving(true)
    const oldStatus = selected.status
    const oldScore = selected.score
    await fetch('/api/leads-captured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, status: editStatus, notes: editNotes, score: editScore }),
    })
    // Log changes
    if (editStatus !== oldStatus) {
      await fetch(`/api/leads-captured/${selected.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'status_changed', title: `Status: ${oldStatus} → ${editStatus}` }),
      })
    }
    if (editScore !== oldScore) {
      await fetch(`/api/leads-captured/${selected.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'score_changed', title: `Score: ${oldScore} → ${editScore}` }),
      })
    }
    setSaving(false)
    setSelected(null)
    void load(); void loadSmartLists()
  }

  const deleteLead = async (id: string) => {
    await fetch(`/api/leads-captured?id=${id}`, { method: 'DELETE' })
    setSelected(null)
    void load(); void loadSmartLists()
  }

  const advanceLead = async (lead: Lead) => {
    const idx = STAGE_ORDER.indexOf(lead.status)
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return
    const nextStatus = STAGE_ORDER[idx + 1]
    await fetch('/api/leads-captured', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, status: nextStatus, notes: lead.notes, score: lead.score }),
    })
    await fetch(`/api/leads-captured/${lead.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, type: 'status_changed', title: `Status: ${lead.status} → ${nextStatus}` }),
    })
    void load(); void loadSmartLists()
  }

  const addNote = async () => {
    if (!selected || !noteText.trim()) return
    await fetch(`/api/leads-captured/${selected.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, type: 'note_added', title: 'Note added', description: noteText }),
    })
    setNoteText('')
    // Reload detail
    const res = await fetch(`/api/leads-captured/${selected.id}`)
    if (res.ok) setContactDetail(await res.json() as ContactDetail)
  }

  const runCRMAgent = async (mode: 'suggest_action' | 'analyze_contact' | 'write_outreach') => {
    if (!selected || !workspaceId) return
    setAgentLoading(true)
    setAgentResult(null)
    const res = await fetch('/api/agents/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode, leadId: selected.id, context: aiInstruction }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.action) {
      const a = data.action as { nextAction?: string; message?: { subject?: string; body?: string }; reasoning?: string; urgency?: string }
      setAgentResult(`🎯 ${a.nextAction || ''}\n\n${a.message ? `Subject: ${a.message.subject || ''}\n\n${a.message.body || ''}` : ''}\n\n💡 ${a.reasoning || ''}`)
    } else if (data.analysis) {
      const an = data.analysis as { summary?: string; buyingSignals?: string[]; recommendedApproach?: string; estimatedCloseTime?: string }
      setAgentResult(`${an.summary || ''}\n\n🟢 Signals: ${(an.buyingSignals || []).join(', ')}\n\n→ ${an.recommendedApproach || ''}\n\n⏱ ${an.estimatedCloseTime || ''}`)
    } else if (data.outreach) {
      const o = data.outreach as { subject?: string; body?: string }
      setAgentResult(`Subject: ${o.subject || ''}\n\n${o.body || ''}`)
    }
    // Reload contact detail to show new activity
    const dr = await fetch(`/api/leads-captured/${selected.id}`)
    if (dr.ok) setContactDetail(await dr.json() as ContactDetail)
    setAgentLoading(false)
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">👥 CRM</h1>
          <p className="text-gray-400 text-sm mt-1">Leads, activity timelines, and smart segments</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          + Add Lead
        </button>
      </div>

      {/* ── Smart Lists bar ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Smart Lists</span>
          {activeList && (
            <button onClick={() => setActiveList(null)} className="text-xs text-indigo-400 hover:text-indigo-300">
              × Clear filter
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {smartLists.map(sl => (
            <button
              key={sl.id}
              onClick={() => setActiveList(activeList === sl.id ? null : sl.id)}
              title={sl.description}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeList === sl.id
                  ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              {sl.label}
              {sl.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 text-xs">{sl.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row (hide when smart list active) */}
      {!activeList && (
        <div className="grid grid-cols-6 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-3">
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
      )}

      {/* View tabs */}
      <div className="flex border-b border-gray-800 mb-5">
        {([{ id: 'pipeline' as ViewTab, label: '🗂 Pipeline' }, { id: 'list' as ViewTab, label: '☰ List' }]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              viewTab === tab.id ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {activeList && (
          <span className="ml-4 self-center text-xs text-indigo-400 font-semibold">
            {smartLists.find(s => s.id === activeList)?.label} — {leads.length} leads
          </span>
        )}
      </div>

      {/* ── PIPELINE VIEW ──────────────────────────────────────────────────── */}
      {viewTab === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage.key)
            return (
              <div key={stage.key} className={`flex-shrink-0 w-60 rounded-xl border ${stage.border} overflow-hidden flex flex-col`} style={{ minWidth: '220px' }}>
                <div className={`${stage.headerBg} px-3 py-2.5 border-b ${stage.border} flex items-center justify-between`}>
                  <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-gray-900/60 ${stage.color}`}>{stageLeads.length}</span>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto bg-gray-950/50">
                  {loading ? <SkeletonKanbanCards /> : stageLeads.length === 0 ? (
                    <div className="text-center py-8 text-gray-700 text-xs">No leads</div>
                  ) : stageLeads.map(lead => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      onSelect={setSelected}
                      onAdvance={advanceLead}
                      isLastStage={stage.key === 'lost'}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {viewTab === 'list' && (
        <>
          {!activeList && (
            <div className="flex gap-2 mb-5">
              {['all', 'new', 'contacted', 'qualified', 'converted', 'lost'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
          )}
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
                {loading ? <SkeletonTableRows /> : leads.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="text-white font-medium">No leads</p>
                    <p className="text-gray-500 text-sm mt-1">Add leads or capture them via landing pages and forms</p>
                    <button onClick={() => setShowAdd(true)} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Add First Lead</button>
                  </td></tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => setSelected(lead)}>
                    <td className="px-4 py-3 text-white text-sm font-medium">{lead.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{lead.email || '—'}</td>
                    <td className="px-4 py-3 text-sm"><span className="text-gray-400">{SOURCE_ICONS[lead.source] || '📌'} {lead.source}</span></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}>{lead.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{scoreBadge(lead.score)}</span>
                        <div className="h-1.5 w-16 rounded-full bg-gray-700">
                          <div className={`h-1.5 rounded-full ${lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-gray-600'}`} style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); void deleteLead(lead.id) }} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Lead Detail Panel (v2) ─────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50" onClick={() => setSelected(null)}>
          <div className="w-[420px] h-full bg-gray-900 border-l border-gray-800 flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div>
                <p className="text-white font-semibold">{selected.name || 'No name'}</p>
                <p className="text-gray-400 text-xs mt-0.5">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800 flex-shrink-0">
              {(['details', 'timeline', 'ai'] as DetailTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px ${
                    detailTab === t ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t === 'details' ? '📋 Details' : t === 'timeline' ? '📅 Timeline' : '🤖 AI Agent'}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* ── Details tab ──────────────────────────────────────────── */}
              {detailTab === 'details' && (
                <div className="space-y-4">
                  {/* Contact card */}
                  <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                      {(selected.name || selected.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">{selected.name || '—'}</p>
                      <p className="text-gray-400 text-xs">{selected.email}</p>
                      {selected.phone && <p className="text-gray-500 text-xs">{selected.phone}</p>}
                    </div>
                  </div>

                  {/* Related data */}
                  {contactDetail && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-500 mb-1">Meetings</p>
                        <p className="text-white font-bold">{contactDetail.bookings.length}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-500 mb-1">Conversations</p>
                        <p className="text-white font-bold">{contactDetail.conversations.length}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-500 mb-1">Activities</p>
                        <p className="text-white font-bold">{contactDetail.activities.length}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-500 mb-1">Source</p>
                        <p className="text-white font-bold">{SOURCE_ICONS[selected.source] || '📌'} {selected.source}</p>
                      </div>
                    </div>
                  )}

                  {/* Edit form */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className={inputCls}>
                      {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Score (0–100)</label>
                    <input type="number" min={0} max={100} value={editScore} onChange={e => setEditScore(Number(e.target.value))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="Notes..." />
                  </div>

                  <div className="text-xs text-gray-600 space-y-1 pt-1">
                    {selected.campaign && <p>Campaign: {selected.campaign}</p>}
                    <p>Added: {new Date(selected.created_at).toLocaleString()}</p>
                  </div>

                  <button onClick={() => void updateLead()} disabled={saving}
                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => void deleteLead(selected.id)}
                    className="w-full py-2 rounded-lg border border-red-900 hover:bg-red-950 text-red-400 text-sm transition-colors">
                    Delete Lead
                  </button>
                </div>
              )}

              {/* ── Timeline tab ─────────────────────────────────────────── */}
              {detailTab === 'timeline' && (
                <div>
                  {/* Add note */}
                  <div className="mb-4">
                    <div className="flex gap-2">
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note or observation..."
                        className={inputCls}
                        onKeyDown={e => { if (e.key === 'Enter') void addNote() }}
                      />
                      <button onClick={() => void addNote()} disabled={!noteText.trim()} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm transition-colors">+</button>
                    </div>
                  </div>

                  {/* Bookings */}
                  {contactDetail?.bookings && contactDetail.bookings.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Meetings</p>
                      {contactDetail.bookings.map(b => (
                        <div key={b.id} className="flex items-center gap-2 py-2 border-b border-gray-800 text-xs">
                          <span>📅</span>
                          <span className="text-gray-300">{b.title}</span>
                          <span className="ml-auto text-gray-600">{new Date(b.start_time).toLocaleDateString()}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${b.status === 'confirmed' ? 'bg-blue-900 text-blue-300' : b.status === 'completed' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}>{b.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activity timeline */}
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Activity</p>
                  {detailLoading ? (
                    <div className="space-y-3">
                      {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
                    </div>
                  ) : contactDetail?.activities && contactDetail.activities.length > 0 ? (
                    contactDetail.activities.map(a => <ActivityItem key={a.id} activity={a} />)
                  ) : (
                    <div className="text-center py-8 text-gray-600 text-xs">
                      <div className="text-2xl mb-2">📭</div>
                      No activity recorded yet
                    </div>
                  )}
                </div>
              )}

              {/* ── AI Agent tab ─────────────────────────────────────────── */}
              {detailTab === 'ai' && (
                <div className="space-y-4">
                  <input
                    value={aiInstruction}
                    onChange={e => setAiInstruction(e.target.value)}
                    placeholder="Optional: extra context or instruction..."
                    className={inputCls}
                  />

                  <div className="space-y-2">
                    <button onClick={() => void runCRMAgent('suggest_action')} disabled={agentLoading}
                      className="w-full py-2.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition-colors text-left px-4">
                      🎯 Suggest Next Action
                    </button>
                    <button onClick={() => void runCRMAgent('analyze_contact')} disabled={agentLoading}
                      className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm transition-colors text-left px-4">
                      🔍 Deep Contact Analysis
                    </button>
                    <button onClick={() => void runCRMAgent('write_outreach')} disabled={agentLoading}
                      className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm transition-colors text-left px-4">
                      ✉️ Write Personalised Outreach
                    </button>
                  </div>

                  {agentLoading && (
                    <div className="flex items-center gap-2 text-indigo-400 text-sm">
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      Agent thinking...
                    </div>
                  )}

                  {agentResult && (
                    <div className="bg-gray-800 rounded-xl p-4 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                      {agentResult}
                    </div>
                  )}

                  {/* Quick links */}
                  <div className="pt-2 border-t border-gray-800 space-y-2">
                    <a href="/dashboard/inbox" className="block w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm text-center transition-colors">📬 View in Inbox</a>
                    <a href="/dashboard/calendar" className="block w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm text-center transition-colors">📅 View Bookings</a>
                  </div>
                </div>
              )}
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
                { label: 'Campaign', key: 'campaign', placeholder: 'Which campaign?' },
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
                  rows={2} placeholder="Initial notes..." className={inputCls + ' resize-none'} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white">Cancel</button>
              <button onClick={() => void addLead()} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? 'Adding...' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
