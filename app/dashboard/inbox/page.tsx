'use client'

import { useState, useRef, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Channel = 'email' | 'livechat' | 'sms' | 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'all'
type ConvFilter = 'all' | 'unread' | 'mine' | 'drafts' | 'escalated'
type MsgType = 'inbound' | 'outbound' | 'ai_draft' | 'system'

interface Conversation {
  id: string
  contactName: string
  contactEmail: string
  contactAvatar: string
  channel: Exclude<Channel, 'all'>
  subject: string
  preview: string
  timeAgo: string
  unread: number
  hasAIDraft: boolean
  escalated: boolean
  assignedTo: string | null
  tags: string[]
}

interface Message {
  id: string
  type: MsgType
  from: string
  body: string
  timeAgo: string
  aiConfidence?: number
  aiReasoning?: string
}

interface AIQueueItem {
  id: string
  contactName: string
  channel: Exclude<Channel, 'all'>
  preview: string
  confidence: number
  waitingFor: string
}

// ── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_CONVOS: Conversation[] = [
  { id: '1', contactName: 'Sarah Chen', contactEmail: 'sarah@techcorp.com', contactAvatar: 'SC', channel: 'email', subject: 'Re: Product Demo Request', preview: 'Hi, I wanted to follow up on our call yesterday about the enterprise plan...', timeAgo: '2m ago', unread: 3, hasAIDraft: true, escalated: false, assignedTo: null, tags: ['enterprise', 'warm-lead'] },
  { id: '2', contactName: 'Marcus Johnson', contactEmail: 'marcus@startup.io', contactAvatar: 'MJ', channel: 'livechat', subject: 'Pricing question', preview: 'What is the difference between the Pro and Enterprise plans?', timeAgo: '5m ago', unread: 1, hasAIDraft: false, escalated: false, assignedTo: 'Alex R.', tags: ['pricing'] },
  { id: '3', contactName: 'Priya Patel', contactEmail: 'priya@agency.com', contactAvatar: 'PP', channel: 'instagram', subject: 'DM from @priyamarketing', preview: 'Love your content! Is there a way to get a free trial?', timeAgo: '12m ago', unread: 0, hasAIDraft: true, escalated: false, assignedTo: null, tags: ['trial'] },
  { id: '4', contactName: 'Tom Williams', contactEmail: 'tom@ecommerce.co', contactAvatar: 'TW', channel: 'sms', subject: 'SMS Conversation', preview: 'URGENT: My account was charged twice this month!', timeAgo: '18m ago', unread: 2, hasAIDraft: false, escalated: true, assignedTo: null, tags: ['billing', 'urgent'] },
  { id: '5', contactName: 'Aisha Rahman', contactEmail: 'aisha@consulting.biz', contactAvatar: 'AR', channel: 'linkedin', subject: 'Connection Message', preview: 'Hi! I saw your post about AI marketing automation...', timeAgo: '34m ago', unread: 1, hasAIDraft: true, escalated: false, assignedTo: null, tags: ['outreach'] },
  { id: '6', contactName: 'Jake Morris', contactEmail: 'jake@saas.co', contactAvatar: 'JM', channel: 'twitter', subject: 'Twitter/X DM', preview: 'Hey, does your tool support bulk scheduling for Twitter threads?', timeAgo: '1h ago', unread: 0, hasAIDraft: false, escalated: false, assignedTo: 'Jordan K.', tags: ['feature-request'] },
  { id: '7', contactName: 'Elena Russo', contactEmail: 'elena@design.studio', contactAvatar: 'ER', channel: 'facebook', subject: 'Facebook Message', preview: 'Interested in your agency plan. Can we schedule a call?', timeAgo: '2h ago', unread: 5, hasAIDraft: true, escalated: false, assignedTo: null, tags: ['agency', 'hot-lead'] },
  { id: '8', contactName: 'David Kim', contactEmail: 'david@fintech.com', contactAvatar: 'DK', channel: 'email', subject: 'Refund Request - Invoice #2847', preview: 'I need to request a refund for last months subscription due to...', timeAgo: '3h ago', unread: 0, hasAIDraft: false, escalated: true, assignedTo: null, tags: ['refund', 'escalated'] },
]

const MOCK_MESSAGES: Record<string, Message[]> = {
  '1': [
    { id: 'm1', type: 'inbound', from: 'Sarah Chen', body: 'Hi there, I wanted to reach out after our initial conversation about Ooumph for our marketing team.', timeAgo: '1 day ago' },
    { id: 'm2', type: 'outbound', from: 'You', body: 'Thanks for reaching out Sarah! I would love to show you what Ooumph can do for TechCorp. When would be a good time for a 30-minute demo?', timeAgo: '23h ago' },
    { id: 'm3', type: 'system', from: 'System', body: 'Conversation assigned to AI Agent', timeAgo: '22h ago' },
    { id: 'm4', type: 'inbound', from: 'Sarah Chen', body: 'Tuesday at 2pm works great for me! Also, do you have case studies from B2B SaaS companies? Our CEO will want to see ROI numbers.', timeAgo: '5h ago' },
    { id: 'm5', type: 'inbound', from: 'Sarah Chen', body: 'Also, what is the minimum contract length? We might need to start with a pilot.', timeAgo: '3h ago' },
    { id: 'm6', type: 'inbound', from: 'Sarah Chen', body: 'Hi, I wanted to follow up on our call yesterday about the enterprise plan...', timeAgo: '2m ago' },
    { id: 'm7', type: 'ai_draft', from: 'AI Agent', body: 'Hi Sarah,\n\nThank you for your continued interest! I have confirmed Tuesday at 2pm in your calendar.\n\nRegarding your questions:\n- Yes, we have several B2B SaaS case studies showing 3-5x ROI within 90 days. I will send them over before our call.\n- Our minimum contract is month-to-month, with discounts for annual. A pilot program is absolutely an option we can discuss.\n\nLooking forward to Tuesday!\n\nBest,\nAlex', timeAgo: 'Just now', aiConfidence: 87, aiReasoning: 'Identified intent as demo scheduling + pricing inquiry. Responded to both questions with accurate plan details from workspace knowledge base. Tone set to Professional. Confidence reduced slightly due to pilot program nuance which may require human judgment on specific terms.' },
  ],
  '2': [
    { id: 'm1', type: 'inbound', from: 'Marcus Johnson', body: 'Hey! Quick question - what is the main difference between Pro and Enterprise? Trying to figure out which plan my startup needs.', timeAgo: '5m ago' },
  ],
  '3': [
    { id: 'm1', type: 'inbound', from: 'Priya Patel', body: 'Love your content! Is there a way to get a free trial?', timeAgo: '15m ago' },
    { id: 'm2', type: 'ai_draft', from: 'AI Agent', body: 'Hey Priya! Thanks so much for the kind words 🙏\n\nYes! We offer a 14-day free trial with full access to all Pro features - no credit card required.\n\nYou can start here: ooumph.ai/trial\n\nFeel free to DM if you have any questions!', timeAgo: 'Just now', aiConfidence: 94, aiReasoning: 'High confidence. Instagram DM detected — adjusted tone to casual/friendly. Trial information is standard from knowledge base. CTA included with trial link. No sensitive topics detected.' },
  ],
  '7': [
    { id: 'm1', type: 'inbound', from: 'Elena Russo', body: 'Hi! I manage social media for about 15 clients and I am looking for a tool that can help me scale. Interested in your agency plan.', timeAgo: '2h ago' },
    { id: 'm2', type: 'inbound', from: 'Elena Russo', body: 'Can we schedule a call? I have some specific questions about white-labeling.', timeAgo: '2h ago' },
    { id: 'm3', type: 'ai_draft', from: 'AI Agent', body: 'Hi Elena,\n\nGreat to hear from you! Managing 15 clients is impressive — Ooumph was built with agencies like yours in mind.\n\nOur Agency plan includes:\n✓ Up to 50 client workspaces\n✓ White-label dashboard (your branding)\n✓ Bulk content generation across all accounts\n✓ Client reporting portal\n\nI would love to show you a demo. Here is my calendar link: cal.ooumph.ai/agency-demo\n\nTalk soon!', timeAgo: 'Just now', aiConfidence: 91, aiReasoning: 'Strong match with agency plan inquiry. White-labeling is available in Agency tier — confirmed from pricing knowledge base. Scheduled demo CTA appropriate. High confidence response.' },
  ],
}

const MOCK_AI_QUEUE: AIQueueItem[] = [
  { id: 'q1', contactName: 'Sarah Chen', channel: 'email', preview: 'Hi Sarah, Thank you for your continued interest! I have confirmed Tuesday at 2pm...', confidence: 87, waitingFor: '2m' },
  { id: 'q2', contactName: 'Priya Patel', channel: 'instagram', preview: 'Hey Priya! Thanks so much for the kind words. Yes! We offer a 14-day free trial...', confidence: 94, waitingFor: '12m' },
  { id: 'q3', contactName: 'Aisha Rahman', channel: 'linkedin', preview: 'Hi Aisha, Thanks for connecting! I saw you liked our post on AI marketing. I would love to...', confidence: 82, waitingFor: '34m' },
  { id: 'q4', contactName: 'Elena Russo', channel: 'facebook', preview: 'Hi Elena, Great to hear from you! Managing 15 clients is impressive...', confidence: 91, waitingFor: '2h' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
const CHANNEL_META: Record<Exclude<Channel, 'all'>, { icon: string; label: string; color: string }> = {
  email:     { icon: '📧', label: 'Email',         color: 'text-blue-400' },
  livechat:  { icon: '💬', label: 'Live Chat',     color: 'text-green-400' },
  sms:       { icon: '📱', label: 'SMS',           color: 'text-yellow-400' },
  facebook:  { icon: '📘', label: 'Facebook DMs',  color: 'text-blue-500' },
  instagram: { icon: '📸', label: 'Instagram DMs', color: 'text-pink-400' },
  linkedin:  { icon: '💼', label: 'LinkedIn',      color: 'text-sky-400' },
  twitter:   { icon: '🐦', label: 'Twitter/X',     color: 'text-gray-300' },
}

const CHANNEL_UNREAD: Record<Exclude<Channel, 'all'>, number> = {
  email: 12, livechat: 3, sms: 7, facebook: 5, instagram: 8, linkedin: 2, twitter: 4,
}

const AVATAR_COLORS = ['bg-indigo-600', 'bg-purple-600', 'bg-pink-600', 'bg-sky-600', 'bg-emerald-600', 'bg-orange-600', 'bg-rose-600', 'bg-teal-600']
function avatarColor(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] }

function confidenceColor(n: number) {
  if (n >= 90) return 'text-green-400'
  if (n >= 75) return 'text-yellow-400'
  return 'text-red-400'
}

// ── DB row types ───────────────────────────────────────────────────────────────
interface DBConversation {
  id: string
  workspace_id: string
  contact_id: string | null
  contact_email: string | null
  contact_name: string | null
  contact_phone: string | null
  channel: string
  subject: string | null
  status: string
  tags: string | null
  assigned_to: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
  last_message_body?: string | null
  last_message_dir?: string | null
}

interface DBMessage {
  id: string
  conversation_id: string
  workspace_id: string
  direction: string
  from_address: string | null
  to_address: string | null
  subject: string | null
  body: string
  channel: string
  status: string
  ai_generated: number
  sent_at: string
  created_at: string
}

function timeAgoFromISO(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function normalizeChannel(ch: string | null | undefined): Exclude<Channel, 'all'> {
  const c = (ch || 'email').toLowerCase()
  if (c === 'email' || c === 'livechat' || c === 'sms' || c === 'facebook' || c === 'instagram' || c === 'linkedin' || c === 'twitter') return c
  return 'email'
}

function dbConvToUI(c: DBConversation): Conversation {
  const name = c.contact_name || c.contact_email || 'Unknown'
  let tags: string[] = []
  try { tags = c.tags ? JSON.parse(c.tags) as string[] : [] } catch { tags = [] }
  const initials = name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return {
    id: c.id,
    contactName: name,
    contactEmail: c.contact_email || '',
    contactAvatar: initials || '??',
    channel: normalizeChannel(c.channel),
    subject: c.subject || '',
    preview: (c.last_message_body || '').slice(0, 160),
    timeAgo: timeAgoFromISO(c.last_message_at || c.created_at),
    unread: Number(c.unread_count || 0),
    hasAIDraft: false, // updated after we fetch messages
    escalated: false,
    assignedTo: c.assigned_to,
    tags,
  }
}

function dbMsgToUI(m: DBMessage): Message {
  let type: MsgType = m.direction === 'inbound' ? 'inbound' : 'outbound'
  if (m.direction === 'outbound' && m.ai_generated && m.status === 'draft') type = 'ai_draft'
  return {
    id: m.id,
    type,
    from: m.direction === 'inbound' ? (m.from_address || 'Contact') : (m.ai_generated ? 'AI Agent' : 'You'),
    body: m.body,
    timeAgo: timeAgoFromISO(m.sent_at || m.created_at),
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convosLoading, setConvosLoading] = useState(true)
  const [convosError, setConvosError] = useState<string | null>(null)
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [activeChannel, setActiveChannel] = useState<Channel>('all')
  const [convFilter, setConvFilter] = useState<ConvFilter>('all')
  const [convSearch, setConvSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [autoReplyOn, setAutoReplyOn] = useState(true)
  const [hitlMode, setHitlMode] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState(80)
  const [showAIQueue, setShowAIQueue] = useState(false)
  const [showAISettings, setShowAISettings] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [expandedReasoning, setExpandedReasoning] = useState(false)
  const [aiDraftEditing, setAIDraftEditing] = useState(false)
  const [editedDraft, setEditedDraft] = useState('')
  const [approvedDrafts, setApprovedDrafts] = useState<Set<string>>(new Set())
  const [rejectedDrafts, setRejectedDrafts] = useState<Set<string>>(new Set())
  const [aiSuggestLoading, setAISuggestLoading] = useState(false)
  const [queueItems, setQueueItems] = useState<AIQueueItem[]>([])
  const [settingsTone, setSettingsTone] = useState<'professional' | 'friendly' | 'concise'>('professional')
  const [maxAutoReplies, setMaxAutoReplies] = useState(3)
  const [escalateTopics, setEscalateTopics] = useState({ complaints: true, refunds: true, pricing: false, legal: true })
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false)
  const [perChannelAI, setPerChannelAI] = useState<Record<string, boolean>>({ email: true, livechat: true, sms: false, facebook: true, instagram: true, linkedin: true, twitter: true })
  const [messages, setMessages] = useState<Message[]>([])
  const threadEndRef = useRef<HTMLDivElement>(null)

  const selectedConv = conversations.find(c => c.id === selectedConvId) || null

  // ── Load conversations ─────────────────────────────────────────────────────
  const loadConversations = (wsId: string) => {
    setConvosLoading(true); setConvosError(null)
    return fetch(`/api/inbox?workspaceId=${wsId}`)
      .then(r => r.ok ? r.json() as Promise<DBConversation[] | { error: string }> : Promise.reject(new Error('Failed to fetch inbox')))
      .then(data => {
        if (!Array.isArray(data)) throw new Error((data as { error?: string }).error || 'Bad response')
        const ui = data.map(dbConvToUI)
        setConversations(ui)
      })
      .catch(err => setConvosError(err instanceof Error ? err.message : String(err)))
      .finally(() => setConvosLoading(false))
  }

  useEffect(() => {
    const wsId = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null
    setWorkspaceId(wsId)

    // Restore AI auto-reply preference from localStorage
    const stored = typeof window !== 'undefined' ? localStorage.getItem('inbox_auto_reply_on') : null
    if (stored !== null) setAutoReplyOn(stored === 'true')

    if (wsId) loadConversations(wsId)
    else setConvosLoading(false)
  }, [])

  // Persist auto-reply preference + try to PATCH workspace extra_settings
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('inbox_auto_reply_on', String(autoReplyOn))
  }, [autoReplyOn])

  // ── Load messages for selected conversation ─────────────────────────────────
  useEffect(() => {
    if (!selectedConvId) { setMessages([]); return }
    setMessagesLoading(true)
    fetch(`/api/inbox/${selectedConvId}`)
      .then(r => r.ok ? r.json() as Promise<{ conversation?: DBConversation; messages?: DBMessage[]; error?: string }> : Promise.reject(new Error('Failed to fetch thread')))
      .then(data => {
        if (data.error) throw new Error(data.error)
        const ms = (data.messages || []).map(dbMsgToUI)
        setMessages(ms)
        setExpandedReasoning(false)
        setAIDraftEditing(false)
        // Mark the convo as read locally
        setConversations(prev => prev.map(c => c.id === selectedConvId ? { ...c, unread: 0 } : c))
      })
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false))
  }, [selectedConvId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredConvos = conversations.filter(c => {
    if (activeChannel !== 'all' && c.channel !== activeChannel) return false
    if (convFilter === 'unread' && c.unread === 0) return false
    if (convFilter === 'mine' && !c.assignedTo) return false
    if (convFilter === 'drafts' && !c.hasAIDraft) return false
    if (convFilter === 'escalated' && !c.escalated) return false
    if (convSearch && !c.contactName.toLowerCase().includes(convSearch.toLowerCase()) && !c.preview.toLowerCase().includes(convSearch.toLowerCase())) return false
    return true
  })

  // Real per-channel unread counts
  const channelUnread: Record<Exclude<Channel, 'all'>, number> = {
    email: 0, livechat: 0, sms: 0, facebook: 0, instagram: 0, linkedin: 0, twitter: 0,
  }
  conversations.forEach(c => { channelUnread[c.channel] = (channelUnread[c.channel] || 0) + c.unread })
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  const aiDraftMsg = messages.find(m => m.type === 'ai_draft' && !approvedDrafts.has(m.id) && !rejectedDrafts.has(m.id))

  async function handleApprove(msgId: string) {
    // Optimistic: mark approved locally so UI updates
    setApprovedDrafts(prev => new Set([...prev, msgId]))
    const msg = messages.find(m => m.id === msgId)
    if (msg) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: 'outbound' as MsgType, from: 'You (via AI)', timeAgo: 'Just now' } : m))
    }
    setQueueItems(prev => prev.filter(q => q.id !== msgId))
    // Persist: re-send body via reply endpoint (which marks as sent + actually emails)
    if (msg && selectedConvId) {
      try {
        await fetch(`/api/inbox/${selectedConvId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: msg.body, aiGenerated: true }),
        })
        if (workspaceId) loadConversations(workspaceId)
      } catch { /* keep optimistic state */ }
    }
  }

  async function handleReject(msgId: string) {
    setRejectedDrafts(prev => new Set([...prev, msgId]))
    setMessages(prev => prev.filter(m => m.id !== msgId))
    setQueueItems(prev => prev.filter(q => q.id !== msgId))
  }

  async function handleEditSend(msgId: string) {
    const newBody = editedDraft
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: 'outbound' as MsgType, body: newBody || m.body, from: 'You (edited AI)', timeAgo: 'Just now' } : m))
    setApprovedDrafts(prev => new Set([...prev, msgId]))
    setAIDraftEditing(false)
    setQueueItems(prev => prev.filter(q => q.id !== msgId))
    if (selectedConvId && newBody) {
      try {
        await fetch(`/api/inbox/${selectedConvId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: newBody, aiGenerated: true }),
        })
        if (workspaceId) loadConversations(workspaceId)
      } catch { /* keep optimistic state */ }
    }
  }

  async function handleSend() {
    if (!replyText.trim() || !selectedConvId) return
    const body = replyText
    const optimisticMsg: Message = { id: `m${Date.now()}`, type: 'outbound', from: 'You', body, timeAgo: 'Just now' }
    setMessages(prev => [...prev, optimisticMsg])
    setReplyText('')
    setSendingReply(true)
    try {
      const res = await fetch(`/api/inbox/${selectedConvId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        // Rollback
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        setReplyText(body)
      } else if (workspaceId) {
        loadConversations(workspaceId)
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      setReplyText(body)
    } finally {
      setSendingReply(false)
    }
  }

  // Load AI draft queue when modal opens
  async function loadAIQueue() {
    if (!workspaceId) return
    try {
      // Fetch conversations whose latest message is an AI draft (status=draft, ai_generated=1)
      const res = await fetch(`/api/inbox?workspaceId=${workspaceId}`)
      const data = await res.json() as DBConversation[]
      if (!Array.isArray(data)) return
      // We don't have a per-conversation draft endpoint, so fetch each thread in parallel and check
      const items: AIQueueItem[] = []
      await Promise.all(data.slice(0, 30).map(async c => {
        try {
          const tr = await fetch(`/api/inbox/${c.id}`)
          if (!tr.ok) return
          const td = await tr.json() as { messages?: DBMessage[] }
          const drafts = (td.messages || []).filter(m => m.direction === 'outbound' && m.status === 'draft' && m.ai_generated)
          drafts.forEach(d => {
            items.push({
              id: d.id,
              contactName: c.contact_name || c.contact_email || 'Unknown',
              channel: normalizeChannel(c.channel),
              preview: d.body.slice(0, 160),
              confidence: 85,
              waitingFor: timeAgoFromISO(d.created_at),
            })
          })
        } catch { /* noop */ }
      }))
      setQueueItems(items)
    } catch { /* noop */ }
  }

  function handleAISuggest() {
    setAISuggestLoading(true)
    setTimeout(() => {
      setReplyText('Thank you for reaching out! I would be happy to help with your inquiry. Could you share a bit more detail so I can provide the most accurate information for your situation?')
      setAISuggestLoading(false)
    }, 1200)
  }

  function handleQueueApproveAll() {
    const highConf = queueItems.filter(q => q.confidence >= 90)
    setQueueItems(prev => prev.filter(q => q.confidence < 90))
    highConf.forEach(q => {
      if (q.id === 'q2' || q.id === 'q4') {
        // These map to conversations with AI drafts
      }
    })
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-950 overflow-hidden">

      {/* ── LEFT: Channel list (w-56) ───────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Inbox</span>
            <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{totalUnread}</span>
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => setActiveChannel('all')}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeChannel === 'all' ? 'bg-indigo-600/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            <span>⭐</span>
            <span className="flex-1 text-left">All Unread</span>
            <span className="text-xs font-semibold text-indigo-400">{totalUnread}</span>
          </button>

          <div className="mt-1 mb-2 px-4">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Channels</span>
          </div>

          {(Object.entries(CHANNEL_META) as [Exclude<Channel, 'all'>, typeof CHANNEL_META[keyof typeof CHANNEL_META]][]).map(([ch, meta]) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeChannel === ch ? 'bg-indigo-600/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <span>{meta.icon}</span>
              <span className="flex-1 text-left truncate">{meta.label}</span>
              {channelUnread[ch] > 0 && (
                <span className="text-xs font-semibold text-gray-500">{channelUnread[ch]}</span>
              )}
            </button>
          ))}

          {/* AI Agent section */}
          <div className="mt-4 px-4 mb-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Agent</span>
          </div>

          <div className="px-4 space-y-3 pb-4">
            {/* Auto-reply toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">🤖 Auto-Reply</span>
              </div>
              <button
                onClick={() => setAutoReplyOn(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${autoReplyOn ? 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${autoReplyOn ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>

            {/* HITL toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">HITL Mode</span>
              <button
                onClick={() => setHitlMode(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${hitlMode ? 'bg-yellow-500' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${hitlMode ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Confidence threshold */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Show if AI &lt;</span>
                <span className="text-xs font-semibold text-indigo-400">{confidenceThreshold}%</span>
              </div>
              <input
                type="range" min={50} max={99} value={confidenceThreshold}
                onChange={e => setConfidenceThreshold(Number(e.target.value))}
                className="w-full accent-indigo-500 h-1"
              />
            </div>

            <button
              onClick={() => { setShowAIQueue(true); loadAIQueue() }}
              className="w-full text-xs bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors text-left"
            >
              View AI Queue ({queueItems.length})
            </button>

            <button
              onClick={() => setShowAISettings(true)}
              className="w-full text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors text-left"
            >
              ⚙ AI Settings
            </button>
          </div>
        </div>
      </div>

      {/* ── MIDDLE: Conversation list (w-80) ────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 space-y-2">
          <input
            className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-lg placeholder-gray-500 outline-none focus:border-indigo-500"
            placeholder="Search conversations..."
            value={convSearch}
            onChange={e => setConvSearch(e.target.value)}
          />
          <div className="flex gap-1 overflow-x-auto pb-1">
            {([
              ['all', 'All'], ['unread', 'Unread'], ['mine', 'Mine'], ['drafts', 'AI Drafts'], ['escalated', 'Escalated']
            ] as [ConvFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setConvFilter(f)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${convFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convosLoading && (
            <div className="p-6 text-center text-gray-600 text-sm">
              <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!convosLoading && convosError && (
            <div className="p-6 text-center text-red-400 text-sm">
              {convosError}
              <button onClick={() => workspaceId && loadConversations(workspaceId)} className="block mt-2 mx-auto text-xs text-indigo-400 hover:text-indigo-300">Retry</button>
            </div>
          )}
          {!convosLoading && !convosError && conversations.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-gray-300">No conversations yet</p>
              <p className="text-gray-600 text-xs mt-1">Connect a channel in <a href="/dashboard/integrations" className="text-indigo-400 hover:text-indigo-300">Integrations</a> to start receiving messages.</p>
            </div>
          )}
          {!convosLoading && !convosError && conversations.length > 0 && filteredConvos.length === 0 && (
            <div className="p-6 text-center text-gray-600 text-sm">No conversations match this filter</div>
          )}
          {filteredConvos.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedConvId(c.id)}
              className={`group relative px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors ${
                selectedConvId === c.id ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(c.contactName)}`}>
                  {c.contactAvatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold ${c.unread > 0 ? 'text-white' : 'text-gray-300'}`}>
                        {c.contactName}
                      </span>
                      <span className="text-xs">{CHANNEL_META[c.channel].icon}</span>
                    </div>
                    <span className="text-xs text-gray-600">{c.timeAgo}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-1">{c.preview}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.unread > 0 && (
                      <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{c.unread}</span>
                    )}
                    {c.hasAIDraft && !c.escalated && (
                      <span className="bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full font-medium">AI Draft</span>
                    )}
                    {c.escalated && (
                      <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-xs px-1.5 py-0.5 rounded-full font-medium">Escalated</span>
                    )}
                    {c.assignedTo && (
                      <span className="bg-gray-700 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">{c.assignedTo}</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Assign on hover */}
              <button className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:text-indigo-300 transition-opacity">
                Assign to Me
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Message thread (flex-1) ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-4 text-gray-600">
            <span className="text-5xl">💬</span>
            <span className="text-lg font-semibold">Select a conversation</span>
            <span className="text-sm text-gray-700">Choose from the list to start replying</span>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(selectedConv.contactName)}`}>
                  {selectedConv.contactAvatar}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{selectedConv.contactName}</span>
                    <span className="text-sm">{CHANNEL_META[selectedConv.channel].icon}</span>
                    <span className={`text-xs ${CHANNEL_META[selectedConv.channel].color}`}>{CHANNEL_META[selectedConv.channel].label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{selectedConv.contactEmail}</span>
                    <a href="/dashboard/leads-crm" className="text-xs text-indigo-400 hover:text-indigo-300">View in CRM →</a>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select className="bg-gray-800 border border-gray-700 text-gray-300 text-xs px-2 py-1.5 rounded-lg outline-none">
                  <option>Assign to...</option>
                  <option>Alex R.</option>
                  <option>Jordan K.</option>
                  <option>Sam T.</option>
                  <option>AI Agent</option>
                </select>
                <div className="flex gap-1">
                  {selectedConv.tags.map(tag => (
                    <span key={tag} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full border border-gray-700">{tag}</span>
                  ))}
                </div>
                <button className="bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs px-3 py-1.5 rounded-lg border border-gray-700 transition-colors">
                  ✓ Close
                </button>
              </div>
            </div>

            {/* HITL banner */}
            {hitlMode && aiDraftMsg && (
              <div className="mx-6 mt-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-semibold text-sm">🤖 AI wants to send this reply</span>
                    <span className={`text-xs font-bold ${confidenceColor(aiDraftMsg.aiConfidence || 0)}`}>
                      confidence: {aiDraftMsg.aiConfidence}%
                    </span>
                  </div>
                </div>

                {aiDraftEditing ? (
                  <textarea
                    className="w-full bg-gray-900 border border-yellow-500/30 text-gray-200 text-sm px-3 py-2 rounded-lg outline-none resize-none min-h-[100px] mb-3"
                    value={editedDraft || aiDraftMsg.body}
                    onChange={e => setEditedDraft(e.target.value)}
                  />
                ) : (
                  <div className="bg-gray-900/60 rounded-lg p-3 mb-3 text-sm text-gray-300 whitespace-pre-wrap">
                    {aiDraftMsg.body}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {aiDraftEditing ? (
                    <button onClick={() => handleEditSend(aiDraftMsg.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                      ✅ Send Edited
                    </button>
                  ) : (
                    <button onClick={() => handleApprove(aiDraftMsg.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                      ✅ Approve & Send
                    </button>
                  )}
                  <button
                    onClick={() => { setAIDraftEditing(v => !v); setEditedDraft(aiDraftMsg.body) }}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    ✏ {aiDraftEditing ? 'Cancel Edit' : 'Edit & Send'}
                  </button>
                  <button onClick={() => handleReject(aiDraftMsg.id)} className="bg-red-900/50 hover:bg-red-900 text-red-400 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                    ❌ Reject
                  </button>
                  <button
                    onClick={() => setExpandedReasoning(v => !v)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-auto"
                  >
                    Why this response? {expandedReasoning ? '▲' : '▼'}
                  </button>
                </div>

                {expandedReasoning && aiDraftMsg.aiReasoning && (
                  <div className="mt-3 bg-gray-900/80 rounded-lg p-3 text-xs text-gray-400 leading-relaxed border border-gray-800">
                    <span className="font-semibold text-gray-300">AI Reasoning: </span>
                    {aiDraftMsg.aiReasoning}
                  </div>
                )}
              </div>
            )}

            {/* Message thread */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.map(m => {
                const isApproved = approvedDrafts.has(m.id)
                const isRejected = rejectedDrafts.has(m.id)
                if (isRejected) return null

                if (m.type === 'system') {
                  return (
                    <div key={m.id} className="flex items-center gap-3 justify-center">
                      <div className="h-px bg-gray-800 flex-1" />
                      <span className="text-xs text-gray-600 px-2">{m.body}</span>
                      <div className="h-px bg-gray-800 flex-1" />
                    </div>
                  )
                }

                const effectiveType = (m.type === 'ai_draft' && isApproved) ? 'outbound' : m.type

                return (
                  <div key={m.id} className={`flex ${effectiveType === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] ${effectiveType === 'ai_draft' ? 'w-full max-w-full' : ''}`}>
                      {effectiveType === 'ai_draft' && !hitlMode && (
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-semibold text-yellow-400 border border-yellow-500/40 px-2 py-0.5 rounded-full bg-yellow-500/10">AI Draft — Review Before Sending</span>
                          <span className={`text-xs font-bold ${confidenceColor(m.aiConfidence || 0)}`}>{m.aiConfidence}%</span>
                        </div>
                      )}
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        effectiveType === 'outbound'
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : effectiveType === 'ai_draft'
                          ? 'bg-yellow-500/5 border border-yellow-500/30 text-gray-300 rounded-tl-sm'
                          : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                      }`}>
                        {m.body}
                      </div>
                      <div className={`text-xs text-gray-600 mt-1 ${effectiveType === 'outbound' ? 'text-right' : ''}`}>
                        {m.from} · {m.timeAgo}
                        {(effectiveType === 'outbound' && m.from.includes('AI')) && <span className="ml-1 text-indigo-400">✨ AI</span>}
                      </div>
                      {effectiveType === 'ai_draft' && !hitlMode && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleApprove(m.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">✅ Approve</button>
                          <button onClick={() => { setAIDraftEditing(true); setEditedDraft(m.body) }} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">✏ Edit</button>
                          <button onClick={() => handleReject(m.id)} className="bg-red-900/50 text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors">❌ Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Message composer */}
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900">
              {autoReplyOn && perChannelAI[selectedConv.channel] && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-2 py-0.5 rounded-full">🤖 AI will auto-reply to this channel</span>
                </div>
              )}
              <textarea
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm px-4 py-3 rounded-xl outline-none focus:border-indigo-500 resize-none placeholder-gray-600"
                placeholder="Reply..."
                rows={3}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSend() }}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button className="text-gray-500 hover:text-gray-300 text-sm transition-colors px-1">😊</button>
                  <button className="text-gray-500 hover:text-gray-300 text-sm transition-colors px-1">📎</button>
                  <button className="text-gray-500 hover:text-gray-300 text-xs transition-colors px-2 py-1 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600">Templates</button>
                  <button
                    onClick={handleAISuggest}
                    disabled={aiSuggestLoading}
                    className="text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
                  >
                    {aiSuggestLoading ? <span className="animate-pulse">⏳</span> : '🤖'} Suggest Reply
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sendingReply}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {sendingReply ? 'Sending…' : 'Send ↗'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── AI QUEUE MODAL ───────────────────────────────────────────────────── */}
      {showAIQueue && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-white font-bold text-lg">AI Reply Queue</h2>
                <p className="text-gray-500 text-xs mt-0.5">{queueItems.length} draft{queueItems.length !== 1 ? 's' : ''} awaiting human review</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleQueueApproveAll}
                  className="bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  ✅ Approve All High Confidence (&gt;90%)
                </button>
                <button onClick={() => setShowAIQueue(false)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {queueItems.length === 0 && (
                <div className="text-center py-8 text-gray-600">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-sm">All caught up! No drafts waiting.</p>
                </div>
              )}
              {queueItems.map(item => (
                <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(item.contactName)}`}>
                          {item.contactName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-white text-sm font-semibold">{item.contactName}</span>
                        <span className="text-xs">{CHANNEL_META[item.channel].icon}</span>
                        <span className={`text-xs font-bold ${confidenceColor(item.confidence)}`}>{item.confidence}% confidence</span>
                        <span className="text-xs text-gray-600">waiting {item.waitingFor}</span>
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">{item.preview}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setQueueItems(prev => prev.filter(q => q.id !== item.id))}
                        className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        ✅ Approve
                      </button>
                      <button className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
                        ✏ Edit
                      </button>
                      <button
                        onClick={() => setQueueItems(prev => prev.filter(q => q.id !== item.id))}
                        className="bg-red-900/50 hover:bg-red-900 text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── AI SETTINGS MODAL ───────────────────────────────────────────────── */}
      {showAISettings && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold text-lg">⚙ AI Auto-Reply Settings</h2>
              <button onClick={() => setShowAISettings(false)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Per-channel toggles */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Enable AI Per Channel</h3>
                <div className="space-y-2">
                  {(Object.entries(CHANNEL_META) as [string, typeof CHANNEL_META[keyof typeof CHANNEL_META]][]).map(([ch, meta]) => (
                    <div key={ch} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-300">{meta.icon} {meta.label}</span>
                      <button
                        onClick={() => setPerChannelAI(prev => ({ ...prev, [ch]: !prev[ch] }))}
                        className={`relative w-9 h-5 rounded-full transition-colors ${perChannelAI[ch] ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${perChannelAI[ch] ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Response Tone</h3>
                <div className="flex gap-2">
                  {(['professional', 'friendly', 'concise'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => setSettingsTone(tone)}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition-colors border ${settingsTone === tone ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max auto-replies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Max Auto-Replies Before Escalating</h3>
                  <span className="text-indigo-400 font-bold text-sm">{maxAutoReplies}</span>
                </div>
                <input type="range" min={1} max={10} value={maxAutoReplies} onChange={e => setMaxAutoReplies(Number(e.target.value))} className="w-full accent-indigo-500 h-1" />
                <div className="flex justify-between text-xs text-gray-600 mt-1"><span>1</span><span>10</span></div>
              </div>

              {/* Always escalate */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Always Escalate to Human</h3>
                <div className="space-y-2">
                  {(Object.entries(escalateTopics) as [keyof typeof escalateTopics, boolean][]).map(([topic, on]) => (
                    <label key={topic} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setEscalateTopics(prev => ({ ...prev, [topic]: !prev[topic] }))}
                        className="w-4 h-4 rounded accent-indigo-500"
                      />
                      <span className="text-sm text-gray-300 capitalize">{topic}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Business hours */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-300">Business Hours Only</span>
                  <p className="text-xs text-gray-600">AI only replies Mon–Fri, 9am–6pm</p>
                </div>
                <button
                  onClick={() => setBusinessHoursOnly(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${businessHoursOnly ? 'bg-indigo-600' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${businessHoursOnly ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>

              <button className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm py-2.5 rounded-lg border border-gray-700 transition-colors">
                🧠 Train on Past Replies
              </button>

              <button
                onClick={() => setShowAISettings(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
