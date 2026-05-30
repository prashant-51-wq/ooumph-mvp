'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users as UsersIcon, Building2, CreditCard, TrendingUp,
  AlertTriangle, Send,
} from 'lucide-react'
import { StatCard, Card, EmptyState, fmtMoney, fmtDateShort, fmtNum, Badge } from './_ui'

interface Stats {
  totalUsers: number
  totalWorkspaces: number
  activeSubscriptions: number
  mrrCents: number
  failedAgents24h: number
  failedPublishes24h: number
}
interface RecentUser { id: string; email: string; name: string; is_admin?: number; created_at: string }
interface RecentWorkspace { id: string; name: string; owner_email: string; status: string; created_at: string }
interface SparkPoint { d: string; c: number }
interface OverviewResponse {
  stats: Stats
  recentUsers: RecentUser[]
  recentWorkspaces: RecentWorkspace[]
  signupSparkline: SparkPoint[]
}

function Spark({ data }: { data: SparkPoint[] }) {
  if (!data?.length) return <p className="text-xs text-gray-600">No recent signups</p>
  const max = Math.max(...data.map(d => d.c), 1)
  return (
    <div className="flex items-end gap-1 h-12 mt-2">
      {data.map((p, i) => (
        <div key={i} className="flex-1 bg-indigo-600/70 rounded-sm" style={{ height: `${(p.c / max) * 100}%`, minHeight: 2 }} title={`${p.d}: ${p.c}`} />
      ))}
    </div>
  )
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/admin/overview', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<OverviewResponse>
      })
      .then(json => { if (!cancelled) setData(json) })
      .catch(err => { if (!cancelled) setError(String(err.message || err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl h-64 animate-pulse" />
          <div className="bg-gray-900 border border-gray-800 rounded-xl h-64 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-900/50">
        <p className="text-red-300 text-sm font-medium">Failed to load overview</p>
        <p className="text-gray-500 text-xs mt-1">{error}</p>
      </Card>
    )
  }

  if (!data) return null

  const s = data.stats

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total Users" value={fmtNum(s.totalUsers)} sub={<span className="inline-flex items-center gap-1"><UsersIcon className="w-3 h-3" />all-time</span>} />
        <StatCard label="Workspaces" value={fmtNum(s.totalWorkspaces)} sub={<span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />all-time</span>} />
        <StatCard label="Active Subs" value={fmtNum(s.activeSubscriptions)} sub={<span className="inline-flex items-center gap-1"><CreditCard className="w-3 h-3" />paying</span>} tone="info" />
        <StatCard label="MRR" value={fmtMoney(s.mrrCents)} sub={<span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" />monthly</span>} tone="good" />
        <StatCard label="Failed Agents 24h" value={fmtNum(s.failedAgents24h)} tone={s.failedAgents24h > 0 ? 'bad' : 'good'} sub={<span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />runs</span>} />
        <StatCard label="Failed Publishes 24h" value={fmtNum(s.failedPublishes24h)} tone={s.failedPublishes24h > 0 ? 'bad' : 'good'} sub={<span className="inline-flex items-center gap-1"><Send className="w-3 h-3" />posts</span>} />
      </div>

      {/* Signup sparkline */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Signups · last 14 days</h3>
            <p className="text-xs text-gray-500 mt-0.5">New users per day</p>
          </div>
        </div>
        <Spark data={data.signupSparkline} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent signups */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Recent signups</h3>
            <Link href="/dashboard/admin/users" className="text-xs text-indigo-400 hover:underline">View all</Link>
          </div>
          {data.recentUsers.length === 0 ? (
            <EmptyState title="No users yet" body="Once people sign up they'll show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-gray-500 tracking-wide">
                  <tr><th className="text-left py-2 pr-3">User</th><th className="text-left py-2 pr-3">Role</th><th className="text-left py-2">Joined</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.recentUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-800/40">
                      <td className="py-2 pr-3">
                        <p className="text-white truncate max-w-[200px]">{u.name || u.email}</p>
                        <p className="text-gray-500 text-xs truncate max-w-[200px]">{u.email}</p>
                      </td>
                      <td className="py-2 pr-3">
                        {u.is_admin === 1 ? <Badge tone="indigo">Admin</Badge> : <Badge>User</Badge>}
                      </td>
                      <td className="py-2 text-gray-400 text-xs">{fmtDateShort(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recent workspaces */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Recent workspaces</h3>
            <Link href="/dashboard/admin/workspaces" className="text-xs text-indigo-400 hover:underline">View all</Link>
          </div>
          {data.recentWorkspaces.length === 0 ? (
            <EmptyState title="No workspaces yet" body="Workspaces will show up as agencies onboard." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-gray-500 tracking-wide">
                  <tr><th className="text-left py-2 pr-3">Workspace</th><th className="text-left py-2 pr-3">Status</th><th className="text-left py-2">Created</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.recentWorkspaces.map(w => (
                    <tr key={w.id} className="hover:bg-gray-800/40">
                      <td className="py-2 pr-3">
                        <p className="text-white truncate max-w-[200px]">{w.name}</p>
                        <p className="text-gray-500 text-xs truncate max-w-[200px]">{w.owner_email}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={w.status === 'active' ? 'green' : w.status === 'suspended' ? 'red' : 'gray'}>{w.status}</Badge>
                      </td>
                      <td className="py-2 text-gray-400 text-xs">{fmtDateShort(w.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
