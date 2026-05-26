'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgencyPlan = 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
type AgencyStatus = 'Active' | 'Trial' | 'Suspended' | 'Churned'

interface Agency {
  id: string
  name: string
  ownerEmail: string
  plan: AgencyPlan
  mrr: number
  seatsUsed: number
  seatsTotal: number
  status: AgencyStatus
  joinDate: string
}

interface Affiliate {
  id: string
  name: string
  email: string
  referredAgencies: number
  totalReferralMrr: number
  commissionRate: number
  earnedThisMonth: number
  paidOut: number
  balance: number
}

interface CommissionRate {
  plan: AgencyPlan
  rate: number
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_AGENCIES: Agency[] = [
  { id: 'ag-1', name: 'Pixel Peak Media', ownerEmail: 'lisa@pixelpeak.com', plan: 'Agency', mrr: 497, seatsUsed: 8, seatsTotal: 10, status: 'Active', joinDate: '2025-11-14' },
  { id: 'ag-2', name: 'GrowthStack Co.', ownerEmail: 'dev@growthstack.io', plan: 'Pro', mrr: 149, seatsUsed: 3, seatsTotal: 5, status: 'Active', joinDate: '2026-01-02' },
  { id: 'ag-3', name: 'BrightBrand HQ', ownerEmail: 'ops@brightbrandhq.com', plan: 'Enterprise', mrr: 997, seatsUsed: 22, seatsTotal: 50, status: 'Active', joinDate: '2025-09-30' },
  { id: 'ag-4', name: 'Funnel Craft Agency', ownerEmail: 'joe@funnelcraft.io', plan: 'Starter', mrr: 49, seatsUsed: 1, seatsTotal: 2, status: 'Trial', joinDate: '2026-05-20' },
  { id: 'ag-5', name: 'ScaleNow Partners', ownerEmail: 'team@scalenow.com', plan: 'Agency', mrr: 497, seatsUsed: 7, seatsTotal: 10, status: 'Active', joinDate: '2026-02-14' },
  { id: 'ag-6', name: 'Momentum Marketing', ownerEmail: 'hi@momentumktg.co', plan: 'Pro', mrr: 149, seatsUsed: 4, seatsTotal: 5, status: 'Active', joinDate: '2026-03-08' },
  { id: 'ag-7', name: 'DraftMark Agency', ownerEmail: 'admin@draftmark.xyz', plan: 'Starter', mrr: 49, seatsUsed: 2, seatsTotal: 2, status: 'Suspended', joinDate: '2025-12-01' },
  { id: 'ag-8', name: 'ViralVault Studio', ownerEmail: 'vv@viralvault.studio', plan: 'Pro', mrr: 0, seatsUsed: 0, seatsTotal: 5, status: 'Churned', joinDate: '2026-01-15' },
]

const MOCK_AFFILIATES: Affiliate[] = [
  { id: 'aff-1', name: 'Jordan Miles', email: 'jordan@affiliates.io', referredAgencies: 14, totalReferralMrr: 3820, commissionRate: 20, earnedThisMonth: 764, paidOut: 4200, balance: 764 },
  { id: 'aff-2', name: 'Priya Chandran', email: 'priya.c@resellers.net', referredAgencies: 8, totalReferralMrr: 1940, commissionRate: 20, earnedThisMonth: 388, paidOut: 1800, balance: 388 },
  { id: 'aff-3', name: 'Brett Farley', email: 'brett@brettfarley.com', referredAgencies: 5, totalReferralMrr: 1200, commissionRate: 15, earnedThisMonth: 180, paidOut: 820, balance: 180 },
  { id: 'aff-4', name: 'Nadia Osei', email: 'nadia@growthhq.africa', referredAgencies: 3, totalReferralMrr: 595, commissionRate: 15, earnedThisMonth: 89, paidOut: 300, balance: 89 },
]

const REVENUE_BY_MONTH = [
  { month: 'Dec', value: 8200 },
  { month: 'Jan', value: 10400 },
  { month: 'Feb', value: 12800 },
  { month: 'Mar', value: 15100 },
  { month: 'Apr', value: 17600 },
  { month: 'May', value: 21340 },
]

const MAX_REVENUE = Math.max(...REVENUE_BY_MONTH.map(r => r.value))

const RECENT_SIGNUPS = MOCK_AGENCIES.slice(0, 5).sort(
  (a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime()
)

// ─── Style helpers ────────────────────────────────────────────────────────────

const PLAN_STYLES: Record<AgencyPlan, string> = {
  Starter: 'bg-gray-800 text-gray-300 border-gray-700',
  Pro: 'bg-blue-900/50 text-blue-300 border-blue-800',
  Agency: 'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  Enterprise: 'bg-purple-900/50 text-purple-300 border-purple-800',
}

const STATUS_STYLES: Record<AgencyStatus, string> = {
  Active: 'bg-green-900/40 text-green-300 border-green-800',
  Trial: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  Suspended: 'bg-orange-900/40 text-orange-300 border-orange-800',
  Churned: 'bg-red-900/40 text-red-300 border-red-800',
}

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const totalMrr = MOCK_AGENCIES.filter(a => a.status !== 'Churned').reduce((s, a) => s + a.mrr, 0)
  const totalAgencies = MOCK_AGENCIES.length
  const activeAgencies = MOCK_AGENCIES.filter(a => a.status === 'Active').length
  const churnRate = ((MOCK_AGENCIES.filter(a => a.status === 'Churned').length / totalAgencies) * 100).toFixed(1)
  const avgMrr = Math.round(totalMrr / Math.max(activeAgencies, 1))
  const platformRevenue = Math.round(totalMrr * 0.2)

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Agencies', value: totalAgencies, sub: `${activeAgencies} active`, color: 'text-white' },
          { label: 'Total MRR', value: fmt$(totalMrr), sub: '+12% vs last month', color: 'text-green-400' },
          { label: 'Platform Revenue', value: fmt$(platformRevenue), sub: '20% cut', color: 'text-indigo-400' },
          { label: 'Active Subscriptions', value: activeAgencies, sub: `${MOCK_AGENCIES.filter(a => a.status === 'Trial').length} on trial`, color: 'text-white' },
          { label: 'Churn Rate', value: `${churnRate}%`, sub: 'last 30 days', color: parseFloat(churnRate) > 5 ? 'text-red-400' : 'text-green-400' },
          { label: 'Avg Rev / Agency', value: fmt$(avgMrr), sub: 'active only', color: 'text-white' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs font-medium mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-gray-600 text-xs mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Revenue chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Revenue (Last 6 Months)</h3>
          <div className="flex items-end gap-3 h-32">
            {REVENUE_BY_MONTH.map(r => (
              <div key={r.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-gray-500 text-xs">{fmt$(r.value)}</span>
                <div
                  className="w-full rounded-t bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  style={{ height: `${(r.value / MAX_REVENUE) * 80}%` }}
                />
                <span className="text-gray-500 text-xs">{r.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent signups */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Recent Signups</h3>
          <div className="space-y-3">
            {RECENT_SIGNUPS.map(agency => (
              <div key={agency.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{agency.name}</p>
                  <p className="text-gray-500 text-xs truncate">{agency.ownerEmail}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${PLAN_STYLES[agency.plan]}`}>{agency.plan}</span>
                  <span className="text-gray-400 text-xs font-semibold">{fmt$(agency.mrr)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLES[agency.status]}`}>{agency.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Agencies Tab ─────────────────────────────────────────────────────────────

function AgenciesTab() {
  const [planFilter, setPlanFilter] = useState<AgencyPlan | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AgencyStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [messageTarget, setMessageTarget] = useState<Agency | null>(null)
  const [messageText, setMessageText] = useState('')

  const filtered = MOCK_AGENCIES.filter(a => {
    const matchPlan = planFilter === 'all' || a.plan === planFilter
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    const matchSearch = !search.trim() || a.name.toLowerCase().includes(search.toLowerCase()) || a.ownerEmail.toLowerCase().includes(search.toLowerCase())
    return matchPlan && matchStatus && matchSearch
  })

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
        />
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value as AgencyPlan | 'all')}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-sm focus:outline-none"
        >
          <option value="all">All Plans</option>
          {(['Starter', 'Pro', 'Agency', 'Enterprise'] as AgencyPlan[]).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AgencyStatus | 'all')}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-sm focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {(['Active', 'Trial', 'Suspended', 'Churned'] as AgencyStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          + Invite Agency
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Agency</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Plan</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">MRR</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Seats</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Joined</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map(agency => (
                <tr key={agency.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-white font-medium">{agency.name}</p>
                    <p className="text-gray-500 text-xs">{agency.ownerEmail}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded border text-xs font-medium ${PLAN_STYLES[agency.plan]}`}>{agency.plan}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-white font-semibold">{fmt$(agency.mrr)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-gray-300 text-xs">{agency.seatsUsed}/{agency.seatsTotal}</span>
                    <div className="w-16 bg-gray-800 rounded-full h-1 mt-1">
                      <div
                        className="bg-indigo-500 h-1 rounded-full"
                        style={{ width: `${(agency.seatsUsed / agency.seatsTotal) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[agency.status]}`}>{agency.status}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-gray-400 text-xs">{fmtDate(agency.joinDate)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                        View
                      </button>
                      <button className="px-2 py-1 rounded bg-indigo-900/40 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs transition-colors">
                        Impersonate
                      </button>
                      <button
                        onClick={() => setMessageTarget(agency)}
                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                      >
                        Message
                      </button>
                      <button className={`px-2 py-1 rounded text-xs transition-colors ${agency.status === 'Suspended' ? 'bg-green-900/40 hover:bg-green-900 border border-green-800 text-green-300' : 'bg-orange-900/30 hover:bg-orange-900 border border-orange-800 text-orange-300'}`}>
                        {agency.status === 'Suspended' ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message modal */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm" onClick={() => setMessageTarget(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Message Agency</h3>
              <button onClick={() => setMessageTarget(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <p className="text-gray-400 text-sm mb-3">To: <span className="text-white">{messageTarget.name}</span> · {messageTarget.ownerEmail}</p>
            <textarea
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              placeholder="Write your message to this agency owner..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setMessageTarget(null)} className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors">Cancel</button>
              <button onClick={() => { alert('Message sent (demo)'); setMessageTarget(null); setMessageText('') }} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">Send Message</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Commissions Tab ──────────────────────────────────────────────────────────

function CommissionsTab() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>(MOCK_AFFILIATES)

  const totalOwed = affiliates.reduce((s, a) => s + a.balance, 0)
  const paidThisMonth = affiliates.reduce((s, a) => s + a.earnedThisMonth, 0)
  const topAffiliate = affiliates.reduce((top, a) => a.balance > top.balance ? a : top, affiliates[0])

  const markPaid = (id: string) => {
    setAffiliates(prev => prev.map(a => a.id === id ? { ...a, paidOut: a.paidOut + a.balance, balance: 0 } : a))
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Commission Owed</p>
          <p className="text-red-400 text-3xl font-bold">{fmt$(totalOwed)}</p>
          <p className="text-gray-600 text-xs mt-1">across {affiliates.filter(a => a.balance > 0).length} affiliates</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Earned This Month</p>
          <p className="text-green-400 text-3xl font-bold">{fmt$(paidThisMonth)}</p>
          <p className="text-gray-600 text-xs mt-1">total commissions generated</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Top Affiliate</p>
          <p className="text-white text-xl font-bold">{topAffiliate?.name}</p>
          <p className="text-gray-400 text-xs mt-1">{topAffiliate?.referredAgencies} agencies · {fmt$(topAffiliate?.balance)} balance</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Affiliate</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Referred</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Referral MRR</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Rate</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Earned / Mo</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Paid Out</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Balance</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {affiliates.map(aff => (
                <tr key={aff.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-white font-medium">{aff.name}</p>
                    <p className="text-gray-500 text-xs">{aff.email}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-300">{aff.referredAgencies}</td>
                  <td className="px-5 py-4 text-white font-semibold">{fmt$(aff.totalReferralMrr)}</td>
                  <td className="px-5 py-4">
                    <span className="bg-indigo-900/40 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded text-xs">{aff.commissionRate}%</span>
                  </td>
                  <td className="px-5 py-4 text-green-400 font-semibold">{fmt$(aff.earnedThisMonth)}</td>
                  <td className="px-5 py-4 text-gray-400">{fmt$(aff.paidOut)}</td>
                  <td className="px-5 py-4">
                    <span className={`font-bold text-sm ${aff.balance > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{fmt$(aff.balance)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => markPaid(aff.id)}
                      disabled={aff.balance === 0}
                      className="px-3 py-1.5 rounded-lg bg-green-900/40 hover:bg-green-900 border border-green-800 text-green-300 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {aff.balance === 0 ? '✓ Paid' : 'Mark Paid'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Platform Settings Tab ────────────────────────────────────────────────────

function PlatformSettingsTab() {
  const [byok, setByok] = useState(false)
  const [whiteLabelAll, setWhiteLabelAll] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [commissionRates, setCommissionRates] = useState<CommissionRate[]>([
    { plan: 'Starter', rate: 10 },
    { plan: 'Pro', rate: 15 },
    { plan: 'Agency', rate: 20 },
    { plan: 'Enterprise', rate: 25 },
  ])
  const [savedAnnouncement, setSavedAnnouncement] = useState(false)

  const aiCredits = { total: 10000000, used: 6843200 }
  const remaining = aiCredits.total - aiCredits.used
  const usedPct = Math.round((aiCredits.used / aiCredits.total) * 100)

  const updateRate = (plan: AgencyPlan, value: number) => {
    setCommissionRates(prev => prev.map(r => r.plan === plan ? { ...r, rate: value } : r))
  }

  const saveAnnouncement = () => {
    setSavedAnnouncement(true)
    setTimeout(() => setSavedAnnouncement(false), 2000)
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* AI Credits */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">AI Credit Pool</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Total Credits</span>
            <span className="text-white font-semibold">{aiCredits.total.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Used</span>
            <span className="text-red-400 font-semibold">{aiCredits.used.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Remaining</span>
            <span className="text-green-400 font-semibold">{remaining.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5 mt-2">
            <div
              className={`h-2.5 rounded-full ${usedPct > 80 ? 'bg-red-500' : usedPct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="text-gray-600 text-xs text-right">{usedPct}% used</p>
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Platform Controls</h3>
        <div className="space-y-4">
          {[
            { label: 'Force BYOK (agencies use own AI keys)', sub: 'All plans must supply their own API key', value: byok, onChange: setByok },
            { label: 'White-label for all plans', sub: 'Enable Ooumph branding removal globally', value: whiteLabelAll, onChange: setWhiteLabelAll },
            { label: 'Maintenance Mode', sub: 'Show maintenance page to all agency users', value: maintenanceMode, onChange: setMaintenanceMode, danger: true },
          ].map(toggle => (
            <div key={toggle.label} className={`flex items-start justify-between gap-4 p-3 rounded-lg ${toggle.value && toggle.danger ? 'bg-red-950/40 border border-red-900' : 'bg-gray-800/50'}`}>
              <div>
                <p className={`text-sm font-medium ${toggle.danger && toggle.value ? 'text-red-300' : 'text-white'}`}>{toggle.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{toggle.sub}</p>
              </div>
              <button
                onClick={() => toggle.onChange(!toggle.value)}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${toggle.value ? toggle.danger ? 'bg-red-600' : 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${toggle.value ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Announcement banner */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-1">Announcement Banner</h3>
        <p className="text-gray-500 text-xs mb-3">Shown to all agency users at top of their dashboard</p>
        <textarea
          value={announcement}
          onChange={e => setAnnouncement(e.target.value)}
          placeholder="e.g. We're upgrading our servers tonight 2–4 AM UTC. Expect brief downtime."
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={saveAnnouncement}
          className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${savedAnnouncement ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {savedAnnouncement ? '✓ Saved' : 'Publish Announcement'}
        </button>
      </div>

      {/* Commission rates */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-1">Commission Rates by Plan</h3>
        <p className="text-gray-500 text-xs mb-4">Percentage of MRR paid to affiliates who refer agencies on each plan</p>
        <div className="space-y-3">
          {commissionRates.map(cr => (
            <div key={cr.plan} className="flex items-center justify-between">
              <span className={`px-2.5 py-1 rounded border text-xs font-medium ${PLAN_STYLES[cr.plan]}`}>{cr.plan}</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={5}
                  value={cr.rate}
                  onChange={e => updateRate(cr.plan, parseInt(e.target.value))}
                  className="w-28 accent-indigo-500"
                />
                <span className="text-white text-sm font-semibold w-10 text-right">{cr.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'agencies' | 'commissions' | 'settings'

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'agencies', label: 'Agencies', icon: '🏢' },
    { key: 'commissions', label: 'Commissions', icon: '💰' },
    { key: 'settings', label: 'Platform Settings', icon: '⚙️' },
  ]

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🛡️</span>
            <h1 className="text-2xl font-bold text-white">Super Admin</h1>
            <span className="px-2.5 py-1 rounded-full bg-red-900/40 border border-red-800 text-red-300 text-xs font-semibold">Platform Owner</span>
          </div>
          <p className="text-gray-400 text-sm">Manage all agencies, revenue, commissions, and platform settings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab.key ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'agencies' && <AgenciesTab />}
      {activeTab === 'commissions' && <CommissionsTab />}
      {activeTab === 'settings' && <PlatformSettingsTab />}
    </div>
  )
}
