'use client'

import { useState, useEffect, useCallback } from 'react'

type Provider = 'stripe' | 'razorpay'
type ActiveTab = 'create' | 'links' | 'revenue'

interface CreatedLink {
  url: string
  id: string
  amount?: number
}

function formatCurrency(amount: number, currency: string): string {
  const curr = currency.toUpperCase()
  // Razorpay uses paise (1/100 of INR), Stripe uses cents (1/100 of currency unit)
  const value = amount / 100
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: curr,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  try {
    return formatter.format(value)
  } catch {
    return `${curr} ${value.toFixed(2)}`
  }
}

export default function PaymentsPage() {
  const [provider, setProvider] = useState<Provider>('stripe')
  const [activeTab, setActiveTab] = useState<ActiveTab>('create')
  const [workspaceId, setWorkspaceId] = useState('')

  // Create form state
  const [form, setForm] = useState({
    productName: '',
    amount: '',
    currency: 'usd',
    description: '',
    useCheckout: false,
    successUrl: '',
    cancelUrl: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    callbackUrl: '',
  })
  const [creating, setCreating] = useState(false)
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null)
  const [createError, setCreateError] = useState('')
  const [copied, setCopied] = useState(false)

  // Links state
  const [links, setLinks] = useState<any[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linksError, setLinksError] = useState('')
  const [linksSetupRequired, setLinksSetupRequired] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState('')

  // Revenue state
  const [revenueStats, setRevenueStats] = useState<any>(null)
  const [revenueDays, setRevenueDays] = useState(30)
  const [loadingRevenue, setLoadingRevenue] = useState(false)
  const [revenueError, setRevenueError] = useState('')
  const [revenueSetupRequired, setRevenueSetupRequired] = useState(false)

  useEffect(() => {
    setWorkspaceId(localStorage.getItem('workspaceId') || '')
  }, [])

  // When provider changes, reset currency default
  useEffect(() => {
    setForm(f => ({ ...f, currency: provider === 'razorpay' ? 'inr' : 'usd' }))
    setCreatedLink(null)
    setCreateError('')
    setLinks([])
    setLinksError('')
    setLinksSetupRequired(false)
    setRevenueStats(null)
    setRevenueError('')
    setRevenueSetupRequired(false)
  }, [provider])

  const updateForm = (field: string, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }))

  // ── Create Payment Link ────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!workspaceId) return
    setCreating(true)
    setCreateError('')
    setCreatedLink(null)

    try {
      if (provider === 'stripe') {
        const amountCents = Math.round(parseFloat(form.amount) * 100)
        const action = form.useCheckout ? 'create_checkout' : 'create_link'
        const body: any = {
          workspaceId,
          action,
          productName: form.productName,
          amountCents,
          currency: form.currency,
          description: form.description || undefined,
        }
        if (form.useCheckout) {
          body.successUrl = form.successUrl || undefined
          body.cancelUrl = form.cancelUrl || undefined
        }
        const res = await fetch('/api/agents/payments/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!data.ok) {
          setCreateError(data.error || 'Failed to create link')
          return
        }
        const linkData = data.link || data.session
        setCreatedLink({ id: linkData.id, url: linkData.url, amount: amountCents })
      } else {
        // Razorpay — amount in paise
        const amountPaise = Math.round(parseFloat(form.amount) * 100)
        const body: any = {
          workspaceId,
          action: 'create_link',
          amountPaise,
          description: form.description || undefined,
          customerName: form.customerName || undefined,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone || undefined,
          callbackUrl: form.callbackUrl || undefined,
        }
        const res = await fetch('/api/agents/payments/razorpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!data.ok) {
          setCreateError(data.error || 'Failed to create link')
          return
        }
        setCreatedLink({
          id: data.link.id,
          url: data.link.short_url,
          amount: data.link.amount,
        })
      }
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async (url: string, id?: string) => {
    await navigator.clipboard.writeText(url)
    if (id) {
      setCopiedLinkId(id)
      setTimeout(() => setCopiedLinkId(''), 2000)
    } else {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Load Links ─────────────────────────────────────────────────────────────
  const loadLinks = useCallback(async () => {
    if (!workspaceId) return
    setLoadingLinks(true)
    setLinksError('')
    setLinksSetupRequired(false)
    try {
      const endpoint = provider === 'stripe'
        ? '/api/agents/payments/stripe'
        : '/api/agents/payments/razorpay'
      const body = provider === 'stripe'
        ? { workspaceId, action: 'list_links', limit: 20 }
        : { workspaceId, action: 'list_links', count: 20 }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.requiresSetup) { setLinksSetupRequired(true); return }
      if (!data.ok) { setLinksError(data.error || 'Failed to load links'); return }
      setLinks(data.links || [])
    } catch (e) {
      setLinksError(String(e))
    } finally {
      setLoadingLinks(false)
    }
  }, [workspaceId, provider])

  // ── Load Revenue ───────────────────────────────────────────────────────────
  const loadRevenue = useCallback(async () => {
    if (!workspaceId) return
    setLoadingRevenue(true)
    setRevenueError('')
    setRevenueSetupRequired(false)
    try {
      if (provider === 'stripe') {
        const res = await fetch('/api/agents/payments/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, action: 'revenue', days: revenueDays }),
        })
        const data = await res.json()
        if (data.requiresSetup) { setRevenueSetupRequired(true); return }
        if (!data.ok) { setRevenueError(data.error || 'Failed to load revenue'); return }
        setRevenueStats(data.stats)
      } else {
        const res = await fetch('/api/agents/payments/razorpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, action: 'stats' }),
        })
        const data = await res.json()
        if (data.requiresSetup) { setRevenueSetupRequired(true); return }
        if (!data.ok) { setRevenueError(data.error || 'Failed to load stats'); return }
        setRevenueStats(data.stats)
      }
    } catch (e) {
      setRevenueError(String(e))
    } finally {
      setLoadingRevenue(false)
    }
  }, [workspaceId, provider, revenueDays])

  useEffect(() => {
    if (activeTab === 'links' && workspaceId) loadLinks()
  }, [activeTab, workspaceId, loadLinks])

  useEffect(() => {
    if (activeTab === 'revenue' && workspaceId) loadRevenue()
  }, [activeTab, workspaceId, loadRevenue, revenueDays])

  // ── Stripe link helpers ────────────────────────────────────────────────────
  function stripeLinkName(link: any): string {
    return link.metadata?.product_name || link.nickname || link.id || 'Payment Link'
  }
  function stripeLinkAmount(link: any): string {
    if (link.line_items?.data?.[0]) {
      const item = link.line_items.data[0]
      return formatCurrency(item.price?.unit_amount || 0, item.price?.currency || 'usd')
    }
    return '—'
  }
  function stripeLinkStatus(link: any): 'active' | 'inactive' {
    return link.active !== false ? 'active' : 'inactive'
  }
  function stripeLinkUrl(link: any): string {
    return link.url || ''
  }

  // ── Razorpay link helpers ──────────────────────────────────────────────────
  function rzpLinkName(link: any): string {
    return link.description || link.id || 'Payment Link'
  }
  function rzpLinkAmount(link: any): string {
    return formatCurrency(link.amount || 0, 'inr')
  }
  function rzpLinkStatus(link: any): 'active' | 'inactive' {
    return link.status === 'created' || link.status === 'partially_paid' ? 'active' : 'inactive'
  }
  function rzpLinkUrl(link: any): string {
    return link.short_url || ''
  }

  const isFormValid = form.productName.trim() !== '' && form.amount !== '' && parseFloat(form.amount) > 0

  return (
    <div className="p-8 max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">💳 Payments & Revenue</h1>
        <p className="text-gray-400 text-sm mt-1">
          Create payment links, checkout sessions, and track revenue — powered by Stripe & Razorpay
        </p>
      </div>

      {/* Provider toggle */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-gray-400 text-sm font-medium">Provider:</span>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['stripe', 'razorpay'] as Provider[]).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                provider === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {p === 'stripe' ? '🔵 Stripe' : '🟢 Razorpay'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([
          ['create', 'Create Link'],
          ['links', 'Payment Links'],
          ['revenue', 'Revenue Stats'],
        ] as [ActiveTab, string][]).map(([key, label]) => (
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

      {/* ── Tab: Create Link ──────────────────────────────────────────────── */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-sm border-b border-gray-800 pb-3">
              Create Payment Link
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">
                Product / Service Name <span className="text-red-400">*</span>
              </label>
              <input
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                value={form.productName}
                onChange={e => updateForm('productName', e.target.value)}
                placeholder="e.g. Consulting Session, Premium Plan"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1.5">
                  Amount <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                  value={form.amount}
                  onChange={e => updateForm('amount', e.target.value)}
                  placeholder="99.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1.5">Currency</label>
                <select
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  value={form.currency}
                  onChange={e => updateForm('currency', e.target.value)}
                >
                  {provider === 'stripe' ? (
                    <>
                      <option value="usd">USD</option>
                      <option value="eur">EUR</option>
                      <option value="gbp">GBP</option>
                    </>
                  ) : (
                    <option value="inr">INR</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">Description (optional)</label>
              <textarea
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
                rows={2}
                value={form.description}
                onChange={e => updateForm('description', e.target.value)}
                placeholder="What does this payment cover?"
              />
            </div>

            {/* Stripe-only options */}
            {provider === 'stripe' && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.useCheckout}
                    onChange={e => updateForm('useCheckout', e.target.checked)}
                    className="accent-indigo-500 w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">Use Checkout Session (for custom flow)</span>
                </label>
                {form.useCheckout && (
                  <div className="space-y-3 pl-6">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Success URL</label>
                      <input
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                        value={form.successUrl}
                        onChange={e => updateForm('successUrl', e.target.value)}
                        placeholder="https://yoursite.com/success"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Cancel URL</label>
                      <input
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                        value={form.cancelUrl}
                        onChange={e => updateForm('cancelUrl', e.target.value)}
                        placeholder="https://yoursite.com/cancel"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Razorpay-only options */}
            {provider === 'razorpay' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Customer Details (optional)</p>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Customer Name</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                    value={form.customerName}
                    onChange={e => updateForm('customerName', e.target.value)}
                    placeholder="Rahul Sharma"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Customer Email</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                    value={form.customerEmail}
                    onChange={e => updateForm('customerEmail', e.target.value)}
                    placeholder="rahul@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Customer Phone</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                    value={form.customerPhone}
                    onChange={e => updateForm('customerPhone', e.target.value)}
                    placeholder="+919876543210"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Callback URL</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                    value={form.callbackUrl}
                    onChange={e => updateForm('callbackUrl', e.target.value)}
                    placeholder="https://yoursite.com/payment/callback"
                  />
                </div>
              </div>
            )}

            {createError && (
              <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
                {createError}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || !isFormValid}
              className="w-full px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {creating ? 'Creating...' : '🔗 Create Payment Link'}
            </button>
          </div>

          {/* Right: preview / result */}
          <div>
            {!createdLink ? (
              <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
                <div className="text-4xl mb-3">🔗</div>
                <p className="text-gray-400 text-sm font-medium">Payment link preview</p>
                <p className="text-gray-600 text-xs mt-1">Fill out the form and click Create</p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-green-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                  <span>✅</span>
                  <span>Payment Link Created</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">URL</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={createdLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 text-sm truncate flex-1 underline"
                    >
                      {createdLink.url}
                    </a>
                    <button
                      onClick={() => copyLink(createdLink.url)}
                      className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {createdLink.amount !== undefined && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Amount</p>
                    <p className="text-white font-semibold">
                      {formatCurrency(createdLink.amount, form.currency)}
                    </p>
                  </div>
                )}

                <a
                  href={createdLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-2.5 rounded-lg border border-indigo-600 text-indigo-400 hover:bg-indigo-950 text-sm font-medium transition-colors"
                >
                  Open Link ↗
                </a>

                <p className="text-xs text-gray-600">
                  Links are permanent — share via email, WhatsApp, or social media
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Payment Links ────────────────────────────────────────────── */}
      {activeTab === 'links' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={loadLinks}
                disabled={loadingLinks}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loadingLinks ? 'Refreshing...' : '↻ Refresh'}
              </button>
              {links.length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs font-medium">
                  {links.length} active link{links.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {linksSetupRequired && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-gray-300 font-medium text-sm">Configure {provider === 'stripe' ? 'Stripe' : 'Razorpay'} in Settings to manage payment links.</p>
              <a href="/dashboard/settings" className="mt-3 inline-block text-indigo-400 hover:text-indigo-300 text-sm underline">
                Go to Settings → API Keys
              </a>
            </div>
          )}

          {linksError && !linksSetupRequired && (
            <div className="p-4 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
              {linksError}
            </div>
          )}

          {!loadingLinks && !linksSetupRequired && !linksError && links.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">🔗</div>
              <p className="text-gray-400 text-sm">No payment links yet. Create one above.</p>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-3">
              {links.map((link: any) => {
                const isStripe = provider === 'stripe'
                const name = isStripe ? stripeLinkName(link) : rzpLinkName(link)
                const amount = isStripe ? stripeLinkAmount(link) : rzpLinkAmount(link)
                const status = isStripe ? stripeLinkStatus(link) : rzpLinkStatus(link)
                const url = isStripe ? stripeLinkUrl(link) : rzpLinkUrl(link)

                return (
                  <div key={link.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white text-sm font-medium truncate">{name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                          status === 'active'
                            ? 'bg-green-950 border border-green-800 text-green-400'
                            : 'bg-gray-800 border border-gray-700 text-gray-500'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-indigo-300 font-semibold text-sm">{amount}</span>
                        {url && (
                          <span className="text-gray-500 text-xs truncate max-w-xs">{url}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {url && (
                        <>
                          <button
                            onClick={() => copyLink(url, link.id)}
                            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-xs font-medium transition-colors"
                          >
                            {copiedLinkId === link.id ? 'Copied!' : 'Copy URL'}
                          </button>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 text-xs font-medium transition-colors"
                          >
                            Open ↗
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Revenue Stats ────────────────────────────────────────────── */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* Days filter — Stripe only */}
          {provider === 'stripe' && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Period:</span>
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setRevenueDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    revenueDays === d
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          )}

          {revenueSetupRequired && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-gray-300 font-medium text-sm">Configure {provider === 'stripe' ? 'Stripe' : 'Razorpay'} in Settings to view revenue data.</p>
              <a href="/dashboard/settings" className="mt-3 inline-block text-indigo-400 hover:text-indigo-300 text-sm underline">
                Go to Settings → API Keys
              </a>
            </div>
          )}

          {revenueError && !revenueSetupRequired && (
            <div className="p-4 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
              {revenueError}
            </div>
          )}

          {loadingRevenue && (
            <div className="flex items-center gap-3 text-gray-400 text-sm py-8">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
              Loading revenue data...
            </div>
          )}

          {revenueStats && !loadingRevenue && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {provider === 'stripe' ? (
                  <>
                    <StatCard
                      label={`Revenue (${revenueDays}d)`}
                      value={formatCurrency(revenueStats.totalRevenue || 0, 'usd')}
                    />
                    <StatCard
                      label="Transactions"
                      value={String(revenueStats.transactionCount ?? revenueStats.count ?? '—')}
                    />
                    <StatCard
                      label="Avg Order Value"
                      value={revenueStats.avgOrderValue
                        ? formatCurrency(revenueStats.avgOrderValue, 'usd')
                        : '—'}
                    />
                    <StatCard
                      label="Currency"
                      value={(revenueStats.currency || 'USD').toUpperCase()}
                    />
                  </>
                ) : (
                  <>
                    <StatCard
                      label="Total Revenue"
                      value={formatCurrency(revenueStats.totalAmount || revenueStats.total || 0, 'inr')}
                    />
                    <StatCard
                      label="Transactions"
                      value={String(revenueStats.count ?? revenueStats.transactionCount ?? '—')}
                    />
                    <StatCard
                      label="Avg Order Value"
                      value={revenueStats.avgAmount
                        ? formatCurrency(revenueStats.avgAmount, 'inr')
                        : '—'}
                    />
                    <StatCard label="Currency" value="INR" />
                  </>
                )}
              </div>

              {/* Provider insights */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold text-sm mb-3">
                  {provider === 'stripe' ? '🔵 Stripe Insights' : '🟢 Razorpay Insights'}
                </h3>
                <pre className="text-gray-400 text-xs overflow-auto">
                  {JSON.stringify(revenueStats, null, 2)}
                </pre>
              </div>
            </>
          )}

          {!revenueStats && !loadingRevenue && !revenueError && !revenueSetupRequired && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-gray-400 text-sm">No revenue data loaded yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-xl font-bold">{value}</p>
    </div>
  )
}
