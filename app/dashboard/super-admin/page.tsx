'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgencyPlan = 'Free' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
type AgencyStatus = 'Active' | 'Trial' | 'Suspended' | 'Churned' | 'Free'

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

interface RecentSignup {
  id: string
  name: string
  ownerEmail: string
  plan: string
  mrr: number
  joinDate: string
  status: string
}

interface OverviewData {
  totalAgencies: number
  activeMrr: number
  platformRevenue: number
  activeSubscriptions: number
  trialSubscriptions: number
  churnRate: number
  avgRevenuePerAgency: number
  recentSignups: RecentSignup[]
  revenueByMonth: Array<{ month: string; value: number }>
}

interface CommissionsData {
  affiliates: Affiliate[]
  totalOwed: number
  paidThisMonth: number
  topAffiliateName: string
}

type PlatformSettings = Record<string, string>

// ─── Style helpers ────────────────────────────────────────────────────────────

const PLAN_STYLES: Record<string, string> = {
  Free: 'bg-gray-800 text-gray-400 border-gray-700',
  Starter: 'bg-gray-800 text-gray-300 border-gray-700',
  Pro: 'bg-blue-900/50 text-blue-300 border-blue-800',
  Agency: 'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  Enterprise: 'bg-purple-900/50 text-purple-300 border-purple-800',
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-green-900/40 text-green-300 border-green-800',
  Trial: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  Suspended: 'bg-orange-900/40 text-orange-300 border-orange-800',
  Churned: 'bg-red-900/40 text-red-300 border-red-800',
  Free: 'bg-gray-800 text-gray-400 border-gray-700',
}

function fmt$(n: number) {
  if (n == null || isNaN(n)) return '$0'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n}`
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Inline Spinner ───────────────────────────────────────────────────────────

function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-3">
      <span className="w-4 h-4 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
      {label}
    </div>
  )
}

function EmptyPanel({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
      <p className="text-gray-500 text-sm max-w-md mx-auto">{body}</p>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: OverviewData | null }) {
  if (!data) return <LoadingPanel label="Loading platform overview…" />

  if (data.totalAgencies === 0) {
    return (
      <EmptyPanel
        icon="🏢"
        title="No agencies yet"
        body="Platform metrics will appear once your first agency signs up. Share your signup link to start onboarding customers."
      />
    )
  }

  const maxRev = Math.max(...data.revenueByMonth.map(r => r.value), 1)
  const churnHigh = data.churnRate > 5

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Agencies', value: data.totalAgencies, sub: `${data.activeSubscriptions} active`, color: 'text-white' },
          { label: 'Total MRR', value: fmt$(data.activeMrr), sub: 'active subscriptions', color: 'text-green-400' },
          { label: 'Platform Revenue', value: fmt$(data.platformRevenue), sub: '20% cut', color: 'text-indigo-400' },
          { label: 'Active Subscriptions', value: data.activeSubscriptions, sub: `${data.trialSubscriptions} on trial`, color: 'text-white' },
          { label: 'Churn Rate', value: `${data.churnRate}%`, sub: 'cumulative', color: churnHigh ? 'text-red-400' : 'text-green-400' },
          { label: 'Avg Rev / Agency', value: fmt$(data.avgRevenuePerAgency), sub: 'active only', color: 'text-white' },
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
          {data.revenueByMonth.every(r => r.value === 0) ? (
            <p className="text-gray-500 text-sm py-8 text-center">No revenue recorded yet.</p>
          ) : (
            <div className="flex items-end gap-3 h-32">
              {data.revenueByMonth.map(r => (
                <div key={r.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-gray-500 text-xs">{fmt$(r.value)}</span>
                  <div
                    className="w-full rounded-t bg-indigo-600 hover:bg-indigo-500 transition-colors"
                    style={{ height: `${(r.value / maxRev) * 80}%` }}
                  />
                  <span className="text-gray-500 text-xs">{r.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent signups */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Recent Signups</h3>
          {data.recentSignups.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No recent signups.</p>
          ) : (
            <div className="space-y-3">
              {data.recentSignups.map(signup => (
                <div key={signup.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{signup.name}</p>
                    <p className="text-gray-500 text-xs truncate">{signup.ownerEmail}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${PLAN_STYLES[signup.plan] || PLAN_STYLES.Free}`}>{signup.plan}</span>
                    <span className="text-gray-400 text-xs font-semibold">{fmt$(signup.mrr)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLES[signup.status] || STATUS_STYLES.Free}`}>{signup.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agencies Tab ─────────────────────────────────────────────────────────────

function AgenciesTab({ data, onRefresh }: { data: Agency[] | null; onRefresh: () => void }) {
  const [planFilter, setPlanFilter] = useState<AgencyPlan | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AgencyStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [messageTarget, setMessageTarget] = useState<Agency | null>(null)
  const [messageText, setMessageText] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  if (data === null) return <LoadingPanel label="Loading agencies…" />

  async function toggleSuspend(agency: Agency) {
    const action = agency.status === 'Suspended' ? 'unsuspend_workspace' : 'suspend_workspace'
    setUpdatingId(agency.id)
    try {
      const res = await fetch('/api/admin/super', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, workspaceId: agency.id }),
      })
      if (res.ok) {
        onRefresh()
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string }
        alert(j.error || 'Failed to update status')
      }
    } catch (err) {
      alert(`Error: ${String(err)}`)
    } finally {
      setUpdatingId(null)
    }
  }

  if (data.length === 0) {
    return (
      <EmptyPanel
        icon="🏢"
        title="No agencies yet"
        body="Once customers sign up, they'll appear here. You'll be able to view, impersonate, message, and suspend any workspace from this table."
      />
    )
  }

  const filtered = data.filter(a => {
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
          {(['Free', 'Starter', 'Pro', 'Agency', 'Enterprise'] as AgencyPlan[]).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AgencyStatus | 'all')}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-sm focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {(['Active', 'Trial', 'Suspended', 'Churned', 'Free'] as AgencyStatus[]).map(s => (
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-500 text-sm">
                    No agencies match your filters.
                  </td>
                </tr>
              ) : filtered.map(agency => (
                <tr key={agency.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-white font-medium">{agency.name}</p>
                    <p className="text-gray-500 text-xs">{agency.ownerEmail}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded border text-xs font-medium ${PLAN_STYLES[agency.plan] || PLAN_STYLES.Free}`}>{agency.plan}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-white font-semibold">{fmt$(agency.mrr)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-gray-300 text-xs">{agency.seatsUsed}/{agency.seatsTotal}</span>
                    <div className="w-16 bg-gray-800 rounded-full h-1 mt-1">
                      <div
                        className="bg-indigo-500 h-1 rounded-full"
                        style={{ width: `${Math.min(100, (agency.seatsUsed / Math.max(agency.seatsTotal, 1)) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[agency.status] || STATUS_STYLES.Free}`}>{agency.status}</span>
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
                      <button
                        disabled={updatingId === agency.id}
                        onClick={() => toggleSuspend(agency)}
                        className={`px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ${agency.status === 'Suspended' ? 'bg-green-900/40 hover:bg-green-900 border border-green-800 text-green-300' : 'bg-orange-900/30 hover:bg-orange-900 border border-orange-800 text-orange-300'}`}
                      >
                        {updatingId === agency.id ? '…' : (agency.status === 'Suspended' ? 'Unsuspend' : 'Suspend')}
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
            {/* Sprint 7D: "Send Message" requires verified-domain Resend
                + an /api/admin/super { action:'message_agency' } handler
                that wraps sendEmail with audit logging. Until both ship
                we keep the modal open (the platform owner can copy the
                draft + the owner email) and remove the misleading demo
                alert. */}
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300 mb-3">
              ⚠ Direct-message send is not yet wired. Copy the message and
              email it manually to {messageTarget.ownerEmail} — the rest of
              the agency console is fully active.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMessageTarget(null)} className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors">Close</button>
              <a
                href={`mailto:${encodeURIComponent(messageTarget.ownerEmail)}?subject=${encodeURIComponent('Message from Ooumph platform admin')}&body=${encodeURIComponent(messageText)}`}
                onClick={() => { setMessageTarget(null); setMessageText('') }}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors text-center"
              >
                Open in Email App
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Commissions Tab ──────────────────────────────────────────────────────────

function CommissionsTab({ data }: { data: CommissionsData | null }) {
  // Sprint 7D: payout marking is real now — POSTs to /api/admin/super
  // { action: 'mark_paid' }, which records a row in commission_payouts.
  // The next data refresh recomputes balance = earned - sum(payouts).
  // Stripe Connect transfers will land later; manual ledger entries are
  // the source of truth until then.
  const [localAffiliates, setLocalAffiliates] = useState<Affiliate[] | null>(null)
  const [marking, setMarking] = useState<string | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setLocalAffiliates(data.affiliates)
  }, [data])

  if (!data) return <LoadingPanel label="Loading commission ledger…" />

  const affiliates = localAffiliates ?? data.affiliates

  if (affiliates.length === 0) {
    return (
      <EmptyPanel
        icon="💰"
        title="No commissions yet"
        body="When agencies on the Agency or Agency Scale plan refer paying clients, commission earnings will appear here. Set commission rates in the Platform Settings tab."
      />
    )
  }

  const totalOwed = affiliates.reduce((s, a) => s + a.balance, 0)
  const paidThisMonth = affiliates.reduce((s, a) => s + a.earnedThisMonth, 0)
  const topAffiliate = affiliates.reduce<Affiliate | null>((top, a) => (!top || a.balance > top.balance ? a : top), null)

  async function markPaid(id: string) {
    setMarking(id); setPayoutError(null)
    try {
      const res = await fetch('/api/admin/super', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid',
          vendorWorkspaceId: id,
          notes: 'Marked paid manually from /super-admin Commissions tab',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setPayoutError(j.error || `Mark paid failed (${res.status})`)
        return
      }
      // Optimistic update — the next /api/admin/super GET will reconcile.
      setLocalAffiliates(prev => (prev ?? affiliates).map(a => a.id === id ? { ...a, paidOut: a.paidOut + a.balance, balance: 0 } : a))
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : String(e))
    } finally { setMarking(null) }
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
          <p className="text-white text-xl font-bold">{topAffiliate?.name || '—'}</p>
          <p className="text-gray-400 text-xs mt-1">{topAffiliate?.referredAgencies ?? 0} agencies · {fmt$(topAffiliate?.balance ?? 0)} balance</p>
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
                      disabled={aff.balance === 0 || marking === aff.id}
                      className="px-3 py-1.5 rounded-lg bg-green-900/40 hover:bg-green-900 border border-green-800 text-green-300 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Records a manual payout in commission_payouts. Use this when you've paid the affiliate out-of-band (bank transfer, Wise, etc.)."
                    >
                      {marking === aff.id
                        ? 'Marking…'
                        : aff.balance === 0 ? '✓ Paid' : 'Mark Paid'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {payoutError && (
        <p className="text-xs text-red-400">{payoutError}</p>
      )}
      <p className="text-xs text-gray-500 italic">
        &ldquo;Mark Paid&rdquo; records the full outstanding balance as a manual payout in
        the <code className="text-gray-400">commission_payouts</code> ledger and decrements
        the displayed balance immediately. Stripe Connect transfers are not yet
        wired — pay the affiliate out-of-band (bank transfer / Wise / etc.) and use
        this button to keep the ledger accurate.
      </p>
    </div>
  )
}

// ─── Platform Settings Tab ────────────────────────────────────────────────────

function PlatformSettingsTab({ data, onRefresh }: { data: PlatformSettings | null; onRefresh: () => void }) {
  const [byok, setByok] = useState(false)
  const [whiteLabelAll, setWhiteLabelAll] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [commissionRates, setCommissionRates] = useState<Record<string, number>>({
    Starter: 10,
    Pro: 15,
    Agency: 20,
    Enterprise: 25,
  })
  const [savedAnnouncement, setSavedAnnouncement] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setByok(data.force_byok === 'true' || data.force_byok === '1')
    setWhiteLabelAll(data.white_label_all === 'true' || data.white_label_all === '1')
    setMaintenanceMode(data.maintenance_mode === 'true' || data.maintenance_mode === '1')
    setAnnouncement(data.announcement || '')
    const rates: Record<string, number> = { Starter: 10, Pro: 15, Agency: 20, Enterprise: 25 }
    for (const plan of Object.keys(rates)) {
      const k = `commission_rate_${plan.toLowerCase()}`
      if (data[k]) {
        const n = parseInt(data[k], 10)
        if (!isNaN(n)) rates[plan] = n
      }
    }
    setCommissionRates(rates)
  }, [data])

  if (!data) return <LoadingPanel label="Loading platform settings…" />

  async function saveSetting(key: string, value: string) {
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/super', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_setting', key, value }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        alert(j.error || `Failed to save ${key}`)
      } else {
        onRefresh()
      }
    } catch (err) {
      alert(`Error: ${String(err)}`)
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleAndSave(key: string, next: boolean, setter: (v: boolean) => void) {
    setter(next)
    await saveSetting(key, next ? 'true' : 'false')
  }

  const aiCredits = { total: 10000000, used: parseInt(data.ai_credits_used || '0', 10) || 0 }
  const remaining = aiCredits.total - aiCredits.used
  const usedPct = Math.round((aiCredits.used / aiCredits.total) * 100)

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
            { key: 'force_byok', label: 'Force BYOK (agencies use own AI keys)', sub: 'All plans must supply their own API key', value: byok, setter: setByok, danger: false },
            { key: 'white_label_all', label: 'White-label for all plans', sub: 'Enable Ooumph branding removal globally', value: whiteLabelAll, setter: setWhiteLabelAll, danger: false },
            { key: 'maintenance_mode', label: 'Maintenance Mode', sub: 'Show maintenance page to all agency users', value: maintenanceMode, setter: setMaintenanceMode, danger: true },
          ].map(toggle => (
            <div key={toggle.label} className={`flex items-start justify-between gap-4 p-3 rounded-lg ${toggle.value && toggle.danger ? 'bg-red-950/40 border border-red-900' : 'bg-gray-800/50'}`}>
              <div>
                <p className={`text-sm font-medium ${toggle.danger && toggle.value ? 'text-red-300' : 'text-white'}`}>{toggle.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{toggle.sub}</p>
                {savingKey === toggle.key && <p className="text-indigo-400 text-[10px] mt-0.5">Saving…</p>}
              </div>
              <button
                disabled={savingKey === toggle.key}
                onClick={() => void toggleAndSave(toggle.key, !toggle.value, toggle.setter)}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${toggle.value ? (toggle.danger ? 'bg-red-600' : 'bg-indigo-600') : 'bg-gray-700'}`}
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
          onClick={async () => {
            await saveSetting('announcement', announcement)
            setSavedAnnouncement(true)
            setTimeout(() => setSavedAnnouncement(false), 2000)
          }}
          disabled={savingKey === 'announcement'}
          className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${savedAnnouncement ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {savingKey === 'announcement' ? 'Saving…' : savedAnnouncement ? '✓ Saved' : 'Publish Announcement'}
        </button>
      </div>

      {/* Commission rates */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-1">Commission Rates by Plan</h3>
        <p className="text-gray-500 text-xs mb-4">Percentage of MRR paid to affiliates who refer agencies on each plan</p>
        <div className="space-y-3">
          {(['Starter', 'Pro', 'Agency', 'Enterprise'] as const).map(plan => {
            const rate = commissionRates[plan]
            const key = `commission_rate_${plan.toLowerCase()}`
            return (
              <div key={plan} className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded border text-xs font-medium ${PLAN_STYLES[plan]}`}>{plan}</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={40}
                    step={5}
                    value={rate}
                    onChange={e => setCommissionRates(prev => ({ ...prev, [plan]: parseInt(e.target.value, 10) }))}
                    onMouseUp={() => void saveSetting(key, String(rate))}
                    onTouchEnd={() => void saveSetting(key, String(rate))}
                    className="w-28 accent-indigo-500"
                  />
                  <span className="text-white text-sm font-semibold w-10 text-right">{rate}%</span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-gray-600 text-xs mt-3">Changes save automatically when you release the slider.</p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'agencies' | 'commissions' | 'settings'

export default function SuperAdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [authState, setAuthState] = useState<'loading' | 'authorized' | 'denied'>('loading')

  // Section data
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [agencies, setAgencies] = useState<Agency[] | null>(null)
  const [commissions, setCommissions] = useState<CommissionsData | null>(null)
  const [platform, setPlatform] = useState<PlatformSettings | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Auth gate: only super admins may access this page.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data?.user?.isAdmin === true) setAuthState('authorized')
        else setAuthState('denied')
      })
      .catch(() => { if (!cancelled) setAuthState('denied') })
    return () => { cancelled = true }
  }, [])

  const fetchAll = useCallback(async () => {
    setFetchError(null)
    try {
      const [ovRes, agRes, commRes, platRes] = await Promise.all([
        fetch('/api/admin/super?section=overview', { credentials: 'include' }),
        fetch('/api/admin/super?section=agencies', { credentials: 'include' }),
        fetch('/api/admin/super?section=commissions', { credentials: 'include' }),
        fetch('/api/admin/super?section=platform', { credentials: 'include' }),
      ])

      if (ovRes.ok) setOverview(await ovRes.json() as OverviewData)
      if (agRes.ok) setAgencies(await agRes.json() as Agency[])
      if (commRes.ok) setCommissions(await commRes.json() as CommissionsData)
      if (platRes.ok) setPlatform(await platRes.json() as PlatformSettings)

      if (!ovRes.ok) {
        const j = await ovRes.json().catch(() => ({})) as { error?: string }
        setFetchError(j.error || `Failed to load overview (HTTP ${ovRes.status})`)
      }
    } catch (err) {
      setFetchError(`Failed to load admin data: ${String(err)}`)
    }
  }, [])

  // Fetch all sections in parallel once authorized
  useEffect(() => {
    if (authState === 'authorized') {
      void fetchAll()
    }
  }, [authState, fetchAll])

  // While checking auth — render a minimal spinner. Never render the dashboard body.
  if (authState === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <span className="w-4 h-4 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
          Verifying access…
        </div>
      </div>
    )
  }

  // Denied — show access denied screen with redirect link.
  if (authState === 'denied') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-red-900/50 rounded-2xl p-8 max-w-md text-center">
          <div className="text-5xl mb-3">🛡️</div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm mb-6">
            The Super Admin dashboard is restricted to Ooumph platform owners. If you believe this is a mistake, contact{' '}
            <a href="mailto:support@ooumph.com" className="text-indigo-400 hover:underline">support@ooumph.com</a>.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

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
        <button
          onClick={() => void fetchAll()}
          className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 text-xs font-medium transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {fetchError && (
        <div className="mb-4 bg-red-950/40 border border-red-900 rounded-xl p-4 text-red-300 text-sm">
          {fetchError}
        </div>
      )}

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
      {activeTab === 'overview' && <OverviewTab data={overview} />}
      {activeTab === 'agencies' && <AgenciesTab data={agencies} onRefresh={fetchAll} />}
      {activeTab === 'commissions' && <CommissionsTab data={commissions} />}
      {activeTab === 'settings' && <PlatformSettingsTab data={platform} onRefresh={fetchAll} />}
    </div>
  )
}
