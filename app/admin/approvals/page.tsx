'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldX, Clock } from 'lucide-react'
import { Card, StatCard, Badge, EmptyState, fmtNum, relTime } from '../_ui'

interface Pending {
  id: string
  workspace_id: string
  workspace_name?: string
  artifact_id?: string
  artifact_title?: string
  artifact_type?: string
  approver_email?: string
  notes?: string
  created_at: string
}
interface Buckets { under1d: number; d1to3: number; d3to7: number; over7d: number }
interface Resp { pending: Pending[]; buckets: Buckets; total: number }

export default function AdminApprovalsPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/approvals', { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setData(await res.json() as Resp)
      setSelected(new Set())
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function bulk(action: 'approve' | 'reject') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} ${ids.length} item(s)?`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || `Failed (HTTP ${res.status})`)
      } else {
        const j = await res.json() as { updated?: number }
        alert(`Updated ${j.updated ?? 0} approval(s).`)
        await refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-24 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error) {
    return <Card className="border-red-900/50"><p className="text-red-300 text-sm">Failed to load: {error}</p></Card>
  }
  if (!data) return null

  const rows = data.pending

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="< 1 day" value={fmtNum(data.buckets.under1d)} tone="good" sub={<span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />fresh</span>} />
        <StatCard label="1 – 3 days" value={fmtNum(data.buckets.d1to3)} tone="info" sub="aging" />
        <StatCard label="3 – 7 days" value={fmtNum(data.buckets.d3to7)} tone="warn" sub="overdue" />
        <StatCard label="> 7 days" value={fmtNum(data.buckets.over7d)} tone={data.buckets.over7d > 0 ? 'bad' : 'good'} sub="stale" />
      </div>

      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-400">{selected.size} selected of {data.total} pending</p>
        <div className="flex gap-2">
          <button
            onClick={() => bulk('reject')}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-medium"
          >
            <ShieldX className="w-4 h-4" /> Reject
          </button>
          <button
            onClick={() => bulk('approve')}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium"
          >
            <ShieldCheck className="w-4 h-4" /> Approve
          </button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 sticky top-0 z-10 text-[11px] uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                    onChange={() => {
                      const next = new Set(selected)
                      const allSel = rows.every(r => next.has(r.id))
                      if (allSel) rows.forEach(r => next.delete(r.id))
                      else rows.forEach(r => next.add(r.id))
                      setSelected(next)
                    }}
                  />
                </th>
                <th className="text-left px-3 py-2.5">Artifact</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Workspace</th>
                <th className="text-left px-3 py-2.5">Age</th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody><tr><td colSpan={5} className="px-3 py-12"><EmptyState title="Nothing pending" body="All approvals are processed." /></td></tr></tbody>
            ) : (
              <tbody className="divide-y divide-gray-800">
                {rows.map((p, i) => {
                  const ageMs = Date.now() - new Date(p.created_at).getTime()
                  const days = ageMs / 86_400_000
                  const tone = days >= 7 ? 'red' : days >= 3 ? 'amber' : days >= 1 ? 'blue' : 'green'
                  return (
                    <tr key={p.id} className={`hover:bg-gray-800/60 ${i % 2 ? 'bg-gray-900/40' : ''}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => {
                            const next = new Set(selected)
                            if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                            setSelected(next)
                          }}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-white truncate max-w-[300px]">{p.artifact_title || p.artifact_id || '—'}</p>
                        <p className="text-gray-500 text-xs truncate max-w-[300px]">{p.notes || ''}</p>
                      </td>
                      <td className="px-3 py-3"><Badge>{p.artifact_type || 'unknown'}</Badge></td>
                      <td className="px-3 py-3 text-gray-300 truncate max-w-[200px]">{p.workspace_name || p.workspace_id}</td>
                      <td className="px-3 py-3"><Badge tone={tone as 'red' | 'amber' | 'blue' | 'green'}>{relTime(p.created_at)}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            )}
          </table>
        </div>
      </Card>
    </div>
  )
}
