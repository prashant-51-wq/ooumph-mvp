'use client'

import { useEffect, useState } from 'react'
import { CreditCard, AlertTriangle, Receipt, TrendingUp } from 'lucide-react'
import { Card, StatCard, Badge, EmptyState, fmtMoney, fmtDate, fmtNum } from '../_ui'

interface Plan { name: string; slug: string; price_monthly: number; active_count: number }
interface FailedSub { id: string; workspace_id: string; status: string; current_period_end?: string; plan_name: string; owner_email?: string }
interface Txn { id: string; vendor_workspace_id: string; gross_amount: number; commission_amount: number; description?: string; created_at: string }
interface BillingResponse {
  mrrCents: number
  arrCents: number
  plans: Plan[]
  statusBreakdown: Record<string, number>
  failedSubscriptions: FailedSub[]
  recentTransactions: Txn[]
}

export default function AdminBillingPage() {
  const [data, setData] = useState<BillingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/billing', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
        return res.json() as Promise<BillingResponse>
      })
      .then(setData)
      .catch(err => setError(String(err.message || err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <Card className="border-red-900/50">
        <p className="text-red-300 text-sm font-medium">Failed to load billing</p>
        <p className="text-gray-500 text-xs mt-1">{error}</p>
      </Card>
    )
  }
  if (!data) return null

  const totalActive = data.plans.reduce((acc, p) => acc + (p.active_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="MRR" value={fmtMoney(data.mrrCents)} sub={<span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" />recurring</span>} tone="good" />
        <StatCard label="ARR" value={fmtMoney(data.arrCents)} sub="annualized" tone="info" />
        <StatCard label="Active Subs" value={fmtNum(totalActive)} sub={<span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" />paying</span>} />
        <StatCard label="Past Due / Failed" value={fmtNum(data.failedSubscriptions.length)} sub={<span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />needs attention</span>} tone={data.failedSubscriptions.length > 0 ? 'bad' : 'good'} />
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-white mb-3">Subscriptions by plan</h3>
        {data.plans.length === 0 ? (
          <EmptyState title="No plans defined yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-gray-500 tracking-wide">
                <tr><th className="text-left pb-2">Plan</th><th className="text-left pb-2">Price</th><th className="text-left pb-2">Active</th><th className="text-right pb-2">MRR Contribution</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.plans.map(p => {
                  const mrr = (p.price_monthly || 0) * (p.active_count || 0)
                  return (
                    <tr key={p.slug} className="hover:bg-gray-800/40">
                      <td className="py-2 text-white">{p.name}</td>
                      <td className="py-2 text-gray-300">{fmtMoney(p.price_monthly)} / mo</td>
                      <td className="py-2 text-gray-300">{p.active_count}</td>
                      <td className="py-2 text-right text-emerald-400 font-medium">{fmtMoney(mrr)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Failed payments / past due
          </h3>
          {data.failedSubscriptions.length === 0 ? (
            <EmptyState title="All good" body="No failed payments in the last cycle." />
          ) : (
            <div className="space-y-2">
              {data.failedSubscriptions.map(s => (
                <div key={s.id} className="flex items-center justify-between border-b border-gray-800 last:border-0 pb-2">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{s.owner_email || s.workspace_id}</p>
                    <p className="text-gray-500 text-xs">{s.plan_name} · period ends {fmtDate(s.current_period_end || null)}</p>
                  </div>
                  <Badge tone="red">{s.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-400" /> Recent transactions
          </h3>
          {data.recentTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Commission ledger entries will appear here." />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {data.recentTransactions.map(t => (
                <div key={t.id} className="flex items-start justify-between border-b border-gray-800 last:border-0 pb-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{t.description || `Vendor ${t.vendor_workspace_id}`}</p>
                    <p className="text-gray-500 text-xs">{fmtDate(t.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-emerald-400 text-sm font-medium">{fmtMoney(t.gross_amount)}</p>
                    <p className="text-gray-500 text-xs">comm {fmtMoney(t.commission_amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
