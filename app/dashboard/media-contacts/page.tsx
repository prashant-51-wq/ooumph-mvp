'use client'

/**
 * /dashboard/media-contacts
 *
 * Journalist CRM. Two layout panes:
 *
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │  Search + beat filter + "New contact" + Bulk import drawer       │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │  Contacts table — name, email, outlet, beat, last_contacted_at  │
 *   │  Per-row PATCH (inline edit) and DELETE                          │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * The bulk import block accepts a paste of CSV-style rows OR raw JSON.
 * Submissions hit /api/media-contacts {bulk: [...]} which returns a
 * detailed summary ledger: inserted vs duplicates vs failures.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mail, RefreshCw, AlertCircle, Plus, Search, X, Trash2, Edit3,
  Upload, ExternalLink, CheckCircle2, AlertTriangle, FileText, Save,
  Briefcase, Bird,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface MediaContact {
  id: string
  workspace_id: string
  journalist_name: string
  email: string | null
  outlet_name: string | null
  beat_focus: string | null
  linkedin_url: string | null
  twitter_url: string | null
  notes: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string | null
}

interface BulkImportSummary {
  inserted: number
  skipped: number
  total: number
  skippedDetails: Array<{ row: number; email: string; reason: string }>
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

export default function MediaContactsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<MediaContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [beatFilter, setBeatFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showBulk, setShowBulk] = useState(false)

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

  const fetchAll = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/media-contacts?workspaceId=${workspaceId}`)
      const rows = await res.json() as MediaContact[]
      setContacts(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const allBeats = useMemo(() => {
    const set = new Set<string>()
    for (const c of contacts) if (c.beat_focus) set.add(c.beat_focus.trim())
    return Array.from(set).sort()
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter(c => {
      if (beatFilter && (c.beat_focus || '').toLowerCase() !== beatFilter.toLowerCase()) return false
      if (q) {
        const hay = [c.journalist_name, c.email, c.outlet_name, c.beat_focus, c.notes].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [contacts, search, beatFilter])

  const deleteContact = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this contact? Past distribution records stay intact.')) return
    try {
      const res = await fetch(`/api/media-contacts?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Mail className="w-6 h-6 text-indigo-400" /> Media Contacts
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Journalist CRM. Bulk imports surface duplicates as a 409 — no double-blast risk.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowBulk(true)}
              disabled={!workspaceId}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" /> Bulk import
            </button>
            <button
              onClick={() => setShowNew(true)}
              disabled={!workspaceId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New contact
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, outlet, email, beat, notes…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          {allBeats.length > 0 && (
            <select
              value={beatFilter || ''} onChange={e => setBeatFilter(e.target.value || null)}
              className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-indigo-600 focus:outline-none"
            >
              <option value="">All beats</option>
              {allBeats.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filtered.length} of {contacts.length} contacts
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading contacts…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
            <Mail className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {contacts.length === 0 ? 'No media contacts yet' : 'No contacts match your filters'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {contacts.length === 0
                ? 'Add journalists individually or bulk-import a CSV / JSON list.'
                : 'Try clearing the search or beat filter.'}
            </p>
            {contacts.length === 0 && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setShowNew(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add first contact
                </button>
                <button
                  onClick={() => setShowBulk(true)}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Bulk import
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Journalist</th>
                  <th className="px-4 py-3 font-medium">Outlet</th>
                  <th className="px-4 py-3 font-medium">Beat</th>
                  <th className="px-4 py-3 font-medium">Links</th>
                  <th className="px-4 py-3 font-medium">Last contacted</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(c => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    workspaceId={workspaceId!}
                    isEditing={editingId === c.id}
                    onStartEdit={() => setEditingId(c.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); fetchAll() }}
                    onDelete={() => deleteContact(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && workspaceId && (
        <NewContactModal
          workspaceId={workspaceId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); fetchAll() }}
        />
      )}

      {showBulk && workspaceId && (
        <BulkImportModal
          workspaceId={workspaceId}
          onClose={() => setShowBulk(false)}
          onCompleted={() => { setShowBulk(false); fetchAll() }}
        />
      )}
    </div>
  )
}

// ─── Contact Row (inline edit) ────────────────────────────────────────────

function ContactRow({
  contact, workspaceId, isEditing, onStartEdit, onCancelEdit, onSaved, onDelete,
}: {
  contact: MediaContact
  workspaceId: string
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(contact.journalist_name)
  const [email, setEmail] = useState(contact.email || '')
  const [outlet, setOutlet] = useState(contact.outlet_name || '')
  const [beat, setBeat] = useState(contact.beat_focus || '')
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url || '')
  const [twitterUrl, setTwitterUrl] = useState(contact.twitter_url || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Reset draft state every time we enter/exit edit mode
  useEffect(() => {
    if (isEditing) {
      setName(contact.journalist_name)
      setEmail(contact.email || '')
      setOutlet(contact.outlet_name || '')
      setBeat(contact.beat_focus || '')
      setLinkedinUrl(contact.linkedin_url || '')
      setTwitterUrl(contact.twitter_url || '')
      setErr(null)
    }
  }, [isEditing, contact])

  const save = async () => {
    if (!name.trim()) { setErr('Name required'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/media-contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contact.id, workspaceId,
          journalistName: name, email,
          outletName: outlet, beatFocus: beat,
          linkedinUrl, twitterUrl,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed')
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  if (isEditing) {
    return (
      <tr className="bg-indigo-900/10">
        <td className="px-4 py-3" colSpan={6}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" value={name} onChange={setName} />
            <Field label="Email" value={email} onChange={setEmail} />
            <Field label="Outlet" value={outlet} onChange={setOutlet} />
            <Field label="Beat" value={beat} onChange={setBeat} />
            <Field label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} />
            <Field label="Twitter / X URL" value={twitterUrl} onChange={setTwitterUrl} />
          </div>
          {err && <div className="mt-2 text-xs text-rose-400">{err}</div>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={onCancelEdit} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200">Cancel</button>
            <button
              onClick={save} disabled={saving}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded inline-flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-950/50">
      <td className="px-4 py-3">
        <div className="text-white font-medium">{contact.journalist_name}</div>
        {contact.email && <div className="text-xs text-gray-500 font-mono">{contact.email}</div>}
      </td>
      <td className="px-4 py-3 text-gray-300">{contact.outlet_name || '—'}</td>
      <td className="px-4 py-3">
        {contact.beat_focus ? (
          <span className="text-xs px-2 py-0.5 bg-gray-950 border border-gray-800 text-gray-300 rounded">
            {contact.beat_focus}
          </span>
        ) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300" title="LinkedIn">
              <Briefcase className="w-3.5 h-3.5" />
            </a>
          )}
          {contact.twitter_url && (
            <a href={contact.twitter_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white" title="Twitter / X">
              <Bird className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500" title={contact.last_contacted_at || ''}>
        {contact.last_contacted_at ? (
          <span className="text-amber-400">{formatRelative(contact.last_contacted_at)}</span>
        ) : <span className="text-gray-600">Never</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onStartEdit}
          className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded"
          title="Edit"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded ml-1"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── New Contact Modal ────────────────────────────────────────────────────

function NewContactModal({
  workspaceId, onClose, onCreated,
}: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [outlet, setOutlet] = useState('')
  const [beat, setBeat] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [twitterUrl, setTwitterUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Name required'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/media-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          journalistName: name, email,
          outletName: outlet, beatFocus: beat,
          linkedinUrl, twitterUrl,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; existingId?: string }
      if (!res.ok || !data.ok) {
        if (res.status === 409 && data.existingId) {
          throw new Error(`Email already in workspace (existing id: ${data.existingId})`)
        }
        throw new Error(data.error || 'Create failed')
      }
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold">New journalist contact</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name *" value={name} onChange={setName} placeholder="Jane Doe" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="jane@nytimes.com" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outlet" value={outlet} onChange={setOutlet} placeholder="NYTimes" />
            <Field label="Beat" value={beat} onChange={setBeat} placeholder="B2B SaaS" />
          </div>
          <Field label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} />
          <Field label="Twitter / X URL" value={twitterUrl} onChange={setTwitterUrl} />
          {err && <div className="text-rose-400 text-sm">{err}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {saving ? 'Saving…' : 'Add contact'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────

function BulkImportModal({
  workspaceId, onClose, onCompleted,
}: { workspaceId: string; onClose: () => void; onCompleted: () => void }) {
  const [rawText, setRawText] = useState('')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<BulkImportSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const parseRows = (): Array<{ journalistName: string; email?: string; outletName?: string; beatFocus?: string }> => {
    const raw = rawText.trim()
    if (!raw) return []
    if (format === 'json') {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          return parsed.map(r => {
            const o = r as Record<string, unknown>
            return {
              journalistName: String(o.journalistName || o.journalist_name || o.name || '').trim(),
              email: String(o.email || '').trim(),
              outletName: String(o.outletName || o.outlet_name || o.outlet || '').trim() || undefined,
              beatFocus: String(o.beatFocus || o.beat_focus || o.beat || '').trim() || undefined,
            }
          }).filter(r => r.journalistName)
        }
      } catch { /* fall through to error */ }
      return []
    }
    // CSV: header row → field map. Required column: name. Optional: email, outlet, beat
    const lines = raw.split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) return []
    const headers = lines[0].split(/[,\t]/).map(h => h.trim().toLowerCase())
    const idx = (key: string) => headers.findIndex(h => h === key)
    const iName = Math.max(idx('name'), idx('journalist'), idx('journalist_name'), idx('journalistname'))
    const iEmail = Math.max(idx('email'))
    const iOutlet = Math.max(idx('outlet'), idx('outlet_name'))
    const iBeat = Math.max(idx('beat'), idx('beat_focus'))
    if (iName === -1) {
      // No header row — assume positional: name, email, outlet, beat
      return lines.map(line => {
        const parts = line.split(/[,\t]/).map(s => s.trim().replace(/^"|"$/g, ''))
        return {
          journalistName: parts[0] || '',
          email: parts[1] || undefined,
          outletName: parts[2] || undefined,
          beatFocus: parts[3] || undefined,
        }
      }).filter(r => r.journalistName)
    }
    return lines.slice(1).map(line => {
      const parts = line.split(/[,\t]/).map(s => s.trim().replace(/^"|"$/g, ''))
      return {
        journalistName: parts[iName] || '',
        email: iEmail >= 0 ? (parts[iEmail] || undefined) : undefined,
        outletName: iOutlet >= 0 ? (parts[iOutlet] || undefined) : undefined,
        beatFocus: iBeat >= 0 ? (parts[iBeat] || undefined) : undefined,
      }
    }).filter(r => r.journalistName)
  }

  const submit = async () => {
    const rows = parseRows()
    if (rows.length === 0) { setErr('No valid rows detected. Check the format and required name column.'); return }
    setSubmitting(true); setErr(null); setSummary(null)
    try {
      const res = await fetch('/api/media-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, bulk: rows }),
      })
      const data = await res.json() as { ok?: boolean; error?: string } & BulkImportSummary
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed')
      setSummary({
        inserted: data.inserted, skipped: data.skipped,
        total: data.total, skippedDetails: data.skippedDetails || [],
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-purple-400" /> Bulk import journalists
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!summary ? (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase text-gray-500 tracking-wider font-medium">Format:</label>
                <div className="flex gap-1 bg-gray-950 border border-gray-800 rounded p-0.5">
                  <button
                    onClick={() => setFormat('csv')}
                    className={`px-3 py-1 text-xs rounded ${format === 'csv' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    CSV / TSV
                  </button>
                  <button
                    onClick={() => setFormat('json')}
                    className={`px-3 py-1 text-xs rounded ${format === 'json' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    JSON array
                  </button>
                </div>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] text-gray-400 font-mono">
                {format === 'csv' ? (
                  <>
                    <div className="text-emerald-300">name,email,outlet,beat</div>
                    <div>Jane Doe,jane@nytimes.com,NYTimes,B2B SaaS</div>
                    <div>Sam Lee,sam@verge.com,The Verge,FinTech</div>
                  </>
                ) : (
                  <>{`[
  {"journalistName": "Jane Doe", "email": "jane@nytimes.com", "outletName": "NYTimes", "beatFocus": "B2B SaaS"},
  {"journalistName": "Sam Lee", "email": "sam@verge.com", "outletName": "The Verge", "beatFocus": "FinTech"}
]`}</>
                )}
              </div>

              <textarea
                value={rawText} onChange={e => setRawText(e.target.value)}
                placeholder={format === 'csv' ? 'Paste CSV / TSV here…' : 'Paste JSON array here…'}
                rows={14}
                spellCheck={false}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none font-mono resize-none"
              />

              <p className="text-[11px] text-gray-600">
                <FileText className="w-3 h-3 inline mr-1" />
                Up to 500 rows per import. Duplicate emails (per workspace) are safely skipped — you'll see a detailed summary after.
              </p>

              {err && (
                <div className="p-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-xs">
                  <AlertCircle className="w-3 h-3 inline mr-1" /> {err}
                </div>
              )}
            </>
          ) : (
            <ImportSummary summary={summary} onDone={onCompleted} onReset={() => { setSummary(null); setRawText('') }} />
          )}
        </div>

        {!summary && (
          <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button
              onClick={submit} disabled={submitting || !rawText.trim()}
              className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg"
            >
              {submitting ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ImportSummary({
  summary, onDone, onReset,
}: { summary: BulkImportSummary; onDone: () => void; onReset: () => void }) {
  const successRate = summary.total > 0 ? (summary.inserted / summary.total) * 100 : 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-950 border border-emerald-900 rounded-lg p-4 text-center">
          <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
          <div className="text-2xl font-bold text-emerald-300 tabular-nums">{summary.inserted}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">Inserted</div>
        </div>
        <div className="bg-gray-950 border border-amber-900 rounded-lg p-4 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
          <div className="text-2xl font-bold text-amber-300 tabular-nums">{summary.skipped}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">Skipped</div>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-center">
          <FileText className="w-6 h-6 mx-auto mb-2 text-gray-400" />
          <div className="text-2xl font-bold text-gray-200 tabular-nums">{summary.total}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">Total rows</div>
        </div>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Success rate</span>
          <span className="text-emerald-300 tabular-nums">{successRate.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${successRate}%` }} />
        </div>
      </div>

      {summary.skippedDetails.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
            Skipped rows ({summary.skippedDetails.length})
          </p>
          <div className="max-h-48 overflow-auto bg-gray-950 border border-gray-800 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-950">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-1.5">Row</th>
                  <th className="px-3 py-1.5">Email</th>
                  <th className="px-3 py-1.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {summary.skippedDetails.map((d, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums">{d.row}</td>
                    <td className="px-3 py-1.5 text-gray-300 font-mono">{d.email || '—'}</td>
                    <td className="px-3 py-1.5 text-amber-300">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 inline-flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Import more
        </button>
        <button
          onClick={onDone}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded inline-flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> Open contacts
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs uppercase text-gray-500 mb-1.5">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
      />
    </div>
  )
}
