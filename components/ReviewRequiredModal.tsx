/**
 * components/ReviewRequiredModal.tsx
 *
 * The human-in-the-loop checkpoint. Pops over the CMO dashboard (or any
 * agent flow) when an `approval_pending` event arrives. The user reviews
 * the artifact, optionally tweaks it inline, and either approves it,
 * rejects it with reasoning, or saves it as a draft.
 *
 * ─── The safety invariant ──────────────────────────────────────────────
 *   No third-party tool (Resend, Twitter, LinkedIn, ads APIs) fires until
 *   the user clicks Approve here. The whole agent pipeline pauses at
 *   `approval_pending` and only resumes when the modal commits a status
 *   transition to 'approved'.
 *
 * ─── Pragmatic-c approval behavior ─────────────────────────────────────
 *   • If the artifact has a `publishDestination` (extracted from content_json
 *     or carried on the approval_pending event), the primary CTA reads
 *     "Approve & Queue for Publish" and on click we PATCH the approval to
 *     'approved' AND POST the artifact to /api/publish/direct to enter the
 *     publish queue. The cron-driven scheduler picks it up from there.
 *   • Otherwise the primary CTA is plain "Approve" and we just flip the
 *     approval + artifact status to 'approved'. The artifact stays in the
 *     workspace ready for the user to publish manually later.
 *
 *   In both paths the approval PATCH commits first; the publish call is
 *   best-effort. If publish fails the approval still lands and we surface
 *   a warning toast so the user knows to re-trigger publish manually.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAgentStream } from '@/lib/use-agent-stream'

// ─── Public props ─────────────────────────────────────────────────────────

export interface ReviewRequiredModalProps {
  /** Open/closed (controlled by parent). When false the modal portal returns null. */
  isOpen: boolean
  /** Approval row id (the one whose status will be flipped). */
  approvalId: string | null
  /** Underlying artifact id (the content being reviewed). */
  artifactId: string | null
  /** Workspace scope (used for all API calls). */
  workspaceId: string
  /**
   * Optional pre-fetched publish destination. The CMO stream's
   * `approval_pending` event includes this when the artifact has a known
   * platform; otherwise we extract it from the loaded artifact's
   * content_json. If neither has a value, the modal falls back to plain
   * "Approve" behavior.
   */
  publishDestination?: string
  /** Fired after a successful approve. */
  onApproved?: (data: { artifactId: string; queuedForPublish: boolean }) => void
  /** Fired after a successful reject. */
  onRejected?: (data: { artifactId: string }) => void
  /** Fired when the user closes the modal without acting. */
  onClose: () => void
}

// ─── Internal types ───────────────────────────────────────────────────────

interface ArtifactRow {
  id: string
  workspace_id: string
  type: string
  title: string
  content_json: Record<string, unknown> | string
  status: string
  created_at: string
}

interface BrandVoiceScore {
  score: number
  reasoning: string[]
}

type SubmitState = 'idle' | 'approving' | 'refining' | 'saving_edit'

// ─── Content extraction helpers ───────────────────────────────────────────
// Different agents store their primary text in different fields (copy, body,
// content, etc.). We pick the most likely "primary text" key for editing.

const PRIMARY_TEXT_KEYS = ['copy', 'body', 'content', 'text', 'description', 'message', 'headline', 'positioning', 'reply'] as const

function asObject(cj: ArtifactRow['content_json']): Record<string, unknown> {
  if (cj && typeof cj === 'object') return cj as Record<string, unknown>
  if (typeof cj === 'string') {
    try {
      const parsed = JSON.parse(cj)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
    return { body: cj }  // fallback: treat raw string as the body
  }
  return {}
}

function extractPrimary(content: Record<string, unknown>): { text: string; key: string } {
  for (const key of PRIMARY_TEXT_KEYS) {
    const val = content[key]
    if (typeof val === 'string' && val.trim()) {
      return { text: val, key }
    }
  }
  // No known primary key — render full payload as readonly JSON (rare path)
  return { text: JSON.stringify(content, null, 2), key: '__json__' }
}

function extractMetadata(
  content: Record<string, unknown>,
  primaryKey: string,
): Array<{ k: string; v: string }> {
  const skip = new Set([primaryKey, 'is_demo', '__json__'])
  return Object.entries(content)
    .filter(([k, v]) =>
      !skip.has(k) &&
      v != null &&
      (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'),
    )
    .slice(0, 8)
    .map(([k, v]) => ({ k, v: String(v) }))
}

function findPublishDestination(content: Record<string, unknown>): string | undefined {
  const candidates = ['platform', 'publishDestination', 'destination', 'channel']
  for (const k of candidates) {
    const v = content[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}

// ─── Brand voice score badge ──────────────────────────────────────────────

function scoreColor(score: number | null): { bg: string; text: string; border: string } {
  if (score == null) return { bg: 'bg-gray-800', text: 'text-gray-400', border: 'border-gray-700' }
  if (score >= 80) return { bg: 'bg-emerald-900/40', text: 'text-emerald-300', border: 'border-emerald-700' }
  if (score >= 60) return { bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-700' }
  return { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-700' }
}

function BrandVoiceScoreBadge({
  score,
  reasoning,
  loading,
}: {
  score: number | null
  reasoning: string[]
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const c = scoreColor(score)

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
        <span className="w-2 h-2 rounded-full bg-current opacity-50 animate-pulse" />
        Brand Voice scoring…
      </div>
    )
  }

  if (score == null) return null

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${c.bg} ${c.text} ${c.border}`}
        title="Click for reasoning"
      >
        <span>🎯 Brand Voice:</span>
        <span className="font-bold">{score}%</span>
      </button>
      {open && reasoning.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 z-50">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1.5">Reasoning</p>
          <ul className="space-y-1">
            {reasoning.slice(0, 4).map((r, i) => (
              <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-1.5">
                <span className="text-gray-600 flex-shrink-0">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── The modal ───────────────────────────────────────────────────────────

export default function ReviewRequiredModal({
  isOpen,
  approvalId,
  artifactId,
  workspaceId,
  publishDestination: propPublishDestination,
  onApproved,
  onRejected,
  onClose,
}: ReviewRequiredModalProps) {
  const [artifact, setArtifact] = useState<ArtifactRow | null>(null)
  const [loadingArtifact, setLoadingArtifact] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [brandVoice, setBrandVoice] = useState<BrandVoiceScore | null>(null)
  const [loadingBrandVoice, setLoadingBrandVoice] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  // ─── Adjustment loop (replaces the old Reject path) ────────────────────
  //
  // Clicking "Request Adjustments" expands a feedback textarea. Submitting
  // fires /api/agents/refine, which streams the revised content directly
  // back into the preview pane (see refineStream below). The modal stays
  // open so the user can iterate as many rounds as they like before
  // ultimately approving.
  const [isAdjustMode, setIsAdjustMode] = useState(false)
  const [adjustFeedback, setAdjustFeedback] = useState('')

  // ─── Derived: parsed content + primary text + publish destination ────
  const contentObj = useMemo<Record<string, unknown>>(
    () => (artifact ? asObject(artifact.content_json) : {}),
    [artifact],
  )
  const { text: primaryText, key: primaryKey } = useMemo(
    () => (artifact ? extractPrimary(contentObj) : { text: '', key: '' }),
    [artifact, contentObj],
  )
  const metadata = useMemo(
    () => (artifact ? extractMetadata(contentObj, primaryKey) : []),
    [artifact, contentObj, primaryKey],
  )

  // Effective publishDestination: prop takes precedence, fall back to artifact.
  const effectivePublishDestination = useMemo(
    () => propPublishDestination || findPublishDestination(contentObj),
    [propPublishDestination, contentObj],
  )

  // ─── Reset state every time the modal opens with new ids ─────────────
  useEffect(() => {
    if (!isOpen) return
    setArtifact(null)
    setLoadError(null)
    setBrandVoice(null)
    setIsEditing(false)
    setEditText('')
    setSubmitState('idle')
    setSubmitError(null)
    setWarning(null)
    setIsAdjustMode(false)
    setAdjustFeedback('')
  }, [isOpen, approvalId, artifactId])

  // ─── Fetch artifact when modal opens ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || !artifactId || !workspaceId) return
    let cancelled = false
    setLoadingArtifact(true)
    setLoadError(null)

    fetch(`/api/artifacts?workspaceId=${workspaceId}&id=${artifactId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load artifact (${res.status})`)
        }
        return res.json() as Promise<ArtifactRow | null>
      })
      .then((row) => {
        if (cancelled) return
        if (!row) {
          setLoadError('Artifact not found — it may have been deleted.')
          return
        }
        setArtifact(row)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingArtifact(false)
      })

    return () => { cancelled = true }
  }, [isOpen, artifactId, workspaceId])

  // ─── Fetch brand voice score after artifact lands ────────────────────
  useEffect(() => {
    if (!artifact || !primaryText || !workspaceId) return
    let cancelled = false
    setLoadingBrandVoice(true)

    fetch('/api/agents/brand-voice-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        approvalId: approvalId ?? undefined,
        content: primaryText.slice(0, 3000),  // cap to avoid prompt bloat
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Brand voice service unavailable (${res.status})`)
        return res.json() as Promise<{ score: number; reasoning: string[] }>
      })
      .then((data) => {
        if (cancelled) return
        // Defensive — the route may return number/string/missing fields
        const score = typeof data.score === 'number' ? Math.round(data.score) : null
        const reasoning = Array.isArray(data.reasoning) ? data.reasoning : []
        if (score != null) setBrandVoice({ score, reasoning })
      })
      .catch((err) => {
        // Silent fallback — brand voice is informational, not blocking.
        console.warn('[ReviewRequired] brand voice fetch failed:', err)
      })
      .finally(() => {
        if (!cancelled) setLoadingBrandVoice(false)
      })

    return () => { cancelled = true }
  }, [artifact, primaryText, workspaceId, approvalId])

  // ─── Edit handlers ───────────────────────────────────────────────────
  const startEditing = useCallback(() => {
    setEditText(primaryText)
    setIsEditing(true)
  }, [primaryText])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditText('')
  }, [])

  const saveEdit = useCallback(async () => {
    if (!artifact) return
    setSubmitState('saving_edit')
    setSubmitError(null)
    try {
      // Merge the edited primary field back into the full content_json.
      const updated: Record<string, unknown> = { ...contentObj }
      if (primaryKey === '__json__') {
        // Editing raw JSON — try to parse it back
        try {
          const parsed = JSON.parse(editText)
          if (parsed && typeof parsed === 'object') {
            // Replace whole object
            const res = await fetch(`/api/artifacts?id=${artifact.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content_json: parsed }),
            })
            if (!res.ok) throw new Error(`Save failed (${res.status})`)
            setArtifact({ ...artifact, content_json: parsed as Record<string, unknown> })
          } else {
            throw new Error('JSON must be an object')
          }
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : 'Invalid JSON')
        }
      } else {
        updated[primaryKey] = editText
        const res = await fetch(`/api/artifacts?id=${artifact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_json: updated }),
        })
        if (!res.ok) throw new Error(`Save failed (${res.status})`)
        setArtifact({ ...artifact, content_json: updated })
      }
      setIsEditing(false)
      // After an edit, re-score the brand voice on the new content.
      setBrandVoice(null)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitState('idle')
    }
  }, [artifact, contentObj, editText, primaryKey])

  // ─── Approve handler — committing the safety gate ────────────────────
  const handleApprove = useCallback(async () => {
    if (!artifact || !approvalId) return
    setSubmitState('approving')
    setSubmitError(null)
    setWarning(null)

    try {
      // 1. Always commit the approval first. The approvals API also flips
      //    the underlying artifact's status to 'approved' (see route.ts).
      const apvRes = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          action: 'approve',
          workspaceId,
        }),
      })
      if (!apvRes.ok) {
        const errText = await apvRes.text().catch(() => '')
        throw new Error(`Approval failed: ${apvRes.status} ${errText.slice(0, 200)}`)
      }

      // 2. If a publish destination is set, ALSO queue the artifact for
      //    publishing. This is best-effort — if it fails we still keep
      //    the approval (the user can re-trigger publish manually).
      let queuedForPublish = false
      if (effectivePublishDestination) {
        try {
          const pubRes = await fetch('/api/publish/direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              platforms: [effectivePublishDestination],
              content: primaryText,
              artifactId: artifact.id,
            }),
          })
          if (pubRes.ok) {
            queuedForPublish = true
          } else {
            const errText = await pubRes.text().catch(() => '')
            setWarning(`Approved, but publish to ${effectivePublishDestination} failed: ${errText.slice(0, 120) || pubRes.statusText}`)
          }
        } catch (pubErr) {
          setWarning(`Approved, but publish couldn't be queued: ${pubErr instanceof Error ? pubErr.message : String(pubErr)}`)
        }
      }

      // 3. Notify parent — let the page refresh its data + close the modal.
      onApproved?.({ artifactId: artifact.id, queuedForPublish })
      // Small delay so the warning toast (if any) is visible before close
      if (warning || !queuedForPublish && effectivePublishDestination) {
        // Keep the modal open briefly so the user can see the warning
        setTimeout(() => onClose(), 1800)
      } else {
        onClose()
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setSubmitState('idle')
    }
  }, [
    artifact,
    approvalId,
    workspaceId,
    effectivePublishDestination,
    primaryText,
    onApproved,
    onClose,
    warning,
  ])

  // ─── Refinement streaming (replaces the old Reject handler) ─────────
  //
  // useAgentStream gives us:
  //   - .streamingText  → accumulated tokens (rendered live in preview)
  //   - .status         → 'connecting' | 'streaming' | 'done' | 'error'
  //   - .start({ body }) → fires a fresh stream with workspaceId+artifactId+feedback
  //
  // On done: replace the artifact's primary text in local state with the
  // new content (the server already persisted it), clear brandVoice to
  // trigger a fresh score, and reset the inline feedback textarea.
  const refineStream = useAgentStream({
    endpoint: '/api/agents/refine',
    body: null,
    onDone: ({ output }) => {
      const out = (output ?? {}) as { artifactId?: string; primaryKey?: string; newContent?: string }
      if (artifact && out.newContent && out.primaryKey) {
        // Locally swap the primary text so the preview updates instantly
        // and any subsequent approve uses the refined content.
        const next: ArtifactRow = {
          ...artifact,
          content_json: { ...contentObj, [out.primaryKey]: out.newContent },
        }
        setArtifact(next)
      }
      // Force the Brand Voice Score to re-fetch against the new content.
      setBrandVoice(null)
      setIsAdjustMode(false)
      setAdjustFeedback('')
      setSubmitState('idle')
    },
    onError: (msg) => {
      setSubmitError(`Refinement failed: ${msg}`)
      setSubmitState('idle')
    },
  })

  // Currently streaming refinement? Used to swap the preview source and
  // lock the approve buttons.
  const isRefining = refineStream.status === 'connecting' || refineStream.status === 'streaming'
  useEffect(() => {
    // Keep submitState in sync with the hook's actual state (lets the
    // approve buttons disable while refining without manual bookkeeping).
    if (isRefining) setSubmitState('refining')
  }, [isRefining])

  const handleSubmitAdjustment = useCallback(() => {
    if (!artifact || !adjustFeedback.trim() || isRefining) return
    setSubmitError(null)
    refineStream.start({
      body: {
        workspaceId,
        artifactId: artifact.id,
        feedback: adjustFeedback.trim(),
      },
    })
  }, [artifact, adjustFeedback, isRefining, refineStream, workspaceId])

  // ─── ESC to close (only when not mid-submit) ─────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submitState === 'idle') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, submitState])

  if (!isOpen) return null

  // ─── Render ──────────────────────────────────────────────────────────
  const primaryCtaLabel = effectivePublishDestination
    ? `✅ Approve & Queue for ${effectivePublishDestination}`
    : '✅ Approve & Save'

  const isApproving = submitState === 'approving'
  const isSavingEdit = submitState === 'saving_edit'

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        // Click on the backdrop closes — but not on a child
        if (e.target === e.currentTarget && submitState === 'idle') onClose()
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-2xl max-h-[88vh] flex flex-col">
        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-start gap-3 flex-shrink-0">
          <div className="text-2xl flex-shrink-0">⚠️</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-base font-semibold leading-tight">Review Required</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Nothing publishes until you approve. Edit, approve, or reject.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitState !== 'idle'}
            className="text-gray-500 hover:text-white text-xl leading-none px-2 py-0.5 rounded hover:bg-gray-800 disabled:opacity-40 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ─── Body: scrollable ─── */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Loading state */}
          {loadingArtifact && !artifact && (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500 text-sm gap-3">
              <span className="w-6 h-6 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
              Loading artifact…
            </div>
          )}

          {/* Load error */}
          {loadError && !loadingArtifact && (
            <div className="py-10 bg-red-950/40 border border-red-800 rounded-xl px-4 text-center">
              <p className="text-red-300 text-sm font-medium">Couldn&apos;t load this artifact</p>
              <p className="text-red-400 text-xs mt-1">{loadError}</p>
            </div>
          )}

          {/* Loaded — preview / edit / metadata */}
          {artifact && (
            <>
              {/* Artifact title row */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h3 className="text-white text-sm font-semibold leading-tight">{artifact.title || 'Untitled artifact'}</h3>
                  <p className="text-gray-500 text-[11px] mt-0.5">
                    <span className="capitalize">{artifact.type.replace(/_/g, ' ')}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono text-gray-600">{artifact.id.slice(0, 8)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <BrandVoiceScoreBadge
                    score={brandVoice?.score ?? null}
                    reasoning={brandVoice?.reasoning ?? []}
                    loading={loadingBrandVoice}
                  />
                  {effectivePublishDestination && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-900/40 border border-indigo-700 text-indigo-300 text-[10px] font-medium">
                      → Publishes to {effectivePublishDestination}
                    </span>
                  )}
                </div>
              </div>

              {/* Preview / Edit */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium flex items-center gap-2">
                    {isEditing ? 'Edit' : 'Preview'}
                    {isRefining && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-800 text-indigo-300 text-[9px] font-semibold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Refining live
                      </span>
                    )}
                  </p>
                  {!isEditing ? (
                    <button
                      onClick={startEditing}
                      disabled={submitState !== 'idle'}
                      className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1"
                    >
                      ✏️ Edit
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-500">
                      {editText.length} char{editText.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {!isEditing ? (
                  // When refining, the preview body is sourced from the
                  // live streamingText so the user watches the new content
                  // arrive token-by-token. Otherwise it's the saved
                  // primary field on the artifact.
                  <div className={`bg-gray-950 border rounded-xl px-4 py-3 max-h-72 overflow-y-auto transition-colors ${isRefining ? 'border-indigo-800' : 'border-gray-800'}`}>
                    <pre className="whitespace-pre-wrap text-gray-200 text-sm font-sans leading-relaxed break-words">
                      {isRefining
                        ? (refineStream.streamingText || <span className="text-gray-500 italic">Asking Claude to revise…</span>)
                        : (primaryText || <span className="text-gray-600 italic">(no primary content)</span>)
                      }
                      {isRefining && refineStream.streamingText.length > 0 && (
                        <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                      )}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={10}
                    className="w-full bg-gray-950 border border-indigo-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-gray-200 text-sm font-sans leading-relaxed resize-y outline-none"
                    placeholder="Edit the content…"
                    disabled={isSavingEdit}
                    autoFocus
                  />
                )}
                {isEditing && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={saveEdit}
                      disabled={isSavingEdit || editText === primaryText}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {isSavingEdit ? 'Saving…' : '💾 Save Changes'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={isSavingEdit}
                      className="px-3 py-1.5 border border-gray-700 hover:border-gray-500 text-gray-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel Edit
                    </button>
                    <span className="text-[10px] text-gray-600 ml-auto">
                      Saving re-runs brand voice scoring
                    </span>
                  </div>
                )}
              </div>

              {/* Metadata pills */}
              {metadata.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1.5">Metadata</p>
                  <div className="flex flex-wrap gap-1.5">
                    {metadata.map(({ k, v }) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[11px]"
                      >
                        <span className="text-gray-500">{k}:</span>
                        <span className="text-gray-300 truncate max-w-[180px]">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjustment feedback — expanded when user clicks
                  Request Adjustments. Submitting fires a new refinement
                  stream and the modal stays open through the entire loop. */}
              {isAdjustMode && (
                <div className="bg-indigo-950/30 border border-indigo-800/60 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold mb-1.5 flex items-center gap-1.5">
                    <span className="text-sm">⚡</span> Request Adjustments — what should change?
                  </p>
                  <textarea
                    value={adjustFeedback}
                    onChange={(e) => setAdjustFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      // Cmd/Ctrl+Enter submits — keeps the user's hands on the keyboard
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        handleSubmitAdjustment()
                      }
                    }}
                    rows={3}
                    placeholder="e.g. punch up the hook, shorten by half, more direct CTA, add data points…"
                    className="w-full bg-gray-950 border border-indigo-900/50 focus:border-indigo-600 rounded-lg px-3 py-2 text-gray-200 text-xs resize-none outline-none disabled:opacity-50"
                    disabled={isRefining}
                    autoFocus
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={handleSubmitAdjustment}
                      disabled={isRefining || !adjustFeedback.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {isRefining ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Refining…
                        </>
                      ) : (
                        <>⚡ Send to Claude</>
                      )}
                    </button>
                    <button
                      onClick={() => { setIsAdjustMode(false); setAdjustFeedback('') }}
                      disabled={isRefining}
                      className="px-3 py-1.5 border border-gray-700 hover:border-gray-500 text-gray-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <span className="text-[10px] text-indigo-400/70 ml-auto">
                      ⌘+Enter to send · the score auto-refreshes after
                    </span>
                  </div>
                </div>
              )}

              {/* Submit error */}
              {submitError && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl px-3 py-2 text-red-300 text-xs">
                  {submitError}
                </div>
              )}

              {/* Warning toast (e.g. publish failed but approval landed) */}
              {warning && (
                <div className="bg-yellow-950/40 border border-yellow-800 rounded-xl px-3 py-2 text-yellow-300 text-xs">
                  ⚠ {warning}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Footer: action buttons ───
            New design: no more Reject. The iterative flow is:
              [⚡ Request Adjustments]  [Save as Draft]  ……  [✅ Approve & …]
            Request Adjustments expands the inline feedback textarea above.
            Approve is locked while a refinement stream is in flight (we
            don't want the user committing to mid-stream content). */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setIsAdjustMode(v => !v)}
            disabled={submitState !== 'idle' || !artifact || isEditing}
            className={`px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 border ${
              isAdjustMode
                ? 'bg-indigo-950/60 border-indigo-700 text-indigo-200 hover:bg-indigo-950/80'
                : 'border-indigo-900 hover:border-indigo-700 text-indigo-400 hover:text-indigo-300'
            }`}
          >
            <span>⚡</span>
            <span>{isAdjustMode ? 'Cancel Adjustments' : 'Request Adjustments'}</span>
          </button>
          <button
            onClick={onClose}
            disabled={submitState !== 'idle' || isRefining}
            className="px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            Save as Draft
          </button>
          <div className="flex-1" />
          <button
            onClick={handleApprove}
            disabled={submitState !== 'idle' || !artifact || isEditing || isRefining || isAdjustMode}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            title={isAdjustMode ? 'Finish or cancel adjustments before approving' : undefined}
          >
            {isApproving ? 'Approving…' : primaryCtaLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
