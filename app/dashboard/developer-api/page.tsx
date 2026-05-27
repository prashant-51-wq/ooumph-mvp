'use client'

/**
 * /dashboard/developer-api
 *
 * Premium developer control desk. Two tabs:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Tabs: API Access Tokens · Webhooks                                  │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  TOKENS TAB                                                          │
 *   │   List rows with hash preview + scopes + last_used_at                │
 *   │   "Create token" → opens scopes picker                               │
 *   │   On success → ONE-TIME reveal modal with copy guardrails:           │
 *   │     • token rendered behind a "Reveal" mask                          │
 *   │     • Copy button + explicit "I copied it" gate before close         │
 *   │     • the reveal modal is the ONLY surface that shows cleartext      │
 *   │                                                                       │
 *   │  WEBHOOKS TAB                                                        │
 *   │   List subscriptions with target URL, event chip, last_attempt      │
 *   │   If a row has last_error_log, we render a Forensic Diagnostic       │
 *   │   block — diagnosis text + recommendation + a single download        │
 *   │   button bound to the base64-encoded blob the dispatcher already     │
 *   │   wrote into the notifications row (or, here, reconstructed from    │
 *   │   the diagnosis JSON we already loaded).                             │
 *   └──────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound, RefreshCw, AlertCircle, Loader2, X, Plus, Copy, Eye, EyeOff,
  ShieldCheck, Trash2, Webhook, ExternalLink, Activity, Download,
  CheckCircle2, AlertTriangle, RotateCw, Code2, FlaskConical,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface PublicTokenRow {
  id: string
  workspace_id: string
  token_name: string
  scopes: string[]
  last_used_at: string | null
  created_at: string
  hashPreview: string
}

interface WebhookRow {
  id: string
  workspace_id: string
  target_url: string
  event_type: string
  secret_signature: string
  status: 'active' | 'paused' | 'disabled' | string
  last_error_log: string | null
  last_attempt_at: string | null
  last_attempt_status: string | null
  created_at: string
}

/** Mirrors the shape of ForensicDiagnosis in lib/webhook-dispatcher.ts. We
 *  parse `last_error_log` JSON into this shape on the client; if the parse
 *  fails we fall back to a raw-text display. */
interface ForensicDiagnosis {
  diagnosis: string
  category: string
  recommendation: string
  fingerprint: {
    finalStatus: number | null
    finalErrorClass: string | null
    finalErrorMessage: string | null
    attemptCount: number
  }
  attempts: Array<{
    attempt: number
    startedAt: string
    finishedAt: string
    ok: boolean
    status: number | null
    errorClass: string | null
    errorMessage: string | null
    responseBodySnippet: string | null
  }>
  context: {
    subscriptionId: string
    workspaceId: string
    eventType: string
    targetUrl: string
    deliveredAt: string
  }
}

type Tab = 'tokens' | 'webhooks'

const AVAILABLE_SCOPES = [
  { id: 'read:leads',         label: 'Read leads',          group: 'CRM' },
  { id: 'write:leads',        label: 'Write leads',         group: 'CRM' },
  { id: 'read:campaigns',     label: 'Read campaigns',      group: 'Marketing' },
  { id: 'write:campaigns',    label: 'Write campaigns',     group: 'Marketing' },
  { id: 'read:experiments',   label: 'Read experiments',    group: 'Growth' },
  { id: 'write:experiments',  label: 'Write experiments',   group: 'Growth' },
  { id: 'read:call_logs',     label: 'Read call logs',      group: 'Voice' },
  { id: 'read:analytics',     label: 'Read analytics',      group: 'Insight' },
  { id: 'write:webhooks',     label: 'Manage webhooks',     group: 'System' },
]

const COMMON_EVENT_TYPES = [
  'lead.captured',
  'lead.qualified',
  'campaign.sent',
  'experiment.winner_declared',
  'call.completed',
  'artifact.approved',
  'brand_mention.flagged',
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
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

function tryParseDiagnosis(raw: string | null): ForensicDiagnosis | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ForensicDiagnosis
    if (parsed && typeof parsed.diagnosis === 'string') return parsed
  } catch { /* invalid JSON */ }
  return null
}

function categoryStyle(category: string): { label: string; bg: string; text: string } {
  switch (category) {
    case 'rate_limit':         return { label: 'Rate limited',       bg: 'bg-amber-500/15',  text: 'text-amber-300' }
    case 'upstream_5xx':       return { label: 'Receiver crashed',   bg: 'bg-rose-500/15',   text: 'text-rose-300' }
    case 'auth_rejected':      return { label: 'Auth rejected',      bg: 'bg-orange-500/15', text: 'text-orange-300' }
    case 'client_error':       return { label: 'Bad request',        bg: 'bg-yellow-500/15', text: 'text-yellow-300' }
    case 'network_unreachable':return { label: 'Network',            bg: 'bg-purple-500/15', text: 'text-purple-300' }
    case 'timeout':            return { label: 'Timeout',            bg: 'bg-blue-500/15',   text: 'text-blue-300' }
    case 'invalid_url':        return { label: 'Bad URL',            bg: 'bg-gray-500/15',   text: 'text-gray-300' }
    default:                   return { label: 'Unknown',            bg: 'bg-gray-500/15',   text: 'text-gray-300' }
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DeveloperApiPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('tokens')
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [tokens, setTokens] = useState<PublicTokenRow[]>([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [showCreateToken, setShowCreateToken] = useState(false)
  const [revealedToken, setRevealedToken] = useState<{ token: string; name: string } | null>(null)

  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(true)
  const [showCreateWebhook, setShowCreateWebhook] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState<{ secret: string; targetUrl: string } | null>(null)

  // ── Session ──
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

  // ── Fetchers ──
  const fetchTokens = useCallback(async () => {
    if (!workspaceId) return
    setTokensLoading(true)
    try {
      const res = await fetch(`/api/developer-tokens?workspaceId=${workspaceId}`)
      const rows = await res.json() as PublicTokenRow[] | { error: string }
      setTokens(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTokensLoading(false)
    }
  }, [workspaceId])

  const fetchWebhooks = useCallback(async () => {
    if (!workspaceId) return
    setWebhooksLoading(true)
    try {
      const res = await fetch(`/api/webhook-subscriptions?workspaceId=${workspaceId}`)
      const rows = await res.json() as WebhookRow[] | { error: string }
      setWebhooks(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWebhooksLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchTokens() }, [workspaceId, fetchTokens])
  useEffect(() => { if (workspaceId) fetchWebhooks() }, [workspaceId, fetchWebhooks])

  // ── Token actions ──
  const createToken = async (tokenName: string, scopes: string[]) => {
    if (!workspaceId) return
    const res = await fetch('/api/developer-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, tokenName, scopes }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; token?: string }
    if (!res.ok || !data.token) {
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return { token: data.token }
  }

  const revokeToken = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Revoke this token? Any system currently using it will start failing immediately.')) return
    try {
      const res = await fetch(`/api/developer-tokens/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setActionMessage({ ok: true, text: 'Token revoked.' })
      await fetchTokens()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Webhook actions ──
  const createWebhook = async (targetUrl: string, eventType: string) => {
    if (!workspaceId) return
    const res = await fetch('/api/webhook-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, targetUrl, eventType }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; secret?: string }
    if (!res.ok || !data.secret) {
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return { secret: data.secret }
  }

  const rotateSecret = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Rotate this webhook\'s signing secret? The current value will stop verifying immediately on the receiver side.')) return
    try {
      const res = await fetch(`/api/webhook-subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, rotateSecret: true }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; secret?: string }
      if (!res.ok || !data.secret) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const matching = webhooks.find(w => w.id === id)
      setRevealedSecret({ secret: data.secret, targetUrl: matching?.target_url || '' })
      await fetchWebhooks()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  const setWebhookStatus = async (id: string, status: 'active' | 'paused') => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/webhook-subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, status }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      await fetchWebhooks()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  const deleteWebhook = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this webhook subscription?')) return
    try {
      const res = await fetch(`/api/webhook-subscriptions/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setActionMessage({ ok: true, text: 'Webhook subscription deleted.' })
      await fetchWebhooks()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Code2 className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Developer API</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Personal access tokens for the public Ooumph API, plus outbound webhook subscriptions with
                HMAC-signed delivery and a 3x retry circuit. Every failure ships a forensic diagnostic
                report straight to your engineering team.
              </p>
            </div>
          </div>
          <button
            onClick={() => { fetchTokens(); fetchWebhooks() }}
            disabled={!workspaceId || tokensLoading || webhooksLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${tokensLoading || webhooksLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Banners ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-300">{error}</div>
          </div>
        )}
        {actionMessage && (
          <div className={`mb-4 p-3 rounded-lg border flex items-start gap-2.5 ${
            actionMessage.ok
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-red-500/10 border-red-500/20'
          }`}>
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
            { id: 'tokens'   as Tab, label: 'API Access Tokens', count: tokens.length,   icon: <KeyRound className="w-3.5 h-3.5" /> },
            { id: 'webhooks' as Tab, label: 'Webhooks',          count: webhooks.length, icon: <Webhook className="w-3.5 h-3.5" /> },
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

        {tab === 'tokens' ? (
          <TokensTab
            loading={tokensLoading}
            tokens={tokens}
            onCreate={() => setShowCreateToken(true)}
            onRevoke={revokeToken}
          />
        ) : (
          <WebhooksTab
            loading={webhooksLoading}
            webhooks={webhooks}
            onCreate={() => setShowCreateWebhook(true)}
            onRotateSecret={rotateSecret}
            onToggleStatus={setWebhookStatus}
            onDelete={deleteWebhook}
          />
        )}
      </div>

      {/* ── Create-token modal ────────────────────────────────────────── */}
      {showCreateToken && (
        <CreateTokenModal
          onClose={() => setShowCreateToken(false)}
          onCreate={async (name, scopes) => {
            try {
              const result = await createToken(name, scopes)
              if (result?.token) {
                setShowCreateToken(false)
                setRevealedToken({ token: result.token, name })
                await fetchTokens()
              }
            } catch (err) {
              setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
            }
          }}
        />
      )}

      {/* ── One-time token reveal ─────────────────────────────────────── */}
      {revealedToken && (
        <RevealOnceModal
          title={`Token created: ${revealedToken.name}`}
          subtitle="This cleartext appears exactly once. Copy it into your secret manager before closing this dialog — we only kept the SHA-256 hash on our side."
          secret={revealedToken.token}
          onClose={() => setRevealedToken(null)}
        />
      )}

      {/* ── Create-webhook modal ──────────────────────────────────────── */}
      {showCreateWebhook && (
        <CreateWebhookModal
          onClose={() => setShowCreateWebhook(false)}
          onCreate={async (url, evt) => {
            try {
              const result = await createWebhook(url, evt)
              if (result?.secret) {
                setShowCreateWebhook(false)
                setRevealedSecret({ secret: result.secret, targetUrl: url })
                await fetchWebhooks()
              }
            } catch (err) {
              setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
            }
          }}
        />
      )}

      {/* ── Webhook secret reveal (also used for rotation) ────────────── */}
      {revealedSecret && (
        <RevealOnceModal
          title="Webhook signing secret"
          subtitle={`Paste this into your receiver at ${revealedSecret.targetUrl}. We use it to HMAC-SHA256-sign every outbound payload — your endpoint must verify it.`}
          secret={revealedSecret.secret}
          onClose={() => setRevealedSecret(null)}
        />
      )}
    </div>
  )
}

// ─── Tokens Tab ───────────────────────────────────────────────────────────

function TokensTab({
  loading, tokens, onCreate, onRevoke,
}: {
  loading: boolean
  tokens: PublicTokenRow[]
  onCreate: () => void
  onRevoke: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading tokens…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Personal Access Tokens</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Bearer tokens for programmatic API access. Plaintext is revealed once on creation only.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Create token
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="text-center py-20 bg-gray-900/40 rounded-xl border border-gray-800">
          <div className="inline-flex w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-3">
            <KeyRound className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-200">No tokens yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Mint your first <code className="font-mono text-gray-300">oo_</code> token to start hitting the Ooumph API programmatically.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Preview</th>
                <th className="text-left px-4 py-2.5 font-medium">Scopes</th>
                <th className="text-left px-4 py-2.5 font-medium">Last used</th>
                <th className="text-left px-4 py-2.5 font-medium">Created</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} className="border-b border-gray-800/40 last:border-b-0 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-200 font-medium">{t.token_name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.hashPreview}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.scopes.length === 0 ? (
                        <span className="text-[10px] text-gray-600 italic">no scopes</span>
                      ) : t.scopes.map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatRelative(t.last_used_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatRelative(t.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onRevoke(t.id)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 hover:bg-rose-500/15 text-gray-500 hover:text-rose-300 transition"
                      aria-label="Revoke token"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Webhooks Tab ─────────────────────────────────────────────────────────

function WebhooksTab({
  loading, webhooks, onCreate, onRotateSecret, onToggleStatus, onDelete,
}: {
  loading: boolean
  webhooks: WebhookRow[]
  onCreate: () => void
  onRotateSecret: (id: string) => void
  onToggleStatus: (id: string, status: 'active' | 'paused') => void
  onDelete: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading webhook subscriptions…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Webhook Subscriptions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            HMAC-signed outbound deliveries with 3x retry and forensic diagnosis on dead targets.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New webhook
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div className="text-center py-20 bg-gray-900/40 rounded-xl border border-gray-800">
          <div className="inline-flex w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-3">
            <Webhook className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-200">No webhooks yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Subscribe to events like <code className="font-mono text-gray-300">lead.captured</code> or
            {' '}<code className="font-mono text-gray-300">experiment.winner_declared</code> to receive
            HMAC-signed POSTs from Ooumph in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(w => (
            <WebhookCard
              key={w.id}
              webhook={w}
              onRotateSecret={() => onRotateSecret(w.id)}
              onToggleStatus={() => onToggleStatus(w.id, w.status === 'active' ? 'paused' : 'active')}
              onDelete={() => onDelete(w.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Webhook card (with forensic block) ──────────────────────────────────

function WebhookCard({
  webhook, onRotateSecret, onToggleStatus, onDelete,
}: {
  webhook: WebhookRow
  onRotateSecret: () => void
  onToggleStatus: () => void
  onDelete: () => void
}) {
  const diagnosis = useMemo(() => tryParseDiagnosis(webhook.last_error_log), [webhook.last_error_log])
  const hasFailure = Boolean(diagnosis)
  const isPaused = webhook.status === 'paused'

  return (
    <div className={`bg-gray-900/60 border rounded-xl overflow-hidden ${
      hasFailure ? 'border-rose-500/30' : 'border-gray-800 hover:border-gray-700'
    } transition`}>
      {/* Top strip */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
            hasFailure
              ? 'bg-rose-500/10 border-rose-500/20'
              : isPaused
                ? 'bg-amber-500/10 border-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20'
          }`}>
            <Webhook className={`w-4 h-4 ${
              hasFailure ? 'text-rose-400' : isPaused ? 'text-amber-400' : 'text-emerald-400'
            }`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-gray-800 text-gray-200">
                {webhook.event_type}
              </span>
              <StatusPill status={webhook.status} hasFailure={hasFailure} />
              {webhook.last_attempt_status && (
                <span className="text-[10px] text-gray-500 font-mono">
                  last: {webhook.last_attempt_status} · {formatRelative(webhook.last_attempt_at)}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-300 font-mono truncate" title={webhook.target_url}>
              {webhook.target_url}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleStatus}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={onRotateSecret}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
            title="Rotate signing secret"
          >
            <RotateCw className="w-3 h-3" />
            Rotate
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800/60 hover:bg-rose-500/15 text-gray-500 hover:text-rose-300 transition"
            aria-label="Delete subscription"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Forensic block (only when last delivery failed) */}
      {diagnosis && (
        <ForensicDiagnosticBlock diagnosis={diagnosis} subscriptionId={webhook.id} />
      )}
    </div>
  )
}

function StatusPill({ status, hasFailure }: { status: string; hasFailure: boolean }) {
  if (hasFailure) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-500/15 text-rose-300">
        <AlertTriangle className="w-2.5 h-2.5" />
        Failing
      </span>
    )
  }
  const map: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    active:   { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'active',   icon: <CheckCircle2 className="w-2.5 h-2.5" /> },
    paused:   { bg: 'bg-amber-500/15',   text: 'text-amber-300',   label: 'paused',   icon: <Activity className="w-2.5 h-2.5" /> },
    disabled: { bg: 'bg-gray-500/15',    text: 'text-gray-400',    label: 'disabled', icon: <Activity className="w-2.5 h-2.5" /> },
  }
  const c = map[status] || map.active
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text}`}>
      {c.icon}
      {c.label}
    </span>
  )
}

// ─── Forensic block ───────────────────────────────────────────────────────

function ForensicDiagnosticBlock({
  diagnosis, subscriptionId,
}: {
  diagnosis: ForensicDiagnosis
  subscriptionId: string
}) {
  const cat = categoryStyle(diagnosis.category)
  // Reconstruct the same base64 data: URL the dispatcher emitted into the
  // notifications row — clicking it downloads the full forensic JSON.
  const downloadHref = useMemo(() => {
    try {
      const json = JSON.stringify(diagnosis)
      const b64 = typeof window !== 'undefined' && window.btoa
        ? window.btoa(unescape(encodeURIComponent(json)))
        : ''
      return `data:application/json;name=ooumph-webhook-forensic-${subscriptionId}.json;base64,${b64}`
    } catch {
      return ''
    }
  }, [diagnosis, subscriptionId])

  return (
    <div className="border-t border-rose-500/20 bg-rose-500/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-md bg-rose-500/15 border border-rose-500/25 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">
              Forensic Diagnosis
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.text}`}>
              {cat.label}
            </span>
            <span className="text-[10px] text-gray-500 font-mono">
              {diagnosis.fingerprint.attemptCount} attempt{diagnosis.fingerprint.attemptCount === 1 ? '' : 's'} · final {
                diagnosis.fingerprint.finalStatus ?? diagnosis.fingerprint.finalErrorClass ?? 'unknown'
              }
            </span>
          </div>

          <p className="text-sm text-rose-100 leading-relaxed mb-2">
            {diagnosis.diagnosis}
          </p>

          <div className="p-3 rounded-md bg-gray-900/60 border border-gray-800 mb-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
              Recommendation
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{diagnosis.recommendation}</p>
          </div>

          {/* Per-attempt log */}
          {diagnosis.attempts.length > 0 && (
            <details className="mb-3">
              <summary className="text-[10px] uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-200 select-none font-semibold">
                Attempt log ({diagnosis.attempts.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {diagnosis.attempts.map(a => (
                  <div key={a.attempt} className="text-[11px] font-mono p-2 rounded-md bg-gray-900/80 border border-gray-800 text-gray-400">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        <span className="text-gray-500">#{a.attempt}</span>
                        {' · '}
                        <span className={a.ok ? 'text-emerald-300' : 'text-rose-300'}>
                          {a.status !== null ? `HTTP ${a.status}` : a.errorClass || 'error'}
                        </span>
                      </span>
                      <span className="text-gray-600">{new Date(a.startedAt).toLocaleTimeString()}</span>
                    </div>
                    {a.errorMessage && (
                      <div className="mt-1 text-rose-200/80 break-all">{a.errorMessage}</div>
                    )}
                    {a.responseBodySnippet && (
                      <div className="mt-1 text-gray-500 whitespace-pre-wrap break-all">
                        {a.responseBodySnippet.slice(0, 400)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Download action — binds to the same base64 blob the dispatcher
              put into the notification's link field. One-click for engineers. */}
          <a
            href={downloadHref}
            download={`ooumph-webhook-forensic-${subscriptionId}.json`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 transition"
          >
            <Download className="w-3 h-3" />
            Download forensic report
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Create-token modal ───────────────────────────────────────────────────

function CreateTokenModal({
  onClose, onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, scopes: string[]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<string>>(new Set(['read:leads']))
  const [saving, setSaving] = useState(false)

  const toggleScope = (id: string) => {
    setScopes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grouped = useMemo(() => {
    const m = new Map<string, typeof AVAILABLE_SCOPES>()
    for (const s of AVAILABLE_SCOPES) {
      const arr = m.get(s.group) || []
      arr.push(s)
      m.set(s.group, arr)
    }
    return Array.from(m.entries())
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              <KeyRound className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold">Create API token</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block">Token name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. CI Deploy Bot"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">Internal label only — never sent in API calls.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-300 mb-2 block">Scopes</label>
            <div className="space-y-3">
              {grouped.map(([group, list]) => (
                <div key={group}>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">{group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map(s => {
                      const active = scopes.has(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleScope(s.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono transition border ${
                            active
                              ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                              : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                          }`}
                        >
                          {s.id}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Tip: <code className="font-mono text-gray-400">read:*</code> grants every read scope.
              The token is only as powerful as the boxes you tick.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setSaving(true)
              try { await onCreate(name.trim(), Array.from(scopes)) }
              finally { setSaving(false) }
            }}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create token
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create-webhook modal ────────────────────────────────────────────────

function CreateWebhookModal({
  onClose, onCreate,
}: {
  onClose: () => void
  onCreate: (targetUrl: string, eventType: string) => Promise<void>
}) {
  const [targetUrl, setTargetUrl] = useState('')
  const [eventType, setEventType] = useState(COMMON_EVENT_TYPES[0])
  const [customEvent, setCustomEvent] = useState('')
  const [saving, setSaving] = useState(false)
  const usingCustom = !COMMON_EVENT_TYPES.includes(eventType) || eventType === 'custom'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              <Webhook className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold">New webhook subscription</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block">Target URL</label>
            <input
              type="url"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://your-app.com/ooumph/webhook"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Must be HTTPS. We&apos;ll POST a JSON body signed with HMAC-SHA256 — verify the
              <code className="mx-1 font-mono text-gray-300">X-Ooumph-Signature</code> header on receipt.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block">Event type</label>
            <select
              value={usingCustom ? 'custom' : eventType}
              onChange={e => {
                if (e.target.value === 'custom') {
                  setEventType('custom')
                } else {
                  setEventType(e.target.value)
                  setCustomEvent('')
                }
              }}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {COMMON_EVENT_TYPES.map(e => (
                <option key={e} value={e} className="bg-gray-900">{e}</option>
              ))}
              <option value="custom" className="bg-gray-900">… custom event</option>
            </select>
            {usingCustom && (
              <input
                type="text"
                value={customEvent}
                onChange={e => setCustomEvent(e.target.value.trim().toLowerCase())}
                placeholder="namespace.action (e.g. invoice.paid)"
                className="w-full mt-2 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              Custom event format: <code className="font-mono text-gray-400">namespace.action</code>, lowercase only.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 flex items-start gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-300 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-200/80 leading-relaxed">
              On submit, we&apos;ll mint a one-time <code className="font-mono">whsec_…</code> signing secret.
              You&apos;ll copy it into your receiver to verify our HMAC signatures.
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setSaving(true)
              try {
                const finalEvent = usingCustom ? customEvent.trim() : eventType
                await onCreate(targetUrl.trim(), finalEvent)
              } finally { setSaving(false) }
            }}
            disabled={saving || !targetUrl.trim() || (usingCustom && !customEvent.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create subscription
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reveal-once modal with copy guardrails ──────────────────────────────

function RevealOnceModal({
  title, subtitle, secret, onClose,
}: {
  title: string
  subtitle: string
  secret: string
  onClose: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      // Re-arm after 3s so a second copy is still possible while modal is open
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Some browsers block clipboard without explicit user gesture — fall
      // back to selectAll on the input so the user can ⌘/Ctrl+C manually.
      const el = document.getElementById('reveal-once-input') as HTMLInputElement | null
      el?.select()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        // Copy guardrail: block backdrop click from dismissing until the user
        // has explicitly acknowledged. Closing requires the "I copied it" toggle.
        if (e.target === e.currentTarget && acknowledged) onClose()
      }}
    >
      <div className="bg-gray-900 border border-amber-500/30 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Cleartext display, gated behind a Reveal toggle */}
          <div>
            <label className="text-xs font-medium text-gray-300 mb-1.5 block flex items-center gap-2">
              Token
              <button
                type="button"
                onClick={() => setRevealed(r => !r)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-200 transition"
              >
                {revealed ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
              </button>
            </label>
            <div className="relative">
              <input
                id="reveal-once-input"
                type={revealed ? 'text' : 'password'}
                value={secret}
                readOnly
                onFocus={e => e.currentTarget.select()}
                className="w-full pl-3 pr-24 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm font-mono text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  copied
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                }`}
              >
                {copied ? <><CheckCircle2 className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
          </div>

          {/* Confirmation gate — backdrop / close button only fires once this
              is ticked. Copy-protection guardrail per the spec. */}
          <label className="flex items-start gap-2 p-3 rounded-lg bg-gray-950 border border-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span className="text-xs text-gray-300 leading-relaxed">
              I&apos;ve stored this value in my secret manager. I understand
              <span className="text-amber-300"> Ooumph cannot show it again</span>.
            </span>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={!acknowledged}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              acknowledged
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
