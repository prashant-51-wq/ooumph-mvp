'use client'

import { useEffect, useState } from 'react'
import { Activity, Database, Terminal, KeyRound, AlertOctagon } from 'lucide-react'
import { Card, Badge, EmptyState, fmtNum, fmtDate } from '../_ui'

interface VercelCron { path: string; schedule: string }
interface SysResp {
  crons: VercelCron[]
  counts: Record<string, number | null>
  recentErrors: Array<{ source: string; message: string; created_at: string; workspace_id?: string }>
  envStatus: Array<{ key: string; set: boolean }>
  uptime: number | null
  nodeVersion: string
}

export default function AdminSystemPage() {
  const [data, setData] = useState<SysResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/system', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
        return res.json() as Promise<SysResp>
      })
      .then(setData)
      .catch(err => setError(String(err.message || err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-xl h-64 animate-pulse" />
  }
  if (error) {
    return <Card className="border-red-900/50"><p className="text-red-300 text-sm">Failed: {error}</p></Card>
  }
  if (!data) return null

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-emerald-400" /> Runtime
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Node version</p>
            <p className="text-white font-mono">{data.nodeVersion}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Uptime (s)</p>
            <p className="text-white font-mono">{data.uptime ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Crons</p>
            <p className="text-white font-mono">{data.crons.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Env keys set</p>
            <p className="text-white font-mono">
              {data.envStatus.filter(e => e.set).length} / {data.envStatus.length}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cron table */}
        <Card>
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-indigo-400" /> Cron schedule
          </h3>
          {data.crons.length === 0 ? (
            <EmptyState title="No crons configured" body="Add crons to vercel.json." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-gray-500 tracking-wide">
                  <tr><th className="text-left pb-2">Path</th><th className="text-left pb-2">Schedule</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.crons.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-800/40">
                      <td className="py-2 text-white font-mono text-xs">{c.path}</td>
                      <td className="py-2 text-gray-300 font-mono text-xs">{c.schedule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* DB row counts */}
        <Card>
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-emerald-400" /> Database row counts
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.counts).map(([table, count]) => (
              <div key={table} className="flex items-center justify-between text-sm border-b border-gray-800 pb-1.5">
                <span className="text-gray-400 font-mono text-xs">{table}</span>
                <span className={`font-medium ${count == null ? 'text-gray-500' : 'text-white'}`}>
                  {count == null ? 'n/a' : fmtNum(count)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-amber-400" /> Environment variables
        </h3>
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
        <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2 mb-3">
          <AlertOctagon className="w-4 h-4 text-red-400" /> Recent errors
        </h3>
        {data.recentErrors.length === 0 ? (
          <EmptyState title="No recent errors logged" body="The system looks clean." />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {data.recentErrors.map((e, i) => (
              <div key={i} className="border-b border-gray-800 last:border-0 pb-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white text-sm font-medium truncate">{e.source}</p>
                  <span className="text-gray-500 text-[11px] shrink-0">{fmtDate(e.created_at)}</span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5 truncate">{e.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
