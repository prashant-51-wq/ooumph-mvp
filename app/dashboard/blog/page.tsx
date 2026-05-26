'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type BlogTab = 'posts' | 'composer' | 'analytics'
type PostStatus = 'Draft' | 'Scheduled' | 'Published' | 'Failed'

interface BlogPost {
  id: string
  title: string
  status: PostStatus
  wordCount: number
  seoScore: number
  destinations: string[]
  date: string
  views?: number
  readTime?: string
  shares?: number
}

interface PublishDestination {
  id: string
  name: string
  icon: string
  status: 'connected' | 'warning' | 'disconnected'
}

interface DestSettings {
  id: string
  name: string
  fields: { key: string; label: string; type: 'text' | 'password'; placeholder: string }[]
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const DESTINATIONS: PublishDestination[] = [
  { id: 'wordpress', name: 'WordPress', icon: 'WP', status: 'connected' },
  { id: 'ghost', name: 'Ghost', icon: 'Gh', status: 'connected' },
  { id: 'medium', name: 'Medium', icon: 'M', status: 'warning' },
  { id: 'substack', name: 'Substack', icon: 'SS', status: 'disconnected' },
  { id: 'hashnode', name: 'Hashnode', icon: 'HN', status: 'disconnected' },
  { id: 'linkedin', name: 'LinkedIn Articles', icon: 'in', status: 'connected' },
]

const DEST_SETTINGS: DestSettings[] = [
  { id: 'wordpress', name: 'WordPress', fields: [
    { key: 'siteUrl', label: 'Site URL', type: 'text', placeholder: 'https://yourblog.com' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'admin' },
    { key: 'appPassword', label: 'App Password', type: 'password', placeholder: 'xxxx xxxx xxxx xxxx' },
  ]},
  { id: 'ghost', name: 'Ghost', fields: [
    { key: 'apiUrl', label: 'API URL', type: 'text', placeholder: 'https://yourblog.ghost.io' },
    { key: 'adminApiKey', label: 'Admin API Key', type: 'password', placeholder: 'key:secret' },
  ]},
  { id: 'medium', name: 'Medium', fields: [
    { key: 'integrationToken', label: 'Integration Token', type: 'password', placeholder: 'Your Medium token' },
  ]},
  { id: 'substack', name: 'Substack', fields: [
    { key: 'email', label: 'Email', type: 'text', placeholder: 'you@example.com' },
    { key: 'password', label: 'Password', type: 'password', placeholder: 'Your Substack password' },
  ]},
  { id: 'hashnode', name: 'Hashnode', fields: [
    { key: 'apiKey', label: 'Personal Access Token', type: 'password', placeholder: 'Your Hashnode token' },
  ]},
  { id: 'linkedin', name: 'LinkedIn Articles', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', type: 'password', placeholder: 'OAuth token from LinkedIn' },
  ]},
]

const MOCK_POSTS: BlogPost[] = [
  { id: '1', title: '10 AI Marketing Tools That Will Replace Your Agency in 2026', status: 'Published', wordCount: 2847, seoScore: 92, destinations: ['wordpress', 'ghost', 'linkedin'], date: '2026-05-22', views: 4821, readTime: '11 min', shares: 143 },
  { id: '2', title: 'How to Build a Content Moat: The Unfair Advantage', status: 'Published', wordCount: 1923, seoScore: 78, destinations: ['wordpress', 'medium'], date: '2026-05-18', views: 2304, readTime: '8 min', shares: 87 },
  { id: '3', title: 'The CMO\'s Complete Guide to Marketing Automation in 2026', status: 'Scheduled', wordCount: 3200, seoScore: 88, destinations: ['wordpress', 'ghost', 'hashnode', 'linkedin'], date: '2026-05-28', views: 0, readTime: '13 min' },
  { id: '4', title: 'Why Most Brands Fail at Social Media (And How to Fix It)', status: 'Draft', wordCount: 950, seoScore: 45, destinations: ['wordpress'], date: '2026-05-26' },
  { id: '5', title: 'Customer Story: How TechCorp 3X\'d Their Leads with AI', status: 'Failed', wordCount: 1540, seoScore: 71, destinations: ['medium', 'linkedin'], date: '2026-05-24' },
]

const SEO_SCORE_COLOR = (score: number) =>
  score >= 80 ? 'bg-green-900/40 text-green-400' :
  score >= 50 ? 'bg-yellow-900/40 text-yellow-400' :
  'bg-red-900/40 text-red-400'

const STATUS_COLORS: Record<PostStatus, string> = {
  Published: 'bg-green-900/40 text-green-400',
  Scheduled: 'bg-blue-900/40 text-blue-400',
  Draft: 'bg-gray-700 text-gray-400',
  Failed: 'bg-red-900/40 text-red-400',
}

const DEST_STATUS: Record<string, string> = {
  connected: 'text-green-400',
  warning: 'text-yellow-400',
  disconnected: 'text-gray-600',
}

const DEST_ICONS: Record<string, string> = {
  connected: '✅',
  warning: '⚠',
  disconnected: '❌',
}

const AI_TOOLS = [
  'Expand Section', 'Improve Readability', 'Add Examples',
  'Generate Intro', 'Write Conclusion', 'Generate H2s',
]

const FORMAT_TOOLBAR = [
  { label: 'B', title: 'Bold', action: '**text**' },
  { label: 'I', title: 'Italic', action: '_text_' },
  { label: 'H1', title: 'Heading 1', action: '# ' },
  { label: 'H2', title: 'Heading 2', action: '## ' },
  { label: 'H3', title: 'Heading 3', action: '### ' },
  { label: '•', title: 'Bullet list', action: '- ' },
  { label: '1.', title: 'Numbered list', action: '1. ' },
  { label: '"', title: 'Quote', action: '> ' },
  { label: '<>', title: 'Code', action: '`code`' },
  { label: '🔗', title: 'Link', action: '[text](url)' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlogStudioPage() {
  const [activeTab, setActiveTab] = useState<BlogTab>('posts')
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(['wordpress', 'ghost'])
  const [showDestSettings, setShowDestSettings] = useState(false)
  const [editingDest, setEditingDest] = useState<string | null>(null)
  const [showNewPostModal, setShowNewPostModal] = useState(false)

  // Composer state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [focusKeyword, setFocusKeyword] = useState('')
  const [featuredImagePrompt, setFeaturedImagePrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingAi, setGeneratingAi] = useState<string | null>(null)
  const [scheduleTime, setScheduleTime] = useState('')
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
  const [wpCategory, setWpCategory] = useState('General')
  const [publishSuccess, setPublishSuccess] = useState(false)

  // SEO score calculation
  const seoScore = Math.min(100, Math.round(
    (title.length > 20 ? 20 : title.length) +
    (body.length > 500 ? 25 : Math.round(body.length / 20)) +
    (metaTitle.length >= 50 && metaTitle.length <= 60 ? 20 : 5) +
    (metaDescription.length >= 150 && metaDescription.length <= 160 ? 20 : 5) +
    (focusKeyword && body.toLowerCase().includes(focusKeyword.toLowerCase()) ? 15 : 0)
  ))

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const readTime = Math.max(1, Math.round(wordCount / 200))
  const keywordDensity = focusKeyword && body
    ? ((body.toLowerCase().split(focusKeyword.toLowerCase()).length - 1) / wordCount * 100).toFixed(1)
    : '0.0'

  const seoChecks = [
    { label: 'Title contains keyword', pass: focusKeyword ? title.toLowerCase().includes(focusKeyword.toLowerCase()) : false },
    { label: 'Meta description written', pass: metaDescription.length > 20 },
    { label: 'Meta title 50-60 chars', pass: metaTitle.length >= 50 && metaTitle.length <= 60 },
    { label: 'Content 1000+ words', pass: wordCount >= 1000 },
    { label: 'Keyword density 1-3%', pass: parseFloat(keywordDensity) >= 1 && parseFloat(keywordDensity) <= 3 },
  ]

  function toggleDest(id: string) {
    setSelectedDestinations(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  function insertAtCursor(text: string) {
    setBody(prev => prev + '\n' + text)
  }

  async function runAiTool(tool: string) {
    if (!body.trim()) return
    setGeneratingAi(tool)
    await new Promise(r => setTimeout(r, 1500))
    const additions: Record<string, string> = {
      'Expand Section': '\n\nFurthermore, this approach creates compounding benefits over time. When organizations implement these strategies consistently, they often see a 40-60% improvement in key metrics within the first quarter alone. The key is to maintain momentum and continue iterating based on data-driven insights.',
      'Improve Readability': '\n\n**Key takeaway:** The concepts above can be distilled into three simple actions you can take today:\n\n1. Start small and build momentum\n2. Measure what matters most\n3. Iterate based on real user feedback',
      'Add Examples': '\n\n**Real-world example:** Consider Company X, a mid-size SaaS firm that implemented this exact strategy. Within 6 months, they reduced their customer acquisition cost by 35% and doubled their organic traffic — all without increasing their marketing budget.',
      'Generate Intro': 'What if you could achieve 10x better results with half the effort? That\'s not a pipe dream — it\'s the reality for companies that have mastered the strategies in this guide.\n\nIn the next 10 minutes, you\'ll discover exactly how to replicate their success.\n\n',
      'Write Conclusion': '\n\n## Wrapping Up\n\nThe path forward is clear: embrace these strategies, measure consistently, and keep your customer at the center of every decision. The brands winning today are not the ones with the biggest budgets — they\'re the ones with the sharpest focus.\n\nStart with one tactic. Master it. Then stack the next one.\n\n**Ready to get started? Schedule a free strategy call today.**',
      'Generate H2s': '\n\n## Why This Matters More Than You Think\n\n## The Step-by-Step Framework\n\n## Common Mistakes to Avoid\n\n## Real Results: What to Expect\n\n## Getting Started Today',
    }
    setBody(prev => prev + (additions[tool] || `\n\n[AI expanded content for "${tool}"]`))
    setGeneratingAi(null)
  }

  async function handlePublish() {
    if (!title.trim() || !body.trim()) return
    setGenerating(true)
    await new Promise(r => setTimeout(r, 1500))
    setGenerating(false)
    setPublishSuccess(true)
    setTimeout(() => setPublishSuccess(false), 3000)
  }

  const tabs: { id: BlogTab; label: string }[] = [
    { id: 'posts', label: 'Posts' },
    { id: 'composer', label: 'Composer' },
    { id: 'analytics', label: 'Analytics' },
  ]

  const currentDestSettings = DEST_SETTINGS.find(d => d.id === editingDest)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm">✍</div>
            <h1 className="text-2xl font-bold text-white">Blog Studio</h1>
          </div>
          <p className="text-gray-400 text-sm ml-11">Write, optimize, and publish to all your platforms</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Destination status pills */}
          <div className="flex items-center gap-1.5">
            {DESTINATIONS.map(dest => (
              <div
                key={dest.id}
                title={`${dest.name}: ${dest.status}`}
                className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1"
              >
                <span className={`text-xs font-bold ${dest.status === 'connected' ? 'text-white' : dest.status === 'warning' ? 'text-yellow-400' : 'text-gray-600'}`}>
                  {dest.icon}
                </span>
                <span className={`text-xs ${DEST_STATUS[dest.status]}`}>{DEST_ICONS[dest.status]}</span>
              </div>
            ))}
            <button
              onClick={() => setShowDestSettings(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 text-sm transition-colors"
              title="Configure destinations"
            >
              ⚙
            </button>
          </div>
          <button
            onClick={() => { setActiveTab('composer'); setTitle(''); setBody('') }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          >
            ✍ New Post
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
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Posts ────────────────────────────────────────────────────────── */}
      {activeTab === 'posts' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">{MOCK_POSTS.length} posts</p>
            <button
              onClick={() => { setActiveTab('composer') }}
              className="text-indigo-400 text-sm hover:text-indigo-300"
            >
              + Generate New Post
            </button>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 text-xs px-5 py-3 font-medium">Title</th>
                  <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Status</th>
                  <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Words</th>
                  <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">SEO</th>
                  <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Destinations</th>
                  <th className="text-left text-gray-500 text-xs px-4 py-3 font-medium">Date</th>
                  <th className="text-right text-gray-500 text-xs px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_POSTS.map(post => (
                  <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-white font-medium text-sm leading-tight max-w-xs">{post.title}</p>
                      {post.views ? <p className="text-gray-600 text-xs mt-0.5">{post.views.toLocaleString()} views · {post.readTime}</p> : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status]}`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs">{post.wordCount.toLocaleString()}</td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEO_SCORE_COLOR(post.seoScore)}`}>
                        {post.seoScore}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {post.destinations.map(d => {
                          const dest = DESTINATIONS.find(x => x.id === d)
                          return dest ? (
                            <span key={d} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">{dest.icon}</span>
                          ) : null
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-xs">{post.date}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setActiveTab('composer')}
                          className="text-xs px-2 py-1 text-gray-400 hover:text-white rounded hover:bg-gray-700"
                        >
                          Edit
                        </button>
                        <button className="text-xs px-2 py-1 text-gray-400 hover:text-white rounded hover:bg-gray-700">Dup</button>
                        {post.status === 'Published' && (
                          <button className="text-xs px-2 py-1 text-indigo-400 hover:text-indigo-300 rounded hover:bg-gray-700">↻</button>
                        )}
                        <button className="text-xs px-2 py-1 text-red-700 hover:text-red-400 rounded hover:bg-gray-700">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Composer ─────────────────────────────────────────────────────── */}
      {activeTab === 'composer' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Editor column */}
          <div className="col-span-2 space-y-4">
            {/* Title */}
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Post title — make it compelling and keyword-rich"
              className="w-full px-5 py-4 bg-gray-900 border border-gray-800 rounded-2xl text-white text-lg font-semibold placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />

            {/* AI tools */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
              <p className="text-gray-500 text-xs mb-2 font-medium">AI Writing Tools</p>
              <div className="flex flex-wrap gap-2">
                {AI_TOOLS.map(tool => (
                  <button
                    key={tool}
                    onClick={() => runAiTool(tool)}
                    disabled={generatingAi !== null}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-indigo-900/40 hover:text-indigo-300 border border-gray-700 hover:border-indigo-700 text-gray-400 text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {generatingAi === tool ? <><SpinnerSm /> {tool}</> : tool}
                  </button>
                ))}
              </div>
            </div>

            {/* Format toolbar */}
            <div className="bg-gray-900 border border-gray-800 rounded-t-2xl rounded-b-none px-4 py-2 flex gap-1 flex-wrap border-b-0">
              {FORMAT_TOOLBAR.map(btn => (
                <button
                  key={btn.label}
                  onClick={() => insertAtCursor(btn.action)}
                  title={btn.title}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-xs font-bold transition-colors"
                >
                  {btn.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
                <span>{wordCount.toLocaleString()} words</span>
                <span>{readTime} min read</span>
              </div>
            </div>

            {/* Body editor */}
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Start writing your post... or use the AI tools above to generate content."
              rows={20}
              className="w-full px-5 py-4 bg-gray-900 border border-gray-800 rounded-b-2xl rounded-t-none text-gray-200 text-sm placeholder-gray-700 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed font-mono"
            />

            {/* Publishing destinations */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-semibold text-sm">Publishing Destinations</h3>
              <div className="grid grid-cols-3 gap-2">
                {DESTINATIONS.map(dest => (
                  <label
                    key={dest.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedDestinations.includes(dest.id)
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-gray-700 hover:border-gray-600'
                    } ${dest.status === 'disconnected' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDestinations.includes(dest.id)}
                      onChange={() => dest.status !== 'disconnected' && toggleDest(dest.id)}
                      className="accent-indigo-500"
                      disabled={dest.status === 'disconnected'}
                    />
                    <div>
                      <p className={`text-sm font-medium ${selectedDestinations.includes(dest.id) ? 'text-white' : 'text-gray-400'}`}>
                        {dest.name}
                      </p>
                      <p className={`text-xs ${DEST_STATUS[dest.status]}`}>{dest.status}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* WordPress-specific settings */}
              {selectedDestinations.includes('wordpress') && (
                <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                  <p className="text-gray-400 text-xs font-medium">WordPress Settings</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Category</label>
                      <select
                        value={wpCategory}
                        onChange={e => setWpCategory(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none"
                      >
                        <option>General</option>
                        <option>Marketing</option>
                        <option>Tutorials</option>
                        <option>Case Studies</option>
                        <option>News</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Tags</label>
                      <input
                        placeholder="marketing, AI, strategy"
                        className="w-full bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none placeholder-gray-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* LinkedIn-specific settings */}
              {selectedDestinations.includes('linkedin') && (
                <div className="bg-gray-800/50 rounded-xl p-4">
                  <p className="text-gray-400 text-xs font-medium mb-2">LinkedIn Settings</p>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" name="li-type" defaultChecked className="accent-indigo-500" />
                      Article (Long-form)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" name="li-type" className="accent-indigo-500" />
                      Post (Short)
                    </label>
                  </div>
                </div>
              )}

              {/* Featured image */}
              <div>
                <p className="text-gray-400 text-xs font-medium mb-2">Featured Image</p>
                <div className="flex gap-2">
                  <div className="flex-1 border-2 border-dashed border-gray-700 rounded-xl p-3 text-center text-gray-600 text-xs cursor-pointer hover:border-indigo-600 hover:text-indigo-400 transition-colors">
                    Upload image
                  </div>
                  <div className="flex-1 border border-gray-700 rounded-xl p-3 text-center">
                    <input
                      value={featuredImagePrompt}
                      onChange={e => setFeaturedImagePrompt(e.target.value)}
                      placeholder="Or describe an AI image..."
                      className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                    />
                  </div>
                  <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-xl">
                    🤖 Generate
                  </button>
                </div>
              </div>

              {/* Schedule / Publish */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
                <div className="flex rounded-xl border border-gray-700 overflow-hidden">
                  <button
                    onClick={() => setPublishMode('now')}
                    className={`px-4 py-2 text-sm transition-colors ${publishMode === 'now' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                  >
                    Publish Now
                  </button>
                  <button
                    onClick={() => setPublishMode('schedule')}
                    className={`px-4 py-2 text-sm transition-colors ${publishMode === 'schedule' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                  >
                    Schedule
                  </button>
                </div>
                {publishMode === 'schedule' && (
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                )}
                <button
                  onClick={handlePublish}
                  disabled={generating || !title.trim() || !body.trim()}
                  className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                >
                  {generating ? <><SpinnerSm /> Publishing...</> :
                   publishSuccess ? '✅ Published!' :
                   publishMode === 'schedule' ? '📅 Schedule' : '🚀 Publish'}
                </button>
              </div>
            </div>
          </div>

          {/* SEO Panel */}
          <div className="space-y-4">
            {/* SEO Score */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold text-sm">SEO Score</h3>
                <span className={`text-2xl font-bold ${seoScore >= 80 ? 'text-green-400' : seoScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {seoScore}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all ${seoScore >= 80 ? 'bg-green-500' : seoScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${seoScore}%` }}
                />
              </div>
              <div className="space-y-2">
                {seoChecks.map(check => (
                  <div key={check.label} className="flex items-center gap-2">
                    <span className={`text-xs ${check.pass ? 'text-green-400' : 'text-gray-600'}`}>
                      {check.pass ? '✓' : '✕'}
                    </span>
                    <span className={`text-xs ${check.pass ? 'text-gray-300' : 'text-gray-600'}`}>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Meta Title */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-white font-semibold text-sm">SEO Settings</h3>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-400 text-xs">Meta Title</label>
                  <span className={`text-xs ${metaTitle.length >= 50 && metaTitle.length <= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {metaTitle.length}/60
                  </span>
                </div>
                <input
                  value={metaTitle}
                  onChange={e => setMetaTitle(e.target.value)}
                  placeholder="SEO-optimized page title..."
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-gray-400 text-xs">Meta Description</label>
                  <span className={`text-xs ${metaDescription.length >= 150 && metaDescription.length <= 160 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {metaDescription.length}/160
                  </span>
                </div>
                <textarea
                  value={metaDescription}
                  onChange={e => setMetaDescription(e.target.value)}
                  placeholder="Compelling description that drives clicks from search results..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Focus Keyword</label>
                <input
                  value={focusKeyword}
                  onChange={e => setFocusKeyword(e.target.value)}
                  placeholder="Primary keyword to rank for..."
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
                {focusKeyword && body && (
                  <p className="text-gray-500 text-xs mt-1">Keyword density: {keywordDensity}%</p>
                )}
              </div>
            </div>

            {/* Quick stats */}
            {wordCount > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <h3 className="text-gray-400 text-xs font-medium mb-3">Content Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold">{wordCount.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">Words</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold">{readTime} min</p>
                    <p className="text-gray-500 text-xs">Read time</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Analytics ────────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* Best publishing time */}
          <div className="bg-indigo-900/10 border border-indigo-800/30 rounded-2xl p-5 flex items-center gap-4">
            <div className="text-3xl">⏰</div>
            <div>
              <p className="text-white font-semibold">Best publishing time for your audience</p>
              <p className="text-indigo-300 text-sm">Tuesday 9 AM or Thursday 2 PM — 34% higher engagement</p>
            </div>
          </div>

          {/* Stats table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">Post Performance</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Title', 'Views', 'Read Time Avg', 'Shares', 'SEO Score'].map(h => (
                    <th key={h} className="text-left text-gray-500 text-xs px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_POSTS.filter(p => p.status === 'Published').map(post => (
                  <tr key={post.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-white text-xs font-medium max-w-xs truncate">{post.title}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{post.views?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{post.readTime || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{post.shares?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEO_SCORE_COLOR(post.seoScore)}`}>{post.seoScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Traffic sources */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Traffic Sources</h3>
            <div className="space-y-3">
              {[
                { label: 'Organic Search', pct: 58, color: 'bg-green-500' },
                { label: 'Social Media', pct: 23, color: 'bg-indigo-500' },
                { label: 'Direct', pct: 12, color: 'bg-violet-500' },
                { label: 'Referral', pct: 7, color: 'bg-amber-500' },
              ].map(src => (
                <div key={src.label} className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs w-32 flex-shrink-0">{src.label}</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${src.color} rounded-full`} style={{ width: `${src.pct}%` }} />
                  </div>
                  <span className="text-white text-xs font-medium w-8 text-right">{src.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Destination Settings Slide-over */}
      {showDestSettings && (
        <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-96 bg-gray-900 border-l border-gray-800 overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h3 className="text-white font-bold">Publishing Destinations</h3>
              <button onClick={() => { setShowDestSettings(false); setEditingDest(null) }} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              {DESTINATIONS.map(dest => (
                <div key={dest.id} className={`bg-gray-800 border rounded-2xl overflow-hidden ${editingDest === dest.id ? 'border-indigo-500' : 'border-gray-700'}`}>
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-700 rounded-xl flex items-center justify-center text-white font-bold text-sm">{dest.icon}</div>
                      <div>
                        <p className="text-white font-medium text-sm">{dest.name}</p>
                        <p className={`text-xs ${DEST_STATUS[dest.status]}`}>{dest.status}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingDest(editingDest === dest.id ? null : dest.id)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700"
                      >
                        {editingDest === dest.id ? 'Close' : 'Configure'}
                      </button>
                    </div>
                  </div>
                  {editingDest === dest.id && currentDestSettings && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-700">
                      <div className="pt-3 space-y-3">
                        {currentDestSettings.fields.map(field => (
                          <div key={field.key}>
                            <label className="text-gray-400 text-xs mb-1 block">{field.label}</label>
                            <input
                              type={field.type}
                              placeholder={field.placeholder}
                              className="w-full bg-gray-700 border border-gray-600 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-500"
                            />
                          </div>
                        ))}
                        <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-xl font-medium">
                          Test Connection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SpinnerSm() {
  return (
    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
