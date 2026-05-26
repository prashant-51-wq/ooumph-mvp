'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type MemoryContentType =
  | 'approved_post'
  | 'approved_email'
  | 'brand_voice_example'
  | 'learning_note'
  | 'rejected_example'
  | 'strategy_note'
  | 'top_performing'

interface MemoryEntry {
  id: string
  workspace_id: string
  content: string
  content_type: MemoryContentType
  platform?: string
  performance_score?: number
  metadata_json: string
  created_at: string
}

const CONTENT_TYPE_LABELS: Record<MemoryContentType, string> = {
  approved_post: 'Approved Post',
  approved_email: 'Approved Email',
  brand_voice_example: 'Brand Voice',
  learning_note: 'Learning Note',
  rejected_example: 'Rejected',
  strategy_note: 'Strategy Note',
  top_performing: 'Top Performing',
}

const CONTENT_TYPE_COLORS: Record<MemoryContentType, string> = {
  approved_post: 'bg-green-900 text-green-300 border-green-800',
  approved_email: 'bg-blue-900 text-blue-300 border-blue-800',
  brand_voice_example: 'bg-purple-900 text-purple-300 border-purple-800',
  learning_note: 'bg-gray-800 text-gray-300 border-gray-700',
  rejected_example: 'bg-red-900 text-red-300 border-red-800',
  strategy_note: 'bg-indigo-900 text-indigo-300 border-indigo-800',
  top_performing: 'bg-yellow-900 text-yellow-300 border-yellow-800',
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸',
  linkedin: '💼',
  twitter: '🐦',
  facebook: '📘',
  youtube: '▶️',
  email: '📧',
  blog: '📝',
}

const FILTER_OPTIONS = [
  { key: '', label: 'All' },
  { key: 'approved_post', label: 'Approved Posts' },
  { key: 'brand_voice_example', label: 'Brand Voice' },
  { key: 'learning_note', label: 'Learning Notes' },
  { key: 'top_performing', label: 'Top Performing' },
  { key: 'rejected_example', label: 'Rejected' },
  { key: 'from_documents', label: 'From Documents' },
]

const MEMORY_TYPES: MemoryContentType[] = [
  'approved_post',
  'approved_email',
  'brand_voice_example',
  'learning_note',
  'strategy_note',
  'top_performing',
]

export default function BrandMemoryPage() {
  const router = useRouter()
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addType, setAddType] = useState<MemoryContentType>('learning_note')
  const [addPlatform, setAddPlatform] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState('')

  // Upload brand docs modal state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadUrl, setUploadUrl] = useState('')
  const [uploadText, setUploadText] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const load = useCallback(async (query?: string) => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ workspaceId: wid })
      if (filter) params.set('type', filter)
      if (query) params.set('query', query)
      const res = await fetch(`/api/agents/memory?${params}`)
      const data = await res.json()
      setMemories(Array.isArray(data.results) ? data.results : [])
    } catch {
      setMemories([])
    } finally {
      setLoading(false)
    }
  }, [router, filter])

  useEffect(() => { load() }, [load])

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimeout) clearTimeout(searchTimeout)
    const t = setTimeout(() => load(q || undefined), 400)
    setSearchTimeout(t)
  }

  const addMemory = async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid || !addContent.trim()) return
    setSaving(true); setSaveResult('')
    try {
      const res = await fetch('/api/agents/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wid,
          action: 'save',
          content: addContent.trim(),
          contentType: addType,
          metadata: addPlatform ? { platform: addPlatform } : {},
        }),
      })
      const data = await res.json()
      if (data.saved) {
        setSaveResult('Memory saved!')
        setAddContent('')
        setAddPlatform('')
        setAddType('learning_note')
        setTimeout(() => { setShowAddModal(false); setSaveResult(''); load() }, 1200)
      } else {
        setSaveResult(`Error: ${data.error || 'Save failed'}`)
      }
    } catch (e) {
      setSaveResult(`Error: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleUploadBrandDocs = async () => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    setUploading(true)
    setUploadResult(null)

    const items: Array<{ type: 'pdf' | 'docx' | 'url' | 'text'; content: string; filename?: string }> = []
    uploadFiles.forEach(f => items.push({ type: f.name.endsWith('.pdf') ? 'pdf' : 'docx', content: `[File: ${f.name}]`, filename: f.name }))
    if (uploadUrl.trim()) items.push({ type: 'url', content: uploadUrl.trim(), filename: uploadUrl.trim() })
    if (uploadText.trim()) items.push({ type: 'text', content: uploadText.trim(), filename: 'Pasted brand guidelines' })

    if (items.length === 0) { setUploading(false); return }

    let totalNodes = 0
    let hasError = false

    for (const item of items) {
      try {
        const res = await fetch('/api/learning/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: wid, type: item.type, content: item.content, filename: item.filename }),
        })
        const data = await res.json()
        if (data.success) {
          totalNodes += data.nodesCreated || 0
        } else {
          hasError = true
        }
      } catch {
        hasError = true
      }
    }

    setUploadResult({
      success: !hasError,
      message: hasError
        ? 'Some items failed. Please try again.'
        : `${totalNodes} knowledge nodes extracted and added to Brand Memory.`,
    })
    setUploading(false)
    if (!hasError) {
      setUploadFiles([])
      setUploadUrl('')
      setUploadText('')
      setTimeout(() => { setShowUploadModal(false); setUploadResult(null); load() }, 2000)
    }
  }

  const stats = {
    total: memories.length,
    approved: memories.filter(m => m.content_type === 'approved_post' || m.content_type === 'approved_email').length,
    topPerforming: memories.filter(m => m.content_type === 'top_performing').length,
    learningNotes: memories.filter(m => m.content_type === 'learning_note').length,
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🧠 Brand Memory</h1>
          <p className="text-gray-400 text-sm mt-1">AI learns your brand voice from every approved piece of content</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-colors">
            Upload Brand Docs
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
            + Add Memory
          </button>
        </div>
      </div>

      {/* Notice */}
      <div className="mb-6 p-4 rounded-xl bg-indigo-950 border border-indigo-800 text-indigo-300 text-sm">
        Every piece of content you approve is automatically saved here to improve future generation quality. The AI uses these examples to match your brand voice.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Memories', value: stats.total, color: 'border-gray-700' },
          { label: 'Approved Posts', value: stats.approved, color: 'border-green-800' },
          { label: 'Top Performers', value: stats.topPerforming, color: 'border-yellow-800' },
          { label: 'Learning Notes', value: stats.learningNotes, color: 'border-blue-800' },
        ].map(s => (
          <div key={s.label} className={`bg-gray-900 border ${s.color} rounded-xl p-4`}>
            <p className="text-gray-400 text-xs">{s.label}</p>
            <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search brand memories..."
          className={inputCls}
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_OPTIONS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setSearchQuery('') }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Memory Cards */}
      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 flex items-center gap-4">
          <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading memories...</p>
        </div>
      ) : memories.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🧠</div>
          <p className="text-white font-medium mb-2">No memories yet</p>
          <p className="text-gray-500 text-sm">As you approve content, Ooumph learns your brand voice automatically.</p>
          <button onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">
            Add First Memory
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {memories.map(entry => {
            const platformIcon = entry.platform ? (PLATFORM_ICONS[entry.platform.toLowerCase()] || '📌') : null
            const score = entry.performance_score || 0

            return (
              <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${CONTENT_TYPE_COLORS[entry.content_type] || 'bg-gray-800 text-gray-300 border-gray-700'}`}>
                      {CONTENT_TYPE_LABELS[entry.content_type] || entry.content_type}
                    </span>
                    {entry.platform && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400 border border-gray-700">
                        {platformIcon} {entry.platform}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600 text-xs whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString()}</span>
                </div>

                {score > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500">Performance</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-700 max-w-24">
                      <div
                        className={`h-1.5 rounded-full ${score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{score}</span>
                  </div>
                )}

                <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
                  {entry.content.slice(0, 250)}{entry.content.length > 250 ? '...' : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Memory Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold">Add Brand Memory</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Memory Type</label>
                <select value={addType} onChange={e => setAddType(e.target.value as MemoryContentType)} className={inputCls}>
                  {MEMORY_TYPES.map(t => (
                    <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Platform (optional)</label>
                <select value={addPlatform} onChange={e => setAddPlatform(e.target.value)} className={inputCls}>
                  <option value="">No platform</option>
                  {Object.keys(PLATFORM_ICONS).map(p => (
                    <option key={p} value={p}>{PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Content</label>
                <textarea
                  value={addContent}
                  onChange={e => setAddContent(e.target.value)}
                  rows={6}
                  placeholder="Paste the content, brand voice guideline, or learning note here..."
                  className={inputCls + ' resize-none'}
                />
                <p className="text-xs text-gray-600 mt-1">{addContent.length} characters</p>
              </div>

              {saveResult && (
                <p className={`text-xs ${saveResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{saveResult}</p>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={addMemory} disabled={saving || !addContent.trim()}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {saving ? 'Saving...' : 'Save Memory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Brand Docs Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowUploadModal(false); setUploadResult(null) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold">Upload Brand Docs</h2>
                <p className="text-gray-500 text-xs mt-0.5">AI will extract knowledge nodes and add them to Brand Memory.</p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setUploadResult(null) }} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              {/* Drag-drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setIsDragging(false)
                  if (e.dataTransfer.files.length) setUploadFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
                }}
                onClick={() => uploadFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                }`}
              >
                <div className="text-3xl mb-2">📄</div>
                <p className="text-white text-sm font-medium">Drop PDF or DOCX files here</p>
                <p className="text-gray-500 text-xs mt-0.5">or click to browse</p>
                <input
                  ref={uploadFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={e => { if (e.target.files) setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                />
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-1.5">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
                      <span className="text-gray-400 text-xs flex-1 truncate">{f.name}</span>
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Text paste */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Paste brand guidelines text</label>
                <textarea
                  value={uploadText}
                  onChange={e => setUploadText(e.target.value)}
                  rows={4}
                  placeholder="Paste brand guidelines, voice documentation, or strategy notes..."
                  className={inputCls + ' resize-none'}
                />
              </div>

              {/* URL field */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Import from URL</label>
                <input
                  value={uploadUrl}
                  onChange={e => setUploadUrl(e.target.value)}
                  placeholder="https://your-brand-guidelines.com/page"
                  className={inputCls}
                />
              </div>

              {uploadResult && (
                <div className={`p-3 rounded-lg text-sm ${uploadResult.success ? 'bg-green-950 border border-green-800 text-green-300' : 'bg-red-950 border border-red-800 text-red-300'}`}>
                  {uploadResult.success ? '✓ ' : '✕ '}{uploadResult.message}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowUploadModal(false); setUploadResult(null) }}
                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadBrandDocs}
                disabled={uploading || (uploadFiles.length === 0 && !uploadUrl.trim() && !uploadText.trim())}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {uploading ? 'Extracting...' : 'Extract & Save to Memory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
