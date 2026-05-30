'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react'
import {
  Card, Badge, EmptyState, SkeletonRows, SearchInput, Pagination,
  fmtDateShort, relTime,
} from '../_ui'

interface WorkspaceRow {
  id: string
  name: string
  owner_email: string
  status: string
  plan?: string | null
  created_at: string
  onboarding_completed_at?: string | null
  members?: number
  last_activity?: string | null
}

interface ListResponse { workspaces: WorkspaceRow[]; total: number; limit: number; offset: number }

const PAGE_SIZE = 50

export default function AdminWorkspacesPage() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQ(q.trim().toLowerCase()); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [q])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedQ) params.set('q', debouncedQ)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))
      const res = await fetch(`/api/admin/workspaces-list?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setData(await res.json() as ListResponse)
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, page])

  useEffect(() => { void refresh() }, [refresh])

  async function action(id: string, act: 'suspend' | 'unsuspend' | 'force_reonboard') {
    if (act === 'force_reonboard' && !confirm('Reset onboarding for this workspace? The owner will be sent through the wizard again.')) return
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/workspaces-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action: act }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || `Failed (HTTP ${res.status})`)
      } else {
        await refresh()
      }
    } finally {
      setBusyId(null)
    }
  }

  const rows = data?.workspaces || []

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search by workspace name or owner email…" />
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 sticky top-0 z-10 text-[11px] uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5">Workspace</th>
                <th className="text-left px-3 py-2.5">Owner</th>
                <th className="text-left px-3 py-2.5">Plan</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Onboarding</th>
                <th className="text-left px-3 py-2.5">Members</th>
                <th className="text-left px-3 py-2.5">Created</th>
                <th className="text-left px-3 py-2.5">Last Activity</th>
                <th className="text-right px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows rows={6} cols={9} />
            ) : error ? (
              <tbody><tr><td colSpan={9} className="px-3 py-6 text-red-300 text-sm">{error}</td></tr></tbody>
            ) : rows.length === 0 ? (
              <tbody>
                <tr><td colSpan={9} className="px-3 py-12">
                  <EmptyState title="No workspaces found" body={debouncedQ ? 'Try a different search.' : 'Workspaces will appear here as agencies onboard.'} />
                </td></tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-gray-800">
                {rows.map((w, i) => (
                  <tr key={w.id} className={`hover:bg-gray-800/60 ${i % 2 ? 'bg-gray-900/40' : ''}`}>
                    <td className="px-3 py-3">
                      <p className="text-white truncate max-w-[200px]">{w.name}</p>
                      <p className="text-gray-500 text-xs truncate max-w-[200px]">{w.id}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-300 truncate max-w-[200px]">{w.owner_email}</td>
                    <td className="px-3 py-3">
                      {w.plan ? <Badge tone="indigo">{w.plan}</Badge> : <Badge>Free</Badge>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={w.status === 'active' ? 'green' : w.status === 'suspended' ? 'red' : 'gray'}>{w.status}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      {w.onboarding_completed_at
                        ? <Badge tone="green">Complete</Badge>
                        : <Badge tone="amber">Incomplete</Badge>}
                    </td>
                    <td className="px-3 py-3 text-gray-300">{w.members ?? 0}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{fmtDateShort(w.created_at)}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{relTime(w.last_activity)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/dashboard?_ws=${w.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => action(w.id, 'force_reonboard')}
                          disabled={busyId === w.id}
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                          title="Force re-onboarding"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => action(w.id, w.status === 'suspended' ? 'unsuspend' : 'suspend')}
                          disabled={busyId === w.id}
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                          title={w.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        >
                          {w.status === 'suspended' ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {data && data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        )}
      </Card>
    </div>
  )
}
