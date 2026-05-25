'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Tab = 'assistants' | 'calls'

const VOICE_OPTIONS = [
  { value: '11labs', label: 'ElevenLabs' },
  { value: 'deepgram', label: 'Deepgram' },
  { value: 'azure', label: 'Azure' },
]

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function SetupError({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-950/40 border border-red-800/40 p-4">
      <p className="text-red-400 text-sm">{message}</p>
      <Link
        href="/dashboard/settings"
        className="inline-block mt-2 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
      >
        Go to Settings to configure API keys →
      </Link>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'ended' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800/50' :
    status === 'in-progress' ? 'bg-yellow-900/50 text-yellow-400 border-yellow-800/50' :
    'bg-red-900/50 text-red-400 border-red-800/50'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {status}
    </span>
  )
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return dateStr }
}

export default function VoiceAIPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('assistants')

  // Assistants state
  const [assistants, setAssistants] = useState<any[]>([])
  const [assistantsLoading, setAssistantsLoading] = useState(false)
  const [assistantsError, setAssistantsError] = useState('')
  const [assistantsSetupError, setAssistantsSetupError] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    systemPrompt: '',
    firstMessage: 'Hello! I\'m your Ooumph AI assistant. How can I help?',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    voiceProvider: '11labs',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Calls state
  const [calls, setCalls] = useState<any[]>([])
  const [callsLoading, setCallsLoading] = useState(false)
  const [callsError, setCallsError] = useState('')
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Record<string, any>>({})
  const [transcriptLoading, setTranscriptLoading] = useState<Record<string, boolean>>({})

  // Make call state
  const [callForm, setCallForm] = useState({ phoneNumber: '', assistantId: '' })
  const [makingCall, setMakingCall] = useState(false)
  const [callResult, setCallResult] = useState<{ callId: string; message: string } | null>(null)
  const [callFormError, setCallFormError] = useState('')

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) fetchAssistants(wid)
  }, [])

  useEffect(() => {
    if (activeTab === 'calls' && workspaceId && calls.length === 0 && !callsLoading) {
      fetchCalls(workspaceId)
    }
  }, [activeTab, workspaceId])

  async function fetchAssistants(wid: string) {
    setAssistantsLoading(true)
    setAssistantsError('')
    setAssistantsSetupError(false)
    try {
      const res = await fetch('/api/agents/voice/vapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assistants', workspaceId: wid }),
      })
      const data = await res.json()
      if (data.requiresSetup) {
        setAssistantsSetupError(true)
        setAssistantsError(data.error)
        return
      }
      if (!data.ok) {
        setAssistantsError(data.error || 'Failed to load assistants.')
        return
      }
      setAssistants(Array.isArray(data.assistants) ? data.assistants : [])
    } catch (e) {
      setAssistantsError(String(e))
    } finally {
      setAssistantsLoading(false)
    }
  }

  async function fetchCalls(wid: string) {
    setCallsLoading(true)
    setCallsError('')
    try {
      const res = await fetch('/api/agents/voice/vapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calls', workspaceId: wid, limit: 20 }),
      })
      const data = await res.json()
      if (!data.ok) {
        setCallsError(data.error || 'Failed to load calls.')
        return
      }
      setCalls(Array.isArray(data.calls) ? data.calls : [])
    } catch (e) {
      setCallsError(String(e))
    } finally {
      setCallsLoading(false)
    }
  }

  async function createAssistant() {
    if (!createForm.name.trim()) {
      setCreateError('Name is required.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/agents/voice/vapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_assistant',
          workspaceId,
          name: createForm.name,
          systemPrompt: createForm.systemPrompt,
          firstMessage: createForm.firstMessage,
          voiceProvider: createForm.voiceProvider,
          voiceId: createForm.voiceId,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setCreateError(data.error || 'Failed to create assistant.')
        return
      }
      // Refresh list
      await fetchAssistants(workspaceId)
      setShowCreateForm(false)
      setCreateForm({
        name: '',
        systemPrompt: '',
        firstMessage: 'Hello! I\'m your Ooumph AI assistant. How can I help?',
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        voiceProvider: '11labs',
      })
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  async function loadTranscript(callId: string) {
    if (transcripts[callId]) {
      setExpandedCallId(expandedCallId === callId ? null : callId)
      return
    }
    setTranscriptLoading(prev => ({ ...prev, [callId]: true }))
    try {
      const res = await fetch('/api/agents/voice/vapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'call_detail', callId, workspaceId }),
      })
      const data = await res.json()
      if (data.ok && data.call) {
        setTranscripts(prev => ({ ...prev, [callId]: data.call }))
        setExpandedCallId(callId)
      }
    } catch (e) {
      console.error('Failed to load transcript:', e)
    } finally {
      setTranscriptLoading(prev => ({ ...prev, [callId]: false }))
    }
  }

  async function makeCall() {
    setCallFormError('')
    setCallResult(null)
    if (!callForm.phoneNumber.trim() || !callForm.assistantId) {
      setCallFormError('Phone number and assistant are required.')
      return
    }
    if (!callForm.phoneNumber.startsWith('+')) {
      setCallFormError('Phone number must start with + (e.g. +12025551234)')
      return
    }
    setMakingCall(true)
    try {
      const res = await fetch('/api/agents/voice/vapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          workspaceId,
          phoneNumber: callForm.phoneNumber,
          assistantId: callForm.assistantId,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setCallFormError(data.error || 'Failed to make call.')
        return
      }
      setCallResult({ callId: data.callId, message: data.message })
    } catch (e) {
      setCallFormError(String(e))
    } finally {
      setMakingCall(false)
    }
  }

  // Stats
  const totalCalls = calls.length
  const completedCalls = calls.filter(c => c.status === 'ended').length
  const avgDuration = calls.length > 0
    ? Math.round(calls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / calls.length)
    : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm">
            📞
          </div>
          <h1 className="text-2xl font-bold text-white">Voice AI</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI-powered voice agents with Vapi — automate calls, qualify leads</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-6">
        {([
          { id: 'assistants' as Tab, icon: '🤖', label: 'Assistants' },
          { id: 'calls' as Tab, icon: '📋', label: 'Call Logs' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ASSISTANTS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'assistants' && (
        <div className="space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">
              {assistants.length > 0 ? `${assistants.length} Assistant${assistants.length !== 1 ? 's' : ''}` : 'Voice Assistants'}
            </h2>
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <span>+</span> Create Assistant
            </button>
          </div>

          {/* Setup/loading errors */}
          {assistantsError && (
            assistantsSetupError
              ? <SetupError message={assistantsError} />
              : <p className="text-red-400 text-sm">{assistantsError}</p>
          )}

          {/* Create form */}
          {showCreateForm && (
            <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6 space-y-4">
              <h3 className="text-white font-semibold text-sm">New Voice Assistant</h3>

              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Name <span className="text-red-400">*</span></label>
                <input
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ooumph Sales Assistant"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">System Prompt</label>
                <textarea
                  value={createForm.systemPrompt}
                  onChange={e => setCreateForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  rows={3}
                  placeholder="You are a friendly sales agent for Ooumph. Help qualify leads and schedule demos..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">First Message</label>
                <input
                  value={createForm.firstMessage}
                  onChange={e => setCreateForm(f => ({ ...f, firstMessage: e.target.value }))}
                  placeholder="Hello! I'm your Ooumph AI assistant. How can I help?"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Voice Provider</label>
                  <select
                    value={createForm.voiceProvider}
                    onChange={e => setCreateForm(f => ({ ...f, voiceProvider: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {VOICE_OPTIONS.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Voice ID</label>
                  <input
                    value={createForm.voiceId}
                    onChange={e => setCreateForm(f => ({ ...f, voiceId: e.target.value }))}
                    placeholder="21m00Tcm4TlvDq8ikWAM"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {createError && <p className="text-red-400 text-sm">{createError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={createAssistant}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {creating ? <><Spinner /> Creating...</> : 'Create Assistant'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setCreateError('') }}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Assistants grid */}
          {assistantsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse space-y-3">
                  <div className="h-4 w-32 bg-gray-800 rounded" />
                  <div className="h-3 w-24 bg-gray-800 rounded" />
                  <div className="h-3 w-48 bg-gray-800 rounded" />
                </div>
              ))}
            </div>
          ) : assistants.length === 0 && !assistantsError ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
              <p className="text-gray-500 text-sm">No assistants yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {assistants.map((a: any) => {
                const aid = a.id || a.assistantId || ''
                const modelInfo = a.model?.model || a.model?.modelId || '—'
                const voiceInfo = a.voice?.voiceId || a.voice?.provider || '—'
                const firstMsg = (a.firstMessage || '').slice(0, 80)
                return (
                  <div key={aid} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="text-white font-semibold text-sm">{a.name || aid}</h3>
                      <span className="text-gray-500 text-xs">{formatDate(a.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300 text-xs border border-violet-800/50">
                        {modelInfo}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 text-xs border border-blue-800/50">
                        {voiceInfo}
                      </span>
                    </div>
                    {firstMsg && (
                      <p className="text-gray-400 text-xs leading-relaxed">"{firstMsg}{firstMsg.length >= 80 ? '...' : ''}"</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CALLS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'calls' && (
        <div className="space-y-6">
          {/* Stats */}
          {calls.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Calls', value: totalCalls },
                { label: 'Avg Duration', value: formatDuration(avgDuration) },
                { label: 'Completed', value: completedCalls },
              ].map(stat => (
                <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Call error */}
          {callsError && <p className="text-red-400 text-sm">{callsError}</p>}

          {/* Make outbound call */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm">Make Outbound Call</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Phone Number</label>
                <input
                  value={callForm.phoneNumber}
                  onChange={e => setCallForm(f => ({ ...f, phoneNumber: e.target.value }))}
                  placeholder="+12025551234"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Assistant</label>
                <select
                  value={callForm.assistantId}
                  onChange={e => setCallForm(f => ({ ...f, assistantId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select assistant...</option>
                  {assistants.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                  ))}
                </select>
              </div>
            </div>
            {callFormError && <p className="text-red-400 text-sm">{callFormError}</p>}
            {callResult && (
              <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3">
                <p className="text-emerald-400 text-sm">
                  ✓ {callResult.message} — Call ID: <span className="font-mono">{callResult.callId}</span>
                </p>
              </div>
            )}
            <button
              onClick={makeCall}
              disabled={makingCall}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              {makingCall ? <><Spinner /> Calling...</> : '📞 Make Call'}
            </button>
          </div>

          {/* Call log list */}
          {callsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-16" />
              ))}
            </div>
          ) : calls.length === 0 && !callsError ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
              <p className="text-gray-500 text-sm">No calls yet.</p>
              <button
                onClick={() => fetchCalls(workspaceId)}
                className="mt-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {calls.map((call: any) => {
                const cid = call.id || call.callId || ''
                const isExpanded = expandedCallId === cid
                const transcript = transcripts[cid]
                const isLoadingTranscript = transcriptLoading[cid]
                const phoneNum = call.customer?.number || call.to || '—'
                const cost = call.cost !== undefined ? `$${Number(call.cost).toFixed(3)}` : '—'

                return (
                  <div key={cid} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      <StatusBadge status={call.status || 'unknown'} />
                      <span className="text-gray-400 text-xs capitalize">{call.type || 'outbound'}</span>
                      <span className="text-white text-sm font-mono">{phoneNum}</span>
                      <span className="text-gray-500 text-xs">{formatDuration(call.durationSeconds)}</span>
                      <span className="text-gray-500 text-xs">{cost}</span>
                      <span className="text-gray-600 text-xs ml-auto">{cid.slice(0, 16)}...</span>
                      <button
                        onClick={() => loadTranscript(cid)}
                        disabled={isLoadingTranscript}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors flex items-center gap-1.5"
                      >
                        {isLoadingTranscript ? <><Spinner /> Loading</> : isExpanded ? 'Hide' : 'View Transcript'}
                      </button>
                    </div>

                    {isExpanded && transcript && (
                      <div className="border-t border-gray-800 p-4 space-y-3">
                        {/* Transcript messages */}
                        {Array.isArray(transcript.messages) && transcript.messages.length > 0 ? (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {transcript.messages.map((msg: any, idx: number) => (
                              <div key={idx} className={`flex gap-2 ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-xs px-3 py-2 rounded-xl text-xs ${
                                  msg.role === 'assistant'
                                    ? 'bg-gray-800 text-gray-200'
                                    : 'bg-indigo-900/50 text-indigo-200'
                                }`}>
                                  <span className="text-gray-500 text-xs font-medium uppercase block mb-0.5">{msg.role}</span>
                                  {msg.message || msg.content || '—'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : transcript.transcript ? (
                          <textarea
                            readOnly
                            value={typeof transcript.transcript === 'string' ? transcript.transcript : JSON.stringify(transcript.transcript, null, 2)}
                            rows={8}
                            className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-xs resize-none focus:outline-none"
                          />
                        ) : (
                          <p className="text-gray-500 text-sm">No transcript available.</p>
                        )}
                        <button
                          onClick={() => setExpandedCallId(null)}
                          className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
                        >
                          Collapse
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => fetchCalls(workspaceId)}
                className="w-full py-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Refresh calls
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
