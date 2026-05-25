'use client'

import { useState, useEffect, useCallback } from 'react'

type PublishMode = 'blog' | 'social' | 'newsletter' | 'queue'
type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook'
type BlogPlatform = 'wordpress' | 'ghost'
type PostStatus = 'draft' | 'publish'

interface Artifact {
  id: string
  title: string
  type: string
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

interface PublishHistory {
  id: string
  platform: string
  artifact_title?: string
  published_url?: string
  published_at: string
}

interface Connections {
  wordpress: boolean
  ghost: boolean
  bufferConfigured?: boolean
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '🐦',
  linkedin: '💼',
  instagram: '📸',
  facebook: '📘',
  wordpress: '🔵',
  ghost: '👻',
  newsletter: '📰',
}

const MODE_CARDS: Array<{ id: PublishMode; icon: string; label: string; desc: string }> = [
  { id: 'blog', icon: '📝', label: 'Publish Blog', desc: 'WordPress or Ghost' },
  { id: 'social', icon: '📱', label: 'Schedule Social', desc: 'Via Buffer' },
  { id: 'newsletter', icon: '📰', label: 'Publish Newsletter', desc: 'Via Resend' },
  { id: 'queue', icon: '📊', label: 'View Queue', desc: 'Scheduled & published' },
]

export default function PublishingPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [mode, setMode] = useState<PublishMode>('blog')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [history, setHistory] = useState<PublishHistory[]>([])
  const [connections, setConnections] = useState<Connections>({ wordpress: false, ghost: false })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string; message?: string; publishedUrls?: string[] } | null>(null)

  // Blog state
  const [selectedArtifactId, setSelectedArtifactId] = useState('')
  const [blogPlatform, setBlogPlatform] = useState<BlogPlatform>('wordpress')
  const [postStatus, setPostStatus] = useState<PostStatus>('draft')
  const [publishing, setPublishing] = useState(false)

  // Social state
  const [socialContent, setSocialContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['linkedin'])
  const [scheduleMode, setScheduleMode] = useState<'now' | 'pick'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [socialArtifactId, setSocialArtifactId] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // Newsletter state
  const [newsletterArtifactId, setNewsletterArtifactId] = useState('')
  const [recipientTag, setRecipientTag] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [sendingNewsletter, setSendingNewsletter] = useState(false)

  const fetchArtifacts = useCallback(async (wid: string) => {
    const res = await fetch(`/api/artifacts?workspaceId=${wid}&limit=20`)
    if (res.ok) {
      const data = await res.json()
      setArtifacts(Array.isArray(data) ? data : data.artifacts || [])
    }
  }, [])

  const fetchQueue = useCallback(async (wid: string) => {
    const [schedRes, histRes] = await Promise.all([
      fetch(`/api/agents/publish/social?workspaceId=${wid}`),
      fetch(`/api/agents/publish?workspaceId=${wid}`),
    ])
    if (schedRes.ok) setScheduledPosts(await schedRes.json())
    if (histRes.ok) {
      const data = await histRes.json()
      setHistory(data.history || [])
      setConnections({ ...data.connections, bufferConfigured: data.bufferConfigured })
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) {
      fetchArtifacts(wid)
      fetchQueue(wid)
    }
  }, [fetchArtifacts, fetchQueue])

  // Pre-fill social content from selected artifact
  useEffect(() => {
    if (socialArtifactId) {
      const art = artifacts.find(a => a.id === socialArtifactId)
      if (art) setSocialContent(art.title)
    }
  }, [socialArtifactId, artifacts])

  function togglePlatform(p: SocialPlatform) {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  async function handlePublishBlog() {
    if (!workspaceId || !selectedArtifactId) return
    setPublishing(true)
    setResult(null)
    try {
      const res = await fetch('/api/agents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'publish_blog',
          artifactId: selectedArtifactId,
          options: { platform: blogPlatform, status: postStatus },
        }),
      })
      const data = await res.json()
      setResult(data)
      if (data.success) fetchQueue(workspaceId)
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setPublishing(false) }
  }

  async function handleScheduleSocial() {
    if (!workspaceId || !socialContent || selectedPlatforms.length === 0) return
    setScheduling(true)
    setResult(null)
    try {
      const body: Record<string, unknown> = {
        workspaceId,
        content: socialContent,
        platforms: selectedPlatforms,
      }
      if (scheduleMode === 'pick' && scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString()
      if (mediaUrl) body.mediaUrl = mediaUrl
      if (socialArtifactId) body.artifactId = socialArtifactId

      const res = await fetch('/api/agents/publish/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(data)
      if (data.scheduled) {
        fetchQueue(workspaceId)
        setSocialContent('')
      }
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setScheduling(false)
    }
  }

  async function handleSendNewsletter() {
    if (!workspaceId || !newsletterArtifactId) return
    setSendingNewsletter(true)
    setShowConfirm(false)
    setResult(null)
    try {
      const res = await fetch('/api/agents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'publish_newsletter',
          artifactId: newsletterArtifactId,
          options: { recipientTag: recipientTag || undefined },
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setSendingNewsletter(false)
    }
  }

  const blogArtifacts = artifacts.filter(a => ['blog_post', 'article', 'landing_page', 'newsletter'].includes(a.type))
  const newsletterArtifacts = artifacts.filter(a => ['newsletter', 'email_sequence', 'blog_post'].includes(a.type))

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Publishing Hub</h1>
          <p className="text-gray-400 text-sm mt-1">Publish and schedule content across all channels</p>
        </div>
      </div>

      {/* Connection Status Bar */}
      <div className="flex items-center gap-4 mb-6 p-3 bg-gray-900/50 border border-gray-800 rounded-xl text-xs">
        <span className="text-gray-500 font-medium">Connections:</span>
        {[
          { key: 'wordpress', label: 'WordPress', connected: connections.wordpress },
          { key: 'ghost', label: 'Ghost', connected: connections.ghost },
          { key: 'buffer', label: 'Buffer', connected: !!connections.bufferConfigured },
        ].map(({ key, label, connected }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-600'}`} />
            <span className={connected ? 'text-green-400' : 'text-gray-500'}>{label}</span>
          </span>
        ))}
        <span className="text-gray-600 ml-auto">
          Not connected? Add credentials in{' '}
          <a href="/dashboard/settings?tab=api-keys" className="text-indigo-400 hover:text-indigo-300 underline">
            Settings → API Keys
          </a>
        </span>
      </div>

      {/* Mode Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {MODE_CARDS.map(card => (
          <button
            key={card.id}
            onClick={() => { setMode(card.id); setResult(null) }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === card.id
                ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10'
                : 'bg-gray-900 border-gray-800 hover:border-gray-700'
            }`}
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <div className="text-white font-semibold text-sm">{card.label}</div>
            <div className="text-gray-400 text-xs mt-0.5">{card.desc}</div>
          </button>
        ))}
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`mb-6 p-4 rounded-xl border ${
          result.error
            ? 'bg-red-950/50 border-red-800 text-red-300'
            : 'bg-green-950/50 border-green-800 text-green-300'
        }`}>
          <p className="text-sm font-medium">{result.error || result.message}</p>
          {result.publishedUrls && result.publishedUrls.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.publishedUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="block text-xs text-indigo-400 hover:text-indigo-300 underline">
                  {url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Publish Blog Mode ──────────────────────────────────────────────── */}
      {mode === 'blog' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Publish Blog Post</h2>

          {/* Artifact selector */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Select Content Artifact</label>
            <select
              value={selectedArtifactId}
              onChange={e => setSelectedArtifactId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="">— Choose an artifact —</option>
              {blogArtifacts.map(a => (
                <option key={a.id} value={a.id}>{a.title} ({a.type})</option>
              ))}
            </select>
            {blogArtifacts.length === 0 && (
              <p className="text-gray-600 text-xs mt-1">No blog/article artifacts found. Generate content first.</p>
            )}
          </div>

          {/* Platform selector */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Publish Platform</label>
            <div className="flex gap-3">
              {(['wordpress', 'ghost'] as BlogPlatform[]).map(p => (
                <button
                  key={p}
                  onClick={() => setBlogPlatform(p)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    blogPlatform === p
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)}
                  {connections[p as keyof Connections] === true && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Publish status */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Status</label>
            <div className="flex gap-3">
              {(['draft', 'publish'] as PostStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setPostStatus(s)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    postStatus === s
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {s === 'draft' ? '📄 Save as Draft' : '🚀 Publish Now'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handlePublishBlog}
            disabled={publishing || !selectedArtifactId}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {publishing ? '⏳ Publishing...' : `📝 Publish to ${blogPlatform.charAt(0).toUpperCase() + blogPlatform.slice(1)}`}
          </button>
        </div>
      )}

      {/* ── Schedule Social Mode ───────────────────────────────────────────── */}
      {mode === 'social' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Schedule Social Posts</h2>

          {/* Content textarea */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Content</label>
            <textarea
              value={socialContent}
              onChange={e => setSocialContent(e.target.value)}
              rows={4}
              placeholder="Write your social post here..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
            <div className="text-right text-xs text-gray-600 mt-1">{socialContent.length} chars</div>
          </div>

          {/* Platform toggles */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {(['twitter', 'linkedin', 'instagram', 'facebook'] as SocialPlatform[]).map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    selectedPlatforms.includes(p)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {PLATFORM_ICONS[p]}
                  {p === 'twitter' ? 'X/Twitter' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule picker */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Schedule</label>
            <div className="flex gap-3 mb-3">
              {(['now', 'pick'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScheduleMode(s)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    scheduleMode === s
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {s === 'now' ? '⚡ Optimal Time (AI)' : '📅 Pick Time'}
                </button>
              ))}
            </div>
            {scheduleMode === 'pick' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              />
            )}
            {scheduleMode === 'now' && (
              <p className="text-gray-500 text-xs">AI will suggest the optimal posting time for each platform.</p>
            )}
          </div>

          {/* Optional media URL */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Media URL (optional)</label>
            <input
              type="url"
              value={mediaUrl}
              onChange={e => setMediaUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Optional artifact link */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Link to Artifact (optional)</label>
            <select
              value={socialArtifactId}
              onChange={e => setSocialArtifactId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="">— Link to source artifact —</option>
              {artifacts.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleScheduleSocial}
            disabled={scheduling || !socialContent || selectedPlatforms.length === 0}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {scheduling ? '⏳ Scheduling...' : `📱 Schedule to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* ── Publish Newsletter Mode ────────────────────────────────────────── */}
      {mode === 'newsletter' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="text-white font-semibold">Send Newsletter</h2>

          {/* Newsletter artifact selector */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Select Newsletter Artifact</label>
            <select
              value={newsletterArtifactId}
              onChange={e => setNewsletterArtifactId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="">— Choose a newsletter/email artifact —</option>
              {newsletterArtifacts.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          {/* Recipient filter */}
          <div>
            <label className="text-gray-400 text-xs block mb-2">Recipient Filter</label>
            <div className="flex gap-3">
              <button
                onClick={() => setRecipientTag('')}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  !recipientTag
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                All Subscribers
              </button>
              <input
                type="text"
                value={recipientTag}
                onChange={e => setRecipientTag(e.target.value)}
                placeholder="Filter by tag (e.g. customers)"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Preview section */}
          {newsletterArtifactId && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-xs font-medium mb-2">Preview</p>
              <p className="text-white text-sm font-medium">
                {newsletterArtifacts.find(a => a.id === newsletterArtifactId)?.title || ''}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Will send to {recipientTag ? `subscribers tagged "${recipientTag}"` : 'all subscribers'} via Resend.
              </p>
            </div>
          )}

          {/* Send button with confirmation modal */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={sendingNewsletter || !newsletterArtifactId}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {sendingNewsletter ? '⏳ Sending...' : '📨 Send Newsletter'}
          </button>

          {/* Confirmation modal */}
          {showConfirm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-white font-semibold text-lg mb-2">Confirm Send</h3>
                <p className="text-gray-400 text-sm mb-4">
                  You are about to send this newsletter to{' '}
                  <strong className="text-white">{recipientTag ? `all "${recipientTag}" subscribers` : 'all subscribers'}</strong>.
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleSendNewsletter}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors"
                  >
                    Yes, Send Now
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── View Queue Mode ────────────────────────────────────────────────── */}
      {mode === 'queue' && (
        <div className="space-y-6">
          {/* Scheduled posts */}
          <div>
            <h2 className="text-white font-semibold mb-3">Upcoming Scheduled Posts</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {scheduledPosts.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">
                  <p>No scheduled posts yet.</p>
                  <p className="text-gray-600 text-xs mt-1">Schedule social posts in the Social tab.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Platform', 'Content', 'Scheduled', 'Status'].map(h => (
                        <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledPosts.map(post => (
                      <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-white">
                          {PLATFORM_ICONS[post.platform] || '📱'} {post.platform}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">
                          {post.content_json?.text || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(post.scheduled_time).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            post.status === 'published' ? 'text-green-400 bg-green-400/10' :
                            post.status === 'failed' ? 'text-red-400 bg-red-400/10' :
                            'text-amber-400 bg-amber-400/10'
                          }`}>
                            {post.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Publish history */}
          <div>
            <h2 className="text-white font-semibold mb-3">Publishing History</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {history.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">
                  No publishing history yet.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Platform', 'Artifact', 'Published', 'Link'].map(h => (
                        <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-white">
                          {PLATFORM_ICONS[item.platform] || '🌐'} {item.platform}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">
                          {item.artifact_title || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(item.published_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {item.published_url ? (
                            <a href={item.published_url} target="_blank" rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline text-xs">
                              View
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
