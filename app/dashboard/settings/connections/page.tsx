'use client'

/**
 * /dashboard/settings/connections
 *
 * App marketplace. Each card represents one third-party integration the
 * workspace can connect — Slack, HubSpot, Salesforce, Stripe.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Header + filter chips (All · Connected · Available)                 │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                         │
 *   │  │ Stripe │ │ Slack  │ │HubSpot │ │Sales-  │                         │
 *   │  │  ✓ ON  │ │  · off │ │  ✓ ON  │ │ force  │                         │
 *   │  └────────┘ └────────┘ └────────┘ └────────┘                         │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Clicking a card opens the Credentials Drawer with per-provider fields
 * (defined in PROVIDER_DEFINITIONS below). The plaintext credentials are
 * POSTed to /api/integration-connections, which AES-256-GCM-encrypts the
 * JSON via lib/secrets.ts BEFORE persistence. Cleartext is never returned
 * by the API, so the form fields re-open empty on subsequent edits — we
 * only show whether `hasCredentials` is true (badge in the card).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plug, RefreshCw, AlertCircle, Loader2, X, CheckCircle2,
  ShieldCheck, Trash2, Settings2, Sparkles, Zap, ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface ConnectionRow {
  id: string
  workspace_id: string
  provider_slug: string
  status: 'connected' | 'disconnected' | 'error' | 'pending' | string
  hasCredentials: boolean
  updated_at: string
  created_at: string
}

type FieldKind = 'text' | 'password'

interface ProviderField {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  hint?: string
}

interface ProviderDefinition {
  slug: string
  name: string
  tagline: string
  description: string
  iconColor: string
  iconBg: string
  iconBorder: string
  badge: string  // single-character emoji-free badge
  fields: ProviderField[]
  docsUrl?: string
}

// ─── Marketplace catalogue ────────────────────────────────────────────────

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    slug: 'stripe',
    name: 'Stripe',
    tagline: 'Billing, subscriptions, and payouts',
    description: 'Sync customers, log subscription events, and pipe revenue back into your CRM scoring.',
    iconColor: 'text-violet-300',
    iconBg: 'bg-violet-500/15',
    iconBorder: 'border-violet-500/30',
    badge: 'S',
    docsUrl: 'https://stripe.com/docs/api',
    fields: [
      { key: 'secret_key',     label: 'Secret API Key',     kind: 'password', placeholder: 'sk_live_…', hint: 'Restricted-key access is enough — see the docs for scope details.' },
      { key: 'webhook_secret', label: 'Webhook Signing Secret', kind: 'password', placeholder: 'whsec_…', hint: 'Required for ingesting subscription / invoice events back into Ooumph.' },
    ],
  },
  {
    slug: 'slack',
    name: 'Slack',
    tagline: 'Internal alerts and approval pings',
    description: 'Send approval requests and notification bell mirrors to a Slack channel the agency can review.',
    iconColor: 'text-pink-300',
    iconBg: 'bg-pink-500/15',
    iconBorder: 'border-pink-500/30',
    badge: 'L',
    docsUrl: 'https://api.slack.com/apps',
    fields: [
      { key: 'bot_token',      label: 'Bot User OAuth Token', kind: 'password', placeholder: 'xoxb-…', hint: 'Workspace bot token with chat:write and channels:join scopes.' },
      { key: 'default_channel',label: 'Default Channel',      kind: 'text',     placeholder: '#marketing-ops', hint: 'Channel ID or #name — used when no override is set on the workflow.' },
    ],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    tagline: 'CRM bridge for contacts and deals',
    description: 'Two-way sync contacts and deal stage transitions to the HubSpot pipeline your sales team lives in.',
    iconColor: 'text-orange-300',
    iconBg: 'bg-orange-500/15',
    iconBorder: 'border-orange-500/30',
    badge: 'H',
    docsUrl: 'https://developers.hubspot.com/docs/api',
    fields: [
      { key: 'private_app_token', label: 'Private App Access Token', kind: 'password', placeholder: 'pat-na1-…', hint: 'Create a Private App with contacts and deals scopes.' },
      { key: 'portal_id',         label: 'Portal ID',                kind: 'text',     placeholder: '12345678' },
    ],
  },
  {
    slug: 'salesforce',
    name: 'Salesforce',
    tagline: 'Enterprise CRM lead sync',
    description: 'Push high-fit leads into Salesforce as Lead records and reflect Opportunity stage back into Ooumph.',
    iconColor: 'text-sky-300',
    iconBg: 'bg-sky-500/15',
    iconBorder: 'border-sky-500/30',
    badge: 'F',
    docsUrl: 'https://developer.salesforce.com/docs',
    fields: [
      { key: 'instance_url',  label: 'Instance URL',  kind: 'text',     placeholder: 'https://yourdomain.my.salesforce.com' },
      { key: 'client_id',     label: 'Consumer Key',  kind: 'password', placeholder: '3MVG…' },
      { key: 'client_secret', label: 'Consumer Secret', kind: 'password', placeholder: 'A1B2…' },
      { key: 'refresh_token', label: 'Refresh Token', kind: 'password', placeholder: '5Aep…' },
    ],
  },
]

type FilterTab = 'all' | 'connected' | 'available'

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [tab, setTab] = useState<FilterTab>('all')
  const [editingProvider, setEditingProvider] = useState<ProviderDefinition | null>(null)

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

  const fetchConnections = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/integration-connections?workspaceId=${workspaceId}`)
      const rows = await res.json() as ConnectionRow[] | { error: string }
      setConnections(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { if (workspaceId) fetchConnections() }, [workspaceId, fetchConnections])

  const connectionBySlug = useMemo(() => {
    const m = new Map<string, ConnectionRow>()
    for (const c of connections) m.set(c.provider_slug, c)
    return m
  }, [connections])

  const filteredProviders = useMemo(() => {
    if (tab === 'all') return PROVIDER_DEFINITIONS
    if (tab === 'connected') {
      return PROVIDER_DEFINITIONS.filter(p => {
        const row = connectionBySlug.get(p.slug)
        return row?.status === 'connected' && row?.hasCredentials
      })
    }
    return PROVIDER_DEFINITIONS.filter(p => {
      const row = connectionBySlug.get(p.slug)
      return !row || row.status !== 'connected' || !row.hasCredentials
    })
  }, [tab, connectionBySlug])

  const handleSave = async (provider: ProviderDefinition, credentials: Record<string, string>) => {
    if (!workspaceId) return
    setActionMessage(null)
    try {
      const res = await fetch('/api/integration-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          providerSlug: provider.slug,
          credentials,
          status: 'connected',
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; created?: boolean }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setActionMessage({
        ok: true,
        text: data.created
          ? `${provider.name} connected.`
          : `${provider.name} credentials rotated.`,
      })
      setEditingProvider(null)
      await fetchConnections()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleDisconnect = async (row: ConnectionRow, providerName: string) => {
    if (!workspaceId) return
    if (!confirm(`Disconnect ${providerName}? Encrypted credentials will be wiped.`)) return
    try {
      const res = await fetch(`/api/integration-connections?id=${row.id}&workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setActionMessage({ ok: true, text: `${providerName} disconnected.` })
      await fetchConnections()
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Header counts ──
  const counts = useMemo(() => {
    const connected = PROVIDER_DEFINITIONS.filter(p => {
      const row = connectionBySlug.get(p.slug)
      return row?.status === 'connected' && row?.hasCredentials
    }).length
    return {
      total: PROVIDER_DEFINITIONS.length,
      connected,
      available: PROVIDER_DEFINITIONS.length - connected,
    }
  }, [connectionBySlug])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Plug className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl">
                Plug Ooumph into your billing, CRM, and team-chat stack. Every credential is encrypted with
                AES-256-GCM at rest — cleartext leaves your browser exactly once, on the way to the encryption
                endpoint.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchConnections()}
            disabled={loading || !workspaceId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

        {/* ── Filter tabs ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
          {([
            { id: 'all'       as FilterTab, label: 'All',        count: counts.total },
            { id: 'connected' as FilterTab, label: 'Connected',  count: counts.connected },
            { id: 'available' as FilterTab, label: 'Available',  count: counts.available },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-gray-500">({t.count})</span>
            </button>
          ))}
        </div>

        {/* ── Marketplace grid ────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading connection marketplace…</span>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-center py-24 bg-gray-900/40 rounded-xl border border-gray-800">
            <Plug className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {tab === 'connected'
                ? 'No connections yet. Switch to Available to wire your first integration.'
                : 'No matching providers.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProviders.map(p => (
              <ConnectionCard
                key={p.slug}
                provider={p}
                connection={connectionBySlug.get(p.slug) || null}
                onConfigure={() => setEditingProvider(p)}
                onDisconnect={(row) => handleDisconnect(row, p.name)}
              />
            ))}
          </div>
        )}

        {/* ── Trust footer ────────────────────────────────────────────── */}
        <div className="mt-8 p-4 rounded-lg bg-gray-900/40 border border-gray-800 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-medium">Credentials are encrypted at rest with AES-256-GCM.</span>
            {' '}The decryption key is derived from your workspace&apos;s master secret and never leaves the
            server. The Ooumph dashboard cannot display the cleartext back to you — re-enter values to
            rotate them.
          </div>
        </div>
      </div>

      {/* ── Credentials Drawer ────────────────────────────────────────── */}
      {editingProvider && (
        <CredentialsDrawer
          provider={editingProvider}
          existing={connectionBySlug.get(editingProvider.slug) || null}
          onClose={() => setEditingProvider(null)}
          onSave={(creds) => handleSave(editingProvider, creds)}
        />
      )}
    </div>
  )
}

// ─── Connection card ─────────────────────────────────────────────────────

function ConnectionCard({
  provider, connection, onConfigure, onDisconnect,
}: {
  provider: ProviderDefinition
  connection: ConnectionRow | null
  onConfigure: () => void
  onDisconnect: (row: ConnectionRow) => void
}) {
  const isConnected = connection?.status === 'connected' && connection?.hasCredentials
  const inError = connection?.status === 'error'

  return (
    <div className={`bg-gray-900/60 border rounded-xl p-5 transition ${
      isConnected ? 'border-emerald-500/20 hover:border-emerald-500/30' : 'border-gray-800 hover:border-gray-700'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border ${provider.iconBg} ${provider.iconBorder}`}>
          <span className={`text-lg font-bold ${provider.iconColor}`}>{provider.badge}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold truncate">{provider.name}</h3>
            {isConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Connected
              </span>
            ) : inError ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose-500/15 text-rose-300">
                <AlertCircle className="w-2.5 h-2.5" />
                Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-700/60 text-gray-400">
                Configure to enable
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{provider.tagline}</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed mb-4 min-h-[3em]">{provider.description}</p>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
        <button
          onClick={onConfigure}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            isConnected
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {isConnected ? (
            <><Settings2 className="w-3 h-3" /> Manage</>
          ) : (
            <><Zap className="w-3 h-3" /> Connect</>
          )}
        </button>
        {provider.docsUrl && (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800/60 hover:bg-gray-700 text-gray-300 transition"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {connection && (
          <button
            onClick={() => onDisconnect(connection)}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-800/60 hover:bg-rose-500/15 text-gray-500 hover:text-rose-300 transition"
            aria-label="Disconnect"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Credentials drawer ──────────────────────────────────────────────────

function CredentialsDrawer({
  provider, existing, onClose, onSave,
}: {
  provider: ProviderDefinition
  existing: ConnectionRow | null
  onClose: () => void
  onSave: (credentials: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of provider.fields) initial[f.key] = ''
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})

  const update = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }))

  const handleSubmit = async () => {
    setSaving(true)
    try {
      // Only include fields the user actually entered. The PUT path on the
      // server is COALESCE-aware: omitted credentials preserve the existing
      // encrypted blob, so this allows partial updates without nuking secrets
      // the user didn't intend to rotate.
      const trimmed: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) trimmed[k] = v.trim()
      }
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="fixed top-0 right-0 bottom-0 w-full md:w-[520px] bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border ${provider.iconBg} ${provider.iconBorder}`}>
              <span className={`text-lg font-bold ${provider.iconColor}`}>{provider.badge}</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold">{existing ? 'Manage' : 'Connect'} {provider.name}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {existing
                  ? 'Leave a field blank to keep the existing encrypted value.'
                  : 'Credentials are encrypted with AES-256-GCM before leaving this server.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* Provider blurb */}
          <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-gray-300 mb-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span className="font-medium">What this unlocks</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{provider.description}</p>
          </div>

          {provider.fields.map(field => {
            const isPw = field.kind === 'password'
            const reveal = showPassword[field.key]
            return (
              <div key={field.key}>
                <label className="text-xs font-medium text-gray-300 mb-1.5 block">
                  {field.label}
                  {existing?.hasCredentials && (
                    <span className="ml-2 text-[10px] text-emerald-400 font-normal">· encrypted on file</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={isPw && !reveal ? 'password' : 'text'}
                    value={values[field.key] || ''}
                    onChange={e => update(field.key, e.target.value)}
                    placeholder={field.placeholder || ''}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-3 pr-20 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {isPw && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => ({ ...p, [field.key]: !p[field.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 px-1.5 py-0.5"
                    >
                      {reveal ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
                {field.hint && (
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{field.hint}</p>
                )}
              </div>
            )
          })}

          {/* Encryption reassurance */}
          <div className="mt-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-200/80 leading-relaxed">
              On submit, the entire credentials object is JSON-stringified, encrypted with AES-256-GCM on the
              server, and stored opaque. Ooumph cannot show these values back to you — re-enter them to rotate.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-2 bg-gray-950">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || Object.values(values).every(v => !v.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {existing ? 'Save changes' : 'Connect'}
          </button>
        </div>
      </aside>
    </div>
  )
}
