'use client'

import { useState, useEffect, useCallback } from 'react'

interface CommissionEntry {
  id: string
  vendor_workspace_id: string
  vendor_name: string
  vendor_email: string
  gross_amount: number
  commission_rate: number
  commission_amount: number
  net_amount: number
  stripe_payment_intent_id: string
  description: string
  created_at: string
}

interface Summary {
  total_gmv: number
  total_commission: number
  total_net_to_vendors: number
  total_transactions: number
  avg_commission_rate: number
}

function cents(n: number | null | undefined) {
  if (!n) return '$0.00'
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminRevenuePage() {
  const [entries, setEntries] = useState<CommissionEntry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterVendor, setFilterVendor] = useState('')
  const [limitVal, setLimitVal] = useState('200')

  const getSecret = () =>
    typeof window !== 'undefined'
      ? (window as Window & { __adminSecret?: string }).__adminSecret || sessionStorage.getItem('adminSecret') || ''
      : ''

  const load = useCallback(async () => {
    setLoading(true)
    const secret = getSecret()
    const params = new URLSearchParams({ adminSecret: secret, limit: limitVal })
    if (filterVendor) params.set('vendorWorkspaceId', filterVendor)
    const res = await fetch(`/api/admin/commissions?${params}`)
    if (res.ok) {
      const data = await res.json() as { entries: CommissionEntry[]; summary: Summary }
      setEntries(data.entries)
      setSummary(data.summary)
    }
    setLoading(false)
  }, [filterVendor, limitVal])

  useEffect(() => { void load() }, [load])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Revenue & Commissions</h1>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard label="Total GMV" value={cents(summary.total_gmv)} sub="gross vendor sales" color="blue" />
          <SummaryCard label="Platform Commission" value={cents(summary.total_commission)} sub="our take" color="emerald" />
          <SummaryCard label="Net to Vendors" value={cents(summary.total_net_to_vendors)} sub="after commission" color="gray" />
          <SummaryCard label="Transactions" value={String(summary.total_transactions)} sub={`avg ${((summary.avg_commission_rate || 0) * 100).toFixed(1)}% rate`} color="indigo" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={filterVendor}
          onChange={e => setFilterVendor(e.target.value)}
          placeholder="Filter by vendor workspace ID…"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={limitVal}
          onChange={e => setLimitVal(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="50">50 rows</option>
          <option value="200">200 rows</option>
          <option value="500">500 rows</option>
        </select>
        <button
          onClick={() => void load()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
        >
          Apply
        </button>
        {filterVendor && (
          <button
            onClick={() => setFilterVendor('')}
            className="text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg border border-gray-700 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-400 animate-pulse">Loading commissions…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Date', 'Vendor', 'Description', 'Gross', 'Rate', 'Commission', 'Net to Vendor', 'Payment ID'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-xs font-medium">{e.vendor_name || '—'}</p>
                      <p className="text-gray-500 text-xs">{e.vendor_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-[200px] truncate">{e.description}</td>
                    <td className="px-4 py-3 text-white font-medium">{cents(e.gross_amount)}</td>
                    <td className="px-4 py-3 text-gray-300">{((e.commission_rate || 0) * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-emerald-400 font-semibold">{cents(e.commission_amount)}</td>
                    <td className="px-4 py-3 text-gray-300">{cents(e.net_amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {e.stripe_payment_intent_id ? e.stripe_payment_intent_id.slice(0, 16) + '…' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && entries.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No commission transactions yet. They appear automatically when vendors charge clients through Stripe Connect.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const styles: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    indigo: 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400',
    gray: 'border-gray-600/30 bg-gray-700/20 text-gray-300',
  }
  return (
    <div className={`border rounded-xl p-4 ${styles[color] || ''}`}>
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${styles[color]?.split(' ').pop() || ''}`}>{value}</p>
      <p className="text-gray-500 text-xs mt-0.5">{sub}</p>
    </div>
  )
}
