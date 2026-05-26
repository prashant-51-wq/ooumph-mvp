'use client'

import { useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'queue' | 'composer' | 'analytics'
type Platform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube'
type PostStatus = 'Scheduled' | 'Published' | 'Failed' | 'Draft'

interface ScheduledPost {
  id: string
  platforms: Platform[]
  content: string
  scheduledTime: string
  status: PostStatus
  hasMedia: boolean
}

interface AnalyticsPost {
  id: string
  content: string
  platform: Platform
  reach: number
  engagement: number
  clicks: number
  date: string
}

interface PlatformConn {
  connected: boolean
  status: 'ok' | 'warning' | 'disconnected'
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<Platform, { label: string; icon: string; charLimit: number; color: string }> = {
  instagram: { label: 'Instagram', icon: '📸', charLimit: 2200, color: 'text-pink-400' },
  facebook: { label: 'Facebook', icon: '📘', charLimit: 63206, color: 'text-blue-400' },
  twitter: { label: 'Twitter / X', icon: '🐦', charLimit: 280, color: 'text-sky-400' },
  linkedin: { label: 'LinkedIn', icon: '💼', charLimit: 3000, color: 'text-indigo-400' },
  tiktok: { label: 'TikTok', icon: '🎵', charLimit: 2200, color: 'text-rose-400' },
  youtube: { label: 'YouTube', icon: '▶', charLimit: 5000, color: 'text-red-400' },
}

const PLATFORM_CONNECTIONS: Record<Platform, PlatformConn> = {
  instagram: { connected: true, status: 'ok' },
  facebook: { connected: true, status: 'ok' },
  twitter: { connected: true, status: 'warning' },
  linkedin: { connected: true, status: 'ok' },
  tiktok: { connected: false, status: 'disconnected' },
  youtube: { connected: false, status: 'disconnected' },
}

const MOCK_QUEUE: ScheduledPost[] = [
  { id: 'q1', platforms: ['instagram', 'facebook'], content: 'Exciting news! We just launched our new AI-powered marketing suite...', scheduledTime: '2026-05-27 09:00', status: 'Scheduled', hasMedia: true },
  { id: 'q2', platforms: ['linkedin'], content: 'We\'re thrilled to announce a major milestone: 10,000 customers served!', scheduledTime: '2026-05-27 14:00', status: 'Scheduled', hasMedia: false },
  { id: 'q3', platforms: ['twitter'], content: 'The future of marketing is AI-driven. Here\'s why... 🧵', scheduledTime: '2026-05-26 16:30', status: 'Published', hasMedia: false },
  { id: 'q4', platforms: ['instagram', 'tiktok'], content: 'Behind the scenes: how our team builds world-class AI...', scheduledTime: '2026-05-25 12:00', status: 'Published', hasMedia: true },
  { id: 'q5', platforms: ['facebook'], content: 'Don\'t miss our upcoming webinar on AI marketing automation!', scheduledTime: '2026-05-28 10:00', status: 'Draft', hasMedia: false },
  { id: 'q6', platforms: ['linkedin', 'twitter'], content: 'New blog post: 5 ways AI is transforming content creation...', scheduledTime: '2026-05-24 09:00', status: 'Failed', hasMedia: false },
]

const MOCK_ANALYTICS: AnalyticsPost[] = [
  { id: 'a1', content: 'Exciting news! We just launched our new AI-powered...', platform: 'instagram', reach: 12400, engagement: 8.4, clicks: 340, date: '2026-05-24' },
  { id: 'a2', content: 'The future of marketing is AI-driven...', platform: 'twitter', reach: 5600, engagement: 5.2, clicks: 142, date: '2026-05-23' },
  { id: 'a3', content: 'We\'re thrilled to announce a major milestone...', platform: 'linkedin', reach: 8900, engagement: 11.1, clicks: 520, date: '2026-05-22' },
  { id: 'a4', content: 'Behind the scenes: how our team builds world-class AI...', platform: 'instagram', reach: 9800, engagement: 9.7, clicks: 280, date: '2026-05-21' },
  { id: 'a5', content: 'New blog post: 5 ways AI is transforming content...', platform: 'facebook', reach: 3200, engagement: 4.1, clicks: 88, date: '2026-05-20' },
]

// Heatmap data: [day][hour] = engagement score 0-5
const HEATMAP_DATA = Array.from({ length: 7 }, (_, d) =>
  Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h > 22) return 0
    const peaks = d < 5 ? [9, 12, 17, 20] : [11, 15, 19]
    const nearPeak = peaks.some(p => Math.abs(h - p) <= 1)
    return nearPeak ? Math.floor(Math.random() * 2 + 3) : Math.floor(Math.random() * 2 + 1)
  })
)
const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEATMAP_COLORS = ['bg-gray-800', 'bg-indigo-900/60', 'bg-indigo-700/60', 'bg-indigo-600/70', 'bg-indigo-500', 'bg-indigo-400']

const CONTENT_IDEAS = [
  'Tuesday post idea: Share a behind-the-scenes of your team',
  'Midweek tip: How AI saves your team 10 hours a week',
  'Friday Feature: Highlight a customer success story',
]

const QUICK_TEMPLATES = [
  { label: 'Product Feature', icon: '🚀', desc: 'Announce a new feature or update' },
  { label: 'Testimonial', icon: '⭐', desc: 'Share a customer success story' },
  { label: 'Promotional', icon: '🎁', desc: 'Limited-time offer or discount' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PostStatus }) {
  const styles: Record<PostStatus, string> = {
    Scheduled: 'bg-blue-900/60 text-blue-400 border-blue-800/50',
    Published: 'bg-emerald-900/60 text-emerald-400 border-emerald-800/50',
    Failed: 'bg-red-900/60 text-red-400 border-red-800/50',
    Draft: 'bg-gray-800 text-gray-400 border-gray-700',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>{status}</span>
}

function PlatformChip({ platform, connected, status }: { platform: Platform; connected: boolean; status: string }) {
  const meta = PLATFORM_META[platform]
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
      connected
        ? status === 'warning' ? 'bg-amber-950/30 border-amber-800/50 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-300'
        : 'bg-gray-900 border-gray-800 text-gray-600'
    }`}>
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        !connected ? 'bg-gray-700' : status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
      }`} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublishingHubPage() {
  const [mainTab, setMainTab] = useState<MainTab>('queue')
  const [showCalendar, setShowCalendar] = useState(false)
  const [showComposer, setShowComposer] = useState(false)

  // Queue state
  const [queueFilter, setQueueFilter] = useState<PostStatus | 'All'>('All')
  const [selectedPosts, setSelectedPosts] = useState<string[]>([])

  // Composer state
  const [compPlatforms, setCompPlatforms] = useState<Platform[]>(['instagram', 'linkedin'])
  const [compContent, setCompContent] = useState('')
  const [firstComment, setFirstComment] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [showUTM, setShowUTM] = useState(false)
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('social')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [aiCaption, setAiCaption] = useState('')
  const [analyzingMedia, setAnalyzingMedia] = useState(false)
  const [captionAccepted, setCaptionAccepted] = useState(false)
  const [altText, setAltText] = useState('')
  const [hashtags] = useState(['#AIMarketing', '#ContentCreation', '#DigitalMarketing', '#MarketingAutomation', '#SocialMedia', '#B2BSaaS', '#GrowthHacking', '#ContentStrategy', '#MarTech', '#InboundMarketing'])
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([])
  const [captionText, setCaptionText] = useState('')
  const [showCaption, setShowCaption] = useState(false)
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [bestTimeShown, setBestTimeShown] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Analytics
  const [analyticsPlatformFilter, setAnalyticsPlatformFilter] = useState<Platform | 'all'>('all')

  const filteredQueue = queueFilter === 'All' ? MOCK_QUEUE : MOCK_QUEUE.filter(p => p.status === queueFilter)
  const filteredAnalytics = analyticsPlatformFilter === 'all' ? MOCK_ANALYTICS : MOCK_ANALYTICS.filter(p => p.platform === analyticsPlatformFilter)

  function togglePlatform(p: Platform) {
    setCompPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function togglePost(id: string) {
    setSelectedPosts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleHashtag(tag: string) {
    setSelectedHashtags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function handleMediaDrop() {
    setAnalyzingMedia(true)
    await new Promise(r => setTimeout(r, 1600))
    setAiCaption('A powerful AI-driven workspace transforming how teams create and distribute marketing content. Streamline your workflow, amplify your reach.')
    setAltText('Team collaborating on marketing strategy using AI tools on a modern dashboard interface')
    setAnalyzingMedia(false)
  }

  async function generateCaptions() {
    setGeneratingCaptions(true)
    await new Promise(r => setTimeout(r, 1200))
    setCaptionText('00:00:01,000 --> 00:00:04,000\nWelcome to the future of AI marketing\n\n00:00:04,500 --> 00:00:08,000\nwhere content creation meets automation\n\n00:00:08,500 --> 00:00:12,000\nPowered by Ooumph AI platform')
    setShowCaption(true)
    setGeneratingCaptions(false)
  }

  async function handlePublish(mode: 'schedule' | 'now' | 'draft') {
    setPublishing(true)
    await new Promise(r => setTimeout(r, 1400))
    setPublishing(false)
    setPublishSuccess(true)
    setTimeout(() => { setPublishSuccess(false); setShowComposer(false) }, 2000)
  }

  const effectiveContent = captionAccepted ? aiCaption : compContent
  const allContent = effectiveContent + (selectedHashtags.length ? '\n\n' + selectedHashtags.join(' ') : '')

  // Calendar view — simplified 7-day
  const calDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date('2026-05-27')
    d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  })

  return (
    <div className="flex h-full bg-gray-950">
      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-sm">
              📡
            </div>
            <h1 className="text-white font-bold text-lg">Publishing Hub</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Platform chips */}
            {(Object.entries(PLATFORM_CONNECTIONS) as [Platform, PlatformConn][]).map(([p, conn]) => (
              <PlatformChip key={p} platform={p} connected={conn.connected} status={conn.status} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCalendar(v => !v)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showCalendar ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
            >
              🗓 Calendar
            </button>
            <button
              onClick={() => { setShowComposer(true); setMainTab('composer') }}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              + New Post
            </button>
          </div>
        </div>

        {/* Calendar view */}
        {showCalendar && (
          <div className="mx-6 mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex-shrink-0">
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const posts = MOCK_QUEUE.filter((_, j) => j % 7 === i)
                return (
                  <div key={day} className="border-r border-gray-800 last:border-r-0 p-3 min-h-[120px]">
                    <p className="text-gray-500 text-xs mb-2">{day}</p>
                    <div className="space-y-1">
                      {posts.map(p => (
                        <div key={p.id} className={`px-1.5 py-1 rounded text-xs truncate ${p.status === 'Published' ? 'bg-emerald-900/40 text-emerald-400' : p.status === 'Scheduled' ? 'bg-indigo-900/40 text-indigo-400' : 'bg-gray-800 text-gray-500'}`}>
                          {p.platforms.map(pl => PLATFORM_META[pl].icon).join('')} {p.content.slice(0, 20)}...
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6 flex-shrink-0">
          {(['queue', 'composer', 'analytics'] as MainTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${mainTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {tab === 'queue' ? 'Queue' : tab === 'composer' ? 'Composer' : 'Analytics'}
            </button>
          ))}
        </div>

        {/* ── QUEUE TAB ───────────────────────────────────────────────────────── */}
        {mainTab === 'queue' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Filters + bulk actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2 flex-wrap">
                {(['All', 'Scheduled', 'Published', 'Failed', 'Draft'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setQueueFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${queueFilter === f ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {selectedPosts.length > 0 && (
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                    Publish Now ({selectedPosts.length})
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                    Reschedule
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 transition-colors">
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Post list */}
            <div className="space-y-2">
              {filteredQueue.map(post => (
                <div
                  key={post.id}
                  className={`flex items-center gap-4 p-4 bg-gray-900 border rounded-xl transition-all hover:border-gray-700 ${selectedPosts.includes(post.id) ? 'border-indigo-600/50' : 'border-gray-800'}`}
                >
                  {/* Drag handle */}
                  <div className="text-gray-700 cursor-grab text-lg flex-shrink-0">⋮⋮</div>

                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post.id)}
                    onChange={() => togglePost(post.id)}
                    className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0"
                  />

                  {/* Platform icons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {post.platforms.map(p => (
                      <span key={p} className="text-base" title={PLATFORM_META[p].label}>{PLATFORM_META[p].icon}</span>
                    ))}
                  </div>

                  {/* Media thumbnail */}
                  {post.hasMedia && (
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 flex-shrink-0 text-lg">
                      🖼
                    </div>
                  )}

                  {/* Content */}
                  <p className="flex-1 text-gray-300 text-sm truncate min-w-0">{post.content}</p>

                  {/* Time */}
                  <span className="text-gray-500 text-xs flex-shrink-0 hidden md:block">{post.scheduledTime}</span>

                  {/* Status */}
                  <StatusBadge status={post.status} />

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">Edit</button>
                    <button className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">...</button>
                  </div>
                </div>
              ))}
              {filteredQueue.length === 0 && (
                <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-2xl">
                  <div className="text-5xl mb-3">📅</div>
                  <h3 className="text-white font-semibold text-base mb-1">
                    {queueFilter === 'All' ? 'No scheduled posts' : `No ${queueFilter.toLowerCase()} posts`}
                  </h3>
                  <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                    {queueFilter === 'All'
                      ? 'Your publishing queue is empty. Compose your first post and schedule it across all your connected channels.'
                      : 'No posts match this filter. Try a different status above.'}
                  </p>
                  {queueFilter === 'All' && (
                    <button
                      onClick={() => setMainTab('composer')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
                    >
                      Compose your first post →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPOSER TAB ────────────────────────────────────────────────────── */}
        {mainTab === 'composer' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {publishSuccess && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 text-sm flex items-center gap-2">
                <span>✓</span> Post submitted successfully!
              </div>
            )}

            {/* Platform multi-select */}
            <div>
              <label className="text-gray-400 text-xs block mb-2">Publish to</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PLATFORM_META) as Platform[]).map(p => {
                  const meta = PLATFORM_META[p]
                  const selected = compPlatforms.includes(p)
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${selected ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'}`}
                    >
                      {meta.icon} {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Content textarea with char counters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-xs">Content</label>
                <div className="flex gap-3">
                  {compPlatforms.map(p => {
                    const len = allContent.length
                    const limit = PLATFORM_META[p].charLimit
                    const over = len > limit
                    return (
                      <span key={p} className={`text-xs ${over ? 'text-red-400' : len > limit * 0.85 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {PLATFORM_META[p].icon} {len}/{limit > 0 ? limit : '∞'}
                      </span>
                    )
                  })}
                </div>
              </div>
              <textarea
                value={captionAccepted ? aiCaption : compContent}
                onChange={e => { captionAccepted ? setAiCaption(e.target.value) : setCompContent(e.target.value) }}
                rows={5}
                placeholder="Write your post here..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Hashtag suggestions */}
            <div>
              <label className="text-gray-400 text-xs block mb-2">Hashtag Suggestions</label>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleHashtag(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${selectedHashtags.includes(tag) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* AI-Assisted Upload */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
              <h3 className="text-white text-sm font-semibold">AI-Assisted Media</h3>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleMediaDrop() }}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-700 hover:border-indigo-600 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaDrop} />
                <div className="text-3xl mb-2">🖼</div>
                {analyzingMedia ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI analyzing media...
                  </div>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm">Drop images or videos here</p>
                    <p className="text-gray-600 text-xs mt-1">AI will auto-generate captions and alt text</p>
                  </>
                )}
              </div>

              {aiCaption && !captionAccepted && (
                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 space-y-2">
                  <p className="text-indigo-400 text-xs font-medium">AI Caption Suggestion</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{aiCaption}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCaptionAccepted(true)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                    >
                      Use AI Caption
                    </button>
                    <button
                      onClick={() => setAiCaption('')}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {altText && (
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Alt Text (auto-generated)</label>
                  <input
                    value={altText}
                    onChange={e => setAltText(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Auto-caption for video */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-white text-sm font-semibold">Video Auto-Captions</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={generateCaptions}
                  disabled={generatingCaptions}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {generatingCaptions ? 'Generating...' : 'Generate Captions'}
                </button>
                <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                  <option>Portuguese</option>
                </select>
                {showCaption && (
                  <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors">
                    Download SRT
                  </button>
                )}
              </div>
              {showCaption && captionText && (
                <textarea
                  readOnly
                  value={captionText}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-xs font-mono resize-none focus:outline-none"
                />
              )}
            </div>

            {/* Schedule */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-white text-sm font-semibold">Schedule</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => { setScheduleDate('2026-05-27T17:00'); setBestTimeShown(true) }}
                  className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-indigo-600/30 border border-gray-700 hover:border-indigo-700 text-gray-400 hover:text-indigo-300 text-xs transition-colors"
                >
                  Best Time
                </button>
                {bestTimeShown && (
                  <span className="text-indigo-400 text-xs">AI recommends Tue 5:00 PM (highest engagement for your audience)</span>
                )}
              </div>
            </div>

            {/* First comment */}
            <div>
              <label className="text-gray-400 text-xs block mb-1.5">First Comment (Instagram hashtag stacking)</label>
              <input
                value={firstComment}
                onChange={e => setFirstComment(e.target.value)}
                placeholder="#marketing #ai #contentcreation ..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* UTM */}
            <div>
              <button
                onClick={() => setShowUTM(v => !v)}
                className="flex items-center gap-2 text-gray-400 hover:text-white text-xs transition-colors"
              >
                <span>{showUTM ? '▼' : '▶'}</span>
                UTM Parameters
              </button>
              {showUTM && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Source', value: utmSource, setter: setUtmSource, placeholder: 'instagram' },
                    { label: 'Medium', value: utmMedium, setter: setUtmMedium, placeholder: 'social' },
                    { label: 'Campaign', value: utmCampaign, setter: setUtmCampaign, placeholder: 'q2-launch' },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label}>
                      <label className="text-gray-500 text-xs block mb-1">{label}</label>
                      <input
                        value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder={placeholder}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handlePublish('now')}
                disabled={publishing || (!compContent && !captionAccepted)}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {publishing ? 'Publishing...' : 'Publish Now'}
              </button>
              <button
                onClick={() => handlePublish('schedule')}
                disabled={publishing || !scheduleDate}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors border border-gray-700"
              >
                Schedule
              </button>
              <button
                onClick={() => handlePublish('draft')}
                className="px-5 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 font-medium text-sm transition-colors border border-gray-800"
              >
                Save Draft
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ───────────────────────────────────────────────────── */}
        {mainTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Platform filter */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAnalyticsPlatformFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${analyticsPlatformFilter === 'all' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
              >
                All Platforms
              </button>
              {(Object.keys(PLATFORM_META) as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => setAnalyticsPlatformFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${analyticsPlatformFilter === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {PLATFORM_META[p].icon} {PLATFORM_META[p].label}
                </button>
              ))}
            </div>

            {/* Performance table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Content', 'Platform', 'Reach', 'Engagement', 'Clicks', 'Date'].map(h => (
                      <th key={h} className="text-left text-gray-500 text-xs font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAnalytics.map(post => (
                    <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-300 text-xs max-w-xs truncate">{post.content}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={PLATFORM_META[post.platform].color}>
                          {PLATFORM_META[post.platform].icon} {PLATFORM_META[post.platform].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white text-sm font-medium">{post.reach.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-medium ${post.engagement > 8 ? 'text-emerald-400' : post.engagement > 5 ? 'text-amber-400' : 'text-gray-400'}`}>
                          {post.engagement}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{post.clicks}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{post.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Engagement heatmap */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white text-sm font-semibold mb-4">Best Posting Times Heatmap</h3>
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  {/* Hour labels */}
                  <div className="flex mb-1">
                    <div className="w-10 flex-shrink-0" />
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div key={h} className="flex-1 text-center text-gray-700 text-xs">
                        {h % 6 === 0 ? `${h}h` : ''}
                      </div>
                    ))}
                  </div>
                  {HEATMAP_DATA.map((row, d) => (
                    <div key={d} className="flex items-center gap-0.5 mb-0.5">
                      <span className="w-10 text-gray-600 text-xs flex-shrink-0">{HEATMAP_DAYS[d]}</span>
                      {row.map((val, h) => (
                        <div
                          key={h}
                          className={`flex-1 h-5 rounded-sm ${HEATMAP_COLORS[val]} transition-colors`}
                          title={`${HEATMAP_DAYS[d]} ${h}:00 — Score: ${val}`}
                        />
                      ))}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-gray-600 text-xs">Low</span>
                    {HEATMAP_COLORS.map((c, i) => <div key={i} className={`w-4 h-4 rounded-sm ${c}`} />)}
                    <span className="text-gray-600 text-xs">High</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Platform comparison */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white text-sm font-semibold mb-4">Platform Comparison — Avg. Engagement</h3>
              <div className="space-y-3">
                {[
                  { platform: 'instagram', value: 9.1 },
                  { platform: 'linkedin', value: 11.1 },
                  { platform: 'twitter', value: 5.2 },
                  { platform: 'facebook', value: 4.1 },
                ].map(({ platform, value }) => {
                  const meta = PLATFORM_META[platform as Platform]
                  return (
                    <div key={platform} className="flex items-center gap-3">
                      <span className={`text-xs w-28 flex-shrink-0 ${meta.color}`}>{meta.icon} {meta.label}</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(value / 15) * 100}%` }} />
                      </div>
                      <span className="text-white text-xs w-12 text-right font-medium">{value}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-800 overflow-y-auto">
        <div className="p-4 space-y-5">

          {/* Connected platforms */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Connections</h3>
            <div className="space-y-2">
              {(Object.entries(PLATFORM_CONNECTIONS) as [Platform, PlatformConn][]).map(([p, conn]) => {
                const meta = PLATFORM_META[p]
                return (
                  <div key={p} className="flex items-center gap-2 p-2 rounded-lg bg-gray-900 border border-gray-800">
                    <span className="text-base flex-shrink-0">{meta.icon}</span>
                    <span className="text-gray-300 text-xs flex-1">{meta.label}</span>
                    {conn.connected ? (
                      conn.status === 'warning' ? (
                        <button className="text-amber-400 hover:text-amber-300 text-xs transition-colors">Reconnect</button>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )
                    ) : (
                      <button className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">Connect</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Upcoming schedule */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Up Next</h3>
            <div className="space-y-2">
              {MOCK_QUEUE.filter(p => p.status === 'Scheduled').slice(0, 5).map(post => (
                <div key={post.id} className="p-2.5 rounded-lg bg-gray-900 border border-gray-800 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {post.platforms.map(p => (
                      <span key={p} className="text-sm">{PLATFORM_META[p].icon}</span>
                    ))}
                    <StatusBadge status={post.status} />
                  </div>
                  <p className="text-gray-400 text-xs truncate">{post.content}</p>
                  <p className="text-gray-600 text-xs">{post.scheduledTime}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Content Ideas */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">AI Content Ideas</h3>
            <div className="space-y-2">
              {CONTENT_IDEAS.map((idea, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-800/30">
                  <span className="text-indigo-400 text-xs mt-0.5">💡</span>
                  <p className="text-gray-400 text-xs leading-relaxed">{idea}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick publish templates */}
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">Quick Templates</h3>
            <div className="space-y-2">
              {QUICK_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.label}
                  onClick={() => setMainTab('composer')}
                  className="w-full flex items-start gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 text-left transition-colors"
                >
                  <span className="text-lg flex-shrink-0">{tmpl.icon}</span>
                  <div>
                    <p className="text-white text-xs font-medium">{tmpl.label}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{tmpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
