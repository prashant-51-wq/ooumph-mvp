'use client'

/**
 * /dashboard/voice-ai
 *
 * Virtual operator control deck. Two-pane layout:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Tabs: Agents · Call Logs                                            │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  AGENTS TAB                                                          │
 *   │   ┌────────┐ ┌────────┐ ┌────────┐                                   │
 *   │   │  Agent │ │  Agent │ │   +    │   Card deck.                      │
 *   │   │  Card  │ │  Card  │ │  New   │   Vapi=purple, Retell=blue,       │
 *   │   └────────┘ └────────┘ └────────┘   Twilio=orange.                  │
 *   │                                                                       │
 *   │  CALL LOGS TAB                                                       │
 *   │   chronological ledger · direction arrows · duration · sentiment     │
 *   │   click row → sliding drawer with audio + summary + chat heat-map    │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Agent Configurator modal handles full CRUD via /api/voice-agents — system
 * prompt textarea, temperature slider, model select, voice profile selector
 * sourced from /api/voice-profiles.
 *
 * Call Detail Drawer parses transcript heuristically into Agent/Caller turns
 * and tints lines by sentiment keywords (frustrated → rose, positive →
 * emerald). The Sprint 8 backend already wrote the call's overall
 * sentiment_score; per-line tinting is a UI heuristic to surface turning
 * points without re-running the LLM.
 *
 * CRM continuity: when a call_logs row carries lead_id, the drawer shows a
 * "View in CRM →" link that deep-links to /dashboard/leads-crm?leadId=…
 * (same workspaceId scope).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ProviderConnectBanner } from '@/components/dashboard/ProviderConnectBanner'
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, RefreshCw, AlertCircle,
  Plus, Loader2, X, Pause, Play, Trash2,
  Mic, MessageSquare, Activity, Sparkles, ChevronRight,
  User as UserIcon, Bot, ExternalLink, Volume2, Waves, Settings2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface VoiceAgent {
  id: string
  workspace_id: string
  voice_profile_id: string | null
  provider: 'vapi' | 'retell' | 'twilio' | string
  agent_name: string
  phone_number: string | null
  system_prompt: string | null
  temperature: number | string | null
  llm_model: string | null
  status: 'active' | 'paused' | 'draft' | 'archived' | string
  created_at: string
}

interface VoiceProfile {
  id: string
  voice_name: string
  provider: string
  gender: string | null
  accent_label: string | null
  status: string
}

interface CallLog {
  id: string
  workspace_id: string
  voice_agent_id: string | null
  lead_id: string | null
  provider: string | null
  direction: 'inbound' | 'outbound' | string | null
  from_number: string | null
  to_number: string | null
  duration_seconds: number | string
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment_score: number | string | null
  call_status: string
  action_taken: string | null
  metadata_json: string
  created_at: string
}

interface AgentDraft {
  id?: string
  agentName: string
  phoneNumber: string
  provider: 'vapi' | 'retell' | 'twilio'
  systemPrompt: string
  temperature: number
  llmModel: string
  voiceProfileId: string | null
  status: 'active' | 'paused' | 'draft' | 'archived'
}

type Tab = 'agents' | 'calls'

// ─── Provider badges ──────────────────────────────────────────────────────

const PROVIDER_STYLES: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  vapi:   { label: 'Vapi',   bg: 'bg-purple-500/15', text: 'text-purple-300', ring: 'ring-purple-500/30' },
  retell: { label: 'Retell', bg: 'bg-blue-500/15',   text: 'text-blue-300',   ring: 'ring-blue-500/30' },
  twilio: { label: 'Twilio', bg: 'bg-orange-500/15', text: 'text-orange-300', ring: 'ring-orange-500/30' },
}

function providerStyle(p: string | null | undefined) {
  return PROVIDER_STYLES[(p || '').toLowerCase()] || {
    label: p || 'Unknown',
    bg: 'bg-gray-500/15',
    text: 'text-gray-300',
    ring: 'ring-gray-500/30',
  }
}

// ─── Status pill ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    active:   { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
    paused:   { bg: 'bg-amber-500/15',   text: 'text-amber-300' },
    draft:    { bg: 'bg-gray-500/15',    text: 'text-gray-300' },
    archived: { bg: 'bg-gray-500/10',    text: 'text-gray-500' },
  }
  const c = map[status] || { bg: 'bg-gray-500/10', text: 'text-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

function sentimentColor(score: number | null): { label: string; bg: string; text: string } {
  if (score === null) return { label: 'unscored', bg: 'bg-gray-500/10', text: 'text-gray-400' }
  if (score >= 0.7) return { label: 'positive', bg: 'bg-emerald-500/15', text: 'text-emerald-300' }
  if (score >= 0.45) return { label: 'neutral', bg: 'bg-indigo-500/15', text: 'text-indigo-300' }
  if (score >= 0.25) return { label: 'mixed', bg: 'bg-amber-500/15', text: 'text-amber-300' }
  return { label: 'negative', bg: 'bg-rose-500/15', text: 'text-rose-300' }
}

// ─── Sentiment heuristic for chat lines ───────────────────────────────────
// Lightweight keyword scan — surfaces turning points visually without
// re-running the LLM. NOT meant to override the row-level sentiment_score.

const POSITIVE_HINTS = [
  'thank', 'thanks', 'great', 'perfect', 'awesome', 'love', 'excellent',
  'amazing', 'wonderful', 'happy', 'glad', 'appreciate', 'fantastic',
  'sounds good', 'works for me', "i'll take it", 'yes please', 'sign me up',
]
const NEGATIVE_HINTS = [
  'frustrated', 'angry', 'annoyed', 'upset', 'unacceptable', 'ridiculous',
  'terrible', 'awful', 'worst', 'hate', "doesn't work", 'broken', 'wrong',
  'cancel', 'refund', 'complaint', 'disappointed', 'useless',
  'speak to a manager', 'this is bad', "i'm done",
]

function lineSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase()
  let pos = 0
  let neg = 0
  for (const k of POSITIVE_HINTS) if (lower.includes(k)) pos++
  for (const k of NEGATIVE_HINTS) if (lower.includes(k)) neg++
  if (neg > pos) return 'negative'
  if (pos > neg) return 'positive'
  return 'neutral'
}

// ─── Transcript parser ───────────────────────────────────────────────────
//
// Vapi / Whisper give us free-form transcripts. We support three shapes:
//   1. Prefixed lines: "AI: ...\nUser: ..." or "Agent: ..." / "Caller: ..."
//   2. Speaker-stamped: "[Agent] ...\n[Caller] ..."
//   3. Plain prose — alternate speakers heuristically (sentence chunks)

interface ChatTurn {
  speaker: 'agent' | 'caller'
  text: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

const AGENT_PREFIXES = /^(ai|agent|assistant|bot|operator)\b/i
const CALLER_PREFIXES = /^(user|caller|human|customer|client)\b/i

function parseTranscript(raw: string | null): ChatTurn[] {
  if (!raw?.trim()) return []
  const text = raw.replace(/\r\n/g, '\n').trim()
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)

  // Pass 1 — look for explicit speaker prefixes.
  const turns: ChatTurn[] = []
  let prefixHits = 0
  for (const line of lines) {
    const cleaned = line.replace(/^\[([^\]]+)\]\s*/, '$1: ')
    const m = cleaned.match(/^([A-Za-z _-]{1,20})\s*[:\-]\s*(.+)$/)
    if (m) {
      const tag = m[1].trim()
      const body = m[2].trim()
      if (AGENT_PREFIXES.test(tag)) {
        turns.push({ speaker: 'agent', text: body, sentiment: lineSentiment(body) })
        prefixHits++
        continue
      }
      if (CALLER_PREFIXES.test(tag)) {
        turns.push({ speaker: 'caller', text: body, sentiment: lineSentiment(body) })
        prefixHits++
        continue
      }
    }
    turns.push({ speaker: 'caller', text: cleaned, sentiment: lineSentiment(cleaned) })
  }

  if (prefixHits >= Math.ceil(lines.length / 2)) return turns

  // Pass 2 — alternation fallback for un-tagged prose.
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
  if (sentences.length <= 1) {
    return [{ speaker: 'caller', text, sentiment: lineSentiment(text) }]
  }
  return sentences.map((s, i) => ({
    speaker: i % 2 === 0 ? 'agent' : 'caller',
    text: s,
    sentiment: lineSentiment(s),
  }))
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function VoiceAiPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('agents')
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [agents, setAgents] = useState<VoiceAgent[]>([])
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState<AgentDraft | null>(null)
  const [savingAgent, setSavingAgent] = useState(false)

  const [calls, setCalls] = useState<CallLog[]>([])
  const [callsLoading, setCallsLoading] = useState(true)
  const [openCallId, setOpenCallId] = useState<string | null>(null)

  // Sprint 19D: ElevenLabs readiness for the in-product connect banner.
  const [elevenReady, setElevenReady] = useState<boolean | null>(null)
  const refreshElevenReady = useCallback(async () => {
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/workspaces?id=${workspaceId}`, { credentials: 'include' })
      if (!r.ok) { setElevenReady(false); return }
      const data = await r.json() as { secrets?: Record<string, boolean> }
      setElevenReady(Boolean(data.secrets?.elevenlabs))
    } catch { setElevenReady(false) }
  }, [workspaceId])

  useEffect(() => { void refreshElevenReady() }, [refreshElevenReady])

  // ── Session ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const id: string | null = data?.user?.workspaceId
          || (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null)
        setWorkspaceId(id)
        if (!id) setError('No workspace selected — finish onboarding first.')
      })
      .catch(() => { if (!cancelled) setError('Failed to load session') })
    return () => { cancelled = true }
  }, [])

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchAgents = useCallback(async () => {
    if (!workspaceId) return
    setAgentsLoading(true)
    try {
      const [agentRes, voiceRes] = await Promise.all([
        fetch(`/api/voice-agents?workspaceId=${workspaceId}`),
        fetch(`/api/voice-profiles?workspaceId=${workspaceId}`),
      ])
      const agentRows = await agentRes.json() as VoiceAgent[] | { error: string }
      const voiceRows = await voiceRes.json() as VoiceProfile[] | { error: string }
      setAgents(Array.isArray(agentRows) ? agentRows : [])
      setVoiceProfiles(Array.isArray(voiceRows) ? voiceRows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAgentsLoading(false)
    }
  }, [workspaceId])

  const fetchCalls = useCallback(async () => {
    if (!workspaceId) return
    setCallsLoading(true)
    try {
      const res = await fetch(`/api/call-logs?workspaceId=${workspaceId}&limit=200`)
      const rows = await res.json() as CallLog[] | { error: string }
      setCalls(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCallsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchAgents() }, [workspaceId, fetchAgents])
  useEffect(() => { if (workspaceId) fetchCalls() }, [workspaceId, fetchCalls])

  // ── Agent actions ────────────────────────────────────────────────────────
  const newAgentDraft = (): AgentDraft => ({
    agentName: '',
    phoneNumber: '',
    provider: 'vapi',
    systemPrompt: 'You are a friendly assistant. Greet the caller, listen actively, and capture their reason for calling.',
    temperature: 0.7,
    llmModel: 'gpt-4o',
    voiceProfileId: null,
    status: 'active',
  })

  const openCreate = () => setEditingAgent(newAgentDraft())
  const openEdit = (a: VoiceAgent) => setEditingAgent({
    id: a.id,
    agentName: a.agent_name,
    phoneNumber: a.phone_number || '',
    provider: (['vapi', 'retell', 'twilio'].includes(a.provider) ? a.provider : 'vapi') as AgentDraft['provider'],
    systemPrompt: a.system_prompt || '',
    temperature: Math.max(0, Math.min(2, Number(a.temperature || 0.7))),
    llmModel: a.llm_model || 'gpt-4o',
    voiceProfileId: a.voice_profile_id,
    status: (['active', 'paused', 'draft', 'archived'].includes(a.status) ? a.status : 'active') as AgentDraft['status'],
  })

  const saveAgent = async () => {
    if (!editingAgent || !workspaceId) return
    setSavingAgent(true)
    setActionMessage(null)
    try {
      const isUpdate = Boolean(editingAgent.id)
      const url = '/api/voice-agents'
      const method = isUpdate ? 'PATCH' : 'POST'
      const body = {
        ...(isUpdate ? { id: editingAgent.id } : {}),
        workspaceId,
        agentName: editingAgent.agentName,
        phoneNumber: editingAgent.phoneNumber.trim() || null,
        provider: editingAgent.provider,
        systemPrompt: editingAgent.systemPrompt,
        temperature: editingAgent.temperature,
        llmModel: editingAgent.llmModel,
        voiceProfileId: editingAgent.voiceProfileId,
        status: editingAgent.status,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setActionMessage({ ok: true, text: isUpdate ? 'Agent updated.' : 'Agent created.' })
      setEditingAgent(null)
      await fetchAgents()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSavingAgent(false)
    }
  }

  const toggleAgentStatus = async (agent: VoiceAgent) => {
    if (!workspaceId) return
    const nextStatus = agent.status === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch('/api/voice-agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, workspaceId, status: nextStatus }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setActionMessage({ ok: true, text: `Agent ${nextStatus === 'active' ? 'resumed' : 'paused'}.` })
      await fetchAgents()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  const deleteAgent = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this voice agent? Past call logs will remain but become un-linked.')) return
    try {
      const res = await fetch(`/api/voice-agents?id=${id}&workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setActionMessage({ ok: true, text: 'Agent deleted.' })
      await fetchAgents()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const agentsById = useMemo(() => {
    const m = new Map<string, VoiceAgent>()
    for (const a of agents) m.set(a.id, a)
    return m
  }, [agents])

  const openCall = useMemo(() => calls.find(c => c.id === openCallId) || null, [calls, openCallId])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Sprint 19D: ElevenLabs connect banner. Voice agents synthesise
            replies via ElevenLabs; without a key the synthesis falls back
            to error states. */}
        <ProviderConnectBanner
          ready={elevenReady}
          workspaceId={workspaceId}
          providerId="elevenlabs"
          providerName="ElevenLabs"
          icon="🎙️"
          description="Voice synthesis for your AI voice agents. Replies, prompts, and call-back greetings are all generated through ElevenLabs."
          signupUrl="https://elevenlabs.io/sign-up"
          keysHelpUrl="https://elevenlabs.io/app/settings/api-keys"
          freeTierNote="Free tier — 10,000 characters/month. No card required."
          fields={[{ label: 'API Key', placeholder: 'sk_…', payloadKey: 'key', password: true }]}
          testMode="workspace-secrets"
          onConnected={() => void refreshElevenReady()}
        />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Phone className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Voice AI Operator</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Configure inbound voice agents, review every recorded conversation, and trace each call back
                into your CRM — Vapi, Retell, and Twilio all routed through the same operator console.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchAgents(); fetchCalls() }}
              disabled={!workspaceId || agentsLoading || callsLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
            >
              <RefreshCw className={`w-4 h-4 ${agentsLoading || callsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={openCreate}
              disabled={!workspaceId}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>
          </div>
        </div>

        {/* ── Banners ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-300">{error}</div>
          </div>
        )}
        {actionMessage && (
          <div
            className={`mb-4 p-3 rounded-lg border flex items-start gap-2.5 ${
              actionMessage.ok
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className={`text-xs ${actionMessage.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {actionMessage.text}
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-300"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Tab strip ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
          {([
            { id: 'agents' as Tab, label: 'Agents',    count: agents.length, icon: <Bot className="w-3.5 h-3.5" /> },
            { id: 'calls'  as Tab, label: 'Call Logs', count: calls.length,  icon: <Activity className="w-3.5 h-3.5" /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
              <span className="ml-1 text-xs text-gray-500">({t.count})</span>
            </button>
          ))}
        </div>

        {/* ── Tab body ────────────────────────────────────────────────── */}
        {tab === 'agents' ? (
          <AgentsTab
            loading={agentsLoading}
            agents={agents}
            voiceProfiles={voiceProfiles}
            onCreate={openCreate}
            onEdit={openEdit}
            onToggle={toggleAgentStatus}
            onDelete={deleteAgent}
          />
        ) : (
          <CallsTab
            loading={callsLoading}
            calls={calls}
            agentsById={agentsById}
            onOpen={setOpenCallId}
          />
        )}
      </div>

      {/* ── Agent Configurator modal ──────────────────────────────────── */}
      {editingAgent && (
        <AgentConfiguratorModal
          draft={editingAgent}
          setDraft={setEditingAgent}
          voiceProfiles={voiceProfiles}
          onClose={() => setEditingAgent(null)}
          onSave={saveAgent}
          saving={savingAgent}
        />
      )}

      {/* ── Call Detail Drawer ────────────────────────────────────────── */}
      {openCall && workspaceId && (
        <CallDetailDrawer
          call={openCall}
          agent={openCall.voice_agent_id ? agentsById.get(openCall.voice_agent_id) : undefined}
          workspaceId={workspaceId}
          onClose={() => setOpenCallId(null)}
        />
      )}
    </div>
  )
}

// ─── Agents Tab ───────────────────────────────────────────────────────────

function AgentsTab({
  loading, agents, voiceProfiles, onCreate, onEdit, onToggle, onDelete,
}: {
  loading: boolean
  agents: VoiceAgent[]
  voiceProfiles: VoiceProfile[]
  onCreate: () => void
  onEdit: (a: VoiceAgent) => void
  onToggle: (a: VoiceAgent) => void
  onDelete: (id: string) => void
}) {
  const voiceProfileById = useMemo(() => {
    const m = new Map<string, VoiceProfile>()
    for (const v of voiceProfiles) m.set(v.id, v)
    return m
  }, [voiceProfiles])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading voice agents…</span>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
        <div className="inline-flex w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-4">
          <Bot className="w-6 h-6 text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">No voice agents yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
          Create your first AI voice agent and assign it a phone number to start handling inbound calls
          across Vapi, Retell, or Twilio.
        </p>
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New Agent
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {agents.map(a => {
        const provider = providerStyle(a.provider)
        const voiceProfile = a.voice_profile_id ? voiceProfileById.get(a.voice_profile_id) : null
        return (
          <div key={a.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{a.agent_name}</div>
                  <div className="text-[10px] text-gray-500 font-mono truncate">{a.llm_model || 'gpt-4o'}</div>
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${provider.bg} ${provider.text} ${provider.ring}`}>
                {provider.label}
              </span>
              {a.phone_number ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-gray-800 text-gray-300">
                  <Phone className="w-2.5 h-2.5" />
                  {a.phone_number}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-gray-800 text-gray-500">
                  no trunk
                </span>
              )}
              {voiceProfile && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-800 text-gray-300">
                  <Mic className="w-2.5 h-2.5" />
                  {voiceProfile.voice_name}
                </span>
              )}
            </div>

            <p className="text-xs text-gray-400 line-clamp-3 flex-1 mb-4 min-h-[3em]">
              {a.system_prompt || <span className="italic text-gray-600">No system prompt configured.</span>}
            </p>

            <div className="flex items-center gap-1.5 pt-3 border-t border-gray-800">
              <button
                onClick={() => onToggle(a)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
                title={a.status === 'active' ? 'Pause agent' : 'Resume agent'}
              >
                {a.status === 'active' ? (<><Pause className="w-3 h-3" /> Pause</>) : (<><Play className="w-3 h-3" /> Resume</>)}
              </button>
              <button
                onClick={() => onEdit(a)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
              >
                <Settings2 className="w-3 h-3" />
                Configure
              </button>
              <button
                onClick={() => onDelete(a.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-rose-500/15 text-gray-400 hover:text-rose-300 transition ml-auto"
                aria-label="Delete agent"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}

      {/* "+ New" card slot */}
      <button
        onClick={onCreate}
        className="rounded-xl border-2 border-dashed border-gray-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition flex flex-col items-center justify-center py-12 text-gray-500 hover:text-indigo-300"
      >
        <Plus className="w-6 h-6 mb-2" />
        <span className="text-sm font-medium">Add another agent</span>
      </button>
    </div>
  )
}

// ─── Calls Tab (chronological ledger) ─────────────────────────────────────

function CallsTab({
  loading, calls, agentsById, onOpen,
}: {
  loading: boolean
  calls: CallLog[]
  agentsById: Map<string, VoiceAgent>
  onOpen: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading call ledger…</span>
      </div>
    )
  }
  if (calls.length === 0) {
    return (
      <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
        <div className="inline-flex w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-4">
          <PhoneIncoming className="w-6 h-6 text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">No calls yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
          When your voice agents answer an inbound call, the full transcript, summary, and sentiment
          analysis will land here automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
            <th className="text-left px-4 py-2.5 font-medium">Direction</th>
            <th className="text-left px-4 py-2.5 font-medium">Caller</th>
            <th className="text-left px-4 py-2.5 font-medium">Agent</th>
            <th className="text-right px-4 py-2.5 font-medium">Duration</th>
            <th className="text-left px-4 py-2.5 font-medium">Sentiment</th>
            <th className="text-left px-4 py-2.5 font-medium">Action</th>
            <th className="text-right px-4 py-2.5 font-medium">Time</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {calls.map(c => {
            const dir = (c.direction || 'inbound').toLowerCase()
            const sentiment = c.sentiment_score === null ? null : Number(c.sentiment_score)
            const sc = sentimentColor(sentiment)
            const provider = providerStyle(c.provider)
            const agent = c.voice_agent_id ? agentsById.get(c.voice_agent_id) : null
            const status = (c.call_status || '').toLowerCase()

            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="border-b border-gray-800/40 last:border-b-0 hover:bg-gray-800/40 cursor-pointer transition"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {dir === 'outbound' ? (
                      <PhoneOutgoing className="w-4 h-4 text-blue-400" />
                    ) : status === 'voicemail' || status === 'no_answer' ? (
                      <PhoneMissed className="w-4 h-4 text-rose-400" />
                    ) : (
                      <PhoneIncoming className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${provider.bg} ${provider.text} ${provider.ring}`}>
                      {provider.label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-200">{c.from_number || '—'}</div>
                  {c.lead_id && (
                    <div className="text-[10px] text-indigo-400 mt-0.5">CRM linked</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-300">
                  {agent?.agent_name || <span className="text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                  {formatDuration(Number(c.duration_seconds))}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                    <Waves className="w-2.5 h-2.5" />
                    {sentiment === null ? '—' : `${Math.round(sentiment * 100)}%`}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 truncate max-w-[200px]">
                  {c.action_taken || <span className="text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">
                  {formatRelative(c.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Agent Configurator modal ─────────────────────────────────────────────

const LLM_MODEL_OPTIONS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
  'gemini-1.5-pro',
]

function AgentConfiguratorModal({
  draft, setDraft, voiceProfiles, onClose, onSave, saving,
}: {
  draft: AgentDraft
  setDraft: (d: AgentDraft) => void
  voiceProfiles: VoiceProfile[]
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft({ ...draft, [key]: value })

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-2 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              <Settings2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{draft.id ? 'Configure Agent' : 'New Voice Agent'}</h2>
              <p className="text-[11px] text-gray-500">Prompts, voices, models — all in one panel.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Agent name */}
          <Field label="Agent name" hint="Internal label only — callers never hear this.">
            <input
              type="text"
              value={draft.agentName}
              onChange={e => set('agentName', e.target.value)}
              placeholder="e.g. Sales Receptionist · Tier 1"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </Field>

          {/* Phone number + provider */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone number" hint="E.164 format recommended (e.g. +14155550100).">
              <input
                type="text"
                value={draft.phoneNumber}
                onChange={e => set('phoneNumber', e.target.value)}
                placeholder="+14155550100"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </Field>
            <Field label="Engine">
              <div className="flex gap-1.5">
                {(['vapi', 'retell', 'twilio'] as const).map(p => {
                  const style = providerStyle(p)
                  const active = draft.provider === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set('provider', p)}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                        active
                          ? `${style.bg} ${style.text} ring-1 ring-inset ${style.ring}`
                          : 'bg-gray-950 border border-gray-800 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {style.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>

          {/* System prompt */}
          <Field
            label="System prompt"
            hint="The persona, tone, and instructions your agent uses on every call. Markdown is fine."
          >
            <textarea
              value={draft.systemPrompt}
              onChange={e => set('systemPrompt', e.target.value)}
              rows={6}
              placeholder="You are a friendly assistant. Greet the caller, listen actively, and capture their reason for calling."
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm placeholder-gray-600 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="text-[10px] text-gray-600 font-mono mt-1">
              {draft.systemPrompt.length.toLocaleString()} / 16,000 chars
            </div>
          </Field>

          {/* Temperature + Model */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Temperature · ${draft.temperature.toFixed(2)}`} hint="Lower = predictable, higher = creative.">
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={draft.temperature}
                onChange={e => set('temperature', Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1">
                <span>focused</span>
                <span>balanced</span>
                <span>creative</span>
              </div>
            </Field>
            <Field label="LLM model">
              <select
                value={draft.llmModel}
                onChange={e => set('llmModel', e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {LLM_MODEL_OPTIONS.map(m => (
                  <option key={m} value={m} className="bg-gray-900">{m}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Voice profile */}
          <Field label="Voice profile" hint="Pulled from your workspace's voice library.">
            <select
              value={draft.voiceProfileId || ''}
              onChange={e => set('voiceProfileId', e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="" className="bg-gray-900">— Default voice —</option>
              {voiceProfiles.map(v => (
                <option key={v.id} value={v.id} className="bg-gray-900">
                  {v.voice_name} · {v.provider}{v.accent_label ? ` · ${v.accent_label}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* Status */}
          <Field label="Status">
            <div className="flex gap-1.5">
              {(['active', 'paused', 'draft', 'archived'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium capitalize transition ${
                    draft.status === s
                      ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30'
                      : 'bg-gray-950 border border-gray-800 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-2 sticky bottom-0 bg-gray-900">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.agentName.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {draft.id ? 'Save changes' : 'Create agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-300 mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

// ─── Call Detail Drawer ───────────────────────────────────────────────────

function CallDetailDrawer({
  call, agent, workspaceId, onClose,
}: {
  call: CallLog
  agent: VoiceAgent | undefined
  workspaceId: string
  onClose: () => void
}) {
  const sentiment = call.sentiment_score === null ? null : Number(call.sentiment_score)
  const sc = sentimentColor(sentiment)
  const provider = providerStyle(call.provider)
  const turns = useMemo(() => parseTranscript(call.transcript), [call.transcript])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setPlaying(false)
    if (audioRef.current) audioRef.current.pause()
  }, [call.id])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => { /* user must interact first on some browsers */ })
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="fixed top-0 right-0 bottom-0 w-full md:w-[640px] bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              {call.direction === 'outbound'
                ? <PhoneOutgoing className="w-5 h-5 text-blue-400" />
                : <PhoneIncoming className="w-5 h-5 text-emerald-400" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{call.from_number || '—'}</div>
              <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${provider.bg} ${provider.text} ${provider.ring}`}>
                  {provider.label}
                </span>
                <span>·</span>
                <span>{formatDuration(Number(call.duration_seconds))}</span>
                <span>·</span>
                <span>{formatRelative(call.created_at)}</span>
                {agent && (
                  <>
                    <span>·</span>
                    <span className="text-gray-400">{agent.agent_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sentiment + CRM strip */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
              <Waves className="w-3 h-3" />
              {sentiment === null ? 'Unscored' : `${Math.round(sentiment * 100)}% · ${sc.label}`}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-800/60 text-gray-300 capitalize">
              <Activity className="w-3 h-3" />
              {(call.call_status || 'completed').replace('_', ' ')}
            </span>
          </div>
          {call.lead_id ? (
            <Link
              href={`/dashboard/leads-crm?leadId=${encodeURIComponent(call.lead_id)}&workspaceId=${encodeURIComponent(workspaceId)}`}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 ring-1 ring-inset ring-indigo-500/30 transition"
            >
              <UserIcon className="w-3 h-3" />
              View in CRM
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : (
            <span className="text-[11px] text-gray-600 italic">No CRM match for this caller.</span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Audio player */}
          {call.recording_url ? (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recording</h3>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition flex-shrink-0"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                {/* Layout-stable: fixed-height (h-9) native player to prevent
                    jitter from the browser injecting controls of differing
                    intrinsic widths. */}
                <audio
                  ref={audioRef}
                  src={call.recording_url}
                  controls
                  preload="none"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  className="flex-1 min-w-0 h-9"
                />
              </div>
            </section>
          ) : (
            <section className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 text-xs text-gray-500 italic">
              Recording not available for this call.
            </section>
          )}

          {/* Claude summary */}
          {call.summary && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Claude Summary</h3>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                {call.summary}
              </div>
            </section>
          )}

          {/* Action taken */}
          {call.action_taken && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next Action</h3>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-100">
                {call.action_taken}
              </div>
            </section>
          )}

          {/* Heat-map chat view */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Conversation Heat-Map
              </h3>
              <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-500">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />frustrated</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />positive</span>
              </div>
            </div>
            {turns.length === 0 ? (
              <div className="text-xs text-gray-500 italic py-8 text-center bg-gray-900/40 border border-gray-800 rounded-lg">
                Transcript not yet available — Whisper still processing.
              </div>
            ) : (
              <div className="space-y-2">
                {turns.map((t, i) => (
                  <ChatBubble key={i} turn={t} />
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

// ─── Chat bubble (sentiment-tinted) ───────────────────────────────────────

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isAgent = turn.speaker === 'agent'

  const tintByMood: Record<ChatTurn['sentiment'], { bg: string; border: string; text: string }> = {
    positive: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-100' },
    negative: { bg: 'bg-rose-500/10',    border: 'border-rose-500/25',    text: 'text-rose-100' },
    neutral:  isAgent
      ? { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-100' }
      : { bg: 'bg-gray-800/60',  border: 'border-gray-700',      text: 'text-gray-200' },
  }
  const t = tintByMood[turn.sentiment]

  return (
    <div className={`flex items-start gap-2 ${isAgent ? '' : 'flex-row-reverse'}`}>
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          isAgent ? 'bg-indigo-500/15 text-indigo-300' : 'bg-gray-800 text-gray-300'
        }`}
      >
        {isAgent ? <Bot className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
      </div>
      <div className={`max-w-[80%] rounded-lg border px-3 py-2 ${t.bg} ${t.border}`}>
        <div className={`text-[10px] uppercase tracking-wider mb-1 ${
          isAgent ? 'text-indigo-300/70' : 'text-gray-400'
        }`}>
          {isAgent ? 'Agent' : 'Caller'}
          {turn.sentiment !== 'neutral' && (
            <span className={`ml-1.5 ${turn.sentiment === 'positive' ? 'text-emerald-300' : 'text-rose-300'}`}>
              · {turn.sentiment}
            </span>
          )}
        </div>
        <div className={`text-sm leading-relaxed ${t.text}`}>
          {turn.text}
        </div>
      </div>
    </div>
  )
}
