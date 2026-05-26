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
  tokens?: number
  cost?: number
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

// ─── Campaign Templates (carousel) ───────────────────────────────────────────

const CAMPAIGN_TEMPLATES = [
  {
    id: 'launch',
    icon: '🚀',
    label: 'Product Launch',
    description: 'Full go-to-market with content, ads & email',
    results: 'Avg: 2.4k reach',
    duration: '3-4 weeks',
    channels: ['✉', '📱', '🎯'],
    prompt: 'I want to run a full product launch campaign. I need strategy, content calendar, email sequences, ad campaigns, and PR outreach all working together.',
  },
  {
    id: 'leadgen',
    icon: '🎯',
    label: 'Lead Generation',
    description: 'Multi-channel lead capture + nurture sequence',
    results: 'Avg: 47 leads',
    duration: '2-4 weeks',
    channels: ['✉', '🌐', '📝'],
    prompt: 'I need to generate more leads. Help me build a complete lead generation system with a funnel, lead magnet, landing page copy, and email nurture sequence.',
  },
  {
    id: 'b2b',
    icon: '💼',
    label: 'B2B Outbound',
    description: 'LinkedIn + email outreach to ICP companies',
    results: 'Avg: 12% reply',
    duration: '2-3 weeks',
    channels: ['💼', '✉', '📞'],
    prompt: 'I want to build a B2B outbound system. I need prospect research, personalized email outreach sequences, LinkedIn messaging, and call scripts.',
  },
  {
    id: 'growth',
    icon: '📈',
    label: 'Growth Sprint',
    description: '30-day intensive growth campaign',
    results: 'Avg: +38% MoM',
    duration: '4 weeks',
    channels: ['📱', '🎯', '✉', '📝'],
    prompt: 'I want to run a 30-day intensive growth sprint. I need a multi-channel strategy that maximizes growth across all our channels.',
  },
  {
    id: 'ecom',
    icon: '🛒',
    label: 'E-commerce Sale',
    description: 'Flash sale with urgency-driven email + ads',
    results: 'Avg: 3.1x ROAS',
    duration: '1-2 weeks',
    channels: ['✉', '🎯', '📱'],
    prompt: 'I want to run a flash sale campaign. Create urgency-driven email sequences, retargeting ads, and social posts to maximize conversions.',
  },
  {
    id: 'brand',
    icon: '🏆',
    label: 'Brand Authority',
    description: 'Content-led brand positioning campaign',
    results: 'Avg: +67% trust',
    duration: '6-8 weeks',
    channels: ['📝', '📱', '🎙'],
    prompt: 'I want to build brand authority through content. Help me create a thought leadership content strategy, editorial calendar, and distribution plan.',
  },
  {
    id: 'winback',
    icon: '🔄',
    label: 'Win-back Campaign',
    description: 'Re-engage churned customers',
    results: 'Avg: 18% win-back',
    duration: '2-3 weeks',
    channels: ['✉', '📱', '🎯'],
    prompt: 'I want to win back churned customers. Create a re-engagement email sequence and retargeting campaign to bring them back.',
  },
  {
    id: 'event',
    icon: '📣',
    label: 'Event Launch',
    description: 'Pre/during/post event marketing',
    results: 'Avg: 320 registrants',
    duration: '3-5 weeks',
    channels: ['✉', '📱', '🌐', '🎯'],
    prompt: 'I want to market an upcoming event. Create a full event marketing plan including pre-event buzz, registration funnel, day-of content, and post-event follow-up.',
  },
] as const

// ─── Quick action chips ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  'Generate weekly strategy',
  'Review pending approvals',
  'Check brand performance',
  'Plan this week\'s content',
  'Analyze competitors',
  'Generate lead plan',
]

// ─── Market Pulse data ────────────────────────────────────────────────────────

const MARKET_PULSE = [
  {
    id: '1',
    icon: '🔥',
    text: "'AI Marketing Tools' trending +340% this week",
    time: '2h ago',
    type: 'trend',
  },
  {
    id: '2',
    icon: '⚠',
    text: 'Competitor launched new pricing tier',
    time: '4h ago',
    type: 'competitor',
  },
  {
    id: '3',
    icon: '💡',
    text: 'LinkedIn posts getting 2x engagement this week',
    time: '6h ago',
    type: 'insight',
  },
]

// ─── Mock pending approvals ───────────────────────────────────────────────────

const MOCK_APPROVALS = [
  { id: 'a1', type: 'Blog Post', preview: "'Top 10 AI Marketing Tools in 2025' — 1,200 words, SEO optimized" },
  { id: 'a2', type: 'Email', preview: 'Weekly newsletter: Subject "Your growth report is ready"' },
  { id: 'a3', type: 'Ad Copy', preview: 'Facebook ad: "Transform your marketing with AI..."' },
]

// ─── Notification data ────────────────────────────────────────────────────────

const NOTIFICATIONS = [
  { id: 'n1', icon: '🔔', text: '3 approvals waiting', link: '/approvals', unread: true },
  { id: 'n2', icon: '⚠', text: 'Brand Monitor: Negative spike detected', link: '/dashboard/brand', unread: true },
  { id: 'n3', icon: '✅', text: "Blog post 'Top 10 Tools' was published", link: '/dashboard/activity', unread: true },
  { id: 'n4', icon: '🤖', text: 'Strategy update ready for review', link: '/dashboard/strategy', unread: false },
]

// ─── Agent status data ─────────────────────────────────────────────────────────

const AGENT_STATUS = [
  { id: 'strategy', name: 'Strategy', status: 'running', color: 'bg-green-500' },
  { id: 'content', name: 'Content', status: 'running', color: 'bg-green-500' },
  { id: 'brand', name: 'Brand Monitor', status: 'idle', color: 'bg-gray-600' },
  { id: 'research', name: 'Research', status: 'running', color: 'bg-green-500' },
  { id: 'leadgen', name: 'Lead Gen', status: 'idle', color: 'bg-gray-600' },
  { id: 'publishing', name: 'Publishing', status: 'running', color: 'bg-green-500' },
]

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

// Render CMO message text with basic markdown-like formatting
function renderCMOText(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, i) => {
    // Numbered list: "1. ..."
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (numberedMatch) {
      elements.push(
        <li key={i} className="ml-4 list-decimal text-gray-100 leading-relaxed">
          {renderInline(numberedMatch[2])}
        </li>
      )
      return
    }
    // Bullet list: "- ..." or "• ..."
    const bulletMatch = line.match(/^[-•]\s+(.+)$/)
    if (bulletMatch) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-gray-100 leading-relaxed">
          {renderInline(bulletMatch[1])}
        </li>
      )
      return
    }
    // Blank line → spacer
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
      return
    }
    elements.push(<p key={i} className="text-gray-100 leading-relaxed">{renderInline(line)}</p>)
  })

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    return part
  })
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

  // Build action items
  const actionItems = [
    `Launch ${agentLabel(firstAction)} agent`,
    'Assemble full marketing team',
    'Generate initial strategy brief',
    'Queue content calendar',
  ]

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
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-indigo-400 bg-indigo-950/50 px-1.5 py-0.5 rounded">
            Est. impact: High
          </span>
        </div>
      </div>

      {/* Action items */}
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Action plan</p>
        <ol className="space-y-1">
          {actionItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
              <span className="w-4 h-4 rounded-full bg-indigo-900 text-indigo-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
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
            'Deploy all agents →'
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
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)

  function handleCopy() {
    void navigator.clipboard.writeText(msg.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex gap-3 msg-fade-in ${isCmo ? 'justify-start' : 'justify-end flex-row-reverse'}`}
      style={{ animation: 'msgFadeIn 0.25s ease-out both' }}
    >
      {isCmo ? <CMOAvatar /> : <UserAvatar letter={userLetter} />}
      <div className={`max-w-[78%] ${isCmo ? '' : ''}`}>
        <div
          className={`relative group rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isCmo
              ? 'bg-gray-800 text-gray-100 rounded-tl-sm'
              : 'bg-indigo-600 text-white rounded-tr-sm'
          }`}
        >
          {isCmo ? renderCMOText(msg.text) : msg.text}

          {/* Copy button on hover (CMO only) */}
          {isCmo && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs"
              title="Copy"
            >
              {copied ? '✓' : '⎘'}
            </button>
          )}
        </div>

        {msg.proposal && (
          <ProposalCard
            proposal={msg.proposal}
            onApprove={(firstAction) => onApprove(firstAction, msg.id)}
            onRephrase={onRephrase}
            executing={executing && executingMsgId === msg.id}
          />
        )}

        {/* Footer: timestamp + feedback (CMO) + token info */}
        <div className={`flex items-center gap-2 mt-1 px-1 ${isCmo ? '' : 'justify-end'}`}>
          <p className="text-gray-700 text-xs">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          {isCmo && msg.tokens && (
            <p className="text-gray-700 text-xs">
              ~{msg.tokens} tokens · ${msg.cost?.toFixed(4) ?? '0.0000'}
            </p>
          )}
          {isCmo && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setFeedback('up')}
                className={`text-xs px-1 rounded transition-colors ${feedback === 'up' ? 'text-green-400' : 'text-gray-700 hover:text-gray-500'}`}
              >
                👍
              </button>
              <button
                onClick={() => setFeedback('down')}
                className={`text-xs px-1 rounded transition-colors ${feedback === 'down' ? 'text-red-400' : 'text-gray-700 hover:text-gray-500'}`}
              >
                👎
              </button>
            </div>
          )}
        </div>
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
        <div key={run.id} className="flex items-center gap-2.5 py-1.5">
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

// ─── Campaign Template Carousel ───────────────────────────────────────────────

function CampaignCarousel({ onDeploy }: { onDeploy: (prompt: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border-b border-gray-800 pb-3">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Campaign templates</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
          >
            ‹
          </button>
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {CAMPAIGN_TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="min-w-[190px] bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl p-3 flex-shrink-0 flex flex-col gap-2 transition-all group"
          >
            <div className="flex items-start justify-between">
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[10px] text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">{t.duration}</span>
            </div>
            <div>
              <p className="text-white text-xs font-semibold group-hover:text-indigo-300 transition-colors leading-snug">{t.label}</p>
              <p className="text-gray-500 text-[11px] mt-0.5 leading-snug">{t.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-green-400 bg-green-950/60 border border-green-900/50 rounded px-1.5 py-0.5">{t.results}</span>
            </div>
            <div className="flex items-center gap-1">
              {t.channels.map((ch, i) => (
                <span key={i} className="text-sm leading-none">{ch}</span>
              ))}
            </div>
            <button
              onClick={() => onDeploy(t.prompt)}
              className="mt-auto w-full text-center text-xs text-indigo-400 hover:text-white bg-indigo-950/50 hover:bg-indigo-600 border border-indigo-900 hover:border-indigo-600 rounded-lg py-1.5 transition-all font-medium"
            >
              Deploy →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Workspace Snapshot ───────────────────────────────────────────────────────

function WorkspaceSnapshot({
  businessName,
  stats,
  onExpand,
}: {
  businessName: string
  stats: Stats
  onExpand: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-gray-800 flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-500 hover:text-gray-400 hover:bg-gray-900/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span>📊</span>
          <span className="font-medium">Workspace Snapshot</span>
        </span>
        <span className="text-gray-700">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2" style={{ animation: 'msgFadeIn 0.15s ease-out both' }}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-600">Business</p>
              <p className="text-gray-200 font-medium truncate">{businessName || 'Ooumph Workspace'}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-600">Active campaigns</p>
              <p className="text-gray-200 font-medium">2</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-600">Top channel</p>
              <p className="text-gray-200 font-medium">Email (48%)</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-600">Pending items</p>
              <p className="text-yellow-400 font-medium">{stats.pendingApprovals}</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
            <p className="text-gray-600">Last strategy</p>
            <p className="text-gray-300">Growth Sprint brief · 3 days ago</p>
          </div>
          <button
            onClick={onExpand}
            className="w-full text-center text-xs text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 py-1 transition-colors"
          >
            <span>📤</span>
            <span>Expand CMO Context</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CMO Context Modal ─────────────────────────────────────────────────────────

function CMOContextModal({
  businessName,
  stats,
  onClose,
}: {
  businessName: string
  stats: Stats
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <p className="text-white font-semibold text-sm">CMO Full Context</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Workspace</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p><span className="text-gray-600">Business:</span> {businessName || 'Ooumph Workspace'}</p>
              <p><span className="text-gray-600">Industry:</span> SaaS / Marketing Technology</p>
              <p><span className="text-gray-600">Active campaigns:</span> 2</p>
              <p><span className="text-gray-600">Target ICP:</span> SMB Marketing Teams, Agency Owners</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Knowledge Nodes</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p><span className="text-gray-600">Brand guidelines:</span> Loaded</p>
              <p><span className="text-gray-600">Product context:</span> 24 documents</p>
              <p><span className="text-gray-600">Past campaigns:</span> 8 reference campaigns</p>
              <p><span className="text-gray-600">Competitor data:</span> 5 tracked competitors</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Performance</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p><span className="text-gray-600">Brand Voice Score:</span> 91%</p>
              <p><span className="text-gray-600">Artifacts generated:</span> {stats.artifacts}</p>
              <p><span className="text-gray-600">Leads this week:</span> 23</p>
              <p><span className="text-gray-600">Pending approvals:</span> {stats.pendingApprovals}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Current Strategy Focus</p>
            <p className="text-sm text-gray-300">Growth Sprint — 30-day intensive targeting SMB decision-makers via LinkedIn + email. Primary KPI: 50 qualified leads by end of month.</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Notification Dropdown ─────────────────────────────────────────────────────

function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length

  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <p className="text-sm font-semibold text-white">Notifications</p>
        {unreadCount > 0 && (
          <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-medium">{unreadCount} new</span>
        )}
      </div>
      <div className="divide-y divide-gray-800">
        {NOTIFICATIONS.map((n) => (
          <button
            key={n.id}
            onClick={() => { onClose(); router.push(n.link) }}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors ${n.unread ? 'bg-gray-900' : 'opacity-70'}`}
          >
            <span className="text-base flex-shrink-0 mt-0.5">{n.icon}</span>
            <p className={`text-xs flex-1 leading-snug ${n.unread ? 'text-gray-200' : 'text-gray-500'}`}>{n.text}</p>
            {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1" />}
          </button>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-gray-800">
        <button onClick={onClose} className="text-xs text-gray-600 hover:text-gray-400 transition-colors w-full text-center">
          Mark all as read
        </button>
      </div>
    </div>
  )
}

// ─── Attachment Menu ───────────────────────────────────────────────────────────

function AttachmentMenu({ onClose }: { onClose: () => void }) {
  const options = [
    { icon: '📄', label: 'Upload Document' },
    { icon: '🔗', label: 'Share URL' },
    { icon: '📝', label: 'Add Context' },
  ]
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-gray-900 border border-gray-800 rounded-xl shadow-xl overflow-hidden z-20 w-44">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={onClose}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>{o.icon}</span>
          <span>{o.label}</span>
        </button>
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

const COST_TODAY = 2.47

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
  const [stats, setStats] = useState<Stats>({ artifacts: 14, pendingApprovals: 3, learningNotes: 24, completedTypes: [] })

  // UI state
  const [showNotifications, setShowNotifications] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  // Scroll ref
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

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

  // ── Stats ─────────────────────────────────────────────────────────────────────

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

  // ── Close notification dropdown on outside click ──────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [showNotifications])

  // ── Textarea auto-grow ────────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`
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

      // Estimate tokens/cost (rough approximation)
      const tokenEstimate = Math.round(data.response.split(/\s+/).length * 1.35)
      const costEstimate = tokenEstimate * 0.000003

      const cmoMsg: Message = {
        id: uid(),
        role: 'cmo',
        text: data.response,
        timestamp: new Date(),
        tokens: tokenEstimate,
        cost: costEstimate,
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

  // ── Voice input ───────────────────────────────────────────────────────────────

  function toggleRecording() {
    setIsRecording((prev) => !prev)
    // Real voice logic would go here
  }

  // ── Cost badge color ──────────────────────────────────────────────────────────

  function costBadgeClass(cost: number) {
    if (cost < 5) return 'text-green-400 bg-green-950/60 border-green-900/50'
    if (cost <= 10) return 'text-yellow-400 bg-yellow-950/60 border-yellow-900/50'
    return 'text-red-400 bg-red-950/60 border-red-900/50'
  }

  const showTemplates = messages.length === 1 && !loading
  const userLetter = (businessName || 'U')[0].toUpperCase()
  const unreadNotifCount = NOTIFICATIONS.filter((n) => n.unread).length

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
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Context Modal ────────────────────────────────────────────────────── */}
      {showContextModal && (
        <CMOContextModal
          businessName={businessName}
          stats={stats}
          onClose={() => setShowContextModal(false)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Global Header ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-gray-800 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CMOAvatar />
            <div>
              <p className="text-white text-sm font-semibold leading-tight">AI CMO Command Center</p>
              <p className="text-gray-600 text-xs">Chief Marketing Officer · Always available</p>
            </div>
          </div>

          {/* Cost badge */}
          <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2.5 py-1 ${costBadgeClass(COST_TODAY)}`}>
            💰 Cost today: ${COST_TODAY.toFixed(2)}
          </span>

          {/* Health score */}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-900 border border-gray-800 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Health: 87/100
          </span>

          <div className="ml-auto flex items-center gap-3">
            {/* Online indicator */}
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-green-500 text-xs">Online</span>
            </div>

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors text-gray-400 hover:text-white"
              >
                🔔
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {unreadNotifCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <NotificationDropdown onClose={() => setShowNotifications(false)} />
              )}
            </div>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Chat panel ──────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">

            {/* Campaign template carousel */}
            <CampaignCarousel onDeploy={handleTemplateSelect} />

            {/* Context awareness bar */}
            <div className="flex-shrink-0 px-4 py-2 bg-gray-900/70 border-b border-gray-800 flex items-center gap-3 overflow-x-auto hide-scrollbar">
              <div className="flex items-center gap-3 text-xs text-gray-500 whitespace-nowrap">
                <span>📚 24 knowledge nodes</span>
                <span className="text-gray-700">·</span>
                <span>🎯 Active: Growth Sprint</span>
                <span className="text-gray-700">·</span>
                <span>📊 Brand Score: 91%</span>
                <span className="text-gray-700">·</span>
                <span className="text-indigo-400">6 agents ready</span>
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

            {/* Templates (shown only at start) */}
            {showTemplates && (
              <div className="px-4 pb-3">
                <p className="text-xs text-gray-600 uppercase tracking-wider font-medium mb-2 text-center">Or pick a quick start</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'launch', icon: '🚀', label: 'Product Launch', prompt: 'I want to run a full product launch campaign. I need strategy, content calendar, email sequences, ad campaigns, and PR outreach all working together.' },
                    { id: 'leadgen', icon: '🎯', label: 'Lead Gen Sprint', prompt: 'I need to generate more leads. Help me build a complete lead generation system with a funnel, lead magnet, landing page copy, and email nurture sequence.' },
                    { id: 'b2b', icon: '💼', label: 'B2B Outbound', prompt: 'I want to build a B2B outbound system. I need prospect research, personalized email outreach sequences, LinkedIn messaging, and call scripts.' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTemplateSelect(t.prompt)}
                      className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-700 rounded-xl p-3 text-left transition-all group"
                    >
                      <span className="text-xl block mb-1.5">{t.icon}</span>
                      <p className="text-white text-xs font-medium group-hover:text-indigo-300 transition-colors">{t.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick action chips */}
            <div className="flex-shrink-0 px-4 pt-2 pb-1">
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => void sendMessage(action)}
                    disabled={loading || executing}
                    className="flex-shrink-0 text-xs text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-700 rounded-full px-3 py-1.5 transition-all disabled:opacity-50"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {/* Input bar */}
            <div className="px-4 pb-3 flex-shrink-0 border-t border-gray-800 pt-2">
              <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 focus-within:border-indigo-600 rounded-xl px-3 py-2 transition-colors relative">
                {/* Attachment menu */}
                <div className="relative">
                  {showAttachMenu && <AttachmentMenu onClose={() => setShowAttachMenu(false)} />}
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors text-base mb-0.5"
                    title="Attach"
                  >
                    📎
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={loading || executing}
                  placeholder={isRecording ? '🎤 Listening...' : 'Tell me what you need...'}
                  rows={1}
                  className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm resize-none outline-none leading-relaxed disabled:opacity-50"
                  style={{ maxHeight: '112px' }}
                />

                {/* Voice input */}
                <button
                  onClick={toggleRecording}
                  className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-base transition-colors mb-0.5 ${isRecording ? 'text-red-400 animate-pulse' : 'text-gray-600 hover:text-gray-400'}`}
                  title={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  🎤
                </button>

                {/* Send */}
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

            {/* Workspace snapshot */}
            <WorkspaceSnapshot
              businessName={businessName}
              stats={stats}
              onExpand={() => setShowContextModal(true)}
            />
          </div>

          {/* ── Right: Stats + Agents + Approvals + Market Pulse ─────────────── */}
          <div className="hidden lg:flex w-[280px] xl:w-[300px] flex-col flex-shrink-0 overflow-y-auto">

            {/* Quick Stats */}
            <div className="p-4 border-b border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Quick Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-[11px] mb-1">Artifacts</p>
                  <p className="text-white text-xl font-bold">{stats.artifacts}</p>
                  <p className="text-gray-700 text-[11px]">generated</p>
                </div>
                <Link
                  href="/dashboard/approvals"
                  className={`bg-gray-900 border rounded-xl p-3 transition-colors hover:border-yellow-700 ${stats.pendingApprovals > 0 ? 'border-yellow-800' : 'border-gray-800'}`}
                >
                  <p className="text-gray-500 text-[11px] mb-1">Approvals</p>
                  <p className={`text-xl font-bold ${stats.pendingApprovals > 0 ? 'text-yellow-400' : 'text-white'}`}>
                    {stats.pendingApprovals}
                  </p>
                  <p className="text-gray-700 text-[11px]">pending</p>
                </Link>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-[11px] mb-1">Campaigns</p>
                  <p className="text-white text-xl font-bold">2</p>
                  <p className="text-gray-700 text-[11px]">active</p>
                </div>
                <div className={`bg-gray-900 border rounded-xl p-3 ${costBadgeClass(COST_TODAY).includes('green') ? 'border-green-900/50' : 'border-gray-800'}`}>
                  <p className="text-gray-500 text-[11px] mb-1">AI Cost</p>
                  <p className={`text-xl font-bold ${COST_TODAY < 5 ? 'text-green-400' : COST_TODAY <= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                    ${COST_TODAY.toFixed(2)}
                  </p>
                  <p className="text-gray-700 text-[11px]">today</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-[11px] mb-1">Brand Score</p>
                  <p className="text-white text-xl font-bold">91%</p>
                  <p className="text-gray-700 text-[11px]">voice match</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-[11px] mb-1">Leads</p>
                  <p className="text-white text-xl font-bold">23</p>
                  <p className="text-gray-700 text-[11px]">this week</p>
                </div>
              </div>
            </div>

            {/* Agent Status */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Agent Status</p>
                <Link href="/agents" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  All 6 →
                </Link>
              </div>
              <div className="space-y-1.5">
                {AGENT_STATUS.map((agent) => (
                  <Link
                    key={agent.id}
                    href="/agents"
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-900 transition-colors group"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.color} ${agent.status === 'running' ? 'animate-pulse' : ''}`} />
                    <span className="flex-1 text-gray-300 text-xs group-hover:text-white transition-colors">{agent.name}</span>
                    <span className={`text-[10px] font-medium ${agent.status === 'running' ? 'text-green-400' : 'text-gray-600'}`}>
                      {agent.status === 'running' ? 'Running' : 'Idle'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Pending Approvals */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Pending Approvals</p>
                <Link href="/dashboard/approvals" className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                  View All ({stats.pendingApprovals}) →
                </Link>
              </div>
              {MOCK_APPROVALS.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-2">No pending approvals</p>
              ) : (
                <div className="space-y-2">
                  {MOCK_APPROVALS.map((a) => (
                    <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-medium text-indigo-400 bg-indigo-950/60 border border-indigo-900/50 rounded px-1.5 py-0.5">
                          {a.type}
                        </span>
                      </div>
                      <p className="text-gray-400 text-[11px] leading-snug mb-2">{a.preview}</p>
                      <div className="flex items-center gap-1.5">
                        <button className="flex-1 text-center text-[10px] font-medium text-white bg-green-700 hover:bg-green-600 rounded py-1 transition-colors">
                          Approve
                        </button>
                        <Link
                          href="/dashboard/approvals"
                          className="flex-1 text-center text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded py-1 transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Market Pulse */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Market Pulse</p>
                <Link href="/dashboard/research" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                  Feed →
                </Link>
              </div>
              <div className="space-y-2">
                {MARKET_PULSE.map((pulse) => (
                  <div key={pulse.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-base leading-none flex-shrink-0 mt-0.5">{pulse.icon}</span>
                      <p className="text-gray-300 text-[11px] leading-snug flex-1">{pulse.text}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700 text-[10px]">{pulse.time}</span>
                      <button
                        onClick={() => void sendMessage(`Tell me more about this insight: "${pulse.text}"`)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Feed to Chat →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity feed */}
            <div className="flex-1 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Agent Activity</p>
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
      </div>
    </>
  )
}
