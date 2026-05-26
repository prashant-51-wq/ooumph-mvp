'use client'

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'transactions' | 'subscriptions' | 'payouts'
type TxStatus = 'Succeeded' | 'Failed' | 'Pending' | 'Refunded'
type SubStatus = 'Active' | 'Past Due' | 'Cancelled' | 'Trialing'

interface Transaction {
  id: string
  customer: string
  email: string
  amount: number
  currency: string
  type: 'Subscription' | 'One-time' | 'Refund' | 'Credit'
  status: TxStatus
  card: string
  date: string
}

interface Subscription {
  id: string
  customer: string
  email: string
  plan: string
  mrr: number
  status: SubStatus
  startDate: string
  nextBilling: string
}

interface Payout {
  id: string
  date: string
  amount: number
  status: 'Paid' | 'In Transit' | 'Failed'
  bank: string
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

const TRANSACTIONS: Transaction[] = [
  { id: 'ch_1', customer: 'Acme Corp', email: 'billing@acme.com', amount: 29900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '4242', date: '2026-05-26 14:22' },
  { id: 'ch_2', customer: 'Sarah Chen', email: 'sarah@techco.io', amount: 9900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '1234', date: '2026-05-26 11:07' },
  { id: 'ch_3', customer: 'Bright Media', email: 'accounts@brightmedia.co', amount: 59900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '5678', date: '2026-05-25 18:45' },
  { id: 'ch_4', customer: 'Marcus Rivera', email: 'marcus@ventures.com', amount: 4900, currency: 'usd', type: 'One-time', status: 'Pending', card: '9999', date: '2026-05-25 09:30' },
  { id: 'ch_5', customer: 'DevStart Inc', email: 'pay@devstart.io', amount: 29900, currency: 'usd', type: 'Subscription', status: 'Failed', card: '3333', date: '2026-05-24 21:10' },
  { id: 'ch_6', customer: 'Nova Agency', email: 'finance@novaagency.com', amount: 29900, currency: 'usd', type: 'Refund', status: 'Refunded', card: '7777', date: '2026-05-23 15:55' },
  { id: 'ch_7', customer: 'Lyra Labs', email: 'team@lyralabs.com', amount: 59900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '2468', date: '2026-05-22 08:00' },
  { id: 'ch_8', customer: 'Pixel Studio', email: 'hello@pixelstudio.design', amount: 9900, currency: 'usd', type: 'One-time', status: 'Succeeded', card: '1357', date: '2026-05-21 12:30' },
  { id: 'ch_9', customer: 'Forge Systems', email: 'billing@forgesys.net', amount: 99900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '8642', date: '2026-05-20 16:15' },
  { id: 'ch_10', customer: 'Bloom Health', email: 'ops@bloomhealth.co', amount: 29900, currency: 'usd', type: 'Subscription', status: 'Succeeded', card: '0011', date: '2026-05-19 10:45' },
]

const SUBSCRIPTIONS: Subscription[] = [
  { id: 'sub_1', customer: 'Acme Corp', email: 'billing@acme.com', plan: 'Pro', mrr: 299, status: 'Active', startDate: '2025-11-01', nextBilling: '2026-06-01' },
  { id: 'sub_2', customer: 'Sarah Chen', email: 'sarah@techco.io', plan: 'Starter', mrr: 99, status: 'Active', startDate: '2026-01-15', nextBilling: '2026-06-15' },
  { id: 'sub_3', customer: 'Bright Media', email: 'accounts@brightmedia.co', plan: 'Enterprise', mrr: 599, status: 'Active', startDate: '2025-09-01', nextBilling: '2026-06-01' },
  { id: 'sub_4', customer: 'Lyra Labs', email: 'team@lyralabs.com', plan: 'Enterprise', mrr: 599, status: 'Active', startDate: '2026-02-01', nextBilling: '2026-06-01' },
  { id: 'sub_5', customer: 'Forge Systems', email: 'billing@forgesys.net', plan: 'Enterprise+', mrr: 999, status: 'Active', startDate: '2025-08-01', nextBilling: '2026-06-01' },
  { id: 'sub_6', customer: 'DevStart Inc', email: 'pay@devstart.io', plan: 'Pro', mrr: 299, status: 'Past Due', startDate: '2026-03-01', nextBilling: '2026-05-01' },
  { id: 'sub_7', customer: 'Nova Agency', email: 'finance@novaagency.com', plan: 'Pro', mrr: 299, status: 'Cancelled', startDate: '2025-12-01', nextBilling: '—' },
  { id: 'sub_8', customer: 'Bloom Health', email: 'ops@bloomhealth.co', plan: 'Pro', mrr: 299, status: 'Active', startDate: '2026-04-26', nextBilling: '2026-06-26' },
  { id: 'sub_9', customer: 'Apex Digital', email: 'billing@apexdigital.co', plan: 'Starter', mrr: 99, status: 'Trialing', startDate: '2026-05-19', nextBilling: '2026-06-19' },
  { id: 'sub_10', customer: 'Summit Labs', email: 'pay@summitlabs.io', plan: 'Starter', mrr: 99, status: 'Active', startDate: '2026-05-01', nextBilling: '2026-06-01' },
]

const PAYOUTS: Payout[] = [
  { id: 'po_1', date: '2026-05-22', amount: 18420, status: 'Paid', bank: '****7823' },
  { id: 'po_2', date: '2026-05-15', amount: 22110, status: 'Paid', bank: '****7823' },
  { id: 'po_3', date: '2026-05-08', amount: 19850, status: 'Paid', bank: '****7823' },
  { id: 'po_4', date: '2026-05-01', amount: 17300, status: 'Paid', bank: '****7823' },
  { id: 'po_5', date: '2026-04-24', amount: 16900, status: 'Paid', bank: '****7823' },
  { id: 'po_6', date: '2026-04-17', amount: 21050, status: 'Paid', bank: '****7823' },
]

const MONTHLY_REVENUE = [14200, 16400, 18900, 17800, 21200, 19600, 22800, 21500, 23900, 24800, 26100, 24800]
const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']
const MAX_MONTHLY = Math.max(...MONTHLY_REVENUE)

const FAILED_PAYMENT_RECOVERY = [
  { customer: 'DevStart Inc', email: 'pay@devstart.io', amount: 299, plan: 'Pro', failDate: '2026-05-24', attempts: 2 },
  { customer: 'Pixel Wave', email: 'billing@pixelwave.io', amount: 99, plan: 'Starter', failDate: '2026-05-22', attempts: 1 },
  { customer: 'Zara Growth', email: 'ops@zaragrowth.com', amount: 599, plan: 'Enterprise', failDate: '2026-05-20', attempts: 3 },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function fmtUSDirect(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

const TX_STATUS_STYLES: Record<TxStatus, string> = {
  Succeeded: 'bg-green-900/40 text-green-400 border-green-800',
  Failed: 'bg-red-900/40 text-red-400 border-red-800',
  Pending: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  Refunded: 'bg-gray-800 text-gray-400 border-gray-700',
}

const SUB_STATUS_STYLES: Record<SubStatus, string> = {
  Active: 'bg-green-900/40 text-green-400 border-green-800',
  'Past Due': 'bg-red-900/40 text-red-400 border-red-800',
  Cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
  Trialing: 'bg-blue-900/40 text-blue-400 border-blue-800',
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [testMode, setTestMode] = useState(true)

  // Transaction filters
  const [txSearch, setTxSearch] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus | 'All'>('All')
  const [txPage, setTxPage] = useState(0)
  const TX_PER_PAGE = 7

  // Refund modal
  const [refundModal, setRefundModal] = useState<Transaction | null>(null)
  const [refundNote, setRefundNote] = useState('')
  const [refundDone, setRefundDone] = useState<string | null>(null)

  const stripeConnected = true

  const filteredTx = TRANSACTIONS.filter(t => {
    if (txSearch && !t.customer.toLowerCase().includes(txSearch.toLowerCase()) &&
        !t.email.toLowerCase().includes(txSearch.toLowerCase())) return false
    if (txStatus !== 'All' && t.status !== txStatus) return false
    return true
  })

  const totalPages = Math.ceil(filteredTx.length / TX_PER_PAGE)
  const pagedTx = filteredTx.slice(txPage * TX_PER_PAGE, (txPage + 1) * TX_PER_PAGE)

  const mrr = SUBSCRIPTIONS.filter(s => s.status === 'Active').reduce((s, sub) => s + sub.mrr, 0)
  const arr = mrr * 12
  const totalRevenue = TRANSACTIONS.filter(t => t.status === 'Succeeded').reduce((s, t) => s + t.amount, 0)
  const revenueThisMonth = TRANSACTIONS.filter(t => t.status === 'Succeeded' && t.date.startsWith('2026-05')).reduce((s, t) => s + t.amount, 0)
  const avgTx = totalRevenue / TRANSACTIONS.filter(t => t.status === 'Succeeded').length
  const refundCount = TRANSACTIONS.filter(t => t.status === 'Refunded').length
  const refundRate = ((refundCount / TRANSACTIONS.length) * 100).toFixed(1)

  const planMRR: Record<string, { count: number; mrr: number }> = {}
  SUBSCRIPTIONS.filter(s => s.status === 'Active' || s.status === 'Trialing').forEach(s => {
    if (!planMRR[s.plan]) planMRR[s.plan] = { count: 0, mrr: 0 }
    planMRR[s.plan].count++
    planMRR[s.plan].mrr += s.mrr
  })

  const handleExportCSV = () => {
    const csv = [
      'Date,Customer,Email,Amount,Type,Status,Card',
      ...filteredTx.map(t =>
        `"${t.date}","${t.customer}","${t.email}","${fmtUSD(t.amount)}","${t.type}","${t.status}","****${t.card}"`
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'transactions.csv'
    a.click()
  }

  const handleRefundSubmit = () => {
    setRefundDone(refundModal!.id)
    setRefundModal(null)
    setRefundNote('')
  }

  return (
    <div className="p-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Payments & Revenue</h1>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
            stripeConnected
              ? 'bg-green-900/30 border-green-800 text-green-400'
              : 'bg-red-900/30 border-red-800 text-red-400'
          }`}>
            {stripeConnected ? '✅ Stripe Connected' : '❌ Stripe Not Connected'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
          >
            ⚙ Payment Settings
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors">
            📊 Revenue Report
          </button>
        </div>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'MRR', value: fmtUSDirect(mrr), sub: '+12% MoM' },
          { label: 'ARR', value: fmtUSDirect(arr), sub: 'Annualized' },
          { label: 'All-time Revenue', value: fmtUSD(totalRevenue), sub: 'since launch' },
          { label: 'Revenue This Month', value: fmtUSD(revenueThisMonth), sub: 'May 2026' },
          { label: 'Avg Transaction', value: fmtUSD(Math.round(avgTx)), sub: 'per charge' },
          { label: 'Refund Rate', value: `${refundRate}%`, sub: `${refundCount} refunds` },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-white text-lg font-bold leading-tight">{s.value}</p>
            <p className="text-gray-600 text-[10px] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([
          ['overview', 'Overview'],
          ['transactions', 'Transactions'],
          ['subscriptions', 'Subscriptions'],
          ['payouts', 'Payouts'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Revenue trend chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-semibold">Revenue Trend — Last 12 Months</p>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-600" />MRR</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-600" />New MRR</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-700" />Churned</div>
              </div>
            </div>
            <div className="flex items-end gap-1 h-32">
              {MONTHLY_REVENUE.map((rev, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div
                    className="w-full rounded-t bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
                    style={{ height: `${(rev / MAX_MONTHLY) * 120}px` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 z-10 text-center">
                    <p className="text-white text-xs font-semibold">{fmtUSDirect(rev)}</p>
                    <p className="text-gray-400 text-[10px]">{MONTHS[i]}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {MONTHS.map(m => (
                <span key={m} className="text-gray-600 text-[10px] flex-1 text-center">{m}</span>
              ))}
            </div>
          </div>

          {/* Today + breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Today's revenue */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col justify-between">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Today's Revenue</p>
              <div>
                <p className="text-4xl font-bold text-white mt-2">{fmtUSD(revenueThisMonth)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-green-400 text-sm font-semibold">+18%</span>
                  <span className="text-gray-500 text-xs">vs yesterday</span>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">Payment success rate</span>
                  <span className="text-green-400 font-semibold">94.2%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '94.2%' }} />
                </div>
              </div>
            </div>

            {/* Revenue breakdown */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {[
                { label: 'Subscriptions', value: fmtUSD(TRANSACTIONS.filter(t => t.type === 'Subscription' && t.status === 'Succeeded').reduce((s, t) => s + t.amount, 0)), icon: '🔄', color: 'text-indigo-400' },
                { label: 'One-time', value: fmtUSD(TRANSACTIONS.filter(t => t.type === 'One-time' && t.status === 'Succeeded').reduce((s, t) => s + t.amount, 0)), icon: '⚡', color: 'text-blue-400' },
                { label: 'Add-ons', value: '$0.00', icon: '➕', color: 'text-purple-400' },
                { label: 'Refunds', value: `–${fmtUSD(TRANSACTIONS.filter(t => t.status === 'Refunded').reduce((s, t) => s + t.amount, 0))}`, icon: '↩', color: 'text-red-400' },
              ].map(b => (
                <div key={b.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{b.icon}</span>
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{b.label}</p>
                  </div>
                  <p className={`text-xl font-bold ${b.color}`}>{b.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent transactions */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Recent Transactions</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Customer', 'Amount', 'Type', 'Status', 'Date'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRANSACTIONS.slice(0, 8).map(tx => (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-white text-sm font-medium">{tx.customer}</p>
                      <p className="text-gray-500 text-xs">{tx.email}</p>
                    </td>
                    <td className="px-5 py-3 text-white text-sm font-semibold">{fmtUSD(tx.amount)}</td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{tx.type}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TX_STATUS_STYLES[tx.status]}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{tx.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Transactions ─────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
              <input
                value={txSearch}
                onChange={e => { setTxSearch(e.target.value); setTxPage(0) }}
                placeholder="Search customer or email..."
                className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-1">
              {(['All', 'Succeeded', 'Pending', 'Failed', 'Refunded'] as (TxStatus | 'All')[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setTxStatus(s); setTxPage(0) }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    txStatus === s
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={handleExportCSV}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
            >
              ⬇ Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Customer', 'Amount', 'Type', 'Status', 'Payment Method', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedTx.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{tx.customer}</p>
                      <p className="text-gray-500 text-xs">{tx.email}</p>
                    </td>
                    <td className="px-4 py-3 text-white text-sm font-semibold">{fmtUSD(tx.amount)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{tx.type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TX_STATUS_STYLES[tx.status]}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-600 text-xs">💳</span>
                        <span className="text-gray-400 text-xs">••••{tx.card}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{tx.date}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors">
                          Receipt
                        </button>
                        {tx.status === 'Succeeded' && refundDone !== tx.id && (
                          <button
                            onClick={() => setRefundModal(tx)}
                            className="px-2.5 py-1 rounded-lg bg-red-900/30 border border-red-800 text-red-400 hover:text-red-300 text-xs transition-colors"
                          >
                            Refund
                          </button>
                        )}
                        {refundDone === tx.id && (
                          <span className="text-gray-500 text-xs">Refunded</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <p className="text-gray-500 text-xs">
                  Showing {txPage * TX_PER_PAGE + 1}–{Math.min((txPage + 1) * TX_PER_PAGE, filteredTx.length)} of {filteredTx.length}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setTxPage(p => Math.max(0, p - 1))}
                    disabled={txPage === 0}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs disabled:opacity-40 transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setTxPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={txPage === totalPages - 1}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs disabled:opacity-40 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Subscriptions ────────────────────────────────────────────── */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          {/* Plan breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { plan: 'Starter', price: 99 },
              { plan: 'Pro', price: 299 },
              { plan: 'Enterprise', price: 599 },
              { plan: 'Enterprise+', price: 999 },
            ].map(({ plan, price }) => {
              const info = planMRR[plan] || { count: 0, mrr: 0 }
              return (
                <div key={plan} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-white font-semibold text-sm">{plan}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{fmtUSDirect(price)}/mo</p>
                  <p className="text-2xl font-bold text-indigo-400 mt-3">{info.count}</p>
                  <p className="text-gray-500 text-xs">subscribers</p>
                  <p className="text-green-400 text-sm font-semibold mt-1">{fmtUSDirect(info.mrr)} MRR</p>
                </div>
              )
            })}
          </div>

          {/* Churn analysis */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Voluntary Churn', value: '1.2%', detail: '1 cancellation this month', color: 'text-yellow-400' },
              { label: 'Involuntary Churn', value: '0.8%', detail: '2 failed payment recoveries', color: 'text-orange-400' },
              { label: 'Net Churn Rate', value: '2.0%', detail: 'Target: <3%', color: 'text-green-400' },
            ].map(c => (
              <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-gray-600 text-xs mt-1">{c.detail}</p>
              </div>
            ))}
          </div>

          {/* Subscriptions table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Active Subscriptions</p>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors">
                  ⬇ Export
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-indigo-900 border border-indigo-700 text-indigo-300 hover:text-white text-xs transition-colors">
                  Send Payment Reminder
                </button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Customer', 'Plan', 'MRR', 'Status', 'Start Date', 'Next Billing'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUBSCRIPTIONS.map(sub => (
                  <tr key={sub.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{sub.customer}</p>
                      <p className="text-gray-500 text-xs">{sub.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{sub.plan}</td>
                    <td className="px-4 py-3 text-green-400 text-sm font-semibold">{fmtUSDirect(sub.mrr)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SUB_STATUS_STYLES[sub.status]}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{sub.startDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{sub.nextBilling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Failed payment recovery */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Failed Payment Recovery</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Customer', 'Plan', 'Amount', 'Failed Date', 'Attempts', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FAILED_PAYMENT_RECOVERY.map((f, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{f.customer}</p>
                      <p className="text-gray-500 text-xs">{f.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{f.plan}</td>
                    <td className="px-4 py-3 text-red-400 text-sm font-semibold">{fmtUSDirect(f.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{f.failDate}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-red-900/40 border border-red-800 text-red-400 text-xs">{f.attempts}x</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="px-3 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-800 text-indigo-400 hover:text-white text-xs transition-colors">
                        Send Recovery Email
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Payouts ──────────────────────────────────────────────────── */}
      {activeTab === 'payouts' && (
        <div className="space-y-6">
          {/* Top cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Next Estimated Payout</p>
              <p className="text-3xl font-bold text-white">$21,420</p>
              <p className="text-gray-400 text-xs mt-1">Estimated Jun 5, 2026</p>
              <p className="text-gray-600 text-xs mt-2">Stripe automatic schedule: Weekly (Fri)</p>
              <button className="mt-3 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs font-medium cursor-default" title="Processed through Stripe dashboard">
                Request Payout ↗
              </button>
              <p className="text-gray-600 text-[10px] mt-1">Processed through Stripe dashboard</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Balance Available</p>
              <p className="text-3xl font-bold text-green-400">$9,840</p>
              <p className="text-gray-400 text-xs mt-1">In Stripe — available now</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-green-400 text-xs">Live balance</span>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Payout Schedule</p>
              <p className="text-xl font-bold text-white">Weekly</p>
              <p className="text-gray-400 text-xs mt-1">Every Friday · USD → ****7823</p>
              <p className="text-gray-600 text-xs mt-2">2-business-day bank transfer</p>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Total paid out (all time)</span>
                  <span className="text-white font-semibold">{fmtUSD(PAYOUTS.reduce((s, p) => s + p.amount * 100, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payout history */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Payout History</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Date', 'Amount', 'Status', 'Bank Account'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-gray-500 text-xs font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAYOUTS.map(p => (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-gray-300 text-sm">{p.date}</td>
                    <td className="px-5 py-3 text-white text-sm font-semibold">{fmtUSDirect(p.amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        p.status === 'Paid' ? 'bg-green-900/40 text-green-400 border-green-800' :
                        p.status === 'In Transit' ? 'bg-blue-900/40 text-blue-400 border-blue-800' :
                        'bg-red-900/40 text-red-400 border-red-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs">🏦</span>
                        <span className="text-gray-400 text-sm font-mono">{p.bank}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payment Settings Slide-over ────────────────────────────────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
          <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-700 h-full overflow-y-auto z-10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Payment Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-6">
              {/* Stripe integration */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Stripe Integration</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Publishable Key</label>
                    <input
                      type="text"
                      defaultValue="pk_live_••••••••••••••••••••••••"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Secret Key</label>
                    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                      <p className="text-gray-500 text-xs italic">Secret key stored securely in environment — never displayed</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connected account */}
              <div className="bg-green-950/30 border border-green-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-green-400 text-sm">✅</span>
                  <p className="text-green-300 text-sm font-semibold">Connected Stripe Account</p>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account</span>
                    <span className="text-gray-200">Ooumph Inc.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Country</span>
                    <span className="text-gray-200">United States</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Default Currency</span>
                    <span className="text-gray-200">USD</span>
                  </div>
                </div>
              </div>

              {/* Mode toggle */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Mode</p>
                <div className="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-xl">
                  <div>
                    <p className="text-white text-sm font-medium">{testMode ? 'Test Mode' : 'Live Mode'}</p>
                    {!testMode && (
                      <p className="text-yellow-400 text-xs mt-0.5">⚠ Real payments are being processed</p>
                    )}
                  </div>
                  <button
                    onClick={() => setTestMode(v => !v)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${testMode ? 'bg-gray-600' : 'bg-indigo-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${testMode ? 'left-0.5' : 'left-6'}`} />
                  </button>
                </div>
              </div>

              {/* Webhook */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Webhook Endpoint</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value="https://app.ooumph.ai/api/webhooks/stripe"
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText('https://app.ooumph.ai/api/webhooks/stripe')}
                    className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-gray-600 text-xs mt-1.5">Add this URL to your Stripe webhook settings</p>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <button className="w-full px-4 py-2.5 rounded-xl bg-red-900/40 border border-red-800 text-red-400 hover:bg-red-900/60 text-sm font-medium transition-colors">
                  Disconnect Stripe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Refund Modal ──────────────────────────────────────────────────── */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-white font-bold text-lg mb-1">Confirm Refund</h2>
            <p className="text-gray-400 text-sm mb-4">
              Refund <span className="text-white font-semibold">{fmtUSD(refundModal.amount)}</span> to <span className="text-white font-semibold">{refundModal.customer}</span>?
            </p>
            <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl p-3 mb-4">
              <p className="text-yellow-300 text-xs">Refund will be processed via Stripe and may take 5–10 business days to appear.</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Note (optional)</label>
              <textarea
                value={refundNote}
                onChange={e => setRefundNote(e.target.value)}
                placeholder="Reason for refund..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRefundSubmit}
                className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
              >
                Process Refund
              </button>
              <button
                onClick={() => setRefundModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
