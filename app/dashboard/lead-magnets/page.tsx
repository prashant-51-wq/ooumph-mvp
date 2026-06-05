'use client'

/**
 * /dashboard/lead-magnets — Sprint 17B TASK 2
 *
 * Audit P1 #12: the backend table + CRUD shipped in Sprint 16A/E but no
 * UI ever consumed it, leaving the feature orphaned. This page fills the
 * gap with a basic list / create / edit / delete surface.
 *
 *   - Table: title, description, asset URL (clickable), funnel name,
 *     download_count, created_at.
 *   - "New Lead Magnet" modal: title (req), description, asset URL (req,
 *     URL string only — no file upload this sprint), funnel dropdown.
 *   - Per-row edit + delete actions.
 *
 * The funnel-name column is filled in via a parallel fetch to /api/funnels
 * and joined client-side rather than pushing the join into the route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceId } from '@/lib/hooks/use-workspace-id'

interface LeadMagnet {
  id: string
  workspace_id: string
  title: string
  description: string | null
  asset_url: string
  funnel_id: string | null
  download_count: number | string | null
  created_at: string
}

interface FunnelOption {
  id: string
  name: string
  archived_at: string | null
}

interface LeadMagnetDraft {
  id?: string
  title: string
  description: string
  assetUrl: string
  funnelId: string  // '' = none
}

const EMPTY_DRAFT: LeadMagnetDraft = { title: '', description: '', assetUrl: '', funnelId: '' }

function formatRelative(iso: string | null | undefined): string {
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

/**
 * Sprint 17H (audit pass #3 P2 #44) — inline file upload control.
 * Posts base64 to /api/upload/asset (Cloudinary or data-URL fallback),
 * then writes the returned URL into the parent's assetUrl input.
 */
function FileUploadButton({ workspaceId, onUploaded }: {
  workspaceId: string | null
  onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = async (file: File) => {
    if (!workspaceId) {
      setErr('Workspace not loaded yet — try again in a moment.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr('File too large (max 10MB).')
      return
    }
    setErr(null)
    setUploading(true)
    try {
      const reader = new FileReader()
      const result = await new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const dataUrl = reader.result as string
          const [meta, b64] = dataUrl.split(',')
          const mimeMatch = meta.match(/data:([^;]+)/)
          resolve({ base64: b64, mimeType: mimeMatch?.[1] || file.type || 'application/octet-stream' })
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/upload/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          base64: result.base64,
          mimeType: result.mimeType,
          filename: file.name,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        setErr(data?.error || `Upload failed (HTTP ${res.status})`)
      } else {
        onUploaded(data.url)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void handle(f)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !workspaceId}
        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-300 rounded transition-colors"
      >
        {uploading ? 'Uploading…' : '📤 Upload file'}
      </button>
      {err && <span className="text-xs text-rose-400">{err}</span>}
    </div>
  )
}

function isLikelyUrl(s: string): boolean {
  // Lightweight client-side guard. We don't try to be exhaustive — the
  // server stores the raw string and the link is rendered with rel=noopener.
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

export default function LeadMagnetsPage() {
  const { workspaceId, resolved } = useWorkspaceId()
  const [magnets, setMagnets] = useState<LeadMagnet[]>([])
  const [funnels, setFunnels] = useState<FunnelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState<LeadMagnetDraft>(EMPTY_DRAFT)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)

  const fetchMagnets = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setTopError(null)
    try {
      const res = await fetch(`/api/lead-magnets?workspaceId=${workspaceId}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const rows = await res.json() as LeadMagnet[]
      setMagnets(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setTopError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  const fetchFunnels = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await fetch(`/api/funnels?workspaceId=${workspaceId}`)
      if (!res.ok) return
      const rows = await res.json() as FunnelOption[]
      setFunnels(Array.isArray(rows) ? rows.filter(f => !f.archived_at) : [])
    } catch { /* ignore — the page still works without funnels */ }
  }, [workspaceId])

  useEffect(() => { fetchMagnets() }, [fetchMagnets])
  useEffect(() => { fetchFunnels() }, [fetchFunnels])

  const funnelById = useMemo(() => {
    const map = new Map<string, FunnelOption>()
    for (const f of funnels) map.set(f.id, f)
    return map
  }, [funnels])

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT })
    setDraftError(null)
    setModalOpen(true)
  }

  const openEdit = (m: LeadMagnet) => {
    setDraft({
      id: m.id,
      title: m.title || '',
      description: m.description || '',
      assetUrl: m.asset_url || '',
      funnelId: m.funnel_id || '',
    })
    setDraftError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setDraft(EMPTY_DRAFT)
    setDraftError(null)
  }

  const submitDraft = async () => {
    if (!workspaceId) return
    const title = draft.title.trim()
    const assetUrl = draft.assetUrl.trim()
    if (!title) { setDraftError('Title is required'); return }
    if (!assetUrl) { setDraftError('Asset URL is required'); return }
    if (!isLikelyUrl(assetUrl)) { setDraftError('Asset URL must start with http:// or https://'); return }
    setSubmitting(true)
    setDraftError(null)
    try {
      const payload = {
        workspaceId,
        title,
        description: draft.description.trim() || undefined,
        assetUrl,
        funnelId: draft.funnelId || undefined,
      }
      const res = draft.id
        ? await fetch('/api/lead-magnets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: draft.id, ...payload }),
        })
        : await fetch('/api/lead-magnets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed')
      await fetchMagnets()
      setModalOpen(false)
      setDraft(EMPTY_DRAFT)
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (m: LeadMagnet) => {
    if (!workspaceId) return
    if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/lead-magnets?id=${m.id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      await fetchMagnets()
    } catch (e) {
      setTopError(e instanceof Error ? e.message : String(e))
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (resolved && !workspaceId) {
    return (
      <div className="p-8 text-gray-400 text-sm">
        No workspace selected. Open <a href="/dashboard/onboarding" className="text-indigo-400 hover:text-indigo-300 underline">onboarding</a> to set one up.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>🎁</span> Lead Magnets
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Downloadable assets you offer in exchange for an email. Attach them to funnels to gate access.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchMagnets}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg"
            >
              Refresh
            </button>
            <button
              onClick={openNew}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg"
            >
              + New Lead Magnet
            </button>
          </div>
        </div>

        {topError && (
          <div className="mb-4 px-4 py-3 bg-rose-950/40 border border-rose-900 text-rose-300 text-sm rounded-lg">
            {topError}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-gray-500">Loading lead magnets…</div>
          ) : magnets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3">📦</div>
              <p className="text-sm text-gray-400 mb-1">No lead magnets yet</p>
              <p className="text-xs text-gray-500 mb-4">
                Create one and attach it to a funnel to offer a download.
              </p>
              <button
                onClick={openNew}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg"
              >
                + New Lead Magnet
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-950/60 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Description</th>
                    <th className="text-left px-4 py-3 font-medium">Asset</th>
                    <th className="text-left px-4 py-3 font-medium">Funnel</th>
                    <th className="text-right px-4 py-3 font-medium">Downloads</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {magnets.map(m => {
                    const f = m.funnel_id ? funnelById.get(m.funnel_id) : null
                    const dc = Number(m.download_count || 0)
                    return (
                      <tr key={m.id} className="border-b border-gray-900 hover:bg-gray-950/40">
                        <td className="px-4 py-3 text-white font-medium align-top">{m.title}</td>
                        <td className="px-4 py-3 text-gray-400 hidden md:table-cell align-top max-w-xs">
                          <div className="line-clamp-2">{m.description || <span className="text-gray-600">—</span>}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <a
                            href={m.asset_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 text-xs underline break-all"
                            title={m.asset_url}
                          >
                            {m.asset_url.length > 40 ? `${m.asset_url.slice(0, 40)}…` : m.asset_url}
                          </a>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {f ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-indigo-900/30 border border-indigo-800 text-indigo-300 text-xs">
                              {f.name}
                            </span>
                          ) : m.funnel_id ? (
                            <span className="text-gray-600 text-xs">unknown</span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-300 tabular-nums align-top">{dc.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell align-top">{formatRelative(m.created_at)}</td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEdit(m)}
                              className="px-2 py-1 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(m)}
                              className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/40 rounded"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">
                {draft.id ? 'Edit Lead Magnet' : 'New Lead Magnet'}
              </h3>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="text-gray-500 hover:text-gray-300 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  placeholder="The 2026 SaaS Growth Playbook"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="32-page PDF with proven plays for B2B SaaS."
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none resize-y"
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
                  Asset URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="url"
                  value={draft.assetUrl}
                  onChange={e => setDraft({ ...draft, assetUrl: e.target.value })}
                  placeholder="https://cdn.example.com/playbook.pdf"
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none font-mono"
                />
                {/* Sprint 17H (audit pass #3 P2 #44): direct file upload.
                    POSTs base64 to /api/upload/asset which uploads to
                    Cloudinary when configured, or returns a data URL as
                    fallback. The text input still works for users with an
                    existing CDN. */}
                <FileUploadButton
                  workspaceId={workspaceId}
                  onUploaded={url => setDraft(d => ({ ...d, assetUrl: url }))}
                />
                <p className="text-[11px] text-gray-600 mt-1">
                  Paste a public URL or upload a file (max 10MB; PDF / Office / image / audio / video).
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
                  Attach to funnel
                </label>
                <select
                  value={draft.funnelId}
                  onChange={e => setDraft({ ...draft, funnelId: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-indigo-600 focus:outline-none"
                >
                  <option value="">— Optional —</option>
                  {funnels.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              {draftError && (
                <div className="px-3 py-2 bg-rose-950/40 border border-rose-900 text-rose-300 text-xs rounded">
                  {draftError}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submitDraft}
                disabled={submitting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-40"
              >
                {submitting ? 'Saving…' : draft.id ? 'Save changes' : 'Create lead magnet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
