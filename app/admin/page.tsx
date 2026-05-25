'use client'

import { useState, useEffect, useCallback } from 'react'

interface PlatformStats {
  totalWorkspaces: number
  totalVendors: number
  totalClients: number
}
interface RevenueStats {
  mrr: number
  mrrFormatted: string
  totalGmv: number
  totalCommissionEarned: number
  totalTransactions: number
  commissionThisMonth: number
}
interface Plan {
  name: string
  slug: string
  price_monthly: number
  subscriber_count: number
}
interface AdminStats {
  platform: PlatformStats
  revenue: RevenueStats
  plans: Plan[]
  recentCommissions: {
    id: string
    vendor_workspace_id: string
    gross_amount: number
    commission_amount: number
    net_amount: number
    commission_rate: number
    description: string
    created_at: string
  }[]
}

function cents(n: number) {
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const secret = typeof window !== 'undefined' ? (window as Window & { __adminSecret?: string }).__adminSecret || sessionStorage.getItem('adminSecret') || '' : ''
    try {
      const res = await fetch(`/api/admin/stats?adminSecret=${encodeURIComponent(secret)}`)
      if (!res.ok) { setError('Failed to load stats'); return }
      setStats(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-gray-400 animate-pulse">Loading platform stats…</div>
    </div>
  )
  if (error) return (
    <div className="p-8 text-red-400">{error}</div>
  )
  if (!stats) return null

  const { platform, revenue, plans, recentCommissions } = stats

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Platform Overview</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Monthly Recurring Revenue" value={revenue.mrrFormatted} sub="from subscriptions" color="indigo" />
        <KpiCard title="Commission This Month" value={cents(revenue.commissionThisMonth)} sub="platform take" color="emerald" />
        <KpiCard title="Total GMV" value={cents(revenue.totalGmv)} sub={`${revenue.totalTransactions} transactions`} color="blue" />
        <KpiCard title="Total Commission Earned" value={cents(revenue.totalCommissionEarned)} sub="all time" color="purple" />
      </div>

      {/* Platform counts */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatBadge label="Workspaces" value={platform.totalWorkspaces} icon="🏠" />
        <StatBadge label="Active Vendors" value={platform.totalVendors} icon="🏢" />
        <StatBadge label="Client Accounts" value={platform.totalClients} icon="👥" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Subscriptions by Plan</h2>
          <div className="space-y-3">
            {plans.map(p => (
              <div key={p.slug} className="flex items-center justify-between">
                <div>
                  <span className="text-white font-medium text-sm">{p.name}</span>
                  <span className="text-gray-500 text-xs ml-2">${(p.price_monthly / 100).toFixed(0)}/mo</span>
                </div>
                <span className="text-indigo-400 font-semibold text-sm">{p.subscriber_count} subs</span>
              </div>
            ))}
            {plans.length === 0 && <p className="text-gray-500 text-sm">No plans seeded yet — POST /api/billing/plans with action=seed</p>}
          </div>
        </div>

        {/* Recent commissions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Recent Commissions</h2>
          <div className="space-y-2">
            {recentCommissions.map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-white text-xs font-medium truncate max-w-[180px]">{c.description}</p>
                  <p className="text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-400 text-xs font-semibold">{cents(c.commission_amount)}</p>
                  <p className="text-gray-500 text-xs">of {cents(c.gross_amount)}</p>
                </div>
              </div>
            ))}
            {recentCommissions.length === 0 && <p className="text-gray-500 text-sm">No commissions yet</p>}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <ActionBtn label="Seed Plans" onClick={async () => {
            const secret = (window as Window & { __adminSecret?: string }).__adminSecret || sessionStorage.getItem('adminSecret') || ''
            await fetch('/api/billing/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed', adminSecret: secret }) })
            void load()
          }} />
          <ActionBtn label="Refresh Stats" onClick={() => { setLoading(true); void load() }} />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'border-indigo-500/30 bg-indigo-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
  }
  const text: Record<string, string> = {
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color] || ''}`}>
      <p className="text-gray-400 text-xs mb-1">{title}</p>
      <p className={`text-2xl font-bold ${text[color] || 'text-white'}`}>{value}</p>
      <p className="text-gray-500 text-xs mt-0.5">{sub}</p>
    </div>
  )
}

function StatBadge({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
        <p className="text-gray-400 text-xs">{label}</p>
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm px-4 py-2 rounded-lg transition"
    >
      {label}
    </button>
  )
}
