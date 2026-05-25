'use client'

import { useState, useEffect, useCallback } from 'react'

interface Plan {
  id: string
  name: string
  slug: string
  price_monthly: number
  price_yearly: number | null
  commission_rate: number
  max_sub_accounts: number
  max_ai_runs_monthly: number
  features: string | null
  stripe_price_id: string | null
}

interface Subscription {
  id: string
  status: string
  current_period_end: string
  cancel_at_period_end: number
  plan: Plan
  stripe_customer_id: string | null
}

function getWorkspaceId(): string {
  try {
    const ws = JSON.parse(localStorage.getItem('ooumph_workspace') || '{}') as { id?: string }
    return ws.id || localStorage.getItem('workspaceId') || ''
  } catch { return '' }
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`
}

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  const load = useCallback(async () => {
    const workspaceId = getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }

    const [subRes, plansRes] = await Promise.all([
      fetch(`/api/billing/subscribe?workspaceId=${workspaceId}`),
      fetch('/api/billing/plans'),
    ])

    if (subRes.ok) setSub(await subRes.json())
    if (plansRes.ok) setPlans(await plansRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleUpgrade(planId: string) {
    const workspaceId = getWorkspaceId()
    setUpgrading(planId)
    const res = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, planId }),
    })
    if (res.ok) {
      const data = await res.json() as { checkoutUrl?: string }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl
    }
    setUpgrading(null)
  }

  async function handlePortal() {
    const workspaceId = getWorkspaceId()
    setOpeningPortal(true)
    const res = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    if (res.ok) {
      const data = await res.json() as { portalUrl?: string }
      if (data.portalUrl) window.location.href = data.portalUrl
    }
    setOpeningPortal(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-gray-400 animate-pulse">Loading billing…</div>
    </div>
  )

  const currentPlanSlug = sub?.plan?.slug || 'free'
  const isActive = sub?.status === 'active' || sub?.status === 'trialing'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Billing & Plans</h1>
      <p className="text-gray-400 text-sm mb-8">Manage your subscription and upgrade at any time.</p>

      {/* Current subscription banner */}
      {sub && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-8 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Current Plan</p>
            <p className="text-white text-lg font-bold">{sub.plan?.name || 'Free'}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                sub.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                sub.status === 'trialing' ? 'bg-blue-500/20 text-blue-400' :
                'bg-gray-700/50 text-gray-400'
              }`}>
                {sub.status}
              </span>
              {sub.current_period_end && (
                <span className="text-gray-500 text-xs">
                  {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} {new Date(sub.current_period_end).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          {sub.stripe_customer_id && (
            <button
              onClick={() => void handlePortal()}
              disabled={openingPortal}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white text-sm px-5 py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {openingPortal ? 'Opening…' : 'Manage Subscription'}
            </button>
          )}
        </div>
      )}

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(plan => {
          const isCurrent = plan.slug === currentPlanSlug
          const isHigher = plan.price_monthly > (sub?.plan?.price_monthly || 0)
          const features = (() => { try { return JSON.parse(plan.features || '[]') as string[] } catch { return [] } })()

          return (
            <div
              key={plan.id}
              className={`border rounded-xl p-5 flex flex-col ${
                isCurrent
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : plan.slug === 'agency' || plan.slug === 'agency_scale'
                  ? 'border-purple-500/40 bg-purple-500/5'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-base">{plan.name}</h3>
                  {plan.commission_rate > 0 && (
                    <p className="text-xs text-amber-400 mt-0.5">{(plan.commission_rate * 100).toFixed(0)}% platform commission</p>
                  )}
                </div>
                {isCurrent && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-medium">Current</span>
                )}
                {plan.slug === 'agency_scale' && !isCurrent && (
                  <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded font-medium">Best Value</span>
                )}
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold text-white">{dollars(plan.price_monthly)}</span>
                <span className="text-gray-400 text-sm">/mo</span>
              </div>

              <ul className="space-y-1.5 mb-5 flex-1">
                <li className="flex items-center gap-2 text-gray-300 text-xs">
                  <span className="text-emerald-400">✓</span>
                  {plan.max_ai_runs_monthly === -1 ? 'Unlimited AI runs' : `${plan.max_ai_runs_monthly} AI runs/month`}
                </li>
                {plan.max_sub_accounts > 0 && (
                  <li className="flex items-center gap-2 text-gray-300 text-xs">
                    <span className="text-emerald-400">✓</span>
                    {plan.max_sub_accounts === -1 ? 'Unlimited client sub-accounts' : `Up to ${plan.max_sub_accounts} client accounts`}
                  </li>
                )}
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300 text-xs">
                    <span className="text-emerald-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button disabled className="w-full bg-gray-800 text-gray-500 text-sm py-2.5 rounded-lg font-medium cursor-not-allowed">
                  Current Plan
                </button>
              ) : plan.slug === 'free' ? (
                <button disabled className="w-full bg-gray-800 text-gray-500 text-sm py-2.5 rounded-lg font-medium cursor-not-allowed">
                  Free
                </button>
              ) : (
                <button
                  onClick={() => void handleUpgrade(plan.id)}
                  disabled={upgrading === plan.id}
                  className={`w-full text-white text-sm py-2.5 rounded-lg font-medium transition disabled:opacity-50 ${
                    plan.slug === 'agency' || plan.slug === 'agency_scale'
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {upgrading === plan.id ? 'Redirecting…' : isHigher ? 'Upgrade' : 'Switch'}
                </button>
              )}
            </div>
          )
        })}

        {plans.length === 0 && !loading && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            Plans not loaded. Ensure Stripe is configured and plans are seeded.
          </div>
        )}
      </div>

      {/* Stripe Connect info for agency plans */}
      {(currentPlanSlug === 'agency' || currentPlanSlug === 'agency_scale') && isActive && (
        <div className="mt-8 bg-purple-500/5 border border-purple-500/30 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-1">Agency Features Unlocked 🏢</h3>
          <p className="text-gray-400 text-sm mb-3">
            You can add clients, manage their accounts, and earn revenue from their subscriptions. Head to the Agency tab to get started.
          </p>
          <a href="/dashboard/agency" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
            Go to Agency Dashboard →
          </a>
        </div>
      )}

      {/* FAQ */}
      <div className="mt-10 space-y-4">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider">FAQ</h2>
        <FaqItem q="What is the platform commission?" a="On Agency plans, Ooumph takes a small percentage of every payment you collect from your clients through Stripe Connect. This happens automatically — no manual invoicing needed." />
        <FaqItem q="Can I cancel anytime?" a="Yes. You can cancel your subscription at any time through the billing portal. Your access continues until the end of the billing period." />
        <FaqItem q="How does client billing work?" a="Once you connect your Stripe account (via the Agency Dashboard), you can bill your clients directly. Ooumph automatically deducts the platform commission and transfers the rest to you." />
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3 flex items-center justify-between">
        <span className="text-gray-300 text-sm font-medium">{q}</span>
        <span className="text-gray-500 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="px-4 pb-3 text-gray-400 text-sm">{a}</p>}
    </div>
  )
}
