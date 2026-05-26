'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  name: string
  industry: string
  plan: string
  healthScore: number
  mrr: number
  contentThisMonth: number
  pendingApprovals: number
  lastActivity: string
  status: 'Active' | 'Onboarding' | 'Paused' | 'At Risk'
  initials: string
  avatarColor: string
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: 'Owner' | 'Admin' | 'Manager' | 'Analyst'
  clients: string[]
  lastActive: string
  status: 'Active' | 'Inactive'
  initials: string
}

interface Invoice {
  id: string
  date: string
  amount: number
  status: 'Paid' | 'Pending' | 'Failed'
}

interface ScheduledReport {
  id: string
  client: string
  frequency: 'Weekly' | 'Monthly'
  nextSend: string
  format: string
  recipients: string
  enabled: boolean
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CLIENTS: Client[] = [
  {
    id: '1', name: 'Acme Corp', industry: 'E-commerce', plan: 'Pro',
    healthScore: 87, mrr: 1499, contentThisMonth: 34, pendingApprovals: 2,
    lastActivity: '2 hours ago', status: 'Active',
    initials: 'AC', avatarColor: 'bg-blue-600',
  },
  {
    id: '2', name: 'NovaTech SaaS', industry: 'SaaS', plan: 'Agency',
    healthScore: 72, mrr: 2499, contentThisMonth: 61, pendingApprovals: 5,
    lastActivity: '1 day ago', status: 'Active',
    initials: 'NT', avatarColor: 'bg-purple-600',
  },
  {
    id: '3', name: 'Green Leaf Bakery', industry: 'Local Business', plan: 'Starter',
    healthScore: 54, mrr: 499, contentThisMonth: 12, pendingApprovals: 0,
    lastActivity: '4 days ago', status: 'At Risk',
    initials: 'GL', avatarColor: 'bg-green-600',
  },
  {
    id: '4', name: 'Harbour Finance', industry: 'Finance', plan: 'Pro',
    healthScore: 91, mrr: 1499, contentThisMonth: 28, pendingApprovals: 1,
    lastActivity: '30 min ago', status: 'Active',
    initials: 'HF', avatarColor: 'bg-cyan-600',
  },
  {
    id: '5', name: 'Bloom Wellness', industry: 'Health', plan: 'Pro',
    healthScore: 38, mrr: 1499, contentThisMonth: 6, pendingApprovals: 0,
    lastActivity: '9 days ago', status: 'At Risk',
    initials: 'BW', avatarColor: 'bg-pink-600',
  },
  {
    id: '6', name: 'UrbanKit Store', industry: 'E-commerce', plan: 'Starter',
    healthScore: 65, mrr: 499, contentThisMonth: 18, pendingApprovals: 3,
    lastActivity: '5 hours ago', status: 'Onboarding',
    initials: 'UK', avatarColor: 'bg-amber-600',
  },
]

const MOCK_TEAM: TeamMember[] = [
  { id: '1', name: 'Jordan Riley', email: 'jordan@youragency.com', role: 'Owner', clients: ['All'], lastActive: 'Now', status: 'Active', initials: 'JR' },
  { id: '2', name: 'Sam Chen', email: 'sam@youragency.com', role: 'Admin', clients: ['Acme Corp', 'NovaTech SaaS'], lastActive: '1 hr ago', status: 'Active', initials: 'SC' },
  { id: '3', name: 'Priya Sharma', email: 'priya@youragency.com', role: 'Manager', clients: ['Green Leaf Bakery', 'Bloom Wellness'], lastActive: '3 hrs ago', status: 'Active', initials: 'PS' },
  { id: '4', name: 'Alex Morgan', email: 'alex@youragency.com', role: 'Analyst', clients: ['Harbour Finance', 'UrbanKit Store'], lastActive: 'Yesterday', status: 'Active', initials: 'AM' },
]

const MOCK_INVOICES: Invoice[] = [
  { id: 'INV-2026-05', date: 'May 1, 2026', amount: 49900, status: 'Paid' },
  { id: 'INV-2026-04', date: 'Apr 1, 2026', amount: 49900, status: 'Paid' },
  { id: 'INV-2026-03', date: 'Mar 1, 2026', amount: 39900, status: 'Paid' },
  { id: 'INV-2026-02', date: 'Feb 1, 2026', amount: 39900, status: 'Paid' },
]

const MOCK_SCHEDULED: ScheduledReport[] = [
  { id: '1', client: 'Acme Corp', frequency: 'Weekly', nextSend: 'Jun 2, 2026', format: 'PDF', recipients: 'ceo@acme.com', enabled: true },
  { id: '2', client: 'NovaTech SaaS', frequency: 'Monthly', nextSend: 'Jun 1, 2026', format: 'PDF', recipients: 'marketing@novatech.io', enabled: true },
  { id: '3', client: 'Harbour Finance', frequency: 'Monthly', nextSend: 'Jun 1, 2026', format: 'PDF', recipients: 'ops@harbour.com', enabled: false },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function healthColor(score: number) {
  if (score >= 75) return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/10' }
  if (score >= 55) return { ring: '#f59e0b', text: 'text-amber-400', bg: 'bg-amber-500/10' }
  return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/10' }
}

function statusColors(status: string) {
  if (status === 'Active') return 'bg-green-500/15 text-green-400 border border-green-500/20'
  if (status === 'Onboarding') return 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
  if (status === 'Paused') return 'bg-gray-700/60 text-gray-400 border border-gray-600/30'
  return 'bg-red-500/15 text-red-400 border border-red-500/20'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const c = healthColor(score)
  const r = 20
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="56" height="56">
        <circle cx="28" cy="28" r={r} stroke="#374151" strokeWidth="4" fill="none" />
        <circle cx="28" cy="28" r={r} stroke={c.ring} strokeWidth="4" fill="none"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span className={`text-xs font-bold z-10 ${c.text}`}>{score}</span>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Add Client Modal ─────────────────────────────────────────────────────────

function AddClientModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', industry: '', contactName: '', email: '',
    plan: 'Pro', sendInvite: true, template: 'Blank',
  })
  function f(k: string, v: string | boolean) { setForm(p => ({ ...p, [k]: v })) }
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Add New Client</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Business Name</label>
            <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Acme Corp"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Industry</label>
            <select value={form.industry} onChange={e => f('industry', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="">Select industry</option>
              {['E-commerce', 'SaaS', 'Local Business', 'Finance', 'Health', 'Real Estate', 'Retail', 'Agency'].map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Contact Name</label>
              <input value={form.contactName} onChange={e => f('contactName', e.target.value)} placeholder="Jane Smith"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Email</label>
              <input value={form.email} onChange={e => f('email', e.target.value)} placeholder="jane@client.com" type="email"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Plan Assignment</label>
            <select value={form.plan} onChange={e => f('plan', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
              {['Starter ($499/mo)', 'Pro ($1,499/mo)', 'Agency ($2,499/mo)', 'Enterprise'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Workspace Template</label>
            <div className="grid grid-cols-3 gap-2">
              {['Blank', 'E-commerce', 'Local Business', 'SaaS', 'Agency'].map(t => (
                <button key={t} onClick={() => f('template', t)}
                  className={`py-2 text-xs rounded-lg border transition-colors ${form.template === t ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-300 text-sm">Send Onboarding Invite</span>
            <button onClick={() => f('sendInvite', !form.sendInvite)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.sendInvite ? 'bg-indigo-600' : 'bg-gray-700'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.sendInvite ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white transition-colors">Cancel</button>
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">Create Client</button>
        </div>
      </div>
    </div>
  )
}

// ─── Invite Team Modal ────────────────────────────────────────────────────────

function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Manager')
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Invite Team Member</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Email Address</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@agency.com" type="email"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
              {['Admin', 'Manager', 'Analyst'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Assign Clients</label>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {MOCK_CLIENTS.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer py-1">
                  <input type="checkbox" className="accent-indigo-500" />
                  <span className="text-gray-300 text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white transition-colors">Cancel</button>
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">Send Invite</button>
        </div>
      </div>
    </div>
  )
}

// ─── Upgrade Plan Modal ───────────────────────────────────────────────────────

function UpgradeModal({ onClose }: { onClose: () => void }) {
  const plans = [
    { name: 'Starter', price: '$499', clients: '3', features: ['15 AI posts/mo', 'Social channels', 'Basic analytics', 'Email support'] },
    { name: 'Pro', price: '$1,499', clients: '5', features: ['50 AI posts/mo', 'All channels', 'Advanced analytics', 'Priority support', 'Campaign manager'] },
    { name: 'Agency', price: '$2,499', clients: '10', features: ['Unlimited posts', 'All channels', 'White-label', 'Team access', 'API access', 'Dedicated CSM'], current: true },
    { name: 'Enterprise', price: 'Custom', clients: 'Unlimited', features: ['Custom limits', 'SSO', 'Custom integrations', 'SLA', 'On-prem option'] },
  ]
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Compare Plans</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {plans.map(p => (
            <div key={p.name} className={`rounded-xl p-4 border ${p.current ? 'border-indigo-500 bg-indigo-500/5' : 'border-gray-800 bg-gray-800/40'}`}>
              {p.current && <div className="text-xs text-indigo-400 font-medium mb-2">Current Plan</div>}
              <h3 className="text-white font-bold mb-1">{p.name}</h3>
              <p className="text-2xl font-bold text-white mb-0.5">{p.price}</p>
              <p className="text-gray-500 text-xs mb-3">{p.clients} clients</p>
              <ul className="space-y-1.5">
                {p.features.map(f => (
                  <li key={f} className="text-gray-400 text-xs flex gap-1.5">
                    <span className="text-green-400 mt-0.5">✓</span>{f}
                  </li>
                ))}
              </ul>
              {!p.current && (
                <button onClick={onClose} className="mt-4 w-full py-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                  {p.name === 'Enterprise' ? 'Contact Sales' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── White-label Slide-over ───────────────────────────────────────────────────

function WhiteLabelSlideOver({ onClose }: { onClose: () => void }) {
  const [agencyName, setAgencyName] = useState('Your Agency')
  const [primary, setPrimary] = useState('#6366f1')
  const [secondary, setSecondary] = useState('#8b5cf6')
  const [domain, setDomain] = useState('')
  const [hidePowered, setHidePowered] = useState(false)
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-96 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">White-label Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-3">Your Brand</h3>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Agency Name</label>
                <input value={agencyName} onChange={e => setAgencyName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Agency Logo</label>
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-gray-500 transition-colors">
                  <p className="text-gray-500 text-xs">Drop logo here or click to upload</p>
                  <p className="text-gray-600 text-xs mt-1">PNG, SVG — 200×60px recommended</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={primary} onChange={e => setPrimary(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                    <input value={primary} onChange={e => setPrimary(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Secondary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                    <input value={secondary} onChange={e => setSecondary(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Custom Domain</label>
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.youragency.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                {domain && (
                  <p className="text-gray-500 text-xs mt-1">Add CNAME record: <code className="text-gray-400">app.ooumph.ai</code></p>
                )}
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-3">Client Experience</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-sm">Hide "Powered by Ooumph"</span>
                <button onClick={() => setHidePowered(!hidePowered)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${hidePowered ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hidePowered ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Email Sender Name</label>
                <input defaultValue={`Reports from ${agencyName}`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              {domain && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Portal URL Preview</p>
                  <code className="text-indigo-300 text-xs">https://{domain}/client/acme-corp</code>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            Save White-label Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function ClientsTab({ onAddClient }: { onAddClient: () => void }) {
  const [filter, setFilter] = useState<'All' | 'Active' | 'Onboarding' | 'At Risk' | 'Paused'>('All')
  const filtered = filter === 'All' ? MOCK_CLIENTS : MOCK_CLIENTS.filter(c => c.status === filter)
  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(['All', 'Active', 'Onboarding', 'At Risk', 'Paused'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}>
            {f}
          </button>
        ))}
        <button onClick={onAddClient} className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Add Client
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(client => {
          const hc = healthColor(client.healthScore)
          const atRisk = client.healthScore < 60
          return (
            <div key={client.id} className={`bg-gray-900 rounded-xl border ${atRisk ? 'border-red-500/40' : 'border-gray-800'} p-4`}>
              {atRisk && (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  At Risk — Health score critical
                </div>
              )}
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl ${client.avatarColor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {client.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-white font-semibold text-sm truncate">{client.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors(client.status)}`}>{client.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded">{client.industry}</span>
                    <span className="text-gray-500 text-xs">{client.plan}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HealthRing score={client.healthScore} />
                  <div>
                    <p className="text-gray-400 text-xs">Health Score</p>
                    <p className={`text-sm font-semibold ${hc.text}`}>{client.healthScore}/100</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-xs">MRR</p>
                  <p className="text-white font-bold">{fmt$(client.mrr * 100)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Content', value: client.contentThisMonth },
                  { label: 'Approvals', value: client.pendingApprovals },
                  { label: 'Active', value: client.lastActivity },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800 rounded-lg p-2 text-center">
                    <p className="text-white text-sm font-semibold">{s.value}</p>
                    <p className="text-gray-500 text-xs">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded-lg font-medium transition-colors">Open Dashboard</button>
                <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded-lg transition-colors">Send Report</button>
                <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">Msg</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReportsTab() {
  const [reportType, setReportType] = useState<'individual' | 'comparative' | 'portfolio'>('individual')
  const [selectedClient, setSelectedClient] = useState('Acme Corp')
  const [showPreview, setShowPreview] = useState(false)
  const [schedules, setSchedules] = useState(MOCK_SCHEDULED)

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Generate Report</h3>
        <div className="flex gap-2 mb-4">
          {([['individual', 'Individual Client'], ['comparative', 'Comparative'], ['portfolio', 'Portfolio Overview']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setReportType(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportType === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {reportType !== 'portfolio' && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Client</label>
              <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                {MOCK_CLIENTS.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Date Range</label>
            <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
              {['Last 7 days', 'Last 30 days', 'Last 90 days', 'This month', 'Last month'].map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setShowPreview(true)} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Generate Report
            </button>
          </div>
        </div>
        {showPreview && reportType === 'individual' && (
          <div className="border border-gray-700 rounded-xl p-5 bg-gray-800/50 mt-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-white font-bold text-lg">{selectedClient}</h4>
                <p className="text-gray-400 text-xs">Performance Report — May 2026</p>
              </div>
              <div className="flex gap-2">
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Download PDF</button>
                <button className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">Email to Client</button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[['Posts', '34'], ['Reach', '84.2K'], ['Engagement', '4.7%'], ['Leads', '128'], ['Revenue', '$12,400']].map(([l, v]) => (
                <div key={l} className="bg-gray-900 rounded-lg p-3 text-center">
                  <p className="text-white font-bold text-lg">{v}</p>
                  <p className="text-gray-500 text-xs">{l}</p>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <p className="text-gray-400 text-xs font-medium mb-2">Content Volume (last 4 weeks)</p>
              <div className="flex items-end gap-1 h-16">
                {[7, 9, 12, 6, 11, 8, 13, 10, 14, 9, 11, 12, 15, 8, 10, 13, 9, 14, 11, 16, 12, 10, 13, 11, 15, 9, 14, 12].map((h, i) => (
                  <div key={i} className="flex-1 bg-indigo-600/60 rounded-t" style={{ height: `${(h / 16) * 100}%` }} />
                ))}
              </div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-3">
              <p className="text-indigo-300 text-xs font-medium mb-1">AI Summary</p>
              <p className="text-gray-300 text-xs leading-relaxed">Your brand saw strong performance this month, with engagement rate up 18% vs prior period. Instagram Reels drove 62% of total reach. Lead volume exceeded targets by 27%.</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs font-medium mb-2">Recommendations</p>
              <ul className="space-y-1">
                {['Double down on Reels — 3x the engagement of static posts', 'Schedule posts between 6–8pm for best reach', 'Launch retargeting campaign to convert warm leads'].map(r => (
                  <li key={r} className="text-gray-400 text-xs flex gap-1.5"><span className="text-green-400">•</span>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {showPreview && reportType === 'portfolio' && (
          <div className="border border-gray-700 rounded-xl overflow-hidden mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800 border-b border-gray-700">
                  {['Client', 'MRR', 'Health', 'Posts', 'Engagement', 'Leads', 'Trend'].map(h => (
                    <th key={h} className="text-left text-gray-400 font-medium px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_CLIENTS.map(c => (
                  <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-white">{fmt$(c.mrr * 100)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${healthColor(c.healthScore).text}`}>{c.healthScore}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{c.contentThisMonth}</td>
                    <td className="px-4 py-3 text-gray-300">{(Math.random() * 4 + 2).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-300">{Math.floor(Math.random() * 100 + 20)}</td>
                    <td className="px-4 py-3">
                      <span className={c.healthScore > 65 ? 'text-green-400' : 'text-red-400'}>
                        {c.healthScore > 65 ? '↑' : '↓'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-800">
                  <td className="px-4 py-3 text-gray-300 font-semibold">Total</td>
                  <td className="px-4 py-3 text-white font-bold">{fmt$(MOCK_CLIENTS.reduce((s, c) => s + c.mrr, 0) * 100)}</td>
                  <td className="px-4 py-3 text-white font-bold">{Math.round(MOCK_CLIENTS.reduce((s, c) => s + c.healthScore, 0) / MOCK_CLIENTS.length)}</td>
                  <td className="px-4 py-3 text-white font-bold">{MOCK_CLIENTS.reduce((s, c) => s + c.contentThisMonth, 0)}</td>
                  <td className="px-4 py-3 text-gray-300">3.8% avg</td>
                  <td className="px-4 py-3 text-white font-bold">462</td>
                  <td className="px-4 py-3 text-green-400 font-bold">↑ +12%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Scheduled Reports</h3>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">+ Add Schedule</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Client', 'Frequency', 'Next Send', 'Format', 'Recipients', 'Active'].map(h => (
                <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => (
              <tr key={s.id} className="border-b border-gray-800/50">
                <td className="py-3 text-white">{s.client}</td>
                <td className="py-3 text-gray-400">{s.frequency}</td>
                <td className="py-3 text-gray-400">{s.nextSend}</td>
                <td className="py-3 text-gray-400">{s.format}</td>
                <td className="py-3 text-gray-500 text-xs">{s.recipients}</td>
                <td className="py-3">
                  <button onClick={() => setSchedules(prev => prev.map(r => r.id === s.id ? { ...r, enabled: !r.enabled } : r))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${s.enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WhiteLabelTab() {
  const [agencyName, setAgencyName] = useState('Your Agency')
  const [primary, setPrimary] = useState('#6366f1')
  const [secondary, setSecondary] = useState('#8b5cf6')
  const [domain, setDomain] = useState('')
  const [hidePowered, setHidePowered] = useState(false)
  const [emailSender, setEmailSender] = useState('Reports from Your Agency')
  const [emailFooter, setEmailFooter] = useState('Your Agency — Powering your marketing.')
  const [welcomeEmail, setWelcomeEmail] = useState('Welcome to Your Agency! We\'re excited to help you grow.\n\nTo get started, log in to your workspace and explore the dashboard.')
  const [onboardingSteps, setOnboardingSteps] = useState([
    'Connect your social accounts',
    'Set up your brand voice',
    'Review your first AI content draft',
    'Schedule your first posts',
    'Invite your team members',
  ])
  function moveStep(i: number, dir: -1 | 1) {
    const s = [...onboardingSteps]
    const [item] = s.splice(i, 1)
    s.splice(i + dir, 0, item)
    setOnboardingSteps(s)
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-4">Your Brand</h3>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Agency Logo</label>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-5 text-center cursor-pointer hover:border-gray-500 transition-colors">
                <p className="text-gray-500 text-sm mb-1">Drop logo here or click to upload</p>
                <p className="text-gray-600 text-xs">PNG, SVG — 200×60px recommended</p>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Agency Name (replaces "Ooumph" in client dashboards)</label>
              <input value={agencyName} onChange={e => setAgencyName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Primary Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={primary} onChange={e => setPrimary(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-gray-700 p-0.5" />
                  <input value={primary} onChange={e => setPrimary(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Secondary Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-gray-700 p-0.5" />
                  <input value={secondary} onChange={e => setSecondary(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Custom Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="app.youragency.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              {domain && (
                <div className="mt-2 bg-gray-800 rounded-lg p-3 text-xs space-y-1">
                  <p className="text-gray-300 font-medium">DNS Setup Required</p>
                  <p className="text-gray-500">Type: <code className="text-gray-300">CNAME</code></p>
                  <p className="text-gray-500">Host: <code className="text-gray-300">{domain.split('.')[0]}</code></p>
                  <p className="text-gray-500">Value: <code className="text-gray-300">app.ooumph.ai</code></p>
                </div>
              )}
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Login Page Background</label>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-gray-500 transition-colors">
                <p className="text-gray-500 text-xs">Upload background image (1920×1080px)</p>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Custom CSS (Advanced)</label>
              <textarea rows={4} placeholder=":root { --brand-primary: #6366f1; }"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-4">Client Experience</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-200 text-sm">Hide "Powered by Ooumph"</p>
                <p className="text-gray-500 text-xs">Clients will only see your brand</p>
              </div>
              <button onClick={() => setHidePowered(!hidePowered)}
                className={`relative w-11 h-6 rounded-full transition-colors ${hidePowered ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hidePowered ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Custom Email Sender Name</label>
              <input value={emailSender} onChange={e => setEmailSender(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Custom Email Footer Text</label>
              <input value={emailFooter} onChange={e => setEmailFooter(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            {domain && (
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400 text-xs mb-1">Client Portal URL Preview</p>
                <code className="text-indigo-300 text-xs">https://{domain}/client/acme-corp</code>
              </div>
            )}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-4">Onboarding</h3>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Welcome Email Text</label>
              <textarea rows={4} value={welcomeEmail} onChange={e => setWelcomeEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Onboarding Checklist (drag to reorder)</label>
              <div className="space-y-1.5">
                {onboardingSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                    <span className="text-gray-600 text-xs font-mono w-4">{i + 1}</span>
                    <span className="text-gray-300 text-xs flex-1">{step}</span>
                    <div className="flex gap-1">
                      {i > 0 && <button onClick={() => moveStep(i, -1)} className="text-gray-600 hover:text-gray-400 text-xs px-1">↑</button>}
                      {i < onboardingSteps.length - 1 && <button onClick={() => moveStep(i, 1)} className="text-gray-600 hover:text-gray-400 text-xs px-1">↓</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Default Workspace Template for New Clients</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                {['Blank', 'E-commerce', 'Local Business', 'SaaS', 'Agency'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
          Save White-label Settings
        </button>
      </div>
    </div>
  )
}

function TeamTab() {
  const [showInvite, setShowInvite] = useState(false)
  const PERMISSIONS = [
    { action: 'View client dashboards', owner: true, admin: true, manager: true, analyst: true },
    { action: 'Edit client settings', owner: true, admin: true, manager: true, analyst: false },
    { action: 'Add/remove clients', owner: true, admin: true, manager: false, analyst: false },
    { action: 'Generate content', owner: true, admin: true, manager: true, analyst: false },
    { action: 'Approve content', owner: true, admin: true, manager: true, analyst: false },
    { action: 'Send reports to clients', owner: true, admin: true, manager: true, analyst: false },
    { action: 'Manage team members', owner: true, admin: true, manager: false, analyst: false },
    { action: 'Billing & plan changes', owner: true, admin: false, manager: false, analyst: false },
    { action: 'White-label settings', owner: true, admin: true, manager: false, analyst: false },
  ]
  return (
    <div className="space-y-6">
      {showInvite && <InviteTeamModal onClose={() => setShowInvite(false)} />}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Team Members</h3>
          <button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">+ Invite Member</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Member', 'Role', 'Clients', 'Last Active', 'Status'].map(h => (
                <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_TEAM.map(m => (
              <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center text-indigo-300 text-xs font-semibold">{m.initials}</div>
                    <div>
                      <p className="text-white font-medium text-sm">{m.name}</p>
                      <p className="text-gray-500 text-xs">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    m.role === 'Owner' ? 'bg-amber-500/15 text-amber-400' :
                    m.role === 'Admin' ? 'bg-red-500/15 text-red-400' :
                    m.role === 'Manager' ? 'bg-blue-500/15 text-blue-400' :
                    'bg-gray-700/60 text-gray-400'
                  }`}>{m.role}</span>
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">{m.clients.join(', ')}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{m.lastActive}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'Active' ? 'bg-green-500/15 text-green-400' : 'bg-gray-700/60 text-gray-400'}`}>{m.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Role Permissions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-400 font-medium px-5 py-3">Permission</th>
                {['Owner', 'Admin', 'Manager', 'Analyst'].map(r => (
                  <th key={r} className="text-center text-gray-400 font-medium px-4 py-3">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  <td className="px-5 py-2.5 text-gray-300">{p.action}</td>
                  {[p.owner, p.admin, p.manager, p.analyst].map((v, j) => (
                    <td key={j} className="px-4 py-2.5 text-center">
                      {v ? <span className="text-green-400">✓</span> : <span className="text-gray-700">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-3">Pending Invitations</h3>
        <div className="text-gray-500 text-sm text-center py-4">No pending invitations</div>
      </div>
    </div>
  )
}

function BillingTab({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-white font-semibold text-lg">Agency Plan</h3>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-full border border-indigo-500/30">Current Plan</span>
            </div>
            <p className="text-3xl font-bold text-white mb-1">$499<span className="text-gray-400 text-base font-normal">/mo</span></p>
            <div className="flex items-center gap-4 mt-3">
              <div>
                <p className="text-gray-500 text-xs mb-1">Client Seats</p>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: '60%' }} />
                  </div>
                  <span className="text-gray-300 text-xs">6 / 10</span>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">AI Posts This Month</p>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: '37%' }} />
                  </div>
                  <span className="text-gray-300 text-xs">185 / 500</span>
                </div>
              </div>
            </div>
          </div>
          <button onClick={onUpgrade} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Upgrade Plan
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {['White-label', 'Custom domain', 'Team access', 'Priority support', 'API access', 'Campaign manager', 'Advanced analytics'].map(f => (
            <span key={f} className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">✓ {f}</span>
          ))}
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Payment Method</h3>
        <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
          <div className="w-10 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center font-bold">VISA</div>
          <p className="text-gray-300 text-sm">•••• •••• •••• 4242</p>
          <p className="text-gray-500 text-xs ml-auto">Expires 09/27</p>
        </div>
        <button className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Manage Billing →</button>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">Invoice History</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Invoice', 'Date', 'Amount', 'Status', 'Download'].map(h => (
                <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_INVOICES.map(inv => (
              <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-5 py-3 text-gray-300 font-mono text-xs">{inv.id}</td>
                <td className="px-5 py-3 text-gray-400">{inv.date}</td>
                <td className="px-5 py-3 text-white">{fmt$(inv.amount)}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === 'Paid' ? 'bg-green-500/15 text-green-400' :
                    inv.status === 'Failed' ? 'bg-red-500/15 text-red-400' :
                    'bg-amber-500/15 text-amber-400'
                  }`}>{inv.status}</span>
                </td>
                <td className="px-5 py-3">
                  <button className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">PDF ↓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'clients' | 'reports' | 'whitelabel' | 'team' | 'billing'

export default function AgencyPage() {
  const [tab, setTab] = useState<Tab>('clients')
  const [showAddClient, setShowAddClient] = useState(false)
  const [showWhiteLabel, setShowWhiteLabel] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)

  const totalMrr = MOCK_CLIENTS.reduce((s, c) => s + c.mrr, 0)
  const avgHealth = Math.round(MOCK_CLIENTS.reduce((s, c) => s + c.healthScore, 0) / MOCK_CLIENTS.length)
  const pendingApprovals = MOCK_CLIENTS.reduce((s, c) => s + c.pendingApprovals, 0)
  const totalContent = MOCK_CLIENTS.reduce((s, c) => s + c.contentThisMonth, 0)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'clients', label: 'Clients' },
    { id: 'reports', label: 'Reports' },
    { id: 'whitelabel', label: 'White-label' },
    { id: 'team', label: 'Team' },
    { id: 'billing', label: 'Billing' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
      {showWhiteLabel && <WhiteLabelSlideOver onClose={() => setShowWhiteLabel(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-full border border-indigo-500/30">Agency Plan — 10 Clients</span>
          </div>
          <p className="text-gray-400 text-sm">Manage clients, reports, white-labeling, and your team.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowWhiteLabel(true)} className="flex items-center gap-2 border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            White-label Settings
          </button>
          <button onClick={() => setShowAddClient(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add Client
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Active Clients" value={MOCK_CLIENTS.filter(c => c.status === 'Active').length} sub={`of ${MOCK_CLIENTS.length} total`} color="text-white" />
        <StatCard label="Total MRR" value={`$${totalMrr.toLocaleString()}`} sub="+8% vs last month" color="text-green-400" />
        <StatCard label="Avg Health Score" value={avgHealth} sub={avgHealth >= 70 ? 'Healthy portfolio' : 'Needs attention'} color={avgHealth >= 70 ? 'text-green-400' : 'text-amber-400'} />
        <StatCard label="Pending Approvals" value={pendingApprovals} sub="across all clients" color={pendingApprovals > 5 ? 'text-amber-400' : 'text-white'} />
        <StatCard label="Content This Month" value={totalContent} sub="posts generated" color="text-indigo-400" />
        <StatCard label="Revenue This Month" value={`$${totalMrr.toLocaleString()}`} sub="recurring" color="text-green-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'clients' && <ClientsTab onAddClient={() => setShowAddClient(true)} />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'whitelabel' && <WhiteLabelTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'billing' && <BillingTab onUpgrade={() => setShowUpgrade(true)} />}
    </div>
  )
}
