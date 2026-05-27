'use client'

/**
 * /dashboard/settings/security
 *
 * Workspace data privacy & retention center. Every stream the platform
 * tracks gets one card in a responsive grid. Each card carries:
 *
 *   • Stream icon + display label
 *   • Numeric stepper + range slider for retention_days (1..3650)
 *   • Purge / Archive toggle (action_disposition)
 *   • Save button → POST /api/settings/security (idempotent upsert)
 *   • Toast feedback on save
 *
 * Catalogue + bounds are sourced from the server response so the UI's
 * allow-list stays in lockstep with the sweeper's allow-list — never a
 * hand-edited constant on the client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, RefreshCw, AlertCircle, Loader2, X, CheckCircle2,
  Phone, FlaskConical, UserPlus, Bot, Bell, Activity,
  Trash2, Archive, Save, Lock,
} from 'lucide-react'

// ─── Types (mirror /api/settings/security) ────────────────────────────────

interface PolicyDetail {
  id: string
  retentionDays: number
  actionDisposition: 'purge' | 'archive' | string
  updatedAt: string
  createdAt: string
}

interface CatalogueEntry {
  streamTarget: string
  policy: PolicyDetail | null
}

interface SecurityPayload {
  workspaceId: string
  allowedStreams: string[]
  allowedActions: string[]
  minRetentionDays: number
  maxRetentionDays: number
  rows: Array<{
    id: string
    workspace_id: string
    stream_target: string
    retention_days: number | string
    action_disposition: string
    updated_at: string
    created_at: string
  }>
  catalogue: CatalogueEntry[]
}

interface StreamMetadata {
  displayName: string
  description: string
  iconColor: string
  iconBg: string
  iconBorder: string
  icon: React.ReactNode
  defaultDays: number
}

// ─── Stream catalogue presentation ────────────────────────────────────────

const STREAM_META: Record<string, StreamMetadata> = {
  call_logs: {
    displayName: 'Call Logs',
    description: 'Inbound and outbound voice transcripts, summaries, recordings, and sentiment scores from Vapi/Twilio.',
    iconColor: 'text-indigo-300',
    iconBg: 'bg-indigo-500/15',
    iconBorder: 'border-indigo-500/30',
    icon: <Phone className="w-4 h-4" />,
    defaultDays: 90,
  },
  experiment_events: {
    displayName: 'A/B Experiment Events',
    description: 'Per-impression and conversion events for every running marketing experiment. High-volume, prune aggressively.',
    iconColor: 'text-purple-300',
    iconBg: 'bg-purple-500/15',
    iconBorder: 'border-purple-500/30',
    icon: <FlaskConical className="w-4 h-4" />,
    defaultDays: 30,
  },
  enrichment_logs: {
    displayName: 'Lead Enrichments',
    description: 'Raw provider responses captured during multi-source lead enrichment (Apollo, Clearbit, Hunter, Brave).',
    iconColor: 'text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    iconBorder: 'border-emerald-500/30',
    icon: <UserPlus className="w-4 h-4" />,
    defaultDays: 60,
  },
  agent_runs: {
    displayName: 'Agent Runs',
    description: 'Every CMO / Strategy / Content / Retargeting agent invocation — input, output, cost estimate, errors.',
    iconColor: 'text-blue-300',
    iconBg: 'bg-blue-500/15',
    iconBorder: 'border-blue-500/30',
    icon: <Bot className="w-4 h-4" />,
    defaultDays: 120,
  },
  notifications: {
    displayName: 'Notifications',
    description: 'Bell-icon alerts: experiment winners, dead webhooks, crisis-mode trips. Auto-prune cleared rows quickly.',
    iconColor: 'text-amber-300',
    iconBg: 'bg-amber-500/15',
    iconBorder: 'border-amber-500/30',
    icon: <Bell className="w-4 h-4" />,
    defaultDays: 45,
  },
  system_performance_audits: {
    displayName: 'System Telemetry',
    description: 'Per-operation latency, status, and error captures that power /dashboard/system-health graphs.',
    iconColor: 'text-rose-300',
    iconBg: 'bg-rose-500/15',
    iconBorder: 'border-rose-500/30',
    icon: <Activity className="w-4 h-4" />,
    defaultDays: 30,
  },
}

const DEFAULT_META: StreamMetadata = {
  displayName: 'System Stream',
  description: 'Internal data stream.',
  iconColor: 'text-gray-300',
  iconBg: 'bg-gray-500/15',
  iconBorder: 'border-gray-500/30',
  icon: <Activity className="w-4 h-4" />,
  defaultDays: 90,
}

function metaFor(slug: string): StreamMetadata {
  return STREAM_META[slug] || DEFAULT_META
}

// ─── Toast ────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  kind: 'success' | 'error'
  text: string
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [payload, setPayload] = useState<SecurityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

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

  const fetchPayload = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/security?workspaceId=${workspaceId}`)
      const data = await res.json() as SecurityPayload | { error: string }
      if (!res.ok || 'error' in data) {
        throw new Error('error' in data ? data.error : `HTTP ${res.status}`)
      }
      setPayload(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchPayload() }, [workspaceId, fetchPayload])

  const pushToast = useCallback((kind: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, kind, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const handleSave = useCallback(async (
    streamTarget: string,
    retentionDays: number,
    actionDisposition: 'purge' | 'archive',
  ) => {
    if (!workspaceId) return
    try {
      const res = await fetch('/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, streamTarget, retentionDays, actionDisposition }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; created?: boolean }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      pushToast('success', data.created
        ? `Retention policy created for ${metaFor(streamTarget).displayName}.`
        : `Retention policy updated for ${metaFor(streamTarget).displayName}.`)
      await fetchPayload()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, pushToast, fetchPayload])

  const handleClear = useCallback(async (policyId: string, streamTarget: string) => {
    if (!workspaceId) return
    if (!confirm(`Clear retention policy for ${metaFor(streamTarget).displayName}? The sweeper will stop pruning this stream until you reconfigure it.`)) return
    try {
      const res = await fetch(`/api/settings/security?id=${policyId}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      pushToast('success', `Policy cleared — ${metaFor(streamTarget).displayName} retention reset.`)
      await fetchPayload()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, pushToast, fetchPayload])

  // ── Counts ──
  const counts = useMemo(() => {
    if (!payload) return { total: 0, configured: 0 }
    return {
      total: payload.catalogue.length,
      configured: payload.catalogue.filter(c => c.policy).length,
    }
  }, [payload])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Lock className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Security & Data Retention</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Configure how long each data stream lives in your workspace. The platform sweeper runs on a
                cron schedule, walks every policy you set here, and prunes (or archives) anything past its
                retention window. Defaults aren&apos;t enforced — streams without a policy keep data indefinitely.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchPayload()}
            disabled={loading || !workspaceId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-300">{error}</div>
          </div>
        )}

        {/* ── Top trust strip ────────────────────────────────────────── */}
        <div className="p-4 rounded-lg bg-gray-900/40 border border-gray-800 flex items-start gap-3 mb-6">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-medium">
              {counts.configured} of {counts.total} streams have an active retention policy.
            </span>
            {' '}Purge permanently deletes rows older than the window. Archive is reserved for future
            cold-storage sinks — for now both actions delete. The sweeper runs hourly with batched
            deletes capped at 500 rows per pass to avoid live-table lock contention.
          </div>
        </div>

        {/* ── Grid ────────────────────────────────────────────────────── */}
        {loading && !payload ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading retention policies…</span>
          </div>
        ) : !payload ? (
          <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800 text-gray-500 text-sm">
            Failed to load retention center.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {payload.catalogue.map(entry => (
              <RetentionCard
                key={entry.streamTarget}
                entry={entry}
                minDays={payload.minRetentionDays}
                maxDays={payload.maxRetentionDays}
                onSave={(days, action) => handleSave(entry.streamTarget, days, action)}
                onClear={(policyId) => handleClear(policyId, entry.streamTarget)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Toast stack ──────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`p-3 pr-9 rounded-lg border shadow-2xl flex items-start gap-2.5 backdrop-blur-sm ${
              t.kind === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : 'bg-rose-500/15 border-rose-500/30'
            }`}
          >
            {t.kind === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-rose-300 flex-shrink-0 mt-0.5" />}
            <div className={`text-xs leading-relaxed ${t.kind === 'success' ? 'text-emerald-100' : 'text-rose-100'}`}>
              {t.text}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Retention card ──────────────────────────────────────────────────────

function RetentionCard({
  entry, minDays, maxDays, onSave, onClear,
}: {
  entry: CatalogueEntry
  minDays: number
  maxDays: number
  onSave: (days: number, action: 'purge' | 'archive') => Promise<void>
  onClear: (policyId: string) => void
}) {
  const meta = metaFor(entry.streamTarget)
  const initialDays = entry.policy?.retentionDays ?? meta.defaultDays
  const initialAction: 'purge' | 'archive' =
    entry.policy?.actionDisposition === 'archive' ? 'archive' : 'purge'

  const [days, setDays] = useState<number>(initialDays)
  const [action, setAction] = useState<'purge' | 'archive'>(initialAction)
  const [saving, setSaving] = useState(false)

  // Keep local state in sync if the policy gets refetched from upstream.
  useEffect(() => {
    setDays(entry.policy?.retentionDays ?? meta.defaultDays)
    setAction(entry.policy?.actionDisposition === 'archive' ? 'archive' : 'purge')
  }, [entry.policy?.id, entry.policy?.retentionDays, entry.policy?.actionDisposition, meta.defaultDays])

  const dirty =
    days !== (entry.policy?.retentionDays ?? meta.defaultDays) ||
    action !== (entry.policy?.actionDisposition === 'archive' ? 'archive' : 'purge') ||
    !entry.policy

  const clampedDays = (n: number) => Math.min(maxDays, Math.max(minDays, Math.floor(Number(n) || 0)))

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(clampedDays(days), action) }
    finally { setSaving(false) }
  }

  return (
    <div className={`bg-gray-900/60 border rounded-xl p-5 transition ${
      entry.policy ? 'border-gray-800' : 'border-gray-800 border-dashed'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${meta.iconBg} ${meta.iconBorder} ${meta.iconColor}`}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-100">{meta.displayName}</h3>
            {entry.policy ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-700/60 text-gray-400">
                Unconfigured
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{meta.description}</p>
          <div className="text-[10px] text-gray-600 font-mono mt-1">{entry.streamTarget}</div>
        </div>
      </div>

      {/* Retention controls */}
      <div className="space-y-4">
        {/* Days */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-300">Retention window</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={days}
                onChange={e => setDays(clampedDays(Number(e.target.value)))}
                min={minDays}
                max={maxDays}
                className="w-20 px-2 py-1 bg-gray-950 border border-gray-800 rounded-md text-xs font-mono text-right text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="text-xs text-gray-500">days</span>
            </div>
          </div>
          <input
            type="range"
            value={days}
            onChange={e => setDays(clampedDays(Number(e.target.value)))}
            min={minDays}
            max={maxDays}
            step={1}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1">
            <span>{minDays}d</span>
            <span>1y</span>
            <span>5y</span>
            <span>{maxDays}d (≈10y)</span>
          </div>
        </div>

        {/* Action */}
        <div>
          <label className="text-xs font-medium text-gray-300 mb-2 block">Action when expired</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAction('purge')}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition border flex items-center justify-center gap-1.5 ${
                action === 'purge'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-200 ring-1 ring-inset ring-rose-500/30'
                  : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              Purge
            </button>
            <button
              type="button"
              onClick={() => setAction('archive')}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition border flex items-center justify-center gap-1.5 ${
                action === 'archive'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200 ring-1 ring-inset ring-indigo-500/30'
                  : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              <Archive className="w-3 h-3" />
              Archive
            </button>
          </div>
          {action === 'archive' && (
            <p className="text-[10px] text-gray-500 mt-1.5">
              Archive sinks aren&apos;t wired yet — the sweeper falls back to purge until cold storage ships.
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-800">
        <div className="text-[10px] text-gray-600 font-mono">
          {entry.policy ? `Updated ${new Date(entry.policy.updatedAt).toLocaleDateString()}` : 'New policy'}
        </div>
        <div className="flex items-center gap-1.5">
          {entry.policy && (
            <button
              onClick={() => onClear(entry.policy!.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800/60 hover:bg-rose-500/15 text-gray-400 hover:text-rose-300 transition"
              title="Clear policy"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              dirty
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {entry.policy ? 'Save changes' : 'Create policy'}
          </button>
        </div>
      </div>
    </div>
  )
}
