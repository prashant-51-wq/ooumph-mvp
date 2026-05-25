'use client'

/**
 * /dashboard/inbox — Unified Inbox
 * 3-panel layout: conversation list | message thread | AI agent panel
 * Channels: email (Gmail) + SMS (Twilio — future)
 */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Conversation {
  id: string
  contact_email: string
  contact_name: string
  contact_phone: string
  channel: 'email' | 'sms'
  subject: string
  status: 'open' | 'closed' | 'snoozed'
  tags: string | string[]
  unread_count: number
  last_message_at: string
  last_message_body: string
  last_message_dir: 'inbound' | 'outbound'
  created_at: string
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  from_address: string
  to_address: string
  subject: string
  body: string
  channel: string
  status: string
  ai_generated: number
  sent_at: string
}

interface Classification {
  intent: string
  sentiment: string
  urgency: string
  suggestedTags: string[]
  nextAction: string
  nextActionType: string
  summary: string
}

interface ReplyDraft {
  subject: string
  body: string
  tone: string
  reasoning: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseTags(raw: string | string[] | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

function timeAgo(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function channelIcon(ch: string) {
  if (ch === 'sms') return '💬'
  return '✉️'
}

function sentimentColor(s: string) {
  if (s === 'positive') return '#10b981'
  if (s === 'negative') return '#ef4444'
  return '#6b7280'
}

function urgencyBadge(u: string) {
  if (u === 'high') return { bg: '#7f1d1d', color: '#fca5a5', label: 'HIGH' }
  if (u === 'low') return { bg: '#1e3a2f', color: '#6ee7b7', label: 'LOW' }
  return { bg: '#1e2d3d', color: '#93c5fd', label: 'MED' }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null)

  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms'>('all')
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open')
  const [search, setSearch] = useState('')

  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const [agentLoading, setAgentLoading] = useState(false)
  const [classification, setClassification] = useState<Classification | null>(null)
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null)
  const [agentInstruction, setAgentInstruction] = useState('')

  const threadEndRef = useRef<HTMLDivElement>(null)

  // Load workspace
  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const ws = raw ? (JSON.parse(raw) as { id?: string }) : null
    const id = ws?.id || ''
    setWorkspaceId(id)
  }, [])

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!workspaceId) return
    const params = new URLSearchParams({ workspaceId, status: statusFilter })
    if (channelFilter !== 'all') params.set('channel', channelFilter)
    if (search) params.set('search', search)
    const res = await fetch(`/api/inbox?${params}`)
    if (res.ok) setConversations(await res.json() as Conversation[])
  }, [workspaceId, channelFilter, statusFilter, search])

  useEffect(() => {
    void loadConversations()
    const iv = setInterval(() => { void loadConversations() }, 15000)
    return () => clearInterval(iv)
  }, [loadConversations])

  // Load thread
  useEffect(() => {
    if (!selectedId) return
    void (async () => {
      const res = await fetch(`/api/inbox/${selectedId}`)
      if (res.ok) {
        const data = await res.json() as { conversation: Conversation; messages: Message[] }
        setMessages(data.messages)
        setSelectedConvo(data.conversation)
        setClassification(null)
        setReplyDraft(null)
        setReplyBody('')
      }
    })()
  }, [selectedId])

  // Scroll to bottom of thread
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function syncGmail() {
    if (!workspaceId) return
    setSyncing(true)
    setSyncMsg('Syncing Gmail...')
    const res = await fetch('/api/agents/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'sync_gmail' }),
    })
    const data = await res.json() as { imported?: number; errors?: string[] }
    setSyncMsg(data.errors?.[0]?.includes('No Gmail') ? '⚠️ Connect Gmail in Connections first' : `✅ Synced ${data.imported || 0} threads`)
    setSyncing(false)
    void loadConversations()
    setTimeout(() => setSyncMsg(''), 4000)
  }

  async function syncLeads() {
    if (!workspaceId) return
    setSyncing(true)
    setSyncMsg('Importing CRM leads...')
    const res = await fetch('/api/agents/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'sync_leads' }),
    })
    const data = await res.json() as { created?: number }
    setSyncMsg(`✅ Imported ${data.created || 0} contacts`)
    setSyncing(false)
    void loadConversations()
    setTimeout(() => setSyncMsg(''), 3000)
  }

  async function sendReply() {
    if (!selectedId || !replyBody.trim()) return
    setReplySending(true)
    await fetch(`/api/inbox/${selectedId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: replyBody, subject: selectedConvo?.subject }),
    })
    setReplyBody('')
    setReplySending(false)
    // Reload thread
    const res = await fetch(`/api/inbox/${selectedId}`)
    if (res.ok) {
      const data = await res.json() as { conversation: Conversation; messages: Message[] }
      setMessages(data.messages)
    }
    void loadConversations()
  }

  async function sendDraftReply() {
    if (!replyDraft || !selectedId) return
    setReplyBody(replyDraft.body)
    setReplyDraft(null)
  }

  async function classifyConversation() {
    if (!selectedId || !workspaceId) return
    setAgentLoading(true)
    const res = await fetch('/api/agents/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'classify', conversationId: selectedId }),
    })
    const data = await res.json() as { classification: Classification }
    setClassification(data.classification)
    setAgentLoading(false)
    void loadConversations()
  }

  async function composeDraft() {
    if (!selectedId || !workspaceId) return
    setAgentLoading(true)
    const res = await fetch('/api/agents/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode: 'compose_reply', conversationId: selectedId, instruction: agentInstruction }),
    })
    const data = await res.json() as { reply: ReplyDraft }
    setReplyDraft(data.reply)
    setAgentLoading(false)
  }

  async function closeConversation() {
    if (!selectedId) return
    await fetch(`/api/inbox/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    setSelectedId(null)
    setSelectedConvo(null)
    setMessages([])
    void loadConversations()
  }

  // ── Total unread count ───────────────────────────────────────────────────────
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  // ── Styles ───────────────────────────────────────────────────────────────────
  const s = {
    page: {
      display: 'flex', height: 'calc(100vh - 64px)', background: '#0a0a0f',
      fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden',
    } as React.CSSProperties,

    // Left panel
    leftPanel: {
      width: '300px', borderRight: '1px solid #1f2937', display: 'flex',
      flexDirection: 'column' as const, background: '#0f1117', flexShrink: 0,
    },
    leftHeader: {
      padding: '16px', borderBottom: '1px solid #1f2937',
    },
    leftTitle: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '12px',
    },
    filterRow: {
      display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' as const,
    },
    filterBtn: (active: boolean) => ({
      padding: '4px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer',
      fontSize: '11px', fontWeight: 600,
      background: active ? '#4f46e5' : '#1f2937',
      color: active ? '#fff' : '#9ca3af',
    }),
    searchInput: {
      width: '100%', padding: '7px 10px', background: '#1f2937', border: '1px solid #374151',
      borderRadius: '8px', color: '#e5e7eb', fontSize: '13px', outline: 'none',
      boxSizing: 'border-box' as const,
    },
    convList: { flex: 1, overflowY: 'auto' as const },
    convItem: (active: boolean, unread: number) => ({
      padding: '12px 14px', borderBottom: '1px solid #111827', cursor: 'pointer',
      background: active ? '#1e1b4b' : unread > 0 ? '#0f1520' : 'transparent',
      transition: 'background 0.15s',
    }),
    convName: (unread: number) => ({
      fontSize: '13px', fontWeight: unread > 0 ? 700 : 500,
      color: unread > 0 ? '#e5e7eb' : '#9ca3af',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }),
    convSubject: { fontSize: '11px', color: '#6b7280', marginTop: '2px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
    convPreview: { fontSize: '11px', color: '#4b5563', marginTop: '3px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
    unreadBadge: {
      background: '#4f46e5', color: '#fff', borderRadius: '10px',
      padding: '1px 6px', fontSize: '10px', fontWeight: 700,
    },

    // Center panel
    centerPanel: {
      flex: 1, display: 'flex', flexDirection: 'column' as const, minWidth: 0, background: '#0a0a0f',
    },
    threadHeader: {
      padding: '14px 20px', borderBottom: '1px solid #1f2937', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', background: '#0f1117',
    },
    threadTitle: { fontSize: '14px', fontWeight: 600, color: '#e5e7eb' },
    thread: { flex: 1, overflowY: 'auto' as const, padding: '20px' },
    bubble: (dir: string) => ({
      display: 'flex', justifyContent: dir === 'outbound' ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
    }),
    bubbleInner: (dir: string, ai: boolean) => ({
      maxWidth: '72%', padding: '12px 16px', borderRadius: dir === 'outbound' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: dir === 'outbound' ? (ai ? '#4338ca' : '#4f46e5') : '#1f2937',
      color: '#e5e7eb', fontSize: '13px', lineHeight: 1.6, position: 'relative' as const,
    }),
    bubbleMeta: { fontSize: '10px', color: '#6b7280', marginTop: '6px' },

    // Reply box
    replyBox: {
      padding: '14px 20px', borderTop: '1px solid #1f2937', background: '#0f1117',
    },
    replyTextarea: {
      width: '100%', padding: '10px 14px', background: '#1f2937', border: '1px solid #374151',
      borderRadius: '10px', color: '#e5e7eb', fontSize: '13px', resize: 'vertical' as const,
      outline: 'none', minHeight: '80px', fontFamily: 'inherit', boxSizing: 'border-box' as const,
    },
    replyActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' },

    // Right panel
    rightPanel: {
      width: '280px', borderLeft: '1px solid #1f2937', display: 'flex',
      flexDirection: 'column' as const, background: '#0f1117', overflowY: 'auto' as const,
      flexShrink: 0,
    },
    rightSection: { padding: '14px 16px', borderBottom: '1px solid #111827' },
    sectionTitle: { fontSize: '10px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '10px' },

    // Buttons
    btn: (variant: 'primary' | 'ghost' | 'danger' | 'green') => ({
      padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      fontSize: '12px', fontWeight: 600,
      background: variant === 'primary' ? '#4f46e5' : variant === 'green' ? '#065f46' : variant === 'danger' ? '#7f1d1d' : '#1f2937',
      color: variant === 'primary' ? '#fff' : variant === 'green' ? '#6ee7b7' : variant === 'danger' ? '#fca5a5' : '#9ca3af',
    }),
    iconBtn: {
      padding: '5px 10px', background: '#1f2937', border: 'none', borderRadius: '6px',
      color: '#9ca3af', fontSize: '12px', cursor: 'pointer',
    },

    tag: (color?: string) => ({
      padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
      background: color || '#1e3a5f', color: color ? '#fff' : '#60a5fa',
    }),

    emptyState: {
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column' as const, color: '#4b5563', gap: '12px',
    },
  }

  return (
    <div style={s.page}>
      {/* ── LEFT: Conversation list ─────────────────────────────────────────── */}
      <div style={s.leftPanel}>
        <div style={s.leftHeader}>
          <div style={s.leftTitle}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#e5e7eb' }}>
              Inbox {totalUnread > 0 && <span style={s.unreadBadge}>{totalUnread}</span>}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={s.iconBtn} title="Sync Gmail" onClick={() => { void syncGmail() }} disabled={syncing}>
                {syncing ? '⏳' : '↻'}
              </button>
              <button style={s.iconBtn} title="Import CRM leads" onClick={() => { void syncLeads() }} disabled={syncing}>
                👥
              </button>
            </div>
          </div>

          {syncMsg && <div style={{ fontSize: '11px', color: '#6ee7b7', marginBottom: '8px' }}>{syncMsg}</div>}

          {/* Channel filter */}
          <div style={s.filterRow}>
            {(['all', 'email', 'sms'] as const).map(ch => (
              <button key={ch} style={s.filterBtn(channelFilter === ch)} onClick={() => setChannelFilter(ch)}>
                {ch === 'all' ? 'All' : ch === 'email' ? '✉️ Email' : '💬 SMS'}
              </button>
            ))}
            <button style={s.filterBtn(statusFilter === 'closed')} onClick={() => setStatusFilter(prev => prev === 'open' ? 'closed' : 'open')}>
              {statusFilter === 'open' ? 'Open' : 'Closed'}
            </button>
          </div>

          {/* Search */}
          <input
            style={s.searchInput}
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={s.convList}>
          {conversations.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#4b5563', fontSize: '12px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
              No conversations yet.<br />
              Click ↻ to sync Gmail or 👥 to import contacts.
            </div>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              style={s.convItem(selectedId === c.id, c.unread_count)}
              onClick={() => setSelectedId(c.id)}
            >
              <div style={s.convName(c.unread_count)}>
                <span>{channelIcon(c.channel)} {c.contact_name || c.contact_email || 'Unknown'}</span>
                <span style={{ fontSize: '10px', color: '#4b5563', fontWeight: 400 }}>{timeAgo(c.last_message_at)}</span>
              </div>
              <div style={s.convSubject}>{c.subject}</div>
              <div style={s.convPreview}>
                {c.last_message_dir === 'outbound' ? '→ ' : ''}{(c.last_message_body || '').slice(0, 60)}
              </div>
              {parseTags(c.tags).length > 0 && (
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {parseTags(c.tags).slice(0, 3).map(t => (
                    <span key={t} style={s.tag()}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CENTER: Message thread ──────────────────────────────────────────── */}
      <div style={s.centerPanel}>
        {!selectedId ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: '48px' }}>✉️</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#6b7280' }}>Select a conversation</div>
            <div style={{ fontSize: '13px', color: '#374151', textAlign: 'center' }}>
              Sync Gmail or import CRM contacts<br />to start conversations
            </div>
          </div>
        ) : (
          <>
            <div style={s.threadHeader}>
              <div>
                <div style={s.threadTitle}>{selectedConvo?.subject || 'Conversation'}</div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  {selectedConvo?.contact_name && `${selectedConvo.contact_name} · `}
                  {selectedConvo?.contact_email}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.iconBtn} title="Close conversation" onClick={() => { void closeConversation() }}>
                  ✓ Close
                </button>
              </div>
            </div>

            <div style={s.thread}>
              {messages.map(m => (
                <div key={m.id} style={s.bubble(m.direction)}>
                  <div style={s.bubbleInner(m.direction, m.ai_generated === 1)}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                    <div style={s.bubbleMeta}>
                      {m.direction === 'outbound' ? 'Sent' : m.from_address}
                      {' · '}{timeAgo(m.sent_at)}
                      {m.ai_generated === 1 && <span style={{ marginLeft: '6px', color: '#818cf8' }}>✨ AI</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            {/* Reply box */}
            <div style={s.replyBox}>
              {replyDraft && (
                <div style={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '12px' }}>
                  <div style={{ color: '#818cf8', fontWeight: 600, marginBottom: '6px' }}>✨ AI Draft ({replyDraft.tone})</div>
                  <div style={{ color: '#c7d2fe', whiteSpace: 'pre-wrap' }}>{replyDraft.body}</div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <button style={s.btn('primary')} onClick={() => { void sendDraftReply() }}>Use this draft</button>
                    <button style={s.btn('ghost')} onClick={() => setReplyDraft(null)}>Discard</button>
                  </div>
                </div>
              )}
              <textarea
                style={s.replyTextarea}
                placeholder="Type your reply... or use AI to compose →"
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) void sendReply() }}
              />
              <div style={s.replyActions}>
                <button
                  style={s.btn('ghost')}
                  onClick={() => { void composeDraft() }}
                  disabled={agentLoading}
                >
                  {agentLoading ? '⏳' : '✨ AI Draft'}
                </button>
                <button
                  style={s.btn('primary')}
                  onClick={() => { void sendReply() }}
                  disabled={replySending || !replyBody.trim()}
                >
                  {replySending ? 'Sending...' : 'Send ↗'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: Agent panel ──────────────────────────────────────────────── */}
      <div style={s.rightPanel}>
        {selectedConvo ? (
          <>
            {/* Contact info */}
            <div style={s.rightSection}>
              <div style={s.sectionTitle}>Contact</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                  {(selectedConvo.contact_name || selectedConvo.contact_email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e5e7eb' }}>
                    {selectedConvo.contact_name || selectedConvo.contact_email}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedConvo.contact_email}</div>
                </div>
              </div>
              {selectedConvo.contact_phone && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>📱 {selectedConvo.contact_phone}</div>
              )}
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {parseTags(selectedConvo.tags).map(t => (
                  <span key={t} style={s.tag()}>{t}</span>
                ))}
              </div>
            </div>

            {/* AI Agent actions */}
            <div style={s.rightSection}>
              <div style={s.sectionTitle}>AI Agent</div>
              <input
                style={{ ...s.searchInput, marginBottom: '8px' }}
                placeholder="Instruction (optional)..."
                value={agentInstruction}
                onChange={e => setAgentInstruction(e.target.value)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  style={{ ...s.btn('primary'), width: '100%', textAlign: 'left' }}
                  onClick={() => { void classifyConversation() }}
                  disabled={agentLoading}
                >
                  🔍 Classify & Tag
                </button>
                <button
                  style={{ ...s.btn('ghost'), width: '100%', textAlign: 'left' }}
                  onClick={() => { void composeDraft() }}
                  disabled={agentLoading}
                >
                  ✨ Compose Reply
                </button>
              </div>
              {agentLoading && (
                <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '8px' }}>⏳ Agent thinking...</div>
              )}
            </div>

            {/* Classification result */}
            {classification && (
              <div style={s.rightSection}>
                <div style={s.sectionTitle}>Classification</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>Intent</span>
                    <span style={{ ...s.tag(), background: '#1e3a5f' }}>{classification.intent}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>Sentiment</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: sentimentColor(classification.sentiment) }}>
                      {classification.sentiment}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>Urgency</span>
                    <span style={{ ...s.tag(), ...urgencyBadge(classification.urgency) }}>
                      {urgencyBadge(classification.urgency).label}
                    </span>
                  </div>
                  <div style={{ background: '#111827', borderRadius: '8px', padding: '8px 10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '4px', fontWeight: 600 }}>SUMMARY</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>{classification.summary}</div>
                  </div>
                  <div style={{ background: '#1e2d3d', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '4px', fontWeight: 600 }}>NEXT ACTION</div>
                    <div style={{ fontSize: '11px', color: '#93c5fd', lineHeight: 1.5 }}>{classification.nextAction}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div style={s.rightSection}>
              <div style={s.sectionTitle}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  style={{ ...s.btn('green'), width: '100%', textAlign: 'left', fontSize: '11px' }}
                  onClick={() => window.location.href = '/dashboard/leads-crm'}
                >
                  👥 View in CRM
                </button>
                <button
                  style={{ ...s.btn('ghost'), width: '100%', textAlign: 'left', fontSize: '11px' }}
                  onClick={() => window.location.href = '/dashboard/funnel'}
                >
                  🔮 Add to Funnel
                </button>
                <button
                  style={{ ...s.btn('danger'), width: '100%', textAlign: 'left', fontSize: '11px' }}
                  onClick={() => { void closeConversation() }}
                >
                  ✓ Close Thread
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '24px 16px', color: '#4b5563', fontSize: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🤖</div>
            Select a conversation to see AI insights and actions.
          </div>
        )}
      </div>
    </div>
  )
}
