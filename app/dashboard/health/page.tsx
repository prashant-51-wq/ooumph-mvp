'use client'

import { useState, useEffect, useCallback } from 'react'

interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  message: string
  latencyMs?: number
  category: 'db' | 'ai' | 'integrations' | 'security' | 'data'
}

interface HealthReport {
  overall: 'ok' | 'warn' | 'fail'
  totals: { ok: number; warn: number; fail: number; skip: number }
  checks: CheckResult[]
  timestamp: string
  environment?: string
  deploymentTarget?: string
}

const STATUS_STYLES = {
  ok: { bg: 'bg-green-900/40', border: 'border-green-700', text: 'text-green-300', icon: '✅', dot: 'bg-green-500' },
  warn: { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', icon: '⚠️', dot: 'bg-yellow-500' },
  fail: { bg: 'bg-red-900/40', border: 'border-red-700', text: 'text-red-300', icon: '❌', dot: 'bg-red-500' },
  skip: { bg: 'bg-gray-800', border: 'border-gray-700', text: 'text-gray-400', icon: '⏭', dot: 'bg-gray-500' },
}

const CATEGORY_LABELS: Record<CheckResult['category'], string> = {
  db: 'Database',
  ai: 'AI Providers',
  security: 'Security & Auth',
  data: 'Your Workspace',
  integrations: 'Integrations',
}

export default function HealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [livePing, setLivePing] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
      const params = new URLSearchParams()
      if (wid) params.set('workspaceId', wid)
      if (livePing) params.set('live', '1')
      const res = await fetch(`/api/health?${params.toString()}`)
      if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`)
      const data = await res.json() as HealthReport
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health report')
    } finally {
      setLoading(false)
    }
  }, [livePing])

  useEffect(() => { fetchReport() }, [fetchReport])

  const grouped = (() => {
    if (!report) return {} as Record<string, CheckResult[]>
    const g: Record<string, CheckResult[]> = {}
    for (const c of report.checks) {
      if (!g[c.category]) g[c.category] = []
      g[c.category].push(c)
    }
    return g
  })()

  return (
    <div className="p-6 max-w-screen-lg mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🩺</span>
            <h1 className="text-2xl font-bold text-white">System Health</h1>
            {report && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[report.overall].bg} ${STATUS_STYLES[report.overall].text} ${STATUS_STYLES[report.overall].border}`}>
                {report.overall === 'ok' ? 'All systems operational' : report.overall === 'warn' ? 'Some warnings' : 'Issues detected'}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm">
            Ground truth on what&apos;s actually working. Pings every critical API, DB table, and provider.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={livePing}
              onChange={e => setLivePing(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            Live AI ping (costs ~$0.0001)
          </label>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Running…' : '↻ Re-run check'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Passing', value: report.totals.ok, status: 'ok' as const },
              { label: 'Warnings', value: report.totals.warn, status: 'warn' as const },
              { label: 'Failing', value: report.totals.fail, status: 'fail' as const },
              { label: 'Skipped', value: report.totals.skip, status: 'skip' as const },
            ].map(t => {
              const s = STATUS_STYLES[t.status]
              return (
                <div key={t.label} className={`rounded-xl p-4 border ${s.bg} ${s.border}`}>
                  <p className={`text-xs font-medium mb-1 ${s.text}`}>{t.label}</p>
                  <p className="text-white text-2xl font-bold">{t.value}</p>
                </div>
              )
            })}
          </div>

          {/* Per-category check list */}
          <div className="space-y-4">
            {Object.entries(grouped).map(([cat, checks]) => (
              <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                  <h2 className="text-white font-semibold text-sm">{CATEGORY_LABELS[cat as CheckResult['category']] || cat}</h2>
                  <span className="text-gray-500 text-xs">{checks.length} checks</span>
                </div>
                <div className="divide-y divide-gray-800">
                  {checks.map((c, i) => {
                    const s = STATUS_STYLES[c.status]
                    return (
                      <div key={i} className="px-5 py-3 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{c.name}</p>
                          <p className={`text-xs mt-0.5 ${s.text}`}>{c.message}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                          {c.latencyMs !== undefined && (
                            <span className="text-gray-500">{c.latencyMs}ms</span>
                          )}
                          <span className="text-base">{s.icon}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between text-xs text-gray-500">
            <span>Last check: {new Date(report.timestamp).toLocaleString()}</span>
            <span>
              {report.environment} · {report.deploymentTarget}
            </span>
          </div>
        </>
      )}

      {loading && !report && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Running health checks…</p>
        </div>
      )}
    </div>
  )
}
