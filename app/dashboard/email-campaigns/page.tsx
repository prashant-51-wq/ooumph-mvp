'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailInSequence {
  day: number
  subject: string
  preview: string
  body: string
  purpose: string
}

interface MailingList {
  id: string | number
  name: string
  stats?: { member_count?: number }
  totalSubscribers?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [activeTab, setActiveTab] = useState<'campaign' | 'sequence' | 'lists'>('campaign')
  const [error, setError] = useState('')

  // Campaign state
  const [campaignForm, setCampaignForm] = useState({
    topic: '',
    audience: '',
    tone: 'Professional',
    provider: 'auto' as 'auto' | 'mailchimp' | 'brevo',
  })
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [generatedCampaign, setGeneratedCampaign] = useState<{
    subject: string
    htmlContent: string
    artifactId?: string
  } | null>(null)
  const [editableSubject, setEditableSubject] = useState('')

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [modalListId, setModalListId] = useState('')
  const [modalCampaignName, setModalCampaignName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createResult, setCreateResult] = useState('')

  // Sequence state
  const [seqForm, setSeqForm] = useState({
    goal: '',
    audience: '',
    numEmails: 5,
    daysBetween: 3,
    tone: 'Professional',
  })
  const [seqLoading, setSeqLoading] = useState(false)
  const [sequence, setSequence] = useState<EmailInSequence[]>([])
  const [seqMeta, setSeqMeta] = useState<{ goal: string; numEmails: number; daysBetween: number } | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [saveSeqLoading, setSaveSeqLoading] = useState(false)
  const [saveSeqMsg, setSaveSeqMsg] = useState('')

  // Lists state
  const [lists, setLists] = useState<MailingList[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [listsProvider, setListsProvider] = useState<string | null>(null)
  const [listsConfigured, setListsConfigured] = useState(true)
  // Quick add contact
  const [contactEmail, setContactEmail] = useState('')
  const [contactFirst, setContactFirst] = useState('')
  const [contactLast, setContactLast] = useState('')
  const [contactListId, setContactListId] = useState('')
  const [contactLoading, setContactLoading] = useState(false)
  const [contactMsg, setContactMsg] = useState('')

  const hasFetchedLists = useRef(false)

  const fetchLists = useCallback(async (wid: string) => {
    setListsLoading(true)
    setListsConfigured(true)
    try {
      const res = await fetch('/api/agents/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wid, action: 'lists' }),
      })
      const data = await res.json()
      if (data.configured === false) {
        setListsConfigured(false)
        setLists([])
      } else {
        setLists(Array.isArray(data.lists) ? data.lists : [])
        setListsProvider(data.provider ?? null)
      }
    } catch {
      setLists([])
    } finally {
      setListsLoading(false)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid && !hasFetchedLists.current) {
      hasFetchedLists.current = true
      fetchLists(wid)
    }
  }, [fetchLists])

  // ── Campaign handlers ──────────────────────────────────────────────────────

  async function handleGenerateCampaign() {
    if (!campaignForm.topic.trim()) { setError('Enter a topic'); return }
    if (!workspaceId) { setError('No workspace found'); return }
    setCampaignLoading(true)
    setError('')
    setGeneratedCampaign(null)
    setCreateResult('')
    try {
      const res = await fetch('/api/agents/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'generate',
          topic: campaignForm.topic,
          audience: campaignForm.audience || 'our subscribers',
          tone: campaignForm.tone.toLowerCase(),
          provider: campaignForm.provider,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setGeneratedCampaign({ subject: data.subject, htmlContent: data.htmlContent, artifactId: data.artifactId })
      setEditableSubject(data.subject || '')
      setModalCampaignName(`Campaign — ${campaignForm.topic.slice(0, 40)}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setCampaignLoading(false)
    }
  }

  async function handleCreateCampaign() {
    if (!generatedCampaign) return
    if (!modalListId) { setCreateResult('Select a list first'); return }
    setCreateLoading(true)
    setCreateResult('')
    try {
      const res = await fetch('/api/agents/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'create',
          subject: editableSubject || generatedCampaign.subject,
          htmlContent: generatedCampaign.htmlContent,
          listId: modalListId,
          campaignName: modalCampaignName || 'Ooumph Campaign',
          provider: campaignForm.provider,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setCreateResult(`Error: ${data.error}`)
      } else {
        setCreateResult(`Campaign created in ${data.provider} (ID: ${data.campaignId})`)
        setTimeout(() => setShowCreateModal(false), 2000)
      }
    } catch (e) {
      setCreateResult(String(e))
    } finally {
      setCreateLoading(false)
    }
  }

  // ── Sequence handlers ──────────────────────────────────────────────────────

  async function handleGenerateSequence() {
    if (!seqForm.goal.trim()) { setError('Enter a goal'); return }
    if (!workspaceId) { setError('No workspace found'); return }
    setSeqLoading(true)
    setError('')
    setSequence([])
    setSeqMeta(null)
    setSaveSeqMsg('')
    try {
      const res = await fetch('/api/agents/email/sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'generate',
          goal: seqForm.goal,
          audience: seqForm.audience || 'our subscribers',
          numEmails: seqForm.numEmails,
          daysBetween: seqForm.daysBetween,
          tone: seqForm.tone.toLowerCase(),
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSequence(Array.isArray(data.sequence) ? data.sequence : [])
      setSeqMeta(data.metadata ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setSeqLoading(false)
    }
  }

  async function handleSaveSequence() {
    if (!sequence.length) return
    setSaveSeqLoading(true)
    setSaveSeqMsg('')
    try {
      const res = await fetch('/api/agents/email/sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'save',
          goal: seqForm.goal || 'Email sequence',
          sequence,
        }),
      })
      const data = await res.json()
      if (data.error) { setSaveSeqMsg(`Error: ${data.error}`); return }
      setSaveSeqMsg(`${data.saved} emails saved as artifacts`)
    } catch (e) {
      setSaveSeqMsg(String(e))
    } finally {
      setSaveSeqLoading(false)
    }
  }

  function toggleExpanded(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ── Contact handler ───────────────────────────────────────────────────────

  async function handleAddContact() {
    if (!contactEmail.trim()) { setContactMsg('Email is required'); return }
    setContactLoading(true)
    setContactMsg('')
    try {
      // Use the Mailchimp addSubscriber or Brevo createContact via the campaign endpoint
      // We call the lists action to know the provider then use direct fetch
      const res = await fetch('/api/agents/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'add_contact',
          email: contactEmail,
          firstName: contactFirst,
          lastName: contactLast,
          listId: contactListId,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setContactMsg(`Error: ${data.error}`)
      } else {
        setContactMsg('Contact added successfully')
        setContactEmail('')
        setContactFirst('')
        setContactLast('')
      }
    } catch (e) {
      setContactMsg(String(e))
    } finally {
      setContactLoading(false)
    }
  }

  // ─── Tab definitions ───────────────────────────────────────────────────────

  const TABS = [
    { id: 'campaign' as const, label: 'Generate Campaign' },
    { id: 'sequence' as const, label: 'Drip Sequences' },
    { id: 'lists' as const, label: 'Lists & Contacts' },
  ]

  const PROVIDERS: { id: 'auto' | 'mailchimp' | 'brevo'; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'mailchimp', label: 'Mailchimp' },
    { id: 'brevo', label: 'Brevo' },
  ]

  const TONES = ['Professional', 'Friendly', 'Urgent', 'Educational', 'Promotional']
  const SEQ_TONES = ['Professional', 'Friendly', 'Casual', 'Nurturing']

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
            ✉️
          </div>
          <h1 className="text-2xl font-bold text-white">Email Marketing</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Create campaigns, build sequences, manage your lists</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setError('') }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── Tab 1: Generate Campaign ────────────────────────────────────────── */}
      {activeTab === 'campaign' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            {/* Provider */}
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Provider</label>
              <div className="flex gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setCampaignForm(f => ({ ...f, provider: p.id }))}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      campaignForm.provider === p.id
                        ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                Topic <span className="text-red-400">*</span>
              </label>
              <input
                value={campaignForm.topic}
                onChange={e => setCampaignForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="What's this email about?"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Audience */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Target Audience</label>
              <input
                value={campaignForm.audience}
                onChange={e => setCampaignForm(f => ({ ...f, audience: e.target.value }))}
                placeholder="Who is this for?"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Tone</label>
              <select
                value={campaignForm.tone}
                onChange={e => setCampaignForm(f => ({ ...f, tone: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {TONES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <button
              onClick={handleGenerateCampaign}
              disabled={campaignLoading || !workspaceId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {campaignLoading ? <><Spinner /> Generating campaign...</> : '✨ Generate Campaign'}
            </button>
          </div>

          {/* Right: Result */}
          <div>
            {!generatedCampaign ? (
              <div className="bg-gray-900 border border-dashed border-gray-700 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-full min-h-64">
                <div className="text-4xl mb-3">✉️</div>
                <p className="text-white font-medium mb-1">Campaign preview will appear here</p>
                <p className="text-gray-500 text-sm">Fill in the form and generate your campaign</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Editable subject */}
                <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4">
                  <label className="text-gray-400 text-xs mb-1.5 block">Subject Line</label>
                  <input
                    value={editableSubject}
                    onChange={e => setEditableSubject(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 font-medium"
                  />
                </div>

                {/* HTML preview */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-400 text-xs mb-3">Email Preview</p>
                  <div
                    className="max-h-96 overflow-auto rounded-lg border border-gray-700 bg-white text-gray-900 p-4 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: generatedCampaign.htmlContent }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                  >
                    Create in {campaignForm.provider === 'auto' ? 'Mailchimp/Brevo' : campaignForm.provider.charAt(0).toUpperCase() + campaignForm.provider.slice(1)}
                  </button>
                  <CopyButton text={generatedCampaign.htmlContent} label="Copy HTML" />
                  <span className="px-3 py-2 rounded-lg bg-green-900/30 border border-green-800/30 text-green-300 text-xs flex items-center">
                    Saved as artifact
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Drip Sequences ────────────────────────────────────────────── */}
      {activeTab === 'sequence' && (
        <div className="space-y-6">
          {/* Form */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                Goal <span className="text-red-400">*</span>
              </label>
              <input
                value={seqForm.goal}
                onChange={e => setSeqForm(f => ({ ...f, goal: e.target.value }))}
                placeholder="What should this sequence achieve?"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Target Audience</label>
              <textarea
                value={seqForm.audience}
                onChange={e => setSeqForm(f => ({ ...f, audience: e.target.value }))}
                rows={2}
                placeholder="Describe who will receive these emails..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Number of Emails</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={seqForm.numEmails}
                  onChange={e => setSeqForm(f => ({ ...f, numEmails: Math.min(10, Math.max(3, parseInt(e.target.value) || 5)) }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Days Between</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={seqForm.daysBetween}
                  onChange={e => setSeqForm(f => ({ ...f, daysBetween: Math.min(14, Math.max(1, parseInt(e.target.value) || 3)) }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Tone</label>
                <select
                  value={seqForm.tone}
                  onChange={e => setSeqForm(f => ({ ...f, tone: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  {SEQ_TONES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateSequence}
              disabled={seqLoading || !workspaceId}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
            >
              {seqLoading ? <><Spinner /> Generating sequence...</> : '✨ Generate Sequence'}
            </button>
          </div>

          {/* Sequence results */}
          {sequence.length > 0 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center justify-between gap-4 bg-indigo-950/40 border border-indigo-800/30 rounded-xl px-5 py-3">
                <p className="text-indigo-300 text-sm font-medium">
                  {seqMeta?.numEmails ?? sequence.length} emails over{' '}
                  {((seqMeta?.numEmails ?? sequence.length) - 1) * (seqMeta?.daysBetween ?? seqForm.daysBetween)} days
                </p>
                <div className="flex items-center gap-3">
                  {saveSeqMsg && (
                    <span className="text-green-300 text-xs">{saveSeqMsg}</span>
                  )}
                  <button
                    onClick={handleSaveSequence}
                    disabled={saveSeqLoading}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-2"
                  >
                    {saveSeqLoading ? <><Spinner /> Saving...</> : 'Save All as Artifacts'}
                  </button>
                </div>
              </div>

              {/* Email cards */}
              {sequence.map((email, idx) => (
                <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="px-2.5 py-1 bg-indigo-900/40 text-indigo-300 text-xs font-bold rounded-full flex-shrink-0">
                      Day {email.day}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{email.subject}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{email.purpose}</p>
                    </div>
                    <button
                      onClick={() => toggleExpanded(idx)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                    >
                      {expanded.has(idx) ? 'Collapse' : 'Expand'}
                    </button>
                  </div>

                  <div className="px-5 pb-3">
                    <p className="text-gray-400 text-xs italic">{email.preview}</p>
                  </div>

                  {expanded.has(idx) && (
                    <div className="border-t border-gray-800 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-gray-500 text-xs">Full email body</p>
                        <CopyButton text={email.body} label="Copy HTML" />
                      </div>
                      <textarea
                        readOnly
                        value={email.body}
                        rows={8}
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs font-mono resize-y focus:outline-none whitespace-pre-wrap"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Lists & Contacts ──────────────────────────────────────────── */}
      {activeTab === 'lists' && (
        <div className="space-y-6">
          {/* Lists section */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">Your Lists</h2>
              <button
                onClick={() => workspaceId && fetchLists(workspaceId)}
                disabled={listsLoading}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors flex items-center gap-2"
              >
                {listsLoading ? <><Spinner /> Loading...</> : 'Refresh Lists'}
              </button>
            </div>

            {!listsConfigured ? (
              <div className="border border-dashed border-gray-700 rounded-xl p-8 text-center">
                <div className="text-3xl mb-3">🔌</div>
                <p className="text-white font-medium mb-1">No email provider configured</p>
                <p className="text-gray-500 text-sm mb-3">Connect Mailchimp or Brevo to see your lists</p>
                <a
                  href="/dashboard/settings"
                  className="inline-block px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-colors"
                >
                  Go to Settings
                </a>
              </div>
            ) : listsLoading ? (
              <div className="text-gray-500 text-sm animate-pulse py-6 text-center">Loading lists...</div>
            ) : lists.length === 0 ? (
              <div className="border border-dashed border-gray-700 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-sm">No lists found. Create one in your email provider dashboard.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lists.map((list, i) => {
                  const count = list.stats?.member_count ?? list.totalSubscribers ?? 0
                  return (
                    <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white font-medium text-sm leading-tight">{list.name}</p>
                        <span className="flex-shrink-0 px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">
                          {listsProvider ?? 'email'}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-2">
                        {count.toLocaleString()} subscriber{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick add contact */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-white font-semibold text-sm mb-4">Quick Add Contact</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">First Name</label>
                  <input
                    value={contactFirst}
                    onChange={e => setContactFirst(e.target.value)}
                    placeholder="Jane"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Last Name</label>
                  <input
                    value={contactLast}
                    onChange={e => setContactLast(e.target.value)}
                    placeholder="Smith"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">List</label>
                <select
                  value={contactListId}
                  onChange={e => setContactListId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a list...</option>
                  {lists.map((l, i) => (
                    <option key={i} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>

              {contactMsg && (
                <p className={`text-sm ${contactMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {contactMsg}
                </p>
              )}

              <button
                onClick={handleAddContact}
                disabled={contactLoading || !workspaceId}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
              >
                {contactLoading ? <><Spinner /> Adding...</> : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Campaign Modal ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Create Campaign</h3>
              <button
                onClick={() => { setShowCreateModal(false); setCreateResult('') }}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Campaign Name</label>
                <input
                  value={modalCampaignName}
                  onChange={e => setModalCampaignName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">
                  Send to List <span className="text-red-400">*</span>
                </label>
                <select
                  value={modalListId}
                  onChange={e => setModalListId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a list...</option>
                  {lists.map((l, i) => (
                    <option key={i} value={String(l.id)}>
                      {l.name} ({(l.stats?.member_count ?? l.totalSubscribers ?? 0).toLocaleString()} contacts)
                    </option>
                  ))}
                </select>
                {lists.length === 0 && (
                  <p className="text-gray-500 text-xs mt-1">
                    No lists loaded.{' '}
                    <button
                      onClick={() => workspaceId && fetchLists(workspaceId)}
                      className="text-indigo-400 hover:underline"
                    >
                      Refresh
                    </button>
                  </p>
                )}
              </div>

              {createResult && (
                <p className={`text-sm ${createResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {createResult}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowCreateModal(false); setCreateResult('') }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCampaign}
                  disabled={createLoading || !modalListId}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {createLoading ? <><Spinner /> Creating...</> : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
