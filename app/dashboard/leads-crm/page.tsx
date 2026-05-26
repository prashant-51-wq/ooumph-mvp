'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

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

// ── Mock data ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['bg-indigo-600','bg-purple-600','bg-pink-600','bg-blue-600','bg-emerald-600','bg-orange-600','bg-rose-600','bg-cyan-600']
const STAGES: Stage[] = ['Lead','Prospect','Qualified','Proposal','Customer','Churned']
const RFM_TIERS: RFMTier[] = ['Champion','Loyal','At Risk','Lost','New Customer','Potential Loyalist']

const MOCK_CONTACTS: Contact[] = [
  { id:'c1', name:'Sarah Johnson', email:'sarah@techcorp.io', phone:'+1 415 555 0101', company:'TechCorp', stage:'Customer', score:92, rfm_tier:'Champion', rfm_r:5, rfm_f:5, rfm_m:5, last_activity:'2026-05-25T10:00:00Z', tags:['VIP','Enterprise'], avatar_color:'bg-indigo-600', deal_value:12000, notes:'Key decision maker', created_at:'2026-01-15T09:00:00Z' },
  { id:'c2', name:'Marcus Chen', email:'mchen@innovate.com', phone:'+1 312 555 0202', company:'Innovate LLC', stage:'Proposal', score:78, rfm_tier:'Loyal', rfm_r:4, rfm_f:4, rfm_m:3, last_activity:'2026-05-24T14:30:00Z', tags:['Warm','Mid-market'], avatar_color:'bg-purple-600', deal_value:8500, notes:'Interested in annual plan', created_at:'2026-02-20T11:00:00Z' },
  { id:'c3', name:'Priya Patel', email:'priya@startupx.co', phone:'+91 98765 43210', company:'StartupX', stage:'Qualified', score:65, rfm_tier:'Potential Loyalist', rfm_r:3, rfm_f:3, rfm_m:4, last_activity:'2026-05-22T09:15:00Z', tags:['Startup','High Growth'], avatar_color:'bg-pink-600', deal_value:3200, notes:'Budget decision in Q3', created_at:'2026-03-10T08:00:00Z' },
  { id:'c4', name:'Derek Williams', email:'derek@bigco.net', phone:'+1 212 555 0303', company:'BigCo Inc', stage:'Lead', score:42, rfm_tier:'At Risk', rfm_r:2, rfm_f:3, rfm_m:4, last_activity:'2026-05-10T16:00:00Z', tags:['Cold','Enterprise'], avatar_color:'bg-blue-600', deal_value:25000, notes:'Need re-engagement', created_at:'2026-04-05T10:00:00Z' },
  { id:'c5', name:'Amelia Torres', email:'atorres@creative.agency', phone:'+1 310 555 0404', company:'Creative Agency', stage:'Customer', score:88, rfm_tier:'Champion', rfm_r:5, rfm_f:4, rfm_m:5, last_activity:'2026-05-25T08:45:00Z', tags:['Agency','Referral'], avatar_color:'bg-emerald-600', deal_value:6800, notes:'Great advocate', created_at:'2026-01-28T12:00:00Z' },
  { id:'c6', name:'James Park', email:'jpark@finance.co', phone:'+1 646 555 0505', company:'Finance Co', stage:'Prospect', score:55, rfm_tier:'New Customer', rfm_r:4, rfm_f:1, rfm_m:2, last_activity:'2026-05-18T11:30:00Z', tags:['Finance','Inbound'], avatar_color:'bg-orange-600', deal_value:4500, notes:'Signed up last week', created_at:'2026-05-12T09:00:00Z' },
  { id:'c7', name:'Lena Fischer', email:'lena@eurobiz.de', phone:'+49 30 555 0606', company:'EuroBiz GmbH', stage:'Churned', score:18, rfm_tier:'Lost', rfm_r:1, rfm_f:1, rfm_m:3, last_activity:'2026-03-01T10:00:00Z', tags:['EMEA','Churned'], avatar_color:'bg-rose-600', deal_value:0, notes:'Contract expired', created_at:'2025-11-20T10:00:00Z' },
  { id:'c8', name:'Carlos Mendez', email:'carlos@latam.store', phone:'+52 55 555 0707', company:'LatAm Store', stage:'Qualified', score:71, rfm_tier:'Loyal', rfm_r:4, rfm_f:5, rfm_m:3, last_activity:'2026-05-23T15:00:00Z', tags:['LATAM','Repeat'], avatar_color:'bg-cyan-600', deal_value:5600, notes:'Expanding to 3 markets', created_at:'2026-02-01T10:00:00Z' },
]

const MOCK_ACTIVITIES: Activity[] = [
  { id:'a1', contact_id:'c1', contact_name:'Sarah Johnson', type:'call', title:'Discovery call — great fit', notes:'Discussed Q3 expansion plans', outcome:'Positive', next_action:'Send proposal', timestamp:'2026-05-25T10:00:00Z' },
  { id:'a2', contact_id:'c2', contact_name:'Marcus Chen', type:'email', title:'Proposal sent', notes:'3-year SaaS plan included', outcome:'Sent', next_action:'Follow up in 2 days', timestamp:'2026-05-24T14:30:00Z' },
  { id:'a3', contact_id:'c3', contact_name:'Priya Patel', type:'meeting', title:'Product demo completed', notes:'Showed automation features', outcome:'Interested', next_action:'Budget confirmation call', timestamp:'2026-05-22T09:15:00Z' },
  { id:'a4', contact_id:'c5', contact_name:'Amelia Torres', type:'deal', title:'Deal closed — $6,800', notes:'Annual subscription', outcome:'Won', next_action:'Onboarding call', timestamp:'2026-05-21T16:00:00Z' },
  { id:'a5', contact_id:'c4', contact_name:'Derek Williams', type:'alert', title:'No response — 15 days', notes:'Last email opened but not replied', outcome:'At Risk', next_action:'Send win-back', timestamp:'2026-05-10T16:00:00Z' },
  { id:'a6', contact_id:'c6', contact_name:'James Park', type:'note', title:'Inbound signup from blog post', notes:'Read "AI Marketing" article', outcome:'New', next_action:'Welcome sequence started', timestamp:'2026-05-18T11:30:00Z' },
]

const MOCK_DEALS: Deal[] = [
  { id:'d1', name:'TechCorp Annual Plan', contact:'Sarah Johnson', value:12000, probability:90, stage:'Negotiation', close_date:'2026-06-15', owner:'You' },
  { id:'d2', name:'Innovate Q3 Upgrade', contact:'Marcus Chen', value:8500, probability:65, stage:'Proposal', close_date:'2026-06-30', owner:'You' },
  { id:'d3', name:'StartupX Starter Plan', contact:'Priya Patel', value:3200, probability:50, stage:'Qualification', close_date:'2026-07-20', owner:'You' },
  { id:'d4', name:'BigCo Enterprise License', contact:'Derek Williams', value:25000, probability:20, stage:'Prospecting', close_date:'2026-08-31', owner:'You' },
  { id:'d5', name:'Finance Co Pro Plan', contact:'James Park', value:4500, probability:75, stage:'Proposal', close_date:'2026-06-10', owner:'You' },
]

const MOCK_SEGMENTS: Segment[] = [
  { id:'s1', name:'Champions (RFM 555)', count:47, last_updated:'2026-05-25', performance:'AOV $1,240 · 94% retention', conditions:[{field:'rfm_r',operator:'>=',value:'5'},{field:'rfm_f',operator:'>=',value:'5'},{field:'rfm_m',operator:'>=',value:'4'}], type:'builtin' },
  { id:'s2', name:'At Risk (RFM 2xx)', count:31, last_updated:'2026-05-24', performance:'AOV $420 · dropping', conditions:[{field:'rfm_r',operator:'<=',value:'2'}], type:'builtin' },
  { id:'s3', name:'New Customers (RFM x1x)', count:58, last_updated:'2026-05-23', performance:'AOV $180 · onboarding', conditions:[{field:'rfm_f',operator:'=',value:'1'}], type:'builtin' },
  { id:'s4', name:'High Value Prospects', count:22, last_updated:'2026-05-22', performance:'Avg deal $8.5k', conditions:[{field:'score',operator:'>=',value:'70'},{field:'stage',operator:'=',value:'Qualified'}], type:'builtin' },
]

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
function ContactSlideover({ contact, onClose, activities }: { contact: Contact; onClose: () => void; activities: Activity[] }) {
  const [note, setNote] = useState('')
  const [editStage, setEditStage] = useState(contact.stage)
  const contactActivities = activities.filter(a => a.contact_id === contact.id)

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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Stage</label>
              <select value={editStage} onChange={e => setEditStage(e.target.value as Stage)} className={selectCls}>
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
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Type a note..." className={inputCls} />
              <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0">+</button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-800 p-4 flex gap-2 flex-shrink-0">
          <button className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">📧 Email</button>
          <button className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">📞 Call</button>
          <button className="px-3 py-2 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 rounded-lg text-sm transition-colors">Send to CMO</button>
        </div>
      </div>
    </div>
  )
}

// ── CSV Import Modal ───────────────────────────────────────────────────────────
function CSVImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string,string>>({})
  const [duplicate, setDuplicate] = useState<'skip'|'update'|'create'>('skip')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
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
      const rows = text.split('\n').slice(0, 6).map(r => r.split(',').map(c => c.replace(/"/g, '').trim()))
      setPreview(rows)
      const headers = rows[0] || []
      const auto: Record<string,string> = {}
      headers.forEach(h => {
        const low = h.toLowerCase()
        if (low.includes('name')) auto[h] = 'name'
        else if (low.includes('email')) auto[h] = 'email'
        else if (low.includes('phone')) auto[h] = 'phone'
        else if (low.includes('company') || low.includes('org')) auto[h] = 'company'
        else auto[h] = '-- ignore --'
      })
      setMapping(auto)
    }
    reader.readAsText(f)
  }

  function doImport() {
    setImporting(true)
    setTimeout(() => { setImporting(false); setImported(true) }, 1800)
  }

  if (imported) return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">✅</div>
        <h3 className="text-white font-semibold text-lg mb-2">Import Complete</h3>
        <p className="text-gray-400 text-sm mb-1">247 contacts imported successfully</p>
        <p className="text-gray-500 text-xs mb-6">3 duplicates skipped · 0 errors</p>
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

              {/* Field mapping */}
              {preview[0] && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Map CSV columns to CRM fields</p>
                  <div className="space-y-2">
                    {preview[0].map(header => (
                      <div key={header} className="flex items-center gap-3">
                        <span className="text-gray-300 text-sm w-40 truncate">{header}</span>
                        <span className="text-gray-600">→</span>
                        <select
                          value={mapping[header] || '-- ignore --'}
                          onChange={e => setMapping(m => ({...m, [header]: e.target.value}))}
                          className={selectCls + ' flex-1'}
                        >
                          {CRM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
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

              {importing && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Importing contacts...</span>
                    <span>73%</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-2 bg-indigo-500 rounded-full animate-pulse" style={{ width: '73%' }} />
                  </div>
                </div>
              )}

              <button
                onClick={doImport}
                disabled={importing}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {importing ? 'Importing...' : `Import ${preview.length > 1 ? `~${(preview.length - 1) * 50}` : ''} contacts`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Segment Rule Builder Modal ────────────────────────────────────────────────
function SegmentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [logic, setLogic] = useState<'AND'|'OR'>('AND')
  const [conditions, setConditions] = useState([{ field: 'score', operator: '>=', value: '70' }])

  const FIELDS = ['score','stage','rfm_tier','company','tags','last_activity','deal_value']
  const OPERATORS = ['=','!=','>=','<=','contains','not contains']

  function addCondition() {
    setConditions(c => [...c, { field: 'score', operator: '>=', value: '' }])
  }

  const matchCount = Math.floor(Math.random() * 80) + 10

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">Create Segment</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Segment Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-Value At-Risk" className={inputCls} />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Match</span>
            <div className="flex">
              {(['AND','OR'] as const).map(l => (
                <button key={l} onClick={() => setLogic(l)} className={`px-4 py-1.5 text-sm border transition-colors first:rounded-l-lg last:rounded-r-lg ${logic === l ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>{l}</button>
              ))}
            </div>
            <span className="text-gray-400 text-sm">of the following conditions</span>
          </div>

          <div className="space-y-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={cond.field} onChange={e => setConditions(cs => cs.map((c,j) => j===i ? {...c, field:e.target.value} : c))} className={selectCls + ' flex-1'}>
                  {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={cond.operator} onChange={e => setConditions(cs => cs.map((c,j) => j===i ? {...c, operator:e.target.value} : c))} className={selectCls + ' w-28'}>
                  {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input value={cond.value} onChange={e => setConditions(cs => cs.map((c,j) => j===i ? {...c, value:e.target.value} : c))} className={inputCls + ' w-24'} placeholder="value" />
                {conditions.length > 1 && (
                  <button onClick={() => setConditions(cs => cs.filter((_,j) => j!==i))} className="text-gray-600 hover:text-red-400 text-sm">✕</button>
                )}
              </div>
            ))}
          </div>

          <button onClick={addCondition} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">+ Add condition</button>

          <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg px-4 py-3">
            <p className="text-indigo-300 text-sm">This segment matches <span className="font-bold">{matchCount} contacts</span></p>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Create Segment</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Activity Modal ─────────────────────────────────────────────────────────
function AddActivityModal({ onClose, contacts }: { onClose: () => void; contacts: Contact[] }) {
  const [type, setType] = useState<ActivityType>('call')
  const [contactId, setContactId] = useState(contacts[0]?.id || '')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState('')
  const [nextAction, setNextAction] = useState('')

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
            <div className="grid grid-cols-3 gap-2">
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
          <div className="grid grid-cols-2 gap-3">
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
            <button onClick={onClose} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Log Activity</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Deal Modal ─────────────────────────────────────────────────────────────
function AddDealModal({ onClose, contacts }: { onClose: () => void; contacts: Contact[] }) {
  const [form, setForm] = useState({ name:'', contact: contacts[0]?.name || '', value:'', probability:'50', stage:'Prospecting', close_date:'' })

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
            <button onClick={onClose} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Add Deal</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Contact Modal ──────────────────────────────────────────────────────────
function AddContactModal({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Contact) => void }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', company:'', stage:'Lead' as Stage, notes:'' })

  function submit() {
    if (!form.name || !form.email) return
    const newContact: Contact = {
      id: `c${Date.now()}`,
      ...form,
      score: 30,
      rfm_tier: 'New Customer',
      rfm_r: 4, rfm_f: 1, rfm_m: 1,
      last_activity: new Date().toISOString(),
      tags: [],
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      deal_value: 0,
      created_at: new Date().toISOString(),
    }
    onAdd(newContact)
    onClose()
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
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white">Cancel</button>
            <button onClick={submit} disabled={!form.name || !form.email} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">Add Contact</button>
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
  const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS)
  const [activities] = useState<Activity[]>(MOCK_ACTIVITIES)
  const [deals] = useState<Deal[]>(MOCK_DEALS)
  const [segments] = useState<Segment[]>(MOCK_SEGMENTS)

  const [mainTab, setMainTab] = useState<MainTab>('contacts')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<string>('all')

  const [showImport, setShowImport] = useState(false)
  const [showSegmentModal, setShowSegmentModal] = useState(false)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showAddDeal, setShowAddDeal] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase())
  )

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
  const conversionRate = Math.round((contacts.filter(c => c.stage === 'Customer').length / contacts.length) * 100)
  const churnRisk = contacts.filter(c => c.rfm_tier === 'At Risk' || c.rfm_tier === 'Lost').length

  // ── Kanban drag ───────────────────────────────────────────────────────────
  function handleKanbanDrop(stage: Stage) {
    if (!kanbanDragId) return
    setContacts(cs => cs.map(c => c.id === kanbanDragId ? { ...c, stage } : c))
    setKanbanDragId(null)
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

  const dealStageMap: Record<string, Deal[]> = {}
  DEAL_STAGES.forEach(s => { dealStageMap[s] = deals.filter(d => d.stage === s) })

  const filteredActivities = activityFilter === 'all' ? activities : activities.filter(a => a.type === activityFilter)

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

      {/* ── Stats Bar ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-px bg-gray-800 border-b border-gray-800 flex-shrink-0">
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

        {/* ═══════════════ CONTACTS TAB ════════════════════════════════ */}
        {mainTab === 'contacts' && (
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
                            <button className="p-1.5 bg-gray-800 hover:bg-red-900/40 rounded text-xs text-gray-600 hover:text-red-400" onClick={() => setContacts(cs => cs.filter(x => x.id !== c.id))} title="Delete">✕</button>
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
                {['Email Selected','Add Tag','Change Stage','Export','Delete'].map(action => (
                  <button key={action} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${action === 'Delete' ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                    {action}
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
              {/* RFM Grid */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">RFM Segment Grid</h3>
                <div className="mb-3 flex justify-between text-xs text-gray-500">
                  <span>← Frequency →</span>
                  <span>F1 → F5</span>
                </div>
                <div className="space-y-2">
                  {['High Recency (R5-R4)', 'Mid Recency (R3)', 'Low Recency (R2-R1)'].map((rowLabel, ri) => (
                    <div key={ri}>
                      <div className="text-xs text-gray-600 mb-1.5">{rowLabel}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {RFM_GRID[ri].map((cell, ci) => (
                          <div key={ci} className={`${cell.color} border rounded-lg p-3 text-center cursor-pointer hover:opacity-80 transition-opacity`}>
                            <p className="text-xs text-gray-300 font-medium leading-tight mb-1">{cell.label}</p>
                            <p className="text-xl font-bold text-white">{cell.count}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
                  {[
                    { tier:'Champion', count:47, aov:'$1,240', recency:3, action:'Reward & ask for referrals', tierKey:'Champion' as RFMTier },
                    { tier:'Loyal', count:38, aov:'$820', recency:12, action:'Upsell to higher plan', tierKey:'Loyal' as RFMTier },
                    { tier:'Potential Loyalist', count:29, aov:'$480', recency:18, action:'Loyalty program invite', tierKey:'Potential Loyalist' as RFMTier },
                    { tier:'At Risk', count:31, aov:'$420', recency:45, action:'Re-engagement campaign', tierKey:'At Risk' as RFMTier },
                    { tier:'Lost', count:19, aov:'$220', recency:120, action:'Win-back offer', tierKey:'Lost' as RFMTier },
                    { tier:'New Customer', count:58, aov:'$180', recency:5, action:'Onboarding sequence', tierKey:'New Customer' as RFMTier },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${RFM_COLORS[row.tierKey]}`}>{row.tier}</span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{row.count}</td>
                      <td className="px-4 py-3 text-emerald-400 font-medium">{row.aov}</td>
                      <td className="px-4 py-3 text-gray-300">{row.recency}d</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{row.action}</td>
                    </tr>
                  ))}
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
                        <div key={deal.id} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-3 cursor-pointer transition-all">
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
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} />}
      {showSegmentModal && <SegmentModal onClose={() => setShowSegmentModal(false)} />}
      {showAddActivity && <AddActivityModal onClose={() => setShowAddActivity(false)} contacts={contacts} />}
      {showAddDeal && <AddDealModal onClose={() => setShowAddDeal(false)} contacts={contacts} />}
      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} onAdd={c => setContacts(cs => [c, ...cs])} />}
      {selectedContact && <ContactSlideover contact={selectedContact} onClose={() => setSelectedContact(null)} activities={activities} />}
    </div>
  )
}
