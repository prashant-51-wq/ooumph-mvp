'use client'

import { useState } from 'react'

// ── Mock data ──────────────────────────────────────────────────────────────────

const CURRENT_PLAN = {
  name: 'Agency',
  price_monthly: 297,
  price_annually: 238, // 20% off
  clients: { used: 8, max: 10 },
  team: { used: 3, max: 5 },
  storage: { used: 4.2, max: 10 },
  ai_requests: { used: 4230, max: 10000 },
  next_billing: 'June 26, 2026',
  next_amount: 297,
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price_monthly: 49,
    price_annually: 39,
    clients: '1',
    team: '1',
    ai_requests: '1,000',
    image_gen: '200',
    video_gen: '5',
    voice_minutes: '30',
    storage: '2GB',
    white_label: false,
    custom_domain: false,
    priority_support: false,
    byok: false,
    api_access: false,
    super_admin: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price_monthly: 97,
    price_annually: 78,
    clients: '3',
    team: '2',
    ai_requests: '5,000',
    image_gen: '500',
    video_gen: '20',
    voice_minutes: '60',
    storage: '5GB',
    white_label: false,
    custom_domain: false,
    priority_support: false,
    byok: true,
    api_access: true,
    super_admin: false,
  },
  {
    id: 'agency',
    name: 'Agency',
    price_monthly: 297,
    price_annually: 238,
    clients: '10',
    team: '5',
    ai_requests: '10,000',
    image_gen: '2,000',
    video_gen: '50',
    voice_minutes: '120',
    storage: '10GB',
    white_label: true,
    custom_domain: true,
    priority_support: true,
    byok: true,
    api_access: true,
    super_admin: false,
    current: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly: 797,
    price_annually: 638,
    clients: 'Unlimited',
    team: 'Unlimited',
    ai_requests: 'Unlimited',
    image_gen: 'Unlimited',
    video_gen: 'Unlimited',
    voice_minutes: 'Unlimited',
    storage: '100GB',
    white_label: true,
    custom_domain: true,
    priority_support: true,
    byok: true,
    api_access: true,
    super_admin: true,
  },
]

const ADDONS = [
  {
    id: 'ai_1k',
    name: '+1,000 AI Requests',
    description: 'Extra AI request credits',
    price: 19,
    unit: 'mo',
  },
  {
    id: 'ai_5k',
    name: '+5,000 AI Requests',
    description: 'Bulk AI request credits',
    price: 79,
    unit: 'mo',
  },
  {
    id: 'storage',
    name: '+10GB Storage',
    description: 'Extra cloud storage',
    price: 9,
    unit: 'mo',
  },
  {
    id: 'client_seat',
    name: 'Extra Client Seat',
    description: 'Add one more client account',
    price: 29,
    unit: 'mo / seat',
  },
  {
    id: 'team_member',
    name: 'Extra Team Member',
    description: 'Add one more team member',
    price: 15,
    unit: 'mo / member',
  },
]

const INVOICES = [
  { date: 'May 26, 2026', description: 'Agency Plan – May 2026', amount: '$297.00', status: 'Paid', id: 'INV-2026-05' },
  { date: 'Apr 26, 2026', description: 'Agency Plan – April 2026', amount: '$297.00', status: 'Paid', id: 'INV-2026-04' },
  { date: 'Mar 26, 2026', description: 'Agency Plan – March 2026', amount: '$297.00', status: 'Paid', id: 'INV-2026-03' },
  { date: 'Feb 26, 2026', description: 'Agency Plan – February 2026', amount: '$297.00', status: 'Paid', id: 'INV-2026-02' },
  { date: 'Jan 26, 2026', description: 'Agency Plan – January 2026', amount: '$297.00', status: 'Paid', id: 'INV-2026-01' },
  { date: 'Dec 26, 2025', description: 'Agency Plan – December 2025', amount: '$297.00', status: 'Paid', id: 'INV-2025-12' },
]

const CREDIT_USAGE = [
  { type: 'Content Generation', credits: 1240, color: 'bg-indigo-500' },
  { type: 'Strategy Planning', credits: 890, color: 'bg-purple-500' },
  { type: 'Image Generation', credits: 450, color: 'bg-pink-500' },
  { type: 'Voice Synthesis', credits: 380, color: 'bg-amber-500' },
  { type: 'SEO Analysis', credits: 240, color: 'bg-emerald-500' },
  { type: 'Analytics Reports', credits: 230, color: 'bg-blue-500' },
]

const HISTORY = [
  { date: 'May 26, 2026', description: 'Monthly subscription charge', method: 'Visa ••••4242', amount: '$297.00', status: 'Succeeded' },
  { date: 'Apr 26, 2026', description: 'Monthly subscription charge', method: 'Visa ••••4242', amount: '$297.00', status: 'Succeeded' },
  { date: 'Mar 30, 2026', description: 'AI Credit Pack – 1,000 credits', method: 'Visa ••••4242', amount: '$19.00', status: 'Succeeded' },
  { date: 'Mar 26, 2026', description: 'Monthly subscription charge', method: 'Visa ••••4242', amount: '$297.00', status: 'Succeeded' },
  { date: 'Feb 26, 2026', description: 'Monthly subscription charge', method: 'Visa ••••4242', amount: '$297.00', status: 'Succeeded' },
  { date: 'Jan 26, 2026', description: 'Monthly subscription charge', method: 'Visa ••••4242', amount: '$297.00', status: 'Succeeded' },
]

// ── Feature row helpers ────────────────────────────────────────────────────────

function Check({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value
      ? <span className="text-emerald-400 text-base">✓</span>
      : <span className="text-gray-600 text-base">✕</span>
  }
  return <span className="text-gray-300 text-sm">{value}</span>
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3 flex items-center justify-between">
        <span className="text-gray-300 text-sm font-medium">{q}</span>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="px-4 pb-3 text-gray-400 text-sm">{a}</p>}
    </div>
  )
}

function AddonCard({ addon }: { addon: typeof ADDONS[0] }) {
  const [qty, setQty] = useState(0)
  const [added, setAdded] = useState(false)
  function handleAdd() {
    if (qty === 0) setQty(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <p className="text-white font-medium text-sm">{addon.name}</p>
        <p className="text-gray-500 text-xs mt-0.5">{addon.description}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-indigo-300 font-semibold text-sm">${addon.price}<span className="text-gray-500 font-normal text-xs">/{addon.unit}</span></span>
        <div className="flex items-center gap-2">
          {qty > 0 && (
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg border border-gray-700">
              <button onClick={() => setQty(q => Math.max(0, q - 1))} className="px-2 py-1 text-gray-400 hover:text-white text-sm transition-colors">−</button>
              <span className="text-white text-sm w-5 text-center">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="px-2 py-1 text-gray-400 hover:text-white text-sm transition-colors">+</button>
            </div>
          )}
          <button
            onClick={handleAdd}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              added
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {added ? 'Added' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly')
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview')
  const [portalNote, setPortalNote] = useState(false)

  const totalCreditsUsed = CREDIT_USAGE.reduce((s, c) => s + c.credits, 0)
  const creditsRemaining = 5770
  const totalCredits = creditsRemaining + totalCreditsUsed

  const TABLE_FEATURES = [
    { label: 'Clients', key: 'clients' },
    { label: 'Team Members', key: 'team' },
    { label: 'AI Requests/mo', key: 'ai_requests' },
    { label: 'Image Generation', key: 'image_gen' },
    { label: 'Video Generation', key: 'video_gen' },
    { label: 'Voice Minutes', key: 'voice_minutes' },
    { label: 'Storage', key: 'storage' },
    { label: 'White-label', key: 'white_label' },
    { label: 'Custom Domain', key: 'custom_domain' },
    { label: 'Priority Support', key: 'priority_support' },
    { label: 'BYOK', key: 'byok' },
    { label: 'API Access', key: 'api_access' },
    { label: 'Super Admin', key: 'super_admin' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing &amp; Plans</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your subscription, add-ons, and invoices.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-sm px-3 py-1 rounded-full font-medium">
            Agency Plan · $297/mo
          </span>
          <button
            onClick={() => setPortalNote(v => !v)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage Subscription
          </button>
        </div>
      </div>

      {portalNote && (
        <div className="bg-indigo-950/60 border border-indigo-700/50 rounded-xl p-4 flex items-start gap-3">
          <span className="text-indigo-400 mt-0.5 text-lg">ℹ</span>
          <div>
            <p className="text-indigo-200 text-sm font-medium">Secure Billing Portal</p>
            <p className="text-indigo-300/70 text-sm mt-0.5">You will be redirected to our secure Stripe billing portal to manage your subscription, update payment methods, or cancel.</p>
          </div>
          <button onClick={() => setPortalNote(false)} className="ml-auto text-indigo-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* ── Current Plan Card ── */}
      <div className="bg-gray-900 border border-indigo-500/40 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">

          {/* Plan info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">Agency Plan</h2>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
            </div>

            {/* Billing toggle */}
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}
              >Monthly</button>
              <button
                onClick={() => setBillingCycle('annually')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${billingCycle === 'annually' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}
              >
                Annually
                <span className="bg-emerald-500/20 text-emerald-400 text-xs px-1.5 py-0.5 rounded font-medium">Save 20%</span>
              </button>
            </div>

            <div className="mb-5">
              <span className="text-4xl font-bold text-white">
                ${billingCycle === 'monthly' ? CURRENT_PLAN.price_monthly : CURRENT_PLAN.price_annually}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
              {billingCycle === 'annually' && (
                <span className="ml-2 text-gray-500 text-sm">(billed $2,856/year)</span>
              )}
            </div>

            {/* Features */}
            <ul className="grid grid-cols-2 gap-y-2 gap-x-6 mb-6">
              {[
                'Up to 10 clients', 'Up to 5 team members', '10,000 AI requests/mo',
                '2,000 image generations', '50 video generations', '120 voice minutes',
                '10GB storage', 'White-label dashboard', 'Custom domain', 'Priority support',
                'BYOK (Bring Your Own Key)', 'Full API access',
              ].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-emerald-400 flex-shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-4 text-sm">
              <p className="text-gray-400">
                Next billing: <span className="text-white font-medium">{CURRENT_PLAN.next_billing}</span>
                <span className="text-gray-500"> · ${CURRENT_PLAN.next_amount}.00</span>
              </p>
            </div>
          </div>

          {/* Usage summary */}
          <div className="lg:w-72 space-y-4">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Usage This Cycle</h3>

            {[
              { label: 'Clients', used: CURRENT_PLAN.clients.used, max: CURRENT_PLAN.clients.max, unit: '', color: 'bg-indigo-500' },
              { label: 'Team Members', used: CURRENT_PLAN.team.used, max: CURRENT_PLAN.team.max, unit: '', color: 'bg-purple-500' },
              { label: 'AI Requests', used: CURRENT_PLAN.ai_requests.used, max: CURRENT_PLAN.ai_requests.max, unit: '', color: 'bg-pink-500' },
              { label: 'Storage', used: CURRENT_PLAN.storage.used, max: CURRENT_PLAN.storage.max, unit: 'GB', color: 'bg-amber-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{item.label}</span>
                  <span>{item.used}{item.unit} / {item.max}{item.unit}</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all`}
                    style={{ width: `${Math.min(100, (item.used / item.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="pt-2 space-y-2">
              <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Upgrade to Enterprise
              </button>
              <button className="w-full text-gray-500 hover:text-gray-300 text-xs py-1 transition-colors">
                Downgrade plan
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Plans Comparison ── */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-4">Compare Plans</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-4 text-gray-400 text-sm font-medium w-40">Feature</th>
                  {PLANS.map(plan => (
                    <th
                      key={plan.id}
                      className={`px-5 py-4 text-center ${plan.current ? 'bg-indigo-600/10' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {plan.current && (
                          <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">Current Plan</span>
                        )}
                        <span className="text-white font-semibold text-sm">{plan.name}</span>
                        <span className="text-indigo-300 font-bold text-lg">
                          ${billingCycle === 'monthly' ? plan.price_monthly : plan.price_annually}
                          <span className="text-gray-500 font-normal text-xs">/mo</span>
                        </span>
                        {plan.current ? (
                          <span className="text-gray-500 text-xs">Your plan</span>
                        ) : plan.price_monthly > 297 ? (
                          <button className="mt-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors">
                            Upgrade
                          </button>
                        ) : (
                          <button className="mt-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1 rounded-lg font-medium transition-colors">
                            Downgrade
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_FEATURES.map((feat, i) => (
                  <tr
                    key={feat.key}
                    className={`border-b border-gray-800/60 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}
                  >
                    <td className="px-5 py-3 text-gray-400 text-sm">{feat.label}</td>
                    {PLANS.map(plan => (
                      <td
                        key={plan.id}
                        className={`px-5 py-3 text-center ${plan.current ? 'bg-indigo-600/5' : ''}`}
                      >
                        <Check value={(plan as Record<string, unknown>)[feat.key] as boolean | string} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Add-ons ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Add-ons</h2>
          <p className="text-gray-500 text-sm">Extend your plan without upgrading</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {ADDONS.map(addon => (
            <AddonCard key={addon.id} addon={addon} />
          ))}
        </div>
      </div>

      {/* ── Payment Methods ── */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-4">Payment Methods</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          {/* Current card — display only, last 4 digits */}
          <div className="flex items-center justify-between py-3 border border-gray-700 rounded-xl px-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-2">
                <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="5" width="20" height="14" rx="2" className="opacity-30" />
                  <path d="M2 10h20" stroke="currentColor" strokeWidth="2" fill="none" />
                  <rect x="5" y="14" width="4" height="2" rx="0.5" />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Visa ending in 4242</p>
                <p className="text-gray-500 text-xs">Expires 12/27</p>
              </div>
            </div>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium">Primary</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setPortalNote(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Payment Method
            </button>
            <button
              onClick={() => setPortalNote(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Update Billing Info
            </button>
            <p className="text-gray-600 text-xs">You'll be redirected to our secure billing portal</p>
          </div>
        </div>
      </div>

      {/* ── Invoices + History tabs ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Payment History
            </button>
          </div>
          <button className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <span>↓</span> Export All Invoices
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Date', 'Description', 'Amount', 'Status', 'Download'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INVOICES.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-300">{inv.date}</td>
                    <td className="px-5 py-3 text-sm text-white">{inv.description}</td>
                    <td className="px-5 py-3 text-sm text-white font-medium">{inv.amount}</td>
                    <td className="px-5 py-3">
                      <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">{inv.status}</span>
                    </td>
                    <td className="px-5 py-3">
                      <button className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1v9M4 7l4 4 4-4M3 13h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Date', 'Description', 'Method', 'Amount', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HISTORY.map((h, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-300">{h.date}</td>
                    <td className="px-5 py-3 text-sm text-white">{h.description}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{h.method}</td>
                    <td className="px-5 py-3 text-sm text-white font-medium">{h.amount}</td>
                    <td className="px-5 py-3">
                      <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Credits & Usage ── */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-4">Credits &amp; Usage</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Balance */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">AI Credit Balance</h3>
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                Buy More Credits
              </button>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-bold text-white">{creditsRemaining.toLocaleString()}</span>
              <span className="text-gray-400 text-sm pb-1">credits remaining</span>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                style={{ width: `${(creditsRemaining / totalCredits) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{totalCreditsUsed.toLocaleString()} used this month</span>
              <span>{totalCredits.toLocaleString()} total</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-medium mb-4">Usage by Feature</h3>
            <div className="space-y-3">
              {CREDIT_USAGE.map(item => (
                <div key={item.type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{item.type}</span>
                    <span className="text-gray-300 font-medium">{item.credits.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: `${(item.credits / totalCreditsUsed) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div>
        <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">FAQ</h2>
        <div className="space-y-3">
          <FaqItem
            q="Can I cancel anytime?"
            a="Yes. You can cancel your subscription at any time through the billing portal. Your access continues until the end of the current billing period — no partial refunds."
          />
          <FaqItem
            q="What happens when I hit my AI request limit?"
            a="You'll receive an in-app alert at 80% usage. Once the limit is reached, AI-powered features pause until the next cycle or until you purchase a credit pack add-on."
          />
          <FaqItem
            q="How does annual billing work?"
            a="Annual plans are billed as a single payment at the start of each year, saving you 20% vs. monthly. Upgrades and downgrades are prorated automatically."
          />
          <FaqItem
            q="Can I change plans mid-cycle?"
            a="Yes. Upgrades take effect immediately and are prorated. Downgrades apply at the next billing date to avoid losing access mid-cycle."
          />
          <FaqItem
            q="Is my payment data secure?"
            a="Ooumph never stores card data. All payments are processed securely by Stripe. You can manage payment methods directly in the Stripe billing portal."
          />
        </div>
      </div>

    </div>
  )
}
