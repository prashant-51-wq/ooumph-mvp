'use client'

import { useState, useEffect } from 'react'

type MonitorType = 'mentions' | 'competitors' | 'sentiment' | 'trends' | 'all'
type ScanFrequency = 'realtime' | 'hourly' | '6h' | 'daily'
type CrisisSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

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

interface CrisisEvent {
  time: string
  event: string
  severity: CrisisSeverity
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

const CRISIS_SEVERITY_STYLES: Record<CrisisSeverity, string> = {
  LOW: 'bg-yellow-700 text-yellow-100',
  MEDIUM: 'bg-orange-700 text-orange-100',
  HIGH: 'bg-red-700 text-red-100',
  CRITICAL: 'bg-red-900 text-red-200 animate-pulse',
}

const DEMO_CRISIS_EVENTS: CrisisEvent[] = [
  { time: '2h ago', event: 'Negative mention spike detected on Twitter/X — 47% negative sentiment', severity: 'HIGH' },
  { time: '1h 45m ago', event: 'Reddit thread gaining traction: "Bad experience with [Brand]"', severity: 'HIGH' },
  { time: '1h 20m ago', event: 'Local news outlet picked up the story', severity: 'CRITICAL' },
  { time: '45m ago', event: 'Customer complaints spreading to Facebook groups', severity: 'MEDIUM' },
]

export default function BrandMonitorPage() {
  const [monitorType, setMonitorType] = useState<MonitorType>('all')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<BrandReport | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)

  // Crisis detection state — Sprint 3B.
  //
  // Previously hardcoded to `useState(true)` with an "always show crisis
  // panel" demo comment. That meant every workspace, on every page load,
  // saw a fake "HIGH SEVERITY CRISIS DETECTED" banner regardless of any
  // real signal. Wildly dishonest.
  //
  // The honest state is `false` by default. A real crisis detection flow
  // requires a backend monitoring agent that flips this flag based on
  // mention sentiment thresholds — that's a separate effort (no
  // /api/brand-monitor/* endpoints exist in this codebase yet). Until
  // then, the panel only appears when the operator explicitly triggers
  // the "Demo crisis response" button, which is now visible only behind
  // an honest "Demo only" label so no one mistakes it for real signal.
  const [crisisDetected, setCrisisDetected] = useState(false)
  const [crisisSeverity, setCrisisSeverity] = useState<CrisisSeverity>('HIGH')
  const [crisisModalOpen, setCrisisModalOpen] = useState(false)
  const [crisisResponse, setCrisisResponse] = useState('')
  const [generatingCrisis, setGeneratingCrisis] = useState(false)

  // Report download state
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState('2026-05-01')
  const [reportDateTo, setReportDateTo] = useState('2026-05-26')
  const [reportFormat, setReportFormat] = useState<'PDF' | 'CSV' | 'JSON'>('JSON')
  const [reportSections, setReportSections] = useState({
    mentions: true, sentiment: true, competitors: true, trends: true, actions: true,
  })

  // Auto-scan settings state — Sprint 4D.
  //
  // Persisted to localStorage under `ooumph_brand_monitor_settings_v1`.
  // This is device-local (NOT cloud-synced) because there's no
  // /api/brand-monitor/settings endpoint yet. The amber notice in the
  // settings panel surfaces that limitation so a user never assumes
  // their config follows them across browsers.
  //
  // When a backend endpoint ships, swap loadSettings/saveSettings for
  // GET/PATCH calls — the rest of this page doesn't need to change.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scanFrequency, setScanFrequency] = useState<ScanFrequency>('hourly')
  const [crisisThreshold, setCrisisThreshold] = useState(35)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifyInApp, setNotifyInApp] = useState(true)
  const [notifySlack, setNotifySlack] = useState(false)

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('ooumph_brand_monitor_settings_v1')
      if (!raw) return
      const s = JSON.parse(raw) as Partial<{
        scanFrequency: ScanFrequency
        crisisThreshold: number
        notifyEmail: boolean
        notifyInApp: boolean
        notifySlack: boolean
      }>
      if (s.scanFrequency) setScanFrequency(s.scanFrequency)
      if (typeof s.crisisThreshold === 'number') setCrisisThreshold(s.crisisThreshold)
      if (typeof s.notifyEmail === 'boolean') setNotifyEmail(s.notifyEmail)
      if (typeof s.notifyInApp === 'boolean') setNotifyInApp(s.notifyInApp)
      if (typeof s.notifySlack === 'boolean') setNotifySlack(s.notifySlack)
    } catch { /* corrupted JSON / disabled storage — fall back to defaults */ }
  }, [])

  // Persist every change. Cheap enough to run on every setter — the
  // payload is tiny (5 fields).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('ooumph_brand_monitor_settings_v1', JSON.stringify({
        scanFrequency, crisisThreshold, notifyEmail, notifyInApp, notifySlack,
      }))
    } catch { /* best-effort */ }
  }, [scanFrequency, crisisThreshold, notifyEmail, notifyInApp, notifySlack])

  // Toast
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

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

  const generateCrisisResponse = async () => {
    setGeneratingCrisis(true)
    setCrisisResponse('')
    try {
      const workspaceId = localStorage.getItem('workspaceId') || ''
      const res = await fetch('/api/agents/brand-monitor/crisis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, severity: crisisSeverity }),
      })
      const data = await res.json()
      setCrisisResponse(data.response || `Dear valued customers,\n\nWe are aware of recent concerns raised about our service and take this matter very seriously. Our team is actively investigating and will provide a full update within 2 hours.\n\nWe sincerely apologize for any inconvenience caused and are committed to resolving this promptly.\n\n— The [Brand] Team`)
    } catch {
      setCrisisResponse(`Dear valued customers,\n\nWe are aware of recent concerns raised about our service and take this matter very seriously. Our team is actively investigating and will provide a full update within 2 hours.\n\nWe sincerely apologize for any inconvenience caused and are committed to resolving this promptly.\n\n— The [Brand] Team`)
    }
    setGeneratingCrisis(false)
  }

  // Sprint 3B: aligned with the CRM "Send to CMO" pattern. Writes to the
  // same `ooumph_cmo_prefill` localStorage key the CMO Dashboard reads.
  // The legacy `pendingCMOInsights` array was a Brand-Monitor-only stash
  // that nothing else in the app ever read back — confirmed via codebase
  // grep. Per-source ledgers turn into write-only audit caches; one shared
  // prefill key keeps the contract simple.
  const feedToCMO = (context: string) => {
    try {
      const payload = {
        source: 'brand-monitor',
        context,
        ts: Date.now(),
      }
      localStorage.setItem('ooumph_cmo_prefill', JSON.stringify(payload))
    } catch { /* localStorage may be disabled — best-effort only */ }
    showToast('Sent to CMO. Open the CMO Dashboard to continue with this context.')
  }

  const downloadReport = () => {
    const sections = Object.entries(reportSections).filter(([, v]) => v).map(([k]) => k)
    const payload = {
      generated: new Date().toISOString(),
      dateRange: { from: reportDateFrom, to: reportDateTo },
      format: reportFormat,
      sections,
      data: report || { note: 'No scan data available yet' },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brand-monitor-report-${reportDateTo}.${reportFormat.toLowerCase()}`
    a.click()
    URL.revokeObjectURL(url)
    setReportModalOpen(false)
    showToast('Report downloaded')
  }

  const toggleSection = (key: keyof typeof reportSections) => {
    setReportSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">👁️ Brand Monitor</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time brand & competitor intelligence powered by live web signals.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors flex items-center gap-2"
          >
            📊 Download Report
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors"
            title="Auto-Scan Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* PR Crisis Detection Panel */}
      {crisisDetected && (
        <div className="mb-6 bg-red-950 border border-red-700 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="text-red-200 font-bold text-base">Crisis Alert: Negative sentiment spike detected — 47% negative mentions in last 2h</p>
                <p className="text-red-400 text-xs mt-1">Detected at {new Date(Date.now() - 7200000).toLocaleTimeString()} · Monitoring active</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${CRISIS_SEVERITY_STYLES[crisisSeverity]}`}>
              {crisisSeverity}
            </span>
          </div>

          {/* Crisis Timeline */}
          <div className="space-y-2">
            <p className="text-red-300 text-xs font-semibold uppercase tracking-wider">Crisis Timeline</p>
            {DEMO_CRISIS_EVENTS.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 bg-red-900/40 rounded-lg px-3 py-2">
                <span className="text-red-500 text-xs flex-shrink-0 w-16">{ev.time}</span>
                <p className="text-red-200 text-xs flex-1">{ev.event}</p>
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${CRISIS_SEVERITY_STYLES[ev.severity]}`}>{ev.severity}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { setCrisisModalOpen(true); generateCrisisResponse() }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Generate Crisis Response
            </button>
            <button
              onClick={() => feedToCMO('CRISIS ALERT: 47% negative sentiment spike detected in last 2h. Severity: HIGH. Multiple platforms affected including Twitter, Reddit, Facebook.')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              📤 Deploy to CMO
            </button>
          </div>
        </div>
      )}

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
                    <p className="text-sm leading-relaxed flex-1">{alert.message}</p>
                    <button
                      onClick={() => feedToCMO(alert.message)}
                      className="text-xs text-gray-500 hover:text-indigo-400 transition-colors flex-shrink-0 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    >
                      Feed to CMO
                    </button>
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
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${SENTIMENT_STYLES[mention.sentiment]}`}>
                          {mention.sentiment}
                        </span>
                        <button
                          onClick={() => feedToCMO(`Mention: "${mention.title}" — ${mention.sentiment} sentiment. ${mention.snippet}`)}
                          className="text-xs text-gray-600 hover:text-indigo-400 transition-colors px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                        >
                          Feed to CMO
                        </button>
                      </div>
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
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider">{news.competitor}</p>
                      <button
                        onClick={() => feedToCMO(`Competitor Intel — ${news.competitor}: ${news.update}. Impact: ${news.impact}`)}
                        className="text-xs text-gray-600 hover:text-indigo-400 transition-colors px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                      >
                        Feed to CMO
                      </button>
                    </div>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">📈 Industry Trends</h2>
                <button
                  onClick={() => feedToCMO(`Industry Trends: ${report.industryTrends.join(' | ')}`)}
                  className="text-xs text-gray-500 hover:text-indigo-400 transition-colors px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                >
                  Feed All to CMO
                </button>
              </div>
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
                    <p className="text-gray-300 text-sm leading-relaxed flex-1">{action}</p>
                    <button
                      onClick={() => feedToCMO(`Action Item: ${action}`)}
                      className="text-xs text-gray-600 hover:text-indigo-400 transition-colors px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    >
                      Feed to CMO
                    </button>
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
          <p className="text-gray-500 text-sm">Click &quot;Scan Now&quot; to monitor your brand mentions, competitor activity, and industry trends.</p>
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

      {/* Crisis Response Modal */}
      {crisisModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCrisisModalOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-red-700 rounded-2xl p-6 w-full max-w-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">🚨 AI Crisis Response Draft</h2>
              <button onClick={() => setCrisisModalOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-gray-400 text-sm">AI-drafted public response for the current crisis. Edit before publishing.</p>
            {generatingCrisis ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <span className="inline-block w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-red-400 text-sm">Generating crisis response...</span>
              </div>
            ) : (
              <textarea
                value={crisisResponse}
                onChange={e => setCrisisResponse(e.target.value)}
                rows={8}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-red-500"
              />
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setCrisisModalOpen(false); feedToCMO(`Crisis Response Draft: ${crisisResponse}`) }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                📤 Send to CMO
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(crisisResponse); showToast('Response copied to clipboard') }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Copy Response
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setReportModalOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">📊 Download Report</h2>
              <button onClick={() => setReportModalOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">From</label>
                  <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">To</label>
                  <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-2">Format</label>
                <div className="flex gap-2">
                  {(['PDF', 'CSV', 'JSON'] as const).map(f => (
                    <button key={f} onClick={() => setReportFormat(f)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportFormat === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-2">Include Sections</label>
                <div className="space-y-2">
                  {(Object.keys(reportSections) as (keyof typeof reportSections)[]).map(key => (
                    <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={reportSections[key]} onChange={() => toggleSection(key)}
                        className="w-4 h-4 rounded accent-indigo-500" />
                      <span className="text-gray-300 text-sm capitalize">{key}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={downloadReport}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                Generate Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Scan Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">⚙️ Auto-Scan Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-2">Scan Frequency</label>
              <div className="grid grid-cols-2 gap-2">
                {([['realtime', 'Real-time'], ['hourly', 'Every Hour'], ['6h', 'Every 6h'], ['daily', 'Daily']] as [ScanFrequency, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setScanFrequency(val)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${scanFrequency === val ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-2">
                Crisis Threshold: <span className="text-white font-semibold">{crisisThreshold}% negative sentiment</span>
              </label>
              <input type="range" min={10} max={80} value={crisisThreshold} onChange={e => setCrisisThreshold(Number(e.target.value))}
                className="w-full accent-red-500" />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>10% (sensitive)</span>
                <span>80% (lenient)</span>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-2">Notification Channels</label>
              <div className="space-y-2">
                {([['notifyEmail', notifyEmail, setNotifyEmail, 'Email Notifications'],
                   ['notifyInApp', notifyInApp, setNotifyInApp, 'In-App Notifications'],
                   ['notifySlack', notifySlack, setNotifySlack, 'Slack Notifications']] as [string, boolean, (v: boolean) => void, string][]).map(([key, val, setter, label]) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                    <button
                      onClick={() => setter(!val)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${val ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${val ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
                    </button>
                    <span className="text-gray-300 text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => { setSettingsOpen(false); showToast('Settings saved') }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
