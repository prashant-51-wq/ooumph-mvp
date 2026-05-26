'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadTab = 'plan' | 'capture' | 'feed' | 'integrations'
type LeadFilter = 'all' | 'hot' | 'warm' | 'cold' | 'unqualified'

interface Tactic {
  id: string
  action: string
  owner: string
  status: 'Not Started' | 'In Progress' | 'Done'
  deadline: string
}

interface LeadPlan {
  name: string
  goal: string
  status: 'Active' | 'Draft' | 'Completed'
  lastUpdatedBy: string
  summary: string[]
  channels: string[]
  tactics: Tactic[]
  createdAt: string
}

interface PastPlan {
  id: string
  date: string
  goal: string
  result: number
  status: string
}

interface Lead {
  id: string
  name: string
  company: string
  email: string
  source: string
  sourceIcon: string
  score: number
  time: string
  tagged: boolean
}

interface ScoringRule {
  id: string
  condition: string
  points: number
  type: 'add' | 'subtract'
}

interface Integration {
  id: string
  name: string
  icon: string
  status: 'Connected' | 'Disconnected'
  leadsImported: number
  lastSync: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ACTIVE_PLAN: LeadPlan = {
  name: 'Q2 2026 Lead Generation Strategy',
  goal: 'Generate 500 MQLs in 30 days',
  status: 'Active',
  lastUpdatedBy: 'CMO Agent',
  summary: [
    'Focus on LinkedIn + Content as primary inbound channels to attract B2B SaaS decision-makers',
    'Run targeted Google & Meta ads with lead magnet as the primary conversion offer',
    'Launch weekly webinar series to qualify prospects and build pipeline',
    'Activate cold email outreach to 200 ICP companies per week using personalized sequences',
  ],
  channels: ['Content', 'Email', 'LinkedIn Ads', 'SEO', 'Webinar', 'Cold Outreach'],
  tactics: [
    { id: '1', action: 'Publish 3x SEO blog posts targeting "AI marketing tools" keywords', owner: 'Content Agent', status: 'Done', deadline: 'Jun 1' },
    { id: '2', action: 'Launch LinkedIn lead gen form campaign with free template offer', owner: 'Ads Agent', status: 'In Progress', deadline: 'Jun 5' },
    { id: '3', action: 'Build and publish lead magnet landing page with Klaviyo integration', owner: 'Funnel Agent', status: 'Done', deadline: 'Jun 3' },
    { id: '4', action: 'Set up 7-email nurture sequence for all new opt-ins', owner: 'Email Agent', status: 'In Progress', deadline: 'Jun 7' },
    { id: '5', action: 'Source 500 ICP contacts for cold email campaign', owner: 'Outreach Agent', status: 'Not Started', deadline: 'Jun 10' },
    { id: '6', action: 'Host live webinar: "AI Marketing in 2026" with 200-attendee target', owner: 'Events Agent', status: 'Not Started', deadline: 'Jun 20' },
    { id: '7', action: 'Optimize Google Ads keyword bids for lead gen campaign', owner: 'Ads Agent', status: 'In Progress', deadline: 'Jun 8' },
  ],
  createdAt: '2026-05-24',
}

const PAST_PLANS: PastPlan[] = [
  { id: '1', date: 'Q1 2026', goal: 'Generate 300 MQLs in 30 days', result: 347, status: 'Completed' },
  { id: '2', date: 'Dec 2025', goal: 'Generate 200 MQLs in 30 days', result: 189, status: 'Completed' },
  { id: '3', date: 'Oct 2025', goal: 'Generate 150 MQLs — holiday push', result: 201, status: 'Completed' },
]

const CAPTURE_METHODS = [
  { id: 'forms', name: 'Forms', icon: '📋', status: true, leads: 1240, convRate: 24.4 },
  { id: 'landing', name: 'Landing Pages', icon: '🌐', status: true, leads: 3820, convRate: 12.1 },
  { id: 'chat', name: 'Chat Widget', icon: '💬', status: false, leads: 0, convRate: 0 },
  { id: 'email', name: 'Email Opt-in', icon: '📧', status: true, leads: 890, convRate: 31.2 },
]

const INITIAL_SCORING_RULES: ScoringRule[] = [
  { id: '1', condition: 'Email opened', points: 5, type: 'add' },
  { id: '2', condition: 'Visited pricing page', points: 20, type: 'add' },
  { id: '3', condition: 'Downloaded whitepaper', points: 15, type: 'add' },
  { id: '4', condition: 'Started free trial', points: 40, type: 'add' },
  { id: '5', condition: 'Attended webinar', points: 25, type: 'add' },
  { id: '6', condition: 'Clicked email CTA', points: 10, type: 'add' },
  { id: '7', condition: 'Unsubscribed', points: 50, type: 'subtract' },
  { id: '8', condition: 'Inactive 30 days', points: 20, type: 'subtract' },
]

const MOCK_LEADS: Lead[] = [
  { id: '1', name: 'Sarah Chen', company: 'Acme Corp', email: 'sarah@acme.com', source: 'LinkedIn', sourceIcon: 'in', score: 88, time: '2 min ago', tagged: false },
  { id: '2', name: 'Marcus Williams', company: 'GrowthLabs', email: 'marcus@growthlabs.io', source: 'Meta Ad', sourceIcon: 'f', score: 74, time: '8 min ago', tagged: false },
  { id: '3', name: 'Priya Patel', company: 'SaaSify', email: 'priya@saasify.co', source: 'Organic', sourceIcon: 'G', score: 92, time: '14 min ago', tagged: false },
  { id: '4', name: 'James O\'Brien', company: 'Startup Hub', email: 'james@startuphub.com', source: 'Webinar', sourceIcon: '🎙', score: 61, time: '22 min ago', tagged: false },
  { id: '5', name: 'Elena Kozlov', company: 'TechScale', email: 'elena@techscale.com', source: 'Cold Email', sourceIcon: '📧', score: 45, time: '1 hr ago', tagged: false },
  { id: '6', name: 'David Park', company: 'DataVibe', email: 'david@datavibe.io', source: 'Referral', sourceIcon: '🔗', score: 81, time: '2 hrs ago', tagged: false },
  { id: '7', name: 'Amara Osei', company: 'Momentum Co', email: 'amara@momentumco.com', source: 'LinkedIn', sourceIcon: 'in', score: 29, time: '3 hrs ago', tagged: false },
  { id: '8', name: 'Tom Bergmann', company: 'Flex Digital', email: 'tom@flexdigital.de', source: 'Google Ad', sourceIcon: 'G', score: 67, time: '5 hrs ago', tagged: false },
  { id: '9', name: 'Yuki Tanaka', company: 'LaunchPad', email: 'yuki@launchpad.jp', source: 'Organic', sourceIcon: 'G', score: 95, time: '6 hrs ago', tagged: false },
  { id: '10', name: 'Carlos Rivera', company: 'VentureX', email: 'carlos@venturex.co', source: 'Meta Ad', sourceIcon: 'f', score: 18, time: '8 hrs ago', tagged: false },
]

const INTEGRATIONS: Integration[] = [
  { id: '1', name: 'Facebook Lead Ads', icon: 'f', status: 'Connected', leadsImported: 1240, lastSync: '5 min ago' },
  { id: '2', name: 'LinkedIn Lead Gen Forms', icon: 'in', status: 'Connected', leadsImported: 890, lastSync: '2 hrs ago' },
  { id: '3', name: 'Google Ads', icon: 'G', status: 'Connected', leadsImported: 560, lastSync: '1 hr ago' },
  { id: '4', name: 'Typeform', icon: 'T', status: 'Disconnected', leadsImported: 0, lastSync: '—' },
  { id: '5', name: 'Calendly', icon: '📅', status: 'Disconnected', leadsImported: 0, lastSync: '—' },
  { id: '6', name: 'Drift / Intercom', icon: '💬', status: 'Disconnected', leadsImported: 0, lastSync: '—' },
]

// ─── Lead Plan Tab ────────────────────────────────────────────────────────────

function LeadPlanTab() {
  const [plan, setPlan] = useState<LeadPlan>(ACTIVE_PLAN)
  const [tactics, setTactics] = useState<Tactic[]>(ACTIVE_PLAN.tactics)
  const [deployed, setDeployed] = useState(false)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [generateParams, setGenerateParams] = useState({ targetLeads: 500, budget: 5000, industry: 'SaaS', timeframe: 30 })
  const [generating, setGenerating] = useState(false)

  async function deployToCMO() {
    setDeployed(true)
    setTimeout(() => setDeployed(false), 4000)
  }

  function updateTacticStatus(id: string, status: Tactic['status']) {
    setTactics(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function generateNewPlan() {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2400))
    const generated: LeadPlan = {
      ...plan,
      name: `${generateParams.timeframe}-Day ${generateParams.industry} Lead Generation Sprint`,
      goal: `Generate ${generateParams.targetLeads} MQLs in ${generateParams.timeframe} days`,
      status: 'Draft',
      lastUpdatedBy: 'CMO Agent',
      summary: [
        `Target ${generateParams.targetLeads} MQLs with $${generateParams.budget.toLocaleString()} budget across paid and organic channels`,
        `Focus on ${generateParams.industry} decision-makers using intent-based targeting`,
        'Combine top-of-funnel content with bottom-of-funnel conversion campaigns',
        'Weekly performance reviews and budget reallocation based on ROAS data',
      ],
      createdAt: new Date().toISOString().split('T')[0],
    }
    setPlan(generated)
    setTactics(ACTIVE_PLAN.tactics.map(t => ({ ...t, status: 'Not Started' })))
    setGenerating(false)
    setShowGenerateForm(false)
  }

  const done = tactics.filter(t => t.status === 'Done').length
  const progress = Math.round((done / tactics.length) * 100)

  return (
    <div className="space-y-6">
      {/* Active Plan */}
      <div className="bg-gray-900 border border-indigo-800 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-white font-bold text-lg">{plan.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.status === 'Active' ? 'bg-green-400/10 text-green-400' : plan.status === 'Draft' ? 'bg-amber-400/10 text-amber-400' : 'bg-gray-500/10 text-gray-500'}`}>
                {plan.status}
              </span>
            </div>
            <p className="text-indigo-400 text-sm font-medium">{plan.goal}</p>
            <p className="text-gray-500 text-xs mt-1">Last updated by: <span className="text-gray-400">{plan.lastUpdatedBy}</span></p>
          </div>
          <button onClick={deployToCMO}
            className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${deployed ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
            {deployed ? '✓ Deployed to CMO!' : 'Deploy to CMO'}
          </button>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Plan Progress</span>
            <span className="text-white font-medium">{done}/{tactics.length} tactics complete</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div style={{ width: `${progress}%` }} className="bg-indigo-600 h-2 rounded-full transition-all" />
          </div>
        </div>

        {/* Channels */}
        <div className="mb-4">
          <p className="text-gray-500 text-xs mb-2 font-medium">Channels</p>
          <div className="flex flex-wrap gap-2">
            {plan.channels.map(c => (
              <span key={c} className="text-xs px-2.5 py-1 bg-indigo-600/20 border border-indigo-700 text-indigo-300 rounded-full">{c}</span>
            ))}
          </div>
        </div>

        {/* Strategy Summary */}
        <div className="mb-5">
          <p className="text-gray-500 text-xs mb-2 font-medium uppercase tracking-wide">Strategy Summary</p>
          <ul className="space-y-1.5">
            {plan.summary.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                <span className="text-indigo-400 mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tactics */}
        <div>
          <p className="text-gray-500 text-xs mb-3 font-medium uppercase tracking-wide">Tactics</p>
          <div className="space-y-2">
            {tactics.map((t, i) => (
              <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${t.status === 'Done' ? 'border-green-800/50 bg-green-900/10' : 'border-gray-800 bg-gray-800/50'}`}>
                <span className="text-gray-500 text-xs font-mono mt-0.5 w-4 shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${t.status === 'Done' ? 'text-gray-400 line-through' : 'text-white'}`}>{t.action}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-gray-600 text-xs">{t.owner}</span>
                    <span className="text-gray-700 text-xs">·</span>
                    <span className="text-gray-600 text-xs">Due {t.deadline}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={t.status} onChange={e => updateTacticStatus(t.id, e.target.value as Tactic['status'])}
                    className={`text-xs px-2 py-1 rounded border focus:outline-none ${t.status === 'Done' ? 'bg-green-900/30 border-green-700 text-green-400' : t.status === 'In Progress' ? 'bg-amber-900/30 border-amber-700 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                    <option>Not Started</option>
                    <option>In Progress</option>
                    <option>Done</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Generate New Plan */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm">Generate New Plan</h3>
          <button onClick={() => setShowGenerateForm(v => !v)}
            className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
            {showGenerateForm ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {showGenerateForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Target Leads/Month</label>
                <input type="number" value={generateParams.targetLeads} onChange={e => setGenerateParams(p => ({ ...p, targetLeads: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Budget (USD)</label>
                <input type="number" value={generateParams.budget} onChange={e => setGenerateParams(p => ({ ...p, budget: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Industry / Niche</label>
                <select value={generateParams.industry} onChange={e => setGenerateParams(p => ({ ...p, industry: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                  <option>SaaS</option>
                  <option>E-commerce</option>
                  <option>Agency</option>
                  <option>Consulting</option>
                  <option>Health & Wellness</option>
                  <option>Finance</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Timeframe</label>
                <div className="flex gap-2">
                  {[30, 60, 90].map(d => (
                    <button key={d} onClick={() => setGenerateParams(p => ({ ...p, timeframe: d }))}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${generateParams.timeframe === d ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={generateNewPlan} disabled={generating}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              {generating ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating Plan...</>
              ) : 'Generate Lead Plan'}
            </button>
          </div>
        )}
      </div>

      {/* Plan History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Plan History</h3>
        <div className="space-y-2">
          {PAST_PLANS.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
              <div>
                <p className="text-gray-300 text-sm font-medium">{p.date}</p>
                <p className="text-gray-500 text-xs">{p.goal}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-green-400 text-sm font-semibold">{p.result} leads</p>
                  <p className="text-gray-600 text-xs">{p.status}</p>
                </div>
                <button className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors">Restore</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Lead Capture Tab ─────────────────────────────────────────────────────────

function LeadCaptureTab() {
  const [methods, setMethods] = useState(CAPTURE_METHODS)
  const [rules, setRules] = useState<ScoringRule[]>(INITIAL_SCORING_RULES)
  const [showAddRule, setShowAddRule] = useState(false)
  const [newRule, setNewRule] = useState({ condition: '', points: 10, type: 'add' as 'add' | 'subtract' })
  const [scoringUpdated, setScoringUpdated] = useState(false)

  function toggleMethod(id: string) {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, status: !m.status } : m))
  }

  function addRule() {
    if (!newRule.condition) return
    setRules(prev => [...prev, { id: Date.now().toString(), ...newRule }])
    setNewRule({ condition: '', points: 10, type: 'add' })
    setShowAddRule(false)
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id))
  }

  async function runScoringUpdate() {
    setScoringUpdated(true)
    setTimeout(() => setScoringUpdated(false), 3000)
  }

  return (
    <div className="space-y-6">
      {/* Capture Methods */}
      <div>
        <h3 className="text-white font-semibold text-sm mb-3">Lead Capture Methods</h3>
        <div className="grid grid-cols-2 gap-4">
          {methods.map(m => (
            <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{m.icon}</span>
                  <p className="text-white font-medium text-sm">{m.name}</p>
                </div>
                <button onClick={() => toggleMethod(m.id)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${m.status ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${m.status ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <p className="text-white text-sm font-semibold">{m.leads > 0 ? m.leads.toLocaleString() : '—'}</p>
                  <p className="text-gray-500 text-xs">Leads</p>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${m.convRate > 0 ? 'text-green-400' : 'text-gray-500'}`}>{m.convRate > 0 ? `${m.convRate}%` : '—'}</p>
                  <p className="text-gray-500 text-xs">Conv. Rate</p>
                </div>
              </div>
              <button className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Configure</button>
            </div>
          ))}
        </div>
      </div>

      {/* Lead Scoring */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm">Lead Scoring Rules</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowAddRule(v => !v)}
              className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-600 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">
              + Add Rule
            </button>
            <button onClick={runScoringUpdate}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${scoringUpdated ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
              {scoringUpdated ? '✓ Scoring Updated' : 'Run Scoring Update'}
            </button>
          </div>
        </div>

        {showAddRule && (
          <div className="mb-4 p-3 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-gray-500 text-xs block mb-1">Condition</label>
                <input value={newRule.condition} onChange={e => setNewRule(p => ({ ...p, condition: e.target.value }))}
                  placeholder="e.g. Clicked pricing page"
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 text-white text-xs rounded-lg focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1">Points</label>
                <input type="number" value={newRule.points} onChange={e => setNewRule(p => ({ ...p, points: parseInt(e.target.value) }))}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 text-white text-xs rounded-lg focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div className="flex gap-2">
              {(['add', 'subtract'] as const).map(t => (
                <button key={t} onClick={() => setNewRule(p => ({ ...p, type: t }))}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${newRule.type === t ? t === 'add' ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-red-900/30 border-red-700 text-red-400' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                  {t === 'add' ? '+ Add Points' : '- Subtract Points'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddRule(false)} className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors">Cancel</button>
              <button onClick={addRule} disabled={!newRule.condition} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">Add Rule</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg group">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${r.type === 'add' ? 'text-green-400' : 'text-red-400'}`}>
                  {r.type === 'add' ? '+' : '-'}{r.points}
                </span>
                <span className="text-gray-300 text-sm">IF: {r.condition}</span>
              </div>
              <button onClick={() => removeRule(r.id)}
                className="text-gray-600 hover:text-red-400 transition-colors text-sm opacity-0 group-hover:opacity-100">
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Lead Feed Tab ────────────────────────────────────────────────────────────

function LeadFeedTab() {
  const [filter, setFilter] = useState<LeadFilter>('all')
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS)

  const filtered = leads.filter(l => {
    if (filter === 'all') return true
    if (filter === 'hot') return l.score >= 70
    if (filter === 'warm') return l.score >= 40 && l.score < 70
    if (filter === 'cold') return l.score >= 20 && l.score < 40
    if (filter === 'unqualified') return l.score < 20
    return true
  })

  function tagLead(id: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, tagged: !l.tagged } : l))
  }

  function dismissLead(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  function scoreColor(score: number) {
    if (score >= 70) return 'bg-green-400/10 text-green-400 border-green-700'
    if (score >= 40) return 'bg-amber-400/10 text-amber-400 border-amber-700'
    return 'bg-red-400/10 text-red-400 border-red-700'
  }

  const filterCounts = {
    all: leads.length,
    hot: leads.filter(l => l.score >= 70).length,
    warm: leads.filter(l => l.score >= 40 && l.score < 70).length,
    cold: leads.filter(l => l.score >= 20 && l.score < 40).length,
    unqualified: leads.filter(l => l.score < 20).length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-gray-800 rounded-lg">
          {([
            { id: 'all', label: 'All' },
            { id: 'hot', label: 'Hot' },
            { id: 'warm', label: 'Warm' },
            { id: 'cold', label: 'Cold' },
            { id: 'unqualified', label: 'Unqualified' },
          ] as const).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === f.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {f.label} <span className="ml-1 text-[10px] opacity-60">{filterCounts[f.id]}</span>
            </button>
          ))}
        </div>
        <button className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg hover:bg-gray-700 transition-colors">Export All</button>
      </div>

      <div className="space-y-2">
        {filtered.map(lead => (
          <div key={lead.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-600/50 flex items-center justify-center text-indigo-300 text-sm font-bold shrink-0">
                {lead.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-medium">{lead.name}</span>
                  <span className="text-gray-500 text-xs">{lead.company}</span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-500 text-xs">{lead.time}</span>
                  {lead.tagged && <span className="text-xs bg-amber-400/10 border border-amber-700 text-amber-400 px-1.5 py-0.5 rounded-full">Tagged</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`text-xs font-bold w-4 h-4 flex items-center justify-center rounded bg-gray-700`}>{lead.sourceIcon}</span>
                    {lead.source}
                  </span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-500 text-xs">{lead.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${scoreColor(lead.score)}`}>
                  {lead.score}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-700 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">Add to CRM</button>
              <button onClick={() => tagLead(lead.id)}
                className={`px-3 py-1.5 border text-xs rounded-lg transition-colors ${lead.tagged ? 'bg-amber-900/20 border-amber-700 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
                {lead.tagged ? 'Untag' : 'Tag'}
              </button>
              <button className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs rounded-lg hover:bg-gray-700 transition-colors">Email</button>
              <button onClick={() => dismissLead(lead.id)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-500 text-xs rounded-lg hover:bg-red-900/20 hover:border-red-800 hover:text-red-400 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No leads matching this filter.</div>
        )}
      </div>
    </div>
  )
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS)
  const [showModal, setShowModal] = useState(false)

  function connectIntegration(id: string) {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'Connected' } : i))
  }

  const AVAILABLE = [
    { name: 'HubSpot', icon: '🟠' },
    { name: 'Salesforce', icon: '☁' },
    { name: 'Pipedrive', icon: '🟢' },
    { name: 'ActiveCampaign', icon: '🔵' },
    { name: 'Zapier', icon: '⚡' },
    { name: 'Make.com', icon: '🔷' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">Connect lead sources to automatically import new leads.</p>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
          + Add Integration
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map(integration => (
          <div key={integration.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${integration.status === 'Connected' ? 'bg-indigo-600/20' : 'bg-gray-800'}`}>
                {integration.icon}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{integration.name}</p>
                <p className={`text-xs ${integration.status === 'Connected' ? 'text-green-400' : 'text-gray-500'}`}>
                  {integration.status}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <p className="text-white text-sm font-semibold">{integration.leadsImported > 0 ? integration.leadsImported.toLocaleString() : '—'}</p>
                <p className="text-gray-500 text-xs">Leads Imported</p>
              </div>
              <div>
                <p className="text-gray-300 text-sm">{integration.lastSync}</p>
                <p className="text-gray-500 text-xs">Last Sync</p>
              </div>
            </div>
            {integration.status === 'Connected' ? (
              <button className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Manage</button>
            ) : (
              <button onClick={() => connectIntegration(integration.id)}
                className="w-full py-2 bg-indigo-600/20 border border-indigo-600 text-indigo-400 text-xs font-medium rounded-lg hover:bg-indigo-600/30 transition-colors">
                Connect
              </button>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Add Integration</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors">&times;</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {AVAILABLE.map(a => (
                <button key={a.name} onClick={() => {
                  setIntegrations(prev => [...prev, {
                    id: Date.now().toString(), name: a.name, icon: a.icon,
                    status: 'Disconnected', leadsImported: 0, lastSync: '—',
                  }])
                  setShowModal(false)
                }}
                  className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-xl flex flex-col items-center gap-2 transition-colors">
                  <span className="text-2xl">{a.icon}</span>
                  <span className="text-gray-300 text-xs font-medium">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<LeadTab>('plan')
  const [deployToast, setDeployToast] = useState(false)

  function handleDeployToCMO() {
    setDeployToast(true)
    setTimeout(() => setDeployToast(false), 4000)
  }

  const tabs: { id: LeadTab; label: string }[] = [
    { id: 'plan', label: 'Lead Plan' },
    { id: 'capture', label: 'Lead Capture' },
    { id: 'feed', label: 'Lead Feed' },
    { id: 'integrations', label: 'Integrations' },
  ]

  const stats = [
    { label: 'Leads This Month', value: '1,847' },
    { label: 'MQL', value: '423', highlight: true },
    { label: 'SQL', value: '189' },
    { label: 'Conv. Rate', value: '22.9%', highlight: true },
    { label: 'Cost per Lead', value: '$12.40' },
    { label: 'Pipeline Value', value: '$284K' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Generation</h1>
          <p className="text-gray-400 text-sm mt-1">AI-powered lead acquisition and qualification command center</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Lead Report
          </button>
          <button onClick={handleDeployToCMO}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors">
            Deploy to CMO
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.highlight ? 'text-indigo-400' : 'text-white'}`}>{s.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'plan' && <LeadPlanTab />}
      {activeTab === 'capture' && <LeadCaptureTab />}
      {activeTab === 'feed' && <LeadFeedTab />}
      {activeTab === 'integrations' && <IntegrationsTab />}

      {/* Deploy toast */}
      {deployToast && (
        <div className="fixed bottom-6 right-6 bg-indigo-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-2">
          <span>✓</span>
          Active lead plan deployed to CMO Agent with full brief
        </div>
      )}
    </div>
  )
}
