'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2, ShieldOff, ShieldCheck, Ban, CheckCircle2 } from 'lucide-react'
import {
  Card, Badge, EmptyState, SkeletonRows, SearchInput, Pagination,
  fmtDateShort, relTime,
} from '../_ui'

interface UserRow {
  id: string
  email: string
  name: string
  is_admin?: number
  suspended?: number
  created_at: string
  workspace_count?: number
  last_login?: string | null
}

interface ListResponse { users: UserRow[]; total: number; limit: number; offset: number }

const PAGE_SIZE = 50

export default function AdminUsersPage() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
      const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setData(await res.json() as ListResponse)
      setSelected(new Set())
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, page])

  useEffect(() => { void refresh() }, [refresh])

  async function toggle(id: string, action: 'toggle_admin' | 'toggle_suspend') {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action }),
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

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} user(s)? This cannot be undone.`)) return
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error || `Failed (HTTP ${res.status})`)
    } else {
      const j = await res.json() as { deleted?: number }
      alert(`Deleted ${j.deleted ?? ids.length} user(s).`)
      await refresh()
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const rows = data?.users || []
  const allSelectedOnPage = rows.length > 0 && rows.every(r => selected.has(r.id))

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search by email or name…" />
        <div className="flex-1" />
        {selected.size > 0 && (
          <button
            onClick={bulkDelete}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" /> Delete {selected.size}
          </button>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 sticky top-0 z-10 text-[11px] uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={() => {
                      const next = new Set(selected)
                      if (allSelectedOnPage) rows.forEach(r => next.delete(r.id))
                      else rows.forEach(r => next.add(r.id))
                      setSelected(next)
                    }}
                  />
                </th>
                <th className="text-left px-3 py-2.5">Email</th>
                <th className="text-left px-3 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Joined</th>
                <th className="text-left px-3 py-2.5">Role</th>
                <th className="text-left px-3 py-2.5">Workspaces</th>
                <th className="text-left px-3 py-2.5">Last Login</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows rows={6} cols={9} />
            ) : error ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="px-3 py-6">
                    <p className="text-red-300 text-sm">Failed to load users: {error}</p>
                  </td>
                </tr>
              </tbody>
            ) : rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="px-3 py-12">
                    <EmptyState title="No users found" body={debouncedQ ? 'Try a different search.' : 'Users will appear here when they sign up.'} />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-gray-800">
                {rows.map((u, i) => (
                  <tr key={u.id} className={`hover:bg-gray-800/60 ${i % 2 ? 'bg-gray-900/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-white truncate max-w-[260px]">{u.email}</p>
                      <p className="text-gray-500 text-xs truncate max-w-[260px]">{u.id}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-300 truncate max-w-[180px]">{u.name || '—'}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{fmtDateShort(u.created_at)}</td>
                    <td className="px-3 py-3">
                      {u.is_admin === 1 ? <Badge tone="indigo">Admin</Badge> : <Badge>User</Badge>}
                    </td>
                    <td className="px-3 py-3 text-gray-300">{u.workspace_count ?? 0}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{u.last_login ? relTime(u.last_login) : 'never'}</td>
                    <td className="px-3 py-3">
                      {u.suspended === 1 ? <Badge tone="red">Suspended</Badge> : <Badge tone="green">Active</Badge>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggle(u.id, 'toggle_admin')}
                          disabled={busyId === u.id}
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                          title={u.is_admin === 1 ? 'Revoke admin' : 'Promote to admin'}
                        >
                          {u.is_admin === 1 ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => toggle(u.id, 'toggle_suspend')}
                          disabled={busyId === u.id}
                          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                          title={u.suspended === 1 ? 'Reactivate' : 'Suspend'}
                        >
                          {u.suspended === 1 ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
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
