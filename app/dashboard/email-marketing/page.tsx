'use client'

/**
 * /dashboard/email-marketing
 *
 * Audience-management hub. Three tabs:
 *   1. Lists       — addressable cohorts (CRUD + denormalised counts)
 *   2. Subscribers — global address book with consent & engagement columns
 *   3. Performance — campaign roll-up (sent, opens, clicks, bounces)
 *
 * All data is live — no mock state. Every fetch carries the workspaceId
 * and the workspace-ownership guard enforces multi-tenant isolation server-side.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'
import {
  Mail, Users, BarChart3, Plus, Search, Trash2, Pencil,
  CheckCircle2, ShieldCheck, Clock, AlertCircle, RefreshCw, X,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'lists' | 'subscribers' | 'performance'

interface EmailList {
  id: string
  workspace_id: string
  name: string
  description: string | null
  status: string
  subscriber_count: number
  live_subscriber_count?: number | string
  default_from_name: string | null
  default_from_email: string | null
  double_opt_in: number | boolean
  created_at: string
  updated_at: string | null
}

interface Subscriber {
  id: string
  email: string
  name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  status: string
  source: string | null
  consent_given_at: string | null
  consent_source: string | null
  last_engaged_at: string | null
  unsubscribed_at: string | null
  bounce_count: number
  subscribed_at: string
}

interface CampaignPerf {
  id: string
  name: string
  subject: string | null
  status: string
  recipient_count: number
  sent_count: number
  open_count: number
  click_count: number
  bounce_count: number
  failed_count: number
  sent_at: string | null
  created_at: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  if (diff < 0) return formatDateTime(iso)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return formatDateTime(iso)
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    subscribed: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    active: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    unsubscribed: 'bg-gray-800 text-gray-400 border-gray-700',
    archived: 'bg-gray-800 text-gray-400 border-gray-700',
    bounced: 'bg-rose-900/40 text-rose-300 border-rose-800',
    pending: 'bg-amber-900/40 text-amber-300 border-amber-800',
    sent: 'bg-indigo-900/40 text-indigo-300 border-indigo-800',
    sending: 'bg-blue-900/40 text-blue-300 border-blue-800',
    draft: 'bg-gray-800 text-gray-400 border-gray-700',
    scheduled: 'bg-amber-900/40 text-amber-300 border-amber-800',
    failed: 'bg-rose-900/40 text-rose-300 border-rose-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${map[status] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {status}
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function EmailMarketingPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('lists')
  const [error, setError] = useState<string | null>(null)

  // Sprint 10C: session-derived via useWorkspaceId().
  const { workspaceId: sessionWorkspaceId, resolved: sessionResolved, loading: sessionLoading } = useWorkspaceId()
  useEffect(() => {
    setWorkspaceId(sessionWorkspaceId)
    if (sessionResolved && !sessionLoading && !sessionWorkspaceId) {
      setError('No workspace selected — finish onboarding first.')
    }
  }, [sessionWorkspaceId, sessionResolved, sessionLoading])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Mail className="w-6 h-6 text-indigo-400" /> Email Marketing
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage audience lists, subscribers, and campaign performance.
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {([
            { id: 'lists', label: 'Lists', icon: Users },
            { id: 'subscribers', label: 'Subscribers', icon: Mail },
            { id: 'performance', label: 'Performance', icon: BarChart3 },
          ] as const).map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  active
                    ? 'text-indigo-400 border-indigo-500'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {workspaceId && tab === 'lists' && <ListsTab workspaceId={workspaceId} />}
        {workspaceId && tab === 'subscribers' && <SubscribersTab workspaceId={workspaceId} />}
        {workspaceId && tab === 'performance' && <PerformanceTab workspaceId={workspaceId} />}
      </div>
    </div>
  )
}

// ─── Lists tab ─────────────────────────────────────────────────────────────

function ListsTab({ workspaceId }: { workspaceId: string }) {
  const [lists, setLists] = useState<EmailList[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showMembers, setShowMembers] = useState<string | null>(null)

  const fetchLists = useCallback(() => {
    setLoading(true)
    fetch(`/api/email-lists?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((rows: EmailList[]) => setLists(Array.isArray(rows) ? rows : []))
      .catch(() => setLists([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { fetchLists() }, [fetchLists])

  const archive = async (id: string) => {
    if (!confirm('Archive this list? Existing campaigns referencing it stay intact.')) return
    await fetch(`/api/email-lists?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
    fetchLists()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-400">{lists.length} list{lists.length === 1 ? '' : 's'}</div>
        <div className="flex gap-2">
          <button
            onClick={fetchLists}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> New list
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading lists…</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <Mail className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-gray-400 mb-1">No lists yet.</p>
          <p className="text-sm text-gray-600 mb-4">Create your first audience list to start sending campaigns.</p>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create list
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 border-b border-gray-800">
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Subscribers</th>
                <th className="px-4 py-3 font-medium">Default sender</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lists.map(list => {
                const count = Number(list.live_subscriber_count ?? list.subscriber_count ?? 0)
                return (
                  <tr key={list.id} className="hover:bg-gray-950/50">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{list.name}</div>
                      {list.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{list.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setShowMembers(list.id)}
                        className="text-indigo-400 hover:text-indigo-300 font-mono text-sm"
                      >
                        {count.toLocaleString()}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {list.default_from_email
                        ? <span>{list.default_from_name ? `${list.default_from_name} <${list.default_from_email}>` : list.default_from_email}</span>
                        : <span className="text-gray-600">Not set</span>}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={list.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatRelative(list.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setShowMembers(list.id)}
                        className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded transition-colors"
                        title="Manage members"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => archive(list.id)}
                        className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded transition-colors ml-1"
                        title="Archive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewListModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); fetchLists() }}
        />
      )}
      {showMembers && (
        <ListMembersModal
          workspaceId={workspaceId}
          listId={showMembers}
          onClose={() => { setShowMembers(null); fetchLists() }}
        />
      )}
    </div>
  )
}

function NewListModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [doubleOptIn, setDoubleOptIn] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/email-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, name: name.trim(), description: description.trim() || undefined,
          defaultFromName: fromName.trim() || undefined,
          defaultFromEmail: fromEmail.trim() || undefined,
          doubleOptIn,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create list')
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">New audience list</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">List name *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Spring 2026 prospects"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1.5">Description</label>
            <input
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional context for your team"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Default from name</label>
              <input
                value={fromName} onChange={e => setFromName(e.target.value)}
                placeholder="Jane @ Acme"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1.5">Default from email</label>
              <input
                value={fromEmail} onChange={e => setFromEmail(e.target.value)}
                placeholder="hi@acme.com"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={doubleOptIn} onChange={e => setDoubleOptIn(e.target.checked)}
              className="accent-indigo-600" />
            Require double opt-in (recommended)
          </label>
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Creating…' : 'Create list'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ListMembersModal({
  workspaceId, listId, onClose,
}: { workspaceId: string; listId: string; onClose: () => void }) {
  interface Member {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    name: string | null
    subscriber_status: string
    membership_status: string
    added_at: string
  }
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [addEmails, setAddEmails] = useState('')
  const [adding, setAdding] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`/api/email-lists/${listId}/members?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((rows: Member[]) => setMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [workspaceId, listId])

  useEffect(() => { refresh() }, [refresh])

  const add = async () => {
    const list = addEmails.split(/[\s,;\n]+/).map(s => s.trim()).filter(s => s.includes('@'))
    if (list.length === 0) { setFeedback('Paste at least one valid email'); return }
    setAdding(true); setFeedback(null)
    try {
      const res = await fetch(`/api/email-lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, emails: list, source: 'manual_import' }),
      })
      const data = await res.json() as { ok?: boolean; added?: number; alreadyMember?: number; createdSubscribers?: number; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed')
      setFeedback(`Added ${data.added || 0} • already in list: ${data.alreadyMember || 0} • new subscribers: ${data.createdSubscribers || 0}`)
      setAddEmails('')
      refresh()
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e))
    } finally { setAdding(false) }
  }

  const remove = async (subscriberId: string) => {
    await fetch(`/api/email-lists/${listId}/members?workspaceId=${workspaceId}&subscriberId=${subscriberId}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">List members</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 border-b border-gray-800 bg-gray-950/40">
          <label className="block text-xs uppercase text-gray-500 mb-1.5">Paste emails to add (comma, space, or newline separated)</label>
          <textarea
            value={addEmails} onChange={e => setAddEmails(e.target.value)}
            placeholder="jane@acme.com, joe@startup.io …"
            rows={3}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none font-mono"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">{feedback}</div>
            <button
              onClick={add} disabled={adding || !addEmails.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
            >
              {adding ? 'Adding…' : 'Add to list'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="text-center py-10 text-gray-500 text-sm">Loading members…</div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">No members yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Membership</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-gray-950/50">
                    <td className="px-3 py-2 text-gray-200 font-mono text-xs">{m.email}</td>
                    <td className="px-3 py-2 text-gray-400">
                      {[m.first_name, m.last_name].filter(Boolean).join(' ') || m.name || '—'}
                    </td>
                    <td className="px-3 py-2"><StatusPill status={m.membership_status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatRelative(m.added_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => remove(m.id)}
                        className="text-gray-500 hover:text-rose-400 p-1 rounded"
                        title="Remove from list"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Subscribers tab ───────────────────────────────────────────────────────

function SubscribersTab({ workspaceId }: { workspaceId: string }) {
  const [subs, setSubs] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`/api/email-subscribers?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((rows: Subscriber[]) => setSubs(Array.isArray(rows) ? rows : []))
      .catch(() => setSubs([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    if (!search.trim()) return subs
    const q = search.toLowerCase()
    return subs.filter(s =>
      s.email.toLowerCase().includes(q)
      || (s.name || '').toLowerCase().includes(q)
      || (s.first_name || '').toLowerCase().includes(q)
      || (s.last_name || '').toLowerCase().includes(q),
    )
  }, [subs, search])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
          />
        </div>
        <div className="text-sm text-gray-500">{filtered.length} of {subs.length}</div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading subscribers…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <Mail className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-gray-400 mb-1">No subscribers found.</p>
          <p className="text-sm text-gray-600">Add subscribers by importing into a list, or via signup form.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" title="When the subscriber confirmed consent (GDPR / CAN-SPAM)">
                    <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Consent</span>
                  </th>
                  <th className="px-4 py-3 font-medium" title="Last time this subscriber opened, clicked, or replied">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Last engaged</span>
                  </th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Bounces</th>
                  <th className="px-4 py-3 font-medium">Subscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-950/50">
                    <td className="px-4 py-3 text-gray-200 font-mono text-xs">{s.email}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.name || '—'}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3 text-xs">
                      {s.consent_given_at ? (
                        <span className="text-emerald-300 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {formatDateTime(s.consent_given_at)}
                          {s.consent_source && <span className="text-gray-500 ml-1">({s.consent_source})</span>}
                        </span>
                      ) : (
                        <span className="text-gray-600">Not recorded</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {formatRelative(s.last_engaged_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{s.source || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {s.bounce_count > 0
                        ? <span className="text-rose-400">{s.bounce_count}</span>
                        : <span className="text-gray-600">0</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(s.subscribed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Performance tab ───────────────────────────────────────────────────────

function PerformanceTab({ workspaceId }: { workspaceId: string }) {
  const [campaigns, setCampaigns] = useState<CampaignPerf[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/email-campaigns?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((rows: CampaignPerf[]) => setCampaigns(Array.isArray(rows) ? rows : []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  const totals = useMemo(() => {
    return campaigns.reduce((acc, c) => {
      acc.sent += Number(c.sent_count || 0)
      acc.recipients += Number(c.recipient_count || 0)
      acc.opens += Number(c.open_count || 0)
      acc.clicks += Number(c.click_count || 0)
      acc.bounces += Number(c.bounce_count || 0)
      acc.failed += Number(c.failed_count || 0)
      return acc
    }, { sent: 0, recipients: 0, opens: 0, clicks: 0, bounces: 0, failed: 0 })
  }, [campaigns])

  const stat = (label: string, value: string | number, sub?: string) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs uppercase text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white tabular-nums">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )

  return (
    <div>
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Loading campaigns…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {stat('Campaigns', campaigns.length)}
            {stat('Total sent', totals.sent.toLocaleString(), `of ${totals.recipients.toLocaleString()} targeted`)}
            {stat('Opens', totals.opens.toLocaleString(), totals.sent > 0 ? `${((totals.opens / totals.sent) * 100).toFixed(1)}% open rate` : undefined)}
            {stat('Clicks', totals.clicks.toLocaleString(), totals.sent > 0 ? `${((totals.clicks / totals.sent) * 100).toFixed(1)}% CTR` : undefined)}
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p className="text-gray-400 mb-1">No campaigns sent yet.</p>
              <p className="text-sm text-gray-600">Once you dispatch campaigns, performance metrics will appear here.</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-950 border-b border-gray-800">
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recipients</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                    <th className="px-4 py-3 font-medium">Opens</th>
                    <th className="px-4 py-3 font-medium">Clicks</th>
                    <th className="px-4 py-3 font-medium">Bounces</th>
                    <th className="px-4 py-3 font-medium">Sent at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {campaigns.map(c => (
                    <tr key={c.id} className="hover:bg-gray-950/50">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{c.name}</div>
                        {c.subject && <div className="text-xs text-gray-500 truncate max-w-[300px]">{c.subject}</div>}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{Number(c.recipient_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{Number(c.sent_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{Number(c.open_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-300 tabular-nums">{Number(c.click_count).toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {Number(c.bounce_count || 0) > 0
                          ? <span className="text-rose-400">{c.bounce_count}</span>
                          : <span className="text-gray-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(c.sent_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
