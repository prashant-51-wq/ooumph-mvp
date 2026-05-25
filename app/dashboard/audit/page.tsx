'use client'

import { useState, useEffect, useCallback } from 'react'

interface AgentRun {
  id: string
  agent_name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  error_message?: string
}

type FilterStatus = 'all' | 'completed' | 'failed' | 'running'

const STATUS_ICON: Record<string, string> = {
  running: '⟳',
  completed: '✓',
  failed: '✕',
  pending: '○',
}

const STATUS_COLOR: Record<string, string> = {
  running: 'text-indigo-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-gray-500',
}

const STATUS_BG: Record<string, string> = {
  running: 'bg-indigo-950 border-indigo-800',
  completed: 'bg-green-950 border-green-900',
  failed: 'bg-red-950 border-red-900',
  pending: 'bg-gray-900 border-gray-800',
}

function agentLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function durationSeconds(created: string, completed?: string): number | null {
  if (!completed) return null
  const diff = new Date(completed).getTime() - new Date(created).getTime()
  return Math.round(diff / 1000)
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

const PAGE_SIZE = 20

export default function AuditLogPage() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const load = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=50`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown = await res.json()
      if (Array.isArray(data)) {
        setRuns(data as AgentRun[])
      } else {
        setRuns([])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? runs : runs.filter(r => r.status === filter)
  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'running', label: 'Running' },
  ]

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">📋 Audit Log</h1>
        <p className="text-gray-400 text-sm mt-1">Every AI action and approval in your workspace.</p>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setVisible(PAGE_SIZE) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          Failed to load audit log: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
          <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading audit log...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">
            {filter === 'all'
              ? 'No agent runs yet. Start generating content to see activity here.'
              : `No ${filter} runs found.`}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && shown.length > 0 && (
        <div className="space-y-2">
          {shown.map(run => {
            const dur = durationSeconds(run.created_at, run.completed_at)
            return (
              <div
                key={run.id}
                className={`flex items-start gap-4 p-4 rounded-xl border ${STATUS_BG[run.status] || 'bg-gray-900 border-gray-800'}`}>
                {/* Status icon */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold border ${STATUS_BG[run.status]} ${STATUS_COLOR[run.status]}`}>
                  {STATUS_ICON[run.status]}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">{agentLabel(run.agent_name)}</span>
                    <span className={`text-xs capitalize font-medium ${STATUS_COLOR[run.status]}`}>{run.status}</span>
                    {dur !== null && (
                      <span className="text-gray-500 text-xs">{formatDuration(dur)}</span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {new Date(run.created_at).toLocaleString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </p>
                  {run.status === 'failed' && run.error_message && (
                    <p className="text-red-400 text-xs mt-1.5 break-words">{run.error_message}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisible(v => v + PAGE_SIZE)}
            className="px-6 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors">
            Load more ({filtered.length - visible} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
