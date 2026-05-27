'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type KnowledgeType = 'brand_voice' | 'strategy' | 'market_intel' | 'competitor' | 'performance'
type SourceStatus = 'processing' | 'indexed' | 'failed'
type IngestType = 'pdf' | 'docx' | 'url' | 'text'

interface KnowledgeNode {
  id: string
  type: KnowledgeType
  content: string
  confidence: number
  tags: string[]
  source_doc: string
  source_id: string
  created_at: string
  expanded?: boolean
}

interface Insight {
  id: string
  title: string
  body: string
  source: string
  category: string
  created_at: string
}

interface SourceDoc {
  id: string
  filename: string
  type: IngestType
  status: SourceStatus
  node_count: number
  created_at: string
}

interface UploadItem {
  id: string
  name: string
  type: IngestType
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

interface LearningSettings {
  autoLearn: boolean
  confidenceThreshold: number
  agents: Record<string, boolean>
}

// Sprint 3C: removed DEMO_NODES — a 37-line array of fake knowledge graph
// rows. The `nodes` state below now starts empty; when the page is wired
// to /api/learning (the GET endpoint returning learning_notes rows already
// exists) the demo seed can be deleted entirely. For now empty is honest:
// no nodes means the workspace genuinely has no ingested brand memory yet.


const DEMO_INSIGHTS: Insight[] = [
  {
    id: 'i1', title: 'LinkedIn engagement window identified',
    body: 'Data from your strategy brief shows decision-makers engage most between 7–9 AM on weekdays. Schedule high-priority LinkedIn posts in this window to maximise reach.',
    source: 'Q3 Strategy Brief.docx', category: 'Scheduling',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: 'i2', title: 'Email subject line formula extracted',
    body: 'Number + power word subject lines outperform generic ones by 28%. Apply this formula to all email campaigns: "[Number] ways to [desired outcome]" or "Stop [pain point]".',
    source: 'Email Performance Report.pdf', category: 'Email',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: 'i3', title: 'Competitor weakness — onboarding gap',
    body: 'Competitor A has high 90-day churn due to self-serve onboarding. Lean into your dedicated onboarding + 30-day activation plan in all competitive scenarios and battle cards.',
    source: 'Competitive Analysis.pdf', category: 'Competitive',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
]

const DEMO_SOURCES: SourceDoc[] = [
  { id: 's1', filename: 'Brand Guidelines v3.pdf', type: 'pdf', status: 'indexed', node_count: 14, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 's2', filename: 'Q3 Strategy Brief.docx', type: 'docx', status: 'indexed', node_count: 8, created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
  { id: 's3', filename: 'Market Research Oct 2025.pdf', type: 'pdf', status: 'indexed', node_count: 22, created_at: new Date(Date.now() - 86400000 * 7).toISOString() },
  { id: 's4', filename: 'Competitive Analysis.pdf', type: 'pdf', status: 'processing', node_count: 0, created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
  { id: 's5', filename: 'Email Performance Report.pdf', type: 'pdf', status: 'indexed', node_count: 6, created_at: new Date(Date.now() - 86400000 * 1).toISOString() },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<KnowledgeType, { label: string; color: string }> = {
  brand_voice: { label: 'Brand Voice', color: 'bg-purple-950 border-purple-800 text-purple-300' },
  strategy: { label: 'Strategy', color: 'bg-blue-950 border-blue-800 text-blue-300' },
  market_intel: { label: 'Market Intel', color: 'bg-cyan-950 border-cyan-800 text-cyan-300' },
  competitor: { label: 'Competitor', color: 'bg-orange-950 border-orange-800 text-orange-300' },
  performance: { label: 'Performance', color: 'bg-green-950 border-green-800 text-green-300' },
}

const STATUS_META: Record<SourceStatus, { label: string; color: string; dot: string }> = {
  processing: { label: 'Processing', color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
  indexed: { label: 'Indexed', color: 'text-green-400', dot: 'bg-green-400' },
  failed: { label: 'Failed', color: 'text-red-400', dot: 'bg-red-400' },
}

const TABS = ['Knowledge Base', 'Ingest', 'Insights', 'Sources', 'Settings'] as const
type Tab = typeof TABS[number]

const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LearningHubPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Knowledge Base')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  // Sprint 3C: was seeded with 37 lines of fake knowledge graph rows
  // (DEMO_NODES). Empty initial state is honest until /api/learning is
  // wired here. The endpoint already exists and returns real
  // learning_notes rows — the row->KnowledgeNode mapping needs to be
  // built when this page is properly hydrated in a later sprint.
  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [insights] = useState<Insight[]>(DEMO_INSIGHTS)
  const [sources, setSources] = useState<SourceDoc[]>(DEMO_SOURCES)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  // Ingest tab state
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [ingestResult, setIngestResult] = useState<{ success: boolean; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Settings state
  const [settings, setSettings] = useState<LearningSettings>({
    autoLearn: true,
    confidenceThreshold: 70,
    agents: { CMO: true, Strategy: true, 'Brand Monitor': true, Content: true, Email: false, Social: false },
  })
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setWorkspaceId(wid)
    // In production, fetch real data here
    // fetch(`/api/learning?workspaceId=${wid}&tab=knowledge_base`)
  }, [router])

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filteredNodes = nodes.filter(n => {
    const matchesType = typeFilter === 'all' || n.type === typeFilter
    const matchesSearch = !search ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(search.toLowerCase())) ||
      n.source_doc.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  const filteredInsights = insights.filter(i =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.body.toLowerCase().includes(search.toLowerCase())
  )

  const filteredSources = sources.filter(s =>
    !search || s.filename.toLowerCase().includes(search.toLowerCase())
  )

  // ─── Drag-drop handlers ──────────────────────────────────────────────────────

  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const newItems: UploadItem[] = arr.map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      type: f.name.endsWith('.pdf') ? 'pdf' : 'docx',
      progress: 0,
      status: 'queued',
    }))
    setUploadQueue(prev => [...prev, ...newItems])
  }, [])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files)
  }

  // ─── Submit ingest ───────────────────────────────────────────────────────────

  const handleIngestSubmit = async () => {
    if (!workspaceId) return
    setSubmitting(true)
    setIngestResult(null)

    const items: Array<{ type: IngestType; content: string; filename?: string }> = []

    uploadQueue.filter(u => u.status === 'queued').forEach(u => {
      items.push({ type: u.type, content: `[File: ${u.name}]`, filename: u.name })
    })
    if (urlInput.trim()) items.push({ type: 'url', content: urlInput.trim(), filename: urlInput.trim() })
    if (textInput.trim()) items.push({ type: 'text', content: textInput.trim(), filename: 'Pasted text' })

    if (items.length === 0) { setSubmitting(false); return }

    // Animate progress for queued files
    setUploadQueue(prev => prev.map(u =>
      u.status === 'queued' ? { ...u, status: 'uploading', progress: 10 } : u
    ))

    let totalNodes = 0
    let hasError = false

    for (const item of items) {
      try {
        const res = await fetch('/api/learning/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, ...item }),
        })
        const data = await res.json()
        if (data.success) {
          totalNodes += data.nodesCreated || 0
          setUploadQueue(prev => prev.map(u =>
            u.name === item.filename ? { ...u, status: 'done', progress: 100 } : u
          ))
          // Add to sources list
          const newSrc: SourceDoc = {
            id: Math.random().toString(36).slice(2),
            filename: item.filename || item.content.slice(0, 40),
            type: item.type,
            status: 'indexed',
            node_count: data.nodesCreated || 0,
            created_at: new Date().toISOString(),
          }
          setSources(prev => [newSrc, ...prev])
        } else {
          hasError = true
          setUploadQueue(prev => prev.map(u =>
            u.name === item.filename ? { ...u, status: 'error', error: data.error || 'Failed' } : u
          ))
        }
      } catch {
        hasError = true
      }
    }

    setIngestResult({
      success: !hasError,
      message: hasError
        ? 'Some items failed to process. Check the queue above.'
        : `${totalNodes} knowledge nodes extracted and indexed.`,
    })
    setUrlInput('')
    setTextInput('')
    setSubmitting(false)
  }

  // ─── Settings save ───────────────────────────────────────────────────────────

  const saveSettings = () => {
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  const avgConfidence = nodes.length
    ? Math.round(nodes.reduce((s, n) => s + n.confidence, 0) / nodes.length * 100)
    : 0

  const lastUpdated = nodes.length
    ? new Date(Math.max(...nodes.map(n => new Date(n.created_at).getTime()))).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    : 'Never'

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Universal AI Learning Hub</h1>
        <p className="text-gray-400 text-sm mt-1">Upload documents, extract knowledge, and feed structured insights to every AI agent.</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Documents', value: sources.length, color: 'border-gray-700' },
          { label: 'Knowledge Nodes', value: nodes.length, color: 'border-indigo-800' },
          { label: 'Avg Confidence', value: `${avgConfidence}%`, color: 'border-green-800' },
          { label: 'Last Updated', value: lastUpdated, color: 'border-blue-800' },
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
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search knowledge base, insights, sources..."
          className={inputCls}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab: Knowledge Base ─────────────────────────────────────────────── */}
      {activeTab === 'Knowledge Base' && (
        <div>
          {/* Type filter chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            {['all', ...Object.keys(TYPE_META)].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  typeFilter === t
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {t === 'all' ? 'All Types' : TYPE_META[t as KnowledgeType].label}
              </button>
            ))}
          </div>

          <p className="text-gray-500 text-xs mb-4">{filteredNodes.length} node{filteredNodes.length !== 1 ? 's' : ''}</p>

          <div className="space-y-3">
            {filteredNodes.map(node => {
              const isExpanded = expanded.has(node.id)
              const meta = TYPE_META[node.type]
              return (
                <div key={node.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${meta.color}`}>{meta.label}</span>
                      {node.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400 border border-gray-700">#{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-gray-600 text-xs">{new Date(node.created_at).toLocaleDateString()}</span>
                      <button
                        onClick={() => setExpanded(prev => {
                          const next = new Set(prev)
                          if (next.has(node.id)) next.delete(node.id); else next.add(node.id)
                          return next
                        })}
                        className="text-gray-500 hover:text-white text-xs transition-colors"
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>

                  <p className={`text-gray-200 text-sm leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {node.content}
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-800 max-w-40">
                      <div
                        className={`h-1.5 rounded-full ${node.confidence >= 0.85 ? 'bg-green-500' : node.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                        style={{ width: `${node.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-500 text-xs">{Math.round(node.confidence * 100)}% confidence</span>
                    <span className="text-gray-600 text-xs ml-auto">from {node.source_doc}</span>
                    <FeedToAgentDropdown nodeId={node.id} />
                  </div>
                </div>
              )
            })}

            {filteredNodes.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-gray-400">No knowledge nodes match your filters.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Ingest ─────────────────────────────────────────────────────── */}
      {activeTab === 'Ingest' && (
        <div className="space-y-6">
          {/* Drag-drop zone */}
          <div
            ref={dragRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-700 hover:border-gray-600 bg-gray-900'
            }`}
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="text-white font-medium mb-1">Drop PDF or DOCX files here</p>
            <p className="text-gray-500 text-sm">or click to browse — multiple files supported</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx"
              className="hidden"
              onChange={e => { if (e.target.files) addFilesToQueue(e.target.files) }}
            />
          </div>

          {/* Upload queue */}
          {uploadQueue.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white text-sm font-medium">Upload Queue ({uploadQueue.length})</p>
                <button
                  onClick={() => setUploadQueue([])}
                  className="text-gray-500 hover:text-white text-xs transition-colors"
                >
                  Clear all
                </button>
              </div>
              {uploadQueue.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-6 text-center text-sm">
                    {item.status === 'done' ? '✓' : item.status === 'error' ? '✕' : item.type === 'pdf' ? '📄' : '📝'}
                  </div>
                  <span className="text-gray-300 text-sm flex-1 truncate">{item.name}</span>
                  <div className="w-24 h-1.5 rounded-full bg-gray-800">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        item.status === 'error' ? 'bg-red-500' : item.status === 'done' ? 'bg-green-500' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className={`text-xs w-16 text-right ${
                    item.status === 'error' ? 'text-red-400' : item.status === 'done' ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {item.status === 'uploading' ? `${item.progress}%` : item.status}
                  </span>
                  {item.status === 'queued' && (
                    <button
                      onClick={() => setUploadQueue(prev => prev.filter(u => u.id !== item.id))}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* URL input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 font-medium">Import from URL</label>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://example.com/article-or-page"
              className={inputCls}
            />
          </div>

          {/* Text paste */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 font-medium">Paste text directly</label>
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              rows={6}
              placeholder="Paste brand guidelines, research notes, strategy documents, or any text content here..."
              className={inputCls + ' resize-none'}
            />
            <p className="text-gray-600 text-xs mt-1">{textInput.length} characters</p>
          </div>

          {/* Result */}
          {ingestResult && (
            <div className={`p-3 rounded-lg text-sm ${ingestResult.success ? 'bg-green-950 border border-green-800 text-green-300' : 'bg-red-950 border border-red-800 text-red-300'}`}>
              {ingestResult.success ? '✓ ' : '✕ '}{ingestResult.message}
            </div>
          )}

          <button
            onClick={handleIngestSubmit}
            disabled={submitting || (uploadQueue.filter(u => u.status === 'queued').length === 0 && !urlInput.trim() && !textInput.trim())}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium transition-colors"
          >
            {submitting ? 'Extracting knowledge...' : 'Extract Knowledge'}
          </button>
        </div>
      )}

      {/* ── Tab: Insights ───────────────────────────────────────────────────── */}
      {activeTab === 'Insights' && (
        <div className="space-y-4">
          {filteredInsights.map(insight => (
            <div key={insight.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-950 border border-indigo-800 text-indigo-300">
                    {insight.category}
                  </span>
                  <span className="text-gray-600 text-xs">from {insight.source}</span>
                </div>
                <span className="text-gray-600 text-xs shrink-0">{new Date(insight.created_at).toLocaleDateString()}</span>
              </div>
              <h3 className="text-white font-medium mb-2">{insight.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{insight.body}</p>
              <div className="flex gap-2 mt-4">
                <DeployButton label="Deploy to Strategy" />
                <DeployButton label="Deploy to CMO" />
                <DeployButton label="Deploy to Brand Memory" />
              </div>
            </div>
          ))}

          {filteredInsights.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">💡</div>
              <p className="text-gray-400">No insights yet. Ingest documents to generate AI-powered insights.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Sources ────────────────────────────────────────────────────── */}
      {activeTab === 'Sources' && (
        <div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs text-gray-500 font-medium px-5 py-3">Filename</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Type</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Nodes</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Ingested</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((src, idx) => {
                  const sm = STATUS_META[src.status]
                  return (
                    <tr key={src.id} className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                      <td className="px-5 py-3">
                        <span className="text-white text-sm">{src.filename}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-400 text-xs uppercase">{src.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                          <span className={`text-xs ${sm.color}`}>{sm.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-400 text-sm">{src.node_count}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-500 text-xs">{new Date(src.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                            onClick={() => {
                              setSources(prev => prev.map(s =>
                                s.id === src.id ? { ...s, status: 'processing' } : s
                              ))
                              setTimeout(() => setSources(prev => prev.map(s =>
                                s.id === src.id ? { ...s, status: 'indexed' } : s
                              )), 2000)
                            }}
                          >
                            Re-process
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                            onClick={() => setSources(prev => prev.filter(s => s.id !== src.id))}
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

            {filteredSources.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-gray-400">No sources ingested yet. Use the Ingest tab to upload documents.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Settings ───────────────────────────────────────────────────── */}
      {activeTab === 'Settings' && (
        <div className="max-w-xl space-y-6">
          {/* Auto-learn toggle */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium text-sm">Auto-Learning</p>
                <p className="text-gray-400 text-xs mt-0.5">Automatically extract knowledge when new documents are uploaded.</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, autoLearn: !s.autoLearn }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.autoLearn ? 'bg-indigo-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.autoLearn ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Confidence threshold */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-white font-medium text-sm mb-1">Confidence Threshold</p>
            <p className="text-gray-400 text-xs mb-4">Only nodes above this confidence level are deployed to agents.</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.confidenceThreshold}
                onChange={e => setSettings(s => ({ ...s, confidenceThreshold: Number(e.target.value) }))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-white font-bold text-sm w-12 text-right">{settings.confidenceThreshold}%</span>
            </div>
          </div>

          {/* Agent checkboxes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-white font-medium text-sm mb-1">Agent Recipients</p>
            <p className="text-gray-400 text-xs mb-4">Select which agents receive knowledge updates automatically.</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(settings.agents).map(([agent, enabled]) => (
                <label key={agent} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setSettings(s => ({ ...s, agents: { ...s.agents, [agent]: e.target.checked } }))}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-indigo-500"
                  />
                  <span className="text-gray-300 text-sm">{agent}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={saveSettings}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
          >
            {settingsSaved ? '✓ Settings Saved' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeedToAgentDropdown({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(false)
  const [fed, setFed] = useState<string | null>(null)
  const agents = ['CMO Agent', 'Strategy Agent', 'Brand Monitor', 'Content Agent', 'Email Agent']

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
      >
        {fed ? `Fed to ${fed}` : 'Feed to Agent'} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 bottom-6 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-40 py-1">
          {agents.map(a => (
            <button
              key={a}
              onClick={() => { setFed(a); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DeployButton({ label }: { label: string }) {
  const [deployed, setDeployed] = useState(false)
  return (
    <button
      onClick={() => setDeployed(true)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        deployed
          ? 'bg-green-950 border-green-800 text-green-300'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
      }`}
    >
      {deployed ? '✓ Deployed' : label}
    </button>
  )
}
