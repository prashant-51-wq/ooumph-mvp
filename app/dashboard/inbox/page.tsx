'use client'

/**
 * /dashboard/inbox
 *
 * Unified inbox with three columns:
 *   1. Conversation list   — live data from /api/inbox
 *   2. Message thread      — live data from /api/inbox/[id]
 *   3. Contact context     — name, email, last engaged, source
 *
 * Reply composer at the bottom of the thread pane POSTs to
 * /api/inbox/[id]/reply (workspace-ownership headers are forwarded by
 * Next.js middleware via the session cookie).
 *
 * ─── AI Drafting Assistant ────────────────────────────────────────────────
 * Toggle per-conversation. When ON, every time the latest inbound message
 * changes we fetch /api/agents/inbox?mode=compose_reply and surface the
 * proposed reply inline above the composer with a single click to "Insert
 * into composer". Nothing is sent automatically — the human still controls
 * the send button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'
import {
  Mail, MessageSquare, Send, RefreshCw, Sparkles, ChevronRight,
  AlertCircle, Loader2, Search, User, Clock, X, Check, Bot,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  workspace_id: string
  contact_email: string | null
  contact_name: string | null
  contact_phone: string | null
  channel: string
  subject: string | null
  status: string
  unread_count: number
  last_message_at: string | null
  created_at: string
  last_message_body?: string | null
  last_message_dir?: string | null
}

interface ThreadMessage {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | string
  from_address: string | null
  to_address: string | null
  subject: string | null
  body: string
  channel: string
  status: string
  ai_generated: number | boolean
  sent_at: string
  created_at: string
}

interface ThreadResponse {
  conversation: Conversation
  messages: ThreadMessage[]
}

interface AIReply {
  subject: string
  body: string
  tone: string
  reasoning: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null): string {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '')
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    pending: 'bg-amber-900/40 text-amber-300 border-amber-800',
    closed: 'bg-gray-800 text-gray-500 border-gray-700',
    snoozed: 'bg-blue-900/40 text-blue-300 border-blue-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${map[status] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {status}
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadResponse | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // AI assistant per-conversation toggle (persisted in localStorage)
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState<Record<string, boolean>>({})

  // Sprint 10C: session-derived via useWorkspaceId().
  const { workspaceId: sessionWorkspaceId, resolved: sessionResolved, loading: sessionLoading } = useWorkspaceId()
  useEffect(() => {
    setWorkspaceId(sessionWorkspaceId)
    if (sessionResolved && !sessionLoading && !sessionWorkspaceId) {
      setError('No workspace selected — finish onboarding first.')
    }
  }, [sessionWorkspaceId, sessionResolved, sessionLoading])

  // Hydrate AI toggle preferences from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('inbox_ai_assistant_enabled')
      if (raw) setAiAssistantEnabled(JSON.parse(raw) as Record<string, boolean>)
    } catch { /* ignore */ }
  }, [])

  const toggleAi = (convId: string) => {
    setAiAssistantEnabled(prev => {
      const next = { ...prev, [convId]: !prev[convId] }
      try { localStorage.setItem('inbox_ai_assistant_enabled', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const fetchConvos = useCallback(() => {
    if (!workspaceId) return
    setLoadingList(true)
    const params = new URLSearchParams({ workspaceId })
    if (search.trim()) params.set('search', search.trim())
    fetch(`/api/inbox?${params.toString()}`)
      .then(r => r.json())
      .then((rows: Conversation[]) => {
        setConversations(Array.isArray(rows) ? rows : [])
        if (rows.length > 0 && !selectedId) setSelectedId(rows[0].id)
      })
      .catch(() => setConversations([]))
      .finally(() => setLoadingList(false))
  }, [workspaceId, search, selectedId])

  // Sprint 5 fix: debounce the search-driven refetch. Without this, every
  // keystroke in the search box re-triggers fetchConvos, the loading flag
  // never settles, and "Loading…" appears stuck. 300ms is short enough to
  // feel responsive and long enough to coalesce a burst of keystrokes.
  useEffect(() => {
    const t = setTimeout(() => { fetchConvos() }, 300)
    return () => clearTimeout(t)
  }, [fetchConvos])

  const fetchThread = useCallback(() => {
    if (!selectedId) { setThread(null); return }
    setLoadingThread(true)
    fetch(`/api/inbox/${selectedId}`)
      .then(r => r.json())
      .then((data: ThreadResponse | { error?: string }) => {
        if ('error' in data && data.error) { setThread(null); return }
        setThread(data as ThreadResponse)
      })
      .catch(() => setThread(null))
      .finally(() => setLoadingThread(false))
  }, [selectedId])

  useEffect(() => { fetchThread() }, [fetchThread])

  // Light polling — refresh thread every 8s for the open conversation
  useEffect(() => {
    if (!selectedId) return
    const t = setInterval(fetchThread, 8000)
    return () => clearInterval(t)
  }, [selectedId, fetchThread])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="h-screen flex">
        {/* ─── Left: conversation list ──────────────────────────────────────── */}
        <aside className="w-[320px] flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" /> Inbox
              </h2>
              <button
                onClick={fetchConvos}
                className="text-gray-500 hover:text-gray-200"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {error && (
              <div className="m-3 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
            {loadingList ? (
              <div className="p-6 text-center text-xs text-gray-500">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                <p className="text-xs text-gray-500">No conversations yet</p>
              </div>
            ) : conversations.map(c => {
              const active = selectedId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-900 transition-colors ${
                    active ? 'bg-indigo-900/20 border-l-2 border-l-indigo-500'
                    : 'hover:bg-gray-900/50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-900/50 border border-indigo-800 flex items-center justify-center text-xs text-indigo-300 font-semibold flex-shrink-0">
                      {initials(c.contact_name, c.contact_email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white truncate font-medium">
                          {c.contact_name || c.contact_email || 'Unknown'}
                        </div>
                        <div className="text-[10px] text-gray-500 flex-shrink-0">{formatTime(c.last_message_at || c.created_at)}</div>
                      </div>
                      {c.subject && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">{c.subject}</div>
                      )}
                      {c.last_message_body && (
                        <div className="text-xs text-gray-600 truncate mt-0.5">
                          {c.last_message_dir === 'outbound' && <span className="text-gray-500">You: </span>}
                          {c.last_message_body}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <StatusPill status={c.status} />
                        {c.unread_count > 0 && (
                          <span className="bg-indigo-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                            {c.unread_count}
                          </span>
                        )}
                        {aiAssistantEnabled[c.id] && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-purple-300 bg-purple-900/30 border border-purple-800 rounded">
                            <Bot className="w-2.5 h-2.5" /> AI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ─── Middle: thread pane ──────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-950">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-center text-gray-500">
              <div>
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                <p className="text-sm">Select a conversation to view its thread</p>
              </div>
            </div>
          ) : loadingThread && !thread ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading thread…
            </div>
          ) : thread ? (
            <ThreadView
              workspaceId={workspaceId || ''}
              thread={thread}
              aiAssistantEnabled={!!aiAssistantEnabled[thread.conversation.id]}
              onToggleAi={() => toggleAi(thread.conversation.id)}
              onSent={() => fetchThread()}
              onStatusChanged={() => { fetchConvos(); fetchThread() }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-rose-400 text-sm">
              Failed to load thread.
            </div>
          )}
        </main>

        {/* ─── Right: contact panel ─────────────────────────────────────────── */}
        {thread && (
          <ContactPanel conversation={thread.conversation} />
        )}
      </div>
    </div>
  )
}

// ─── Thread + composer + AI assistant ─────────────────────────────────────

function ThreadView({
  workspaceId, thread, aiAssistantEnabled, onToggleAi, onSent, onStatusChanged,
}: {
  workspaceId: string
  thread: ThreadResponse
  aiAssistantEnabled: boolean
  onToggleAi: () => void
  onSent: () => void
  onStatusChanged: () => void
}) {
  const conv = thread.conversation
  const messages = thread.messages
  const [reply, setReply] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<AIReply | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastInboundIdRef = useRef<string | null>(null)

  // Default reply subject = "Re: ..." once
  useEffect(() => {
    if (conv.subject && !replySubject) {
      setReplySubject(conv.subject.startsWith('Re:') ? conv.subject : `Re: ${conv.subject}`)
    }
  }, [conv.subject, replySubject])

  // Scroll to bottom when thread updates
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const lastInbound = useMemo(
    () => [...messages].reverse().find(m => m.direction === 'inbound') || null,
    [messages],
  )

  // Auto-fetch AI draft when assistant is on AND the last inbound message changed
  const fetchAiDraft = useCallback(async () => {
    if (!aiAssistantEnabled || !lastInbound) return
    setAiLoading(true); setAiError(null)
    try {
      const res = await fetch('/api/agents/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, mode: 'compose_reply', conversationId: conv.id,
        }),
      })
      const data = await res.json() as { ok?: boolean; reply?: AIReply; error?: string }
      if (!res.ok || !data.ok || !data.reply) throw new Error(data.error || 'AI draft failed')
      setAiDraft(data.reply)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally { setAiLoading(false) }
  }, [aiAssistantEnabled, lastInbound, workspaceId, conv.id])

  useEffect(() => {
    if (!aiAssistantEnabled) { setAiDraft(null); return }
    if (lastInbound && lastInbound.id !== lastInboundIdRef.current) {
      lastInboundIdRef.current = lastInbound.id
      fetchAiDraft()
    }
  }, [aiAssistantEnabled, lastInbound, fetchAiDraft])

  const send = async () => {
    if (!reply.trim()) return
    setSending(true); setError(null)
    try {
      const res = await fetch(`/api/inbox/${conv.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: reply, subject: replySubject || conv.subject || 'Reply',
          aiGenerated: !!aiDraft && reply === aiDraft.body,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      setReply(''); setAiDraft(null)
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSending(false) }
  }

  const closeConv = async () => {
    if (!confirm('Close this conversation?')) return
    await fetch(`/api/inbox/${conv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    onStatusChanged()
  }

  return (
    <>
      {/* Thread header */}
      <div className="px-6 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">{conv.contact_name || conv.contact_email}</div>
          <div className="text-xs text-gray-500 truncate">{conv.subject || `${conv.channel} conversation`}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAi}
            className={`px-2.5 py-1 text-xs rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
              aiAssistantEnabled
                ? 'bg-purple-900/40 border-purple-700 text-purple-200 hover:bg-purple-900/60'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
            title="Toggle AI Drafting Assistant"
          >
            <Bot className="w-3 h-3" />
            AI Drafting Assistant {aiAssistantEnabled ? 'on' : 'off'}
          </button>
          {conv.status !== 'closed' && (
            <button
              onClick={closeConv}
              className="px-2.5 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-lg"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-10">No messages yet.</div>
        ) : messages.map(m => {
          const isOutbound = m.direction === 'outbound'
          const isAi = !!m.ai_generated
          return (
            <div key={m.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${
                isOutbound
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-100'
              }`}>
                {!isOutbound && (
                  <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">
                    {m.from_address || 'Inbound'}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</div>
                <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                  isOutbound ? 'text-indigo-200' : 'text-gray-500'
                }`}>
                  {isAi && <Sparkles className="w-2.5 h-2.5" />}
                  {isAi && <span>AI-drafted ·</span>}
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(m.sent_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI draft preview (when assistant is on) */}
      {aiAssistantEnabled && (
        <div className="mx-6 mb-3 rounded-lg border border-purple-800 bg-purple-950/30 px-3.5 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-purple-300 uppercase tracking-wide flex items-center gap-1.5 font-medium">
              <Bot className="w-3.5 h-3.5" /> Claude suggests this reply
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={fetchAiDraft}
                disabled={aiLoading}
                className="text-purple-300 hover:text-purple-200 p-1 disabled:opacity-50"
                title="Regenerate"
              >
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setAiDraft(null)}
                className="text-purple-300 hover:text-purple-200 p-1"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {aiLoading && !aiDraft ? (
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Drafting reply…
            </div>
          ) : aiError ? (
            <div className="text-xs text-rose-400">{aiError}</div>
          ) : aiDraft ? (
            <>
              <div className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">{aiDraft.body}</div>
              {aiDraft.reasoning && (
                <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-purple-900/50">
                  <span className="text-purple-400">Reasoning:</span> {aiDraft.reasoning}
                </div>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => setReply(prev => prev ? `${prev}\n\n${aiDraft.body}` : aiDraft.body)}
                  className="px-3 py-1 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded inline-flex items-center gap-1.5"
                >
                  <Check className="w-3 h-3" /> Insert into composer
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500">Toggle off and back on, or wait for the next inbound message.</div>
          )}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-gray-800 px-6 py-3 bg-gray-950">
        {error && (
          <div className="mb-2 px-3 py-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs">
            {error}
          </div>
        )}
        <input
          value={replySubject}
          onChange={e => setReplySubject(e.target.value)}
          placeholder="Subject"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none mb-2"
        />
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder={aiAssistantEnabled ? 'Write your reply, or insert Claude\'s suggestion above…' : 'Type your reply…'}
            rows={3}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
            }}
          />
          <button
            onClick={send}
            disabled={sending || !reply.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
            title="Send (Cmd/Ctrl + Enter)"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
        <div className="text-[10px] text-gray-600 mt-1.5">
          {aiAssistantEnabled
            ? 'AI draft regenerates automatically whenever a new inbound message arrives. You always confirm the send.'
            : 'Tip: turn on the AI Drafting Assistant above to preview suggested replies.'}
        </div>
      </div>
    </>
  )
}

// ─── Right rail: contact details ──────────────────────────────────────────

function ContactPanel({ conversation }: { conversation: Conversation }) {
  const [details, setDetails] = useState<{
    last_engaged_at?: string | null
    source?: string | null
    bounce_count?: number
    consent_given_at?: string | null
  } | null>(null)

  useEffect(() => {
    if (!conversation.contact_email) return
    fetch(`/api/email-subscribers?workspaceId=${conversation.workspace_id}`)
      .then(r => r.json())
      .then((rows: Array<{ email: string; last_engaged_at?: string; source?: string; bounce_count?: number; consent_given_at?: string }>) => {
        const me = rows.find(r => r.email?.toLowerCase() === conversation.contact_email?.toLowerCase())
        if (me) setDetails(me)
      })
      .catch(() => { /* non-fatal */ })
  }, [conversation.workspace_id, conversation.contact_email])

  return (
    <aside className="w-[280px] flex-shrink-0 border-l border-gray-800 bg-gray-950 p-4 overflow-auto">
      <div className="flex flex-col items-center text-center mb-4">
        <div className="w-14 h-14 rounded-full bg-indigo-900/50 border border-indigo-800 flex items-center justify-center text-lg text-indigo-300 font-semibold mb-3">
          {initials(conversation.contact_name, conversation.contact_email)}
        </div>
        <div className="text-white font-semibold">{conversation.contact_name || conversation.contact_email}</div>
        <div className="text-xs text-gray-500">{conversation.contact_email}</div>
      </div>

      <div className="space-y-3 text-sm">
        <Row icon={MessageSquare} label="Channel" value={conversation.channel} />
        <Row icon={ChevronRight} label="Status" value={conversation.status} />
        {details?.source && <Row icon={User} label="Source" value={details.source} />}
        {details?.last_engaged_at && (
          <Row icon={Clock} label="Last engaged" value={formatTime(details.last_engaged_at)} />
        )}
        {details?.consent_given_at && (
          <Row icon={Check} label="Consent" value={new Date(details.consent_given_at).toLocaleDateString()} />
        )}
        {details && (details.bounce_count ?? 0) > 0 && (
          <Row icon={AlertCircle} label="Bounces" value={String(details.bounce_count)} valueClass="text-rose-400" />
        )}
      </div>
    </aside>
  )
}

function Row({
  icon: Icon, label, value, valueClass,
}: {
  icon: typeof MessageSquare
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 inline-flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className={`text-gray-300 ${valueClass || ''}`}>{value}</span>
    </div>
  )
}
