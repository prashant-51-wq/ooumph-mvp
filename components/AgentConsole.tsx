/**
 * components/AgentConsole.tsx
 *
 * The live "what is the AI actually doing right now" feed. Subscribes to
 * AgentEvent[] from `useAgentStream` and renders them as a terminal-style
 * log with smart auto-scroll.
 *
 * Two display modes:
 *   mode="rail"     — persistent right-side rail, ~320px wide,
 *                     collapsible to a 40px strip. Used on the CMO page.
 *   mode="floating" — fixed bottom-right popover, auto-opens when a stream
 *                     starts, auto-collapses 30s after the stream ends.
 *                     Used on Strategy / other workflow pages.
 *
 * ─── Smart auto-scroll ──────────────────────────────────────────────────
 *
 *   The classic UX failure of a streaming log is yanking the user's
 *   viewport down while they're trying to read an earlier line. We solve
 *   this with a "pinned-to-bottom" flag:
 *
 *   - On mount: pinned = true (start at bottom)
 *   - User scrolls within 50px of bottom: pinned = true (re-snap)
 *   - User scrolls away from bottom: pinned = false (release)
 *   - New event arrives:
 *       if pinned    → scroll to bottom (rAF-throttled so a flood of
 *                      token events doesn't thrash the layout)
 *       if not pinned → increment "↓ N new" badge, leave scroll alone
 *   - User clicks the badge → smooth-scroll to bottom + re-pin
 */

'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent } from '@/lib/agent-stream'
import type { StreamStatus } from '@/lib/use-agent-stream'

// ─── Public props ─────────────────────────────────────────────────────────

export interface AgentConsoleProps {
  /** The live event stream from useAgentStream. */
  events: AgentEvent[]
  /** Current stream status (drives the header indicator). */
  status: StreamStatus
  /** Display mode. */
  mode?: 'rail' | 'floating'
  /** Open/closed state (controlled by parent). Required for floating mode. */
  open?: boolean
  /** Called when user clicks the close/collapse button. */
  onClose?: () => void
  /** Called when user clicks an `approval_pending` event row. */
  onApprovalClick?: (data: { approvalId: string; artifactId: string }) => void
  /** Called when user clicks an `artifact_created` event row. */
  onArtifactClick?: (data: { artifactId: string; type: string }) => void
  /** Total cost reported in the `done` event (shown in footer). */
  totalCost?: number | null
  /** Optional latest error message. */
  errorMessage?: string | null
  /** Optional className for outer container. */
  className?: string
  /** Optional title (default: 'Agent Console'). */
  title?: string
  /** Max events to render (older are dropped from the DOM). Default 500. */
  maxRenderedEvents?: number
}

// ─── Agent visuals ────────────────────────────────────────────────────────

const AGENT_PALETTE = [
  { text: 'text-indigo-300', dot: 'bg-indigo-400', border: 'border-indigo-700/50' },
  { text: 'text-purple-300', dot: 'bg-purple-400', border: 'border-purple-700/50' },
  { text: 'text-pink-300', dot: 'bg-pink-400', border: 'border-pink-700/50' },
  { text: 'text-blue-300', dot: 'bg-blue-400', border: 'border-blue-700/50' },
  { text: 'text-teal-300', dot: 'bg-teal-400', border: 'border-teal-700/50' },
  { text: 'text-emerald-300', dot: 'bg-emerald-400', border: 'border-emerald-700/50' },
  { text: 'text-amber-300', dot: 'bg-amber-400', border: 'border-amber-700/50' },
  { text: 'text-rose-300', dot: 'bg-rose-400', border: 'border-rose-700/50' },
]

function agentColor(name: string | undefined): typeof AGENT_PALETTE[number] {
  if (!name) return { text: 'text-gray-400', dot: 'bg-gray-500', border: 'border-gray-700' }
  // CMO is the anchor — always indigo
  if (name === 'cmo') return AGENT_PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]
}

const AGENT_ICONS: Record<string, string> = {
  cmo: '🤖',
  strategy: '🧠',
  content: '📝',
  blog: '✍️',
  email: '📧',
  leads: '🎯',
  funnel: '🔮',
  ads: '📣',
  creative: '🎨',
  research: '🔍',
  growth: '📈',
  pr: '📰',
  analytics: '📊',
  sales: '💼',
  retargeting: '↩️',
  scheduling: '📅',
  branding: '🪪',
}

function agentIcon(name: string | undefined): string {
  if (!name) return '·'
  return AGENT_ICONS[name] || '🤖'
}

function formatTime(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
}

function formatCost(c: number | undefined | null): string {
  if (c == null) return ''
  if (c < 0.001) return `$${(c * 1000).toFixed(2)}m`  // millicents
  return `$${c.toFixed(c < 0.01 ? 4 : 3)}`
}

// ─── Event grouping ──────────────────────────────────────────────────────
// Merge consecutive `token` events from the same agent into a single row
// (otherwise a 1000-token response would render 1000 DOM elements).

type ConsoleRow =
  | { kind: 'event'; key: string; event: AgentEvent }
  | { kind: 'tokens'; key: string; agent: string | undefined; text: string; firstTs: number }

function groupEventsToRows(events: AgentEvent[]): ConsoleRow[] {
  const rows: ConsoleRow[] = []
  let buffer: { agent: string | undefined; text: string; firstTs: number; startIdx: number } | null = null

  events.forEach((event, idx) => {
    if (event.t === 'token') {
      if (buffer && buffer.agent === event.agent) {
        buffer.text += event.text
      } else {
        if (buffer) {
          rows.push({
            kind: 'tokens',
            key: `t-${buffer.startIdx}`,
            agent: buffer.agent,
            text: buffer.text,
            firstTs: buffer.firstTs,
          })
        }
        buffer = {
          agent: event.agent,
          text: event.text,
          firstTs: event.ts || Date.now(),
          startIdx: idx,
        }
      }
    } else {
      if (buffer) {
        rows.push({
          kind: 'tokens',
          key: `t-${buffer.startIdx}`,
          agent: buffer.agent,
          text: buffer.text,
          firstTs: buffer.firstTs,
        })
        buffer = null
      }
      rows.push({ kind: 'event', key: `e-${idx}`, event })
    }
  })

  if (buffer !== null) {
    const finalBuffer = buffer as { agent: string | undefined; text: string; firstTs: number; startIdx: number }
    rows.push({
      kind: 'tokens',
      key: `t-${finalBuffer.startIdx}`,
      agent: finalBuffer.agent,
      text: finalBuffer.text,
      firstTs: finalBuffer.firstTs,
    })
  }

  return rows
}

// ─── Per-row renderers ────────────────────────────────────────────────────

function EventRow({
  event,
  onApprovalClick,
  onArtifactClick,
}: {
  event: AgentEvent
  onApprovalClick?: AgentConsoleProps['onApprovalClick']
  onArtifactClick?: AgentConsoleProps['onArtifactClick']
}) {
  const color = agentColor((event as { agent?: string }).agent)
  const ts = formatTime(event.ts)

  switch (event.t) {
    case 'agent_start':
      return (
        <div className="flex gap-2 py-1 hover:bg-gray-900/40 px-2 -mx-2 rounded transition-colors">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">{agentIcon(event.agent)}</span>
          <div className="min-w-0 flex-1">
            <span className={`text-xs font-medium ${color.text}`}>{event.agent}</span>
            <span className="text-gray-500 text-xs mx-1">▶</span>
            <span className="text-gray-300 text-xs">{event.label || 'started'}</span>
          </div>
        </div>
      )

    case 'agent_log':
      return (
        <div className="flex gap-2 py-0.5 px-2 -mx-2 text-xs">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0 opacity-30">{agentIcon(event.agent)}</span>
          <div className="min-w-0 flex-1">
            {event.agent && <span className={`${color.text} mr-1.5`}>{event.agent}</span>}
            <span
              className={
                event.level === 'error' ? 'text-red-400'
                : event.level === 'warn' ? 'text-yellow-400'
                : 'text-gray-400'
              }
            >
              {event.msg}
            </span>
          </div>
        </div>
      )

    case 'agent_done': {
      const meta = [formatDuration(event.durationMs), formatCost(event.cost)].filter(Boolean).join(' · ')
      return (
        <div className="flex gap-2 py-1 px-2 -mx-2 rounded">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">{agentIcon(event.agent)}</span>
          <div className="min-w-0 flex-1">
            <span className={`text-xs font-medium ${color.text}`}>{event.agent}</span>
            <span className="text-emerald-400 text-xs mx-1">✓</span>
            <span className="text-gray-500 text-xs">{meta || 'done'}</span>
          </div>
        </div>
      )
    }

    case 'agent_error':
      return (
        <div className="flex gap-2 py-1 px-2 -mx-2 rounded bg-red-950/30">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">🔴</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-red-300">{event.agent}</span>
            <span className="text-red-500 text-xs mx-1">✕</span>
            <span className="text-red-300 text-xs break-words">{event.msg}</span>
          </div>
        </div>
      )

    case 'artifact_created':
      return (
        <button
          onClick={() => onArtifactClick?.({ artifactId: event.artifactId, type: event.type })}
          className="flex gap-2 py-1 px-2 -mx-2 rounded w-full text-left hover:bg-indigo-950/30 transition-colors group"
        >
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">📦</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-indigo-300">artifact</span>
            <span className="text-gray-500 text-xs mx-1">created</span>
            <span className="text-gray-300 text-xs">{event.title || event.type}</span>
            <span className="text-gray-600 text-[10px] ml-1 group-hover:text-indigo-400">#{(event.artifactId || '').slice(0, 6)}</span>
          </div>
        </button>
      )

    case 'approval_pending':
      return (
        <button
          onClick={() =>
            onApprovalClick?.({ approvalId: event.approvalId, artifactId: event.artifactId })
          }
          className="flex gap-2 py-1.5 px-2 -mx-2 rounded w-full text-left bg-yellow-950/40 border border-yellow-800/60 hover:bg-yellow-950/60 hover:border-yellow-700 transition-colors animate-pulse-once"
        >
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">⚠</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-yellow-300">Approval required</span>
            <span className="text-yellow-500 text-xs mx-1">·</span>
            <span className="text-yellow-200 text-xs">Click to review</span>
            {event.publishDestination && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300 text-[10px]">
                → {event.publishDestination}
              </span>
            )}
          </div>
          <span className="text-yellow-400 text-xs">→</span>
        </button>
      )

    case 'progress':
      return (
        <div className="flex gap-2 py-0.5 px-2 -mx-2 text-xs">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0 opacity-30">·</span>
          <div className="min-w-0 flex-1 text-gray-500">
            {event.step !== undefined && event.total !== undefined && (
              <span className="text-gray-400 mr-2">{event.step}/{event.total}</span>
            )}
            {event.msg}
          </div>
        </div>
      )

    case 'done':
      return (
        <div className="flex gap-2 py-1.5 px-2 -mx-2 rounded bg-emerald-950/30 border-l-2 border-emerald-700">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">✓</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-emerald-300">Run complete</span>
            {event.cost != null && (
              <span className="text-gray-500 text-xs ml-2">{formatCost(event.cost)} total</span>
            )}
          </div>
        </div>
      )

    case 'error':
      return (
        <div className="flex gap-2 py-1.5 px-2 -mx-2 rounded bg-red-950/40 border-l-2 border-red-700">
          <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{ts}</span>
          <span className="text-base flex-shrink-0">✕</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-red-300">Run failed</span>
            <div className="text-red-300 text-xs mt-0.5 break-words">{event.msg}</div>
          </div>
        </div>
      )

    // `token` is handled by the grouped TokensRow renderer below; this is a fallback.
    case 'token':
      return null
  }
}

function TokensRow({ agent, text, firstTs }: { agent: string | undefined; text: string; firstTs: number }) {
  const color = agentColor(agent)
  return (
    <div className="flex gap-2 py-1 px-2 -mx-2 rounded hover:bg-gray-900/40 transition-colors">
      <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">{formatTime(firstTs)}</span>
      <span className="text-base flex-shrink-0 opacity-50">{agentIcon(agent)}</span>
      <div className="min-w-0 flex-1">
        {agent && <span className={`text-[10px] font-medium ${color.text} block mb-0.5`}>{agent} · streaming</span>}
        <pre className="text-gray-200 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">{text}</pre>
      </div>
    </div>
  )
}

// ─── Header status pill ──────────────────────────────────────────────────

function StatusPill({ status }: { status: StreamStatus }) {
  switch (status) {
    case 'idle':
      return (
        <span className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Idle
        </span>
      )
    case 'connecting':
      return (
        <span className="flex items-center gap-1.5 text-amber-400 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Connecting…
        </span>
      )
    case 'streaming':
      return (
        <span className="flex items-center gap-1.5 text-indigo-300 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" /> Live
        </span>
      )
    case 'done':
      return (
        <span className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Done
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1.5 text-red-400 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Error
        </span>
      )
    case 'cancelled':
      return (
        <span className="flex items-center gap-1.5 text-gray-400 text-[10px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> Cancelled
        </span>
      )
  }
}

// ─── Main component ──────────────────────────────────────────────────────

export default function AgentConsole({
  events,
  status,
  mode = 'rail',
  open = true,
  onClose,
  onApprovalClick,
  onArtifactClick,
  totalCost,
  errorMessage,
  className = '',
  title = 'Agent Console',
  maxRenderedEvents = 500,
}: AgentConsoleProps) {
  // ─── Smart auto-scroll ──────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)
  const [unseenCount, setUnseenCount] = useState(0)
  // Throttle scrolls during token-flood: only one RAF callback at a time
  const scrollRafRef = useRef<number | null>(null)
  // Track event count without depending on the (potentially huge) array for effects
  const eventCountRef = useRef(0)

  // Pin/unpin detection. Threshold 50px = forgiving for slow scroll wheels.
  // Cleared rAF on each scroll to avoid stacking up dozens of pending checks.
  const detectRafRef = useRef<number | null>(null)
  const handleScroll = () => {
    if (detectRafRef.current != null) cancelAnimationFrame(detectRafRef.current)
    detectRafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = distanceFromBottom < 50
      setPinnedToBottom(atBottom)
      if (atBottom) setUnseenCount(0)
    })
  }

  // Auto-scroll when new events arrive — only if pinned.
  // useLayoutEffect runs synchronously after DOM mutation but before paint,
  // which prevents the visible "jump" when the new row is briefly above the
  // viewport before the scroll-to-bottom adjustment.
  useLayoutEffect(() => {
    const newCount = events.length
    if (newCount === eventCountRef.current) return
    const delta = newCount - eventCountRef.current
    eventCountRef.current = newCount

    if (delta <= 0) return  // events were reset

    if (pinnedToBottom) {
      // Coalesce multiple scrolls per frame: only one rAF in flight
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        scrollRafRef.current = null
      })
    } else {
      // User is scrolled up — increment the unseen-events badge
      setUnseenCount(prev => prev + delta)
    }
  }, [events.length, pinnedToBottom])

  // Cleanup pending rAFs on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
      if (detectRafRef.current != null) cancelAnimationFrame(detectRafRef.current)
    }
  }, [])

  const scrollToBottomSmooth = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setPinnedToBottom(true)
    setUnseenCount(0)
  }

  // ─── Event grouping (token merge) ────────────────────────────────────
  const rows = useMemo(() => {
    // Cap to last N to keep DOM small. If events were truncated, the user
    // can still see them in /dashboard/audit which queries agent_run_events.
    const slice = events.length > maxRenderedEvents
      ? events.slice(events.length - maxRenderedEvents)
      : events
    return groupEventsToRows(slice)
  }, [events, maxRenderedEvents])

  const isStreaming = status === 'connecting' || status === 'streaming'
  const showEmptyState = events.length === 0 && !isStreaming

  // ─── Outer container styles per mode ─────────────────────────────────
  const baseClasses = 'flex flex-col bg-gray-950 border border-gray-800 text-white'
  const railClasses = open
    ? 'h-full w-80 border-l rounded-none'
    : 'h-full w-10 border-l rounded-none'
  const floatingClasses = open
    ? 'fixed bottom-4 right-4 w-96 max-h-[70vh] rounded-2xl shadow-2xl shadow-black/40 z-40'
    : 'hidden'

  const containerClasses = `${baseClasses} ${mode === 'rail' ? railClasses : floatingClasses} ${className}`.trim()

  // ─── Collapsed rail strip ────────────────────────────────────────────
  if (mode === 'rail' && !open) {
    return (
      <div className={containerClasses}>
        <button
          onClick={() => onClose?.()}
          className="h-full w-full flex flex-col items-center justify-start pt-4 gap-3 text-gray-500 hover:text-white hover:bg-gray-900 transition-colors"
          aria-label="Expand Agent Console"
        >
          <span className="text-base">🤖</span>
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Agent Console
          </span>
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className={containerClasses}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">🤖</span>
          <h3 className="text-white text-xs font-semibold truncate">{title}</h3>
          <StatusPill status={status} />
        </div>
        <button
          onClick={() => onClose?.()}
          className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
          aria-label="Close Agent Console"
        >
          {mode === 'rail' ? '▶' : '×'}
        </button>
      </div>

      {/* ─── Body ─── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
      >
        {showEmptyState && (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="text-3xl mb-2 opacity-40">🌙</div>
            <p className="text-gray-500 text-xs">No agent activity yet</p>
            <p className="text-gray-600 text-[10px] mt-1 max-w-[200px]">
              Send a message or trigger an agent — events will stream here in real time.
            </p>
          </div>
        )}

        {rows.map(row =>
          row.kind === 'tokens' ? (
            <TokensRow key={row.key} agent={row.agent} text={row.text} firstTs={row.firstTs} />
          ) : (
            <EventRow
              key={row.key}
              event={row.event}
              onApprovalClick={onApprovalClick}
              onArtifactClick={onArtifactClick}
            />
          )
        )}

        {/* Live cursor while streaming */}
        {isStreaming && (
          <div className="flex gap-2 py-1 px-2 -mx-2 opacity-60">
            <span className="text-gray-600 text-[10px] font-mono pt-0.5 select-none w-16 flex-shrink-0">·</span>
            <span className="text-base flex-shrink-0">⟳</span>
            <span className="text-gray-500 text-xs animate-pulse">working…</span>
          </div>
        )}
      </div>

      {/* ─── "↓ N new" floating badge ─── */}
      {unseenCount > 0 && (
        <button
          onClick={scrollToBottomSmooth}
          className="absolute right-3 z-10 px-2.5 py-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium shadow-lg shadow-black/40 flex items-center gap-1 transition-colors"
          style={{ bottom: errorMessage ? '4.5rem' : '2.5rem' }}
          aria-label={`Jump to ${unseenCount} new event${unseenCount === 1 ? '' : 's'}`}
        >
          <span>↓</span>
          <span>{unseenCount} new</span>
        </button>
      )}

      {/* ─── Error banner ─── */}
      {errorMessage && (
        <div className="px-3 py-2 border-t border-red-900/50 bg-red-950/40 text-red-300 text-xs flex-shrink-0">
          <span className="font-medium">Error:</span> {errorMessage}
        </div>
      )}

      {/* ─── Footer ─── */}
      <div className="px-3 py-1.5 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-600 flex-shrink-0">
        <span>{events.length} event{events.length === 1 ? '' : 's'}</span>
        {totalCost != null && <span>{formatCost(totalCost)} total</span>}
      </div>
    </div>
  )
}
