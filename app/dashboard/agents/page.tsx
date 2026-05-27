'use client'

import { useState, useEffect, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'active' | 'idle' | 'error' | 'paused'
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

// ── Mock Data ────────────────────────────────────────────────────────────────

const DEFAULT_TOOLS = ['Web Search', 'Image Gen', 'Email Send', 'CRM Update', 'Social Post', 'File Read', 'Analytics Pull', 'Webhook']

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

function makeLogs(agentName: string): LogEntry[] {
  const tasks = [
    { type: 'Content Generation', input: 'Write blog post about AI trends', output: '1,847 word blog post with 3 SEO keywords', cost: 0.042, dur: '12.4s' },
    { type: 'Social Scheduling', input: 'Schedule LinkedIn post for Thursday 9am', output: 'Post scheduled: "Top 5 AI Tools for 2026"', cost: 0.008, dur: '3.1s' },
    { type: 'Lead Score Update', input: 'Score lead: john@acme.com', output: 'Score updated to 87/100 (High Intent)', cost: 0.011, dur: '4.8s' },
    { type: 'Brand Monitoring', input: 'Scan Twitter for brand mentions', output: '3 new mentions found, 1 requires response', cost: 0.019, dur: '8.2s' },
    { type: 'Email Draft', input: 'Draft follow-up email for demo request', output: '247 word personalized follow-up email', cost: 0.031, dur: '9.7s' },
  ]
  const now = Date.now()
  return tasks.map((t, i) => ({
    id: `log-${agentName}-${i}`,
    timestamp: new Date(now - (i + 1) * 23 * 60000).toISOString(),
    taskType: t.type,
    input: t.input,
    output: t.output,
    cost: t.cost,
    duration: t.dur,
    status: i === 2 ? 'failed' : 'success',
  }))
}

const AGENTS: Agent[] = [
  // Supervisors
  {
    id: 'cmo', name: 'CMO Agent', icon: '🧠', role: 'Strategy & Orchestration', category: 'supervisor',
    status: 'active', currentTask: 'Running: Q2 Strategy Update',
    tasksToday: 12, costToday: 0.84, avgResponseTime: '14.2s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ maxTasksPerDay: 20, priority: 'Critical', allowedTools: ['Web Search', 'Analytics Pull', 'Webhook'], costCapPerDay: 10 }),
    logs: makeLogs('cmo'),
  },
  {
    id: 'content-sup', name: 'Content Supervisor', icon: '📅', role: 'Content & Creative', category: 'supervisor',
    status: 'active', currentTask: 'Building May content calendar',
    tasksToday: 34, costToday: 1.12, avgResponseTime: '11.8s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ priority: 'High', allowedTools: ['Web Search', 'Image Gen', 'Social Post'] }),
    logs: makeLogs('content-sup'),
  },
  {
    id: 'growth-sup', name: 'Growth Supervisor', icon: '🎯', role: 'Leads & Revenue', category: 'supervisor',
    status: 'active', currentTask: 'Analyzing funnel drop-off at checkout',
    tasksToday: 28, costToday: 0.76, avgResponseTime: '9.4s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ priority: 'High', allowedTools: ['Web Search', 'CRM Update', 'Webhook'] }),
    logs: makeLogs('growth-sup'),
  },
  {
    id: 'engagement-sup', name: 'Engagement Supervisor', icon: '💬', role: 'Inbox & Social', category: 'supervisor',
    status: 'idle', currentTask: undefined,
    tasksToday: 8, costToday: 0.23, avgResponseTime: '6.1s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ schedule: 'Business hours', allowedTools: ['Email Send', 'Social Post', 'CRM Update'] }),
    logs: makeLogs('engagement-sup'),
  },
  {
    id: 'intelligence-sup', name: 'Intelligence Supervisor', icon: '🔭', role: 'Research & Analytics', category: 'supervisor',
    status: 'active', currentTask: 'Compiling competitor intelligence report',
    tasksToday: 19, costToday: 0.91, avgResponseTime: '18.7s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ priority: 'High', allowedTools: ['Web Search', 'Analytics Pull', 'File Read'] }),
    logs: makeLogs('intelligence-sup'),
  },
  {
    id: 'brand-sup', name: 'Brand Supervisor', icon: '🎨', role: 'Brand & Reputation', category: 'supervisor',
    status: 'idle', currentTask: undefined,
    tasksToday: 5, costToday: 0.18, avgResponseTime: '7.9s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ schedule: 'Business hours', costCapPerDay: 3 }),
    logs: makeLogs('brand-sup'),
  },
  // Workers
  {
    id: 'blog-writer', name: 'Blog Writer Agent', icon: '✍️', role: 'Long-form Content', category: 'worker',
    supervisorId: 'content-sup', supervisorName: 'Content Supervisor',
    status: 'active', currentTask: 'Writing: "Top 10 SaaS Tools for 2026"',
    tasksToday: 8, costToday: 0.38, avgResponseTime: '22.1s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ instructions: 'Write SEO-optimized blog posts. Min 1500 words. Include H2/H3 subheadings and meta description.' }),
    logs: makeLogs('blog-writer'),
  },
  {
    id: 'social-agent', name: 'Social Media Agent', icon: '📱', role: 'Social Posting', category: 'worker',
    supervisorId: 'content-sup', supervisorName: 'Content Supervisor',
    status: 'active', currentTask: 'Scheduling 3 LinkedIn posts for next week',
    tasksToday: 24, costToday: 0.29, avgResponseTime: '5.3s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Social Post', 'Image Gen'] }),
    logs: makeLogs('social-agent'),
  },
  {
    id: 'email-copy', name: 'Email Copywriter Agent', icon: '📧', role: 'Email Sequences', category: 'worker',
    supervisorId: 'content-sup', supervisorName: 'Content Supervisor',
    status: 'idle', currentTask: undefined,
    tasksToday: 3, costToday: 0.14, avgResponseTime: '8.4s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Email Send', 'CRM Update'] }),
    logs: makeLogs('email-copy'),
  },
  {
    id: 'ad-copy', name: 'Ad Copy Agent', icon: '📢', role: 'Paid Advertising Copy', category: 'worker',
    supervisorId: 'content-sup', supervisorName: 'Content Supervisor',
    status: 'active', currentTask: 'Writing Meta ad variants for summer campaign',
    tasksToday: 7, costToday: 0.22, avgResponseTime: '9.1s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Web Search', 'Image Gen'] }),
    logs: makeLogs('ad-copy'),
  },
  {
    id: 'seo-agent', name: 'SEO Agent', icon: '🔍', role: 'SEO Optimization', category: 'worker',
    supervisorId: 'content-sup', supervisorName: 'Content Supervisor',
    status: 'active', currentTask: 'Auditing on-page SEO for 5 blog posts',
    tasksToday: 12, costToday: 0.31, avgResponseTime: '11.2s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Web Search', 'Analytics Pull'] }),
    logs: makeLogs('seo-agent'),
  },
  {
    id: 'lead-scorer', name: 'Lead Scorer Agent', icon: '⚡', role: 'Lead Qualification', category: 'worker',
    supervisorId: 'growth-sup', supervisorName: 'Growth Supervisor',
    status: 'active', currentTask: 'Scoring 47 new inbound leads from Typeform',
    tasksToday: 47, costToday: 0.18, avgResponseTime: '3.7s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['CRM Update', 'Webhook'] }),
    logs: makeLogs('lead-scorer'),
  },
  {
    id: 'outreach-agent', name: 'Outreach Agent', icon: '📬', role: 'Sales Outreach', category: 'worker',
    supervisorId: 'growth-sup', supervisorName: 'Growth Supervisor',
    status: 'idle', currentTask: undefined,
    tasksToday: 0, costToday: 0.00, avgResponseTime: '—', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ schedule: 'Business hours', allowedTools: ['Email Send', 'CRM Update'] }),
    logs: makeLogs('outreach-agent'),
  },
  {
    id: 'crm-agent', name: 'CRM Agent', icon: '🗄️', role: 'CRM Management', category: 'worker',
    supervisorId: 'growth-sup', supervisorName: 'Growth Supervisor',
    status: 'active', currentTask: 'Syncing 23 deal stage updates from Slack',
    tasksToday: 23, costToday: 0.09, avgResponseTime: '2.8s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['CRM Update', 'Webhook', 'Email Send'] }),
    logs: makeLogs('crm-agent'),
  },
  {
    id: 'brand-monitor', name: 'Brand Monitor Agent', icon: '👁️', role: 'Brand Monitoring', category: 'worker',
    supervisorId: 'brand-sup', supervisorName: 'Brand Supervisor',
    status: 'active', currentTask: 'Scanning 156 social mentions across platforms',
    tasksToday: 156, costToday: 0.12, avgResponseTime: '4.2s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Web Search', 'Analytics Pull'] }),
    logs: makeLogs('brand-monitor'),
  },
  {
    id: 'reputation-agent', name: 'Reputation Agent', icon: '⭐', role: 'Review Management', category: 'worker',
    supervisorId: 'brand-sup', supervisorName: 'Brand Supervisor',
    status: 'active', currentTask: 'Drafting response to G2 review',
    tasksToday: 8, costToday: 0.06, avgResponseTime: '6.8s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Web Search', 'Email Send'] }),
    logs: makeLogs('reputation-agent'),
  },
  {
    id: 'research-agent', name: 'Research Agent', icon: '🧪', role: 'Market Intelligence', category: 'worker',
    supervisorId: 'intelligence-sup', supervisorName: 'Intelligence Supervisor',
    status: 'active', currentTask: 'Compiling competitor pricing analysis',
    tasksToday: 4, costToday: 0.44, avgResponseTime: '31.2s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Web Search', 'File Read', 'Analytics Pull'], costCapPerDay: 8 }),
    logs: makeLogs('research-agent'),
  },
  {
    id: 'analytics-agent', name: 'Analytics Agent', icon: '📊', role: 'Performance Analytics', category: 'worker',
    supervisorId: 'intelligence-sup', supervisorName: 'Intelligence Supervisor',
    status: 'active', currentTask: 'Ongoing: Q2 performance dashboard refresh',
    tasksToday: 11, costToday: 0.28, avgResponseTime: '14.9s', model: 'Claude 3.5 Sonnet',
    config: makeConfig({ allowedTools: ['Analytics Pull', 'File Read', 'Webhook'] }),
    logs: makeLogs('analytics-agent'),
  },
]

const ACTIVITY_FEED: ActivityItem[] = [
  { agentId: 'blog-writer', agentName: 'Blog Writer Agent', agentIcon: '✍️', message: 'Published "Top 10 SaaS Tools for 2026" to WordPress', timeAgo: '2m ago' },
  { agentId: 'analytics-agent', agentName: 'Analytics Agent', agentIcon: '📊', message: 'Generated Q2 performance report — 14 slides', timeAgo: '4m ago' },
  { agentId: 'lead-scorer', agentName: 'Lead Scorer Agent', agentIcon: '⚡', message: 'Scored 47 leads — 12 marked High Intent', timeAgo: '6m ago' },
  { agentId: 'social-agent', agentName: 'Social Media Agent', agentIcon: '📱', message: 'Scheduled 8 posts across LinkedIn, X, Instagram', timeAgo: '9m ago' },
  { agentId: 'brand-monitor', agentName: 'Brand Monitor Agent', agentIcon: '👁️', message: 'Detected 3 negative mentions on Reddit — escalated to Brand Supervisor', timeAgo: '11m ago' },
  { agentId: 'cmo', agentName: 'CMO Agent', agentIcon: '🧠', message: 'Q2 strategy update completed — sent to approvals', timeAgo: '15m ago' },
  { agentId: 'crm-agent', agentName: 'CRM Agent', agentIcon: '🗄️', message: 'Updated 23 deal stages in CRM', timeAgo: '18m ago' },
  { agentId: 'ad-copy', agentName: 'Ad Copy Agent', agentIcon: '📢', message: 'Created 5 Meta ad variants for summer campaign', timeAgo: '21m ago' },
  { agentId: 'seo-agent', agentName: 'SEO Agent', agentIcon: '🔍', message: 'SEO audit complete: 5 posts optimized, avg score 84/100', timeAgo: '27m ago' },
  { agentId: 'research-agent', agentName: 'Research Agent', agentIcon: '🧪', message: 'Competitor pricing analysis complete — Notion saved', timeAgo: '33m ago' },
  { agentId: 'reputation-agent', agentName: 'Reputation Agent', agentIcon: '⭐', message: 'Responded to 2 G2 reviews and 1 Trustpilot review', timeAgo: '41m ago' },
  { agentId: 'email-copy', agentName: 'Email Copywriter Agent', agentIcon: '📧', message: 'Drafted 3 follow-up emails for demo pipeline', timeAgo: '52m ago' },
]

const AVAILABLE_MODELS = [
  'Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus',
  'GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo',
  'Gemini 1.5 Pro', 'Gemini 1.5 Flash',
  'Llama 3.1 70B', 'Mistral Large',
]

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    active: { dot: 'bg-green-400 animate-pulse', text: 'text-green-400', label: 'Active' },
    idle: { dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Idle' },
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
      <div className="grid grid-cols-3 gap-2">
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
            <div className="grid grid-cols-4 gap-2">
              {(['Professional', 'Casual', 'Formal', 'Friendly'] as ToneOption[]).map(t => (
                <button key={t} onClick={() => setCfg(p => ({ ...p, tone: t }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${cfg.tone === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Max tasks + Cost cap */}
          <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-4 gap-2">
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
            <div className="grid grid-cols-2 gap-2">
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
            <div className="grid grid-cols-3 gap-2">
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
                <div className="px-4 pb-4 pt-2 border-t border-gray-800 grid grid-cols-2 gap-4">
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
                              <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${w.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`} />
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
  const [agents, setAgents] = useState<Agent[]>(AGENTS)
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
        const runs = await res.json() as Array<{
          id: string
          agent_name: string
          status: string
          cost_estimate?: number
          input_json?: string
          output_json?: string
          error_message?: string
          created_at: string
          completed_at?: string
        }>
        if (cancelled) return
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const aggregates = new Map<string, { tasks: number; cost: number; running: number; latest: string | null }>()
        for (const r of runs) {
          // Match runs to agents by name/slug (case-insensitive, partial)
          const key = (r.agent_name || '').toLowerCase()
          if (!key) continue
          const existing = aggregates.get(key) || { tasks: 0, cost: 0, running: 0, latest: null }
          if (new Date(r.created_at) >= todayStart) {
            existing.tasks += 1
            existing.cost += Number(r.cost_estimate || 0)
          }
          if (r.status === 'running') existing.running += 1
          if (!existing.latest || new Date(r.created_at) > new Date(existing.latest)) {
            existing.latest = r.created_at
          }
          aggregates.set(key, existing)
        }

        // Merge into static catalog
        setAgents(prev => prev.map(a => {
          // Try several matching strategies against the run agent_name
          const candidates = [a.id, a.name.toLowerCase().replace(/\s+/g, '_'), a.role.toLowerCase()]
          let agg: { tasks: number; cost: number; running: number; latest: string | null } | undefined
          for (const c of candidates) {
            if (aggregates.has(c)) { agg = aggregates.get(c); break }
            // Try fuzzy: any aggregate key contains the candidate
            for (const [k, v] of aggregates) {
              if (k.includes(c) || c.includes(k)) { agg = v; break }
            }
            if (agg) break
          }
          if (!agg) return a
          const newStatus: AgentStatus = agg.running > 0 ? 'active' : a.status === 'paused' ? 'paused' : 'idle'
          return {
            ...a,
            tasksToday: agg.tasks,
            costToday: parseFloat(agg.cost.toFixed(3)),
            status: newStatus,
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

  // ── Lifecycle registry hydration (Sprint 2 Commit 3) ────────────────────
  //
  // Fetches the agents table on mount + after each PATCH so the UI's
  // Pause/Resume state survives reload. The runs-hydration effect above
  // sets 'active'/'idle' based on recent task volume; THIS effect overlays
  // 'paused' on top so a paused agent visibly stays paused regardless of
  // recent activity.
  useEffect(() => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) return
    let cancelled = false

    const hydrateRegistry = async () => {
      try {
        const res = await fetch(`/api/agents/registry?workspaceId=${wid}`)
        if (!res.ok) return
        const rows = await res.json() as RegistryRow[]
        if (cancelled || !Array.isArray(rows)) return
        const byName = new Map(rows.map(r => [r.name, r]))
        setAgents(prev => prev.map(a => {
          const reg = byName.get(a.id)
          if (!reg) return a
          // Pause is authoritative — show paused regardless of runs-hydration.
          // Error/disabled also overlay. Active falls back to whatever the
          // runs-hydration computed (might be idle if no recent runs).
          if (reg.status === 'paused') return { ...a, status: 'paused' }
          if (reg.status === 'error') return { ...a, status: 'error' }
          return a
        }))
      } catch (err) {
        console.error('[agents] registry hydrate failed', err)
      }
    }

    hydrateRegistry()
    // Don't re-poll the registry — it only changes via this page's own
    // PATCHes, which already trigger a fresh fetch via refetchRegistry().
    return () => { cancelled = true }
  }, [])

  // Re-fetch the registry — called after every successful status PATCH so
  // the UI sees the canonical row (with server-set paused_at / paused_by).
  const refetchRegistry = async (): Promise<void> => {
    const wid = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    if (!wid) return
    try {
      const res = await fetch(`/api/agents/registry?workspaceId=${wid}`)
      if (!res.ok) return
      const rows = await res.json() as RegistryRow[]
      const byName = new Map(rows.map(r => [r.name, r]))
      setAgents(prev => prev.map(a => {
        const reg = byName.get(a.id)
        if (!reg) return a
        if (reg.status === 'paused') return { ...a, status: 'paused' }
        if (reg.status === 'error') return { ...a, status: 'error' }
        // Resume → drop back to 'idle' so the runs-hydration effect can
        // promote to 'active' on its next tick if there's running work.
        if (a.status === 'paused' && reg.status === 'active') {
          return { ...a, status: 'idle' }
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

  const activeCount = agents.filter(a => a.status === 'active').length
  const idleCount = agents.filter(a => a.status === 'idle').length
  const errorCount = agents.filter(a => a.status === 'error').length
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
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-medium">{activeCount} agents active</span>
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-yellow-400 text-sm">{idleCount} idle</span>
            <span className="text-gray-600">·</span>
            <span className={`text-sm ${errorCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{errorCount} errors</span>
          </div>
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
          { label: 'Active Now', value: activeCount.toString(), color: 'text-green-400' },
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
          {/* Grid View */}
          {view === 'grid' && (
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
          {view === 'list' && (
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
          {view === 'hierarchy' && (
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
              {ACTIVITY_FEED.map((item, i) => (
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
