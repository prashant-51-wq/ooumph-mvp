'use client'

import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, KeyRound, Power, Flag, Plus } from 'lucide-react'
import { Card, Badge, EmptyState } from '../_ui'

interface SettingsResp {
  maintenanceMode: boolean
  featureFlags: Record<string, boolean>
  envStatus: Array<{ key: string; set: boolean }>
}

export default function AdminSettingsPage() {
  const [data, setData] = useState<SettingsResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newFlag, setNewFlag] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setData(await res.json() as SettingsResp)
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function save(patch: { maintenanceMode?: boolean; featureFlags?: Record<string, boolean> }) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || `Failed (HTTP ${res.status})`)
      } else {
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) {
    return <div className="bg-gray-900 border border-gray-800 rounded-xl h-64 animate-pulse" />
  }
  if (error) {
    return <Card className="border-red-900/50"><p className="text-red-300 text-sm">Failed: {error}</p></Card>
  }
  if (!data) return null

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              <Power className="w-4 h-4 text-red-400" /> Maintenance mode
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">When ON, the app should display a maintenance banner / block writes (consumers must check this flag).</p>
          </div>
          <button
            onClick={() => save({ maintenanceMode: !data.maintenanceMode })}
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              data.maintenanceMode
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
            }`}
          >
            {data.maintenanceMode ? 'ON · Click to disable' : 'OFF · Click to enable'}
          </button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Flag className="w-4 h-4 text-indigo-400" /> Feature flags
          </h3>
          <div className="flex items-center gap-2">
            <input
              value={newFlag}
              onChange={e => setNewFlag(e.target.value)}
              placeholder="new_flag_name"
              className="px-3 py-1.5 rounded-md bg-gray-950 border border-gray-800 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => {
                const name = newFlag.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
                if (!name) return
                void save({ featureFlags: { [name]: false } })
                setNewFlag('')
              }}
              disabled={saving || !newFlag.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
        {Object.keys(data.featureFlags).length === 0 ? (
          <EmptyState title="No feature flags defined" body="Add a flag above to start using it across the app." />
        ) : (
          <div className="space-y-1.5">
            {Object.entries(data.featureFlags).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between bg-gray-950/50 rounded px-3 py-2 border border-gray-800">
                <span className="text-gray-300 font-mono text-xs">{key}</span>
                <button
                  onClick={() => save({ featureFlags: { [key]: !val } })}
                  disabled={saving}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    val ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  {val ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-amber-400" /> Environment variables
        </h3>
        <p className="text-xs text-gray-500 mb-3">Status only — values are never exposed. Set these in your hosting provider.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.envStatus.map(e => (
            <div key={e.key} className="flex items-center justify-between text-sm bg-gray-950/50 rounded px-3 py-2 border border-gray-800">
              <span className="text-gray-300 font-mono text-xs truncate">{e.key}</span>
              {e.set ? <Badge tone="green">set</Badge> : <Badge tone="red">missing</Badge>}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-2">
          <SettingsIcon className="w-4 h-4 text-gray-400" /> About
        </h3>
        <p className="text-xs text-gray-500">
          This admin panel writes to <code className="px-1 rounded bg-gray-900 text-gray-300">platform_settings</code> (key/value table) and
          {' '}<code className="px-1 rounded bg-gray-900 text-gray-300">admin_audit_log</code> for every action. All API routes are gated by <code className="px-1 rounded bg-gray-900 text-gray-300">assertSuperAdmin</code>.
        </p>
      </Card>
    </div>
  )
}
