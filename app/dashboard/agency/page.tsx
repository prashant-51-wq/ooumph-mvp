'use client'

import { useState, useEffect, useCallback } from 'react'

interface ConnectStatus {
  connected: boolean
  status: string
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  onboardingUrl?: string
}

interface ClientAccount {
  id: string
  client_name: string
  client_email: string
  price_monthly: number
  status: string
  trial_ends_at: string | null
  created_at: string
  stripe_customer_id: string | null
}

interface Revenue {
  total_gmv: number | null
  total_commission_paid: number | null
  total_earned: number | null
  total_transactions: number | null
}

function getWorkspaceId(): string {
  try {
    const ws = JSON.parse(localStorage.getItem('ooumph_workspace') || '{}') as { id?: string }
    return ws.id || localStorage.getItem('workspaceId') || ''
  } catch { return '' }
}

function cents(n: number | null | undefined) {
  if (!n) return '$0.00'
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AgencyPage() {
  const [connect, setConnect] = useState<ConnectStatus | null>(null)
  const [clients, setClients] = useState<ClientAccount[]>([])
  const [revenue, setRevenue] = useState<Revenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newClient, setNewClient] = useState({ clientName: '', clientEmail: '', priceMonthly: '' })
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState<'clients' | 'revenue'>('clients')

  const load = useCallback(async () => {
    const workspaceId = getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }

    const [connectRes, clientsRes] = await Promise.all([
      fetch(`/api/billing/connect?workspaceId=${workspaceId}`),
      fetch(`/api/vendor/clients?workspaceId=${workspaceId}`),
    ])

    if (connectRes.ok) setConnect(await connectRes.json())
    if (clientsRes.ok) {
      const data = await clientsRes.json() as { clients: ClientAccount[]; revenue: Revenue }
      setClients(data.clients)
      setRevenue(data.revenue)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Handle connect return/refresh from URL params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('connect') === 'success' || p.get('connect') === 'refresh') {
      void load()
      window.history.replaceState({}, '', '/dashboard/agency')
    }
  }, [load])

  async function handleConnect() {
    const workspaceId = getWorkspaceId()
    setConnecting(true)
    const res = await fetch('/api/billing/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    if (res.ok) {
      const data = await res.json() as { onboardingUrl?: string }
      if (data.onboardingUrl) window.location.href = data.onboardingUrl
    }
    setConnecting(false)
  }

  async function handleAddClient() {
    const workspaceId = getWorkspaceId()
    if (!newClient.clientName || !newClient.clientEmail) return
    setAdding(true)
    const res = await fetch('/api/vendor/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({
        clientName: newClient.clientName,
        clientEmail: newClient.clientEmail,
        priceMonthly: newClient.priceMonthly ? Math.round(parseFloat(newClient.priceMonthly) * 100) : 0,
      }),
    })
    if (res.ok) {
      setNewClient({ clientName: '', clientEmail: '', priceMonthly: '' })
      setShowAdd(false)
      void load()
    }
    setAdding(false)
  }

  async function handleUpdateStatus(clientId: string, status: string) {
    const workspaceId = getWorkspaceId()
    await fetch('/api/vendor/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({ clientId, status }),
    })
    void load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-gray-400 animate-pulse">Loading agency dashboard…</div>
    </div>
  )

  const isConnected = connect?.chargesEnabled && connect?.payoutsEnabled

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Agency Dashboard</h1>
      <p className="text-gray-400 text-sm mb-6">Manage your clients, revenue, and Stripe Connect payouts.</p>

      {/* Stripe Connect banner */}
      <div className={`border rounded-xl p-5 mb-6 ${
        isConnected ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <p className="text-white font-semibold text-sm">
                Stripe Connect — {isConnected ? 'Active' : connect?.status || 'Not connected'}
              </p>
            </div>
            {isConnected ? (
              <p className="text-gray-400 text-xs">Your account is connected. Client payments flow automatically through Ooumph, with the platform commission deducted before payout to you.</p>
            ) : (
              <p className="text-gray-400 text-xs">Connect your Stripe account to start receiving client payments. Required to bill clients and earn revenue.</p>
            )}
            {connect?.accountId && (
              <p className="text-gray-500 text-xs mt-1">Account: {connect.accountId}</p>
            )}
          </div>
          {!isConnected && (
            <button
              onClick={() => void handleConnect()}
              disabled={connecting}
              className="ml-4 bg-amber-600 hover:bg-amber-500 text-white text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
            >
              {connecting ? 'Redirecting…' : connect?.onboardingUrl ? 'Continue Setup' : 'Connect Stripe'}
            </button>
          )}
        </div>
      </div>

      {/* Revenue summary */}
      {revenue && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <RevenueCard label="Total GMV" value={cents(revenue.total_gmv)} color="blue" />
          <RevenueCard label="Commission Paid" value={cents(revenue.total_commission_paid)} color="red" />
          <RevenueCard label="Net Earned" value={cents(revenue.total_earned)} color="emerald" />
          <RevenueCard label="Transactions" value={String(revenue.total_transactions || 0)} color="gray" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(['clients', 'revenue'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition capitalize ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'clients' ? `Clients (${clients.filter(c => c.status !== 'removed').length})` : 'Revenue'}
          </button>
        ))}
      </div>

      {tab === 'clients' && (
        <div>
          {/* Add client */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="mb-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
            >
              + Add Client
            </button>
          ) : (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4">
              <h3 className="text-white font-medium mb-3">Add New Client</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={newClient.clientName}
                  onChange={e => setNewClient(p => ({ ...p, clientName: e.target.value }))}
                  placeholder="Client name"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <input
                  value={newClient.clientEmail}
                  onChange={e => setNewClient(p => ({ ...p, clientEmail: e.target.value }))}
                  placeholder="Client email"
                  type="email"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <input
                  value={newClient.priceMonthly}
                  onChange={e => setNewClient(p => ({ ...p, priceMonthly: e.target.value }))}
                  placeholder="Monthly price (USD)"
                  type="number"
                  min="0" step="1"
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => void handleAddClient()}
                  disabled={adding || !newClient.clientName || !newClient.clientEmail}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add Client'}
                </button>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded-lg border border-gray-700 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Clients table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Client', 'Monthly Price', 'Status', 'Trial Ends', 'Added', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.filter(c => c.status !== 'removed').map(client => (
                  <tr key={client.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium text-sm">{client.client_name}</p>
                      <p className="text-gray-500 text-xs">{client.client_email}</p>
                    </td>
                    <td className="px-4 py-3 text-white">{cents(client.price_monthly)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        client.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        client.status === 'trial' ? 'bg-blue-500/20 text-blue-400' :
                        client.status === 'suspended' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-700/50 text-gray-400'
                      }`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {client.trial_ends_at ? new Date(client.trial_ends_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {client.status !== 'active' && (
                          <button
                            onClick={() => void handleUpdateStatus(client.id, 'active')}
                            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded transition"
                          >
                            Activate
                          </button>
                        )}
                        {client.status !== 'suspended' && client.status !== 'removed' && (
                          <button
                            onClick={() => void handleUpdateStatus(client.id, 'suspended')}
                            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1 rounded transition"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.filter(c => c.status !== 'removed').length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No clients yet. Add your first client above.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">How Revenue Works</h2>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold text-lg">1.</span>
              <div>
                <p className="text-white font-medium">Client pays you</p>
                <p className="text-gray-400 text-xs mt-0.5">Your clients pay through Stripe via your connected account. The money flows through the Ooumph platform.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold text-lg">2.</span>
              <div>
                <p className="text-white font-medium">Platform commission deducted</p>
                <p className="text-gray-400 text-xs mt-0.5">Ooumph automatically takes the platform commission (set by your plan) before any payout. You see this as the &quot;Commission Paid&quot; amount above.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-indigo-400 font-bold text-lg">3.</span>
              <div>
                <p className="text-white font-medium">You receive the net amount</p>
                <p className="text-gray-400 text-xs mt-0.5">The remainder is transferred to your Stripe account automatically. This is your &quot;Net Earned&quot; amount.</p>
              </div>
            </div>
          </div>
          <div className="mt-6 bg-gray-800 rounded-lg p-4 text-xs text-gray-400">
            <strong className="text-white">To view detailed transaction history,</strong> check your Stripe dashboard or ask your Ooumph admin for a commission report.
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueCard({ label, value, color }: { label: string; value: string; color: string }) {
  const styles: Record<string, string> = {
    blue: 'border-blue-500/30 text-blue-400',
    red: 'border-red-500/30 text-red-400',
    emerald: 'border-emerald-500/30 text-emerald-400',
    gray: 'border-gray-600/30 text-gray-300',
  }
  return (
    <div className={`border rounded-xl p-4 bg-gray-900 ${styles[color] || ''}`}>
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${styles[color]?.split(' ').pop() || ''}`}>{value}</p>
    </div>
  )
}
