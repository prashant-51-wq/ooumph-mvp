'use client'

/**
 * /dashboard/email-campaigns
 *
 * Campaign list + 4-step wizard:
 *   1. Audience  — pick a live list from /api/email-lists
 *   2. Compose   — AI-draft via /api/agents/email-marketing (creates artifact
 *                  + approval row + email_campaigns row in one shot)
 *   3. Review    — manually edit subject / body; persisted via PATCH
 *   4. Dispatch  — opens ReviewRequiredModal for the human governance gate;
 *                  on approval fires /api/email-campaigns/[id]/send.
 *
 * The artifact lifecycle is the safety spine — until the artifact is
 * approved, the dispatch route refuses to fire even a single email.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mail, Plus, Sparkles, ArrowRight, ArrowLeft, Send, Check,
  ListChecks, FileText, ShieldCheck, RefreshCw, AlertCircle, X, Loader2,
} from 'lucide-react'
import ReviewRequiredModal from '@/components/ReviewRequiredModal'

// ─── Types ─────────────────────────────────────────────────────────────────

interface EmailList {
  id: string
  name: string
  description: string | null
  status: string
  subscriber_count: number
  live_subscriber_count?: number | string
  default_from_name: string | null
  default_from_email: string | null
}

interface Campaign {
  id: string
  workspace_id: string
  name: string
  subject: string | null
  status: string
  artifact_id: string | null
  list_id: string | null
  scheduled_for: string | null
  recipient_count: number
  sent_count: number
  open_count: number
  click_count: number
  bounce_count: number
  failed_count: number
  error_message: string | null
  content_json: Record<string, unknown> | string
  sent_at: string | null
  created_at: string
  updated_at: string | null
}

interface DraftedContent {
  subject: string
  previewText?: string
  headline?: string
  body: string
  cta?: string
  ctaUrl?: string
  ps?: string
  suggestedSendTime?: string
}

type WizardStep = 'audience' | 'compose' | 'review' | 'dispatch'

// ─── Helpers ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-gray-800 text-gray-400 border-gray-700',
    scheduled: 'bg-amber-900/40 text-amber-300 border-amber-800',
    sending: 'bg-blue-900/40 text-blue-300 border-blue-800',
    sent: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    failed: 'bg-rose-900/40 text-rose-300 border-rose-800',
    archived: 'bg-gray-800 text-gray-500 border-gray-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${map[status] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {status}
    </span>
  )
}

function parseContent(v: unknown): DraftedContent {
  if (!v) return { subject: '', body: '' }
  if (typeof v === 'string') {
    try { return JSON.parse(v) as DraftedContent } catch { return { subject: '', body: v } }
  }
  return v as DraftedContent
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const fetchCampaigns = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    fetch(`/api/email-campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((rows: Campaign[]) => setCampaigns(Array.isArray(rows) ? rows : []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  // Poll for live status during sending campaigns
  useEffect(() => {
    if (!workspaceId) return
    const anyActive = campaigns.some(c => c.status === 'sending')
    if (!anyActive) return
    const t = setInterval(fetchCampaigns, 3000)
    return () => clearInterval(t)
  }, [workspaceId, campaigns, fetchCampaigns])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Mail className="w-6 h-6 text-indigo-400" /> Email Campaigns
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI-drafted broadcasts gated by human approval before any send.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchCampaigns}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowWizard(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New campaign
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Mail className="w-12 h-12 mx-auto mb-4 text-gray-700" />
            <p className="text-gray-300 mb-1 text-lg">No campaigns yet</p>
            <p className="text-sm text-gray-600 mb-6">Create your first AI-drafted campaign. Nothing sends until you approve it.</p>
            <button
              onClick={() => setShowWizard(true)}
              disabled={!workspaceId}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Draft a campaign with AI
            </button>
          </div>
        ) : (
          <CampaignList
            campaigns={campaigns}
            workspaceId={workspaceId!}
            onChanged={fetchCampaigns}
          />
        )}

        {showWizard && workspaceId && (
          <CampaignWizard
            workspaceId={workspaceId}
            onClose={() => setShowWizard(false)}
            onDone={() => { setShowWizard(false); fetchCampaigns() }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Campaign list ─────────────────────────────────────────────────────────

function CampaignList({
  campaigns, workspaceId, onChanged,
}: { campaigns: Campaign[]; workspaceId: string; onChanged: () => void }) {
  const [reviewState, setReviewState] = useState<{ artifactId: string; approvalId: string; campaignId: string } | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openReview = async (c: Campaign) => {
    if (!c.artifact_id) { setError('Campaign has no source artifact to review'); return }
    // Look up the approval row for this artifact
    try {
      const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
      const rows = await res.json() as Array<{ id: string; artifact_id: string; status: string }>
      const approval = rows.find(r => r.artifact_id === c.artifact_id && r.status === 'pending')
      if (!approval) { setError('No pending approval row found. The artifact may already be approved or rejected.'); return }
      setReviewState({ artifactId: c.artifact_id, approvalId: approval.id, campaignId: c.id })
    } catch {
      setError('Failed to load approval')
    }
  }

  // Fire the dispatch endpoint once the artifact is approved.
  const dispatch = useCallback(async (campaignId: string) => {
    setSendingId(campaignId)
    setError(null)
    try {
      const res = await fetch(`/api/email-campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; recipientCount?: number }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSendingId(null)
    }
  }, [workspaceId, onChanged])

  return (
    <>
      {error && (
        <div className="mb-3 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm">
          {error}
        </div>
      )}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-950 border-b border-gray-800">
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Recipients</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {campaigns.map(c => {
              const isSending = sendingId === c.id || c.status === 'sending'
              const canReview = c.status === 'draft' && c.artifact_id
              const canDispatch = c.status === 'draft' || c.status === 'scheduled'
              return (
                <tr key={c.id} className="hover:bg-gray-950/50">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{c.name}</div>
                    {c.subject && <div className="text-xs text-gray-500 truncate max-w-[420px]">{c.subject}</div>}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{Number(c.recipient_count).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">
                    {Number(c.sent_count).toLocaleString()}
                    {c.failed_count > 0 && <span className="text-rose-400 text-xs ml-1">({c.failed_count} failed)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(c.updated_at || c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {canReview && (
                      <button
                        onClick={() => openReview(c)}
                        className="px-3 py-1 text-xs bg-amber-900/40 hover:bg-amber-900/60 border border-amber-800 text-amber-200 rounded inline-flex items-center gap-1.5 mr-1"
                      >
                        <ShieldCheck className="w-3 h-3" /> Review &amp; approve
                      </button>
                    )}
                    {canDispatch && (
                      <button
                        onClick={() => dispatch(c.id)}
                        disabled={isSending}
                        className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
                        title={c.artifact_id ? 'Dispatch (requires artifact approval first)' : 'Dispatch (no artifact gate)'}
                      >
                        {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        {isSending ? 'Sending…' : 'Dispatch'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ReviewRequiredModal
        isOpen={!!reviewState}
        approvalId={reviewState?.approvalId || null}
        artifactId={reviewState?.artifactId || null}
        workspaceId={workspaceId}
        publishDestination="email"
        onApproved={() => {
          const campaignId = reviewState?.campaignId
          setReviewState(null)
          if (campaignId) {
            // Artifact is now approved → fire the gated dispatch.
            dispatch(campaignId)
          }
        }}
        onRejected={() => setReviewState(null)}
        onClose={() => setReviewState(null)}
      />
    </>
  )
}

// ─── Wizard ────────────────────────────────────────────────────────────────

function CampaignWizard({
  workspaceId, onClose, onDone,
}: { workspaceId: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<WizardStep>('audience')
  const [lists, setLists] = useState<EmailList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [goal, setGoal] = useState('')

  // After drafting:
  const [drafting, setDrafting] = useState(false)
  const [draftedCampaignId, setDraftedCampaignId] = useState<string | null>(null)
  const [draftedArtifactId, setDraftedArtifactId] = useState<string | null>(null)
  const [draftedApprovalId, setDraftedApprovalId] = useState<string | null>(null)
  const [content, setContent] = useState<DraftedContent>({ subject: '', body: '' })
  const [error, setError] = useState<string | null>(null)

  const [savingEdit, setSavingEdit] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [dispatching, setDispatching] = useState(false)

  useEffect(() => {
    fetch(`/api/email-lists?workspaceId=${workspaceId}&status=active`)
      .then(r => r.json())
      .then((rows: EmailList[]) => setLists(Array.isArray(rows) ? rows : []))
      .catch(() => setLists([]))
  }, [workspaceId])

  const selectedList = useMemo(
    () => lists.find(l => l.id === selectedListId) || null,
    [lists, selectedListId],
  )
  const subscriberCount = selectedList
    ? Number(selectedList.live_subscriber_count ?? selectedList.subscriber_count ?? 0)
    : 0

  // Step 2: kick off AI drafting (creates artifact + approval row + campaign)
  const draft = async () => {
    if (!campaignName.trim()) { setError('Campaign name is required'); return }
    if (!selectedListId) { setError('Select an audience list'); return }
    setDrafting(true); setError(null)
    try {
      const res = await fetch('/api/agents/email-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, action: 'generate', campaignName: campaignName.trim(), goal,
          audience: selectedList?.name || 'Full subscriber list',
        }),
      })
      const data = await res.json() as {
        ok?: boolean; campaignId?: string; artifactId?: string; approvalId?: string
        content?: DraftedContent; error?: string
      }
      if (!res.ok || !data.ok || !data.campaignId || !data.content) {
        throw new Error(data.error || 'Drafting failed')
      }
      setDraftedCampaignId(data.campaignId)
      setDraftedArtifactId(data.artifactId || null)
      setDraftedApprovalId(data.approvalId || null)
      setContent(data.content)
      // Attach the list to the campaign now that we have the id back.
      await fetch('/api/email-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.campaignId, workspaceId, listId: selectedListId,
          fromName: selectedList?.default_from_name || undefined,
          fromEmail: selectedList?.default_from_email || undefined,
        }),
      })
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setDrafting(false) }
  }

  // Step 3: save edits to the campaign content_json
  const persistEdits = async (): Promise<boolean> => {
    if (!draftedCampaignId) return false
    setSavingEdit(true); setError(null)
    try {
      const res = await fetch('/api/email-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftedCampaignId, workspaceId,
          subject: content.subject,
          contentJson: content,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'Save failed')
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally { setSavingEdit(false) }
  }

  // Step 4: dispatch (requires approval to be flipped by ReviewRequiredModal)
  const dispatch = async () => {
    if (!draftedCampaignId) return
    setDispatching(true); setError(null)
    try {
      const res = await fetch(`/api/email-campaigns/${draftedCampaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, listId: selectedListId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; recipientCount?: number }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Dispatch failed')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setDispatching(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            <h3 className="text-white font-semibold">New email campaign</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-2 text-xs">
          {(['audience', 'compose', 'review', 'dispatch'] as const).map((s, i) => {
            const active = step === s
            const done = (['audience', 'compose', 'review', 'dispatch'] as const).indexOf(step) > i
            const icons = [ListChecks, Sparkles, FileText, Send]
            const Icon = icons[i]
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${
                  active ? 'bg-indigo-900/50 text-indigo-300'
                  : done ? 'text-emerald-300' : 'text-gray-600'
                }`}>
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="capitalize font-medium">{s}</span>
                </div>
                {i < 3 && <ArrowRight className="w-3 h-3 text-gray-700" />}
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {step === 'audience' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Campaign name *</label>
                <input
                  value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. March product launch"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Goal (optional — guides AI drafting)</label>
                <input
                  value={goal} onChange={e => setGoal(e.target.value)}
                  placeholder="e.g. Drive 200 demo signups"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Audience list *</label>
                {lists.length === 0 ? (
                  <div className="p-4 border border-dashed border-gray-800 rounded-lg text-center text-sm text-gray-500">
                    No active lists. Create one in <a href="/dashboard/email-marketing" className="text-indigo-400 hover:text-indigo-300">Email Marketing → Lists</a> first.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-auto">
                    {lists.map(l => {
                      const count = Number(l.live_subscriber_count ?? l.subscriber_count ?? 0)
                      const active = selectedListId === l.id
                      return (
                        <button
                          key={l.id}
                          onClick={() => setSelectedListId(l.id)}
                          className={`w-full text-left p-3 border rounded-lg transition-colors ${
                            active ? 'border-indigo-600 bg-indigo-900/20'
                            : 'border-gray-800 hover:border-gray-700 bg-gray-950'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium text-sm">{l.name}</div>
                              {l.description && <div className="text-xs text-gray-500 mt-0.5">{l.description}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-indigo-300 font-mono text-sm">{count.toLocaleString()}</div>
                              <div className="text-[10px] text-gray-600 uppercase">subscribers</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'compose' && (
            <div className="space-y-4 text-center py-8">
              <Sparkles className="w-10 h-10 mx-auto text-indigo-400" />
              <p className="text-white text-lg">Ready to draft with AI</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Claude will write subject, preview text, body, and CTA tuned to your brand voice
                and the audience you selected.
              </p>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 max-w-md mx-auto text-left text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Campaign:</span> <span className="text-white">{campaignName}</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-500">Audience:</span> <span className="text-white">{selectedList?.name}</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-500">Recipients:</span> <span className="text-indigo-300 tabular-nums">{subscriberCount.toLocaleString()}</span></div>
              </div>
              <button
                onClick={draft} disabled={drafting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
              >
                {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {drafting ? 'Drafting…' : 'Draft with AI'}
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/30 border border-emerald-900/50 rounded-lg text-xs text-emerald-300">
                <Check className="w-3.5 h-3.5" /> Draft saved as artifact. You can edit below — changes save when you continue.
              </div>
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Subject line</label>
                <input
                  value={content.subject || ''} onChange={e => setContent({ ...content, subject: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {content.previewText !== undefined && (
                <div>
                  <label className="block text-xs uppercase text-gray-500 mb-1.5">Preview text</label>
                  <input
                    value={content.previewText} onChange={e => setContent({ ...content, previewText: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}
              {content.headline !== undefined && (
                <div>
                  <label className="block text-xs uppercase text-gray-500 mb-1.5">Headline</label>
                  <input
                    value={content.headline} onChange={e => setContent({ ...content, headline: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Body</label>
                <textarea
                  value={content.body || ''} onChange={e => setContent({ ...content, body: e.target.value })}
                  rows={10}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {content.cta !== undefined && (
                  <div>
                    <label className="block text-xs uppercase text-gray-500 mb-1.5">CTA</label>
                    <input
                      value={content.cta} onChange={e => setContent({ ...content, cta: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                )}
                {content.ctaUrl !== undefined && (
                  <div>
                    <label className="block text-xs uppercase text-gray-500 mb-1.5">CTA URL</label>
                    <input
                      value={content.ctaUrl} onChange={e => setContent({ ...content, ctaUrl: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'dispatch' && (
            <div className="space-y-4 text-center py-6">
              <ShieldCheck className="w-12 h-12 mx-auto text-amber-400" />
              <p className="text-white text-lg">Human approval required before send</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Click below to open the review modal. Once you approve, the campaign will dispatch
                to <span className="text-indigo-300">{subscriberCount.toLocaleString()}</span> subscribers
                automatically.
              </p>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setShowReview(true)}
                  disabled={!draftedArtifactId || !draftedApprovalId || dispatching}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" /> Open review &amp; approve
                </button>
              </div>
              {dispatching && (
                <div className="text-sm text-indigo-300 inline-flex items-center gap-2 mt-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Dispatching campaign…
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={() => {
              if (step === 'compose') setStep('audience')
              else if (step === 'review') setStep('compose')
              else if (step === 'dispatch') setStep('review')
            }}
            disabled={step === 'audience' || drafting || savingEdit || dispatching}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {step === 'audience' && (
            <button
              onClick={() => setStep('compose')}
              disabled={!campaignName.trim() || !selectedListId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 'review' && (
            <button
              onClick={async () => { if (await persistEdits()) setStep('dispatch') }}
              disabled={savingEdit || !content.subject?.trim() || !content.body?.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {savingEdit ? 'Saving…' : 'Save & continue'}
            </button>
          )}
        </div>
      </div>

      {/* Review modal — fires the dispatch endpoint once approved */}
      <ReviewRequiredModal
        isOpen={showReview && !!draftedArtifactId && !!draftedApprovalId}
        approvalId={draftedApprovalId}
        artifactId={draftedArtifactId}
        workspaceId={workspaceId}
        publishDestination="email"
        onApproved={() => {
          setShowReview(false)
          dispatch()
        }}
        onRejected={() => setShowReview(false)}
        onClose={() => setShowReview(false)}
      />
    </div>
  )
}
