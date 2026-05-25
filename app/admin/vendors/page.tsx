'use client'

import { useState, useEffect, useCallback } from 'react'

interface Vendor {
  workspace_id: string
  workspace_name: string
  owner_email: string
  created_at: string
  stripe_connect_account_id: string | null
  stripe_connect_status: string
  commission_rate_override: number | null
  plan_name: string
  plan_slug: string
  plan_commission_rate: number
  subscription_status: string
  is_approved: number
  client_count: number
  total_gmv: number
  total_commission_earned: number
}

function cents(n: number) {
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)

  const getSecret = () =>
    typeof window !== 'undefined'
      ? (window as Window & { __adminSecret?: string }).__adminSecret || sessionStorage.getItem('adminSecret') || ''
      : ''

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/vendors?adminSecret=${encodeURIComponent(getSecret())}`)
    if (res.ok) setVendors(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function patch(workspaceId: string, body: Record<string, unknown>) {
    const secret = getSecret()
    setSaving(true)
    await fetch('/api/admin/vendors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ workspaceId, ...body }),
    })
    setSaving(false)
    void load()
  }

  async function saveRate(workspaceId: string) {
    const rate = parseFloat(editRate)
    if (isNaN(rate) || rate < 0 || rate > 1) return
    await patch(workspaceId, { commissionRateOverride: rate })
    setEditing(null)
  }

  async function impersonate(workspaceId: string) {
    const secret = getSecret()
    const res = await fetch('/api/admin/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ workspaceId, action: 'impersonate' }),
    })
    if (!res.ok) return
    const { impersonateData } = await res.json() as { impersonateData: { workspaceId: string; businessName: string; ownerEmail: string; planSlug: string } }
    // Set localStorage to impersonate this workspace
    const ws = { id: impersonateData.workspaceId, businessName: impersonateData.businessName, planSlug: impersonateData.planSlug }
    localStorage.setItem('ooumph_workspace', JSON.stringify(ws))
    window.open('/dashboard', '_blank')
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-gray-400 animate-pulse">Loading vendors…</div>

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Vendors</h1>
        <span className="text-gray-400 text-sm">{vendors.length} vendors</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Vendor', 'Plan', 'Commission Rate', 'Clients', 'GMV', 'Earned', 'Connect', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => {
                const effectiveRate = v.commission_rate_override ?? v.plan_commission_rate ?? 0.15
                const isEditing = editing === v.workspace_id
                return (
                  <tr key={v.workspace_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{v.workspace_name || '—'}</p>
                      <p className="text-gray-500 text-xs">{v.owner_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                        {v.plan_name || 'No plan'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editRate}
                            onChange={e => setEditRate(e.target.value)}
                            placeholder={String(effectiveRate)}
                            min="0" max="1" step="0.01"
                            className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                          />
                          <button onClick={() => void saveRate(v.workspace_id)} disabled={saving} className="text-emerald-400 hover:text-emerald-300 text-xs">✓</button>
                          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-300 text-xs">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditing(v.workspace_id); setEditRate(String(effectiveRate)) }}
                          className="text-white hover:text-indigo-400 transition"
                        >
                          {(effectiveRate * 100).toFixed(1)}%
                          {v.commission_rate_override !== null && <span className="text-xs text-amber-400 ml-1">override</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">{v.client_count}</td>
                    <td className="px-4 py-3 text-white">{cents(v.total_gmv)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-medium">{cents(v.total_commission_earned)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        v.stripe_connect_status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        v.stripe_connect_status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-gray-700/50 text-gray-400'
                      }`}>
                        {v.stripe_connect_status || 'not_connected'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        v.subscription_status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        v.subscription_status === 'paused' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-700/50 text-gray-400'
                      }`}>
                        {v.subscription_status || 'no sub'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void impersonate(v.workspace_id)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded hover:bg-indigo-600/10 transition"
                        >
                          View
                        </button>
                        {v.subscription_status === 'active' ? (
                          <button
                            onClick={() => void patch(v.workspace_id, { action: 'suspend' })}
                            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1 rounded hover:bg-red-600/10 transition"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => void patch(v.workspace_id, { action: 'activate' })}
                            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-600/10 transition"
                          >
                            Activate
                          </button>
                        )}
                        {!v.is_approved && (
                          <button
                            onClick={() => void patch(v.workspace_id, { isApproved: 1 })}
                            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-1 rounded transition"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {vendors.length === 0 && (
            <div className="text-center py-12 text-gray-500">No vendors yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
