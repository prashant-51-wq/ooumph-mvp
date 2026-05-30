'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Card, Badge, EmptyState, SkeletonRows, Pagination, fmtDate } from '../_ui'

interface AuditEntry {
  id: string
  actor_id: string
  actor_email?: string | null
  action: string
  resource_type?: string | null
  resource_id?: string | null
  details_json?: string | null
  ip_address?: string | null
  created_at: string
}

interface Resp { entries: AuditEntry[]; total: number; limit: number; offset: number }

const PAGE_SIZE = 50

export default function AdminAuditPage() {
  const [q, setQ] = useState('')
  const [actor, setActor] = useState('')
  const [since, setSince] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debouncedQ, setDebouncedQ] = useState({ q: '', actor: '', since: '' })

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ({ q: q.trim().toLowerCase(), actor: actor.trim().toLowerCase(), since })
      setPage(1)
    }, 350)
    return () => clearTimeout(id)
  }, [q, actor, since])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedQ.q) params.set('q', debouncedQ.q)
      if (debouncedQ.actor) params.set('actor', debouncedQ.actor)
      if (debouncedQ.since) params.set('since', debouncedQ.since)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setData(await res.json() as Resp)
    } catch (err) {
      setError(String((err as Error).message || err))
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, page])

  useEffect(() => { void refresh() }, [refresh])

  const rows = data?.entries || []

  return (
    <div className="space-y-4">
      <Card className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by action or resource…"
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          value={actor}
          onChange={e => setActor(e.target.value)}
          placeholder="Filter by actor email…"
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={since}
          onChange={e => setSince(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm focus:outline-none focus:border-indigo-500"
        />
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 sticky top-0 z-10 text-[11px] uppercase text-gray-500 tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5">When</th>
                <th className="text-left px-3 py-2.5">Actor</th>
                <th className="text-left px-3 py-2.5">Action</th>
                <th className="text-left px-3 py-2.5">Resource</th>
                <th className="text-left px-3 py-2.5">Details</th>
                <th className="text-left px-3 py-2.5">IP</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows rows={6} cols={6} />
            ) : error ? (
              <tbody><tr><td colSpan={6} className="px-3 py-6 text-red-300 text-sm">{error}</td></tr></tbody>
            ) : rows.length === 0 ? (
              <tbody><tr><td colSpan={6} className="px-3 py-12"><EmptyState title="No audit entries" body="Admin actions will appear here once taken." icon={<ScrollText className="w-8 h-8" />} /></td></tr></tbody>
            ) : (
              <tbody className="divide-y divide-gray-800">
                {rows.map((e, i) => (
                  <tr key={e.id} className={`hover:bg-gray-800/60 ${i % 2 ? 'bg-gray-900/40' : ''}`}>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(e.created_at)}</td>
                    <td className="px-3 py-3 text-gray-300 truncate max-w-[200px]">{e.actor_email || e.actor_id}</td>
                    <td className="px-3 py-3"><Badge tone="indigo">{e.action}</Badge></td>
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {e.resource_type ? <Badge>{e.resource_type}</Badge> : '—'}
                      {e.resource_id && <span className="ml-2 font-mono">{e.resource_id.slice(0, 16)}…</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs font-mono truncate max-w-[260px]">{e.details_json || '—'}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{e.ip_address || '—'}</td>
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
