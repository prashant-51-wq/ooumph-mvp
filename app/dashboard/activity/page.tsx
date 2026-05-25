'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  goal: string
  team: Array<{ role: string; agent: string; description: string }>
  status: 'active' | 'completed' | 'paused'
  createdAt: string
  firstAction?: string
}

interface ActivityMessage {
  id: string
  from: 'user' | 'cmo' | 'agent' | 'system'
  agentSlug?: string
  content: string
  type: 'text' | 'tool_call' | 'artifact_ready' | 'agent_dispatch' | 'api_key_request'
  toolName?: string
  toolInput?: string
  toolResult?: string
  approvalId?: string
  artifactType?: string
  artifactTitle?: string
  timestamp: string
  streaming?: boolean
}

interface AgentRun {
  id: string
  agent_name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  error_message?: string
}

interface ApprovalItem {
  id: string
  artifact_id: string
  artifact_type: string
  artifact_title: string
  content_json: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_META: Record<string, { icon: string; color: string; bgColor: string; fullName: string }> = {
  strategy:  { icon: '🧠', color: 'text-indigo-400',  bgColor: 'bg-indigo-600',  fullName: 'Strategy Agent' },
  content:   { icon: '📅', color: 'text-blue-400',    bgColor: 'bg-blue-600',    fullName: 'Content Agent' },
  creative:  { icon: '🎨', color: 'text-pink-400',    bgColor: 'bg-pink-600',    fullName: 'Creative Agent' },
  leads:     { icon: '🎯', color: 'text-orange-400',  bgColor: 'bg-orange-600',  fullName: 'Leads Agent' },
  email:     { icon: '📧', color: 'text-yellow-400',  bgColor: 'bg-yellow-600',  fullName: 'Email Agent' },
  funnel:    { icon: '🔮', color: 'text-purple-400',  bgColor: 'bg-purple-600',  fullName: 'Funnel Agent' },
  ads:       { icon: '📢', color: 'text-red-400',     bgColor: 'bg-red-600',     fullName: 'Ads Agent' },
  research:  { icon: '🔍', color: 'text-teal-400',    bgColor: 'bg-teal-600',    fullName: 'Research Agent' },
  growth:    { icon: '📈', color: 'text-green-400',   bgColor: 'bg-green-600',   fullName: 'Growth Agent' },
  analytics: { icon: '📊', color: 'text-cyan-400',    bgColor: 'bg-cyan-600',    fullName: 'Analytics Agent' },
  pr:        { icon: '📰', color: 'text-amber-400',   bgColor: 'bg-amber-600',   fullName: 'PR Agent' },
  blog:      { icon: '✍️', color: 'text-violet-400',  bgColor: 'bg-violet-600',  fullName: 'Blog Agent' },
  cmo:       { icon: '⚡', color: 'text-white',       bgColor: 'bg-indigo-700',  fullName: 'AI CMO' },
}

const WORKSPACE_KEY = 'ooumph_projects_v1'
const MSG_PREFIX = 'ooumph_msgs_'

const AVAILABLE_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-3-5',
  'gpt-4o',
  'gpt-4o-mini',
]

const ACTIVE_TOOLS = [
  { name: 'Brave Search', active: true },
  { name: 'Claude', active: true },
  { name: 'ElevenLabs', active: false },
  { name: 'HubSpot', active: false },
  { name: 'Canva', active: false },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function saveProjects(projects: Project[]) {
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(projects)) } catch { /* ignore */ }
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    return raw ? (JSON.parse(raw) as Project[]) : []
  } catch { return [] }
}

function saveMsgs(projectId: string, msgs: ActivityMessage[]) {
  try { localStorage.setItem(MSG_PREFIX + projectId, JSON.stringify(msgs)) } catch { /* ignore */ }
}

function loadMsgs(projectId: string): ActivityMessage[] {
  try {
    const raw = localStorage.getItem(MSG_PREFIX + projectId)
    return raw ? (JSON.parse(raw) as ActivityMessage[]) : []
  } catch { return [] }
}

function runToMessage(run: AgentRun): ActivityMessage {
  const slug = run.agent_name.split('_')[0]
  if (run.status === 'running') {
    return { id: run.id, from: 'agent', agentSlug: slug, content: '', streaming: true, type: 'text', timestamp: run.created_at }
  }
  if (run.status === 'completed') {
    return { id: run.id, from: 'agent', agentSlug: slug, content: 'Task completed successfully.', type: 'text', timestamp: run.completed_at || run.created_at }
  }
  if (run.status === 'failed') {
    return { id: run.id, from: 'agent', agentSlug: slug, content: `Failed: ${run.error_message || 'Unknown error'}`, type: 'text', timestamp: run.completed_at || run.created_at }
  }
  return { id: run.id, from: 'agent', agentSlug: slug, content: 'Starting...', type: 'text', timestamp: run.created_at }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentAvatar({ slug, size = 28 }: { slug: string; size?: number }) {
  const meta = AGENT_META[slug] || AGENT_META.cmo
  return (
    <div
      className={`rounded-full ${meta.bgColor} flex items-center justify-center flex-shrink-0 text-sm`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      title={meta.fullName}
    >
      {meta.icon}
    </div>
  )
}

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function ToolCallBlock({ toolName, toolInput, toolResult }: { toolName: string; toolInput?: string; toolResult?: string }) {
  const [expanded, setExpanded] = useState(false)
  const summary = toolInput ? toolInput.slice(0, 60) + (toolInput.length > 60 ? '...' : '') : ''
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden text-xs font-mono my-1">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-900 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-green-500">▶</span>
        <span className="text-green-400 font-semibold">{toolName}</span>
        {summary && <span className="text-gray-500 truncate flex-1">{summary}</span>}
        <span className="text-gray-600 ml-auto flex-shrink-0">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-800">
          {toolInput && (
            <div className="px-3 py-2">
              <p className="text-gray-600 uppercase tracking-wider text-[10px] mb-1">Input</p>
              <pre className="text-gray-300 whitespace-pre-wrap break-all text-xs leading-relaxed">{toolInput}</pre>
            </div>
          )}
          {toolResult && (
            <div className="px-3 py-2 border-t border-gray-800">
              <p className="text-gray-600 uppercase tracking-wider text-[10px] mb-1">Result</p>
              <pre className="text-gray-300 whitespace-pre-wrap break-all text-xs leading-relaxed">{toolResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ArtifactReadyCard({
  approvalId,
  artifactTitle,
  artifactType,
  contentJson,
  status,
  onApprove,
  onReject,
}: {
  approvalId: string
  artifactTitle: string
  artifactType: string
  contentJson: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, notes: string) => Promise<void>
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)

  const handleApprove = async () => {
    setActing(true)
    await onApprove(approvalId)
    setActing(false)
  }

  const handleReject = async () => {
    setActing(true)
    await onReject(approvalId, notes)
    setActing(false)
    setRejectMode(false)
    setNotes('')
  }

  return (
    <div className="border border-indigo-800 bg-indigo-950/30 rounded-xl overflow-hidden my-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/20 border-b border-yellow-800/30">
        <span className="text-yellow-400">✋</span>
        <span className="text-yellow-300 text-xs font-semibold">Ready for review</span>
        {status !== 'pending' && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${status === 'approved' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
            {status === 'approved' ? '✓ Approved' : '✕ Rejected'}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-white text-sm font-medium">{artifactTitle}</p>
        <p className="text-gray-400 text-xs mt-0.5 capitalize">{artifactType}</p>

        {/* Preview toggle */}
        <button
          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          onClick={() => setPreviewOpen(v => !v)}
        >
          Preview {previewOpen ? '▲' : '▼'}
        </button>
        {previewOpen && (
          <pre className="mt-2 bg-gray-950 rounded-lg p-2 text-xs text-gray-300 font-mono overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
            {JSON.stringify(contentJson, null, 2)}
          </pre>
        )}

        {/* Actions */}
        {status === 'pending' && (
          <div className="mt-3 space-y-2">
            {!rejectMode ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {acting ? 'Approving...' : '✓ Approve'}
                </button>
                <button
                  onClick={() => setRejectMode(true)}
                  disabled={acting}
                  className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Request Changes
                </button>
                <Link
                  href="/dashboard/approvals"
                  className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                >
                  Open in Approvals ↗
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Describe what needs to change..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReject}
                    disabled={acting || !notes.trim()}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {acting ? 'Sending...' : 'Send Feedback'}
                  </button>
                  <button
                    onClick={() => { setRejectMode(false); setNotes('') }}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentMessage({
  msg,
  approvals,
  onApprove,
  onReject,
}: {
  msg: ActivityMessage
  approvals: ApprovalItem[]
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, notes: string) => Promise<void>
}) {
  const slug = msg.agentSlug || 'cmo'
  const meta = AGENT_META[slug] || AGENT_META.cmo

  return (
    <div className="flex items-start gap-2.5 py-2 group">
      <AgentAvatar slug={slug} />
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-semibold text-sm ${meta.color}`}>{meta.fullName}</span>
          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 text-[10px] font-mono">claude-sonnet</span>
          <span className="text-gray-600 text-xs">{formatTime(msg.timestamp)}</span>
        </div>
        {/* Content */}
        {msg.streaming && !msg.content ? (
          <BouncingDots />
        ) : msg.type === 'tool_call' ? (
          <ToolCallBlock toolName={msg.toolName || 'tool'} toolInput={msg.toolInput} toolResult={msg.toolResult} />
        ) : msg.type === 'artifact_ready' && msg.approvalId ? (
          (() => {
            const approval = approvals.find(a => a.id === msg.approvalId)
            if (!approval) return null
            return (
              <ArtifactReadyCard
                approvalId={approval.id}
                artifactTitle={approval.artifact_title}
                artifactType={approval.artifact_type}
                contentJson={approval.content_json}
                status={approval.status}
                onApprove={onApprove}
                onReject={onReject}
              />
            )
          })()
        ) : (
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>
    </div>
  )
}

function UserMessage({ msg }: { msg: ActivityMessage }) {
  const parts = msg.content.split(/(@\w+)/g)
  return (
    <div className="flex justify-end py-2">
      <div className="max-w-[75%] bg-indigo-700 rounded-2xl px-4 py-2.5 text-white text-sm leading-relaxed">
        {parts.map((part, i) =>
          part.startsWith('@') ? (
            <span key={i} className="text-indigo-200 font-semibold">{part}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </div>
    </div>
  )
}

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="text-gray-600 text-xs px-3 py-1 rounded-full border border-gray-800">{content}</span>
    </div>
  )
}

function AgentDispatchMessage({ msg }: { msg: ActivityMessage }) {
  const targetSlug = msg.agentSlug || 'cmo'
  const meta = AGENT_META[targetSlug] || AGENT_META.cmo
  return (
    <div className="pl-8 py-1">
      <div className="border-l-2 border-indigo-700 pl-3 flex items-center gap-2">
        <span className="text-indigo-400 text-xs">↳ dispatched to</span>
        <span className={`text-xs font-semibold ${meta.color}`}>{meta.icon} {meta.fullName}</span>
        <span className="text-gray-600 text-xs">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Add Agent Modal ───────────────────────────────────────────────────────────

function AddAgentModal({
  existingSlugs,
  onAdd,
  onClose,
}: {
  existingSlugs: string[]
  onAdd: (slug: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <p className="text-white text-sm font-semibold">Add Agent</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {Object.entries(AGENT_META).filter(([slug]) => slug !== 'cmo' && !existingSlugs.includes(slug)).map(([slug, meta]) => (
            <button
              key={slug}
              onClick={() => { onAdd(slug); onClose() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="text-base">{meta.icon}</span>
              <span className="text-gray-200 text-sm">{meta.fullName}</span>
            </button>
          ))}
          {Object.entries(AGENT_META).filter(([slug]) => slug !== 'cmo' && !existingSlugs.includes(slug)).length === 0 && (
            <p className="px-4 py-3 text-gray-500 text-xs">All agents are already in the team.</p>
          )}
        </div>
      </div>
      <div className="fixed inset-0 bg-black/50 -z-10" />
    </div>
  )
}

// ── Team Panel ────────────────────────────────────────────────────────────────

function TeamPanel({
  project,
  agentRuns,
  agentModels,
  onModelChange,
  onAddAgent,
}: {
  project: Project | null
  agentRuns: AgentRun[]
  agentModels: Record<string, string>
  onModelChange: (slug: string, model: string) => void
  onAddAgent: (slug: string) => void
}) {
  const [openModelDropdown, setOpenModelDropdown] = useState<string | null>(null)
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 text-xs text-center">Start a project to see your team here.</p>
      </div>
    )
  }

  const existingSlugs = project.team.map(m => m.agent)

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* TEAM header */}
      <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider px-1">Team</p>

      {project.team.map(member => {
        const slug = member.agent
        const meta = AGENT_META[slug] || AGENT_META.cmo
        const isRunning = agentRuns.some(r => r.agent_name.startsWith(slug) && r.status === 'running')
        const model = agentModels[slug] || 'claude-sonnet-4-5'
        const isDropOpen = openModelDropdown === slug

        return (
          <div key={slug} className="space-y-1">
            <div className="flex items-center gap-2">
              <AgentAvatar slug={slug} size={24} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{meta.fullName}</p>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-700'}`} title={isRunning ? 'Active' : 'Idle'} />
            </div>

            {/* Model badge + dropdown */}
            <div className="relative pl-8">
              <button
                onClick={() => setOpenModelDropdown(isDropOpen ? null : slug)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors text-[10px] text-gray-400 hover:text-gray-200"
              >
                <span className="truncate max-w-[100px]">{model}</span>
                <span>▾</span>
              </button>
              {isDropOpen && (
                <div className="absolute left-0 top-6 z-20 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[160px]">
                  {AVAILABLE_MODELS.map(m => (
                    <button
                      key={m}
                      onClick={() => { onModelChange(slug, m); setOpenModelDropdown(null) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-gray-800 ${m === model ? 'text-indigo-400' : 'text-gray-300'}`}
                    >
                      {m === model && <span className="mr-1">✓</span>}
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status text */}
            <p className="text-gray-600 text-[10px] pl-8">{isRunning ? '● Active' : '○ Idle'}</p>
          </div>
        )
      })}

      {/* Add Agent */}
      <button
        onClick={() => setShowAddAgentModal(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 text-xs transition-colors"
      >
        <span>+</span>
        <span>Add Agent</span>
      </button>

      {/* Divider */}
      <div className="border-t border-gray-800 pt-3">
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider px-1 mb-2">Active Tools</p>
        <div className="space-y-1.5">
          {ACTIVE_TOOLS.map(tool => (
            <div key={tool.name} className="flex items-center gap-2 px-1">
              <span className={`text-xs ${tool.active ? 'text-green-400' : 'text-gray-600'}`}>{tool.active ? '✓' : '○'}</span>
              <span className={`text-xs ${tool.active ? 'text-gray-300' : 'text-gray-600'}`}>{tool.name}</span>
            </div>
          ))}
        </div>
      </div>

      {showAddAgentModal && (
        <AddAgentModal
          existingSlugs={existingSlugs}
          onAdd={onAddAgent}
          onClose={() => setShowAddAgentModal(false)}
        />
      )}
    </div>
  )
}

// ── Projects Sidebar ──────────────────────────────────────────────────────────

function ProjectsSidebar({
  projects,
  activeProjectId,
  onSelect,
}: {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string) => void
}) {
  const statusDot = (status: Project['status']) => {
    if (status === 'active') return 'bg-green-400'
    if (status === 'paused') return 'bg-yellow-400'
    return 'bg-gray-500'
  }

  const statusLabel = (status: Project['status']) => {
    if (status === 'active') return 'Running...'
    if (status === 'paused') return 'Paused'
    return 'Completed'
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* New Project */}
      <div className="p-3 border-b border-gray-800 flex-shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          <span>+</span>
          <span>New Project</span>
        </Link>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-gray-600 text-xs">No projects yet.</p>
            <p className="text-gray-700 text-xs mt-1">Start by talking to your CMO.</p>
          </div>
        ) : (
          projects.map(project => {
            const isActive = project.id === activeProjectId
            const teamIcons = project.team.slice(0, 3).map(m => AGENT_META[m.agent]?.icon || '🤖')
            return (
              <button
                key={project.id}
                onClick={() => onSelect(project.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${isActive ? 'bg-indigo-600/20 border border-indigo-700/50' : 'hover:bg-gray-800 border border-transparent'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(project.status)}`} />
                  <span className={`text-xs font-medium truncate flex-1 ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                    {project.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-4">
                  <span className="text-[11px]">{teamIcons.join('')}</span>
                  <span className="text-gray-600 text-[10px]">
                    {project.team.length} agent{project.team.length !== 1 ? 's' : ''}
                  </span>
                  <span className={`text-[10px] ml-auto ${project.status === 'active' ? 'text-green-500' : 'text-gray-600'}`}>
                    {statusLabel(project.status)}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Recent section placeholder */}
      {projects.length > 0 && (
        <div className="border-t border-gray-800 p-3 flex-shrink-0">
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-2 font-semibold">Recent</p>
          {projects.slice(0, 2).map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span className="text-gray-600 text-xs">•</span>
              <span className="text-gray-400 text-xs truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Activity Input ────────────────────────────────────────────────────────────

function ActivityInput({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
}) {
  const [showMention, setShowMention] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const agentList = Object.entries(AGENT_META)
    .filter(([slug]) => slug !== 'cmo')
    .filter(([, meta]) => mentionSearch ? meta.fullName.toLowerCase().includes(mentionSearch.toLowerCase()) : true)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    onChange(val)
    // Detect @ trigger
    const lastAt = val.lastIndexOf('@')
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1)
      if (!afterAt.includes(' ')) {
        setMentionSearch(afterAt)
        setShowMention(true)
        return
      }
    }
    setShowMention(false)
    setMentionSearch('')
  }

  const insertMention = (slug: string) => {
    const lastAt = value.lastIndexOf('@')
    const newVal = value.slice(0, lastAt) + `@${slug} `
    onChange(newVal)
    setShowMention(false)
    setMentionSearch('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showMention && agentList.length > 0) {
        insertMention(agentList[0][0])
      } else {
        onSend()
      }
    }
    if (e.key === 'Escape') {
      setShowMention(false)
    }
  }

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-800 relative">
      {/* @mention popup */}
      {showMention && agentList.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-10">
          {agentList.slice(0, 6).map(([slug, meta]) => (
            <button
              key={slug}
              onClick={() => insertMention(slug)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="text-sm">{meta.icon}</span>
              <span className="text-gray-200 text-sm">{meta.fullName}</span>
              <span className="text-gray-500 text-xs ml-auto">@{slug}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message CMO or @mention an agent..."
          disabled={sending}
          rows={1}
          className="flex-1 bg-transparent px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none resize-none leading-relaxed disabled:opacity-50"
          style={{ maxHeight: '96px', overflowY: 'auto' }}
        />
        <div className="flex items-end pb-2 pr-2">
          <button
            onClick={onSend}
            disabled={sending || !value.trim()}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-xs font-medium transition-colors flex-shrink-0"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      <p className="text-gray-700 text-[10px] mt-1.5 px-1">Enter to send · Shift+Enter for newline · @ to mention agent</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const CMO_GREETING: ActivityMessage = {
  id: 'greeting',
  from: 'cmo',
  agentSlug: 'cmo',
  content: `👋 Welcome to your Workspace. Tell me what you want to achieve — I'll assemble the right team and show you everything as they work. Try: "Grow my LinkedIn from 200 to 1,000 followers" or "Launch my SaaS product this month".`,
  type: 'text',
  timestamp: new Date().toISOString(),
}

export default function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ActivityMessage[]>([CMO_GREETING])
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [agentModels, setAgentModels] = useState<Record<string, string>>({})

  const streamRef = useRef<HTMLDivElement>(null)
  const seenRunIds = useRef<Set<string>>(new Set(['greeting']))
  const seenApprovalIds = useRef<Set<string>>(new Set())

  const activeProject = projects.find(p => p.id === activeProjectId) || null

  // ── Scroll helper ────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [])

  // ── Message helpers ──────────────────────────────────────────────────────────
  const addMessage = useCallback((msg: ActivityMessage) => {
    setMessages(prev => {
      const next = [...prev, msg]
      if (activeProjectId) saveMsgs(activeProjectId, next)
      return next
    })
    setTimeout(scrollToBottom, 50)
  }, [activeProjectId, scrollToBottom])

  const removeMessage = useCallback((id: string) => {
    setMessages(prev => {
      const next = prev.filter(m => m.id !== id)
      if (activeProjectId) saveMsgs(activeProjectId, next)
      return next
    })
  }, [activeProjectId])

  // ── Load projects on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const loaded = loadProjects()
    setProjects(loaded)
    const firstActive = loaded.find(p => p.status === 'active')
    if (firstActive) setActiveProjectId(firstActive.id)

    // Load agent models
    const models: Record<string, string> = {}
    Object.keys(AGENT_META).forEach(slug => {
      const stored = localStorage.getItem(`ooumph_model_${slug}`)
      if (stored) models[slug] = stored
    })
    setAgentModels(models)
  }, [])

  // ── Load messages when active project changes ────────────────────────────────
  useEffect(() => {
    if (activeProjectId) {
      const msgs = loadMsgs(activeProjectId)
      if (msgs.length > 0) {
        setMessages(msgs)
        seenRunIds.current = new Set(msgs.map(m => m.id))
      } else {
        setMessages([CMO_GREETING])
        seenRunIds.current = new Set(['greeting'])
      }
      setTimeout(scrollToBottom, 100)
    }
  }, [activeProjectId, scrollToBottom])

  // ── Poll agent runs ──────────────────────────────────────────────────────────
  const pollRuns = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    try {
      const res = await fetch(`/api/agent-runs?workspaceId=${wid}&limit=20`)
      if (!res.ok) return
      const data: AgentRun[] = await res.json()
      setAgentRuns(data)
      data.forEach(run => {
        if (!seenRunIds.current.has(run.id)) {
          seenRunIds.current.add(run.id)
          addMessage(runToMessage(run))
        }
      })
    } catch { /* ignore */ }
  }, [addMessage])

  // ── Poll approvals ───────────────────────────────────────────────────────────
  const pollApprovals = useCallback(async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    try {
      const res = await fetch(`/api/approvals?workspaceId=${wid}`)
      if (!res.ok) return
      const data: ApprovalItem[] = await res.json()
      setApprovals(data)
      data.filter(a => a.status === 'pending' && !seenApprovalIds.current.has(a.id)).forEach(approval => {
        seenApprovalIds.current.add(approval.id)
        addMessage({
          id: genId(),
          from: 'agent',
          agentSlug: 'cmo',
          content: '',
          type: 'artifact_ready',
          approvalId: approval.id,
          artifactType: approval.artifact_type,
          artifactTitle: approval.artifact_title,
          timestamp: approval.created_at,
        })
      })
    } catch { /* ignore */ }
  }, [addMessage])

  useEffect(() => {
    pollRuns()
    pollApprovals()
    const r = setInterval(pollRuns, 5000)
    const a = setInterval(pollApprovals, 5000)
    return () => { clearInterval(r); clearInterval(a) }
  }, [pollRuns, pollApprovals])

  // ── Approval actions ─────────────────────────────────────────────────────────
  const approveArtifact = async (approvalId: string) => {
    const wid = localStorage.getItem('workspaceId')
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, action: 'approve', workspaceId: wid }),
    })
    setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'approved' } : a))
  }

  const rejectArtifact = async (approvalId: string, notes: string) => {
    const wid = localStorage.getItem('workspaceId')
    await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, action: 'reject', notes, workspaceId: wid }),
    })
    setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'rejected' } : a))
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || sending) return
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return

    const userMsg: ActivityMessage = {
      id: genId(), from: 'user', content: input, type: 'text', timestamp: new Date().toISOString(),
    }
    addMessage(userMsg)
    const sentInput = input
    setInput('')
    setSending(true)

    const thinkingId = genId()
    addMessage({ id: thinkingId, from: 'cmo', agentSlug: 'cmo', content: '', type: 'text', timestamp: new Date().toISOString(), streaming: true })

    try {
      const res = await fetch('/api/agents/cmo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wid, message: sentInput, action: 'chat' }),
      })
      const data = await res.json() as {
        ok: boolean
        response?: string
        error?: string
        project?: { name: string; goal: string }
        team?: Array<{ role: string; agent: string; description: string }>
        firstAction?: string
      }

      removeMessage(thinkingId)

      if (data.ok) {
        addMessage({
          id: genId(), from: 'cmo', agentSlug: 'cmo',
          content: data.response || '', type: 'text',
          timestamp: new Date().toISOString(),
        })

        if (data.project && data.team) {
          const project: Project = {
            id: genId(), name: data.project.name, goal: data.project.goal,
            team: data.team, status: 'active', createdAt: new Date().toISOString(),
            firstAction: data.firstAction,
          }
          const updated = [project, ...projects]
          setProjects(updated)
          saveProjects(updated)
          setActiveProjectId(project.id)
          addMessage({
            id: genId(), from: 'system',
            content: `── ${project.name} ──`,
            type: 'text', timestamp: new Date().toISOString(),
          })
        }
      } else {
        addMessage({
          id: genId(), from: 'cmo', agentSlug: 'cmo',
          content: `Error: ${data.error || 'Unknown error'}`, type: 'text',
          timestamp: new Date().toISOString(),
        })
      }
    } catch (e) {
      removeMessage(thinkingId)
      addMessage({
        id: genId(), from: 'cmo', agentSlug: 'cmo',
        content: `Network error: ${String(e)}`, type: 'text',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setSending(false)
    }
  }

  // ── Model change ─────────────────────────────────────────────────────────────
  const handleModelChange = (slug: string, model: string) => {
    localStorage.setItem(`ooumph_model_${slug}`, model)
    setAgentModels(prev => ({ ...prev, [slug]: model }))
  }

  // ── Add agent to project ─────────────────────────────────────────────────────
  const handleAddAgent = (slug: string) => {
    if (!activeProject) return
    const meta = AGENT_META[slug]
    const newMember = { role: meta.fullName, agent: slug, description: '' }
    const updatedTeam = [...activeProject.team, newMember]
    const updatedProjects = projects.map(p =>
      p.id === activeProject.id ? { ...p, team: updatedTeam } : p
    )
    setProjects(updatedProjects)
    saveProjects(updatedProjects)
    addMessage({
      id: genId(), from: 'system',
      content: `── ${meta.fullName} added to team ──`,
      type: 'text', timestamp: new Date().toISOString(),
    })
  }

  // ── Render message ───────────────────────────────────────────────────────────
  const renderMessage = (msg: ActivityMessage) => {
    if (msg.from === 'user') return <UserMessage key={msg.id} msg={msg} />
    if (msg.from === 'system') return <SystemMessage key={msg.id} content={msg.content} />
    if (msg.type === 'agent_dispatch') return <AgentDispatchMessage key={msg.id} msg={msg} />
    return (
      <AgentMessage
        key={msg.id}
        msg={msg}
        approvals={approvals}
        onApprove={approveArtifact}
        onReject={rejectArtifact}
      />
    )
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const breadcrumb = activeProject
    ? `Workspace / ${activeProject.name}`
    : 'Workspace'

  // ── Layout ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-theme(spacing.12)-theme(spacing.9))] bg-gray-950 overflow-hidden">
      {/* Left: Projects Sidebar */}
      <div className="w-[180px] flex-shrink-0 border-r border-gray-800 flex flex-col">
        <ProjectsSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={id => setActiveProjectId(id)}
        />
      </div>

      {/* Center: Activity Stream */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Breadcrumb */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-800 flex items-center gap-2">
          <span className="text-gray-500 text-xs">{breadcrumb}</span>
          {activeProject && (
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
              activeProject.status === 'active'
                ? 'bg-green-900/30 text-green-400 border border-green-800/40'
                : 'bg-gray-800 text-gray-500'
            }`}>
              {activeProject.status}
            </span>
          )}
        </div>

        {/* Message stream */}
        <div
          ref={streamRef}
          className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5"
        >
          {messages.map(renderMessage)}
          <div className="h-2" />
        </div>

        {/* Input */}
        <ActivityInput
          value={input}
          onChange={setInput}
          onSend={send}
          sending={sending}
        />
      </div>

      {/* Right: Team Panel */}
      <div className="w-[220px] flex-shrink-0 border-l border-gray-800">
        <TeamPanel
          project={activeProject}
          agentRuns={agentRuns}
          agentModels={agentModels}
          onModelChange={handleModelChange}
          onAddAgent={handleAddAgent}
        />
      </div>
    </div>
  )
}
