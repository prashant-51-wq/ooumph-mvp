'use client'

/**
 * /dashboard/media-library
 *
 * Unified asset hub backed by /api/media-assets.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Header + tab strip (All / Images / Video / Audio / Docs)   │
 *   ├──────────────────────────────────────────┬──────────────────┤
 *   │  Grid: master cards with variants nested  │  Detail tray    │
 *   │  via parent_asset_id  (📎 N variants chip)│  - preview       │
 *   │                                            │  - metadata      │
 *   │  Empty state for fresh workspaces         │  - lineage tree  │
 *   └──────────────────────────────────────────┴──────────────────┘
 *
 * Lineage rules
 * ─────────────
 * Assets with parent_asset_id = null are "masters" and render as primary
 * grid cards. Their children (variants — crops, transcodes, derivatives)
 * are collapsed by default and surfaced under a "📎 N variants" chip.
 * Clicking the chip expands them inline under the master card.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image as ImageIcon, Film, Music, FileText, Layers, RefreshCw, X,
  AlertCircle, Search, Trash2, ExternalLink, Sparkles, Copy, ClipboardCheck,
  GitBranch, Calendar, HardDrive, Maximize2, Clock, ChevronDown, ChevronRight,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface MediaAsset {
  id: string
  workspace_id: string
  parent_asset_id: string | null
  filename: string
  url: string
  asset_type: 'image' | 'video' | 'audio' | 'doc' | 'thumbnail' | string
  mime_type: string | null
  file_size: number | null
  dimensions: string | null
  duration_seconds: number | string | null
  source_provider: string | null
  metadata_json: string | null
  status: string
  created_at: string
}

type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'doc'

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function formatDuration(seconds: number | string | null): string {
  const s = Number(seconds || 0)
  if (!Number.isFinite(s) || s <= 0) return '—'
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s - m * 60)
  return `${m}m ${rest}s`
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
function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function TypeIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  if (type === 'image' || type === 'thumbnail') return <ImageIcon className={`${className} text-sky-400`} />
  if (type === 'video') return <Film className={`${className} text-rose-400`} />
  if (type === 'audio') return <Music className={`${className} text-emerald-400`} />
  if (type === 'doc') return <FileText className={`${className} text-amber-400`} />
  return <Layers className={`${className} text-gray-400`} />
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function MediaLibraryPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set())

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
      const res = await fetch(`/api/media-assets?workspaceId=${workspaceId}&limit=500`)
      const rows = await res.json() as MediaAsset[]
      setAssets(Array.isArray(rows) ? rows : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Build lineage tree
  const { masters, childrenByParent, counts } = useMemo(() => {
    const masters: MediaAsset[] = []
    const childrenByParent = new Map<string, MediaAsset[]>()
    const counts = { all: 0, image: 0, video: 0, audio: 0, doc: 0 }
    for (const a of assets) {
      counts.all++
      const t = a.asset_type === 'thumbnail' ? 'image' : a.asset_type
      if (t === 'image') counts.image++
      else if (t === 'video') counts.video++
      else if (t === 'audio') counts.audio++
      else if (t === 'doc') counts.doc++
      if (a.parent_asset_id) {
        const arr = childrenByParent.get(a.parent_asset_id) || []
        arr.push(a)
        childrenByParent.set(a.parent_asset_id, arr)
      } else {
        masters.push(a)
      }
    }
    return { masters, childrenByParent, counts }
  }, [assets])

  const filteredMasters = useMemo(() => {
    const q = search.trim().toLowerCase()
    return masters.filter(m => {
      const t = m.asset_type === 'thumbnail' ? 'image' : m.asset_type
      if (typeFilter !== 'all' && t !== typeFilter) return false
      if (q) {
        const hay = [m.filename, m.source_provider, m.mime_type].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [masters, typeFilter, search])

  const selectedAsset = useMemo(
    () => assets.find(a => a.id === selectedId) || null,
    [assets, selectedId],
  )

  const deleteAsset = async (id: string) => {
    if (!workspaceId) return
    if (!confirm('Delete this asset? Any child variants will keep existing but lose their parent pointer.')) return
    try {
      const res = await fetch(`/api/media-assets?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      if (selectedId === id) setSelectedId(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleMaster = (id: string) => {
    setExpandedMasters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-400" /> Media Library
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every generated and uploaded asset. Variants are grouped under their master.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <a
              href="/dashboard/creative-studio"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Generate
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5 flex-wrap">
            {([
              { id: 'all' as TypeFilter, label: 'All', Icon: Layers },
              { id: 'image' as TypeFilter, label: 'Images', Icon: ImageIcon },
              { id: 'video' as TypeFilter, label: 'Video', Icon: Film },
              { id: 'audio' as TypeFilter, label: 'Audio', Icon: Music },
              { id: 'doc' as TypeFilter, label: 'Documents', Icon: FileText },
            ]).map(t => {
              const Icon = t.Icon
              const active = typeFilter === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={`px-3 py-1.5 text-xs rounded inline-flex items-center gap-1.5 ${
                    active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {t.label}
                  <span className="text-[10px] opacity-70 tabular-nums">{counts[t.id]}</span>
                </button>
              )
            })}
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search filename, provider, MIME…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-600 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          {filteredMasters.length} master{filteredMasters.length === 1 ? '' : 's'} of {masters.length} · {assets.length} total assets
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-20 text-gray-500 text-sm">Loading library…</div>
        ) : filteredMasters.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <Layers className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            <p className="text-gray-300 text-lg mb-1">
              {assets.length === 0 ? 'No assets yet' : 'No assets match your filters'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {assets.length === 0
                ? 'Generate your first creative or upload an existing file.'
                : 'Try clearing the search or switching the type tab.'}
            </p>
            {assets.length === 0 && (
              <a
                href="/dashboard/creative-studio"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Open Creative Studio
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredMasters.map(master => {
              const variants = childrenByParent.get(master.id) || []
              const expanded = expandedMasters.has(master.id)
              return (
                <AssetCard
                  key={master.id}
                  asset={master}
                  variants={variants}
                  expanded={expanded}
                  onToggleVariants={() => toggleMaster(master.id)}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Detail tray */}
      {selectedAsset && workspaceId && (
        <DetailTray
          asset={selectedAsset}
          variants={childrenByParent.get(selectedAsset.id) || []}
          parent={selectedAsset.parent_asset_id ? assets.find(a => a.id === selectedAsset.parent_asset_id) : undefined}
          onClose={() => setSelectedId(null)}
          onDelete={() => deleteAsset(selectedAsset.id)}
          onSelectAsset={setSelectedId}
        />
      )}
    </div>
  )
}

// ─── Asset Card (master + collapsible variants) ───────────────────────────

function AssetCard({
  asset, variants, expanded, onToggleVariants, selectedId, onSelect,
}: {
  asset: MediaAsset
  variants: MediaAsset[]
  expanded: boolean
  onToggleVariants: () => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const isSelected = selectedId === asset.id
  return (
    <div className={`group bg-gray-900 border rounded-xl overflow-hidden flex flex-col transition-colors ${
      isSelected ? 'border-indigo-600' : 'border-gray-800 hover:border-gray-700'
    }`}>
      <button onClick={() => onSelect(asset.id)} className="block">
        <AssetPreview asset={asset} compact />
      </button>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => onSelect(asset.id)} className="text-left flex-1 min-w-0">
            <div className="text-sm text-white font-medium truncate">{asset.filename}</div>
            <div className="text-[10px] text-gray-500 truncate">
              {asset.dimensions || formatDuration(asset.duration_seconds) || asset.mime_type || '—'}
            </div>
          </button>
          <TypeIcon type={asset.asset_type} className="w-3.5 h-3.5 flex-shrink-0" />
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-600">
          <span>{formatRelative(asset.created_at)}</span>
          {asset.source_provider && (
            <span className="px-1.5 py-0.5 bg-gray-950 border border-gray-800 rounded text-gray-400">
              {asset.source_provider}
            </span>
          )}
        </div>
        {variants.length > 0 && (
          <button
            onClick={onToggleVariants}
            className="mt-1 px-2 py-1 text-[11px] bg-purple-900/30 hover:bg-purple-900/60 border border-purple-800 text-purple-200 rounded inline-flex items-center justify-center gap-1.5"
            title="Show derived variants"
          >
            <GitBranch className="w-3 h-3" />
            <span>{variants.length} variant{variants.length === 1 ? '' : 's'}</span>
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Variants — nested under the master */}
      {expanded && variants.length > 0 && (
        <div className="border-t border-gray-800 bg-gray-950/40 p-2 space-y-1.5">
          {variants.map(v => (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={`w-full flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                selectedId === v.id ? 'bg-indigo-900/30' : 'hover:bg-gray-900/50'
              }`}
            >
              <TypeIcon type={v.asset_type} className="w-3 h-3 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 truncate">{v.filename}</div>
                <div className="text-[10px] text-gray-600 truncate">
                  {v.dimensions || formatDuration(v.duration_seconds)} · {formatBytes(v.file_size)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Asset Preview (inline + tray) ────────────────────────────────────────

function AssetPreview({ asset, compact = false }: { asset: MediaAsset; compact?: boolean }) {
  const aspectClass = compact ? 'aspect-square' : 'aspect-video'
  const t = asset.asset_type === 'thumbnail' ? 'image' : asset.asset_type

  if (t === 'image') {
    return (
      <div className={`bg-gray-950 ${aspectClass} relative overflow-hidden`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.filename} className="absolute inset-0 w-full h-full object-cover" />
      </div>
    )
  }
  if (t === 'video') {
    return (
      <div className={`bg-gray-950 ${aspectClass} relative overflow-hidden flex items-center justify-center`}>
        {/* Lazy-load video; controls only shown in tray */}
        <video src={asset.url} className="absolute inset-0 w-full h-full object-cover" preload="metadata" muted controls={!compact} />
        {compact && (
          <span className="absolute bottom-1.5 right-1.5 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
            <Film className="w-2.5 h-2.5" />
            {formatDuration(asset.duration_seconds)}
          </span>
        )}
      </div>
    )
  }
  if (t === 'audio') {
    return (
      <div className={`bg-gradient-to-br from-emerald-950 to-gray-950 ${aspectClass} relative overflow-hidden flex flex-col items-center justify-center p-3`}>
        <Music className="w-10 h-10 text-emerald-400 opacity-80 mb-2" />
        {!compact && (
          <audio src={asset.url} controls className="w-full" preload="metadata" />
        )}
        <span className="text-[10px] text-emerald-300 mt-1">
          {formatDuration(asset.duration_seconds)}
        </span>
      </div>
    )
  }
  return (
    <div className={`bg-gradient-to-br from-amber-950 to-gray-950 ${aspectClass} relative overflow-hidden flex items-center justify-center`}>
      <FileText className="w-10 h-10 text-amber-400 opacity-80" />
      <span className="absolute bottom-2 inset-x-0 text-center text-[10px] text-amber-300 uppercase tracking-wider font-medium">
        {(asset.mime_type || asset.asset_type).split('/').pop() || 'file'}
      </span>
    </div>
  )
}

// ─── Detail Tray ──────────────────────────────────────────────────────────

function DetailTray({
  asset, variants, parent, onClose, onDelete, onSelectAsset,
}: {
  asset: MediaAsset
  variants: MediaAsset[]
  parent: MediaAsset | undefined
  onClose: () => void
  onDelete: () => void
  onSelectAsset: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  // Parse metadata_json for extra display
  const meta = useMemo<Record<string, unknown>>(() => {
    if (!asset.metadata_json) return {}
    try { return JSON.parse(asset.metadata_json) as Record<string, unknown> } catch { return {} }
  }, [asset.metadata_json])

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full max-w-xl bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{asset.filename}</h2>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <TypeIcon type={asset.asset_type} className="w-3 h-3" />
              <span className="text-gray-400 capitalize">{asset.asset_type}</span>
              {asset.source_provider && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-400">{asset.source_provider}</span>
                </>
              )}
              <span className="text-gray-700">·</span>
              <span className="text-gray-500">{formatRelative(asset.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="bg-gray-950 border-b border-gray-800">
          <AssetPreview asset={asset} compact={false} />
        </div>

        <div className="p-6 space-y-6">
          {/* Lineage block */}
          {(parent || variants.length > 0) && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-purple-400" /> Lineage
              </h3>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                {parent && (
                  <button
                    onClick={() => onSelectAsset(parent.id)}
                    className="w-full flex items-center gap-2 p-2 bg-gray-950 hover:bg-gray-950/80 border border-gray-800 rounded transition-colors text-left"
                  >
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                    <TypeIcon type={parent.asset_type} className="w-3.5 h-3.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">↑ Master: {parent.filename}</div>
                      <div className="text-[10px] text-gray-600">{parent.dimensions || formatDuration(parent.duration_seconds)}</div>
                    </div>
                  </button>
                )}
                {variants.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">{variants.length} variant{variants.length === 1 ? '' : 's'} derived from this master:</p>
                    <div className="space-y-1">
                      {variants.map(v => (
                        <button
                          key={v.id}
                          onClick={() => onSelectAsset(v.id)}
                          className="w-full flex items-center gap-2 p-2 bg-gray-950 hover:bg-gray-950/80 border border-gray-800 rounded transition-colors text-left"
                        >
                          <ChevronRight className="w-3 h-3 text-gray-600" />
                          <TypeIcon type={v.asset_type} className="w-3.5 h-3.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-200 truncate">{v.filename}</div>
                            <div className="text-[10px] text-gray-600">{v.dimensions || formatDuration(v.duration_seconds)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Metadata */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Metadata</h3>
            <dl className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              <MetaRow Icon={FileText} label="MIME type" value={asset.mime_type || '—'} mono />
              <MetaRow Icon={HardDrive} label="File size" value={formatBytes(asset.file_size)} />
              {asset.dimensions && <MetaRow Icon={Maximize2} label="Dimensions" value={asset.dimensions} />}
              {asset.duration_seconds && Number(asset.duration_seconds) > 0 && (
                <MetaRow Icon={Clock} label="Duration" value={formatDuration(asset.duration_seconds)} />
              )}
              <MetaRow Icon={Calendar} label="Created" value={formatAbsolute(asset.created_at)} />
              <MetaRow Icon={Layers} label="Status" value={asset.status} />
              {asset.source_provider && (
                <MetaRow Icon={Sparkles} label="Source" value={asset.source_provider} />
              )}
            </dl>
          </section>

          {/* Provider extras */}
          {Object.keys(meta).length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Provider metadata</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* URL + actions */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Public URL</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-2">
              <code className="flex-1 text-[11px] text-gray-300 font-mono truncate" title={asset.url}>
                {asset.url}
              </code>
              <button
                onClick={copyUrl}
                className="px-2 py-1 text-xs bg-gray-950 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1"
              >
                {copied ? <ClipboardCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {asset.url.startsWith('http') && (
                <a
                  href={asset.url} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-1 text-xs bg-gray-950 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded inline-flex items-center gap-1"
                >
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </section>

          {/* Destructive */}
          <section className="pt-2 border-t border-gray-800">
            <button
              onClick={onDelete}
              className="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-900/60 border border-rose-800 text-rose-200 text-xs rounded inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" /> Delete asset
            </button>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Children variants will lose their parent pointer but stay intact (ON DELETE SET NULL).
            </p>
          </section>
        </div>
      </aside>
    </div>
  )
}

function MetaRow({ Icon, label, value, mono = false }: {
  Icon: typeof FileText
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-right ${mono ? 'font-mono text-xs text-gray-300' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  )
}
