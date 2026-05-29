'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: string
  slug: string
  name: string
  price_monthly: number // in cents
  price_yearly?: number | null
  commission_rate?: number
  max_sub_accounts?: number
  max_ai_runs_monthly?: number
  features: string[] | string
  is_active?: number
  sort_order?: number
  stripe_price_id?: string | null
}

interface Subscription {
  plan_name: string
  plan_slug: string
  price_monthly: number
  status: string
  current_period_end?: string | null
  features?: string[] | string
}

// ADDONS const + AddonCard component removed Sprint 15F (P1 #15) — the
// grid was UI-only with no `/api/billing/addons` endpoint. Will reinstate
// once a real fulfilment path lands.

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDollars(cents: number): number {
  return Math.round((cents || 0) / 100)
}

function parseFeatures(features: string[] | string | undefined): string[] {
  if (!features) return []
  if (Array.isArray(features)) return features
  try {
    const parsed = JSON.parse(features)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

interface UsageData {
  used: number; limit: number; remaining: number
  planName: string; periodStart: string; periodEnd: string
  percent: number; nearLimit: boolean
}

/**
 * Sprint 16E (audit P1 #10) — current plan-period usage meter.
 *
 * Renders a progress bar + numeric counter sourced from
 * /api/billing/usage (which reads lib/quota.ts getAgentRunQuotaUsage).
 * Honest empty state when the workspace has no usage yet.
 */
function UsageMeter({ workspaceId }: { workspaceId: string | null }) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    fetch(`/api/billing/usage?workspaceId=${workspaceId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: UsageData | { error?: string }) => {
        if ('error' in data && !('used' in data)) {
          setError((data as { error?: string }).error || 'Unable to load usage')
        } else {
          setUsage(data as UsageData)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-white font-semibold text-lg mb-3">Usage this period</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-gray-500 text-sm">Loading…</div>
      </div>
    )
  }
  if (error || !usage) {
    return (
      <div className="mb-6">
        <h2 className="text-white font-semibold text-lg mb-3">Usage this period</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-gray-500 text-sm">
          {error || 'No usage data yet.'}
        </div>
      </div>
    )
  }

  const barColor = usage.percent >= 100
    ? 'bg-red-500'
    : usage.percent >= 80
      ? 'bg-amber-500'
      : 'bg-indigo-500'
  const period = `${new Date(usage.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(usage.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-white font-semibold text-lg">Usage this period</h2>
        <p className="text-gray-500 text-xs">{usage.planName} · {period}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="text-3xl font-bold text-white tabular-nums">{usage.used.toLocaleString()}</span>
            <span className="text-gray-500 text-sm ml-1">/ {usage.limit.toLocaleString()} AI runs</span>
          </div>
          <span className={`text-sm font-medium ${usage.percent >= 100 ? 'text-red-400' : usage.percent >= 80 ? 'text-amber-400' : 'text-gray-400'}`}>
            {usage.percent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${Math.min(100, usage.percent)}%` }} />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-gray-500">{usage.remaining.toLocaleString()} runs remaining</span>
          {usage.nearLimit && (
            <span className="text-amber-400">Approaching limit — consider upgrading.</span>
          )}
        </div>
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
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="px-4 pb-3 text-gray-400 text-sm">{a}</p>}
    </div>
  )
}

// AddonCard removed Sprint 15F (P1 #15) — see ADDONS removal note above.

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly')
  const [actioningSlug, setActioningSlug] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Init workspaceId
  useEffect(() => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    setWorkspaceId(wid)
  }, [])

  // Fetch plans + current subscription
  const fetchData = useCallback(async () => {
    setLoading(true)
    setPlansError(null)
    try {
      const plansRes = await fetch('/api/billing/plans')
      if (!plansRes.ok) {
        setPlansError(`Failed to load plans (HTTP ${plansRes.status})`)
        setPlans([])
      } else {
        const planRows = await plansRes.json() as Plan[]
        setPlans(planRows)
      }

      if (workspaceId) {
        const subRes = await fetch(`/api/billing/subscribe?workspaceId=${workspaceId}`)
        if (subRes.ok) {
          const sub = await subRes.json() as Subscription | null
          setSubscription(sub)
        }
      }
    } catch (err) {
      setPlansError(`Failed to load plans: ${String(err)}`)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function handleUpgrade(planSlug: string) {
    if (!workspaceId) {
      setActionError('No workspace loaded. Please reload the page.')
      return
    }
    setActioningSlug(planSlug)
    setActionError(null)
    try {
      // Pull email/name if available
      let email: string | undefined
      let name: string | undefined
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' })
        if (meRes.ok) {
          const me = await meRes.json() as { user?: { email?: string; name?: string } }
          email = me.user?.email
          name = me.user?.name
        }
      } catch { /* non-fatal */ }

      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, planSlug, email, name }),
      })
      const data = await res.json() as { ok?: boolean; url?: string; error?: string; requiresSetup?: boolean }
      if (data.url) {
        window.location.href = data.url
      } else {
        setActionError(data.error || 'Could not start checkout.')
      }
    } catch (err) {
      setActionError(`Error: ${String(err)}`)
    } finally {
      setActioningSlug(null)
    }
  }

  async function handlePortal() {
    if (!workspaceId) {
      setActionError('No workspace loaded.')
      return
    }
    setPortalLoading(true)
    setActionError(null)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { ok?: boolean; url?: string; error?: string }
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        setActionError(data.error || 'Could not open billing portal. You may not have an active subscription yet.')
      }
    } catch (err) {
      setActionError(`Error: ${String(err)}`)
    } finally {
      setPortalLoading(false)
    }
  }

  // Derived current plan info
  const currentPlanSlug = subscription?.plan_slug
  const currentPlanName = subscription?.plan_name || 'Free'
  const currentPriceMo = centsToDollars(subscription?.price_monthly || 0)
  const currentFeatures = parseFeatures(subscription?.features)

  // Loading state
  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 text-gray-400 text-sm py-20 justify-center">
          <span className="w-4 h-4 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
          Loading billing details…
        </div>
      </div>
    )
  }

  // Error state
  if (plansError || !plans) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-red-950/40 border border-red-900 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-white font-bold text-lg mb-2">Couldn&apos;t load billing</h2>
          <p className="text-red-300 text-sm mb-4">{plansError}</p>
          <button onClick={() => void fetchData()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Empty state — no plans configured at all
  if (plans.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-3">💳</div>
          <h2 className="text-white font-bold text-lg mb-2">No plans configured</h2>
          <p className="text-gray-400 text-sm">Contact <a href="mailto:support@ooumph.com" className="text-indigo-400 hover:underline">support@ooumph.com</a> to get plans set up.</p>
        </div>
      </div>
    )
  }

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
            {currentPlanName} Plan · ${currentPriceMo}/mo
          </span>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {portalLoading ? 'Opening…' : 'Manage Subscription'}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-950/40 border border-red-900 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 mt-0.5 text-lg">⚠</span>
          <p className="text-red-300 text-sm flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* ── Current Plan Card ── */}
      <div className="bg-gray-900 border border-indigo-500/40 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">{currentPlanName} Plan</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subscription?.status === 'active' || subscription?.status === 'trialing' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-300'}`}>
                {subscription?.status === 'trialing' ? 'Trial' : (subscription?.status || 'Free')}
              </span>
            </div>

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
                ${billingCycle === 'monthly' ? currentPriceMo : Math.round(currentPriceMo * 0.8)}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
              {billingCycle === 'annually' && currentPriceMo > 0 && (
                <span className="ml-2 text-gray-500 text-sm">(billed ${currentPriceMo * 12 * 0.8}/year)</span>
              )}
            </div>

            {currentFeatures.length > 0 ? (
              <ul className="grid grid-cols-2 gap-y-2 gap-x-6 mb-6">
                {currentFeatures.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-emerald-400 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm mb-6">No features listed for this plan.</p>
            )}

            {subscription?.current_period_end && (
              <div className="flex items-center gap-4 text-sm">
                <p className="text-gray-400">
                  Next billing: <span className="text-white font-medium">{new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <span className="text-gray-500"> · ${currentPriceMo}.00</span>
                </p>
              </div>
            )}
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
                  <th className="text-left px-5 py-4 text-gray-400 text-sm font-medium w-40">Plan</th>
                  {plans.map(plan => {
                    const isCurrent = plan.slug === currentPlanSlug
                    const priceMo = centsToDollars(plan.price_monthly)
                    const priceShown = billingCycle === 'annually' ? Math.round(priceMo * 0.8) : priceMo
                    return (
                      <th
                        key={plan.id}
                        className={`px-5 py-4 text-center ${isCurrent ? 'bg-indigo-600/10' : ''}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {isCurrent && (
                            <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">Current Plan</span>
                          )}
                          <span className="text-white font-semibold text-sm">{plan.name}</span>
                          <span className="text-indigo-300 font-bold text-lg">
                            ${priceShown}
                            <span className="text-gray-500 font-normal text-xs">/mo</span>
                          </span>
                          {isCurrent ? (
                            <span className="text-gray-500 text-xs">Your plan</span>
                          ) : priceMo > currentPriceMo ? (
                            <button
                              onClick={() => void handleUpgrade(plan.slug)}
                              disabled={actioningSlug === plan.slug}
                              className="mt-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                            >
                              {actioningSlug === plan.slug ? 'Loading…' : `Upgrade to ${plan.name}`}
                            </button>
                          ) : priceMo === 0 ? (
                            <button
                              onClick={handlePortal}
                              disabled={portalLoading}
                              className="mt-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                              Downgrade
                            </button>
                          ) : (
                            <button
                              onClick={handlePortal}
                              disabled={portalLoading}
                              className="mt-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                              Switch
                            </button>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Show union of features as rows */}
                {(() => {
                  const allFeatures = new Set<string>()
                  plans.forEach(p => parseFeatures(p.features).forEach(f => allFeatures.add(f)))
                  const featureList = Array.from(allFeatures)
                  if (featureList.length === 0) {
                    return (
                      <tr>
                        <td colSpan={plans.length + 1} className="px-5 py-8 text-center text-gray-500 text-sm">
                          No feature comparison configured.
                        </td>
                      </tr>
                    )
                  }
                  return featureList.map((feat, i) => (
                    <tr
                      key={feat}
                      className={`border-b border-gray-800/60 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}
                    >
                      <td className="px-5 py-3 text-gray-400 text-sm">{feat}</td>
                      {plans.map(plan => {
                        const has = parseFeatures(plan.features).includes(feat)
                        const isCurrent = plan.slug === currentPlanSlug
                        return (
                          <td
                            key={plan.id}
                            className={`px-5 py-3 text-center ${isCurrent ? 'bg-indigo-600/5' : ''}`}
                          >
                            {has
                              ? <span className="text-emerald-400 text-base">✓</span>
                              : <span className="text-gray-600 text-base">✕</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sprint 16E (P1 #10): real usage meter consuming /api/billing/usage,
          which exposes lib/quota.ts getAgentRunQuotaUsage() — previously a
          dead export with no UI consumer. */}
      <UsageMeter workspaceId={workspaceId} />

      {/* ── Add-ons removed Sprint 15F (P1 #15) ──
          The grid was UI-only — clicking "Add" just toggled local state and
          no `/api/billing/addons` endpoint existed. Honest move was to ship
          it or remove it; we removed pending a real fulfilment story. */}

      {/* ── Payment Methods ── */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-4">Payment Methods</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
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
                <p className="text-white text-sm font-medium">Card on file</p>
                <p className="text-gray-500 text-xs">Managed by Stripe</p>
              </div>
            </div>
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {portalLoading ? 'Opening…' : 'Update via Stripe Portal'}
            </button>
          </div>

          <p className="text-gray-600 text-xs">For PCI compliance, Ooumph never stores or displays card data. Manage all payment methods directly in your secure Stripe billing portal.</p>
        </div>
      </div>

      {/* ── Invoices ── */}
      <div>
        <h2 className="text-white font-semibold text-lg mb-4">Invoices &amp; Payment History</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🧾</span>
            <div>
              <p className="text-white text-sm font-medium">Invoices are managed in your Stripe Customer Portal</p>
              <p className="text-gray-500 text-xs mt-1">Download PDFs, view payment history, and update billing details securely.</p>
            </div>
          </div>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {portalLoading ? 'Opening…' : 'Open Billing Portal →'}
          </button>
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
