'use client'

import { useState, useEffect } from 'react'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_SUBSCRIBERS = [
  { id: '1', email: 'alex.morgan@techcorp.com', name: 'Alex Morgan', lists: ['Newsletter', 'Leads'], tags: ['hot-lead', 'trial'], engagement: 92, status: 'subscribed', date: '2026-01-15' },
  { id: '2', email: 'sarah.chen@startup.io', name: 'Sarah Chen', lists: ['Newsletter'], tags: ['customer'], engagement: 78, status: 'subscribed', date: '2026-02-03' },
  { id: '3', email: 'james.wilson@example.com', name: 'James Wilson', lists: ['Leads', 'Promotions'], tags: ['cold-lead'], engagement: 24, status: 'subscribed', date: '2026-02-20' },
  { id: '4', email: 'priya.patel@ventures.co', name: 'Priya Patel', lists: ['Newsletter'], tags: ['vip', 'customer'], engagement: 97, status: 'subscribed', date: '2026-03-01' },
  { id: '5', email: 'mike.torres@agency.com', name: 'Mike Torres', lists: ['Leads'], tags: ['warm-lead'], engagement: 55, status: 'subscribed', date: '2026-03-14' },
  { id: '6', email: 'linda.hayes@corp.net', name: 'Linda Hayes', lists: ['Newsletter', 'Promotions'], tags: ['customer'], engagement: 63, status: 'subscribed', date: '2026-03-28' },
  { id: '7', email: 'dan.foster@media.io', name: 'Dan Foster', lists: ['Newsletter'], tags: [], engagement: 11, status: 'unsubscribed', date: '2026-04-05' },
  { id: '8', email: 'nora.kim@design.co', name: 'Nora Kim', lists: ['Leads'], tags: ['hot-lead', 'trial'], engagement: 88, status: 'subscribed', date: '2026-04-12' },
  { id: '9', email: 'oliver.grant@saas.com', name: 'Oliver Grant', lists: ['Newsletter'], tags: ['customer'], engagement: 71, status: 'subscribed', date: '2026-04-19' },
  { id: '10', email: 'bounce@invalid.xyz', name: '', lists: [], tags: [], engagement: 0, status: 'bounced', date: '2026-04-22' },
]

const MOCK_CAMPAIGNS = [
  { id: 'c1', name: 'May Product Launch', sent: 2400, openRate: 34.2, clickRate: 8.7, revenue: 4820, date: 'May 10, 2026' },
  { id: 'c2', name: 'Spring Promotion — 20% Off', sent: 3100, openRate: 28.5, clickRate: 6.2, revenue: 7340, date: 'Apr 28, 2026' },
  { id: 'c3', name: 'Feature Announcement: AI Reports', sent: 2400, openRate: 41.8, clickRate: 12.4, revenue: 2100, date: 'Apr 15, 2026' },
  { id: 'c4', name: 'Welcome New Trial Users', sent: 890, openRate: 62.3, clickRate: 24.1, revenue: 980, date: 'Apr 02, 2026' },
]

const MOCK_TEMPLATES = [
  { id: 't1', name: 'Welcome Email', category: 'Onboarding', color: 'from-indigo-600 to-violet-600', uses: 142 },
  { id: 't2', name: 'Monthly Newsletter', category: 'Newsletter', color: 'from-blue-600 to-cyan-600', uses: 89 },
  { id: 't3', name: 'Product Announcement', category: 'Announcement', color: 'from-emerald-600 to-teal-600', uses: 67 },
  { id: 't4', name: 'Flash Sale Promo', category: 'Promotional', color: 'from-orange-600 to-red-600', uses: 54 },
  { id: 't5', name: 'Re-engagement Win-back', category: 'Retention', color: 'from-pink-600 to-rose-600', uses: 31 },
  { id: 't6', name: 'Abandoned Cart Recovery', category: 'Ecommerce', color: 'from-yellow-600 to-amber-600', uses: 28 },
  { id: 't7', name: 'Review Request', category: 'Post-purchase', color: 'from-lime-600 to-green-600', uses: 19 },
  { id: 't8', name: 'Event Invitation', category: 'Events', color: 'from-sky-600 to-indigo-600', uses: 12 },
]

const MOCK_FLOWS = [
  { id: 'f1', name: 'Welcome Series', trigger: 'Subscribes to list', steps: 5, status: 'active', enrolled: 234, revenue: 3200 },
  { id: 'f2', name: 'Abandoned Cart', trigger: 'Abandons checkout', steps: 3, status: 'active', enrolled: 89, revenue: 6750 },
  { id: 'f3', name: 'Win-back / Re-engagement', trigger: '90 days no open', steps: 4, status: 'active', enrolled: 312, revenue: 1890 },
  { id: 'f4', name: 'Post-purchase Thank You', trigger: 'Makes purchase', steps: 3, status: 'active', enrolled: 156, revenue: 2340 },
  { id: 'f5', name: 'Lead Nurture', trigger: 'Subscribes to lead magnet', steps: 7, status: 'paused', enrolled: 445, revenue: 5120 },
  { id: 'f6', name: 'Birthday Offer', trigger: 'Date-based (birthday)', steps: 2, status: 'draft', enrolled: 0, revenue: 0 },
]

const TRIGGER_OPTIONS = ['Subscribes to list', 'Makes purchase', 'Opens email', 'Clicks link', 'Date-based', 'Custom event']

const BLOCKS = ['Header / Logo', 'Hero Image', 'Text Block', 'CTA Button', 'Product Grid', 'Social Links', 'Divider', 'Footer']

// 30-day trend data
const TREND_DAYS = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  opens: Math.floor(60 + Math.random() * 120),
  clicks: Math.floor(15 + Math.random() * 40),
  revenue: Math.floor(80 + Math.random() * 300),
}))

// Best send time heatmap (hour 6-22, day 0-6)
const HEATMAP = Array.from({ length: 7 }, (_, d) =>
  Array.from({ length: 17 }, (_, h) => ({
    day: d, hour: h + 6,
    score: d === 0 || d === 6 ? Math.floor(5 + Math.random() * 30) : Math.floor(20 + Math.random() * 80),
  }))
)
const DAYS_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-2.5 flex flex-col">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-white font-bold text-lg leading-tight">{value}</span>
      {sub && <span className="text-emerald-400 text-xs">{sub}</span>}
    </div>
  )
}

function EngagementBar({ score }: { score: number }) {
  const level = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold'
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-600'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs ${score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-yellow-400' : 'text-gray-500'}`}>{level}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailMarketingPage() {
  const [tab, setTab] = useState<'dashboard' | 'subscribers' | 'templates' | 'automations' | 'analytics'>('dashboard')
  const [connected] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [provider, setProvider] = useState('klaviyo')
  const [apiKey, setApiKey] = useState('kl_prod_••••••••••••••••••••••••••••••••')
  const [showApiKey, setShowApiKey] = useState(false)
  const [fromName, setFromName] = useState('Ooumph Team')
  const [fromEmail, setFromEmail] = useState('hello@ooumph.co')
  const [replyTo, setReplyTo] = useState('support@ooumph.co')
  const [testConn, setTestConn] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [copied, setCopied] = useState(false)

  // Subscribers tab
  const [subSearch, setSubSearch] = useState('')
  const [subStatus, setSubStatus] = useState('all')
  const [selectedSub, setSelectedSub] = useState<typeof MOCK_SUBSCRIBERS[0] | null>(null)

  // Templates tab
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [blockText, setBlockText] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('My Template')

  // Automations tab
  const [showFlowBuilder, setShowFlowBuilder] = useState(false)
  const [flowTrigger, setFlowTrigger] = useState(TRIGGER_OPTIONS[0])
  const [flowSteps, setFlowSteps] = useState(['Email 1: Introduction', 'Wait 3 days', 'Email 2: Follow-up'])
  const [flows, setFlows] = useState(MOCK_FLOWS)

  // Analytics tab
  const [subjectInput, setSubjectInput] = useState('')
  const [subjectScore, setSubjectScore] = useState<{ score: number; tips: string[] } | null>(null)
  const [analyzingSubject, setAnalyzingSubject] = useState(false)

  const WEBHOOK_URL = 'https://app.ooumph.co/webhooks/email/track/abc123xyz'

  function handleTestConnection() {
    setTestConn('testing')
    setTimeout(() => setTestConn('ok'), 1400)
  }

  function handleCopyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function analyzeSubjectLine() {
    if (!subjectInput.trim()) return
    setAnalyzingSubject(true)
    setTimeout(() => {
      const len = subjectInput.length
      let score = 60
      if (len > 30 && len < 60) score += 15
      if (subjectInput.includes('?')) score += 8
      if (subjectInput.match(/\d/)) score += 7
      if (subjectInput.toLowerCase().includes('you')) score += 5
      score = Math.min(99, score)
      setSubjectScore({
        score,
        tips: [
          score < 75 ? 'Add a number to boost open rates (e.g. "5 ways to…")' : 'Great length — under 60 chars is ideal',
          subjectInput.includes('?') ? 'Good use of a question to spark curiosity' : 'Try framing as a question to engage readers',
          'Personalize with {{first_name}} for +12% avg open rate',
          'Avoid spam words like "FREE", "URGENT", or excessive caps',
        ],
      })
      setAnalyzingSubject(false)
    }, 900)
  }

  function addFlowStep() {
    setFlowSteps(s => [...s, `Email ${Math.ceil((s.length + 1) / 2)}: New step`])
  }

  const filteredSubs = MOCK_SUBSCRIBERS.filter(s => {
    const matchStatus = subStatus === 'all' || s.status === subStatus
    const matchSearch = !subSearch || s.email.includes(subSearch) || s.name.toLowerCase().includes(subSearch.toLowerCase())
    return matchStatus && matchSearch
  })

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  const maxOpens = Math.max(...TREND_DAYS.map(d => d.opens))
  const maxClicks = Math.max(...TREND_DAYS.map(d => d.clicks))

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Marketing</h1>
          <div className="flex items-center gap-3 mt-1">
            {connected
              ? <span className="text-emerald-400 text-sm font-medium">Klaviyo Connected</span>
              : <span className="text-yellow-400 text-sm font-medium">Not Connected — Connect Provider</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatChip label="Subscribers" value="2,847" sub="+124 this month" />
          <StatChip label="Open Rate" value="36.4%" sub="+2.1% vs last mo" />
          <StatChip label="Click Rate" value="9.2%" />
          <StatChip label="Revenue" value="$24,130" sub="attributed" />
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
          >
            Provider Settings
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {(['dashboard', 'subscribers', 'templates', 'automations', 'analytics'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Empty-state banner ── */}
      <div className="mb-6 bg-indigo-950/30 border border-indigo-900/60 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-xl">📧</span>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">Connect your email provider to see real data here.</p>
          <p className="text-gray-400 text-xs mt-0.5">Add your Klaviyo or ActiveCampaign API key in <button onClick={() => setShowSettings(true)} className="text-indigo-400 hover:underline">Provider Settings</button> to start syncing subscribers, campaigns, and analytics. The values below are sample placeholders.</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: DASHBOARD
      ══════════════════════════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <div className="space-y-8">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Subscribers', value: '2,847', delta: '+4.5%', pos: true },
              { label: 'New This Month', value: '124', delta: '+18%', pos: true },
              { label: 'Unsubscribes', value: '14', delta: '-3', pos: true },
              { label: 'Open Rate', value: '36.4%', delta: '+2.1%', pos: true },
              { label: 'Click Rate', value: '9.2%', delta: '+0.8%', pos: true },
              { label: 'Bounce Rate', value: '1.4%', delta: '-0.2%', pos: true },
              { label: 'Revenue Attributed', value: '$24,130', delta: '+12%', pos: true },
              { label: 'Deliverability Score', value: '97/100', delta: 'Excellent', pos: true },
            ].map(k => (
              <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                <p className="text-white text-xl font-bold">{k.value}</p>
                <span className={`text-xs ${k.pos ? 'text-emerald-400' : 'text-red-400'}`}>{k.delta}</span>
              </div>
            ))}
          </div>

          {/* Performance Trend */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">30-Day Performance Trend</h3>
            <div className="flex gap-4 mb-3">
              {[{ label: 'Opens', color: 'bg-indigo-500' }, { label: 'Clicks', color: 'bg-emerald-500' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-sm ${l.color}`} />
                  <span className="text-gray-400 text-xs">{l.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-0.5 h-28">
              {TREND_DAYS.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                    <div className="bg-indigo-600/70 rounded-t-sm w-full" style={{ height: `${(d.opens / maxOpens) * 100}%` }} title={`Opens: ${d.opens}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>Day 1</span><span>Day 15</span><span>Day 30</span>
            </div>
          </div>

          {/* Top Campaigns Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">Top Campaigns</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Campaign', 'Sent', 'Open Rate', 'Click Rate', 'Revenue'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_CAMPAIGNS.map(c => (
                  <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-white text-sm font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{c.sent.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className="text-emerald-400 text-sm font-medium">{c.openRate}%</span>
                    </td>
                    <td className="px-5 py-3 text-indigo-400 text-sm">{c.clickRate}%</td>
                    <td className="px-5 py-3 text-white text-sm">${c.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Subscriber Growth + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Growth chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Subscriber Growth (Last 6 Months)</h3>
              <div className="flex items-end gap-2 h-24">
                {[2100, 2230, 2410, 2560, 2720, 2847].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-indigo-600/80 rounded-t-sm" style={{ height: `${((v - 2000) / 900) * 100}%` }} />
                    <span className="text-gray-600 text-xs">{['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'][i]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-gray-500 text-xs">2,847 total subscribers</span>
              </div>
              {/* Simulated line */}
              <div className="mt-4 flex items-center gap-1">
                {[2100, 2230, 2410, 2560, 2720, 2847].map((v, i, arr) => (
                  <div key={i} className="flex-1 flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-gray-900" title={String(v)} />
                    {i < arr.length - 1 && <div className="flex-1 h-px bg-emerald-600/40" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {[
                  { icon: 'U', color: 'bg-emerald-600', text: 'Alex Morgan subscribed via lead magnet', time: '2 min ago' },
                  { icon: 'S', color: 'bg-indigo-600', text: 'Campaign sent to 2,400 contacts — "May Product Launch"', time: '1 hr ago' },
                  { icon: 'C', color: 'bg-yellow-600', text: 'Nora Kim clicked a link in Win-back email', time: '3 hr ago' },
                  { icon: 'U', color: 'bg-emerald-600', text: 'Oliver Grant subscribed via checkout form', time: '5 hr ago' },
                  { icon: 'X', color: 'bg-red-700', text: 'Dan Foster unsubscribed', time: 'Yesterday' },
                  { icon: 'F', color: 'bg-violet-600', text: 'Welcome Series flow enrolled 12 new contacts', time: 'Yesterday' },
                ].map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full ${a.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>{a.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 text-sm">{a.text}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: SUBSCRIBERS
      ══════════════════════════════════════════════════════════ */}
      {tab === 'subscribers' && (
        <div className="space-y-6">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-semibold text-lg">2,847 Subscribers</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 text-xs border border-emerald-800">+124 this month</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors">
                Import CSV
              </button>
              <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
                Sync from CRM
              </button>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={subSearch}
              onChange={e => setSubSearch(e.target.value)}
              placeholder="Search email or name..."
              className="w-64 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
              {['all', 'subscribed', 'unsubscribed', 'bounced'].map(s => (
                <button
                  key={s}
                  onClick={() => setSubStatus(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${subStatus === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Main content: table + lists/tags panel */}
          <div className="flex gap-6">
            {/* Subscriber table */}
            <div className="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Subscriber', 'Lists', 'Tags', 'Engagement', 'Date', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.map(sub => (
                    <tr key={sub.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => setSelectedSub(sub)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(sub.name || sub.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium leading-tight">{sub.name || '—'}</p>
                            <p className="text-gray-500 text-xs">{sub.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sub.lists.map(l => (
                            <span key={l} className="px-1.5 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">{l}</span>
                          ))}
                          {sub.lists.length === 0 && <span className="text-gray-600 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sub.tags.slice(0, 2).map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-xs bg-indigo-900/40 border border-indigo-800/40 text-indigo-300">{t}</span>
                          ))}
                          {sub.tags.length > 2 && <span className="text-gray-600 text-xs">+{sub.tags.length - 2}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <EngagementBar score={sub.engagement} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{sub.date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${
                          sub.status === 'subscribed' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800' :
                          sub.status === 'bounced' ? 'bg-red-900/40 text-red-300 border-red-800' :
                          'bg-gray-800 text-gray-400 border-gray-700'
                        }`}>{sub.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-gray-800 text-right text-gray-600 text-xs">
                Showing {filteredSubs.length} of 2,847 subscribers
              </div>
            </div>

            {/* Lists & Tags mini panel */}
            <div className="w-56 space-y-4 flex-shrink-0">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white text-sm font-semibold">Lists</h4>
                  <button className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">+ Create</button>
                </div>
                <div className="space-y-2">
                  {[
                    { name: 'Newsletter', count: 2100, growth: '+3.2%' },
                    { name: 'Leads', count: 560, growth: '+8.1%' },
                    { name: 'Promotions', count: 890, growth: '+1.4%' },
                    { name: 'Customers', count: 412, growth: '+5.7%' },
                  ].map(l => (
                    <div key={l.name} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                      <span className="text-gray-300 text-xs">{l.name}</span>
                      <div className="text-right">
                        <p className="text-white text-xs font-medium">{l.count.toLocaleString()}</p>
                        <p className="text-emerald-400 text-xs">{l.growth}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white text-sm font-semibold">Tags</h4>
                  <button className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">+ Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { tag: 'hot-lead', count: 89 }, { tag: 'vip', count: 34 }, { tag: 'customer', count: 412 },
                    { tag: 'warm-lead', count: 156 }, { tag: 'trial', count: 234 }, { tag: 'cold-lead', count: 310 },
                  ].map(t => (
                    <button key={t.tag} className="px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-300 hover:border-indigo-600 transition-colors">
                      {t.tag} <span className="text-gray-500">{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: TEMPLATES
      ══════════════════════════════════════════════════════════ */}
      {tab === 'templates' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">Email Templates</h2>
            <button
              onClick={() => setShowTemplateBuilder(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Create Template
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {MOCK_TEMPLATES.map(t => (
              <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
                <div className={`h-32 bg-gradient-to-br ${t.color} flex flex-col items-center justify-center p-4`}>
                  <div className="w-full max-w-[120px] space-y-1.5">
                    <div className="h-2 bg-white/30 rounded-sm w-3/4 mx-auto" />
                    <div className="h-8 bg-white/20 rounded-sm w-full" />
                    <div className="h-1.5 bg-white/20 rounded-sm w-full" />
                    <div className="h-1.5 bg-white/20 rounded-sm w-5/6" />
                    <div className="h-5 bg-white/40 rounded-sm w-1/2 mx-auto mt-1" />
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white text-sm font-medium">{t.name}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">{t.category}</span>
                    <span className="text-gray-600 text-xs">{t.uses} uses</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">Use</button>
                    <button className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">Preview</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: AUTOMATIONS
      ══════════════════════════════════════════════════════════ */}
      {tab === 'automations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">Email Automation Flows</h2>
            <button
              onClick={() => setShowFlowBuilder(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Create Flow
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {flows.map(flow => (
              <div key={flow.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-white font-semibold">{flow.name}</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Trigger: {flow.trigger}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs border flex-shrink-0 ${
                    flow.status === 'active' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800' :
                    flow.status === 'paused' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800' :
                    'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>{flow.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-800 rounded-lg p-2.5 text-center">
                    <p className="text-gray-500 text-xs">Steps</p>
                    <p className="text-white font-bold text-base">{flow.steps}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2.5 text-center">
                    <p className="text-gray-500 text-xs">Enrolled</p>
                    <p className="text-white font-bold text-base">{flow.enrolled.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2.5 text-center">
                    <p className="text-gray-500 text-xs">Revenue</p>
                    <p className="text-white font-bold text-base">${flow.revenue.toLocaleString()}</p>
                  </div>
                </div>
                {/* Mini flow visualization */}
                <div className="flex items-center gap-1 overflow-hidden">
                  {Array.from({ length: flow.steps }).map((_, i) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'
                      }`}>{i + 1}</div>
                      {i < flow.steps - 1 && <div className="w-4 h-px bg-gray-700" />}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setFlows(f => f.map(fl => fl.id === flow.id ? { ...fl, status: fl.status === 'active' ? 'paused' : 'active' } : fl))}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                  >
                    {flow.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">Edit Flow</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: ANALYTICS
      ══════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <div className="space-y-8">
          {/* Campaign Performance Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold">Campaign Performance</h3>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(MOCK_CAMPAIGNS, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'email_report.json'; a.click()
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
              >
                Generate Report
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Campaign', 'Sent', 'Open Rate', 'Click Rate', 'Revenue', 'Date'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_CAMPAIGNS.map(c => (
                  <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-white text-sm font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{c.sent.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.openRate}%` }} />
                        </div>
                        <span className="text-emerald-400 text-sm">{c.openRate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-indigo-400 text-sm">{c.clickRate}%</td>
                    <td className="px-5 py-3 text-white text-sm">${c.revenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-500 text-sm">{c.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A/B Test Results */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">A/B Test Results</h3>
            <div className="space-y-4">
              {[
                { name: 'Subject Line Test — May Launch', varA: { name: 'Variant A: "Introducing our biggest update"', rate: 28.4 }, varB: { name: 'Variant B: "You asked, we built it"', rate: 41.2 }, winner: 'B', lift: '+45%' },
                { name: 'Send Time Test — April Newsletter', varA: { name: 'Variant A: Tuesday 9am', rate: 31.1 }, varB: { name: 'Variant B: Thursday 2pm', rate: 36.8 }, winner: 'B', lift: '+18%' },
              ].map((test, i) => (
                <div key={i} className="border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white text-sm font-medium">{test.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-900/40 text-emerald-300 text-xs border border-emerald-800">Winner: Variant {test.winner}</span>
                      <span className="text-emerald-400 text-xs font-medium">{test.lift} lift</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[test.varA, test.varB].map((v, vi) => (
                      <div key={vi} className={`p-3 rounded-lg border ${vi === (test.winner === 'B' ? 1 : 0) ? 'border-emerald-700 bg-emerald-900/10' : 'border-gray-700 bg-gray-800'}`}>
                        <p className="text-gray-400 text-xs mb-1">{v.name}</p>
                        <p className="text-white font-bold text-lg">{v.rate}%</p>
                        <p className="text-gray-500 text-xs">open rate</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject Line Analyzer */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-2">Subject Line Analyzer</h3>
            <p className="text-gray-500 text-sm mb-4">Enter any subject line to get an AI-powered score and optimization tips</p>
            <div className="flex gap-3 mb-4">
              <input
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyzeSubjectLine()}
                placeholder="Type a subject line to analyze..."
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={analyzeSubjectLine}
                disabled={analyzingSubject || !subjectInput.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {analyzingSubject ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
            {subjectScore && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-xl">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4 flex-shrink-0 ${
                    subjectScore.score >= 80 ? 'border-emerald-500 text-emerald-400' :
                    subjectScore.score >= 60 ? 'border-yellow-500 text-yellow-400' : 'border-red-500 text-red-400'
                  }`}>{subjectScore.score}</div>
                  <div>
                    <p className="text-white font-semibold">Score: {subjectScore.score}/100</p>
                    <p className="text-gray-400 text-sm">{subjectScore.score >= 80 ? 'Excellent subject line' : subjectScore.score >= 60 ? 'Good, room to improve' : 'Needs optimization'}</p>
                    <div className="w-32 h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full ${subjectScore.score >= 80 ? 'bg-emerald-500' : subjectScore.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${subjectScore.score}%` }} />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-gray-800 rounded-xl space-y-2">
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Optimization Tips</p>
                  {subjectScore.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      <p className="text-gray-300 text-sm">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Best Send Time Heatmap */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Best Send Time Heatmap</h3>
            <p className="text-gray-500 text-xs mb-4">Open rate by day and hour (darker = higher open rate)</p>
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex gap-1 mb-1 ml-8">
                  {Array.from({ length: 17 }, (_, h) => (
                    <div key={h} className="w-7 text-center text-gray-600 text-xs">{h + 6}h</div>
                  ))}
                </div>
                {HEATMAP.map((row, di) => (
                  <div key={di} className="flex gap-1 mb-1 items-center">
                    <div className="w-8 text-gray-500 text-xs text-right pr-1">{DAYS_LABELS[di]}</div>
                    {row.map((cell, hi) => (
                      <div
                        key={hi}
                        className="w-7 h-7 rounded-sm"
                        title={`${DAYS_LABELS[di]} ${cell.hour}:00 — score: ${cell.score}`}
                        style={{ backgroundColor: `rgba(99,102,241,${cell.score / 100})` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-gray-600 text-xs">Low</span>
              <div className="flex gap-0.5">
                {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0].map(o => (
                  <div key={o} className="w-5 h-3 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${o})` }} />
                ))}
              </div>
              <span className="text-gray-600 text-xs">High</span>
            </div>
          </div>

          {/* Deliverability + Engagement Segments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Deliverability Report</h3>
              <div className="space-y-3">
                {[
                  { label: 'Inbox Rate', value: 96.2, color: 'bg-emerald-500' },
                  { label: 'Spam Rate', value: 1.8, color: 'bg-red-500' },
                  { label: 'Soft Bounce Rate', value: 1.1, color: 'bg-yellow-500' },
                  { label: 'Hard Bounce Rate', value: 0.9, color: 'bg-orange-500' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">{item.label}</span>
                      <span className="text-white font-medium">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Subscriber Engagement Segments</h3>
              <div className="space-y-3">
                {[
                  { segment: 'Champions', desc: 'Opened last 3 campaigns', count: 412, color: 'bg-emerald-500', action: 'Reward with exclusive content' },
                  { segment: 'Engaged', desc: 'Active in last 90 days', count: 1290, color: 'bg-indigo-500', action: 'Send feature updates' },
                  { segment: 'At Risk', desc: 'No open in 60 days', count: 634, color: 'bg-yellow-500', action: 'Launch win-back sequence' },
                  { segment: 'Inactive', desc: 'No open in 120+ days', count: 511, color: 'bg-red-500', action: 'Consider sunset policy' },
                ].map(seg => (
                  <div key={seg.segment} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${seg.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{seg.segment}</span>
                        <span className="text-gray-500 text-xs">{seg.desc}</span>
                      </div>
                      <p className="text-indigo-300 text-xs mt-0.5">{seg.action}</p>
                    </div>
                    <span className="text-white font-bold text-sm flex-shrink-0">{seg.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PROVIDER SETTINGS SLIDE-OVER
      ══════════════════════════════════════════════════════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-96 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <h2 className="text-white font-semibold">Provider Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
            </div>
            <div className="p-6 space-y-6">
              {/* Provider selector */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Email Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'klaviyo', label: 'Klaviyo', color: 'text-emerald-400' },
                    { id: 'activecampaign', label: 'ActiveCampaign', color: 'text-blue-400' },
                    { id: 'mailchimp', label: 'Mailchimp', color: 'text-yellow-400' },
                    { id: 'convertkit', label: 'ConvertKit', color: 'text-orange-400' },
                    { id: 'brevo', label: 'Brevo', color: 'text-teal-400' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${provider === p.id ? 'border-indigo-500 bg-indigo-900/30 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}
                    >
                      <span className={p.color}>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className={inputCls + ' flex-1'}
                    placeholder="Enter API key..."
                  />
                  <button onClick={() => setShowApiKey(s => !s)} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button onClick={handleTestConnection} className="mt-2 w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors flex items-center justify-center gap-2">
                  {testConn === 'testing' ? 'Testing...' : testConn === 'ok' ? 'Connected!' : testConn === 'fail' ? 'Connection failed' : 'Test Connection'}
                </button>
                {testConn === 'ok' && <p className="text-emerald-400 text-xs mt-1">API key validated successfully</p>}
              </div>

              {/* Account config */}
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">List ID / Account ID</label>
                  <input className={inputCls} placeholder="e.g. abc123" defaultValue="UmX7kQ" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">From Name</label>
                  <input value={fromName} onChange={e => setFromName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">From Email</label>
                  <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">Reply-to Email</label>
                  <input value={replyTo} onChange={e => setReplyTo(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">Sync Contacts</button>
                <button className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">Test Send</button>
              </div>

              {/* Webhook */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Tracking Webhook URL</label>
                <div className="flex gap-2">
                  <input readOnly value={WEBHOOK_URL} className={inputCls + ' font-mono text-xs flex-1 text-gray-400'} />
                  <button onClick={handleCopyWebhook} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors">
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-gray-600 text-xs mt-1">Add this URL to your provider&apos;s webhook settings</p>
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SUBSCRIBER DETAIL SLIDE-OVER
      ══════════════════════════════════════════════════════════ */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setSelectedSub(null)} />
          <div className="relative w-96 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <h2 className="text-white font-semibold">Subscriber Details</h2>
              <button onClick={() => setSelectedSub(null)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-2xl font-bold">
                  {(selectedSub.name || selectedSub.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">{selectedSub.name || 'Unknown'}</p>
                  <p className="text-gray-400 text-sm">{selectedSub.email}</p>
                  <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs border ${
                    selectedSub.status === 'subscribed' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800' : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>{selectedSub.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-xs">Engagement</p>
                  <p className="text-white font-bold text-xl">{selectedSub.engagement}%</p>
                  <EngagementBar score={selectedSub.engagement} />
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-xs">Subscribed</p>
                  <p className="text-white font-bold text-sm mt-1">{selectedSub.date}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Lists</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSub.lists.length > 0 ? selectedSub.lists.map(l => (
                    <span key={l} className="px-2 py-1 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-300">{l}</span>
                  )) : <span className="text-gray-600 text-xs">No lists</span>}
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSub.tags.length > 0 ? selectedSub.tags.map(t => (
                    <span key={t} className="px-2 py-1 rounded-lg text-xs bg-indigo-900/30 border border-indigo-800/40 text-indigo-300">{t}</span>
                  )) : <span className="text-gray-600 text-xs">No tags</span>}
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Email Activity Timeline</p>
                <div className="space-y-3">
                  {[
                    { action: 'Opened "May Product Launch"', date: 'May 10, 2026', icon: 'O' },
                    { action: 'Clicked CTA in "Spring Promo"', date: 'Apr 28, 2026', icon: 'C' },
                    { action: 'Opened "Feature Announcement"', date: 'Apr 15, 2026', icon: 'O' },
                    { action: 'Subscribed via lead magnet', date: selectedSub.date, icon: 'S' },
                  ].map((ev, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-900/50 border border-indigo-800 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">{ev.icon}</div>
                      <div>
                        <p className="text-gray-300 text-sm">{ev.action}</p>
                        <p className="text-gray-600 text-xs">{ev.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TEMPLATE BUILDER MODAL
      ══════════════════════════════════════════════════════════ */}
      {showTemplateBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-white font-semibold">Template Builder</h2>
                <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex items-center gap-2">
                <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors" onClick={() => setShowTemplateBuilder(false)}>
                  Save Template
                </button>
                <button onClick={() => setShowTemplateBuilder(false)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              {/* Block list */}
              <div className="w-56 border-r border-gray-800 overflow-y-auto flex-shrink-0 p-4">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Email Blocks</p>
                <div className="space-y-1.5">
                  {BLOCKS.map(block => (
                    <button
                      key={block}
                      onClick={() => { setSelectedBlock(block); setBlockText(`${block} content here...`) }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedBlock === block ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                    >
                      {block}
                    </button>
                  ))}
                </div>
              </div>
              {/* Editor */}
              <div className="w-72 border-r border-gray-800 p-4 flex-shrink-0">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Edit Block</p>
                {selectedBlock ? (
                  <div className="space-y-3">
                    <div className="px-3 py-2 rounded-lg bg-indigo-900/30 border border-indigo-800/40 text-indigo-300 text-sm">{selectedBlock}</div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1.5">Content</label>
                      <textarea value={blockText} onChange={e => setBlockText(e.target.value)} rows={5} className={inputCls + ' resize-none'} />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1.5">Link URL</label>
                      <input className={inputCls} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1.5">Background Color</label>
                      <div className="flex gap-2">
                        {['#1f2937', '#111827', '#312e81', '#064e3b', '#1e1b4b'].map(c => (
                          <button key={c} className="w-7 h-7 rounded-lg border border-gray-700 hover:border-white transition-colors" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">Select a block to edit its content</p>
                )}
              </div>
              {/* Preview */}
              <div className="flex-1 p-6 overflow-y-auto bg-gray-950">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-4">Email Preview</p>
                <div className="max-w-sm mx-auto bg-white rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-indigo-700 px-6 py-4 text-center">
                    <p className="text-white font-bold text-lg">Ooumph</p>
                  </div>
                  <div className="bg-gray-100 h-24 flex items-center justify-center">
                    <p className="text-gray-400 text-xs">Hero Image</p>
                  </div>
                  <div className="p-6">
                    <h2 className="text-gray-900 font-bold text-base mb-2">{selectedBlock === 'Text Block' ? blockText : 'Your Headline Here'}</h2>
                    <p className="text-gray-600 text-sm leading-relaxed mb-4">Your email content goes here. Write something compelling that drives your readers to take action.</p>
                    <div className="text-center">
                      <span className="inline-block px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium">
                        {selectedBlock === 'CTA Button' ? blockText : 'Click Here'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-200 px-6 py-3 text-center">
                    <p className="text-gray-500 text-xs">Unsubscribe | View in browser</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          FLOW BUILDER MODAL
      ══════════════════════════════════════════════════════════ */}
      {showFlowBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <h2 className="text-white font-semibold">Create Automation Flow</h2>
              <button onClick={() => setShowFlowBuilder(false)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Trigger</label>
                <select value={flowTrigger} onChange={e => setFlowTrigger(e.target.value)} className={inputCls}>
                  {TRIGGER_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Flow Steps</label>
                  <button onClick={addFlowStep} className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">+ Add Step</button>
                </div>
                <div className="space-y-2">
                  {/* Trigger node */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">T</div>
                    <div className="flex-1 px-3 py-2 rounded-lg bg-indigo-900/30 border border-indigo-800/40 text-indigo-300 text-sm">{flowTrigger}</div>
                  </div>
                  {flowSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 ml-4">
                      <div className="flex flex-col items-center">
                        <div className="w-px h-3 bg-gray-700" />
                        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-bold">{i + 1}</div>
                      </div>
                      <input
                        value={step}
                        onChange={e => setFlowSteps(s => s.map((st, si) => si === i ? e.target.value : st))}
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <button onClick={() => setFlowSteps(s => s.filter((_, si) => si !== i))} className="text-gray-600 hover:text-red-400 text-sm transition-colors">x</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowFlowBuilder(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">Cancel</button>
                <button
                  onClick={() => {
                    setFlows(f => [...f, {
                      id: `f${f.length + 1}`, name: `New Flow — ${flowTrigger}`, trigger: flowTrigger,
                      steps: flowSteps.length, status: 'draft', enrolled: 0, revenue: 0,
                    }])
                    setShowFlowBuilder(false)
                    setFlowSteps(['Email 1: Introduction', 'Wait 3 days', 'Email 2: Follow-up'])
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                >
                  Create Flow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
