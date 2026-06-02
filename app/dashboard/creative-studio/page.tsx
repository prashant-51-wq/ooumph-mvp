'use client'

/**
 * /dashboard/creative-studio
 *
 * Unified prompt-driven generation workspace across DALL-E 3, Runway Gen-3,
 * and ElevenLabs voice. Layout:
 *
 *   ┌────────────────────────────────┬─────────────────────────────────┐
 *   │  Composer (provider + prompt + │  History deck                    │
 *   │  options + LIVE cost calc)     │  - polls /api/creative-generation-│
 *   │                                 │    jobs every 4s when active     │
 *   │  [Generate] → cost preview      │  - per-row cost + duration       │
 *   │  → poll → asset preview         │  - mock badge if usedMock        │
 *   │                                 │  - Publish → ReviewRequiredModal │
 *   └────────────────────────────────┴─────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistedState } from '@/lib/hooks/use-persisted-state'
import {
  Sparkles, Image as ImageIcon, Film, Music, AlertCircle, RefreshCw,
  Loader2, CheckCircle2, XCircle, Clock, DollarSign, Zap, X,
  Wallet, ShieldCheck, ExternalLink, ChevronRight,
} from 'lucide-react'
import ReviewRequiredModal from '@/components/ReviewRequiredModal'

// ─── Types ────────────────────────────────────────────────────────────────

interface Job {
  id: string
  workspace_id: string
  artifact_id: string | null
  provider: string
  model_name: string | null
  prompt_text: string
  negative_prompt: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'approved_for_publish' | string
  result_asset_id: string | null
  cost_estimate: number | string | null
  duration_ms: number | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface Asset {
  id: string
  workspace_id: string
  filename: string
  url: string
  asset_type: 'image' | 'video' | 'audio' | string
  mime_type: string | null
  dimensions: string | null
  duration_seconds: number | string | null
  source_provider: string | null
  metadata_json: string | null
  status: string
}

type ProviderId = 'openai_dalle' | 'runway_gen3' | 'elevenlabs' | 'stability'

interface ProviderConfig {
  id: ProviderId
  label: string
  outputType: 'image' | 'video' | 'audio'
  Icon: typeof ImageIcon
  baseCost: number
  costNote: string
  envKey: string
  options: { id: string; label: string; values: { id: string; label: string }[] }[]
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai_dalle',
    label: 'DALL-E 3 (Image)',
    outputType: 'image',
    Icon: ImageIcon,
    baseCost: 0.040,
    costNote: 'per image',
    envKey: 'OPENAI_API_KEY',
    options: [
      { id: 'size', label: 'Aspect', values: [
        { id: 'square',    label: '1:1 (1024×1024)' },
        { id: 'landscape', label: '16:9 (1792×1024)' },
        { id: 'portrait',  label: '9:16 (1024×1792)' },
      ]},
    ],
  },
  {
    id: 'runway_gen3',
    label: 'Runway Gen-3 (Video)',
    outputType: 'video',
    Icon: Film,
    baseCost: 0.250,
    costNote: 'per 5s clip',
    envKey: 'RUNWAY_API_KEY',
    options: [
      { id: 'aspectRatio', label: 'Aspect', values: [
        { id: '16:9', label: '16:9 landscape' },
        { id: '9:16', label: '9:16 vertical' },
        { id: '1:1',  label: '1:1 square' },
      ]},
      { id: 'durationSeconds', label: 'Duration', values: [
        { id: '5',  label: '5 seconds' },
        { id: '10', label: '10 seconds' },
      ]},
    ],
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs (Voice)',
    outputType: 'audio',
    Icon: Music,
    baseCost: 0.005,
    costNote: 'per 1000 chars',
    envKey: 'ELEVENLABS_API_KEY',
    options: [],
  },
  {
    id: 'stability',
    label: 'Stability (Image)',
    outputType: 'image',
    Icon: ImageIcon,
    baseCost: 0.020,
    costNote: 'per image',
    envKey: 'STABILITY_API_KEY',
    options: [
      { id: 'aspectRatio', label: 'Aspect', values: [
        { id: '1:1',  label: '1:1 square' },
        { id: '16:9', label: '16:9 landscape' },
        { id: '9:16', label: '9:16 vertical' },
      ]},
      { id: 'outputFormat', label: 'Format', values: [
        { id: 'png',  label: 'PNG (lossless)' },
        { id: 'jpeg', label: 'JPEG' },
        { id: 'webp', label: 'WebP' },
      ]},
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}
function fmtMs(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
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
  return d.toLocaleDateString()
}

const STATUS_PILL: Record<string, string> = {
  pending:                'bg-gray-800 text-gray-400 border-gray-700',
  running:                'bg-blue-900/40 text-blue-200 border-blue-800',
  completed:              'bg-emerald-900/40 text-emerald-200 border-emerald-800',
  approved_for_publish:   'bg-indigo-900/40 text-indigo-200 border-indigo-800',
  failed:                 'bg-rose-900/40 text-rose-200 border-rose-800',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_PILL[status] || STATUS_PILL.pending}`}>
      {(status === 'running' || status === 'pending') && <Loader2 className="w-3 h-3 animate-spin" />}
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// Heuristic detect "used mock" — provider returned `usedMock: true` and we
// surfaced it on metadata; the back-end sets it on the POST response only.
// For history rows the easiest tell is asset url starts with `data:` or
// the public Google sample url (mock video fallback).
function isMockUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith('data:') || url.includes('commondatastorage.googleapis.com')
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CreativeStudioPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [assetsById, setAssetsById] = useState<Record<string, Asset>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Composer state
  const [provider, setProvider] = usePersistedState<ProviderId>('creative-studio:model', 'openai_dalle')
  const [prompt, setPrompt] = usePersistedState<string>('creative-studio:prompt', '')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [options, setOptions] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string; jobId?: string } | null>(null)

  // Review modal state
  const [reviewModal, setReviewModal] = useState<{ approvalId: string; artifactId: string; jobId: string } | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

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

  const fetchJobs = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/creative-generation-jobs?workspaceId=${workspaceId}&limit=50`)
      const rows = await res.json() as Job[]
      setJobs(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  // Fetch jobs initially + poll while any active job
  useEffect(() => { fetchJobs() }, [fetchJobs])
  useEffect(() => {
    if (!workspaceId) return
    const anyActive = jobs.some(j => j.status === 'pending' || j.status === 'running')
    const interval = anyActive ? 4_000 : 20_000
    const t = setInterval(fetchJobs, interval)
    return () => clearInterval(t)
  }, [workspaceId, jobs, fetchJobs])

  // Lazy-load assets for completed jobs (only the result_asset_id ones we don't have yet)
  useEffect(() => {
    if (!workspaceId) return
    const missingIds = jobs
      .filter(j => j.result_asset_id && !assetsById[j.result_asset_id])
      .map(j => j.result_asset_id as string)
    if (missingIds.length === 0) return
    let cancelled = false
    Promise.all(missingIds.slice(0, 10).map(id =>
      fetch(`/api/media-assets?workspaceId=${workspaceId}&limit=1`)
        .then(r => r.ok ? r.json() : [])
        .then((all: Asset[]) => Array.isArray(all) ? all.find(a => a.id === id) : null)
        .catch(() => null),
    )).then(results => {
      if (cancelled) return
      const next: Record<string, Asset> = {}
      results.forEach((asset, i) => {
        if (asset) next[missingIds[i]] = asset
      })
      if (Object.keys(next).length > 0) {
        setAssetsById(prev => ({ ...prev, ...next }))
      }
    })
    return () => { cancelled = true }
  }, [workspaceId, jobs, assetsById])

  // ── Cost estimation (live, before submit) ────────────────────────────
  const providerConfig = useMemo(
    () => PROVIDERS.find(p => p.id === provider) || PROVIDERS[0],
    [provider],
  )

  const estimatedCost = useMemo(() => {
    if (provider === 'elevenlabs') {
      // Per 1000 chars
      const units = Math.max(1, Math.ceil(prompt.length / 1000))
      return providerConfig.baseCost * units
    }
    if (provider === 'runway_gen3') {
      const dur = Number(options.durationSeconds || 5)
      // Linear scaling: 10s = 2× base
      return providerConfig.baseCost * (dur / 5)
    }
    return providerConfig.baseCost
  }, [provider, prompt, options, providerConfig.baseCost])

  // ── Workspace wallet — sum of cost_estimate across all completed jobs ──
  // For now we treat this as informational (no hard cap). Sprint 7 will
  // turn this into an enforced budget.
  const walletUsed = useMemo(() => {
    return jobs.reduce((sum, j) => sum + Number(j.cost_estimate || 0), 0)
  }, [jobs])
  const walletBalance = 100 // placeholder ceiling for the UI — $100 free tier illustration

  // ── Submit handler ────────────────────────────────────────────────────
  const submit = async () => {
    if (!workspaceId || !prompt.trim()) {
      setSubmitError('Prompt is required')
      return
    }
    setSubmitting(true); setSubmitError(null); setSubmitResult(null)
    try {
      const res = await fetch('/api/creative-generation-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          provider,
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          options,
        }),
      })
      const data = await res.json() as {
        ok?: boolean; error?: string; jobId?: string; status?: string
        usedMock?: boolean; assetId?: string; durationMs?: number; costEstimate?: number
      }
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`)
      const mockTag = data.usedMock ? ' (mock — configure provider key for real output)' : ''
      setSubmitResult({
        ok: true,
        jobId: data.jobId,
        message: data.ok
          ? `Generated in ${fmtMs(data.durationMs ?? null)}${mockTag}`
          : `Job created${data.status ? ` · ${data.status}` : ''}${mockTag}`,
      })
      fetchJobs()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Publish flow (HITL gate) ─────────────────────────────────────────
  const openReviewForJob = async (job: Job) => {
    if (!workspaceId) return
    if (!job.artifact_id) {
      // Direct publish if no artifact_id (skipping HITL — user's own gen)
      void publishJob(job.id)
      return
    }
    try {
      const res = await fetch(`/api/approvals?workspaceId=${workspaceId}`)
      const rows = await res.json() as Array<{ id: string; artifact_id: string; status: string }>
      const approval = rows.find(r => r.artifact_id === job.artifact_id && r.status === 'pending')
      if (!approval) {
        // Already approved (or never had a pending row) — just publish
        void publishJob(job.id)
        return
      }
      setReviewModal({ approvalId: approval.id, artifactId: job.artifact_id, jobId: job.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const publishJob = async (jobId: string) => {
    if (!workspaceId) return
    setPublishingId(jobId); setError(null)
    try {
      const res = await fetch(`/api/creative-generation-jobs/${jobId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; status?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Publish failed')
      fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPublishingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-400" /> Creative Studio
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate images, video, and voiceover. Live cost preview before you commit.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchJobs}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <a
              href="/dashboard/media-library"
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              Library <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Wallet stripe */}
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-indigo-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Asset wallet</p>
              <p className="text-base text-white tabular-nums">
                {fmtCost(walletUsed)} / <span className="text-gray-500">{fmtCost(walletBalance)} used</span>
              </p>
            </div>
          </div>
          <div className="flex-1 max-w-md">
            <div className="h-1.5 bg-gray-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${Math.min(100, (walletUsed / walletBalance) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1 text-right tabular-nums">
              {Math.max(0, walletBalance - walletUsed).toFixed(2)} remaining
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* 2-col layout */}
        <div className="grid grid-cols-12 gap-4">
          {/* Composer */}
          <section className="col-span-12 lg:col-span-5 bg-gray-900 border border-gray-800 rounded-xl p-5 self-start">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3">New generation</h2>

            {/* Provider tabs */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PROVIDERS.map(p => {
                const Icon = p.Icon
                const active = provider === p.id
                const disabled = p.id === 'stability'
                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!disabled) { setProvider(p.id); setOptions({}) } }}
                    disabled={disabled}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      active
                        ? 'bg-indigo-900/40 border-indigo-700 text-indigo-100'
                        : disabled
                        ? 'bg-gray-950 border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{fmtCost(p.baseCost)} {p.costNote}</div>
                  </button>
                )
              })}
            </div>

            {/* Prompt */}
            <div className="mb-3">
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Prompt</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={
                  provider === 'elevenlabs'
                    ? 'Text the voice should say…'
                    : provider === 'runway_gen3'
                    ? 'Describe the cinematic scene to generate…'
                    : 'Describe the image to generate…'
                }
                rows={5}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none resize-none"
              />
              {provider === 'elevenlabs' && (
                <p className="text-[10px] text-gray-600 mt-1 text-right tabular-nums">
                  {prompt.length} chars · {Math.max(1, Math.ceil(prompt.length / 1000))} unit(s)
                </p>
              )}
            </div>

            {/* Negative prompt (image / video only) */}
            {(provider === 'openai_dalle' || provider === 'runway_gen3' || provider === 'stability') && (
              <div className="mb-3">
                <label className="block text-xs uppercase text-gray-500 mb-1.5">Negative prompt (optional)</label>
                <input
                  value={negativePrompt}
                  onChange={e => setNegativePrompt(e.target.value)}
                  placeholder="Things to avoid…"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                />
              </div>
            )}

            {/* Provider-specific options */}
            {providerConfig.options.map(opt => (
              <div key={opt.id} className="mb-3">
                <label className="block text-xs uppercase text-gray-500 mb-1.5">{opt.label}</label>
                <select
                  value={options[opt.id] || opt.values[0].id}
                  onChange={e => setOptions(prev => ({ ...prev, [opt.id]: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
                >
                  {opt.values.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            ))}

            {/* Cost calculator */}
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3" /> Estimated cost
                </span>
                <span className="text-lg font-bold text-emerald-300 tabular-nums">{fmtCost(estimatedCost)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-600">
                <span>via {providerConfig.label.split(' (')[0]}</span>
                <span>after: {fmtCost(Math.max(0, walletBalance - walletUsed - estimatedCost))} wallet</span>
              </div>
            </div>

            {/* Submit error / success */}
            {submitError && (
              <div className="p-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs mb-3">
                <AlertCircle className="w-3 h-3 inline mr-1" /> {submitError}
              </div>
            )}
            {submitResult && (
              <div className={`p-2 rounded text-xs mb-3 ${submitResult.ok ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-300' : 'bg-rose-950/40 border border-rose-900 text-rose-300'}`}>
                {submitResult.ok ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
                {submitResult.message}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !prompt.trim() || provider === 'stability'}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {submitting ? 'Generating…' : `Generate · ${fmtCost(estimatedCost)}`}
            </button>
            <p className="text-[10px] text-gray-600 mt-2 text-center">
              Mock results render when the provider key is not configured.
            </p>
          </section>

          {/* History deck */}
          <section className="col-span-12 lg:col-span-7">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider text-gray-500 font-medium">Recent generations</h2>
              <p className="text-[11px] text-gray-600">
                {jobs.length} job{jobs.length === 1 ? '' : 's'} · auto-polls while active
              </p>
            </div>

            {loading ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500 text-sm">Loading history…</div>
            ) : jobs.length === 0 ? (
              <div className="bg-gray-900 border border-dashed border-gray-800 rounded-xl p-12 text-center">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                <p className="text-gray-300 mb-1">No generations yet</p>
                <p className="text-sm text-gray-600">
                  Pick a provider on the left and write your first prompt to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => {
                  const asset = job.result_asset_id ? assetsById[job.result_asset_id] : undefined
                  const isPublishing = publishingId === job.id
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      asset={asset}
                      isPublishing={isPublishing}
                      onPublish={() => openReviewForJob(job)}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Review modal */}
      {reviewModal && workspaceId && (
        <ReviewRequiredModal
          isOpen={true}
          approvalId={reviewModal.approvalId}
          artifactId={reviewModal.artifactId}
          workspaceId={workspaceId}
          publishDestination="media"
          onApproved={() => {
            const jobId = reviewModal.jobId
            setReviewModal(null)
            if (jobId) void publishJob(jobId)
          }}
          onRejected={() => setReviewModal(null)}
          onClose={() => setReviewModal(null)}
        />
      )}
    </div>
  )
}

// ─── Job Card ─────────────────────────────────────────────────────────────

function JobCard({
  job, asset, isPublishing, onPublish,
}: {
  job: Job
  asset: Asset | undefined
  isPublishing: boolean
  onPublish: () => void
}) {
  const providerConfig = PROVIDERS.find(p => p.id === job.provider)
  const Icon = providerConfig?.Icon || Sparkles
  const cost = Number(job.cost_estimate || 0)
  const showMockBadge = isMockUrl(asset?.url)
  const canPublish = job.status === 'completed' && job.result_asset_id
  const isPublished = job.status === 'approved_for_publish'

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
      <div className="grid grid-cols-12 gap-3">
        {/* Preview */}
        <div className="col-span-12 sm:col-span-4 bg-gray-950 relative">
          {asset && asset.asset_type === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={asset.filename} className="w-full h-full object-cover aspect-square sm:aspect-auto sm:min-h-[180px]" />
          )}
          {asset && asset.asset_type === 'video' && (
            <video src={asset.url} controls muted preload="metadata" className="w-full h-full object-cover aspect-video" />
          )}
          {asset && asset.asset_type === 'audio' && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-emerald-950 to-gray-950 min-h-[180px]">
              <Music className="w-8 h-8 text-emerald-400 mb-2" />
              <audio src={asset.url} controls preload="metadata" className="w-full" />
            </div>
          )}
          {!asset && (
            <div className="w-full aspect-square sm:aspect-auto sm:min-h-[180px] flex items-center justify-center">
              {job.status === 'running' || job.status === 'pending' ? (
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
              ) : job.status === 'failed' ? (
                <XCircle className="w-10 h-10 text-rose-400" />
              ) : (
                <Icon className="w-10 h-10 text-gray-700" />
              )}
            </div>
          )}
          {/* Mock badge — amber stamp on the visual frame */}
          {showMockBadge && (
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-900/80 border border-amber-700 rounded text-[10px] text-amber-100 font-bold uppercase tracking-wider">
              ⚠ mock
            </div>
          )}
          {isPublished && (
            <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-900/80 border border-indigo-700 rounded text-[10px] text-indigo-100 font-bold uppercase tracking-wider">
              ✓ published
            </div>
          )}
        </div>

        {/* Details */}
        <div className="col-span-12 sm:col-span-8 p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <Icon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-gray-300">{providerConfig?.label.split(' (')[0] || job.provider}</span>
              <span className="text-gray-600">·</span>
              <StatusPill status={job.status} />
            </div>
            <span className="text-[10px] text-gray-500">{formatRelative(job.created_at)}</span>
          </div>

          <p className="text-sm text-gray-200 mb-2 line-clamp-3" title={job.prompt_text}>
            {job.prompt_text}
          </p>

          {/* Cost + speed tracking */}
          <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400" />
              <span className="tabular-nums">{fmtCost(cost)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span className="tabular-nums">{fmtMs(job.duration_ms)}</span>
            </span>
            {asset?.dimensions && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-500" />
                <span>{asset.dimensions}</span>
              </span>
            )}
          </div>

          {job.error_message && (
            <div className="mb-2 p-2 bg-rose-950/30 border border-rose-900 rounded text-xs text-rose-300">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              {job.error_message}
            </div>
          )}

          <div className="mt-auto flex items-center justify-end gap-2">
            {asset?.url && asset.url.startsWith('http') && (
              <a
                href={asset.url} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {canPublish && !isPublished && (
              <button
                onClick={onPublish}
                disabled={isPublishing}
                className="px-3 py-1 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
              >
                {isPublishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                {isPublishing ? 'Publishing…' : 'Review & publish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

// Unused-import sentinel (keeps tree-shaker happy on a couple icons referenced only in JSDoc)
void X
