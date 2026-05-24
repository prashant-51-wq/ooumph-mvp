'use client'

import { useState, useEffect } from 'react'

type ContentType = 'blog' | 'linkedin' | 'tweet' | 'video_script' | 'email' | 'any'

interface RepurposedItem {
  format: string
  content: string
  hashtags?: string[]
  characterCount: number
}

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: 'blog',         label: 'Blog Post' },
  { id: 'linkedin',     label: 'LinkedIn Post' },
  { id: 'tweet',        label: 'Tweet / Thread' },
  { id: 'video_script', label: 'Video Script' },
  { id: 'email',        label: 'Email' },
  { id: 'any',          label: 'Other' },
]

const ALL_FORMATS: { id: string; label: string; icon: string; limit?: number }[] = [
  { id: 'twitter_thread',      label: 'Twitter/X Thread',           icon: '𝕏',  limit: 280 },
  { id: 'linkedin_post',       label: 'LinkedIn Post',              icon: 'in', limit: 3000 },
  { id: 'instagram_caption',   label: 'Instagram Caption',          icon: '📸', limit: 2200 },
  { id: 'instagram_carousel',  label: 'Instagram Carousel Script',  icon: '🎠' },
  { id: 'email_newsletter',    label: 'Email Newsletter',           icon: '📧' },
  { id: 'whatsapp_message',    label: 'WhatsApp Message',           icon: '💬', limit: 1000 },
  { id: 'youtube_script',      label: 'YouTube Script',             icon: '▶️' },
  { id: 'blog_post',           label: 'Blog Post (expanded)',       icon: '📝' },
  { id: 'press_release',       label: 'Press Release',             icon: '📰' },
  { id: 'podcast_intro',       label: 'Podcast Intro',             icon: '🎙️' },
]

function CharCountBadge({ count, limit }: { count: number; limit?: number }) {
  if (!limit) return <span className="text-xs text-gray-500">{count.toLocaleString()} chars</span>
  const over = count > limit
  return (
    <span className={`text-xs font-medium ${over ? 'text-red-400' : 'text-gray-400'}`}>
      {count.toLocaleString()} / {limit.toLocaleString()} chars {over && '⚠️ over limit'}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

export default function RepurposePage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [contentType, setContentType] = useState<ContentType>('blog')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['twitter_thread', 'linkedin_post', 'instagram_caption'])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<RepurposedItem[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
  }, [])

  function toggleFormat(id: string) {
    setSelectedFormats(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  function selectAll() { setSelectedFormats(ALL_FORMATS.map(f => f.id)) }
  function clearAll() { setSelectedFormats([]) }

  async function repurpose() {
    if (!originalContent.trim()) { setError('Paste your original content first'); return }
    if (selectedFormats.length === 0) { setError('Select at least one output format'); return }
    setLoading(true); setError(''); setResults([])
    try {
      const res = await fetch('/api/agents/content/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, originalContent, contentType, targetFormats: selectedFormats }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResults(data.repurposed || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function addToCalendar(item: RepurposedItem) {
    try {
      await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          type: 'save_repurposed',
          format: item.format,
          content: item.content,
          hashtags: item.hashtags,
        }),
      })
      setSaved(prev => ({ ...prev, [item.format]: true }))
    } catch {
      // silent — UI already shows content
    }
  }

  function getFormatMeta(id: string) {
    return ALL_FORMATS.find(f => f.id === id)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">♻️</div>
          <h1 className="text-2xl font-bold text-white">Content Repurposing Engine</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Turn 1 piece of content into 10+</p>
      </div>

      {/* Input section */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="space-y-5">
          {/* Content type selector */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">What type of content are you repurposing?</label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => setContentType(ct.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    contentType === ct.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text area */}
          <div>
            <label className="text-gray-400 text-xs mb-2 block">Paste your original content</label>
            <textarea
              value={originalContent}
              onChange={e => setOriginalContent(e.target.value)}
              placeholder="Paste your blog post, LinkedIn post, video script, email, or any content here..."
              rows={8}
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            />
            <p className="text-gray-600 text-xs mt-1">{originalContent.length.toLocaleString()} characters</p>
          </div>
        </div>
      </div>

      {/* Format selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Select Output Formats</h2>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300">Select All</button>
            <span className="text-gray-700">|</span>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-400">Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {ALL_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => toggleFormat(f.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedFormats.includes(f.id)
                  ? 'border-indigo-500 bg-indigo-900/30'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-lg mb-1">{f.icon}</div>
              <p className={`text-xs font-medium leading-snug ${selectedFormats.includes(f.id) ? 'text-indigo-300' : 'text-gray-400'}`}>
                {f.label}
              </p>
              {f.limit && (
                <p className="text-gray-600 text-xs mt-0.5">{f.limit.toLocaleString()} char limit</p>
              )}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-3">{selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''} selected</p>
      </div>

      {/* Action button */}
      <div className="mb-8">
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={repurpose}
          disabled={loading || !workspaceId}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-3 px-8 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Repurposing across formats...
            </>
          ) : '♻️ Repurpose Now'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-5">
          <h2 className="text-white font-semibold">Repurposed Content ({results.length} formats)</h2>
          {results.map((item) => {
            const meta = getFormatMeta(item.format)
            const isOverLimit = meta?.limit ? item.characterCount > meta.limit : false
            return (
              <div
                key={item.format}
                className={`bg-gray-900 border rounded-xl p-5 ${isOverLimit ? 'border-red-800/50' : 'border-gray-800'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta?.icon || '📄'}</span>
                    <span className="text-white font-semibold text-sm">{meta?.label || item.format}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CharCountBadge count={item.characterCount} limit={meta?.limit} />
                    <CopyButton text={item.content} />
                  </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto mb-3">
                  <pre className="text-gray-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">{item.content}</pre>
                </div>

                {item.hashtags && item.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => addToCalendar(item)}
                  disabled={saved[item.format]}
                  className="text-xs border border-gray-700 hover:border-indigo-600 disabled:opacity-60 text-gray-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {saved[item.format] ? '✓ Added to Calendar' : '+ Add to Content Calendar'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
