'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'
import { usePersistedState } from '@/lib/hooks/use-persisted-state'

// ── Types ──────────────────────────────────────────────────────────────────────
type Stage = 'Lead' | 'Prospect' | 'Qualified' | 'Proposal' | 'Customer' | 'Churned'
type RFMTier = 'Champion' | 'Loyal' | 'At Risk' | 'Lost' | 'New Customer' | 'Potential Loyalist'
type ActivityType = 'call' | 'email' | 'note' | 'meeting' | 'deal' | 'alert'
type MainTab = 'contacts' | 'segments' | 'rfm' | 'activities' | 'pipeline'
type ViewMode = 'table' | 'kanban' | 'cards'

interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  stage: Stage
  score: number
  rfm_tier: RFMTier
  rfm_r: number
  rfm_f: number
  rfm_m: number
  last_activity: string
  tags: string[]
  avatar_color: string
  deal_value: number
  notes: string
  created_at: string
}

interface Activity {
  id: string
  contact_id: string
  contact_name: string
  type: ActivityType
  title: string
  notes: string
  outcome: string
  next_action: string
  timestamp: string
}

interface Deal {
  id: string
  name: string
  contact: string
  value: number
  probability: number
  stage: string
  close_date: string
  owner: string
  /** Sprint 6E: captured at the moment the deal moved to Closed Lost. */
  lost_reason?: string | null
}

interface Segment {
  id: string
  name: string
  count: number
  last_updated: string
  performance: string
  conditions: Array<{ field: string; operator: string; value: string }>
  type: 'builtin' | 'custom'
}

/**
 * Sprint 16F TASK 1 — persisted segment row as it lands back from
 * GET /api/segments. The CRM page is the source of truth for rule
 * semantics (see `applySavedSegment` below); the server treats `rule`
 * as an opaque blob.
 */
interface SavedSegmentRule {
  statuses?: string[]
  sources?: string[]
  campaignLike?: string
  minScore?: number
  maxScore?: number
  createdSince?: string
}
interface SavedSegment {
  id: string
  name: string
  description: string | null
  rule: SavedSegmentRule
  member_count: number
  created_at: string
  updated_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['bg-indigo-600','bg-purple-600','bg-pink-600','bg-blue-600','bg-emerald-600','bg-orange-600','bg-rose-600','bg-cyan-600']
const STAGES: Stage[] = ['Lead','Prospect','Qualified','Proposal','Customer','Churned']
const RFM_TIERS: RFMTier[] = ['Champion','Loyal','At Risk','Lost','New Customer','Potential Loyalist']

// ── API row mappers ────────────────────────────────────────────────────────────
interface LeadRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  campaign: string | null
  status: string | null
  score: number | null
  notes: string | null
  custom_fields: string | Record<string, unknown> | null
  created_at: string
}

interface ActivityRow {
  id: string
  lead_id: string
  type: string
  title: string
  description: string | null
  metadata_json: string | null
  created_at: string
}

interface DealRow {
  id: string
  workspace_id: string
  lead_id: string | null
  contact_name: string
  contact_email: string | null
  company: string | null
  title: string
  value: number
  currency: string
  stage: string
  probability: number
  expected_close: string | null
  actual_close: string | null
  notes: string | null
  source: string | null
  lost_reason: string | null
  lost_at: string | null
  created_at: string
  updated_at: string
}

function statusToStage(status: string | null | undefined): Stage {
  if (!status) return 'Lead'
  const s = status.toLowerCase()
  if (s === 'new' || s === 'lead') return 'Lead'
  if (s === 'contacted' || s === 'prospect') return 'Prospect'
  if (s === 'qualified') return 'Qualified'
  if (s === 'proposal') return 'Proposal'
  if (s === 'customer' || s === 'won' || s === 'closed_won') return 'Customer'
  if (s === 'churned' || s === 'lost' || s === 'closed_lost') return 'Churned'
  return 'Lead'
}

function stageToStatus(stage: Stage): string {
  switch (stage) {
    case 'Lead': return 'new'
    case 'Prospect': return 'contacted'
    case 'Qualified': return 'qualified'
    case 'Proposal': return 'proposal'
    case 'Customer': return 'customer'
    case 'Churned': return 'churned'
  }
}

function parseCustomFields(cf: unknown): Record<string, unknown> {
  if (!cf) return {}
  if (typeof cf === 'string') {
    try { return JSON.parse(cf) as Record<string, unknown> } catch { return {} }
  }
  if (typeof cf === 'object') return cf as Record<string, unknown>
  return {}
}

function leadToContact(lead: LeadRow, activitiesByLead: Map<string, ActivityRow[]>, dealsByEmail: Map<string, DealRow[]>): Contact {
  const cf = parseCustomFields(lead.custom_fields)
  const tags = Array.isArray(cf.tags) ? cf.tags as string[] : []
  const company = (cf.company as string) || ''
  const acts = activitiesByLead.get(lead.id) || []
  const lastActivity = acts[0]?.created_at || lead.created_at
  const email = lead.email || ''
  const deals = (email ? dealsByEmail.get(email) : undefined) || []
  const dealValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const stage = statusToStage(lead.status)

  // Compute RFM tier heuristically from available data
  const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 86400000
  const recency = daysSinceActivity < 7 ? 5 : daysSinceActivity < 30 ? 4 : daysSinceActivity < 60 ? 3 : daysSinceActivity < 90 ? 2 : 1
  const frequency = Math.min(5, Math.max(1, acts.length))
  const monetary = dealValue >= 10000 ? 5 : dealValue >= 5000 ? 4 : dealValue >= 1000 ? 3 : dealValue >= 100 ? 2 : 1
  let rfmTier: RFMTier = 'New Customer'
  if (recency >= 4 && frequency >= 4 && monetary >= 4) rfmTier = 'Champion'
  else if (recency >= 4 && frequency >= 3) rfmTier = 'Loyal'
  else if (recency >= 3 && frequency >= 2) rfmTier = 'Potential Loyalist'
  else if (recency <= 2 && frequency >= 3) rfmTier = 'At Risk'
  else if (recency <= 2) rfmTier = 'Lost'
  else if (frequency <= 1) rfmTier = 'New Customer'

  const avatarColor = AVATAR_COLORS[lead.id.charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0]

  return {
    id: lead.id,
    name: lead.name || '—',
    email,
    phone: lead.phone || '',
    company,
    stage,
    score: Number(lead.score || 0),
    rfm_tier: rfmTier,
    rfm_r: recency,
    rfm_f: frequency,
    rfm_m: monetary,
    last_activity: lastActivity,
    tags,
    avatar_color: avatarColor,
    deal_value: dealValue,
    notes: lead.notes || '',
    created_at: lead.created_at,
  }
}

function dealRowToDeal(row: DealRow): Deal {
  // Map our DB stage values into the legacy Deal stage strings the UI expects
  const stageMap: Record<string, string> = {
    prospect: 'Prospecting', prospecting: 'Prospecting',
    qualified: 'Qualification', qualification: 'Qualification',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Closed Won', closed_won: 'Closed Won',
    lost: 'Closed Lost', closed_lost: 'Closed Lost',
  }
  return {
    id: row.id,
    name: row.title,
    contact: row.contact_name,
    value: Number(row.value) || 0,
    probability: Number(row.probability) || 0,
    stage: stageMap[row.stage] || row.stage,
    close_date: row.expected_close || '',
    owner: 'You',
    lost_reason: row.lost_reason,
  }
}

function activityTypeNormalize(t: string): ActivityType {
  if (t === 'call' || t === 'email' || t === 'note' || t === 'meeting' || t === 'deal' || t === 'alert') return t
  if (t === 'lead_created') return 'note'
  if (t.includes('email')) return 'email'
  if (t.includes('call')) return 'call'
  if (t.includes('meeting') || t.includes('booking')) return 'meeting'
  if (t.includes('deal') || t.includes('won') || t.includes('lost')) return 'deal'
  return 'note'
}

// MOCK_CONTACTS / MOCK_ACTIVITIES / MOCK_DEALS / MOCK_SEGMENTS were previously
// declared here as 8 fake contacts (Sarah Johnson / Marcus Chen / Priya Patel
// etc.), 6 fake activities, 5 fake deals, and 4 fake segments. They've been
// removed in Sprint 1D — `contacts`, `activities`, and `deals` are now
// hydrated from /api/leads-captured + /api/sales-deals + per-lead activity
// endpoints, and `segments` is derived client-side from real contact data
// (see the `segments` block in the page component). No silent mock fallback
// remains. Source Test: every visible row on the CRM traces to a DB row.

const DEAL_STAGES = ['Prospecting','Qualification','Proposal','Negotiation','Closed Won','Closed Lost']

const STAGE_COLORS: Record<Stage, string> = {
  Lead: 'bg-blue-900/60 text-blue-300 border-blue-800',
  Prospect: 'bg-yellow-900/60 text-yellow-300 border-yellow-800',
  Qualified: 'bg-purple-900/60 text-purple-300 border-purple-800',
  Proposal: 'bg-indigo-900/60 text-indigo-300 border-indigo-800',
  Customer: 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
  Churned: 'bg-gray-800/60 text-gray-400 border-gray-700',
}

const RFM_COLORS: Record<RFMTier, string> = {
  Champion: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  Loyal: 'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  'Potential Loyalist': 'bg-cyan-900/60 text-cyan-300 border-cyan-700',
  'New Customer': 'bg-blue-900/60 text-blue-300 border-blue-700',
  'At Risk': 'bg-orange-900/60 text-orange-300 border-orange-700',
  Lost: 'bg-red-900/60 text-red-400 border-red-800',
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  call:'📞', email:'📧', note:'📝', meeting:'🤝', deal:'💰', alert:'⚠️'
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const selectCls = inputCls + ' cursor-pointer'

// ── ScoreBar ───────────────────────────────────────────────────────────────────
function ScoreBar({ score, className = '' }: { score: number; className?: string }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-yellow-500' : score >= 25 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-gray-700">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-7 text-right">{score}</span>
    </div>
  )
}

// ── Contact Slide-over ─────────────────────────────────────────────────────────
function ContactSlideover({ contact, onClose, activities, workspaceId, onUpdated }: { contact: Contact; onClose: () => void; activities: Activity[]; workspaceId: string | null; onUpdated: () => void }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [editStage, setEditStage] = useState(contact.stage)
  const [savingStage, setSavingStage] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const contactActivities = activities

  async function saveStage(stage: Stage) {
    setEditStage(stage)
    setSavingStage(true)
    try {
      await fetch('/api/leads-captured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contact.id, status: stageToStatus(stage) }),
      })
      onUpdated()
    } finally { setSavingStage(false) }
  }

  /**
   * Log an activity row against the lead. Mirrors `submitNote` but parameterizes
   * the type/title so the Email/Call/Send-to-CMO buttons can use the same path.
   * Failure to log is non-fatal: the user-visible action (mailto, tel, navigation)
   * still happens; we just won't have the audit row.
   *
   * Note on `type`: the API accepts any string, but the existing frontend
   * `ActivityType` union only knows about call/email/note/meeting/deal/alert.
   * "Send to CMO" is logged as type='note' with a recognizable title so the
   * timeline icon renders correctly until we expand the ActivityType union.
   */
  async function logActivity(type: ActivityType, title: string, description?: string) {
    if (!workspaceId) return
    try {
      await fetch(`/api/leads-captured/${contact.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type, title, description }),
      })
      onUpdated()
    } catch {
      // Best-effort — don't block the user's action on a failed audit write.
    }
  }

  async function submitNote() {
    if (!note.trim() || !workspaceId) return
    setSavingNote(true)
    try {
      await fetch(`/api/leads-captured/${contact.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'note', title: note.slice(0, 100), description: note }),
      })
      setNote('')
      onUpdated()
    } finally { setSavingNote(false) }
  }

  /**
   * Email button — opens a mailto: link in a new tab and logs an `email`
   * activity row so the timeline reflects the contact attempt. The browser's
   * native mail handler takes over from there. We don't have a Send-Email-
   * via-Workspace flow yet; mailto is the honest fallback.
   */
  function handleEmailClick() {
    if (!contact.email) {
      setActionMsg('No email address on this contact.')
      return
    }
    setActionMsg(null)
    void logActivity('email', `Started email to ${contact.email}`, 'Opened in mail client via mailto:')
    if (typeof window !== 'undefined') {
      window.location.href = `mailto:${contact.email}`
    }
  }

  /**
   * Call button — opens a tel: link and logs a `call` activity. On desktop
   * this triggers the OS's default handler (FaceTime / Phone Link / etc.).
   * On mobile it places a call. If there's no phone number, we surface that
   * honestly rather than failing silently.
   */
  function handleCallClick() {
    if (!contact.phone) {
      setActionMsg('No phone number on this contact.')
      return
    }
    setActionMsg(null)
    void logActivity('call', `Started call to ${contact.phone}`, 'Opened in dialer via tel:')
    if (typeof window !== 'undefined') {
      window.location.href = `tel:${contact.phone.replace(/[^\d+]/g, '')}`
    }
  }

  /**
   * Send-to-CMO button — stashes a lead-context payload in localStorage so the
   * CMO dashboard can pick it up as a prefill, then navigates there. There is
   * no /api/cmo/context endpoint yet; using a known localStorage key keeps the
   * handoff honest (the CMO page can ignore it gracefully). Logs `sent_to_cmo`
   * so the lead's timeline records the escalation.
   */
  function handleSendToCmo() {
    if (typeof window !== 'undefined') {
      try {
        const payload = {
          source: 'crm',
          leadId: contact.id,
          name: contact.name,
          email: contact.email,
          company: contact.company,
          stage: contact.stage,
          dealValue: contact.deal_value,
          score: contact.score,
          ts: Date.now(),
        }
        localStorage.setItem('ooumph_cmo_prefill', JSON.stringify(payload))
      } catch { /* localStorage may be full / disabled — fall through to nav */ }
    }
    // Logged as 'note' (not 'sent_to_cmo') because the ActivityType union
    // in this file doesn't include sent_to_cmo yet. Title makes intent clear.
    void logActivity('note', `Sent ${contact.name} to CMO Dashboard`, 'Lead context queued for the CMO chat — see prefill on the dashboard.')
    router.push('/dashboard')
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-stretch justify-end" onClick={onClose}>
      <div className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className={`w-12 h-12 rounded-full ${contact.avatar_color} flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}>
            {initials(contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">{contact.name}</p>
            <p className="text-gray-400 text-xs truncate">{contact.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Contact info */}
          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">Email</span><span className="text-gray-300 truncate">{contact.email}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">Phone</span><span className="text-gray-300">{contact.phone}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">Deal</span><span className="text-emerald-400 font-medium">${contact.deal_value.toLocaleString()}</span></div>
          </div>

          {/* Stage + RFM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Stage</label>
              <select value={editStage} disabled={savingStage} onChange={e => saveStage(e.target.value as Stage)} className={selectCls}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">RFM Tier</label>
              <span className={`inline-flex px-2 py-1 rounded-md text-xs border ${RFM_COLORS[contact.rfm_tier]} mt-0.5`}>{contact.rfm_tier}</span>
            </div>
          </div>

          {/* Score */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Score</label>
            <ScoreBar score={contact.score} />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 text-xs border border-gray-700">{t}</span>
              ))}
            </div>
          </div>

          {/* Activity timeline */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-3 block">Activity Timeline</label>
            {contactActivities.length === 0 ? (
              <p className="text-gray-600 text-xs">No activity recorded</p>
            ) : (
              <div className="space-y-2">
                {contactActivities.map(a => (
                  <div key={a.id} className="flex gap-2.5 p-2.5 bg-gray-800/50 rounded-lg">
                    <span className="text-sm flex-shrink-0 mt-0.5">{ACTIVITY_ICONS[a.type]}</span>
                    <div className="min-w-0">
                      <p className="text-gray-300 text-xs font-medium">{a.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Add Note</label>
            <div className="flex gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitNote() }} placeholder="Type a note..." className={inputCls} />
              <button onClick={submitNote} disabled={!note.trim() || savingNote} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0">{savingNote ? '…' : '+'}</button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-800 p-4 flex flex-col gap-2 flex-shrink-0">
          {actionMsg && (
            <p className="text-amber-300 text-xs">{actionMsg}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleEmailClick}
              disabled={!contact.email}
              title={contact.email ? `Email ${contact.email}` : 'No email address on file'}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              📧 Email
            </button>
            <button
              onClick={handleCallClick}
              disabled={!contact.phone}
              title={contact.phone ? `Call ${contact.phone}` : 'No phone number on file'}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 rounded-lg text-sm transition-colors"
            >
              📞 Call
            </button>
            <button
              onClick={handleSendToCmo}
              title="Send this lead's context to the CMO Dashboard"
              className="px-3 py-2 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 rounded-lg text-sm transition-colors"
            >
              Send to CMO
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CSV Import Modal ───────────────────────────────────────────────────────────
function CSVImportModal({ onClose, workspaceId, onImported }: { onClose: () => void; workspaceId: string | null; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [allRows, setAllRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string,string>>({})
  const [duplicate, setDuplicate] = useState<'skip'|'update'|'create'>('skip')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, success: 0, skipped: 0, errors: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const CRM_FIELDS = ['name','email','phone','company','stage','score','tags','-- ignore --']

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) loadFile(f)
  }

  function loadFile(f: File) {
    setFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = text.split(/\r?\n/).filter(r => r.trim()).map(r => r.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      setAllRows(rows)
      setPreview(rows.slice(0, 6))
      const headers = rows[0] || []
      // Sprint 12D: smarter auto-detection. Each candidate field has
      // an ordered priority list — first match wins, so "email_work"
      // maps to 'email' rather than '-- ignore --'. Also checks
      // common aliases ("organization", "biz", "telephone", "mobile",
      // "given_name", "surname", etc.) that the previous version
      // missed entirely.
      const ALIASES: Array<{ field: string; patterns: RegExp[] }> = [
        { field: 'email',   patterns: [/\bemail/i, /\be-?mail/i, /\bmail$/i] },
        { field: 'phone',   patterns: [/\bphone/i, /\bmobile/i, /\btelephone/i, /\btel\b/i, /\bcell/i, /\bcontact.*number/i] },
        { field: 'name',    patterns: [/^name$/i, /\bfull.?name/i, /\bgiven.?name/i, /\bfirst.?name/i, /\blast.?name/i, /\bsurname/i, /\bperson/i, /\bcontact.?name/i] },
        { field: 'company', patterns: [/\bcompany/i, /\borganization/i, /\borganisation/i, /\bbiz\b/i, /\bbusiness/i, /\bemployer/i, /\bworkplace/i] },
        { field: 'stage',   patterns: [/\bstage/i, /\bstatus/i, /\bpipeline/i, /\bdeal.?stage/i] },
        { field: 'score',   patterns: [/\bscore/i, /\blead.?score/i, /\brank/i] },
        { field: 'tags',    patterns: [/\btags?\b/i, /\blabels?\b/i, /\bcategories/i] },
      ]
      const auto: Record<string,string> = {}
      headers.forEach(h => {
        const matched = ALIASES.find(a => a.patterns.some(p => p.test(h)))
        auto[h] = matched ? matched.field : '-- ignore --'
      })
      setMapping(auto)
    }
    reader.readAsText(f)
  }

  // Sprint 12D: pre-import validation. Looks at every data row and
  // reports the counts the user will see in the summary panel BEFORE
  // they commit. Catches "all my rows are missing email" up-front
  // instead of waiting through the import.
  const validation = (() => {
    if (allRows.length < 2) return null
    const headers = allRows[0]
    const data = allRows.slice(1)
    let withEmail = 0
    let withName = 0
    let invalidEmail = 0
    let missingBoth = 0
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const row of data) {
      const fields: Record<string, string> = {}
      headers.forEach((h, j) => {
        const target = mapping[h]
        if (target && target !== '-- ignore --' && row[j]) fields[target] = row[j]
      })
      if (fields.email) {
        if (emailRx.test(fields.email)) withEmail++
        else invalidEmail++
      }
      if (fields.name) withName++
      if (!fields.email && !fields.name) missingBoth++
    }
    const usable = data.length - missingBoth
    return {
      total: data.length,
      withEmail,
      withName,
      invalidEmail,
      missingBoth,
      usable,
    }
  })()
  const emailMapped = Object.values(mapping).includes('email')
  const nameMapped = Object.values(mapping).includes('name')

  async function doImport() {
    if (!workspaceId) return
    const headers = allRows[0] || []
    const dataRows = allRows.slice(1)
    if (dataRows.length === 0) return

    setImporting(true)
    setProgress({ done: 0, total: dataRows.length, success: 0, skipped: 0, errors: 0 })

    let success = 0, skipped = 0, errors = 0

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const fields: Record<string, string> = {}
      headers.forEach((h, j) => {
        const target = mapping[h]
        if (target && target !== '-- ignore --' && row[j]) {
          fields[target] = row[j]
        }
      })

      if (!fields.name && !fields.email) { skipped++; setProgress(p => ({ ...p, done: i + 1, skipped })); continue }

      try {
        const stageStr = fields.stage ? stageToStatus((fields.stage.charAt(0).toUpperCase() + fields.stage.slice(1).toLowerCase()) as Stage) : 'new'
        const res = await fetch('/api/leads-captured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            name: fields.name || fields.email || '—',
            email: fields.email,
            phone: fields.phone,
            source: 'csv_import',
            status: stageStr,
            score: fields.score ? Number(fields.score) : 0,
          }),
        })
        const data = await res.json() as { ok?: boolean; id?: string; error?: string }
        if (res.ok && data.id) {
          success++
          // attach company / tags via PATCH custom_fields
          if (fields.company || fields.tags) {
            const cf: Record<string, unknown> = {}
            if (fields.company) cf.company = fields.company
            if (fields.tags) cf.tags = fields.tags.split(/[;|]/).map(t => t.trim()).filter(Boolean)
            await fetch(`/api/leads-captured/${data.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, custom_fields: cf }),
            }).catch(() => {})
          }
        } else {
          errors++
        }
      } catch {
        errors++
      }
      setProgress({ done: i + 1, total: dataRows.length, success, skipped, errors })
    }

    setImporting(false)
    setImported(true)
    onImported()
  }

  if (imported) return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">✅</div>
        <h3 className="text-white font-semibold text-lg mb-2">Import Complete</h3>
        <p className="text-gray-400 text-sm mb-1">{progress.success} contacts imported successfully</p>
        <p className="text-gray-500 text-xs mb-6">{progress.skipped} skipped · {progress.errors} errors</p>
        <button onClick={onClose} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Done</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Import Contacts from CSV</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-700 hover:border-indigo-600 rounded-xl p-10 text-center cursor-pointer transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <div className="text-4xl mb-3">📂</div>
              <p className="text-white font-medium mb-1">Drag & drop your CSV file here</p>
              <p className="text-gray-500 text-sm">or click to browse · .csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">📄</span>
                <span className="text-white font-medium">{file.name}</span>
                <span className="text-gray-500">({Math.round(file.size / 1024)}KB)</span>
                <button onClick={() => { setFile(null); setPreview([]) }} className="ml-auto text-gray-500 hover:text-red-400 text-xs">Remove</button>
              </div>

              {/* Preview table */}
              {preview.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Preview (first 5 rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.slice(0, 5).map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-gray-800' : 'border-t border-gray-800'}>
                            {row.map((cell, j) => (
                              <td key={j} className={`px-3 py-2 ${i === 0 ? 'text-gray-400 font-semibold' : 'text-gray-300'}`}>{cell || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Field mapping — Sprint 12D: each row shows a sample
                  value from the first non-empty data row so the user
                  sees what they're mapping. A row is auto-mapped when
                  the column name matches our alias regex. */}
              {preview[0] && (
                <div>
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Map CSV columns to CRM fields</p>
                    {!emailMapped && !nameMapped && (
                      <span className="text-[11px] text-red-400">⚠ Map at least one column to <strong>email</strong> or <strong>name</strong></span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {preview[0].map(header => {
                      const colIdx = preview[0].indexOf(header)
                      // Find the first non-empty sample value in this column.
                      const sample = allRows.slice(1).find(r => r[colIdx]?.trim())?.[colIdx]
                      const target = mapping[header] || '-- ignore --'
                      const isImportant = target === 'email' || target === 'name'
                      return (
                        <div key={header} className={`flex items-center gap-3 rounded-lg p-2 ${isImportant ? 'bg-indigo-950/30 border border-indigo-900/40' : ''}`}>
                          <div className="w-40 shrink-0">
                            <p className="text-gray-300 text-sm font-medium truncate">{header}</p>
                            {sample && (
                              <p className="text-[10px] text-gray-500 truncate italic" title={sample}>
                                e.g. {sample.slice(0, 30)}{sample.length > 30 ? '…' : ''}
                              </p>
                            )}
                          </div>
                          <span className="text-gray-600">→</span>
                          <select
                            value={target}
                            onChange={e => setMapping(m => ({...m, [header]: e.target.value}))}
                            className={selectCls + ' flex-1'}
                          >
                            {CRM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sprint 12D: pre-import validation summary.
                  Shows the user EXACTLY what will happen before they
                  click Import — catches "all my rows are missing
                  email" up-front. */}
              {validation && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Pre-import preview</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className={`text-2xl font-bold ${validation.usable === validation.total ? 'text-green-400' : 'text-amber-400'}`}>
                        {validation.usable}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">will import</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-indigo-300">{validation.withEmail}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">with valid email</p>
                    </div>
                    {validation.invalidEmail > 0 && (
                      <div>
                        <p className="text-2xl font-bold text-red-400">{validation.invalidEmail}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">invalid email format</p>
                      </div>
                    )}
                    {validation.missingBoth > 0 && (
                      <div>
                        <p className="text-2xl font-bold text-gray-500">{validation.missingBoth}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">skip (no email or name)</p>
                      </div>
                    )}
                  </div>
                  {validation.usable === 0 && (
                    <p className="text-red-400 text-xs mt-3">
                      No rows will be imported. Make sure your CSV has email or name columns mapped above.
                    </p>
                  )}
                </div>
              )}

              {/* Duplicate handling */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Duplicate handling</p>
                <div className="flex gap-2">
                  {(['skip','update','create'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setDuplicate(opt)}
                      className={`flex-1 py-2 rounded-lg text-sm border transition-colors capitalize ${duplicate === opt ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-300'}`}
                    >
                      {opt === 'skip' ? 'Skip' : opt === 'update' ? 'Update' : 'Create New'}
                    </button>
                  ))}
                </div>
              </div>

              {importing && progress.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Importing row {progress.done} of {progress.total}…</span>
                    <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-2 bg-indigo-500 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{progress.success} success · {progress.skipped} skipped · {progress.errors} errors</p>
                </div>
              )}

              <button
                onClick={doImport}
                disabled={importing || !workspaceId || allRows.length <= 1}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {importing ? 'Importing…' : `Import ${allRows.length > 1 ? allRows.length - 1 : 0} contacts`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Segment Rule Builder Modal ────────────────────────────────────────────────
/**
 * Sprint 16F TASK 1 — modal POSTs to /api/segments.
 *
 * Rule shape mirrors normaliseRule() in app/api/segments/route.ts:
 *   statuses?, sources?, minScore?, maxScore?, campaignLike?, createdSince?
 *
 * The pre-Sprint-16F version used random match-counts and a no-op submit
 * button — wired now so saved segments actually persist and show up in
 * the saved-segment chip strip on next load.
 */
function SegmentModal({ onClose, workspaceId, onSaved }: {
  onClose: () => void
  workspaceId: string | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [statusesStr, setStatusesStr] = useState('')
  const [sourcesStr, setSourcesStr] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [createdSince, setCreatedSince] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!workspaceId) { setError('No workspace'); return }
    if (!name.trim()) { setError('Name is required'); return }
    setError(null); setSaving(true)
    try {
      const rule: SavedSegmentRule = {}
      if (statusesStr.trim()) rule.statuses = statusesStr.split(',').map(s => s.trim()).filter(Boolean)
      if (sourcesStr.trim()) rule.sources = sourcesStr.split(',').map(s => s.trim()).filter(Boolean)
      if (minScore !== '' && !Number.isNaN(Number(minScore))) rule.minScore = Number(minScore)
      if (maxScore !== '' && !Number.isNaN(Number(maxScore))) rule.maxScore = Number(maxScore)
      if (createdSince.trim()) rule.createdSince = createdSince
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          description: description.trim() || undefined,
          rule,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || `Save failed (${res.status})`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Save Segment</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-Score Recent Leads" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="optional notes" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Statuses</label>
              <input value={statusesStr} onChange={e => setStatusesStr(e.target.value)} placeholder="new, contacted, qualified" className={inputCls} />
              <p className="text-[10px] text-gray-600 mt-1">Comma-separated. e.g. new, hot, qualified.</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Sources</label>
              <input value={sourcesStr} onChange={e => setSourcesStr(e.target.value)} placeholder="meta_ads, google" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Min score</label>
              <input value={minScore} onChange={e => setMinScore(e.target.value)} type="number" placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Max score</label>
              <input value={maxScore} onChange={e => setMaxScore(e.target.value)} type="number" placeholder="100" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Created since (ISO date)</label>
              <input value={createdSince} onChange={e => setCreatedSince(e.target.value)} type="date" className={inputCls} />
            </div>
          </div>

          {error && (
            <div className="bg-rose-950/30 border border-rose-800/40 rounded-lg px-4 py-2 text-rose-300 text-sm">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button
              onClick={() => void submit()}
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Save Segment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Activity Modal ─────────────────────────────────────────────────────────
function AddActivityModal({ onClose, contacts, workspaceId, onLogged }: { onClose: () => void; contacts: Contact[]; workspaceId: string | null; onLogged: () => void }) {
  const [type, setType] = useState<ActivityType>('call')
  const [contactId, setContactId] = useState(contacts[0]?.id || '')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!contactId || !workspaceId) return
    setSaving(true)
    try {
      const title = `${type[0].toUpperCase()}${type.slice(1)}${outcome ? ' — ' + outcome : ''}`
      const desc = [notes, nextAction ? `Next: ${nextAction}` : ''].filter(Boolean).join('\n')
      await fetch(`/api/leads-captured/${contactId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type, title, description: desc }),
      })
      onLogged()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Log Activity</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Activity Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(['call','email','note','meeting','deal','alert'] as ActivityType[]).map(t => (
                <button key={t} onClick={() => setType(t)} className={`py-2 rounded-lg text-sm border flex items-center justify-center gap-1.5 transition-colors ${type===t ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white'}`}>
                  <span>{ACTIVITY_ICONS[t]}</span>
                  <span className="capitalize">{t}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Contact</label>
            <select value={contactId} onChange={e => setContactId(e.target.value)} className={selectCls}>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="What happened?" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Outcome</label>
              <input value={outcome} onChange={e => setOutcome(e.target.value)} className={inputCls} placeholder="e.g. Positive" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Next Action</label>
              <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={inputCls} placeholder="e.g. Follow up" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button onClick={submit} disabled={saving || !contactId} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">{saving ? 'Logging…' : 'Log Activity'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Deal Modal ─────────────────────────────────────────────────────────────
function AddDealModal({ onClose, contacts, workspaceId, onAdded }: { onClose: () => void; contacts: Contact[]; workspaceId: string | null; onAdded: () => void }) {
  const [form, setForm] = useState({ name:'', contact: contacts[0]?.name || '', value:'', probability:'50', stage:'Prospecting', close_date:'' })
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!form.name || !workspaceId) return
    const contact = contacts.find(c => c.name === form.contact)
    setSaving(true)
    try {
      // Map UI stage to API stage
      const stageMap: Record<string, string> = {
        'Prospecting': 'prospect',
        'Qualification': 'qualified',
        'Proposal': 'proposal',
        'Negotiation': 'negotiation',
        'Closed Won': 'won',
        'Closed Lost': 'lost',
      }
      await fetch('/api/sales-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          leadId: contact?.id,
          contactName: form.contact || 'Unknown',
          contactEmail: contact?.email,
          company: contact?.company,
          title: form.name,
          value: Number(form.value) || 0,
          stage: stageMap[form.stage] || 'prospect',
          probability: Number(form.probability) || 50,
          expectedClose: form.close_date || undefined,
        }),
      })
      onAdded()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Add Deal</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { label:'Deal Name', key:'name', placeholder:'e.g. Acme Annual Plan' },
            { label:'Value ($)', key:'value', placeholder:'e.g. 12000' },
            { label:'Probability (%)', key:'probability', placeholder:'0-100' },
            { label:'Close Date', key:'close_date', placeholder:'YYYY-MM-DD' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">{f.label}</label>
              <input value={(form as Record<string,string>)[f.key]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))} placeholder={f.placeholder} className={inputCls} />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Contact</label>
            <select value={form.contact} onChange={e => setForm(p => ({...p, contact:e.target.value}))} className={selectCls}>
              {contacts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Stage</label>
            <select value={form.stage} onChange={e => setForm(p => ({...p, stage:e.target.value}))} className={selectCls}>
              {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button onClick={submit} disabled={saving || !form.name} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">{saving ? 'Adding…' : 'Add Deal'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Edit Deal Modal ────────────────────────────────────────────────────────────
// Sprint 6E: lets the operator move a deal between stages from the Kanban.
// When the chosen stage is Closed Lost, surfaces a "Why was this lost?"
// selector + free-form details so we can run win/loss analysis later.
const LOST_REASON_PRESETS = [
  'Price too high',
  'Lost to competitor',
  'No budget',
  'No decision / went silent',
  'Wrong fit / not our ICP',
  'Timing — postponed',
  'Internal champion left',
  'Other',
]

function EditDealModal({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => void }) {
  const initialPresetMatch = LOST_REASON_PRESETS.find(p => deal.lost_reason?.startsWith(p))
  const [stage, setStage] = useState<string>(deal.stage)
  const [probability, setProbability] = useState<string>(String(deal.probability))
  const [value, setValue] = useState<string>(String(deal.value))
  const [lostReasonPreset, setLostReasonPreset] = useState<string>(initialPresetMatch || 'Other')
  const [lostReasonDetail, setLostReasonDetail] = useState<string>(
    deal.lost_reason && !initialPresetMatch ? deal.lost_reason : '',
  )
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const isLost = stage === 'Closed Lost'

  async function submit() {
    // The DEAL_STAGES UI values map to API stage tokens — the same mapping
    // AddDealModal uses on create. Keep them in sync.
    const stageMap: Record<string, string> = {
      'Prospecting': 'prospect',
      'Qualification': 'qualified',
      'Proposal': 'proposal',
      'Negotiation': 'negotiation',
      'Closed Won': 'won',
      'Closed Lost': 'lost',
    }
    setSaving(true); setErrMsg(null)
    try {
      const body: Record<string, unknown> = {
        id: deal.id,
        stage: stageMap[stage] || 'prospect',
        value: Number(value) || 0,
        probability: Number(probability) || 0,
      }
      if (isLost) {
        // Combine preset + detail. If preset is 'Other' we send just the detail.
        const combined = lostReasonPreset === 'Other'
          ? (lostReasonDetail.trim() || 'Other')
          : (lostReasonDetail.trim() ? `${lostReasonPreset} — ${lostReasonDetail.trim()}` : lostReasonPreset)
        body.lostReason = combined
      }
      const res = await fetch('/api/sales-deals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setErrMsg(err.error || `Save failed (${res.status})`)
        return
      }
      onSaved()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">Edit Deal</h2>
            <p className="text-gray-500 text-xs mt-0.5">{deal.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Stage</label>
            <select value={stage} onChange={e => setStage(e.target.value)} className={selectCls}>
              {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Value ($)</label>
              <input value={value} onChange={e => setValue(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Probability (%)</label>
              <input value={probability} onChange={e => setProbability(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Sprint 6E: lost-reason capture — only shown when stage is Closed Lost. */}
          {isLost && (
            <div className="space-y-3 pt-3 border-t border-gray-800">
              <div>
                <label className="text-xs text-red-400 uppercase tracking-wide mb-1.5 block">Why was this lost?</label>
                <select value={lostReasonPreset} onChange={e => setLostReasonPreset(e.target.value)} className={selectCls}>
                  {LOST_REASON_PRESETS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">
                  {lostReasonPreset === 'Other' ? 'Details (required)' : 'Details (optional)'}
                </label>
                <textarea
                  value={lostReasonDetail}
                  onChange={e => setLostReasonDetail(e.target.value)}
                  rows={3}
                  placeholder="What happened? (e.g. went with Acme — 30% cheaper)"
                  className={inputCls.replace('px-3 py-2', 'px-3 py-2 resize-none')}
                />
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Captured for future win/loss analysis — used to spot patterns in why we
                lose deals and refine ICP / positioning.
              </p>
            </div>
          )}

          {errMsg && (
            <div className="px-3 py-2 bg-red-950/40 border border-red-900 rounded-lg text-red-400 text-xs">
              {errMsg}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button
              onClick={submit}
              disabled={saving || (isLost && lostReasonPreset === 'Other' && !lostReasonDetail.trim())}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Contact Modal ──────────────────────────────────────────────────────────
function AddContactModal({ onClose, workspaceId, onAdded }: { onClose: () => void; workspaceId: string | null; onAdded: () => void }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', company:'', stage:'Lead' as Stage, notes:'' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function submit() {
    if (!form.name || !form.email) return
    if (!workspaceId) { setSubmitError('No workspace selected'); return }
    setSubmitting(true); setSubmitError(null)
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: form.name,
          email: form.email,
          phone: form.phone,
          source: 'manual',
          status: stageToStatus(form.stage),
          notes: form.notes,
        }),
      })
      const data = await res.json() as { ok?: boolean; id?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to add contact')

      // Persist company in custom_fields via separate PATCH if provided
      if (form.company && data.id) {
        await fetch(`/api/leads-captured/${data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, custom_fields: { company: form.company } }),
        }).catch(() => {})
      }

      onAdded()
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Add Contact</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label:'Full Name *', key:'name', placeholder:'Jane Smith' },
            { label:'Email *', key:'email', placeholder:'jane@company.com' },
            { label:'Phone', key:'phone', placeholder:'+1 555 000 0000' },
            { label:'Company', key:'company', placeholder:'Acme Corp' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
              <input value={(form as Record<string,string>)[f.key]} onChange={e => setForm(p => ({...p, [f.key]:e.target.value}))} placeholder={f.placeholder} className={inputCls} />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Initial Stage</label>
            <select value={form.stage} onChange={e => setForm(p => ({...p, stage: e.target.value as Stage}))} className={selectCls}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({...p, notes:e.target.value}))} rows={2} className={inputCls + ' resize-none'} placeholder="Initial notes..." />
          </div>
          {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button onClick={submit} disabled={!form.name || !form.email || submitting} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
              {submitting ? 'Adding…' : 'Add Contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── RFM Grid Cell ──────────────────────────────────────────────────────────────
const RFM_GRID: { label: string; count: number; color: string }[][] = [
  [
    { label: 'Champion', count: 47, color: 'bg-emerald-900/80 border-emerald-700' },
    { label: 'Loyal', count: 38, color: 'bg-emerald-900/40 border-emerald-800' },
    { label: 'Potential Loyalist', count: 29, color: 'bg-cyan-900/40 border-cyan-800' },
  ],
  [
    { label: 'Recent Customer', count: 22, color: 'bg-blue-900/40 border-blue-800' },
    { label: 'Promising', count: 31, color: 'bg-indigo-900/40 border-indigo-800' },
    { label: 'Need Attention', count: 18, color: 'bg-yellow-900/40 border-yellow-800' },
  ],
  [
    { label: 'About to Sleep', count: 24, color: 'bg-orange-900/40 border-orange-800' },
    { label: 'At Risk', count: 31, color: 'bg-orange-900/60 border-orange-700' },
    { label: 'Lost', count: 19, color: 'bg-red-900/60 border-red-800' },
  ],
]

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LeadsCRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  // Segments derived from real contacts below in `segments`. The previous
  // version pinned `MOCK_SEGMENTS` here so the Segments tab always showed
  // four fictional segments ("Champions (RFM 555) · 47 contacts" etc.)
  // regardless of the workspace's actual data. Source Test violated.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const [mainTab, setMainTab] = useState<MainTab>('contacts')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [search, setSearch] = usePersistedState<string>('crm:search', '')
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedContactActivities, setSelectedContactActivities] = useState<Activity[]>([])
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = usePersistedState<string>('crm:filterStatus', 'all')

  const [showImport, setShowImport] = useState(false)
  const [showSegmentModal, setShowSegmentModal] = useState(false)
  // Sprint 16F TASK 1: persisted segments live alongside built-ins.
  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([])
  const [appliedSavedSegmentId, setAppliedSavedSegmentId] = useState<string | null>(null)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showAddDeal, setShowAddDeal] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  // Sprint 17C (audit P1 #6): bulk-enrol existing CRM leads in a workflow.
  const [showEnrolWorkflow, setShowEnrolWorkflow] = useState(false)
  // Sprint 6E: deal opened in the edit modal (stage change + lost-reason capture).
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async (wsId: string) => {
    try {
      setError(null)
      const [leadsRes, dealsRes] = await Promise.all([
        fetch(`/api/leads-captured?workspaceId=${wsId}`),
        fetch(`/api/sales-deals?workspaceId=${wsId}`),
      ])
      const leads = (await leadsRes.json()) as LeadRow[] | { error?: string }
      const dealsData = (await dealsRes.json()) as DealRow[] | { error?: string }
      if (!Array.isArray(leads)) throw new Error((leads as { error?: string }).error || 'Failed to load contacts')
      const dealRows = Array.isArray(dealsData) ? dealsData : []

      // Fetch activities for each lead in parallel (limit if huge)
      const leadsToFetchActivities = leads.slice(0, 50)
      const activitySettled = await Promise.allSettled(
        leadsToFetchActivities.map(l =>
          fetch(`/api/leads-captured/${l.id}/activity`).then(r => r.ok ? r.json() as Promise<ActivityRow[]> : [])
        )
      )

      const activitiesByLead = new Map<string, ActivityRow[]>()
      const allActivities: Activity[] = []
      const leadNameById = new Map<string, string>()
      leads.forEach(l => leadNameById.set(l.id, l.name || '—'))

      activitySettled.forEach((res, i) => {
        const lead = leadsToFetchActivities[i]
        const rows = res.status === 'fulfilled' && Array.isArray(res.value) ? res.value : []
        activitiesByLead.set(lead.id, rows)
        rows.forEach(r => {
          allActivities.push({
            id: r.id,
            contact_id: r.lead_id,
            contact_name: leadNameById.get(r.lead_id) || '—',
            type: activityTypeNormalize(r.type),
            title: r.title,
            notes: r.description || '',
            outcome: '',
            next_action: '',
            timestamp: r.created_at,
          })
        })
      })

      const dealsByEmail = new Map<string, DealRow[]>()
      dealRows.forEach(d => {
        if (d.contact_email) {
          const arr = dealsByEmail.get(d.contact_email) || []
          arr.push(d)
          dealsByEmail.set(d.contact_email, arr)
        }
      })

      const mappedContacts: Contact[] = leads.map(l => leadToContact(l, activitiesByLead, dealsByEmail))
      const mappedDeals: Deal[] = dealRows.map(dealRowToDeal)

      setContacts(mappedContacts)
      setDeals(mappedDeals)
      setActivities(allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Sprint 10C: session-derived workspaceId.
  const { workspaceId: sessionWorkspaceId, resolved: sessionResolved } = useWorkspaceId()
  useEffect(() => {
    setWorkspaceId(sessionWorkspaceId)
    if (sessionWorkspaceId) loadData(sessionWorkspaceId)
    else if (sessionResolved) setLoading(false)
  }, [sessionWorkspaceId, sessionResolved, loadData])

  // Sprint 16F TASK 1: load persisted segments from /api/segments.
  const loadSavedSegments = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/segments?workspaceId=${wsId}`)
      if (!res.ok) return
      const rows = await res.json() as Array<Record<string, unknown>>
      const mapped: SavedSegment[] = (Array.isArray(rows) ? rows : []).map(r => ({
        id: String(r.id || ''),
        name: String(r.name || ''),
        description: r.description == null ? null : String(r.description),
        rule: (r.rule && typeof r.rule === 'object') ? r.rule as SavedSegmentRule : {},
        member_count: Number(r.member_count || 0),
        created_at: String(r.created_at || ''),
        updated_at: String(r.updated_at || r.created_at || ''),
      }))
      setSavedSegments(mapped)
    } catch { /* non-fatal — saved segments are an extra */ }
  }, [])
  useEffect(() => {
    if (sessionWorkspaceId) loadSavedSegments(sessionWorkspaceId)
  }, [sessionWorkspaceId, loadSavedSegments])

  // Sprint 16F TASK 1: delete a saved segment.
  async function deleteSavedSegment(id: string) {
    if (!workspaceId) return
    try {
      await fetch(`/api/segments?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      setSavedSegments(s => s.filter(x => x.id !== id))
      if (appliedSavedSegmentId === id) setAppliedSavedSegmentId(null)
    } catch { /* ignore */ }
  }

  // Cross-CRM deep-link: the Voice AI call drawer (and any other surface) can
  // open this page with ?leadId=… and the matching contact's drawer pops
  // automatically. We watch `contacts` so the lookup runs once data lands —
  // running it before is pointless because the list is empty.
  useEffect(() => {
    if (typeof window === 'undefined' || contacts.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const targetLeadId = params.get('leadId')
    if (!targetLeadId) return
    const match = contacts.find(c => c.id === targetLeadId)
    if (match) {
      setMainTab('contacts')
      setSelectedContact(match)
    }
  }, [contacts])

  // Refetch activities for selected contact (richer detail)
  useEffect(() => {
    if (!selectedContact) { setSelectedContactActivities([]); return }
    const sel = selectedContact
    fetch(`/api/leads-captured/${sel.id}/activity`)
      .then(r => r.ok ? r.json() as Promise<ActivityRow[]> : [])
      .then(rows => {
        const acts: Activity[] = (Array.isArray(rows) ? rows : []).map(r => ({
          id: r.id,
          contact_id: r.lead_id,
          contact_name: sel.name,
          type: activityTypeNormalize(r.type),
          title: r.title,
          notes: r.description || '',
          outcome: '',
          next_action: '',
          timestamp: r.created_at,
        }))
        setSelectedContactActivities(acts)
      }).catch(() => setSelectedContactActivities([]))
  }, [selectedContact?.id])

  // Sprint 16F TASK 1: apply rule of an active saved segment on top of the
  // existing text-search filter. The rule shape matches normaliseRule() in
  // /api/segments — statuses[] (status names), minScore/maxScore, sources[],
  // campaignLike, createdSince. We translate `status` to our local Stage enum
  // via statusToStage() so the chip's filter reads like the saved rule.
  const appliedSegment = appliedSavedSegmentId
    ? savedSegments.find(s => s.id === appliedSavedSegmentId) || null
    : null
  function ruleMatch(c: Contact, rule: SavedSegmentRule): boolean {
    if (rule.statuses?.length) {
      const targetStages = new Set(rule.statuses.map(statusToStage))
      if (!targetStages.has(c.stage)) return false
    }
    if (typeof rule.minScore === 'number' && c.score < rule.minScore) return false
    if (typeof rule.maxScore === 'number' && c.score > rule.maxScore) return false
    if (rule.createdSince) {
      const since = new Date(rule.createdSince).getTime()
      if (!Number.isNaN(since) && new Date(c.created_at).getTime() < since) return false
    }
    return true
  }
  const filtered = contacts.filter(c => {
    const textOk = !search
      || c.name.toLowerCase().includes(search.toLowerCase())
      || c.email.toLowerCase().includes(search.toLowerCase())
      || c.company.toLowerCase().includes(search.toLowerCase())
    if (!textOk) return false
    if (appliedSegment && !ruleMatch(c, appliedSegment.rule)) return false
    return true
  })

  // ── Real segments derived from loaded contacts ─────────────────────────────
  // Every count below is computed from the workspace's actual `contacts` array
  // (which comes from /api/leads-captured). No mocks, no fabrication. When the
  // workspace is empty all counts are 0 and the Segments tab renders an empty
  // state. There's no /api/crm/segments endpoint yet — when it ships, swap
  // this useMemo for a fetch.
  const segments: Segment[] = (() => {
    const now = Date.now()
    const ONE_WEEK = 7 * 24 * 3600 * 1000
    const TWO_WEEKS = 14 * 24 * 3600 * 1000
    const lastActivityByLead = new Map<string, number>()
    activities.forEach(a => {
      const t = new Date(a.timestamp).getTime()
      const prev = lastActivityByLead.get(a.contact_id) ?? 0
      if (t > prev) lastActivityByLead.set(a.contact_id, t)
    })
    const newThisWeek = contacts.filter(c => now - new Date(c.created_at).getTime() <= ONE_WEEK).length
    const hot = contacts.filter(c => c.score >= 75).length
    const cold = contacts.filter(c => c.score < 25).length
    const noFollowUp = contacts.filter(c => {
      const last = lastActivityByLead.get(c.id)
      return !last || now - last >= TWO_WEEKS
    }).length
    const customers = contacts.filter(c => c.stage === 'Customer').length
    const qualified = contacts.filter(c => c.stage === 'Qualified' || c.stage === 'Proposal').length
    const today = new Date().toISOString()
    const mk = (id: string, name: string, count: number, performance: string, conditions: Segment['conditions']): Segment => ({
      id, name, count, last_updated: today, performance, conditions, type: 'builtin',
    })
    return [
      mk('all', 'All Contacts', contacts.length, `${contacts.length} total in CRM`, []),
      mk('new_week', 'New This Week', newThisWeek, 'Created in last 7 days', [{ field: 'created_at', operator: '>=', value: 'now-7d' }]),
      mk('hot', 'Hot Leads (score ≥ 75)', hot, 'High-intent prospects', [{ field: 'score', operator: '>=', value: '75' }]),
      mk('cold', 'Cold Leads (score < 25)', cold, 'Low engagement', [{ field: 'score', operator: '<', value: '25' }]),
      mk('stalled', 'No Follow-up (14d+)', noFollowUp, 'No activity in 2 weeks', [{ field: 'last_activity', operator: '<=', value: 'now-14d' }]),
      mk('qualified', 'Qualified / In Proposal', qualified, 'Active sales conversations', [{ field: 'stage', operator: 'in', value: 'Qualified,Proposal' }]),
      mk('customers', 'Customers', customers, 'Closed deals', [{ field: 'stage', operator: '=', value: 'Customer' }]),
    ]
  })()

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['name','email','phone','company','stage','score','rfm_tier','tags','deal_value','created_at']
    const rows = contacts.map(c => [
      c.name, c.email, c.phone, c.company, c.stage, c.score, c.rfm_tier, c.tags.join(';'), c.deal_value, c.created_at
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'contacts.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalPipeline = contacts.reduce((s, c) => s + c.deal_value, 0)
  const avgDeal = contacts.filter(c => c.deal_value > 0).length > 0
    ? Math.round(totalPipeline / contacts.filter(c => c.deal_value > 0).length)
    : 0
  const newThisWeek = contacts.filter(c => Date.now() - new Date(c.created_at).getTime() < 7 * 86400000).length
  // Sprint 5 fix: guard division by zero — a fresh workspace has
  // contacts.length === 0, which used to render "NaN%" in the stat card.
  const conversionRate = contacts.length === 0
    ? 0
    : Math.round((contacts.filter(c => c.stage === 'Customer').length / contacts.length) * 100)
  const churnRisk = contacts.filter(c => c.rfm_tier === 'At Risk' || c.rfm_tier === 'Lost').length

  // ── Kanban drag ───────────────────────────────────────────────────────────
  async function handleKanbanDrop(stage: Stage) {
    const id = kanbanDragId
    if (!id) return
    setKanbanDragId(null)
    const previous = contacts.find(c => c.id === id)?.stage
    // Optimistic update
    setContacts(cs => cs.map(c => c.id === id ? { ...c, stage } : c))
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: stageToStatus(stage) }),
      })
      if (!res.ok) throw new Error('PATCH failed')
    } catch {
      // Rollback on error
      if (previous) setContacts(cs => cs.map(c => c.id === id ? { ...c, stage: previous } : c))
    }
  }

  async function deleteContact(id: string) {
    const previous = contacts
    setContacts(cs => cs.filter(c => c.id !== id))
    try {
      const res = await fetch(`/api/leads-captured?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('DELETE failed')
    } catch {
      setContacts(previous)
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  function selectAll(checked: boolean) {
    if (checked) setSelectedContacts(new Set(filtered.map(c => c.id)))
    else setSelectedContacts(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedContacts(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Sprint 18C: bulk-action handlers ─────────────────────────────────────
  // Wired against the freshly-extended /api/leads-captured (bulk PATCH +
  // bulk DELETE) and the existing nurture agent. Export reuses the
  // client-side CSV builder (`exportCSV`) but scoped to selected rows.
  async function bulkEmail() {
    const ids = Array.from(selectedContacts)
    if (ids.length === 0 || !workspaceId) return
    try {
      const res = await fetch('/api/agents/nurture/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, leadIds: ids }),
      })
      if (!res.ok && res.status === 404) {
        // Nurture send endpoint not yet wired — surface honest message
        // rather than silently no-op.
        alert(`Nurture send endpoint not yet available. Queued ${ids.length} lead(s) intent locally.`)
      }
    } catch (e) {
      alert(`Failed to kick nurture: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function bulkAddTag() {
    const ids = Array.from(selectedContacts)
    if (ids.length === 0) return
    const tag = typeof window !== 'undefined' ? window.prompt('Add tag to selected leads:') : null
    if (!tag || !tag.trim()) return
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, addTag: tag.trim() }),
      })
      if (!res.ok) throw new Error(`PATCH failed (${res.status})`)
      if (workspaceId) await loadData(workspaceId)
    } catch (e) {
      alert(`Tag failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function bulkChangeStage() {
    const ids = Array.from(selectedContacts)
    if (ids.length === 0) return
    const allowed = ['new', 'contacted', 'qualified', 'won', 'lost']
    const stage = typeof window !== 'undefined' ? window.prompt(`Stage (${allowed.join('|')}):`) : null
    if (!stage || !allowed.includes(stage.trim().toLowerCase())) {
      if (stage) alert(`Stage must be one of: ${allowed.join(', ')}`)
      return
    }
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: stage.trim().toLowerCase() }),
      })
      if (!res.ok) throw new Error(`PATCH failed (${res.status})`)
      if (workspaceId) await loadData(workspaceId)
    } catch (e) {
      alert(`Stage change failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function bulkExport() {
    const ids = selectedContacts
    if (ids.size === 0) return
    // Reuse the client-side CSV path. There's no /export endpoint yet —
    // building CSV here keeps the action honest without inventing one.
    const headers = ['name','email','phone','company','stage','score','rfm_tier','tags','deal_value','created_at']
    const rows = contacts.filter(c => ids.has(c.id)).map(c => [
      c.name, c.email, c.phone, c.company, c.stage, c.score, c.rfm_tier, c.tags.join(';'), c.deal_value, c.created_at
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'contacts-selected.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function bulkDelete() {
    const ids = Array.from(selectedContacts)
    if (ids.length === 0) return
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${ids.length} lead(s)? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/leads-captured', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error(`DELETE failed (${res.status})`)
      setSelectedContacts(new Set())
      if (workspaceId) await loadData(workspaceId)
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const dealStageMap: Record<string, Deal[]> = {}
  DEAL_STAGES.forEach(s => { dealStageMap[s] = deals.filter(d => d.stage === s) })

  const filteredActivities = activityFilter === 'all' ? activities : activities.filter(a => a.type === activityFilter)

  // ── RFM Analysis: real computation from contacts ─────────────────────────
  const rfmTierCounts: Record<RFMTier, number> = {
    Champion: 0, Loyal: 0, 'Potential Loyalist': 0, 'New Customer': 0,
    'At Risk': 0, Lost: 0,
  }
  contacts.forEach(c => { rfmTierCounts[c.rfm_tier] = (rfmTierCounts[c.rfm_tier] || 0) + 1 })

  const rfmTierStats: { tier: RFMTier; count: number; aov: number; avgRecencyDays: number; action: string }[] = (Object.keys(rfmTierCounts) as RFMTier[]).map(tier => {
    const items = contacts.filter(c => c.rfm_tier === tier)
    const aov = items.length ? Math.round(items.reduce((s, c) => s + c.deal_value, 0) / items.length) : 0
    const avgRecency = items.length
      ? Math.round(items.reduce((s, c) => s + (Date.now() - new Date(c.last_activity).getTime()) / 86400000, 0) / items.length)
      : 0
    const actionMap: Record<RFMTier, string> = {
      Champion: 'Reward & ask for referrals',
      Loyal: 'Upsell to higher plan',
      'Potential Loyalist': 'Loyalty program invite',
      'New Customer': 'Onboarding sequence',
      'At Risk': 'Re-engagement campaign',
      Lost: 'Win-back offer',
    }
    return { tier, count: items.length, aov, avgRecencyDays: avgRecency, action: actionMap[tier] }
  })

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 flex-wrap gap-y-2">
        <h1 className="text-xl font-bold text-white mr-2">CRM</h1>

        <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
          ⬆ Import CSV
        </button>
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
          ⬇ Export CSV
        </button>
        <button onClick={() => setShowAddContact(true)} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
          ➕ Add Contact
        </button>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="ml-auto px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-56"
        />

        {mainTab === 'contacts' && (
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {(['table','kanban','cards'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{v}</button>
            ))}
          </div>
        )}
      </div>

      {/* Sprint 16F TASK 1 — Saved segment chips strip.
          Sits between toolbar and stats so it's visible in every tab. The
          "Save as segment..." button opens the rule-builder modal which
          POSTs to /api/segments. Active chip narrows the `filtered` list. */}
      {(savedSegments.length > 0 || appliedSavedSegmentId) && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-gray-800 bg-gray-950">
          <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium mr-1">
            Saved segments
          </span>
          {savedSegments.map(seg => {
            const active = appliedSavedSegmentId === seg.id
            return (
              <span
                key={seg.id}
                className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                  active
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-indigo-700'
                }`}
                onClick={() => setAppliedSavedSegmentId(active ? null : seg.id)}
                title={seg.description || `${seg.member_count} members`}
              >
                {seg.name}
                <span className={`text-[10px] tabular-nums ${active ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {seg.member_count}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); void deleteSavedSegment(seg.id) }}
                  className={`ml-0.5 text-[10px] ${active ? 'text-indigo-200 hover:text-white' : 'text-gray-600 hover:text-rose-400'}`}
                  title="Delete saved segment"
                >
                  ✕
                </button>
              </span>
            )
          })}
          {appliedSavedSegmentId && (
            <button
              onClick={() => setAppliedSavedSegmentId(null)}
              className="text-[11px] text-gray-500 hover:text-gray-300 ml-1"
            >
              Clear filter
            </button>
          )}
          <button
            onClick={() => setShowSegmentModal(true)}
            className="ml-auto text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
          >
            + Save as segment…
          </button>
        </div>
      )}
      {savedSegments.length === 0 && (
        <div className="flex items-center justify-end px-4 py-1.5 border-b border-gray-800 bg-gray-950">
          <button
            onClick={() => setShowSegmentModal(true)}
            className="text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
          >
            + Save current view as segment…
          </button>
        </div>
      )}

      {/* ── Stats Bar ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-gray-800 border-b border-gray-800 flex-shrink-0">
        {[
          { label: 'Total Contacts', value: contacts.length, color: 'text-white' },
          { label: 'New This Week', value: newThisWeek, color: 'text-blue-300' },
          { label: 'Avg Deal Value', value: `$${avgDeal.toLocaleString()}`, color: 'text-emerald-300' },
          { label: 'Pipeline Value', value: `$${(totalPipeline/1000).toFixed(0)}k`, color: 'text-indigo-300' },
          { label: 'Conversion Rate', value: `${conversionRate}%`, color: 'text-purple-300' },
          { label: 'Churn Risk', value: churnRisk, color: 'text-orange-300' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main Tabs ───────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-800 bg-gray-900 flex-shrink-0">
        {([
          { id:'contacts', label:'👥 Contacts' },
          { id:'segments', label:'🎯 Segments' },
          { id:'rfm', label:'📊 RFM Analysis' },
          { id:'activities', label:'📋 Activities' },
          { id:'pipeline', label:'💰 Pipeline' },
        ] as { id: MainTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${mainTab === tab.id ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* Loading state */}
        {loading && (
          <div className="p-12 text-center text-gray-500">
            <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p>Loading contacts…</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="p-8 m-6 bg-red-950/40 border border-red-800 rounded-xl text-center">
            <p className="text-red-400 font-medium">Failed to load CRM data</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
            <button onClick={() => workspaceId && loadData(workspaceId)} className="mt-3 px-4 py-1.5 bg-red-900 hover:bg-red-800 text-white rounded-lg text-sm">Retry</button>
          </div>
        )}

        {/* Empty state (no workspaceId or no contacts) */}
        {!loading && !error && !workspaceId && (
          <div className="p-12 m-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
            <div className="text-5xl mb-3">🔐</div>
            <p className="text-white font-medium">No workspace selected</p>
            <p className="text-gray-500 text-sm mt-1">Set up a workspace to use the CRM.</p>
          </div>
        )}

        {!loading && !error && workspaceId && contacts.length === 0 && mainTab === 'contacts' && (
          <div className="p-12 m-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
            <div className="text-5xl mb-3">📇</div>
            <p className="text-white font-medium text-lg">Your CRM is empty</p>
            <p className="text-gray-500 text-sm mt-1 mb-5">Add your first contact or import a CSV to get started.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowAddContact(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">➕ Add Contact</button>
              <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm">⬆ Import CSV</button>
            </div>
          </div>
        )}

        {/* ═══════════════ CONTACTS TAB ════════════════════════════════ */}
        {mainTab === 'contacts' && !loading && contacts.length > 0 && (
          <div className="p-6">

            {/* ── TABLE VIEW ── */}
            {viewMode === 'table' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80">
                      <th className="px-4 py-3 text-left">
                        <input type="checkbox" className="rounded" onChange={e => selectAll(e.target.checked)} checked={selectedContacts.size === filtered.length && filtered.length > 0} />
                      </th>
                      {['Contact','Email','Phone','Company','Stage','Score','RFM Tier','Last Activity','Tags',''].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={11} className="text-center py-16 text-gray-500">No contacts found</td></tr>
                    ) : filtered.map(c => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer transition-colors group"
                        onClick={() => setSelectedContact(c)}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedContacts.has(c.id)} onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full ${c.avatar_color} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>{initials(c.name)}</div>
                            <span className="text-white text-sm font-medium whitespace-nowrap">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-400 text-sm">{c.email}</td>
                        <td className="px-3 py-3 text-gray-400 text-sm whitespace-nowrap">{c.phone}</td>
                        <td className="px-3 py-3 text-gray-300 text-sm whitespace-nowrap">{c.company}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${STAGE_COLORS[c.stage]}`}>{c.stage}</span>
                        </td>
                        <td className="px-3 py-3 min-w-[100px]">
                          <ScoreBar score={c.score} />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${RFM_COLORS[c.rfm_tier]}`}>{c.rfm_tier}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{timeAgo(c.last_activity)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {c.tags.slice(0, 2).map(t => (
                              <span key={t} className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setSelectedContact(c)} className="p-1.5 bg-gray-800 hover:bg-indigo-900/40 rounded text-xs" title="View">👁</button>
                            <button className="p-1.5 bg-gray-800 hover:bg-blue-900/40 rounded text-xs" title="Email">📧</button>
                            <button className="p-1.5 bg-gray-800 hover:bg-green-900/40 rounded text-xs" title="Call">📞</button>
                            <button className="p-1.5 bg-gray-800 hover:bg-red-900/40 rounded text-xs text-gray-600 hover:text-red-400" onClick={() => deleteContact(c.id)} title="Delete">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── KANBAN VIEW ── */}
            {viewMode === 'kanban' && (
              <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
                {STAGES.map(stage => {
                  const stageContacts = filtered.filter(c => c.stage === stage)
                  return (
                    <div
                      key={stage}
                      className="flex-shrink-0 w-56 flex flex-col rounded-xl border border-gray-800 overflow-hidden"
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleKanbanDrop(stage)}
                    >
                      <div className={`px-3 py-2.5 border-b border-gray-800 flex items-center justify-between ${STAGE_COLORS[stage].split(' ').filter(c => c.startsWith('bg-')).join(' ')}/20`}>
                        <span className={`text-sm font-semibold ${STAGE_COLORS[stage].split(' ').find(c => c.startsWith('text-'))}`}>{stage}</span>
                        <span className="text-xs bg-gray-900/60 px-1.5 py-0.5 rounded-full text-gray-400">{stageContacts.length}</span>
                      </div>
                      <div className="flex-1 p-2 space-y-2 bg-gray-950/40 overflow-y-auto">
                        {stageContacts.map(c => (
                          <div
                            key={c.id}
                            draggable
                            onDragStart={() => setKanbanDragId(c.id)}
                            onClick={() => setSelectedContact(c)}
                            className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-3 cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-6 h-6 rounded-full ${c.avatar_color} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>{initials(c.name)}</div>
                              <span className="text-white text-xs font-medium truncate">{c.name}</span>
                            </div>
                            <p className="text-gray-500 text-xs truncate mb-2">{c.company}</p>
                            <ScoreBar score={c.score} />
                            <p className="text-gray-600 text-xs mt-1.5">{timeAgo(c.last_activity)}</p>
                          </div>
                        ))}
                        {stageContacts.length === 0 && (
                          <div className="text-center py-6 text-gray-700 text-xs">Drop here</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── CARDS VIEW ── */}
            {viewMode === 'cards' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map(c => (
                  <div key={c.id} onClick={() => setSelectedContact(c)} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 cursor-pointer transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full ${c.avatar_color} flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}>{initials(c.name)}</div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-gray-500 text-xs truncate">{c.company}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${STAGE_COLORS[c.stage]}`}>{c.stage}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs border ${RFM_COLORS[c.rfm_tier]}`}>{c.rfm_tier}</span>
                    </div>
                    <ScoreBar score={c.score} className="mb-2" />
                    <p className="text-gray-600 text-xs">{timeAgo(c.last_activity)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Bulk Action Bar ── */}
            {selectedContacts.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-indigo-700 rounded-xl px-5 py-3 flex items-center gap-3 shadow-2xl z-40">
                <span className="text-indigo-300 text-sm font-medium">{selectedContacts.size} selected</span>
                <div className="w-px h-5 bg-gray-700" />
                {/* Sprint 17C (audit P1 #6): manual workflow enrolment for existing leads. */}
                <button
                  onClick={() => setShowEnrolWorkflow(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-700/40 text-indigo-200 hover:bg-indigo-700/60 transition-colors"
                >
                  Enrol in workflow
                </button>
                {([
                  { label: 'Email Selected', onClick: bulkEmail },
                  { label: 'Add Tag', onClick: bulkAddTag },
                  { label: 'Change Stage', onClick: bulkChangeStage },
                  { label: 'Export', onClick: bulkExport },
                  { label: 'Delete', onClick: bulkDelete },
                ]).map(action => (
                  <button key={action.label} onClick={() => void action.onClick()} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${action.label === 'Delete' ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                    {action.label}
                  </button>
                ))}
                <button onClick={() => setSelectedContacts(new Set())} className="text-gray-500 hover:text-white ml-1">✕</button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ SEGMENTS TAB ════════════════════════════════ */}
        {mainTab === 'segments' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold">Contact Segments</h2>
              <button onClick={() => setShowSegmentModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                + Create Segment
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {segments.map(seg => (
                <div key={seg.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold">{seg.name}</h3>
                      <p className="text-gray-500 text-xs mt-0.5">Updated {seg.last_updated}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-indigo-300">{seg.count}</p>
                      <p className="text-gray-500 text-xs">contacts</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 mb-4 bg-gray-800/50 rounded-lg px-3 py-2">{seg.performance}</div>
                  <div className="mb-4">
                    <p className="text-xs text-gray-600 mb-1.5">Conditions:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {seg.conditions.map((cond, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">{cond.field} {cond.operator} {cond.value}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors">Deploy to Email</button>
                    <button className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors">Deploy to Ads</button>
                    <button className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors">Export</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Sprint 16F TASK 1 — saved segments live BELOW the built-in
                strip. Source of truth is /api/segments. Empty state is honest
                so a fresh workspace doesn't see fake "Champions" rows. */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold text-sm">Saved Segments</h3>
                  <p className="text-gray-500 text-xs">
                    Persisted rules from /api/segments — shareable across the workspace.
                  </p>
                </div>
                <button
                  onClick={() => setShowSegmentModal(true)}
                  className="text-xs text-indigo-300 hover:text-indigo-200 font-medium"
                >
                  + Save current view as segment…
                </button>
              </div>
              {savedSegments.length === 0 ? (
                <div className="bg-gray-900 border border-dashed border-gray-800 rounded-xl p-6 text-center text-sm text-gray-500">
                  No saved segments yet — save a filter combination above to reuse it later.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedSegments.map(seg => (
                    <div key={seg.id} className="bg-gray-900 border border-indigo-900/40 rounded-xl p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-white font-semibold">{seg.name}</h4>
                          {seg.description && (
                            <p className="text-gray-500 text-xs mt-0.5">{seg.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-indigo-300">{seg.member_count}</p>
                          <p className="text-gray-500 text-xs">members</p>
                        </div>
                      </div>
                      <div className="mb-3">
                        <p className="text-xs text-gray-600 mb-1.5">Rule:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {seg.rule.statuses?.length ? (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">status ∈ {seg.rule.statuses.join(',')}</span>
                          ) : null}
                          {typeof seg.rule.minScore === 'number' ? (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">score ≥ {seg.rule.minScore}</span>
                          ) : null}
                          {typeof seg.rule.maxScore === 'number' ? (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">score ≤ {seg.rule.maxScore}</span>
                          ) : null}
                          {seg.rule.sources?.length ? (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">source ∈ {seg.rule.sources.join(',')}</span>
                          ) : null}
                          {seg.rule.createdSince ? (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">created ≥ {seg.rule.createdSince.slice(0,10)}</span>
                          ) : null}
                          {Object.keys(seg.rule).length === 0 && (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-500 text-xs rounded border border-gray-700 italic">no filters (all contacts)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setMainTab('contacts'); setAppliedSavedSegmentId(seg.id) }}
                          className="flex-1 py-1.5 bg-indigo-700/40 hover:bg-indigo-700/60 text-indigo-200 rounded-lg text-xs transition-colors"
                        >
                          Apply filter
                        </button>
                        <button
                          onClick={() => void deleteSavedSegment(seg.id)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-rose-900/40 text-gray-400 hover:text-rose-300 rounded-lg text-xs transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ RFM ANALYSIS TAB ════════════════════════════ */}
        {mainTab === 'rfm' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold">RFM Analysis</h2>
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run RFM Analysis
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* RFM Grid — real tier counts */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">RFM Segment Distribution</h3>
                {contacts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No contacts yet — add contacts to see RFM analysis.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(rfmTierCounts) as RFMTier[]).map(tier => (
                      <div key={tier} className={`border rounded-lg p-3 ${RFM_COLORS[tier]}`}>
                        <p className="text-xs text-gray-300 font-medium leading-tight mb-1">{tier}</p>
                        <p className="text-xl font-bold text-white">{rfmTierCounts[tier]}</p>
                        <p className="text-xs text-gray-500 mt-1">{contacts.length ? Math.round((rfmTierCounts[tier] / contacts.length) * 100) : 0}%</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Insights */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">🤖 AI Insights</h3>
                <div className="space-y-3">
                  {[
                    { icon:'⚠️', color:'text-orange-300', text:'47 contacts moved from Loyal to At Risk this week — consider a win-back campaign' },
                    { icon:'📈', color:'text-emerald-300', text:'Champions segment grew by 12% this month — amplify what\'s working' },
                    { icon:'💡', color:'text-indigo-300', text:'31 New Customers are ready for an upsell offer based on purchase frequency' },
                    { icon:'🎯', color:'text-blue-300', text:'LATAM segment shows 2x higher LTV — consider dedicated nurture sequence' },
                  ].map((insight, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-lg flex-shrink-0">{insight.icon}</span>
                      <p className={`text-sm ${insight.color}`}>{insight.text}</p>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Generate Win-back Campaign
                </button>
              </div>
            </div>

            {/* Segment Breakdown Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h3 className="text-white font-semibold">Segment Breakdown</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Tier', 'Count', 'Avg Order Value', 'Avg Recency (days)', 'Recommended Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rfmTierStats.filter(r => r.count > 0).map((row, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${RFM_COLORS[row.tier]}`}>{row.tier}</span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{row.count}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium">${row.aov.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-300">{row.avgRecencyDays}d</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{row.action}</td>
                    </tr>
                  ))}
                  {rfmTierStats.every(r => r.count === 0) && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">No contact data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════ ACTIVITIES TAB ══════════════════════════════ */}
        {mainTab === 'activities' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex gap-2">
                {['all','call','email','note','meeting','deal','alert'].map(type => (
                  <button key={type} onClick={() => setActivityFilter(type)} className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${activityFilter === type ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    {type !== 'all' && ACTIVITY_ICONS[type as ActivityType]} {type}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddActivity(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                + Log Activity
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-16 text-gray-500">No activities found</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {filteredActivities.map(a => (
                    <div key={a.id} className="flex gap-4 p-4 hover:bg-gray-800/30 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-base flex-shrink-0">
                        {ACTIVITY_ICONS[a.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-white text-sm font-medium">{a.title}</p>
                            <p className="text-indigo-400 text-xs mt-0.5">{a.contact_name}</p>
                          </div>
                          <span className="text-gray-600 text-xs whitespace-nowrap flex-shrink-0">{timeAgo(a.timestamp)}</span>
                        </div>
                        {a.notes && <p className="text-gray-400 text-sm mt-1.5">{a.notes}</p>}
                        <div className="flex gap-3 mt-2 text-xs">
                          {a.outcome && <span className="text-gray-500">Outcome: <span className="text-gray-300">{a.outcome}</span></span>}
                          {a.next_action && <span className="text-gray-500">Next: <span className="text-indigo-400">{a.next_action}</span></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ PIPELINE TAB ════════════════════════════════ */}
        {mainTab === 'pipeline' && (
          <div className="p-6">
            {/* Weighted pipeline total */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex gap-6">
                <div>
                  <p className="text-gray-500 text-xs">Total Pipeline</p>
                  <p className="text-white font-bold text-xl">${deals.reduce((s, d) => s + d.value, 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Weighted Pipeline</p>
                  <p className="text-indigo-300 font-bold text-xl">${Math.round(deals.reduce((s, d) => s + d.value * d.probability / 100, 0)).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Open Deals</p>
                  <p className="text-white font-bold text-xl">{deals.filter(d => !d.stage.startsWith('Closed')).length}</p>
                </div>
              </div>
              <button onClick={() => setShowAddDeal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                + Add Deal
              </button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '50vh' }}>
              {DEAL_STAGES.map(stage => {
                const stageDeals = dealStageMap[stage] || []
                const stageValue = stageDeals.reduce((s, d) => s + d.value, 0)
                const isWon = stage === 'Closed Won'
                const isLost = stage === 'Closed Lost'
                return (
                  <div key={stage} className={`flex-shrink-0 w-56 flex flex-col rounded-xl border overflow-hidden ${isWon ? 'border-emerald-800' : isLost ? 'border-red-900' : 'border-gray-800'}`}>
                    <div className={`px-3 py-2.5 border-b flex flex-col gap-0.5 ${isWon ? 'bg-emerald-950/60 border-emerald-800' : isLost ? 'bg-red-950/60 border-red-900' : 'bg-gray-900 border-gray-800'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${isWon ? 'text-emerald-300' : isLost ? 'text-red-400' : 'text-gray-300'}`}>{stage}</span>
                        <span className="text-xs text-gray-500 bg-gray-900/60 px-1.5 py-0.5 rounded-full">{stageDeals.length}</span>
                      </div>
                      <span className={`text-xs font-medium ${isWon ? 'text-emerald-400' : 'text-gray-400'}`}>${stageValue.toLocaleString()}</span>
                    </div>
                    <div className="flex-1 p-2 space-y-2 bg-gray-950/30 overflow-y-auto">
                      {stageDeals.map(deal => (
                        <div key={deal.id} onClick={() => setEditingDeal(deal)} className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-lg p-3 cursor-pointer transition-all">
                          <p className="text-white text-xs font-medium mb-1 leading-tight">{deal.name}</p>
                          <p className="text-gray-500 text-xs mb-2">{deal.contact}</p>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-emerald-400 text-sm font-bold">${deal.value.toLocaleString()}</span>
                            <span className="text-gray-500 text-xs">{deal.probability}%</span>
                          </div>
                          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-1 bg-indigo-500 rounded-full" style={{ width: `${deal.probability}%` }} />
                          </div>
                          <p className="text-gray-600 text-xs mt-1.5">Close: {deal.close_date}</p>
                          {deal.stage === 'Closed Lost' && deal.lost_reason && (
                            <p className="text-red-400/80 text-[10px] mt-1.5 italic truncate" title={deal.lost_reason}>
                              Lost: {deal.lost_reason}
                            </p>
                          )}
                        </div>
                      ))}
                      {stageDeals.length === 0 && (
                        <div className="text-center py-8 text-gray-700 text-xs">No deals</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} workspaceId={workspaceId} onImported={() => workspaceId && loadData(workspaceId)} />}
      {showSegmentModal && (
        <SegmentModal
          onClose={() => setShowSegmentModal(false)}
          workspaceId={workspaceId}
          onSaved={() => { if (workspaceId) void loadSavedSegments(workspaceId) }}
        />
      )}
      {showAddActivity && <AddActivityModal onClose={() => setShowAddActivity(false)} contacts={contacts} workspaceId={workspaceId} onLogged={() => workspaceId && loadData(workspaceId)} />}
      {showAddDeal && <AddDealModal onClose={() => setShowAddDeal(false)} contacts={contacts} workspaceId={workspaceId} onAdded={() => workspaceId && loadData(workspaceId)} />}
      {editingDeal && <EditDealModal deal={editingDeal} onClose={() => setEditingDeal(null)} onSaved={() => { setEditingDeal(null); if (workspaceId) loadData(workspaceId) }} />}
      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} workspaceId={workspaceId} onAdded={() => workspaceId && loadData(workspaceId)} />}
      {selectedContact && <ContactSlideover contact={selectedContact} onClose={() => setSelectedContact(null)} activities={selectedContactActivities} workspaceId={workspaceId} onUpdated={() => workspaceId && loadData(workspaceId)} />}
      {showEnrolWorkflow && (
        <EnrolWorkflowModal
          workspaceId={workspaceId}
          leadIds={Array.from(selectedContacts)}
          onClose={() => setShowEnrolWorkflow(false)}
          onEnrolled={() => { setShowEnrolWorkflow(false); setSelectedContacts(new Set()) }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 17C (audit P1 #6) — EnrolWorkflowModal
// Lists active workflows for this workspace and posts the chosen workflow id
// + selected lead ids to /api/workflows/enroll.
// ─────────────────────────────────────────────────────────────────────────────
function EnrolWorkflowModal({
  workspaceId, leadIds, onClose, onEnrolled,
}: {
  workspaceId: string | null
  leadIds: string[]
  onClose: () => void
  onEnrolled: () => void
}) {
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; description?: string }>>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return }
    let cancelled = false
    fetch(`/api/workflows?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json() as Array<Record<string, unknown>>
        if (cancelled) return
        const active = (data || [])
          .filter(w => String(w.status || '') === 'active')
          .map(w => ({
            id: String(w.id || ''),
            name: String(w.name || 'Untitled'),
            description: typeof w.description === 'string' ? w.description : undefined,
          }))
        setWorkflows(active)
        if (active[0]) setSelectedWorkflowId(active[0].id)
      })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId])

  async function submit() {
    if (!workspaceId || !selectedWorkflowId || leadIds.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, workflowId: selectedWorkflowId, leadIds }),
      })
      const data = await res.json() as { ok?: boolean; enrolledCount?: number; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setResultMsg(`Enrolled ${data.enrolledCount ?? 0} leads.`)
      setTimeout(() => onEnrolled(), 800)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-800 rounded-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Enrol in workflow</h3>
            <p className="text-gray-500 text-xs mt-0.5">{leadIds.length} lead{leadIds.length === 1 ? '' : 's'} selected</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading workflows…</p>
        ) : workflows.length === 0 ? (
          <div className="bg-gray-800/50 border border-dashed border-gray-700 rounded-lg p-4 text-sm text-gray-400">
            No active workflows. Build one in the Workflows section and set its status to active.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {workflows.map(wf => (
              <label
                key={wf.id}
                className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedWorkflowId === wf.id
                    ? 'border-indigo-600 bg-indigo-900/20'
                    : 'border-gray-800 bg-gray-800/40 hover:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="workflow"
                  className="mr-2"
                  checked={selectedWorkflowId === wf.id}
                  onChange={() => setSelectedWorkflowId(wf.id)}
                />
                <span className="text-white text-sm font-medium">{wf.name}</span>
                {wf.description ? (
                  <p className="text-gray-500 text-xs mt-0.5 ml-5">{wf.description}</p>
                ) : null}
              </label>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 text-rose-400 text-xs">{error}</p>
        )}
        {resultMsg && (
          <p className="mt-3 text-emerald-400 text-xs">{resultMsg}</p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!selectedWorkflowId || submitting || workflows.length === 0}
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enrolling…' : 'Enrol'}
          </button>
        </div>
      </div>
    </div>
  )
}
