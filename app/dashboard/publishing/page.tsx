'use client'

import { useState, useEffect, useCallback } from 'react'

type PublishMode = 'compose' | 'blog' | 'newsletter' | 'queue'
type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook'
type BlogPlatform = 'wordpress' | 'ghost'

interface Artifact {
  id: string
  title: string
  type: string
  content_json?: Record<string, unknown>
  created_at: string
}

interface ScheduledPost {
  id: string
  platform: string
  content_json: { text?: string }
  scheduled_time: string
  status: string
  artifact_title?: string
}

interface PublishedPost {
  id: string
  platform: string
  title: string | null
  post_id: string | null
  post_url: string | null
  published_at: string
}

interface ConnectedPlatforms {
  twitter: boolean
  linkedin: boolean
  facebook: boolean
  instagram: boolean
  wordpress: boolean
  ghost: boolean
  buffer: boolean
}

interface PlatformResult {
  platform: string
  ok: boolean
  postUrl?: string
  error?: string
}

const PLATFORM_META: Record<string, { icon: string; label: string; limit: number; color: string }> = {
  twitter:   { icon: '🐦', label: 'X / Twitter',  limit: 280,   color: 'text-sky-400' },
  linkedin:  { icon: '💼', label: 'LinkedIn',      limit: 3000,  color: 'text-blue-400' },
  instagram: { icon: '📸', label: 'Instagram',     limit: 2200,  color: 'text-pink-400' },
  facebook:  { icon: '📘', label: 'Facebook',      limit: 63206, color: 'text-indigo-400' },
  wordpress: { icon: '🔵', label: 'WordPress',     limit: 0,     color: 'text-cyan-400' },
  ghost:     { icon: '👻', label: 'Ghost',         limit: 0,     color: 'text-gray-400' },
  buffer:    { icon: '📦', label: 'Buffer',        limit: 0,     color: 'text-orange-400' },
}

const SOCIAL_PLATFORMS: SocialPlatform[] = ['twitter', 'linkedin', 'instagram', 'facebook']

function charLimitColor(length: number, limit: number): string {
  if (!limit) return 'text-gray-500'
  const pct = length / limit
  if (pct > 1) return 'text-red-400'
  if (pct > 0.85) return 'text-yellow-400'
  return 'text-gray-500'
}

function timeAgo(ts: string) {
  const d = Date.now() - new Date(ts).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function PublishingPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [mode, setMode] = useState<PublishMode>('compose')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([])
  const [connections, setConnections] = useState<ConnectedPlatforms>({
    twitter: false, linkedin: false, facebook: false, instagram: false,
    wordpress: false, ghost: false, buffer: false,
  })

  // ── Compose / direct publish state ──────────────────────────────────────────
  const [baseContent, setBaseContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['linkedin'])
  const [adaptedContent, setAdaptedContent] = useState<Record<string, string>>({})
  const [charCounts, setCharCounts] = useState<Record<string, number>>({})
  const [adapting, setAdapting] = useState(false)
  const [adaptContext, setAdaptContext] = useState('')
  const [publishMode, setPublishMode] = useState<'direct' | 'buffer'>('direct')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'pick'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [composeArtifactId, setComposeArtifactId] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishResults, setPublishResults] = useState<PlatformResult[] | null>(null)

  // ── Blog publish state ───────────────────────────────────────────────────────
  const [blogArtifactId, setBlogArtifactId] = useState('')
  const [blogPlatform, setBlogPlatform] = useState<BlogPlatform>('wordpress')
  const [blogStatus, setBlogStatus] = useState<'draft' | 'publish'>('draft')
  const [publishingBlog, setPublishingBlog] = useState(false)
  const [blogResult, setBlogResult] = useState<{ success?: boolean; error?: string; message?: string } | null>(null)

  // ── Newsletter state ─────────────────────────────────────────────────────────
  const [nlArtifactId, setNlArtifactId] = useState('')
  const [nlTag, setNlTag] = useState('')
  const [sendingNl, setSendingNl] = useState(false)
  const [nlResult, setNlResult] = useState<{ success?: boolean; error?: string; message?: string } | null>(null)
  const [nlConfirm, setNlConfirm] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const wid = raw ? (JSON.parse(raw) as { id: string }).id : (localStorage.getItem('workspaceId') || '')
    setWorkspaceId(wid)
  }, [])

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [artRes, schedRes, pubRes, connRes] = await Promise.all([
        fetch(`/api/artifacts?workspaceId=${workspaceId}&limit=30`),
        fetch(`/api/agents/publish/social?workspaceId=${workspaceId}`),
        fetch(`/api/publish/direct?workspaceId=${workspaceId}`),
        fetch(`/api/integrations?workspaceId=${workspaceId}`),
      ])
      if (artRes.ok) {
        const data = await artRes.json()
        setArtifacts(Array.isArray(data) ? data : (data as { artifacts?: Artifact[] }).artifacts || [])
      }
      if (schedRes.ok) setScheduledPosts(await schedRes.json() as ScheduledPost[])
      if (pubRes.ok) setPublishedPosts(await pubRes.json() as PublishedPost[])
      if (connRes.ok) {
        const integrations = await connRes.json() as Array<{ platform: string; status: string }>
        const conn = { twitter: false, linkedin: false, facebook: false, instagram: false, wordpress: false, ghost: false, buffer: false }
        for (const i of integrations) {
          if (i.status === 'active' && i.platform in conn) {
            (conn as Record<string, boolean>)[i.platform] = true
          }
        }
        setConnections(conn)
      }
    } catch { /* ignore */ }
  }, [workspaceId])

  useEffect(() => { loadData() }, [loadData])

  // Pre-fill base content from artifact
  useEffect(() => {
    if (!composeArtifactId) return
    const art = artifacts.find(a => a.id === composeArtifactId)
    if (!art) return
    const cj = art.content_json
    const body = typeof cj === 'object' && cj
      ? (String(cj.body || cj.text || cj.content || art.title || ''))
      : art.title
    setBaseContent(body)
    setAdaptedContent({})
  }, [composeArtifactId, artifacts])

  const togglePlatform = (p: SocialPlatform) =>
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  // ── AI Adapt ─────────────────────────────────────────────────────────────────
  const handleAdapt = async () => {
    if (!baseContent || selectedPlatforms.length === 0) return
    setAdapting(true)
    setAdaptedContent({})
    try {
      const res = await fetch('/api/agents/publish/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content: baseContent, platforms: selectedPlatforms, context: adaptContext }),
      })
      const data = await res.json() as { adapted?: Record<string, string>; charCounts?: Record<string, number> }
      if (data.adapted) setAdaptedContent(data.adapted)
      if (data.charCounts) setCharCounts(data.charCounts)
    } catch { /* ignore */ }
    setAdapting(false)
  }

  // ── Direct Publish ────────────────────────────────────────────────────────────
  const handleDirectPublish = async () => {
    if (!workspaceId || !baseContent || selectedPlatforms.length === 0) return
    setPublishing(true)
    setPublishResults(null)
    try {
      const res = await fetch('/api/publish/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          platforms: selectedPlatforms,
          content: baseContent,
          adaptedContent: Object.keys(adaptedContent).length > 0 ? adaptedContent : undefined,
          artifactId: composeArtifactId || undefined,
        }),
      })
      const data = await res.json() as { results?: PlatformResult[] }
      setPublishResults(data.results || [])
      await loadData()
    } catch { /* ignore */ }
    setPublishing(false)
  }

  // ── Buffer Schedule ───────────────────────────────────────────────────────────
  const handleBufferSchedule = async () => {
    if (!workspaceId || !baseContent || selectedPlatforms.length === 0) return
    setPublishing(true)
    setPublishResults(null)
    try {
      const body: Record<string, unknown> = {
        workspaceId, content: baseContent, platforms: selectedPlatforms,
        ...(scheduleMode === 'pick' && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(composeArtifactId ? { artifactId: composeArtifactId } : {}),
      }
      const res = await fetch('/api/agents/publish/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { scheduled?: boolean; message?: string; error?: string }
      setPublishResults([{
        platform: 'buffer',
        ok: !!data.scheduled,
        postUrl: undefined,
        error: data.error,
      }])
      if (data.scheduled) await loadData()
    } catch { /* ignore */ }
    setPublishing(false)
  }

  // ── Blog publish ─────────────────────────────────────────────────────────────
  const handlePublishBlog = async () => {
    if (!workspaceId || !blogArtifactId) return
    setPublishingBlog(true)
    setBlogResult(null)
    try {
      const res = await fetch('/api/agents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action: 'publish_blog', artifactId: blogArtifactId, options: { platform: blogPlatform, status: blogStatus } }),
      })
      setBlogResult(await res.json())
    } catch (e) { setBlogResult({ error: String(e) }) }
    setPublishingBlog(false)
  }

  // ── Newsletter ────────────────────────────────────────────────────────────────
  const handleSendNewsletter = async () => {
    if (!workspaceId || !nlArtifactId) return
    setSendingNl(true)
    setNlConfirm(false)
    setNlResult(null)
    try {
      const res = await fetch('/api/agents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action: 'publish_newsletter', artifactId: nlArtifactId, options: { recipientTag: nlTag || undefined } }),
      })
      setNlResult(await res.json())
    } catch (e) { setNlResult({ error: String(e) }) }
    setSendingNl(false)
  }

  const blogArtifacts = artifacts.filter(a => ['blog_post', 'article', 'landing_page', 'newsletter'].includes(a.type))
  const nlArtifacts = artifacts.filter(a => ['newsletter', 'email_sequence', 'blog_post'].includes(a.type))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Publishing Hub</h1>
        <p className="text-gray-400 text-sm">Write once, publish everywhere — AI adapts content per platform</p>
      </div>

      {/* Connections bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl text-xs">
        <span className="text-gray-500 font-medium flex-shrink-0">Connected:</span>
        {Object.entries(connections).map(([p, connected]) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-gray-700'}`} />
            <span className={connected ? 'text-gray-300' : 'text-gray-600'}>
              {PLATFORM_META[p]?.icon} {PLATFORM_META[p]?.label || p}
            </span>
          </span>
        ))}
        <a href="/dashboard/connections" className="ml-auto text-indigo-400 hover:text-indigo-300 text-xs">
          Manage connections →
        </a>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {([
          { id: 'compose', label: '📱 Social', desc: 'AI-adapted multi-platform' },
          { id: 'blog', label: '📝 Blog', desc: 'WordPress / Ghost' },
          { id: 'newsletter', label: '📧 Newsletter', desc: 'Via Resend' },
          { id: 'queue', label: '📊 Queue', desc: 'History & scheduled' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setMode(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${mode === tab.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── COMPOSE / SOCIAL TAB ────────────────────────────────────────────────── */}
      {mode === 'compose' && (
        <div className="space-y-5">
          {/* Platform selector */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Publish to</label>
            <div className="flex flex-wrap gap-2">
              {SOCIAL_PLATFORMS.map(p => {
                const meta = PLATFORM_META[p]
                const isConnected = connections[p]
                return (
                  <button key={p} onClick={() => togglePlatform(p)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedPlatforms.includes(p) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'}`}>
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* From artifact */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Import from artifact (optional)</label>
            <select value={composeArtifactId} onChange={e => setComposeArtifactId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
              <option value="">— Start from scratch —</option>
              {artifacts.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>

          {/* Base content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">Base content</label>
              <span className="text-xs text-gray-600">{baseContent.length} chars</span>
            </div>
            <textarea value={baseContent} onChange={e => { setBaseContent(e.target.value); setAdaptedContent({}) }}
              rows={5} placeholder="Write your post here, or import from an artifact above..."
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          {/* AI Adapt */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">🤖 AI Platform Adaptation</p>
              <button onClick={handleAdapt} disabled={adapting || !baseContent || selectedPlatforms.length === 0}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                {adapting ? 'Adapting...' : `Adapt for ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
              </button>
            </div>
            <input value={adaptContext} onChange={e => setAdaptContext(e.target.value)}
              placeholder="Context hint (e.g. 'announcing our new feature', 'celebrating a milestone')"
              className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500" />

            {/* Per-platform preview cards */}
            {selectedPlatforms.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {selectedPlatforms.map(p => {
                  const meta = PLATFORM_META[p]
                  const text = adaptedContent[p] || ''
                  const count = charCounts[p] || text.length
                  const hasAdapted = !!adaptedContent[p]
                  return (
                    <div key={p} className={`rounded-lg border p-3 space-y-2 ${hasAdapted ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-gray-700 bg-gray-800/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.icon} {meta.label}</span>
                        {meta.limit > 0 && (
                          <span className={`text-xs ${charLimitColor(count, meta.limit)}`}>
                            {count}/{meta.limit}
                          </span>
                        )}
                      </div>
                      {hasAdapted ? (
                        <textarea
                          value={adaptedContent[p]}
                          onChange={e => {
                            setAdaptedContent(prev => ({ ...prev, [p]: e.target.value }))
                            setCharCounts(prev => ({ ...prev, [p]: e.target.value.length }))
                          }}
                          rows={4}
                          className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 resize-none" />
                      ) : (
                        <p className="text-gray-600 text-xs italic">Click &quot;Adapt&quot; to generate platform-specific copy</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Publish method toggle */}
          <div className="flex gap-2">
            <button onClick={() => setPublishMode('direct')}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${publishMode === 'direct' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}>
              ⚡ Publish Now (Direct)
            </button>
            <button onClick={() => setPublishMode('buffer')}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${publishMode === 'buffer' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}>
              📦 Schedule via Buffer
            </button>
          </div>

          {publishMode === 'buffer' && (
            <div className="space-y-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex gap-2">
                <button onClick={() => setScheduleMode('now')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${scheduleMode === 'now' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                  ⚡ AI Optimal Time
                </button>
                <button onClick={() => setScheduleMode('pick')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${scheduleMode === 'pick' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                  📅 Pick Time
                </button>
              </div>
              {scheduleMode === 'pick' && (
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  className="px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none" />
              )}
              <input type="url" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                placeholder="Media URL (optional)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none" />
            </div>
          )}

          {/* Publish button */}
          <button
            onClick={publishMode === 'direct' ? handleDirectPublish : handleBufferSchedule}
            disabled={publishing || !baseContent || selectedPlatforms.length === 0}
            className={`w-full py-3 rounded-xl text-white font-medium text-sm transition-colors disabled:opacity-50 ${publishMode === 'direct' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
            {publishing
              ? 'Publishing...'
              : publishMode === 'direct'
              ? `⚡ Publish to ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''} now`
              : `📦 Schedule via Buffer (${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''})`}
          </button>

          {/* Results */}
          {publishResults && (
            <div className="space-y-2">
              {publishResults.map(r => (
                <div key={r.platform} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${r.ok ? 'bg-green-950/30 border-green-700' : 'bg-red-950/30 border-red-800'}`}>
                  <span>{r.ok ? '✅' : '❌'}</span>
                  <span className="text-white capitalize font-medium">{PLATFORM_META[r.platform]?.label || r.platform}</span>
                  {r.ok && r.postUrl && (
                    <a href={r.postUrl} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline text-xs ml-auto">View post →</a>
                  )}
                  {!r.ok && <span className="text-red-400 text-xs ml-auto">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BLOG TAB ─────────────────────────────────────────────────────────────── */}
      {mode === 'blog' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Publish Blog Post</h2>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Select content artifact</label>
            <select value={blogArtifactId} onChange={e => setBlogArtifactId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
              <option value="">— Choose artifact —</option>
              {blogArtifacts.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            {blogArtifacts.length === 0 && <p className="text-gray-600 text-xs mt-1">No blog artifacts yet. Generate content first.</p>}
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Platform</label>
            <div className="flex gap-2">
              {(['wordpress', 'ghost'] as BlogPlatform[]).map(p => (
                <button key={p} onClick={() => setBlogPlatform(p)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${blogPlatform === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}>
                  {PLATFORM_META[p]?.icon} {p}
                  {(p === 'wordpress' ? connections.wordpress : connections.ghost) && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Status</label>
            <div className="flex gap-2">
              {(['draft', 'publish'] as const).map(s => (
                <button key={s} onClick={() => setBlogStatus(s)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${blogStatus === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}>
                  {s === 'draft' ? '📄 Save as Draft' : '🚀 Publish Now'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handlePublishBlog} disabled={publishingBlog || !blogArtifactId}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {publishingBlog ? 'Publishing...' : `Publish to ${blogPlatform}`}
          </button>
          {blogResult && (
            <div className={`p-4 rounded-xl border text-sm ${blogResult.error ? 'bg-red-950/50 border-red-800 text-red-300' : 'bg-green-950/50 border-green-800 text-green-300'}`}>
              {blogResult.error || blogResult.message}
            </div>
          )}
        </div>
      )}

      {/* ── NEWSLETTER TAB ───────────────────────────────────────────────────────── */}
      {mode === 'newsletter' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Send Newsletter</h2>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Select newsletter artifact</label>
            <select value={nlArtifactId} onChange={e => setNlArtifactId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
              <option value="">— Choose artifact —</option>
              {nlArtifacts.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-2">Recipient tag (leave blank for all)</label>
            <input value={nlTag} onChange={e => setNlTag(e.target.value)}
              placeholder="e.g. customers, vip, trial"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none" />
          </div>
          {nlArtifactId && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-sm text-gray-400">
              Will send <strong className="text-white">&ldquo;{nlArtifacts.find(a => a.id === nlArtifactId)?.title}&rdquo;</strong> to{' '}
              {nlTag ? `subscribers tagged "${nlTag}"` : 'all subscribers'} via Resend.
            </div>
          )}
          <button onClick={() => setNlConfirm(true)} disabled={sendingNl || !nlArtifactId}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {sendingNl ? 'Sending...' : '📧 Send Newsletter'}
          </button>
          {nlResult && (
            <div className={`p-4 rounded-xl border text-sm ${nlResult.error ? 'bg-red-950/50 border-red-800 text-red-300' : 'bg-green-950/50 border-green-800 text-green-300'}`}>
              {nlResult.error || nlResult.message}
            </div>
          )}
          {nlConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setNlConfirm(false)} />
              <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full space-y-4">
                <h3 className="text-white font-semibold">Confirm Send</h3>
                <p className="text-gray-400 text-sm">
                  You&apos;re about to send to <strong className="text-white">{nlTag ? `all "${nlTag}" subscribers` : 'all subscribers'}</strong>. This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button onClick={handleSendNewsletter} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">Yes, Send</button>
                  <button onClick={() => setNlConfirm(false)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── QUEUE / HISTORY TAB ──────────────────────────────────────────────────── */}
      {mode === 'queue' && (
        <div className="space-y-6">
          {/* Scheduled */}
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">📅 Scheduled via Buffer ({scheduledPosts.length})</h2>
            {scheduledPosts.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm">No scheduled posts yet</div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Platform', 'Content', 'Scheduled', 'Status'].map(h => (
                        <th key={h} className="text-left text-gray-500 text-xs font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledPosts.map(post => (
                      <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-sm text-white">
                          {PLATFORM_META[post.platform]?.icon || '📱'} {post.platform}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{post.content_json?.text || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{new Date(post.scheduled_time).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${post.status === 'published' ? 'bg-green-500/20 text-green-400' : post.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {post.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Published */}
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">✅ Published ({publishedPosts.length})</h2>
            {publishedPosts.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm">No published posts yet</div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Platform', 'Content', 'Published', 'Link'].map(h => (
                        <th key={h} className="text-left text-gray-500 text-xs font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {publishedPosts.map(post => (
                      <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-sm text-white">
                          {PLATFORM_META[post.platform]?.icon || '🌐'} {PLATFORM_META[post.platform]?.label || post.platform}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{post.title || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(post.published_at)}</td>
                        <td className="px-4 py-3 text-xs">
                          {post.post_url
                            ? <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">View →</a>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
