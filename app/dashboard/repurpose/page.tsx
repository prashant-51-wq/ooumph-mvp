'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type RepurposeTab = 'repurpose' | 'history' | 'cmo'
type SourceType = 'blog_url' | 'video_url' | 'podcast' | 'upload' | 'text'

interface OutputFormat {
  id: string
  icon: string
  label: string
  platform: string
  color: string
}

interface GeneratedOutput {
  formatId: string
  content: string
  hashtags?: string[]
  characterCount: number
  includedInCmo: boolean
  approvalState: 'idle' | 'sending' | 'sent' | 'error'
}

interface RepurposeJob {
  id: string
  sourceTitle: string
  formatsGenerated: number
  date: string
  status: 'completed'
  formats: string[]
}

interface CmoBriefItem {
  id: string
  contentSummary: string
  format: string
  date: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'twitter_thread', icon: '🐦', label: 'Twitter Thread', platform: '5-8 tweets', color: 'bg-sky-900/30 border-sky-800/40 text-sky-300' },
  { id: 'linkedin_post', icon: '💼', label: 'LinkedIn Post', platform: '3,000 chars', color: 'bg-blue-900/30 border-blue-800/40 text-blue-300' },
  { id: 'instagram_caption', icon: '📸', label: 'Instagram Caption', platform: '2,200 chars', color: 'bg-pink-900/30 border-pink-800/40 text-pink-300' },
  { id: 'instagram_carousel', icon: '📊', label: 'Instagram Carousel', platform: '7-10 slides', color: 'bg-fuchsia-900/30 border-fuchsia-800/40 text-fuchsia-300' },
  { id: 'email_newsletter', icon: '📧', label: 'Email Newsletter', platform: 'Full email', color: 'bg-yellow-900/30 border-yellow-800/40 text-yellow-300' },
  { id: 'whatsapp_message', icon: '💬', label: 'WhatsApp Message', platform: '1,000 chars', color: 'bg-emerald-900/30 border-emerald-800/40 text-emerald-300' },
  { id: 'youtube_script', icon: '🎬', label: 'YouTube Script', platform: 'Full script', color: 'bg-red-900/30 border-red-800/40 text-red-300' },
  { id: 'blog_post', icon: '📝', label: 'Blog Post', platform: 'Full article', color: 'bg-indigo-900/30 border-indigo-800/40 text-indigo-300' },
  { id: 'press_release', icon: '📰', label: 'Press Release', platform: 'Formal PR', color: 'bg-violet-900/30 border-violet-800/40 text-violet-300' },
  { id: 'podcast_intro', icon: '🎙', label: 'Podcast Intro', platform: '60-90s', color: 'bg-amber-900/30 border-amber-800/40 text-amber-300' },
]

const SOURCE_TYPES: { id: SourceType; label: string; icon: string }[] = [
  { id: 'blog_url', label: 'Blog Post URL', icon: '🔗' },
  { id: 'video_url', label: 'Video URL', icon: '🎬' },
  { id: 'podcast', label: 'Podcast', icon: '🎙' },
  { id: 'upload', label: 'Document Upload', icon: '📄' },
  { id: 'text', label: 'Manual Text', icon: '✏️' },
]

const STATUS_COLORS = {
  completed: 'bg-green-900/30 text-green-400',
  running: 'bg-blue-900/30 text-blue-400',
  failed: 'bg-red-900/30 text-red-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}

function safeParse<T = unknown>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RepurposePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RepurposeTab>('repurpose')
  const [sourceType, setSourceType] = useState<SourceType>('text')
  const [sourceInput, setSourceInput] = useState('')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['twitter_thread', 'linkedin_post', 'instagram_caption', 'email_newsletter'])
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  // Sprint 18K: real document upload (PDF / docx / txt → text extraction)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; chars: number; pages?: number; truncated?: boolean } | null>(null)
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([])
  const [generatedArtifactId, setGeneratedArtifactId] = useState<string | null>(null)
  const [editingFormat, setEditingFormat] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<Record<string, string>>({})
  const [autoBriefCmo, setAutoBriefCmo] = useState(false)

  // History
  const [history, setHistory] = useState<RepurposeJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  // CMO Brief
  const [cmoItems, setCmoItems] = useState<CmoBriefItem[]>([])
  const [cmoLoading, setCmoLoading] = useState(false)
  const [cmoError, setCmoError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWorkspaceId(localStorage.getItem('workspaceId'))
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    if (activeTab === 'history') void fetchHistory()
    if (activeTab === 'cmo') void fetchCmoItems()
  }, [activeTab, workspaceId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchHistory() {
    if (!workspaceId) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/artifacts?workspaceId=${workspaceId}&type=repurpose`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = await res.json() as Array<{
        id: string
        title: string
        content_json: { targetFormats?: string[]; repurposed?: unknown[] } | string
        created_at: string
      }>
      const jobs: RepurposeJob[] = data.map((row) => {
        const cj = typeof row.content_json === 'string'
          ? safeParse<{ targetFormats?: string[]; repurposed?: unknown[] }>(row.content_json)
          : row.content_json
        return {
          id: row.id,
          sourceTitle: row.title,
          formatsGenerated: cj?.targetFormats?.length || cj?.repurposed?.length || 0,
          date: relativeDate(row.created_at),
          status: 'completed',
          formats: cj?.targetFormats || [],
        }
      })
      setHistory(jobs)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function fetchCmoItems() {
    if (!workspaceId) return
    setCmoLoading(true)
    setCmoError(null)
    try {
      const res = await fetch(`/api/learning?workspaceId=${workspaceId}&sourcePrefix=repurpose`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = await res.json() as Array<{
        id: string
        note: string
        source_type: string
        created_at: string
      }>
      const items: CmoBriefItem[] = data.map((row) => {
        // source_type format: 'repurpose:<formatId>' or 'repurpose'
        const format = (row.source_type || '').includes(':') ? row.source_type.split(':')[1] : ''
        const fmt = OUTPUT_FORMATS.find(f => f.id === format)
        return {
          id: row.id,
          contentSummary: row.note,
          format: fmt?.label || format || 'Repurposed content',
          date: relativeDate(row.created_at),
        }
      })
      setCmoItems(items)
    } catch (err) {
      setCmoError(err instanceof Error ? err.message : 'Failed to load CMO brief')
    } finally {
      setCmoLoading(false)
    }
  }

  function toggleFormat(id: string) {
    setSelectedFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  // Sprint 18K — Real document upload. POSTs the file as multipart to
  // /api/repurpose/extract which uses pdf-parse / mammoth server-side
  // to pull plain text. We dump the extracted text into the same
  // sourceInput buffer used by the Manual Text source, and switch the
  // source-type so the user can immediately Generate.
  async function handleDocumentUpload(file: File) {
    if (!workspaceId) {
      setUploadError('Sign in first — no workspace selected.')
      return
    }
    setUploading(true)
    setUploadError(null)
    setUploadedFile(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/repurpose/extract?workspaceId=${workspaceId}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json() as {
        ok?: boolean
        error?: string
        text?: string
        filename?: string
        charCount?: number
        pageCount?: number
        truncated?: boolean
      }
      if (!res.ok || !data.ok || !data.text) {
        throw new Error(data.error || `Extract failed (${res.status})`)
      }
      setSourceInput(data.text)
      setUploadedFile({
        name: data.filename || file.name,
        chars: data.charCount || data.text.length,
        pages: data.pageCount,
        truncated: data.truncated,
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  async function generateAll() {
    if (!sourceInput.trim() || selectedFormats.length === 0 || !workspaceId) return
    setGenerating(true)
    setGenerationError(null)
    setOutputs([])
    setGeneratedArtifactId(null)
    try {
      const res = await fetch('/api/agents/content/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          originalContent: sourceInput,
          contentType: sourceType === 'text' ? 'any' :
                       sourceType === 'video_url' ? 'video_script' :
                       sourceType === 'podcast' ? 'video_script' :
                       'blog',
          targetFormats: selectedFormats,
        }),
      })
      const data = await res.json() as {
        repurposed?: Array<{ format: string; content: string; hashtags?: string[]; characterCount: number }>
        artifactId?: string
        error?: string
      }
      if (data.error) {
        setGenerationError(data.error)
        return
      }
      const list: GeneratedOutput[] = (data.repurposed || []).map(item => ({
        formatId: item.format,
        content: item.content,
        hashtags: item.hashtags,
        characterCount: item.characterCount || item.content.length,
        includedInCmo: false,
        approvalState: 'idle' as const,
      }))
      setOutputs(list)
      if (data.artifactId) setGeneratedArtifactId(data.artifactId)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  async function toggleCmoInclude(formatId: string) {
    const output = outputs.find(o => o.formatId === formatId)
    if (!output || !workspaceId) return
    const newIncluded = !output.includedInCmo
    setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, includedInCmo: newIncluded } : o))
    if (newIncluded) {
      // Persist as a learning_note tagged with source=repurpose
      try {
        await fetch('/api/learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            note: output.content.slice(0, 600),
            sourceType: `repurpose:${formatId}`,
            sourceId: generatedArtifactId,
            confidence: 0.85,
          }),
        })
      } catch {
        // Revert UI on error
        setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, includedInCmo: false } : o))
      }
    }
  }

  async function sendToApprovals(formatId: string) {
    const output = outputs.find(o => o.formatId === formatId)
    if (!output || !workspaceId) return
    const fmt = OUTPUT_FORMATS.find(f => f.id === formatId)
    setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, approvalState: 'sending' } : o))
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: `repurposed_${formatId}`,
          title: `${fmt?.label || formatId} — ${output.content.slice(0, 80)}`,
          content_json: {
            format: formatId,
            content: editContent[formatId] ?? output.content,
            hashtags: output.hashtags,
            characterCount: output.characterCount,
            sourceArtifactId: generatedArtifactId,
          },
        }),
      })
      const data = await res.json()
      setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, approvalState: data.ok ? 'sent' : 'error' } : o))
    } catch {
      setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, approvalState: 'error' } : o))
    }
  }

  const tabs: { id: RepurposeTab; label: string; icon: string }[] = [
    { id: 'repurpose', label: 'Repurpose', icon: '♻️' },
    { id: 'history', label: 'History', icon: '🕐' },
    { id: 'cmo', label: 'CMO Brief', icon: '📤' },
  ]

  const cmoIncludedCount = outputs.filter(o => o.includedInCmo).length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm">♻️</div>
            <h1 className="text-2xl font-bold text-white">Content Repurpose Engine</h1>
          </div>
          <p className="text-gray-400 text-sm ml-11">Turn one piece of content into many formats for every platform</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setActiveTab('cmo')}
            className="border border-indigo-700/50 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/40 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          >
            📤 CMO Brief
            {cmoIncludedCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{cmoIncludedCount}</span>
            )}
          </button>
          <button
            onClick={() => { setSourceInput(''); setOutputs([]); setGeneratedArtifactId(null); setActiveTab('repurpose') }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            + New Job
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <div className="flex gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'cmo' && cmoIncludedCount > 0 && (
                <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{cmoIncludedCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Repurpose ────────────────────────────────────────────────────── */}
      {activeTab === 'repurpose' && (
        <div className="space-y-6">
          {/* Input section */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-sm">Source Content</h2>

            <div className="flex gap-2 flex-wrap">
              {SOURCE_TYPES.map(st => (
                <button
                  key={st.id}
                  onClick={() => setSourceType(st.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    sourceType === st.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <span>{st.icon}</span>
                  <span>{st.label}</span>
                </button>
              ))}
            </div>

            {(sourceType === 'blog_url' || sourceType === 'video_url') && (
              <input
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder={sourceType === 'blog_url' ? 'Paste your full blog post text here' : 'Paste your video transcript here'}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            )}

            {sourceType === 'text' && (
              <textarea
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder="Paste your full content here — blog post, email, script, or any text..."
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
              />
            )}

            {sourceType === 'podcast' && (
              <textarea
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder="Paste your podcast transcript here..."
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
              />
            )}

            {sourceType === 'upload' && (
              <div className="space-y-3">
                <label className={`block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${uploading ? 'border-indigo-700 bg-indigo-950/20' : 'border-gray-700 hover:border-indigo-600 hover:bg-gray-800/30'}`}>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    disabled={uploading}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) void handleDocumentUpload(f)
                      // Reset so re-picking the same file fires onChange again
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                  <div className="text-3xl mb-2">{uploading ? '⏳' : '📄'}</div>
                  <p className="text-white font-medium">
                    {uploading ? 'Extracting text…' : 'Drop a PDF, .docx, or .txt — or click to choose'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Max 10 MB. Scanned PDFs need OCR (not yet wired). Extracted text appears in the editor below.
                  </p>
                </label>

                {uploadError && (
                  <div className="p-3 rounded-xl border border-red-800/60 bg-red-950/30 text-red-300 text-xs">
                    {uploadError}
                  </div>
                )}

                {uploadedFile && (
                  <div className="p-3 rounded-xl border border-emerald-800/50 bg-emerald-950/20 text-emerald-300 text-xs">
                    ✓ Extracted <strong>{uploadedFile.chars.toLocaleString()}</strong> chars
                    {uploadedFile.pages ? ` from ${uploadedFile.pages} page${uploadedFile.pages === 1 ? '' : 's'}` : ''} of <strong>{uploadedFile.name}</strong>.
                    {uploadedFile.truncated && ' (Truncated to 250k chars.)'}
                  </div>
                )}

                {/* Show / let user edit the extracted text */}
                {sourceInput && (
                  <textarea
                    value={sourceInput}
                    onChange={e => setSourceInput(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
                    placeholder="Extracted text will appear here. Edit before generating."
                  />
                )}
              </div>
            )}
          </div>

          {/* Output formats */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">Select Output Formats</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedFormats(OUTPUT_FORMATS.map(f => f.id))}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Select All
                </button>
                <span className="text-gray-700">|</span>
                <button
                  onClick={() => setSelectedFormats([])}
                  className="text-xs text-gray-500 hover:text-gray-400"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {OUTPUT_FORMATS.map(fmt => (
                <button
                  key={fmt.id}
                  onClick={() => toggleFormat(fmt.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedFormats.includes(fmt.id)
                      ? fmt.color
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className="text-xl mb-1.5">{fmt.icon}</div>
                  <p className={`text-xs font-medium leading-snug ${selectedFormats.includes(fmt.id) ? '' : 'text-gray-400'}`}>{fmt.label}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{fmt.platform}</p>
                </button>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-3">{selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''} selected</p>
          </div>

          {/* Generate button */}
          <button
            onClick={generateAll}
            disabled={generating || !sourceInput.trim() || selectedFormats.length === 0 || !workspaceId}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
          >
            {generating ? (
              <><SpinnerSm /> Generating {selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''}...</>
            ) : (
              <>🔄 Generate All Selected Formats ({selectedFormats.length})</>
            )}
          </button>

          {!workspaceId && (
            <p className="text-amber-400 text-xs text-center">Open a workspace first</p>
          )}

          {generationError && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 flex items-center justify-between">
              <p className="text-red-300 text-sm">{generationError}</p>
              <button onClick={() => void generateAll()} className="text-red-200 hover:text-white text-xs underline">Retry</button>
            </div>
          )}

          {/* Results */}
          {outputs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-semibold">Generated Outputs ({outputs.length} formats)</h2>
                <button
                  onClick={() => setActiveTab('cmo')}
                  className="text-indigo-400 text-sm hover:text-indigo-300"
                >
                  View CMO Brief →
                </button>
              </div>

              {outputs.map(output => {
                const fmt = OUTPUT_FORMATS.find(f => f.id === output.formatId)
                const isEditing = editingFormat === output.formatId
                return (
                  <div key={output.formatId} className={`bg-gray-900 border rounded-2xl overflow-hidden border-gray-800`}>
                    <div className={`px-5 py-3 flex items-center justify-between border-b border-gray-800`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{fmt?.icon || '📄'}</span>
                        <div>
                          <span className="text-white font-semibold text-sm">{fmt?.label || output.formatId}</span>
                          <span className="text-gray-500 text-xs ml-2">{output.characterCount} chars</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const val = editContent[output.formatId] ?? output.content
                            navigator.clipboard.writeText(val)
                          }}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-500"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            setEditingFormat(isEditing ? null : output.formatId)
                            if (!editContent[output.formatId]) {
                              setEditContent(prev => ({ ...prev, [output.formatId]: output.content }))
                            }
                          }}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-500"
                        >
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">CMO Brief</span>
                          <button
                            onClick={() => void toggleCmoInclude(output.formatId)}
                            className={`relative w-8 h-4 rounded-full transition-colors ${output.includedInCmo ? 'bg-indigo-600' : 'bg-gray-700'}`}
                          >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${output.includedInCmo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      {isEditing ? (
                        <textarea
                          value={editContent[output.formatId] ?? output.content}
                          onChange={e => setEditContent(prev => ({ ...prev, [output.formatId]: e.target.value }))}
                          rows={8}
                          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs px-3 py-3 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed"
                        />
                      ) : (
                        <pre className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
                          {editContent[output.formatId] ?? output.content}
                        </pre>
                      )}
                      {output.hashtags && output.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {output.hashtags.map(h => (
                            <span key={h} className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-300">{h}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="px-5 pb-4 flex gap-2 items-center">
                      <button
                        onClick={() => void sendToApprovals(output.formatId)}
                        disabled={output.approvalState === 'sending' || output.approvalState === 'sent'}
                        className="text-xs border border-indigo-700/40 bg-indigo-900/20 text-indigo-400 hover:bg-indigo-900/40 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {output.approvalState === 'sending' ? 'Sending...' :
                         output.approvalState === 'sent' ? '✓ Sent to Approvals' :
                         output.approvalState === 'error' ? 'Retry — Send to Approvals' :
                         'Send to Approvals'}
                      </button>
                      <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                        📤 In CMO Brief:
                        <span className={`font-medium ${output.includedInCmo ? 'text-indigo-400' : 'text-gray-600'}`}>
                          {output.includedInCmo ? 'Yes' : 'No'}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: History ──────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {historyLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-500 text-sm">
              <SpinnerSm /> Loading history...
            </div>
          )}
          {historyError && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 flex items-center justify-between">
              <p className="text-red-300 text-sm">{historyError}</p>
              <button onClick={() => void fetchHistory()} className="text-red-200 hover:text-white text-xs underline">Retry</button>
            </div>
          )}
          {!historyLoading && !historyError && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-2">🕐</div>
              <p className="text-gray-400 text-sm font-medium">No repurpose jobs yet</p>
              <p className="text-gray-600 text-xs mt-1">Generate your first batch from the Repurpose tab</p>
            </div>
          )}
          {history.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{history.length} repurpose job{history.length !== 1 ? 's' : ''}</p>
            </div>
          )}
          {history.map(job => (
            <div key={job.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
                onClick={() => setExpandedHistory(expandedHistory === job.id ? null : job.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 text-2xl">♻️</div>
                  <div>
                    <p className="text-white font-medium text-sm">{job.sourceTitle}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                      <span className="text-gray-500 text-xs">{job.formatsGenerated} formats</span>
                      <span className="text-gray-600 text-xs">{job.date}</span>
                    </div>
                  </div>
                </div>
                <span className="text-gray-600 text-sm">{expandedHistory === job.id ? '▲' : '▼'}</span>
              </div>
              {expandedHistory === job.id && job.formats.length > 0 && (
                <div className="px-5 pb-4 border-t border-gray-800 pt-4">
                  <p className="text-gray-500 text-xs mb-3">Generated formats</p>
                  <div className="flex flex-wrap gap-2">
                    {job.formats.map(fid => {
                      const fmt = OUTPUT_FORMATS.find(f => f.id === fid)
                      if (!fmt) return <span key={fid} className="text-xs px-3 py-1 rounded-lg border border-gray-700 text-gray-400">{fid}</span>
                      return (
                        <span key={fid} className={`text-xs px-3 py-1 rounded-lg border ${fmt.color}`}>
                          {fmt.icon} {fmt.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: CMO Brief ────────────────────────────────────────────────────── */}
      {activeTab === 'cmo' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">CMO Brief</h2>
              <p className="text-gray-500 text-xs mt-0.5">Items from repurposed content marked for CMO review</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <button
                  onClick={() => setAutoBriefCmo(v => !v)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${autoBriefCmo ? 'bg-indigo-600' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${autoBriefCmo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                Auto-brief CMO
              </label>
              <button
                onClick={() => void fetchCmoItems()}
                className="border border-gray-700 hover:border-gray-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs"
              >
                Refresh
              </button>
            </div>
          </div>

          {cmoLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-500 text-sm">
              <SpinnerSm /> Loading CMO brief...
            </div>
          )}

          {cmoError && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700/50 flex items-center justify-between">
              <p className="text-red-300 text-sm">{cmoError}</p>
              <button onClick={() => void fetchCmoItems()} className="text-red-200 hover:text-white text-xs underline">Retry</button>
            </div>
          )}

          {!cmoLoading && !cmoError && cmoItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-2">📤</div>
              <p className="text-gray-400 text-sm font-medium">No CMO Brief items yet</p>
              <p className="text-gray-600 text-xs mt-1">Toggle &quot;CMO Brief&quot; on any generated output to add it here</p>
            </div>
          )}

          {cmoItems.length > 0 && (
            <div>
              <p className="text-white font-semibold text-sm mb-3">{cmoItems.length} brief item{cmoItems.length !== 1 ? 's' : ''}</p>
              <div className="space-y-3">
                {cmoItems.map(item => <CmoBriefCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CmoBriefCard({ item }: { item: CmoBriefItem }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">{item.format}</span>
        </div>
        <span className="text-gray-600 text-xs">{item.date}</span>
      </div>
      <p className="text-gray-300 text-sm whitespace-pre-wrap line-clamp-4">{item.contentSummary}</p>
    </div>
  )
}

function SpinnerSm() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
