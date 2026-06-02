'use client'

import { useState, useEffect } from 'react'
import { readJsonArray } from '@/lib/hooks/fetch-array'

// ── Types ────────────────────────────────────────────────────────────────────

// Sprint 19Q (user-reported): made the status semantics honest.
// - 'ready'   = registered + enabled, not currently doing work. The common
//   resting state. Green dot but NO pulse — important so users don't read
//   it as "currently working" (the old 'active' label did that).
// - 'running' = an agent_run with status='running' exists right now. Pulsing
//   indigo. This is the only state where the agent is actually doing work.
// - 'paused'  = manually disabled.
// - 'error'   = recent failure (last completed run had status='failed').
type AgentStatus = 'ready' | 'running' | 'error' | 'paused'
type ViewMode = 'grid' | 'list' | 'hierarchy'
type ToneOption = 'Professional' | 'Casual' | 'Formal' | 'Friendly'
type PriorityOption = 'Low' | 'Normal' | 'High' | 'Critical'
type ScheduleOption = 'Always on' | 'Business hours' | 'Custom schedule'

interface AgentConfig {
  model: string
  instructions: string
  tone: ToneOption
  maxTasksPerDay: number
  priority: PriorityOption
  allowedTools: string[]
  apiKeyOverride: string
  schedule: ScheduleOption
  autoEscalateTo: string
  costCapPerDay: number
}

interface Agent {
  id: string
  name: string
  icon: string
  role: string
  category: 'supervisor' | 'worker'
  supervisorId?: string
  supervisorName?: string
  status: AgentStatus
  currentTask?: string
  tasksToday: number
  costToday: number
  avgResponseTime: string
  model: string
  config: AgentConfig
  logs: LogEntry[]
}

interface LogEntry {
  id: string
  timestamp: string
  taskType: string
  input: string
  output: string
  cost: number
  duration: string
  status: 'success' | 'failed'
}

interface ActivityItem {
  agentId: string
  agentName: string
  agentIcon: string
  message: string
  timeAgo: string
}

// ── Display Metadata ─────────────────────────────────────────────────────────
//
// Sprint 18D: the agent LIST now comes from /api/agents/registry — that's the
// authoritative set of agents seeded into the workspace. Display metadata
// (icon, role, category, supervisor relationship) isn't stored in the
// registry, so we keep a static lookup keyed by the registry's `name` field.
// To add a new agent: add it to lib/agents.ts (DEFAULT_AGENTS) AND here.

const DEFAULT_TOOLS = ['Web Search', 'Image Gen', 'Email Send', 'CRM Update', 'Social Post', 'File Read', 'Analytics Pull', 'Webhook']

interface AgentMeta {
  icon: string
  role: string
  category: 'supervisor' | 'worker'
  supervisorId?: string
  supervisorName?: string
}

// Note: keys must match the `name` column in the agents table (seeded by
// lib/agents.ts → DEFAULT_AGENTS). Anything in the registry not in this
// map gets generic fallback metadata so a newly-registered agent still
// renders rather than disappearing.
const AGENT_META: Record<string, AgentMeta> = {
  // Supervisors
  cmo:                { icon: '🧠', role: 'Strategy & Orchestration', category: 'supervisor' },
  'content-sup':      { icon: '📅', role: 'Content & Creative',       category: 'supervisor' },
  'growth-sup':       { icon: '🎯', role: 'Leads & Revenue',          category: 'supervisor' },
  'engagement-sup':   { icon: '💬', role: 'Inbox & Social',           category: 'supervisor' },
  'intelligence-sup': { icon: '🔭', role: 'Research & Analytics',     category: 'supervisor' },
  'brand-sup':        { icon: '🎨', role: 'Brand & Reputation',       category: 'supervisor' },
  // Workers
  'blog-writer':      { icon: '✍️', role: 'Long-form Content',     category: 'worker', supervisorId: 'content-sup',      supervisorName: 'Content Supervisor' },
  'social-agent':     { icon: '📱', role: 'Social Posting',        category: 'worker', supervisorId: 'content-sup',      supervisorName: 'Content Supervisor' },
  'email-copy':       { icon: '📧', role: 'Email Sequences',       category: 'worker', supervisorId: 'content-sup',      supervisorName: 'Content Supervisor' },
  'ad-copy':          { icon: '📢', role: 'Paid Advertising Copy', category: 'worker', supervisorId: 'content-sup',      supervisorName: 'Content Supervisor' },
  'seo-agent':        { icon: '🔍', role: 'SEO Optimization',      category: 'worker', supervisorId: 'content-sup',      supervisorName: 'Content Supervisor' },
  'lead-scorer':      { icon: '⚡', role: 'Lead Qualification',    category: 'worker', supervisorId: 'growth-sup',       supervisorName: 'Growth Supervisor'  },
  'outreach-agent':   { icon: '📬', role: 'Sales Outreach',        category: 'worker', supervisorId: 'growth-sup',       supervisorName: 'Growth Supervisor'  },
  'crm-agent':        { icon: '🗄️', role: 'CRM Management',       category: 'worker', supervisorId: 'growth-sup',       supervisorName: 'Growth Supervisor'  },
  'brand-monitor':    { icon: '👁️', role: 'Brand Monitoring',     category: 'worker', supervisorId: 'brand-sup',        supervisorName: 'Brand Supervisor'   },
  reputation:         { icon: '⭐', role: 'Review Management',     category: 'worker', supervisorId: 'brand-sup',        supervisorName: 'Brand Supervisor'   },
  analytics:          { icon: '📊', role: 'Performance Analytics', category: 'worker', supervisorId: 'intelligence-sup', supervisorName: 'Intelligence Supervisor' },
  'growth-optimizer': { icon: '📈', role: 'Growth Experiments',    category: 'worker', supervisorId: 'growth-sup',       supervisorName: 'Growth Supervisor'  },
}

// Pretty-print a registry slug like "growth-sup" → "Growth Sup Agent" as a
// fallback display name when AGENT_META has no entry. Capitalizes each
// hyphen-separated token.
function titleCaseFromSlug(slug: string): string {
  return slug.split(/[-_]/g).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ') + ' Agent'
}

function buildAgentFromRegistry(row: RegistryRow): Agent {
  const meta = AGENT_META[row.name] || {
    icon: '🤖',
    role: 'Custom Agent',
    category: 'worker' as const,
  }
  // Sprint 19Q: map registry status to honest UI status. Registry 'active'
  // means "enabled" not "currently working" — default to 'ready'. The
  // runs-hydration effect promotes to 'running' iff a currently-running
  // run exists for this agent.
  const status: AgentStatus =
    row.status === 'paused'   ? 'paused' :
    row.status === 'error'    ? 'error'  :
    row.status === 'disabled' ? 'paused' :
    'ready'
  return {
    id: row.name,
    name: AGENT_META[row.name] ? friendlyName(row.name) : titleCaseFromSlug(row.name),
    icon: meta.icon,
    role: meta.role,
    category: meta.category,
    supervisorId: meta.supervisorId,
    supervisorName: meta.supervisorName,
    status,
    currentTask: undefined,
    tasksToday: 0,
    costToday: 0,
    avgResponseTime: '—',
    model: 'Claude 3.5 Sonnet',
    config: makeConfig(),
    logs: [],
  }
}

// Friendly name lookup for slugs we know about. Keep in sync with AGENT_META.
const AGENT_DISPLAY_NAME: Record<string, string> = {
  cmo:                'CMO Agent',
  'content-sup':      'Content Supervisor',
  'growth-sup':       'Growth Supervisor',
  'engagement-sup':   'Engagement Supervisor',
  'intelligence-sup': 'Intelligence Supervisor',
  'brand-sup':        'Brand Supervisor',
  'blog-writer':      'Blog Writer Agent',
  'social-agent':     'Social Media Agent',
  'email-copy':       'Email Copywriter Agent',
  'ad-copy':          'Ad Copy Agent',
  'seo-agent':        'SEO Agent',
  'lead-scorer':      'Lead Scorer Agent',
  'outreach-agent':   'Outreach Agent',
  'crm-agent':        'CRM Agent',
  'brand-monitor':    'Brand Monitor Agent',
  reputation:         'Reputation Agent',
  analytics:          'Analytics Agent',
  'growth-optimizer': 'Growth Optimizer Agent',
}
function friendlyName(slug: string): string {
  return AGENT_DISPLAY_NAME[slug] || titleCaseFromSlug(slug)
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: 'Claude 3.5 Sonnet',
    instructions: 'Follow brand guidelines strictly. Prioritize quality over speed. Always check for factual accuracy before publishing.',
    tone: 'Professional',
    maxTasksPerDay: 50,
    priority: 'Normal',
    allowedTools: ['Web Search', 'Email Send', 'Social Post'],
    apiKeyOverride: '',
    schedule: 'Always on',
    autoEscalateTo: 'None',
    costCapPerDay: 5,
    ...overrides,
  }
}

// makeLogs (mock log generator) and the AGENTS mock array were removed in
// Sprint 18D. Logs come from the agent_runs table via /api/agent-runs,
// surfaced through the LogModal which reads agent.logs (currently empty
// until per-agent runs hydration is wired in a follow-up).
// Sprint 18D moved the agents-list source of truth to
// /api/agents/registry — see useEffect → registry hydration in AgentsPage.

// Sprint 18D follow-up: ACTIVITY_FEED is now built from /api/agent-runs at
// runtime — see the activity-feed useEffect below. The hardcoded sample was
// removed during audit pass #7.

// Format a Date or ISO string as a compact "Xm ago" / "Xh ago" / "Xd ago".
function timeAgo(d: string | Date): string {
  const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime()
  const diff = Math.max(0, Date.now() - t)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dy = Math.floor(h / 24)
  return `${dy}d ago`
}

// Format a duration in milliseconds as "X.Ys" or "X.Xm".
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = s / 60
  return `${m.toFixed(1)}m`
}

// Best-effort short summary for a run: prefer error_message on failure,
// otherwise a tiny slice of output_json or input_json. Falls back to the
// status verb so the row is never blank.
function summarizeRun(r: {
  status: string
  input_json?: string
  output_json?: string
  error_message?: string
}): string {
  if (r.status === 'failed' && r.error_message) return r.error_message.slice(0, 140)
  const pickFrom = (raw: string | undefined): string | null => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string') return parsed
      if (parsed && typeof parsed === 'object') {
        const candidates = ['summary', 'message', 'title', 'task', 'prompt', 'result', 'text']
        for (const k of candidates) {
          const v = (parsed as Record<string, unknown>)[k]
          if (typeof v === 'string' && v.trim()) return v.trim()
        }
        return JSON.stringify(parsed).slice(0, 140)
      }
    } catch {
      return raw.slice(0, 140)
    }
    return null
  }
  return (
    pickFrom(r.output_json) ||
    pickFrom(r.input_json) ||
    (r.status === 'running' ? 'Run in progress' :
     r.status === 'completed' ? 'Run completed' :
     r.status === 'pending' ? 'Run queued' :
     r.status === 'failed' ? 'Run failed' : 'Activity')
  )
}

const AVAILABLE_MODELS = [
  'Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus',
  'GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo',
  'Gemini 1.5 Pro', 'Gemini 1.5 Flash',
  'Llama 3.1 70B', 'Mistral Large',
]

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    ready: { dot: 'bg-green-400', text: 'text-green-400', label: 'Ready' },
    running: { dot: 'bg-indigo-400 animate-pulse', text: 'text-indigo-400', label: 'Running' },
    error: { dot: 'bg-red-400 animate-pulse', text: 'text-red-400', label: 'Error' },
    paused: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Paused' },
  }
  const s = map[status]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
    </span>
  )
}

function AgentCard({
  agent,
  onConfigure,
  onViewLogs,
  onTogglePause,
}: {
  agent: Agent
  onConfigure: (a: Agent) => void
  onViewLogs: (a: Agent) => void
  // Accept either sync or async handlers — Sprint 2 Commit 3 wired this
  // to a real API call that returns Promise<void>.
  onTogglePause: (id: string) => void | Promise<void>
}) {
  const isSupervisor = agent.category === 'supervisor'
  return (
    <div className={`bg-gray-900 rounded-xl p-4 border flex flex-col gap-3 ${isSupervisor ? 'border-indigo-700/60' : 'border-gray-800'}`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${isSupervisor ? 'bg-indigo-900/50' : 'bg-gray-800'}`}>
          {agent.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{agent.name}</span>
            {isSupervisor && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-indigo-900/60 border border-indigo-700/50 text-indigo-300">Supervisor</span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{agent.role}</p>
          {agent.supervisorName && (
            <p className="text-gray-600 text-xs mt-0.5">Under: {agent.supervisorName}</p>
          )}
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Current task */}
      {agent.currentTask && (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          <p className="text-indigo-300 text-xs truncate">{agent.currentTask}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div className="bg-gray-800/60 rounded-lg px-2.5 py-2 text-center">
          <p className="text-white font-bold text-sm">{agent.tasksToday}</p>
          <p className="text-gray-500 text-xs">tasks today</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-2.5 py-2 text-center">
          <p className="text-white font-bold text-sm">${agent.costToday.toFixed(2)}</p>
          <p className="text-gray-500 text-xs">cost today</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-2.5 py-2 text-center">
          <p className="text-white font-bold text-sm">{agent.avgResponseTime}</p>
          <p className="text-gray-500 text-xs">avg resp</p>
        </div>
      </div>

      {/* Model badge */}
      <div className="flex items-center justify-between">
        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">{agent.model}</span>
        <button
          onClick={() => onTogglePause(agent.id)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            agent.status === 'paused'
              ? 'bg-green-900/40 border border-green-700/50 text-green-400 hover:bg-green-900/70'
              : 'bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/70'
          }`}>
          {agent.status === 'paused' ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-800">
        <button onClick={() => onConfigure(agent)}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          Configure
        </button>
        <button onClick={() => onViewLogs(agent)}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700">
          View Logs
        </button>
      </div>
    </div>
  )
}

function AgentListRow({
  agent,
  onConfigure,
  onViewLogs,
  onTogglePause,
}: {
  agent: Agent
  onConfigure: (a: Agent) => void
  onViewLogs: (a: Agent) => void
  // Accept either sync or async handlers — Sprint 2 Commit 3 wired this
  // to a real API call that returns Promise<void>.
  onTogglePause: (id: string) => void | Promise<void>
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${agent.category === 'supervisor' ? 'bg-indigo-950/10' : ''}`}>
      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-base flex-shrink-0">{agent.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{agent.name}</span>
          {agent.category === 'supervisor' && <span className="text-xs text-indigo-400 border border-indigo-700/50 px-1.5 py-0.5 rounded">SUP</span>}
        </div>
        <p className="text-gray-500 text-xs truncate">{agent.supervisorName ? `Under: ${agent.supervisorName}` : agent.role}</p>
      </div>
      <StatusBadge status={agent.status} />
      <div className="text-right hidden sm:block w-20">
        <p className="text-white text-sm font-medium">{agent.tasksToday}</p>
        <p className="text-gray-500 text-xs">tasks</p>
      </div>
      <div className="text-right hidden md:block w-16">
        <p className="text-white text-sm font-medium">${agent.costToday.toFixed(2)}</p>
        <p className="text-gray-500 text-xs">cost</p>
      </div>
      <span className="hidden lg:block px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">{agent.model}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => onConfigure(agent)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">Configure</button>
        <button onClick={() => onViewLogs(agent)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700">Logs</button>
        <button onClick={() => onTogglePause(agent.id)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${agent.status === 'paused' ? 'text-green-400' : 'text-yellow-400'}`}>
          {agent.status === 'paused' ? '▶' : '⏸'}
        </button>
      </div>
    </div>
  )
}

// Config Slide-over
function ConfigSlideover({ agent, onClose, onSave }: { agent: Agent; onClose: () => void; onSave: (id: string, cfg: AgentConfig) => void | Promise<void> }) {
  const [cfg, setCfg] = useState<AgentConfig>({ ...agent.config })

  const toggleTool = (tool: string) => {
    setCfg(prev => ({
      ...prev,
      allowedTools: prev.allowedTools.includes(tool)
        ? prev.allowedTools.filter(t => t !== tool)
        : [...prev.allowedTools, tool],
    }))
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-lg bg-gray-900 border-l border-gray-800 h-full overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <div>
            <h2 className="text-white font-semibold text-lg">{agent.icon} {agent.name}</h2>
            <p className="text-gray-400 text-xs mt-0.5">{agent.role}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-lg">✕</button>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Status toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Agent Status</p>
              <p className="text-gray-500 text-xs mt-0.5">Enable or disable this agent</p>
            </div>
            <StatusBadge status={agent.status} />
          </div>

          {/* Model selector */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">AI Model</label>
            <select value={cfg.model} onChange={e => setCfg(p => ({ ...p, model: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
              {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Custom Instructions</label>
            <textarea value={cfg.instructions} onChange={e => setCfg(p => ({ ...p, instructions: e.target.value }))}
              rows={4} placeholder="Your custom instructions for this agent..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-gray-600" />
          </div>

          {/* Tone */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Tone</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(['Professional', 'Casual', 'Formal', 'Friendly'] as ToneOption[]).map(t => (
                <button key={t} onClick={() => setCfg(p => ({ ...p, tone: t }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${cfg.tone === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Max tasks + Cost cap */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-white text-sm font-medium block mb-2">Max Tasks/Day</label>
              <input type="number" value={cfg.maxTasksPerDay} onChange={e => setCfg(p => ({ ...p, maxTasksPerDay: +e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-white text-sm font-medium block mb-2">Cost Cap/Day ($)</label>
              <input type="number" step="0.50" value={cfg.costCapPerDay} onChange={e => setCfg(p => ({ ...p, costCapPerDay: +e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Priority</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(['Low', 'Normal', 'High', 'Critical'] as PriorityOption[]).map(p => (
                <button key={p} onClick={() => setCfg(prev => ({ ...prev, priority: p }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${cfg.priority === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Allowed tools */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Allowed Tools</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEFAULT_TOOLS.map(tool => (
                <label key={tool} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={cfg.allowedTools.includes(tool)} onChange={() => toggleTool(tool)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0" />
                  <span className="text-gray-300 text-xs">{tool}</span>
                </label>
              ))}
            </div>
          </div>

          {/* API Key override */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">API Key Override</label>
            <input type="password" value={cfg.apiKeyOverride} onChange={e => setCfg(p => ({ ...p, apiKeyOverride: e.target.value }))}
              placeholder="Leave blank to use workspace default"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
          </div>

          {/* Schedule */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Schedule</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(['Always on', 'Business hours', 'Custom schedule'] as ScheduleOption[]).map(s => (
                <button key={s} onClick={() => setCfg(p => ({ ...p, schedule: s }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${cfg.schedule === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-escalate */}
          <div>
            <label className="text-white text-sm font-medium block mb-2">Auto-Escalate To</label>
            <select value={cfg.autoEscalateTo} onChange={e => setCfg(p => ({ ...p, autoEscalateTo: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
              <option value="None">None</option>
              <option value="Human">Human</option>
              <option value="CMO Agent">CMO Agent</option>
              <option value="Content Supervisor">Content Supervisor</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex gap-3 sticky bottom-0 bg-gray-900">
          <button onClick={() => { onSave(agent.id, cfg); onClose() }}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Save Configuration
          </button>
          <button onClick={() => { setCfg(makeConfig()); }}
            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors border border-gray-700">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

// Log Modal
function LogModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [filter, setFilter] = useState<'1h' | '24h' | '7d'>('24h')
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">{agent.icon} {agent.name} — Activity Log</h2>
            <p className="text-gray-400 text-xs mt-0.5">{agent.logs.length} recent tasks</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
              {(['1h', '24h', '7d'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-xs border border-gray-700 transition-colors">
              Export Logs
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">✕</button>
          </div>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {agent.logs.map(log => (
            <div key={log.id} className={`border rounded-xl overflow-hidden ${log.status === 'failed' ? 'border-red-800' : 'border-gray-800'}`}>
              <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium">{log.taskType}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{log.input}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                  <span className="text-gray-500">{log.duration}</span>
                  <span className="text-gray-500">${log.cost.toFixed(3)}</span>
                  <span className="text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-gray-600">{expanded === log.id ? '▴' : '▾'}</span>
                </div>
              </button>
              {expanded === log.id && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-xs mb-1.5 font-medium uppercase tracking-wider">Input</p>
                    <p className="text-gray-300 text-xs bg-gray-800 rounded-lg px-3 py-2">{log.input}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1.5 font-medium uppercase tracking-wider">Output</p>
                    <p className={`text-xs bg-gray-800 rounded-lg px-3 py-2 ${log.status === 'failed' ? 'text-red-400' : 'text-green-300'}`}>{log.output}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Hierarchy View
function HierarchyView({ agents, onConfigure }: { agents: Agent[]; onConfigure: (a: Agent) => void }) {
  const supervisors = agents.filter(a => a.category === 'supervisor')
  const workers = agents.filter(a => a.category === 'worker')

  return (
    <div className="overflow-x-auto pb-4">
      {/* CMO at top */}
      <div className="flex flex-col items-center gap-0">
        {supervisors.filter(s => s.id === 'cmo').map(cmo => (
          <div key={cmo.id} className="flex flex-col items-center">
            <button onClick={() => onConfigure(cmo)}
              className="bg-indigo-900/40 border-2 border-indigo-600 rounded-xl px-6 py-4 flex items-center gap-3 hover:bg-indigo-900/60 transition-colors group">
              <span className="text-2xl">{cmo.icon}</span>
              <div className="text-left">
                <p className="text-white font-bold text-sm">{cmo.name}</p>
                <p className="text-indigo-300 text-xs">{cmo.role}</p>
                <StatusBadge status={cmo.status} />
              </div>
            </button>
            {/* Vertical line */}
            <div className="w-px h-8 bg-indigo-700/40" />
          </div>
        ))}

        {/* Horizontal line across supervisors */}
        <div className="relative w-full flex justify-center">
          <div className="absolute top-0 left-8 right-8 h-px bg-gray-700" />
        </div>

        {/* Supervisors row */}
        <div className="flex gap-6 relative pt-0 flex-wrap justify-center">
          {supervisors.filter(s => s.id !== 'cmo').map(sup => {
            const supWorkers = workers.filter(w => w.supervisorId === sup.id)
            return (
              <div key={sup.id} className="flex flex-col items-center gap-0">
                {/* Vertical line from top */}
                <div className="w-px h-8 bg-gray-700" />
                <button onClick={() => onConfigure(sup)}
                  className="bg-gray-900 border border-indigo-700/50 rounded-xl px-4 py-3 flex items-center gap-2 hover:border-indigo-500 transition-colors min-w-36">
                  <span className="text-xl">{sup.icon}</span>
                  <div className="text-left">
                    <p className="text-white font-semibold text-xs">{sup.name}</p>
                    <StatusBadge status={sup.status} />
                  </div>
                </button>
                {/* Workers */}
                {supWorkers.length > 0 && (
                  <>
                    <div className="w-px h-6 bg-gray-700" />
                    <div className="flex gap-3 relative flex-wrap justify-center">
                      {supWorkers.map((w, i) => (
                        <div key={w.id} className="flex flex-col items-center gap-0">
                          {i === 0 && supWorkers.length > 1 && <div className="w-full h-px bg-gray-800 absolute top-0" />}
                          <div className="w-px h-4 bg-gray-800" />
                          <button onClick={() => onConfigure(w)}
                            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-1.5 hover:border-gray-600 transition-colors text-left">
                            <span className="text-sm">{w.icon}</span>
                            <div>
                              <p className="text-white text-xs font-medium whitespace-nowrap">{w.name}</p>
                              <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${w.status === 'running' ? 'bg-indigo-400 animate-pulse' : w.status === 'ready' ? 'bg-green-400' : w.status === 'error' ? 'bg-red-400' : 'bg-gray-500'}`} />
                              <span className="text-gray-500 text-xs">{w.tasksToday}t</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

// ── API ↔ UI value mappers (Sprint 2 Commit 3) ──────────────────────────────
//
// The UI uses title-cased enums (Tone='Professional', Priority='Normal',
// Schedule='Always on'); the backend validates lowercase tokens
// ('professional', 'normal', 'always'). These helpers normalize both
// directions so the user keeps the friendly labels and the API contract
// stays strict.

function uiToApiPriority(p: PriorityOption): 'low' | 'normal' | 'high' | 'critical' {
  return p.toLowerCase() as 'low' | 'normal' | 'high' | 'critical'
}

function apiToUiPriority(p: string | null | undefined): PriorityOption {
  if (!p) return 'Normal'
  const cap = p[0].toUpperCase() + p.slice(1).toLowerCase()
  if (cap === 'Low' || cap === 'High' || cap === 'Critical' || cap === 'Normal') return cap as PriorityOption
  return 'Normal'
}

function uiToApiSchedule(s: ScheduleOption): string {
  if (s === 'Always on') return 'always'
  if (s === 'Business hours') return 'business_hours'
  return 'custom'
}

function apiToUiSchedule(s: string | null | undefined): ScheduleOption {
  if (s === 'business_hours') return 'Business hours'
  if (s === 'custom') return 'Custom schedule'
  return 'Always on'
}

// Lifecycle status received from the agents registry. Maps to AgentStatus,
// preserving 'idle' as the UI-only "available but no recent run" state —
// when the registry says 'active' we keep whatever the runs-hydration set
// (idle or active) so we don't accidentally lie about activity.
type ApiAgentStatus = 'active' | 'paused' | 'error' | 'disabled'

interface RegistryRow {
  id: string
  workspace_id: string
  name: string
  status: ApiAgentStatus
  paused_at: string | null
  paused_by: string | null
}

export default function AgentsPage() {
  // Sprint 18D: agents are now loaded from /api/agents/registry on mount
  // (was a hardcoded mock). `loading` is true on the very first registry
  // fetch only; subsequent re-fetches (after PATCH) don't toggle it because
  // we already have data to show.
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('grid')
  const [configAgent, setConfigAgent] = useState<Agent | null>(null)
  const [logAgent, setLogAgent] = useState<Agent | null>(null)
  const [allPaused, setAllPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'supervisor' | 'worker'>('all')
  // ⚠ Sprint 2 Commit 3: in-flight indicator so double-clicks on
  // Pause/Resume/Save can't fire two PATCHes for the same agent.
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)
  // Top-line success/error toast for operator feedback after a write.
  const [statusMsg, setStatusMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  // Live activity feed (sidebar). Sprint 18D audit pass #7: was a hardcoded
  // sample array — now fetched from /api/agent-runs.
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)

  // Hydrate the static agent catalog with real run data from /api/agent-runs.
  // The static AGENTS list is the registry of available agents; we layer
  // live "tasksToday", "costToday", "status", and "currentTask" on top.
  useEffect(() => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) return
    let cancelled = false

    const hydrate = async () => {
      try {
        const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=200`)
        if (!res.ok) return
        const raw = await res.json()
        // Sprint 19R: the endpoint normally returns an array, but error shapes
        // ({ error: ... }) and paginated shapes ({ rows, nextCursor }) can leak
        // through. Iterating a non-array crashed the page with
        // "e.slice is not a function" / "runs is not iterable" in prod.
        type RunRow = {
          id: string
          agent_name: string
          status: string
          cost_estimate?: number
          input_json?: string
          output_json?: string
          error_message?: string
          created_at: string
          completed_at?: string
        }
        const runs: RunRow[] =
          Array.isArray(raw) ? raw as RunRow[] :
          Array.isArray(raw?.rows) ? raw.rows as RunRow[] :
          []
        if (cancelled) return
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        interface Agg {
          tasks: number
          cost: number
          running: number
          latest: string | null
          // All runs for this agent, newest first (input is already newest-first
          // from the API ORDER BY created_at DESC).
          allRuns: RunRow[]
        }
        const aggregates = new Map<string, Agg>()
        for (const r of runs) {
          // Match runs to agents by name/slug (case-insensitive, partial)
          const key = (r.agent_name || '').toLowerCase()
          if (!key) continue
          const existing: Agg = aggregates.get(key) || { tasks: 0, cost: 0, running: 0, latest: null, allRuns: [] }
          if (new Date(r.created_at) >= todayStart) {
            existing.tasks += 1
            existing.cost += Number(r.cost_estimate || 0)
          }
          if (r.status === 'running') existing.running += 1
          if (!existing.latest || new Date(r.created_at) > new Date(existing.latest)) {
            existing.latest = r.created_at
          }
          existing.allRuns.push(r)
          aggregates.set(key, existing)
        }

        // Merge into static catalog
        setAgents(prev => prev.map(a => {
          // Try several matching strategies against the run agent_name
          const candidates = [a.id, a.name.toLowerCase().replace(/\s+/g, '_'), a.role.toLowerCase()]
          let agg: Agg | undefined
          for (const c of candidates) {
            if (aggregates.has(c)) { agg = aggregates.get(c); break }
            // Try fuzzy: any aggregate key contains the candidate
            for (const [k, v] of aggregates) {
              if (k.includes(c) || c.includes(k)) { agg = v; break }
            }
            if (agg) break
          }
          if (!agg) return a
          // Sprint 19Q: preserve registry-authoritative paused/error;
          // promote to 'running' iff a currently-running run exists;
          // otherwise stay 'ready'.
          const newStatus: AgentStatus =
            a.status === 'paused' || a.status === 'error' ? a.status :
            agg.running > 0 ? 'running' :
            'ready'

          // avgResponseTime — average (completed_at − created_at) across the
          // last 20 completed runs. If none have completed, fall back to '—'.
          const completed = agg.allRuns
            .filter(r => r.status === 'completed' && r.completed_at)
            .slice(0, 20)
          let avgResp = '—'
          if (completed.length > 0) {
            const totalMs = completed.reduce((sum, r) => {
              const start = new Date(r.created_at).getTime()
              const end = new Date(r.completed_at as string).getTime()
              return sum + Math.max(0, end - start)
            }, 0)
            avgResp = formatDuration(totalMs / completed.length)
          }

          // logs — last 20 runs mapped to the LogEntry shape used by LogModal.
          const logs: LogEntry[] = agg.allRuns.slice(0, 20).map(r => {
            const start = new Date(r.created_at).getTime()
            const end = r.completed_at ? new Date(r.completed_at).getTime() : null
            const summary = summarizeRun(r)
            return {
              id: r.id,
              timestamp: r.created_at,
              taskType: r.status === 'failed' ? 'Failed run' :
                        r.status === 'running' ? 'Running' :
                        r.status === 'pending' ? 'Pending' :
                        'Completed run',
              input: summary,
              output: r.status === 'failed' && r.error_message
                ? r.error_message
                : (summary === 'Run completed' ? 'OK' : summary),
              cost: Number(r.cost_estimate || 0),
              duration: end ? formatDuration(end - start) : '—',
              status: r.status === 'failed' ? 'failed' : 'success',
            }
          })

          return {
            ...a,
            tasksToday: agg.tasks,
            costToday: parseFloat(agg.cost.toFixed(3)),
            avgResponseTime: avgResp,
            status: newStatus,
            logs,
          }
        }))
      } catch (err) {
        console.error('[agents] hydrate failed', err)
      }
    }

    hydrate()
    const interval = setInterval(hydrate, 15000) // refresh every 15s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // ── Live activity feed (Sprint 18D audit pass #7) ───────────────────────
  // Fetch the last 20 agent_runs and shape into ActivityItem rows for the
  // sidebar. Refreshes every 15s alongside the per-agent stats hydration.
  useEffect(() => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) { setActivityLoaded(true); return }
    let cancelled = false

    const loadActivity = async () => {
      try {
        const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=20`)
        if (!res.ok) {
          if (!cancelled) setActivityLoaded(true)
          return
        }
        const runs = await res.json() as Array<{
          id: string
          agent_name: string
          status: string
          input_json?: string
          output_json?: string
          error_message?: string
          created_at: string
          completed_at?: string
        }>
        if (cancelled || !Array.isArray(runs)) return
        const items: ActivityItem[] = runs.map(r => {
          const slug = (r.agent_name || '').toLowerCase()
          const meta = AGENT_META[slug]
          const icon = meta?.icon || (r.status === 'failed' ? '⚠️' : r.status === 'running' ? '⚙️' : '🤖')
          const displayName = AGENT_DISPLAY_NAME[slug] || titleCaseFromSlug(slug || 'agent')
          const verb = r.status === 'running' ? 'Working —' :
                       r.status === 'completed' ? 'Completed —' :
                       r.status === 'failed' ? 'Failed —' :
                       r.status === 'pending' ? 'Queued —' : ''
          const summary = summarizeRun(r)
          const message = verb ? `${verb} ${summary}` : summary
          return {
            agentId: slug,
            agentName: displayName,
            agentIcon: icon,
            message,
            timeAgo: timeAgo(r.created_at),
          }
        })
        setActivity(items)
        setActivityLoaded(true)
      } catch (err) {
        console.error('[agents] activity load failed', err)
        if (!cancelled) setActivityLoaded(true)
      }
    }

    loadActivity()
    const interval = setInterval(loadActivity, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // ── Lifecycle registry hydration (Sprint 2 Commit 3, rewired Sprint 18D) ─
  //
  // Sprint 18D: the registry is now the SOURCE of the agents list, not just
  // a paused-status overlay. On mount we build the entire `agents` array
  // from registry rows (joined with the static AGENT_META display lookup).
  // On subsequent re-fetches (triggered by refetchRegistry after PATCHes)
  // we keep existing per-row stats and only reconcile status + add/remove
  // rows that appeared/disappeared from the registry.
  useEffect(() => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) {
      setLoading(false)
      setLoadError('No workspace selected. Visit /dashboard to pick one.')
      return
    }
    let cancelled = false

    const hydrateRegistry = async () => {
      try {
        const res = await fetch(`/api/agents/registry?workspaceId=${wid}`)
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(`Failed to load agents: ${res.status}`)
            setLoading(false)
          }
          return
        }
        // Sprint 19T: array-safe — registry endpoint can return {error} or
        // {rows} shapes on auth/migration drift.
        const rows = await readJsonArray<RegistryRow>(res)
        if (cancelled) return
        // First load: build the catalog from scratch using the registry as
        // the truth. We do this only when `agents` is still empty so
        // subsequent re-fetches don't blow away locally-hydrated stats.
        setAgents(prev => {
          if (prev.length === 0) {
            return rows.map(buildAgentFromRegistry)
          }
          // Re-fetch path: merge new statuses onto existing rows + drop
          // rows that are no longer in the registry + add any new ones.
          const byName = new Map(rows.map(r => [r.name, r]))
          const seen = new Set<string>()
          const next: Agent[] = []
          for (const a of prev) {
            const reg = byName.get(a.id)
            if (!reg) continue   // removed from registry
            seen.add(a.id)
            let status = a.status
            if (reg.status === 'paused') status = 'paused'
            else if (reg.status === 'error') status = 'error'
            else if (a.status === 'paused') status = 'ready' // resumed
            next.push({ ...a, status })
          }
          // Any new rows in the registry that the page hasn't seen yet
          for (const row of rows) {
            if (!seen.has(row.name)) next.push(buildAgentFromRegistry(row))
          }
          return next
        })
        setLoadError(null)
        setLoading(false)
      } catch (err) {
        console.error('[agents] registry hydrate failed', err)
        if (!cancelled) {
          setLoadError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
          setLoading(false)
        }
      }
    }

    hydrateRegistry()
    // Don't re-poll the registry — it only changes via this page's own
    // PATCHes, which already trigger a fresh fetch via refetchRegistry().
    return () => { cancelled = true }
  }, [])

  // Re-fetch the registry — called after every successful status PATCH so
  // the UI sees the canonical row (with server-set paused_at / paused_by).
  // Sprint 18D: this no longer needs to handle add/remove; the mount effect
  // already does. After a PATCH only statuses can change, so this stays
  // simple — only reconciles `status` on rows we already know about.
  const refetchRegistry = async (): Promise<void> => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) return
    try {
      const res = await fetch(`/api/agents/registry?workspaceId=${wid}`)
      if (!res.ok) return
      // Sprint 19T: array-safe
      const rows = await readJsonArray<RegistryRow>(res)
      const byName = new Map(rows.map(r => [r.name, r]))
      setAgents(prev => prev.map(a => {
        const reg = byName.get(a.id)
        if (!reg) return a
        if (reg.status === 'paused') return { ...a, status: 'paused' }
        if (reg.status === 'error') return { ...a, status: 'error' }
        // Resume → reflect ready immediately. The runs-hydration effect
        // will promote to 'running' if a run is actually in flight.
        if (a.status === 'paused' && reg.status === 'active') {
          return { ...a, status: 'ready' }
        }
        return a
      }))
    } catch { /* non-fatal */ }
  }

  /**
   * Pause/Resume a single agent. PATCHes /api/agents/[name]/status, then
   * re-reads the registry to confirm the server-side state. Optimistic
   * UI update is intentionally NOT used — a failed PATCH leaving the UI
   * lying about the real state is worse than a brief loading flash.
   */
  const togglePause = async (id: string) => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) {
      setStatusMsg({ kind: 'error', text: 'No workspace selected.' })
      return
    }
    if (busyAgentId) return
    const current = agents.find(a => a.id === id)
    if (!current) return
    const targetStatus: ApiAgentStatus = current.status === 'paused' ? 'active' : 'paused'

    setBusyAgentId(id)
    setStatusMsg(null)
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wid, status: targetStatus }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        setStatusMsg({ kind: 'error', text: `Failed to ${targetStatus === 'paused' ? 'pause' : 'resume'} ${current.name}: ${txt.slice(0, 200) || res.status}` })
        return
      }
      await refetchRegistry()
      setStatusMsg({
        kind: 'success',
        text: targetStatus === 'paused'
          ? `${current.name} paused. The cron worker will skip it on the next tick.`
          : `${current.name} resumed. Queued work will pick up on the next cron tick.`,
      })
    } catch (err) {
      setStatusMsg({ kind: 'error', text: `Network error: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusyAgentId(null)
    }
  }

  /**
   * Pause/Resume EVERY agent. Fires N PATCH requests in sequence
   * (intentionally not parallel — we want the writes to be observable in
   * /audit and avoid race-conditions on the agents.updated_at column).
   * Failures collect and surface as a single "partial" toast.
   */
  const toggleAll = async () => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) {
      setStatusMsg({ kind: 'error', text: 'No workspace selected.' })
      return
    }
    if (busyAgentId) return
    const newPaused = !allPaused
    const targetStatus: ApiAgentStatus = newPaused ? 'paused' : 'active'

    // Sprint 20H warning #5: require confirmation for mass pause. A single
    // accidental click moved 18 agents from ready → paused with no toast,
    // no confirm dialog, and no undo. Now block on an explicit confirm.
    if (typeof window !== 'undefined') {
      const verb = newPaused ? 'pause' : 'resume'
      const ok = window.confirm(`Are you sure you want to ${verb} ALL ${agents.length} agents at once? You can undo from this same button.`)
      if (!ok) return
    }

    setBusyAgentId('__all__')
    setStatusMsg(null)
    let succeeded = 0
    let failed = 0
    for (const a of agents) {
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(a.id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: wid, status: targetStatus }),
        })
        if (res.ok) succeeded++; else failed++
      } catch { failed++ }
    }
    setAllPaused(newPaused)
    await refetchRegistry()
    setBusyAgentId(null)
    if (failed === 0) {
      setStatusMsg({ kind: 'success', text: `${succeeded} agents ${newPaused ? 'paused' : 'resumed'}.` })
    } else {
      setStatusMsg({
        kind: 'error',
        text: `Partial: ${succeeded} ${newPaused ? 'paused' : 'resumed'}, ${failed} failed.`,
      })
    }
  }

  /**
   * Save configuration to /api/agents/[name]/config. Persists to the
   * agent_configs table (separate from lifecycle status). Doesn't
   * optimistically write to local state — we wait for the PATCH to
   * succeed before reflecting the change.
   */
  const saveConfig = async (id: string, cfg: AgentConfig) => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) {
      setStatusMsg({ kind: 'error', text: 'No workspace selected.' })
      return
    }
    if (busyAgentId) return
    setBusyAgentId(id)
    setStatusMsg(null)
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wid,
          model: cfg.model,
          instructions: cfg.instructions,
          tone: cfg.tone,                              // stored as-is; the server is lenient on tone
          maxTasksPerDay: cfg.maxTasksPerDay,
          priority: uiToApiPriority(cfg.priority),
          allowedTools: cfg.allowedTools,
          schedule: uiToApiSchedule(cfg.schedule),
          dailyCostCap: cfg.costCapPerDay,
          escalateTo: cfg.autoEscalateTo === 'None' ? null : cfg.autoEscalateTo,
          // apiKeyOverride intentionally NOT sent — that's a BYOK concern
          // handled by /api/workspace-secrets, not by agent_configs. The
          // input remains in local state only so the user sees their entry
          // until they navigate to the proper BYOK settings.
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        setStatusMsg({ kind: 'error', text: `Save failed: ${txt.slice(0, 200) || res.status}` })
        return
      }
      // Update local state on success so the user sees their edits stick.
      setAgents(prev => prev.map(a => a.id === id ? { ...a, config: cfg, model: cfg.model } : a))
      setStatusMsg({ kind: 'success', text: `${agents.find(a => a.id === id)?.name || 'Agent'} configuration saved.` })
    } catch (err) {
      setStatusMsg({ kind: 'error', text: `Network error: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusyAgentId(null)
    }
  }

  const filtered = agents.filter(a => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || a.category === categoryFilter
    return matchSearch && matchCat
  })

  // Sprint 19Q: counts now reflect honest states.
  // 'running' = currently doing work; 'ready' = enabled, no in-flight run.
  const runningCount = agents.filter(a => a.status === 'running').length
  const readyCount = agents.filter(a => a.status === 'ready').length
  const errorCount = agents.filter(a => a.status === 'error').length
  // Kept old variable names as aliases so the stat-card JSX below doesn't break.
  const activeCount = runningCount
  const idleCount = readyCount
  const totalTasks = agents.reduce((s, a) => s + a.tasksToday, 0)
  const totalCost = agents.reduce((s, a) => s + a.costToday, 0)
  const avgResp = '9.2s'
  const uptime = '99.97%'

  return (
    <div className="p-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Agents</h1>
          <p className="text-gray-400 text-sm mt-1">Your autonomous marketing workforce</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm">
              <span className={`w-2 h-2 rounded-full ${runningCount > 0 ? 'bg-indigo-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className={`${runningCount > 0 ? 'text-indigo-400' : 'text-gray-500'} font-medium`}>{runningCount} running</span>
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-green-400 text-sm">{readyCount} ready</span>
            <span className="text-gray-600">·</span>
            <span className={`text-sm ${errorCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{errorCount} errors</span>
          </div>
          {/* Sprint 19Q: explainer banner so users know agents only work
              when the CMO dispatches them via chat or approval. */}
          <p className="text-gray-500 text-xs mt-2 max-w-2xl leading-relaxed">
            <span className="text-gray-400 font-medium">Ready</span> = enabled, waiting for orders.
            Agents only run when the <a href="/dashboard" className="text-indigo-400 hover:text-indigo-300">CMO console</a> dispatches them
            (chat with the CMO, approve a strategy, or trigger a workflow). Approved strategies auto-decompose
            into per-agent tasks on the approval action.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 text-sm font-medium">
            {totalTasks} tasks completed today
          </span>
          <button onClick={toggleAll}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              allPaused
                ? 'bg-green-600 hover:bg-green-500 border-green-500 text-white'
                : 'bg-yellow-900/40 hover:bg-yellow-900/60 border-yellow-700 text-yellow-300'
            }`}>
            {allPaused ? '▶ Resume All' : '⏸ Pause All Agents'}
          </button>
        </div>
      </div>

      {/* Status toast — appears after Pause/Resume/Save. Sprint 2 Commit 3. */}
      {statusMsg && (
        <div className={`mb-4 p-3 rounded-xl border text-sm flex items-start gap-2 ${
          statusMsg.kind === 'success'
            ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
            : 'bg-red-950/40 border-red-800/50 text-red-300'
        }`}>
          <span>{statusMsg.kind === 'success' ? '✓' : '✕'}</span>
          <span className="flex-1">{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-gray-500 hover:text-white">×</button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total Agents', value: agents.length.toString(), color: 'text-white' },
          { label: 'Running Now', value: runningCount.toString(), color: 'text-indigo-400' },
          { label: 'Tasks Today', value: totalTasks.toString(), color: 'text-indigo-400' },
          { label: 'Avg Response', value: avgResp, color: 'text-blue-400' },
          { label: 'AI Cost Today', value: `$${totalCost.toFixed(2)}`, color: 'text-purple-400' },
          { label: 'Uptime', value: uptime, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm w-56" />
          {/* Category filter */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
            {(['all', 'supervisor', 'worker'] as const).map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${categoryFilter === c ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {/* View toggle */}
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
          {([
            { v: 'grid', icon: '⊞', label: 'Grid' },
            { v: 'list', icon: '☰', label: 'List' },
            { v: 'hierarchy', icon: '⬡', label: 'Hierarchy' },
          ] as const).map(({ v, icon, label }) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {/* Loading state — first registry fetch hasn't returned yet */}
          {loading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-indigo-400 animate-spin" />
              <p className="text-gray-400 text-sm">Loading agents…</p>
            </div>
          )}

          {/* Load error state */}
          {!loading && loadError && (
            <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 text-red-300 text-sm">
              <p className="font-medium mb-1">Couldn&apos;t load your agents</p>
              <p className="text-xs">{loadError}</p>
            </div>
          )}

          {/* Empty state — registry returned zero rows */}
          {!loading && !loadError && agents.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <p className="text-3xl mb-3">🤖</p>
              <p className="text-white font-semibold mb-1">No agents registered yet</p>
              <p className="text-gray-500 text-sm">
                Agents are seeded automatically when your workspace is created.
                If you&apos;re seeing this, re-run workspace onboarding or contact support.
              </p>
            </div>
          )}

          {/* Filtered-empty state — agents exist but search/filter hides them */}
          {!loading && !loadError && agents.length > 0 && filtered.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <p className="text-gray-400 text-sm">
                No agents match your search.{' '}
                <button onClick={() => { setSearch(''); setCategoryFilter('all') }}
                  className="text-indigo-400 hover:underline">Clear filters</button>
              </p>
            </div>
          )}

          {/* Grid View */}
          {!loading && filtered.length > 0 && view === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(agent => (
                <AgentCard key={agent.id} agent={agent}
                  onConfigure={setConfigAgent}
                  onViewLogs={setLogAgent}
                  onTogglePause={togglePause} />
              ))}
            </div>
          )}

          {/* List View */}
          {!loading && filtered.length > 0 && view === 'list' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <div className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 text-xs text-gray-500 font-medium uppercase tracking-wider">Agent</div>
                <div className="w-24 text-xs text-gray-500 font-medium uppercase tracking-wider text-center hidden sm:block">Status</div>
                <div className="w-20 text-xs text-gray-500 font-medium uppercase tracking-wider text-right hidden sm:block">Tasks</div>
                <div className="w-16 text-xs text-gray-500 font-medium uppercase tracking-wider text-right hidden md:block">Cost</div>
                <div className="w-28 text-xs text-gray-500 font-medium uppercase tracking-wider hidden lg:block">Model</div>
                <div className="w-44 text-xs text-gray-500 font-medium uppercase tracking-wider text-right">Actions</div>
              </div>
              {filtered.map(agent => (
                <AgentListRow key={agent.id} agent={agent}
                  onConfigure={setConfigAgent}
                  onViewLogs={setLogAgent}
                  onTogglePause={togglePause} />
              ))}
            </div>
          )}

          {/* Hierarchy View */}
          {!loading && agents.length > 0 && view === 'hierarchy' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <p className="text-gray-500 text-xs mb-6 text-center">Click any node to configure · Agents auto-route tasks through the hierarchy</p>
              <HierarchyView agents={agents} onConfigure={setConfigAgent} />
            </div>
          )}
        </div>

        {/* Activity Feed Sidebar */}
        <div className="w-72 flex-shrink-0 hidden xl:block">
          <div className="bg-gray-900 border border-gray-800 rounded-xl sticky top-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">Live Activity</h3>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs">Live</span>
              </span>
            </div>
            <div className="p-3 space-y-0 max-h-[600px] overflow-y-auto">
              {!activityLoaded && (
                <p className="text-gray-500 text-xs px-2 py-4 text-center">Loading…</p>
              )}
              {activityLoaded && activity.length === 0 && (
                <p className="text-gray-500 text-xs px-2 py-4 text-center leading-relaxed">
                  No agent activity yet — runs will appear here as agents work.
                </p>
              )}
              {activity.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 py-2.5 border-b border-gray-800 last:border-0">
                  <span className="text-base flex-shrink-0 mt-0.5">{item.agentIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-indigo-300 text-xs font-medium truncate">{item.agentName}</p>
                    <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{item.message}</p>
                    <p className="text-gray-600 text-xs mt-1">{item.timeAgo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Config Slide-over */}
      {configAgent && (
        <ConfigSlideover agent={configAgent} onClose={() => setConfigAgent(null)} onSave={saveConfig} />
      )}

      {/* Log Modal */}
      {logAgent && (
        <LogModal agent={logAgent} onClose={() => setLogAgent(null)} />
      )}
    </div>
  )
}
