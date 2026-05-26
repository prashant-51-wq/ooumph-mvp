'use client'

import { useState, useEffect, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type LogLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
type LogSource = string
type LogFilter = 'All' | 'Agent Actions' | 'User Actions' | 'API Calls' | 'Errors' | 'Warnings'

interface ActivityLogEntry {
  id: string
  timestamp: string
  level: LogLevel
  source: LogSource
  action: string
  details: {
    request?: string
    response?: string
    duration?: string
    cost?: string
    statusCode?: number
    tokens?: { input: number; output: number }
  }
}

interface AgentTask {
  id: string
  agentId: string
  agentName: string
  timestamp: string
  type: string
  status: 'success' | 'failed' | 'running'
  duration: string
  cost: number
  input: string
  output: string
  tokens: { input: number; output: number }
  error?: string
}

interface ApiCall {
  id: string
  timestamp: string
  method: string
  endpoint: string
  statusCode: number
  duration: number
  size: string
  provider: string
}

interface ServiceHealth {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  latency: number
  lastChecked: string
  uptime: string
}

interface Incident {
  id: string
  date: string
  service: string
  severity: 'low' | 'medium' | 'high'
  description: string
  resolved: boolean
  duration: string
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const now = Date.now()
const ts = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString()
const fmtTs = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const ACTIVITY_LOGS: ActivityLogEntry[] = [
  { id: 'al1', timestamp: ts(0.5), level: 'SUCCESS', source: 'Blog Writer Agent', action: 'Published post "Top 10 SaaS Tools for 2026" to WordPress', details: { duration: '22.4s', cost: '$0.042', statusCode: 201, tokens: { input: 1240, output: 1847 } } },
  { id: 'al2', timestamp: ts(1), level: 'INFO', source: 'CMO Agent', action: 'Q2 strategy update initiated — orchestrating 4 sub-tasks', details: { duration: '14.1s', cost: '$0.084' } },
  { id: 'al3', timestamp: ts(2), level: 'INFO', source: 'User', action: 'User configured Content Supervisor tone → Professional', details: { request: '{"tone":"Professional","agentId":"content-sup"}', response: '{"ok":true}', duration: '312ms' } },
  { id: 'al4', timestamp: ts(3), level: 'SUCCESS', source: 'Lead Scorer Agent', action: 'Scored 47 leads — 12 flagged High Intent, 8 escalated to CRM Agent', details: { duration: '3.7s', cost: '$0.018', tokens: { input: 940, output: 480 } } },
  { id: 'al5', timestamp: ts(4), level: 'WARNING', source: 'Analytics Agent', action: 'Google Analytics API rate limit approaching — 92% of daily quota used', details: { statusCode: 429, response: '{"quotaExceeded":false,"usagePercent":92}' } },
  { id: 'al6', timestamp: ts(5), level: 'INFO', source: 'Social Media Agent', action: 'Scheduled 8 posts across LinkedIn, X, Instagram for next 3 days', details: { duration: '5.3s', cost: '$0.029' } },
  { id: 'al7', timestamp: ts(6), level: 'ERROR', source: 'Outreach Agent', action: 'Email delivery failed — SMTP connection timeout after 3 retries', details: { statusCode: 503, response: '{"error":"SMTP timeout","retries":3,"nextRetry":"15m"}', duration: '45.1s' } },
  { id: 'al8', timestamp: ts(8), level: 'SUCCESS', source: 'Brand Monitor Agent', action: 'Completed daily brand scan — 156 mentions processed, 3 flagged', details: { duration: '8.2s', cost: '$0.019', tokens: { input: 3200, output: 412 } } },
  { id: 'al9', timestamp: ts(11), level: 'INFO', source: 'System', action: 'Daily cost reset — previous day total: $6.42', details: {} },
  { id: 'al10', timestamp: ts(13), level: 'SUCCESS', source: 'SEO Agent', action: 'On-page audit complete — 5 posts optimized, avg score 84/100', details: { duration: '11.2s', cost: '$0.031' } },
  { id: 'al11', timestamp: ts(15), level: 'WARNING', source: 'CRM Agent', action: 'Duplicate lead detected — john@acmecorp.com exists twice in pipeline', details: { response: '{"duplicateId":"lead_4421","mergeRequired":true}' } },
  { id: 'al12', timestamp: ts(18), level: 'INFO', source: 'User', action: 'User triggered "Generate Growth Plan" manually', details: { request: '{"workspaceId":"ws_abc","growthGoal":"10K followers in 90 days"}' } },
  { id: 'al13', timestamp: ts(22), level: 'SUCCESS', source: 'Research Agent', action: 'Competitor pricing analysis complete — 6 competitors benchmarked', details: { duration: '31.2s', cost: '$0.044', tokens: { input: 4100, output: 2800 } } },
  { id: 'al14', timestamp: ts(28), level: 'ERROR', source: 'System', action: 'AI API (OpenAI) latency spike — P99 >5s for 3 minutes', details: { duration: '3m 12s', response: '{"provider":"openai","p99_ms":5240,"resolved":true}' } },
  { id: 'al15', timestamp: ts(35), level: 'INFO', source: 'Reputation Agent', action: 'Responded to 2 G2 reviews and 1 Trustpilot review', details: { duration: '6.8s', cost: '$0.006' } },
]

const AGENT_NAMES = [
  'CMO Agent', 'Content Supervisor', 'Blog Writer Agent', 'Social Media Agent',
  'Email Copywriter Agent', 'SEO Agent', 'Lead Scorer Agent', 'CRM Agent',
  'Brand Monitor Agent', 'Research Agent', 'Analytics Agent',
]

const AGENT_TASKS: AgentTask[] = [
  { id: 't1', agentId: 'blog-writer', agentName: 'Blog Writer Agent', timestamp: ts(0.5), type: 'Post Generation', status: 'success', duration: '22.4s', cost: 0.042, input: 'Write SEO blog post about AI marketing automation trends for 2026, min 1500 words', output: '1,847 word blog post with 3 primary keywords, 4 H2 sections, meta description', tokens: { input: 1240, output: 1847 } },
  { id: 't2', agentId: 'lead-scorer', agentName: 'Lead Scorer Agent', timestamp: ts(3), type: 'Lead Scoring Batch', status: 'success', duration: '3.7s', cost: 0.018, input: 'Score 47 new inbound leads from Typeform submissions (last 24h)', output: '47 leads scored. High Intent: 12. Mid Intent: 22. Low: 13. Escalated 12 to CRM Agent.', tokens: { input: 940, output: 480 } },
  { id: 't3', agentId: 'social-agent', agentName: 'Social Media Agent', timestamp: ts(5), type: 'Post Scheduling', status: 'success', duration: '5.3s', cost: 0.029, input: 'Schedule approved posts from content calendar for LinkedIn, X, Instagram — next 3 days', output: '8 posts scheduled: 3 LinkedIn, 3 Instagram, 2 X. Optimal posting times applied.', tokens: { input: 620, output: 340 } },
  { id: 't4', agentId: 'outreach-agent', agentName: 'Outreach Agent', timestamp: ts(7), type: 'Email Send', status: 'failed', duration: '45.1s', cost: 0.008, input: 'Send follow-up email sequence to 15 leads who opened demo email last week', output: '', tokens: { input: 280, output: 0 }, error: 'SMTP connection timeout after 3 retries. Provider: Resend. Last attempt: 45.1s. Queued for retry in 15 minutes.' },
  { id: 't5', agentId: 'analytics-agent', agentName: 'Analytics Agent', timestamp: ts(9), type: 'Report Generation', status: 'success', duration: '14.9s', cost: 0.028, input: 'Generate Q2 performance dashboard: traffic, conversions, social reach, email metrics', output: 'Report generated: 14 slides. Traffic +18% MoM. Conversions +7%. Email open rate 31.4%.', tokens: { input: 1840, output: 1120 } },
  { id: 't6', agentId: 'seo-agent', agentName: 'SEO Agent', timestamp: ts(13), type: 'On-page Audit', status: 'success', duration: '11.2s', cost: 0.031, input: 'Audit on-page SEO for 5 blog posts published last week. Score and recommendations.', output: 'Audit complete. Avg score 84/100. 3 posts need internal link fixes. 2 need meta desc updates.', tokens: { input: 2100, output: 940 } },
  { id: 't7', agentId: 'brand-monitor', agentName: 'Brand Monitor Agent', timestamp: ts(8), type: 'Brand Scan', status: 'success', duration: '8.2s', cost: 0.019, input: 'Scan Twitter, Reddit, LinkedIn for brand mentions in last 4 hours. Flag sentiment < 0.4.', output: '156 mentions found. 3 flagged negative: 1 Twitter complaint, 2 Reddit threads. Escalated.', tokens: { input: 3200, output: 412 } },
]

const API_CALLS: ApiCall[] = [
  { id: 'a1', timestamp: ts(0.3), method: 'POST', endpoint: '/api/agents/blog', statusCode: 200, duration: 2241, size: '12.4 KB', provider: 'Internal' },
  { id: 'a2', timestamp: ts(0.8), method: 'POST', endpoint: 'api.anthropic.com/v1/messages', statusCode: 200, duration: 8412, size: '4.2 KB', provider: 'Anthropic' },
  { id: 'a3', timestamp: ts(1.2), method: 'GET', endpoint: '/api/agent-runs?limit=50', statusCode: 200, duration: 89, size: '8.1 KB', provider: 'Internal' },
  { id: 'a4', timestamp: ts(2.1), method: 'POST', endpoint: 'api.openai.com/v1/chat/completions', statusCode: 200, duration: 3241, size: '2.8 KB', provider: 'OpenAI' },
  { id: 'a5', timestamp: ts(3.5), method: 'GET', endpoint: 'analyticsdata.googleapis.com/v1beta/properties', statusCode: 200, duration: 441, size: '18.2 KB', provider: 'Google' },
  { id: 'a6', timestamp: ts(4.2), method: 'POST', endpoint: '/api/agents/leads/enrich', statusCode: 500, duration: 12041, size: '0.4 KB', provider: 'Internal' },
  { id: 'a7', timestamp: ts(5.1), method: 'POST', endpoint: 'api.resend.com/emails', statusCode: 503, duration: 45120, size: '0.2 KB', provider: 'Resend' },
  { id: 'a8', timestamp: ts(6.4), method: 'GET', endpoint: '/api/workspace/settings', statusCode: 200, duration: 44, size: '2.1 KB', provider: 'Internal' },
  { id: 'a9', timestamp: ts(7.2), method: 'POST', endpoint: 'api.anthropic.com/v1/messages', statusCode: 200, duration: 6820, size: '3.1 KB', provider: 'Anthropic' },
  { id: 'a10', timestamp: ts(8.9), method: 'DELETE', endpoint: '/api/content/draft/14', statusCode: 204, duration: 31, size: '0 KB', provider: 'Internal' },
  { id: 'a11', timestamp: ts(10.1), method: 'POST', endpoint: 'api.openai.com/v1/chat/completions', statusCode: 429, duration: 412, size: '0.6 KB', provider: 'OpenAI' },
  { id: 'a12', timestamp: ts(11.3), method: 'GET', endpoint: 'searchconsole.googleapis.com/v1/sites', statusCode: 200, duration: 1241, size: '5.7 KB', provider: 'Google' },
]

const SERVICE_HEALTH: ServiceHealth[] = [
  { name: 'Database (PostgreSQL)', status: 'healthy', latency: 12, lastChecked: '30s ago', uptime: '99.99%' },
  { name: 'AI API — Anthropic', status: 'healthy', latency: 340, lastChecked: '1m ago', uptime: '99.94%' },
  { name: 'AI API — OpenAI', status: 'healthy', latency: 280, lastChecked: '1m ago', uptime: '99.91%' },
  { name: 'Email Provider (Resend)', status: 'degraded', latency: 1240, lastChecked: '2m ago', uptime: '99.12%' },
  { name: 'File Storage (Cloudinary)', status: 'healthy', latency: 89, lastChecked: '30s ago', uptime: '99.98%' },
  { name: 'Job Queue (Redis)', status: 'healthy', latency: 8, lastChecked: '10s ago', uptime: '100.00%' },
  { name: 'Auth (NextAuth)', status: 'healthy', latency: 22, lastChecked: '45s ago', uptime: '99.99%' },
  { name: 'Social API (Buffer)', status: 'healthy', latency: 187, lastChecked: '2m ago', uptime: '99.80%' },
]

const INCIDENTS: Incident[] = [
  { id: 'i1', date: '2026-05-26', service: 'OpenAI API', severity: 'medium', description: 'P99 latency spike >5s for 3 minutes during peak usage window', resolved: true, duration: '3m 12s' },
  { id: 'i2', date: '2026-05-25', service: 'Email Provider', severity: 'high', description: 'SMTP outage — Resend service disruption affected 12 scheduled emails', resolved: true, duration: '18m 44s' },
  { id: 'i3', date: '2026-05-24', service: 'Database', severity: 'low', description: 'Slow query detected on agent_runs table — missing index on created_at', resolved: true, duration: '6m 10s' },
  { id: 'i4', date: '2026-05-22', service: 'Social API', severity: 'medium', description: 'Buffer API rate limit hit — 3 posts delayed by 1 hour', resolved: true, duration: '1h 02m' },
]

// Rate limit data
const PROVIDER_LIMITS = [
  { provider: 'Anthropic', used: 68, limit: 100, unit: 'RPM', color: 'bg-indigo-500' },
  { provider: 'OpenAI', used: 82, limit: 100, unit: 'RPM', color: 'bg-green-500' },
  { provider: 'ElevenLabs', used: 14, limit: 100, unit: 'chars/min', color: 'bg-purple-500' },
  { provider: 'Google APIs', used: 92, limit: 100, unit: 'QPD', color: 'bg-yellow-500' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, { badge: string; text: string }> = {
  INFO: { badge: 'bg-blue-900/40 border border-blue-700/50 text-blue-300', text: 'text-blue-300' },
  SUCCESS: { badge: 'bg-green-900/40 border border-green-700/50 text-green-300', text: 'text-green-300' },
  WARNING: { badge: 'bg-yellow-900/40 border border-yellow-700/50 text-yellow-300', text: 'text-yellow-300' },
  ERROR: { badge: 'bg-red-900/40 border border-red-700/50 text-red-300', text: 'text-red-300' },
}

function StatusCodeBadge({ code }: { code: number }) {
  const color = code < 300 ? 'text-green-400' : code < 400 ? 'text-blue-400' : code < 500 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`font-mono font-bold text-xs ${color}`}>{code}</span>
}

function ServiceStatusDot({ status }: { status: ServiceHealth['status'] }) {
  const map = {
    healthy: { dot: 'bg-green-400', label: '✅', text: 'text-green-400' },
    degraded: { dot: 'bg-yellow-400 animate-pulse', label: '⚠️', text: 'text-yellow-400' },
    down: { dot: 'bg-red-400 animate-pulse', label: '🔴', text: 'text-red-400' },
  }
  const s = map[status]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
      <span className={`text-xs font-medium capitalize ${s.text}`}>{status}</span>
    </span>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<'activity' | 'debugger' | 'api' | 'health'>('activity')

  // Activity log state
  const [logFilter, setLogFilter] = useState<LogFilter>('All')
  const [search, setSearch] = useState('')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [visibleCount, setVisibleCount] = useState(10)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Debugger state
  const [selectedAgent, setSelectedAgent] = useState(AGENT_NAMES[0])
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // System health state
  const [runningCheck, setRunningCheck] = useState(false)
  const [memUsage] = useState(62)
  const [cpuBars] = useState([12, 24, 18, 31, 42, 28, 35, 48, 22, 19, 38, 41])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      // In production: re-fetch logs
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const filterLog = (entry: ActivityLogEntry): boolean => {
    if (logFilter === 'Errors' && entry.level !== 'ERROR') return false
    if (logFilter === 'Warnings' && entry.level !== 'WARNING') return false
    if (logFilter === 'Agent Actions' && (entry.source === 'User' || entry.source === 'System')) return false
    if (logFilter === 'User Actions' && entry.source !== 'User') return false
    if (logFilter === 'API Calls' && !entry.details.statusCode) return false
    if (search && !entry.action.toLowerCase().includes(search.toLowerCase()) && !entry.source.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }

  const filteredLogs = ACTIVITY_LOGS.filter(filterLog)
  const shownLogs = filteredLogs.slice(0, visibleCount)

  const agentTasks = AGENT_TASKS.filter(t => t.agentName === selectedAgent)

  const statusCounts = { '2xx': 0, '4xx': 0, '5xx': 0 }
  API_CALLS.forEach(c => {
    if (c.statusCode < 300) statusCounts['2xx']++
    else if (c.statusCode < 500) statusCounts['4xx']++
    else statusCounts['5xx']++
  })
  const maxStatusCount = Math.max(...Object.values(statusCounts))

  const runHealthCheck = () => {
    setRunningCheck(true)
    setTimeout(() => setRunningCheck(false), 2400)
  }

  const TABS = [
    { id: 'activity', label: 'Activity Log', icon: '📋' },
    { id: 'debugger', label: 'Agent Debugger', icon: '🐛' },
    { id: 'api', label: 'API Monitor', icon: '🔌' },
    { id: 'health', label: 'System Health', icon: '💚' },
  ] as const

  return (
    <div className="p-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit &amp; Debug Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Full observability into every agent action and API call</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-700/50">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-red-300 text-xs font-medium">Live</span>
          </span>
          <button className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors flex items-center gap-2">
            <span>⬇</span> Export Logs
          </button>
          {!showClearConfirm ? (
            <button onClick={() => setShowClearConfirm(true)}
              className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-700 text-sm font-medium transition-colors flex items-center gap-2">
              <span>🗑</span> Clear Logs
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-xs">Confirm?</span>
              <button onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-xs font-medium hover:bg-red-900/70 transition-colors">
                Yes, clear
              </button>
              <button onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs font-medium transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: Activity Log ──────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div>
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            {/* Filter pills */}
            <div className="flex gap-1 flex-wrap">
              {(['All', 'Agent Actions', 'User Actions', 'API Calls', 'Errors', 'Warnings'] as LogFilter[]).map(f => (
                <button key={f} onClick={() => { setLogFilter(f); setVisibleCount(10) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${logFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-3 ml-auto items-center">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-xs focus:outline-none focus:border-indigo-500 w-48" />
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-indigo-600" />
                Auto-refresh (5s)
              </label>
            </div>
          </div>

          {/* Log entries */}
          <div className="space-y-2">
            {shownLogs.map(entry => (
              <div key={entry.id} className={`border rounded-xl overflow-hidden ${entry.level === 'ERROR' ? 'border-red-800/60' : entry.level === 'WARNING' ? 'border-yellow-800/60' : 'border-gray-800'}`}>
                <button onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors">
                  {/* Level badge */}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 mt-0.5 ${LEVEL_STYLES[entry.level].badge}`}>
                    {entry.level}
                  </span>
                  {/* Timestamp */}
                  <span className="text-gray-600 text-xs font-mono flex-shrink-0 mt-0.5 hidden sm:block">{fmtTs(entry.timestamp)}</span>
                  {/* Source */}
                  <span className="text-indigo-300 text-xs font-medium flex-shrink-0 mt-0.5 hidden md:block truncate max-w-32">{entry.source}</span>
                  {/* Action */}
                  <p className="text-gray-200 text-xs flex-1 text-left leading-relaxed">{entry.action}</p>
                  {/* Meta */}
                  <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-600">
                    {entry.details.duration && <span>{entry.details.duration}</span>}
                    {entry.details.cost && <span>{entry.details.cost}</span>}
                    {entry.details.statusCode && <StatusCodeBadge code={entry.details.statusCode} />}
                    <span>{expandedLog === entry.id ? '▴' : '▾'}</span>
                  </div>
                </button>

                {expandedLog === entry.id && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {entry.details.request && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1.5 font-medium uppercase tracking-wider">Request Payload</p>
                        <pre className="text-xs text-blue-300 bg-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.details.request), null, 2)}</pre>
                      </div>
                    )}
                    {entry.details.response && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1.5 font-medium uppercase tracking-wider">Response</p>
                        <pre className="text-xs text-green-300 bg-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.details.response), null, 2)}</pre>
                      </div>
                    )}
                    {entry.details.tokens && (
                      <div className="sm:col-span-2 flex gap-4">
                        <div className="bg-gray-800 rounded-lg px-4 py-2 flex gap-3 items-center">
                          <span className="text-gray-500 text-xs">Input tokens:</span>
                          <span className="text-white text-xs font-bold">{entry.details.tokens.input.toLocaleString()}</span>
                        </div>
                        <div className="bg-gray-800 rounded-lg px-4 py-2 flex gap-3 items-center">
                          <span className="text-gray-500 text-xs">Output tokens:</span>
                          <span className="text-white text-xs font-bold">{entry.details.tokens.output.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {!entry.details.request && !entry.details.response && !entry.details.tokens && (
                      <p className="text-gray-600 text-xs italic sm:col-span-2">No additional details available</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Load more */}
          {visibleCount < filteredLogs.length && (
            <div className="mt-4 text-center">
              <button onClick={() => setVisibleCount(v => v + 10)}
                className="px-6 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors">
                Load More ({filteredLogs.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Agent Debugger ────────────────────────────────────────── */}
      {activeTab === 'debugger' && (
        <div>
          {/* Agent selector */}
          <div className="mb-5">
            <label className="text-white text-sm font-medium block mb-2">Select Agent</label>
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              className="w-full max-w-xs bg-gray-900 border border-gray-800 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
              {AGENT_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Tasks for selected agent */}
          {agentTasks.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">No recent tasks for {selectedAgent}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agentTasks.map(task => (
                <div key={task.id} className={`border rounded-xl overflow-hidden ${task.status === 'failed' ? 'border-red-800/60' : 'border-gray-800'}`}>
                  <button onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors">
                    {/* Status */}
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${task.status === 'success' ? 'bg-green-400' : task.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
                    {/* Task info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-white text-xs font-medium">{task.type}</span>
                        <span className="text-gray-600 font-mono text-xs">{task.id}</span>
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">{task.input}</p>
                    </div>
                    {/* Meta */}
                    <div className="flex items-center gap-4 flex-shrink-0 text-xs">
                      <span className="text-gray-500">{task.duration}</span>
                      <span className="text-gray-500">${task.cost.toFixed(3)}</span>
                      <div className="text-right hidden sm:block">
                        <p className="text-gray-600">{task.tokens.input.toLocaleString()} in</p>
                        <p className="text-gray-600">{task.tokens.output.toLocaleString()} out</p>
                      </div>
                      <span className="text-gray-600">{expandedTask === task.id ? '▴' : '▾'}</span>
                    </div>
                  </button>

                  {expandedTask === task.id && (
                    <div className="px-4 pb-4 pt-3 border-t border-gray-800 space-y-4">
                      {/* I/O Inspector */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-gray-500 text-xs mb-2 font-medium uppercase tracking-wider">Input Prompt</p>
                          <div className="bg-gray-800 rounded-lg p-3 text-xs text-blue-200 leading-relaxed">{task.input}</div>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-2 font-medium uppercase tracking-wider">Output Response</p>
                          {task.status === 'failed' ? (
                            <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-3 text-xs text-red-300 leading-relaxed">
                              <p className="font-bold mb-1">Error Details</p>
                              <p>{task.error}</p>
                            </div>
                          ) : (
                            <div className="bg-gray-800 rounded-lg p-3 text-xs text-green-200 leading-relaxed">{task.output}</div>
                          )}
                        </div>
                      </div>
                      {/* Token breakdown */}
                      <div className="flex gap-3 flex-wrap">
                        <div className="bg-gray-800 rounded-lg px-4 py-2">
                          <p className="text-gray-500 text-xs">Timestamp</p>
                          <p className="text-white text-xs font-mono">{fmtTs(task.timestamp)}</p>
                        </div>
                        <div className="bg-gray-800 rounded-lg px-4 py-2">
                          <p className="text-gray-500 text-xs">Input Tokens</p>
                          <p className="text-white text-xs font-bold">{task.tokens.input.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-800 rounded-lg px-4 py-2">
                          <p className="text-gray-500 text-xs">Output Tokens</p>
                          <p className="text-white text-xs font-bold">{task.tokens.output.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-800 rounded-lg px-4 py-2">
                          <p className="text-gray-500 text-xs">Cost</p>
                          <p className="text-purple-400 text-xs font-bold">${task.cost.toFixed(4)}</p>
                        </div>
                        {task.status === 'failed' && (
                          <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors ml-auto">
                            Retry Task
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: API Monitor ──────────────────────────────────────────── */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          {/* Status code distribution */}
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(statusCounts).map(([code, count]) => (
              <div key={code} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-end justify-between mb-2">
                  <p className={`text-2xl font-bold ${code === '2xx' ? 'text-green-400' : code === '4xx' ? 'text-yellow-400' : 'text-red-400'}`}>{count}</p>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${code === '2xx' ? 'bg-green-900/40 text-green-300' : code === '4xx' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-red-900/40 text-red-300'}`}>{code}</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${code === '2xx' ? 'bg-green-500' : code === '4xx' ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${maxStatusCount > 0 ? (count / maxStatusCount) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-gray-500 text-xs mt-1.5">{code === '2xx' ? 'Success' : code === '4xx' ? 'Client Error' : 'Server Error'}</p>
              </div>
            ))}
          </div>

          {/* Rate limit status */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Rate Limit Status</h3>
            <div className="space-y-4">
              {PROVIDER_LIMITS.map(p => (
                <div key={p.provider}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-gray-300 text-sm">{p.provider}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${p.used > 85 ? 'text-red-400' : p.used > 70 ? 'text-yellow-400' : 'text-white'}`}>{p.used}%</span>
                      <span className="text-gray-600 text-xs">of daily {p.unit}</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${p.used > 85 ? 'bg-red-500' : p.used > 70 ? 'bg-yellow-500' : p.color}`}
                      style={{ width: `${p.used}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live request log */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">Live Request Log</h3>
              <button className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-xs border border-gray-700 transition-colors">
                Export HAR
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/40">
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Method</th>
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Endpoint</th>
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Duration</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Size</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {API_CALLS.map(call => (
                    <tr key={call.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          call.method === 'GET' ? 'bg-blue-900/40 text-blue-300' :
                          call.method === 'POST' ? 'bg-green-900/40 text-green-300' :
                          call.method === 'DELETE' ? 'bg-red-900/40 text-red-300' :
                          'bg-gray-800 text-gray-300'
                        }`}>{call.method}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-gray-300 text-xs font-mono truncate max-w-xs">{call.endpoint}</p>
                        <p className="text-gray-600 text-xs">{call.provider}</p>
                      </td>
                      <td className="px-4 py-2.5"><StatusCodeBadge code={call.statusCode} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs ${call.duration > 5000 ? 'text-red-400' : call.duration > 1000 ? 'text-yellow-400' : 'text-gray-300'}`}>
                          {call.duration >= 1000 ? `${(call.duration / 1000).toFixed(2)}s` : `${call.duration}ms`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{call.size}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 text-xs hidden md:table-cell">{new Date(call.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Slowest endpoints */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Slowest Endpoints (avg response time)</h3>
            <div className="space-y-2">
              {[
                { endpoint: 'api.anthropic.com/v1/messages', avg: '7.6s', calls: 42 },
                { endpoint: 'api.openai.com/v1/chat/completions', avg: '3.8s', calls: 28 },
                { endpoint: '/api/agents/research', avg: '31.2s', calls: 4 },
                { endpoint: 'api.resend.com/emails', avg: '1.2s', calls: 18 },
                { endpoint: 'analyticsdata.googleapis.com/v1beta/properties', avg: '0.9s', calls: 12 },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-800 last:border-0">
                  <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                  <span className="text-gray-300 text-xs font-mono flex-1 truncate">{e.endpoint}</span>
                  <span className="text-yellow-400 text-xs font-bold">{e.avg}</span>
                  <span className="text-gray-500 text-xs">{e.calls} calls</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: System Health ────────────────────────────────────────── */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {/* Uptime banner — neutral state until real monitoring is wired */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📡</span>
              <div>
                <p className="text-white font-semibold">Service Status</p>
                <p className="text-gray-400 text-sm mt-0.5">Run a health check to see real-time status of connected services.</p>
              </div>
            </div>
            <button onClick={runHealthCheck} disabled={runningCheck}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-sm font-medium transition-colors flex items-center gap-2">
              {runningCheck ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking...</>
              ) : 'Run Health Check'}
            </button>
          </div>

          {/* Service status table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">Service Status</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/40">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Service</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Latency</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Uptime</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE_HEALTH.map(svc => (
                  <tr key={svc.name} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-300 text-sm">{svc.name}</td>
                    <td className="px-4 py-3"><ServiceStatusDot status={svc.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-medium ${svc.latency > 500 ? 'text-yellow-400' : svc.latency > 1000 ? 'text-red-400' : 'text-white'}`}>
                        {svc.latency}ms
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-sm hidden sm:table-cell">{svc.uptime}</td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs hidden md:table-cell">{svc.lastChecked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resource usage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Memory */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Memory Usage</h3>
                <span className={`text-lg font-bold ${memUsage > 80 ? 'text-red-400' : memUsage > 60 ? 'text-yellow-400' : 'text-green-400'}`}>{memUsage}%</span>
              </div>
              <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all ${memUsage > 80 ? 'bg-red-500' : memUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${memUsage}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{Math.round(memUsage * 16 / 100 * 10) / 10} GB used</span>
                <span>16 GB total</span>
              </div>
            </div>

            {/* CPU / Request Load */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Request Load (last 1h)</h3>
                <span className="text-gray-400 text-xs">req/min</span>
              </div>
              <div className="flex items-end gap-1 h-12">
                {cpuBars.map((val, i) => (
                  <div key={i} className="flex-1 bg-indigo-600/60 rounded-sm"
                    style={{ height: `${(val / 50) * 100}%` }} />
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-2">Peak: 48 req/min · Current: 41 req/min</p>
            </div>
          </div>

          {/* Incident history */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">Incident History</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {INCIDENTS.map(inc => (
                <div key={inc.id} className="flex items-center gap-4 px-4 py-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.severity === 'high' ? 'bg-red-400' : inc.severity === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{inc.service}</span>
                      <span className={`text-xs px-2 py-0.5 rounded capitalize ${inc.severity === 'high' ? 'bg-red-900/40 text-red-300' : inc.severity === 'medium' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-blue-900/40 text-blue-300'}`}>
                        {inc.severity}
                      </span>
                      {inc.resolved && <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded">Resolved</span>}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5 truncate">{inc.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-gray-500 text-xs">{inc.date}</p>
                    <p className="text-gray-600 text-xs">{inc.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
