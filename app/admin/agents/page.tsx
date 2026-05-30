'use client'

import { useEffect, useState } from 'react'
import { Bot, AlertTriangle, Zap } from 'lucide-react'
import { Card, StatCard, Badge, EmptyState, fmtNum, fmtDate, relTime } from '../_ui'

interface AgentFailure { id: string; workspace_id: string; agent_name: string; error_message?: string; created_at: string; completed_at?: string | null }
interface Slowest { agent_name: string; avg_ms: number; runs: number }
interface PerAgent { agent_name: string; total: number; completed: number; failed: number }
interface AgentsResp {
  totals: { day: number; week: number; month: number }
  recentFailures: AgentFailure[]
  slowest: Slowest[]
  perAgent: PerAgent[]
}

function pct(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

export default function AdminAgentsPage() {
  const [data, setData] = useState<AgentsResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/agents', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
        return res.json() as Promise<AgentsResp>
      })
      .then(setData)
      .catch(err => setError(String(err.message || err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-24 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error) {
    return <Card className="border-red-900/50"><p className="text-red-300 text-sm">Failed to load: {error}</p></Card>
  }
  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Runs · 24h" value={fmtNum(data.totals.day)} sub={<span className="inline-flex items-center gap-1"><Bot className="w-3 h-3" />last day</span>} tone="info" />
        <StatCard label="Runs · 7d" value={fmtNum(data.totals.week)} sub="last week" />
        <StatCard label="Runs · 30d" value={fmtNum(data.totals.month)} sub="last 30 days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Recent failures (7d)
          </h3>
          {data.recentFailures.length === 0 ? (
            <EmptyState title="No recent failures" body="Agents are running cleanly." />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {data.recentFailures.map(f => (
                <div key={f.id} className="border-b border-gray-800 last:border-0 pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-white text-sm font-medium truncate">{f.agent_name}</p>
                    <Badge tone="red">failed</Badge>
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{f.error_message || 'no error message'}</p>
                  <p className="text-gray-600 text-[11px] mt-0.5">{fmtDate(f.created_at)} · ws {f.workspace_id.slice(0, 8)}…</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 inline-flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Slowest agents (7d)
          </h3>
          {data.slowest.length === 0 ? (
            <EmptyState title="No completed runs yet" />
          ) : (
            <div className="space-y-2">
              {data.slowest.map(s => (
                <div key={s.agent_name} className="flex items-center justify-between border-b border-gray-800 last:border-0 pb-2">
                  <p className="text-white text-sm truncate">{s.agent_name}</p>
                  <div className="text-right">
                    <p className="text-amber-300 text-sm font-medium">{Math.round(s.avg_ms / 100) / 10}s</p>
                    <p className="text-gray-500 text-xs">{s.runs} runs</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <h3 className="text-sm font-semibold text-white px-4 pt-4 mb-2">Per-agent success rate (30d)</h3>
        {data.perAgent.length === 0 ? (
          <div className="p-4"><EmptyState title="No agent runs in the last 30 days" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/80 text-[11px] uppercase text-gray-500 tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5">Agent</th>
                  <th className="text-left px-4 py-2.5">Total</th>
                  <th className="text-left px-4 py-2.5">Completed</th>
                  <th className="text-left px-4 py-2.5">Failed</th>
                  <th className="text-right px-4 py-2.5">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.perAgent.map((a, i) => {
                  const rate = a.total ? (a.completed / a.total) : 0
                  const tone = rate >= 0.95 ? 'good' : rate >= 0.8 ? 'warn' : 'bad'
                  const cls = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-red-400'
                  return (
                    <tr key={a.agent_name} className={`hover:bg-gray-800/60 ${i % 2 ? 'bg-gray-900/40' : ''}`}>
                      <td className="px-4 py-2.5 text-white">{a.agent_name}</td>
                      <td className="px-4 py-2.5 text-gray-300">{a.total}</td>
                      <td className="px-4 py-2.5 text-emerald-300">{a.completed}</td>
                      <td className="px-4 py-2.5 text-red-300">{a.failed}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${cls}`}>{pct(a.completed, a.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
