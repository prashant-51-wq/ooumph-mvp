'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  role: string
  agent: string
  description: string
}

interface ProjectProposal {
  name: string
  goal: string
  estimatedMinutes: number
  estimatedCostUsd: number
}

interface Message {
  id: string
  role: 'cmo' | 'user'
  text: string
  proposal?: {
    project: ProjectProposal
    team: TeamMember[]
    firstAction: string
  }
  timestamp: Date
}

interface AgentRun {
  id: string
  agent_name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  error_message?: string
}

interface Stats {
  artifacts: number
  pendingApprovals: number
  learningNotes: number
  completedTypes: string[]
}

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'launch',
    icon: '🚀',
    label: 'Product Launch',
    description: 'Strategy, content, email, ads, PR — full launch plan in one sprint',
    prompt: 'I want to run a full product launch campaign. I need strategy, content calendar, email sequences, ad campaigns, and PR outreach all working together.',
  },
  {
    id: 'leadgen',
    icon: '🎯',
    label: 'Lead Gen Sprint',
    description: 'Funnel, lead magnet, landing page, email nurture, qualification',
    prompt: 'I need to generate more leads. Help me build a complete lead generation system with a funnel, lead magnet, landing page copy, and email nurture sequence.',
  },
  {
    id: 'b2b',
    icon: '💼',
    label: 'B2B Outbound',
    description: 'Prospect research, outreach sequences, LinkedIn, call scripts',
    prompt: 'I want to build a B2B outbound system. I need prospect research, personalized email outreach sequences, LinkedIn messaging, and call scripts.',
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function agentLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-indigo-400 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  pending: 'bg-gray-600',
}

const STATUS_TEXT: Record<string, string> = {
  running: 'text-indigo-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-gray-500',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CMOAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      AI
    </div>
  )
}

function UserAvatar({ letter }: { letter: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {letter}
    </div>
  )
}

function ProposalCard({
  proposal,
  onApprove,
  onRephrase,
  executing,
}: {
  proposal: { project: ProjectProposal; team: TeamMember[]; firstAction: string }
  onApprove: (firstAction: string) => void
  onRephrase: () => void
  executing: boolean
}) {
  const { project, team, firstAction } = proposal
  return (
    <div className="mt-3 bg-gray-900 border border-indigo-800 rounded-xl overflow-hidden">
      {/* Project header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-white font-semibold text-sm">{project.name}</p>
        <p className="text-gray-400 text-xs mt-0.5">{project.goal}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-500">
            <span className="text-gray-300">~{project.estimatedMinutes} min</span> to complete
          </span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">
            est. <span className="text-gray-300">${project.estimatedCostUsd.toFixed(2)}</span> cost
          </span>
        </div>
      </div>

      {/* Team */}
      <div className="px-4 py-3 border-b border-gray-800 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Team assembled</p>
        {team.map((member) => (
          <div key={member.agent} className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
            <div>
              <span className="text-gray-200 text-sm font-medium">{member.role}</span>
              <span className="text-gray-600 text-xs"> · {member.agent}</span>
              <p className="text-gray-500 text-xs">{member.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2">
        <button
          onClick={() => onApprove(firstAction)}
          disabled={executing}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {executing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            'Approve team & start'
          )}
        </button>
        <button
          onClick={onRephrase}
          disabled={executing}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
        >
          Different approach
        </button>
      </div>
    </div>
  )
}

function MessageBubble({
  msg,
  userLetter,
  onApprove,
  onRephrase,
  executing,
  executingMsgId,
}: {
  msg: Message
  userLetter: string
  onApprove: (firstAction: string, msgId: string) => void
  onRephrase: () => void
  executing: boolean
  executingMsgId: string | null
}) {
  const isCmo = msg.role === 'cmo'

  return (
    <div
      className={`flex gap-3 msg-fade-in ${isCmo ? 'justify-start' : 'justify-end flex-row-reverse'}`}
      style={{ animation: 'msgFadeIn 0.25s ease-out both' }}
    >
      {isCmo ? <CMOAvatar /> : <UserAvatar letter={userLetter} />}
      <div className={`max-w-[75%] ${isCmo ? '' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isCmo
              ? 'bg-gray-800 text-gray-100 rounded-tl-sm'
              : 'bg-indigo-600 text-white rounded-tr-sm'
          }`}
        >
          {msg.text}
        </div>
        {msg.proposal && (
          <ProposalCard
            proposal={msg.proposal}
            onApprove={(firstAction) => onApprove(firstAction, msg.id)}
            onRephrase={onRephrase}
            executing={executing && executingMsgId === msg.id}
          />
        )}
        <p className="text-gray-700 text-xs mt-1 px-1">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start" style={{ animation: 'msgFadeIn 0.2s ease-out both' }}>
      <CMOAvatar />
      <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full" style={{ animation: 'typingDot 1.2s ease-in-out infinite 0ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full" style={{ animation: 'typingDot 1.2s ease-in-out infinite 200ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full" style={{ animation: 'typingDot 1.2s ease-in-out infinite 400ms' }} />
      </div>
    </div>
  )
}

function TemplatePicker({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="px-4 pb-4">
      <p className="text-xs text-gray-600 uppercase tracking-wider font-medium mb-3 text-center">Quick start templates</p>
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.prompt)}
            className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-700 rounded-xl p-3 text-left transition-all group"
          >
            <span className="text-xl block mb-1.5">{t.icon}</span>
            <p className="text-white text-xs font-medium group-hover:text-indigo-300 transition-colors">{t.label}</p>
            <p className="text-gray-600 text-xs mt-0.5 leading-snug">{t.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function ActivityFeed({ runs, loading }: { runs: AgentRun[]; loading: boolean }) {
  if (loading && runs.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-2 h-2 rounded-full bg-gray-800 flex-shrink-0" />
            <div className="flex-1 h-3 bg-gray-800 rounded animate-pulse" />
            <div className="w-12 h-3 bg-gray-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <p className="text-gray-600 text-xs py-4 text-center">
        No agent runs yet — start a project above
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-2.5 py-1.5 group">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[run.status] || 'bg-gray-600'}`} />
          <span className="flex-1 text-gray-300 text-xs truncate">{agentLabel(run.agent_name)}</span>
          <span className={`text-xs capitalize flex-shrink-0 ${STATUS_TEXT[run.status] || 'text-gray-500'}`}>
            {run.status}
          </span>
          <span className="text-gray-700 text-xs flex-shrink-0">{timeAgo(run.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const GREETING: Message = {
  id: 'greeting',
  role: 'cmo',
  text: "Hi! I'm your AI CMO. Tell me what you want to achieve — I'll assemble the right team and get to work. You can also pick a template below to get started fast.",
  timestamp: new Date(),
}

export default function DashboardPage() {
  const router = useRouter()

  // Workspace state
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')

  // Chat state
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executingMsgId, setExecutingMsgId] = useState<string | null>(null)

  // Right panel state
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ artifacts: 0, pendingApprovals: 0, learningNotes: 0, completedTypes: [] })

  // Scroll ref
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      let wid = localStorage.getItem('workspaceId')
      if (!wid) {
        try {
          const res = await fetch('/api/auth/me')
          const data = await res.json() as { user?: { workspaceId?: string; workspaceName?: string; name?: string } }
          if (data.user?.workspaceId) {
            wid = data.user.workspaceId
            localStorage.setItem('workspaceId', wid!)
            if (data.user.workspaceName) localStorage.setItem('businessName', data.user.workspaceName)
            if (data.user.name) localStorage.setItem('userName', data.user.name)
          }
        } catch { /* ignore */ }
      }
      if (!wid) {
        router.push('/dashboard/onboarding')
        return
      }
      setWorkspaceId(wid)
      setBusinessName(localStorage.getItem('businessName') || '')
    }
    init()
  }, [router])

  // ── Stats ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!workspaceId) return
    fetch(`/api/stats?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((s: Stats) => setStats(s))
      .catch(() => {})
  }, [workspaceId])

  // ── Activity feed polling ─────────────────────────────────────────────────────

  const loadRuns = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/agent-runs?workspaceId=${workspaceId}&limit=10`)
      const data: AgentRun[] = await res.json()
      setRuns(data)
      setRunsLoading(false)
      // Refresh stats when run state changes
      if (data.some((r) => r.status === 'completed')) {
        fetch(`/api/stats?workspaceId=${workspaceId}`)
          .then((r) => r.json())
          .then((s: Stats) => setStats(s))
          .catch(() => {})
      }
    } catch {
      setRunsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    loadRuns()
    const interval = setInterval(loadRuns, 5000)
    return () => clearInterval(interval)
  }, [workspaceId, loadRuns])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Textarea auto-grow ────────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 112)}px` // max ~4 rows
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const messageText = (text ?? input).trim()
    if (!messageText || loading || !workspaceId) return

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)

    try {
      const res = await fetch('/api/agents/cmo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, message: messageText, action: 'chat' }),
      })

      const data = await res.json() as {
        ok: boolean
        response?: string
        project?: ProjectProposal
        team?: TeamMember[]
        firstAction?: string
        error?: string
      }

      if (!data.ok || !data.response) {
        const errMsg: Message = {
          id: uid(),
          role: 'cmo',
          text: data.error
            ? `Something went wrong: ${data.error}`
            : "I couldn't process that request. Could you try rephrasing?",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
        return
      }

      const cmoMsg: Message = {
        id: uid(),
        role: 'cmo',
        text: data.response,
        timestamp: new Date(),
        ...(data.team && data.project
          ? {
              proposal: {
                project: data.project,
                team: data.team,
                firstAction: data.firstAction ?? 'strategy',
              },
            }
          : {}),
      }

      setMessages((prev) => [...prev, cmoMsg])
    } catch {
      const errMsg: Message = {
        id: uid(),
        role: 'cmo',
        text: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  // ── Approve team ──────────────────────────────────────────────────────────────

  async function approveTeam(firstAction: string, msgId: string) {
    if (!workspaceId || executing) return
    setExecuting(true)
    setExecutingMsgId(msgId)

    // Grab proposal data from the message so we can seed the Activity Window
    const approvedMsg = messages.find((m) => m.id === msgId)
    const proposal = approvedMsg?.proposal

    try {
      const res = await fetch('/api/agents/cmo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, message: '', action: 'execute', firstAction }),
      })

      const data = await res.json() as { ok: boolean; response?: string; projectId?: string; error?: string }

      if (data.ok) {
        // ── Seed the Activity Window with a localStorage project record ──────────
        if (proposal) {
          try {
            const projectId = uid()
            const newProject = {
              id: projectId,
              name: proposal.project.name,
              goal: proposal.project.goal,
              team: proposal.team,
              status: 'active',
              createdAt: new Date().toISOString(),
              firstAction: proposal.firstAction,
            }
            const existing = JSON.parse(localStorage.getItem('ooumph_projects_v1') || '[]') as unknown[]
            localStorage.setItem('ooumph_projects_v1', JSON.stringify([newProject, ...existing]))
          } catch { /* storage errors are non-fatal */ }
        }

        const confirmMsg: Message = {
          id: uid(),
          role: 'cmo',
          text: `Team approved! 🚀 Your ${agentLabel(firstAction)} agent is now running. Opening the Workspace in a moment...`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, confirmMsg])
        loadRuns()

        // Navigate to the Activity Window after a brief moment so the user sees the confirmation
        setTimeout(() => router.push('/dashboard/activity'), 1400)
      } else {
        const errMsg: Message = {
          id: uid(),
          role: 'cmo',
          text: `I had trouble starting the team: ${data.error ?? 'Unknown error'}. You can try again or start from the ${agentLabel(firstAction)} page directly.`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
      }
    } catch {
      const errMsg: Message = {
        id: uid(),
        role: 'cmo',
        text: "I couldn't kick off the agents right now. Try visiting the Strategy page to start manually.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setExecuting(false)
      setExecutingMsgId(null)
    }
  }

  // ── Rephrase ──────────────────────────────────────────────────────────────────

  function handleRephrase() {
    setMessages([GREETING])
    setInput('')
    textareaRef.current?.focus()
  }

  // ── Key handler ───────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  // ── Template pick ─────────────────────────────────────────────────────────────

  function handleTemplateSelect(prompt: string) {
    void sendMessage(prompt)
  }

  const showTemplates = messages.length === 1 && !loading
  const userLetter = (businessName || 'U')[0].toUpperCase()

  return (
    <>
      {/* Inject keyframe animations globally for this page */}
      <style>{`
        @keyframes msgFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      <div className="flex h-full overflow-hidden">
        {/* ── Left: Chat panel ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
          {/* Chat header */}
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
            <CMOAvatar />
            <div>
              <p className="text-white text-sm font-semibold">AI CMO</p>
              <p className="text-gray-500 text-xs">Chief Marketing Officer · Always available</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-green-500 text-xs">Online</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                userLetter={userLetter}
                onApprove={approveTeam}
                onRephrase={handleRephrase}
                executing={executing}
                executingMsgId={executingMsgId}
              />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Templates */}
          {showTemplates && <TemplatePicker onSelect={handleTemplateSelect} />}

          {/* Input bar */}
          <div className="px-4 pb-4 flex-shrink-0 border-t border-gray-800 pt-3">
            <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 focus-within:border-indigo-600 rounded-xl px-3 py-2 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={loading || executing}
                placeholder="Tell me what you need..."
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm resize-none outline-none leading-relaxed disabled:opacity-50"
                style={{ maxHeight: '112px' }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading || executing}
                className="flex-shrink-0 w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors mb-0.5"
                aria-label="Send"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-gray-700 text-xs mt-1.5 text-center">
              Enter to send · Shift+Enter for new line · All actions require your approval
            </p>
          </div>
        </div>

        {/* ── Right: Stats + Activity ──────────────────────────────────────────── */}
        <div className="hidden lg:flex w-72 flex-col flex-shrink-0 overflow-y-auto">
          {/* Quick stats */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Quick stats</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-gray-500 text-xs mb-1">Artifacts</p>
                <p className="text-white text-xl font-bold">{stats.artifacts}</p>
                <p className="text-gray-700 text-xs">generated</p>
              </div>
              <div
                className={`bg-gray-900 border rounded-xl p-3 ${
                  stats.pendingApprovals > 0 ? 'border-yellow-800' : 'border-gray-800'
                }`}
              >
                <p className="text-gray-500 text-xs mb-1">Pending</p>
                <p className={`text-xl font-bold ${stats.pendingApprovals > 0 ? 'text-yellow-400' : 'text-white'}`}>
                  {stats.pendingApprovals}
                </p>
                <p className="text-gray-700 text-xs">approvals</p>
              </div>
            </div>
            {stats.pendingApprovals > 0 && (
              <Link
                href="/dashboard/approvals"
                className="flex items-center justify-between w-full text-xs text-yellow-400 hover:text-yellow-300 bg-yellow-950/50 hover:bg-yellow-950 border border-yellow-900 rounded-lg px-3 py-2 transition-colors"
              >
                <span>{stats.pendingApprovals} item{stats.pendingApprovals !== 1 ? 's' : ''} awaiting review</span>
                <span>→</span>
              </Link>
            )}
          </div>

          {/* Activity feed */}
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Agent activity</p>
              {runs.some((r) => r.status === 'running') && (
                <span className="text-xs text-indigo-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <ActivityFeed runs={runs} loading={runsLoading} />
            {runs.length > 0 && (
              <Link
                href="/dashboard/activity"
                className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Open Workspace →
              </Link>
            )}
          </div>

          {/* Governance notice */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-start gap-2 text-xs text-indigo-400">
              <span className="text-base flex-shrink-0 leading-none">🔒</span>
              <p className="text-indigo-500">Human governance active — no content goes out without your sign-off.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
