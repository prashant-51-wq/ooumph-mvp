'use client'

import { useState, useEffect } from 'react'

type MonitorType = 'mentions' | 'competitors' | 'sentiment' | 'trends' | 'all'

interface BusinessMention {
  title: string
  url: string
  snippet: string
  sentiment: 'positive' | 'neutral' | 'negative'
}

interface CompetitorNews {
  competitor: string
  update: string
  impact: string
}

interface Alert {
  level: 'high' | 'medium' | 'low'
  message: string
}

interface BrandReport {
  businessMentions: BusinessMention[]
  competitorNews: CompetitorNews[]
  industryTrends: string[]
  alerts: Alert[]
  recommendedActions: string[]
  scannedAt?: string
  monitorType?: string
}

interface HistoryItem {
  id: string
  title: string
  content_json: BrandReport & { businessName?: string }
  created_at: string
}

const MONITOR_TYPES: { key: MonitorType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '🔍' },
  { key: 'mentions', label: 'Mentions', icon: '🔔' },
  { key: 'competitors', label: 'Competitors', icon: '🏢' },
  { key: 'sentiment', label: 'Sentiment', icon: '❤️' },
  { key: 'trends', label: 'Trends', icon: '📈' },
]

const ALERT_STYLES: Record<string, string> = {
  high: 'bg-red-950 border-red-800 text-red-300',
  medium: 'bg-yellow-950 border-yellow-800 text-yellow-300',
  low: 'bg-blue-950 border-blue-800 text-blue-300',
}

const ALERT_BADGE: Record<string, string> = {
  high: 'bg-red-700 text-red-100',
  medium: 'bg-yellow-700 text-yellow-100',
  low: 'bg-blue-700 text-blue-100',
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: 'bg-green-900 border-green-700 text-green-300',
  neutral: 'bg-gray-800 border-gray-700 text-gray-400',
  negative: 'bg-red-900 border-red-700 text-red-300',
}

export default function BrandMonitorPage() {
  const [monitorType, setMonitorType] = useState<MonitorType>('all')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<BrandReport | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    fetch(`/api/agents/brand-monitor?workspaceId=${wid}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setHistory(data)
          const latest = data[0]
          setReport(latest.content_json)
          setLastScan(latest.created_at)
        }
      })
      .catch(() => null)
  }, [])

  const scan = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/agents/brand-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, monitorType }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Scan failed'); return }
      setReport(data.report)
      setLastScan(new Date().toISOString())

      // Refresh history
      fetch(`/api/agents/brand-monitor?workspaceId=${workspaceId}`)
        .then(r => r.json())
        .then(d => Array.isArray(d) ? setHistory(d) : null)
        .catch(() => null)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">👁️ Brand Monitor</h1>
        <p className="text-gray-400 text-sm mt-1">Real-time brand & competitor intelligence powered by live web signals.</p>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-3">Monitor Scope</label>
            <div className="flex flex-wrap gap-2">
              {MONITOR_TYPES.map(mt => (
                <button
                  key={mt.key}
                  onClick={() => setMonitorType(mt.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${monitorType === mt.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700 hover:text-white'}`}
                >
                  <span>{mt.icon}</span>
                  <span>{mt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {lastScan && (
              <p className="text-gray-600 text-xs">Last scan: {new Date(lastScan).toLocaleString()}</p>
            )}
            <button
              onClick={scan}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning the web...
                </>
              ) : (
                <>🔍 Scan Now</>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Report */}
      {report && (
        <div className="space-y-5">
          {/* Alerts */}
          {report.alerts && report.alerts.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-4">🔔 Alerts ({report.alerts.length})</h2>
              <div className="space-y-2">
                {report.alerts.map((alert, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${ALERT_STYLES[alert.level]}`}>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0 ${ALERT_BADGE[alert.level]}`}>
                      {alert.level}
                    </span>
                    <p className="text-sm leading-relaxed">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Business Mentions */}
          {report.businessMentions && report.businessMentions.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-4">📰 Business Mentions ({report.businessMentions.length})</h2>
              <div className="space-y-3">
                {report.businessMentions.map((mention, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <a
                        href={mention.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium leading-tight transition-colors"
                      >
                        {mention.title}
                      </a>
                      <span className={`px-2 py-0.5 rounded-full text-xs border flex-shrink-0 ${SENTIMENT_STYLES[mention.sentiment]}`}>
                        {mention.sentiment}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">{mention.snippet}</p>
                    <p className="text-gray-600 text-xs mt-1 truncate">{mention.url}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitor Updates */}
          {report.competitorNews && report.competitorNews.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-4">🏢 Competitor Updates ({report.competitorNews.length})</h2>
              <div className="space-y-3">
                {report.competitorNews.map((news, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-4">
                    <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">{news.competitor}</p>
                    <p className="text-white text-sm mb-2">{news.update}</p>
                    <div className="flex items-start gap-2">
                      <span className="text-yellow-400 text-xs mt-0.5">Impact:</span>
                      <p className="text-gray-400 text-xs leading-relaxed">{news.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Industry Trends */}
          {report.industryTrends && report.industryTrends.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-4">📈 Industry Trends</h2>
              <ul className="space-y-2">
                {report.industryTrends.map((trend, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <p className="text-gray-300 text-sm leading-relaxed">{trend}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Actions */}
          {report.recommendedActions && report.recommendedActions.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-4">✅ Recommended Actions</h2>
              <div className="space-y-2">
                {report.recommendedActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded border border-gray-700 flex-shrink-0 mt-0.5" />
                    <p className="text-gray-300 text-sm leading-relaxed">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!report && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">👁️</p>
          <p className="text-white font-semibold mb-2">No scans yet</p>
          <p className="text-gray-500 text-sm">Click "Scan Now" to monitor your brand mentions, competitor activity, and industry trends.</p>
        </div>
      )}

      {/* Previous Scans */}
      {history.length > 1 && (
        <div className="mt-8">
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Previous Scans</h2>
          <div className="space-y-2">
            {history.slice(1).map(item => (
              <div
                key={item.id}
                onClick={() => { setReport(item.content_json); setLastScan(item.created_at) }}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-white text-sm">{item.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  {item.content_json.alerts?.some(a => a.level === 'high') && (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-700 text-red-100 font-bold">HIGH ALERT</span>
                  )}
                  <span className="text-gray-600 text-xs">{item.content_json.alerts?.length || 0} alerts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
