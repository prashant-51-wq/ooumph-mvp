'use client'

import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type ContentType = 'all' | 'social' | 'email' | 'blog' | 'ad' | 'video' | 'image' | 'repurposed'
type ContentStatus = 'all' | 'draft' | 'pending' | 'approved' | 'published' | 'rejected'
type ContentPlatform = 'all' | 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'tiktok' | 'email'
type ViewMode = 'grid' | 'list' | 'calendar'

interface ContentItem {
  id: string
  type: Exclude<ContentType, 'all'>
  platform: Exclude<ContentPlatform, 'all'>
  preview: string
  status: Exclude<ContentStatus, 'all'>
  score: number | null
  scheduledAt: string | null
  publishedAt: string | null
  agent: string
  campaign: string | null
  tags: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  body: string
  timeAgo: string
}

// ── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_CONTENT: ContentItem[] = [
  { id: 'c1', type: 'social', platform: 'instagram', preview: 'Summer is HERE and so is our biggest sale yet 🔥 Get 40% off all plans through July. Link in bio. #MarketingAutomation #AI #SummerSale', status: 'approved', score: 8.7, scheduledAt: 'Tomorrow 10:00am', publishedAt: null, agent: 'Content Agent', campaign: 'Summer Sale', tags: ['sale', 'seasonal'] },
  { id: 'c2', type: 'email', platform: 'email', preview: 'Subject: You are leaving money on the table [First Name] — Our analysis of 500+ companies shows that brands using AI marketing automation see 3.2x higher ROI within...', status: 'pending', score: null, scheduledAt: 'Wed 9:00am', publishedAt: null, agent: 'Email Agent', campaign: 'Q3 Nurture', tags: ['nurture', 'roi'] },
  { id: 'c3', type: 'blog', platform: 'linkedin', preview: '# The Future of Marketing Automation: 7 Trends Shaping 2026\n\nArtificial intelligence is no longer a buzzword in marketing — it is the infrastructure. Here is what the data says...', status: 'draft', score: null, scheduledAt: null, publishedAt: null, agent: 'Content Agent', campaign: null, tags: ['thought-leadership'] },
  { id: 'c4', type: 'social', platform: 'twitter', preview: 'Hot take: 90% of marketing teams are wasting 6+ hours/week on content that AI could generate in 10 minutes. What would you do with those hours? 👇', status: 'published', score: 9.2, scheduledAt: null, publishedAt: '2 days ago', agent: 'Content Agent', campaign: 'Awareness', tags: ['engagement'] },
  { id: 'c5', type: 'ad', platform: 'facebook', preview: 'Stop scrolling. Your competitors are already using AI to 10x their content output. Ooumph AI — Generate, Schedule, and Publish in minutes. Try free →', status: 'approved', score: 7.9, scheduledAt: 'Fri 2:00pm', publishedAt: null, agent: 'Ad Copy Agent', campaign: 'Performance Max', tags: ['paid', 'conversion'] },
  { id: 'c6', type: 'social', platform: 'linkedin', preview: 'Excited to share that we just helped a B2B SaaS company reduce their content creation time by 78% while increasing engagement by 4.2x. Here is exactly how we did it...', status: 'published', score: 9.6, scheduledAt: null, publishedAt: '1 week ago', agent: 'Content Agent', campaign: 'Case Study', tags: ['case-study', 'social-proof'] },
  { id: 'c7', type: 'video', platform: 'tiktok', preview: 'Script: [Hook 0-3s] "Your marketing team is working 3x harder than they need to..." [Problem 3-10s] Show frustrated marketer drowning in content tasks... [Solution] Reveal Ooumph dashboard...', status: 'draft', score: null, scheduledAt: null, publishedAt: null, agent: 'Video Script Agent', campaign: 'TikTok Growth', tags: ['video', 'tiktok'] },
  { id: 'c8', type: 'image', platform: 'instagram', preview: 'Image Prompt: Minimalist flat-lay of a laptop showing a clean dashboard with colorful charts, surrounded by coffee, a notebook with "Marketing Goals" written on it, and a small succulent plant. Warm afternoon lighting. Brand colors: indigo and white.', status: 'pending', score: null, scheduledAt: null, publishedAt: null, agent: 'Creative Agent', campaign: 'Brand Refresh', tags: ['visual', 'brand'] },
  { id: 'c9', type: 'repurposed', platform: 'twitter', preview: 'Thread: 1/ We analyzed 500 AI marketing campaigns. Here are the 7 counterintuitive lessons that changed how we think about automation... (repurposed from LinkedIn article)', status: 'draft', score: null, scheduledAt: null, publishedAt: null, agent: 'Repurpose Agent', campaign: 'Content Repurposing', tags: ['repurposed', 'thread'] },
  { id: 'c10', type: 'social', platform: 'instagram', preview: 'Monday motivation for every marketer out there: What gets measured gets managed. What gets automated gets scaled 🚀 Drop a 🔥 if you agree!', status: 'rejected', score: 4.1, scheduledAt: null, publishedAt: null, agent: 'Content Agent', campaign: 'Evergreen', tags: ['motivational'] },
  { id: 'c11', type: 'email', platform: 'email', preview: 'Subject: [Action required] Your free trial expires in 3 days — Hi [First Name], Just a quick reminder that your Ooumph free trial ends on Friday. You have created 47 content pieces...', status: 'published', score: 8.4, scheduledAt: null, publishedAt: '3 days ago', agent: 'Email Agent', campaign: 'Trial Conversion', tags: ['conversion', 'trial'] },
  { id: 'c12', type: 'ad', platform: 'linkedin', preview: 'Headline: AI Marketing That Pays For Itself. Body: Join 2,000+ marketing teams using Ooumph to generate ROI-positive content at scale. Start your free trial — no credit card required.', status: 'approved', score: 8.1, scheduledAt: 'Mon 8:00am', publishedAt: null, agent: 'Ad Copy Agent', campaign: 'LinkedIn Lead Gen', tags: ['paid', 'linkedin'] },
]

const MOCK_CHAT: ChatMessage[] = [
  { id: 'ch1', role: 'user', body: 'Generate 5 Instagram posts for our summer sale campaign', timeAgo: '10m ago' },
  { id: 'ch2', role: 'agent', body: 'Done! I created 5 Instagram posts for the summer sale:\n1. "Summer is HERE 🔥 40% off all plans..."\n2. "Your competitors are already automating..."\n3. "Last chance — summer prices end Sunday..."\n4. "Real results from real teams..."\n5. "Join 2,000+ marketers this summer..."\n\nAll 5 added to your content library as drafts. Want me to schedule them spread across the next 2 weeks?', timeAgo: '10m ago' },
  { id: 'ch3', role: 'user', body: 'Repurpose the LinkedIn blog post for Twitter threads', timeAgo: '5m ago' },
  { id: 'ch4', role: 'agent', body: 'Repurposing "The Future of Marketing Automation" for Twitter...\n\nCreated a 7-tweet thread. Added to library as draft. Preview of thread opener:\n\n"Thread: 1/ We analyzed 500 AI marketing campaigns. Here are 7 counterintuitive lessons that changed how we think about automation..."\n\nShall I also create a short-form version for Instagram Reels script?', timeAgo: '4m ago' },
]

// ── Config ─────────────────────────────────────────────────────────────────────
const TYPE_META: Record<Exclude<ContentType, 'all'>, { icon: string; label: string }> = {
  social:     { icon: '📱', label: 'Social Post' },
  email:      { icon: '📧', label: 'Email' },
  blog:       { icon: '✍', label: 'Blog Post' },
  ad:         { icon: '📣', label: 'Ad Copy' },
  video:      { icon: '🎬', label: 'Video Script' },
  image:      { icon: '📸', label: 'Image Prompt' },
  repurposed: { icon: '🔁', label: 'Repurposed' },
}

const PLATFORM_META: Record<Exclude<ContentPlatform, 'all'>, { icon: string; color: string; bg: string }> = {
  instagram: { icon: '📸', color: 'text-pink-400', bg: 'bg-pink-900/30 border-pink-700/50' },
  linkedin:  { icon: '💼', color: 'text-sky-400', bg: 'bg-sky-900/30 border-sky-700/50' },
  twitter:   { icon: '🐦', color: 'text-gray-300', bg: 'bg-gray-700/50 border-gray-600/50' },
  facebook:  { icon: '📘', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700/50' },
  tiktok:    { icon: '🎵', color: 'text-pink-300', bg: 'bg-pink-900/20 border-pink-800/50' },
  email:     { icon: '📧', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/50' },
}

const STATUS_META: Record<Exclude<ContentStatus, 'all'>, { label: string; classes: string }> = {
  draft:     { label: 'Draft',     classes: 'bg-gray-700/50 text-gray-400 border-gray-600/50' },
  pending:   { label: 'Pending',   classes: 'bg-yellow-900/30 text-yellow-400 border-yellow-600/40' },
  approved:  { label: 'Approved',  classes: 'bg-green-900/30 text-green-400 border-green-600/40' },
  published: { label: 'Published', classes: 'bg-indigo-900/40 text-indigo-300 border-indigo-600/40' },
  rejected:  { label: 'Rejected',  classes: 'bg-red-900/30 text-red-400 border-red-600/40' },
}

const CALENDAR_COLORS: Record<string, string> = {
  instagram: 'bg-pink-600', linkedin: 'bg-sky-600', twitter: 'bg-gray-600',
  facebook: 'bg-blue-600', tiktok: 'bg-pink-500', email: 'bg-yellow-600',
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ContentPage() {
  const [typeFilter, setTypeFilter] = useState<ContentType>('all')
  const [statusFilter, setStatusFilter] = useState<ContentStatus>('all')
  const [platformFilter, setPlatformFilter] = useState<ContentPlatform>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [agentPanelOpen, setAgentPanelOpen] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showBriefBuilder, setShowBriefBuilder] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(MOCK_CHAT)
  const [agentTyping, setAgentTyping] = useState(false)
  const [calendarWeek, setCalendarWeek] = useState(0) // 0 = this week
  const [expandedCalDay, setExpandedCalDay] = useState<string | null>(null)
  const [content, setContent] = useState<ContentItem[]>(MOCK_CONTENT)

  // Create modal state
  const [createType, setCreateType] = useState<Exclude<ContentType, 'all'>>('social')
  const [createPlatforms, setCreatePlatforms] = useState<Exclude<ContentPlatform, 'all'>[]>(['instagram'])
  const [createBrief, setCreateBrief] = useState('')
  const [createTone, setCreateTone] = useState<'professional' | 'friendly' | 'bold' | 'educational'>('friendly')
  const [createGenerating, setCreateGenerating] = useState(false)
  const [createGenerated, setCreateGenerated] = useState('')

  // Brief builder state
  const [briefCampaign, setBriefCampaign] = useState('')
  const [briefAudience, setBriefAudience] = useState('')
  const [briefMessage, setBriefMessage] = useState('')
  const [briefPoints, setBriefPoints] = useState(['', ''])
  const [briefCta, setBriefCta] = useState('')
  const [briefGenerating, setBriefGenerating] = useState(false)

  const stats = useMemo(() => ({
    generatedToday: 7,
    pendingApproval: content.filter(c => c.status === 'pending').length,
    publishedThisWeek: content.filter(c => c.status === 'published').length,
    avgEngagement: 8.4,
  }), [content])

  const filtered = useMemo(() => content.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false
    return true
  }), [content, typeFilter, statusFilter, platformFilter])

  // Calendar: 7-day view starting calendarWeek * 7 days from today
  const calDays = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + calendarWeek * 7 + i)
      return {
        date: d,
        label: d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
        key: d.toISOString().slice(0, 10),
        items: content.filter(c => c.scheduledAt && i === Math.floor(Math.random() * 7) && Math.random() > 0.3).slice(0, 3),
      }
    })
  }, [calendarWeek, content])

  // Calendar items deterministically assigned to days
  const calendarMap = useMemo(() => {
    const map: Record<number, ContentItem[]> = {}
    content.filter(c => c.scheduledAt).forEach((c, idx) => {
      const day = idx % 7
      if (!map[day]) map[day] = []
      map[day].push(c)
    })
    return map
  }, [content])

  function handleSendChat() {
    if (!chatInput.trim()) return
    const userMsg: ChatMessage = { id: `ch${Date.now()}`, role: 'user', body: chatInput, timeAgo: 'Just now' }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setAgentTyping(true)
    setTimeout(() => {
      const response: ChatMessage = {
        id: `ch${Date.now() + 1}`, role: 'agent',
        body: chatInput.toLowerCase().includes('repurpose')
          ? 'Repurposing content now... I will create versions optimized for each platform you target. Added 3 new drafts to your library. Want me to schedule them automatically?'
          : chatInput.toLowerCase().includes('instagram')
          ? 'Generated 5 Instagram posts. All added as drafts. Engagement score estimates: avg 8.3/10. Top performer: "Summer sale hook" at 9.1/10.'
          : `Working on it! I will generate that content based on your brand voice and past performance data. Check your library in a moment.`,
        timeAgo: 'Just now',
      }
      setChatMessages(prev => [...prev, response])
      setAgentTyping(false)
    }, 1500)
  }

  function handleGenerateContent() {
    if (!createBrief.trim()) return
    setCreateGenerating(true)
    setTimeout(() => {
      const samples: Record<string, string> = {
        social: `🚀 [Generated ${createTone} social post for ${createPlatforms.join(', ')}]\n\n"${createBrief.slice(0, 50)}... and that is just the beginning.\n\nOur AI-powered platform helps marketing teams like yours generate content 10x faster while maintaining brand consistency.\n\nReady to see the difference? Link in bio 👆\n\n#MarketingAutomation #AI #ContentMarketing"`,
        email: `Subject: ${createBrief.slice(0, 40)}...\n\nHi [First Name],\n\n${createBrief}\n\nHere at Ooumph, we have helped over 2,000 marketing teams achieve results like these. And we think you could too.\n\nWant to see how? I have set aside some time this week for a quick 20-minute demo.\n\n[Book a Demo →]\n\nBest,\nAlex`,
        blog: `# ${createBrief}\n\nIn today's fast-paced marketing landscape, staying ahead requires more than creativity — it requires intelligence.\n\n## The Problem\n\nMost marketing teams spend 60% of their time on repetitive content tasks...\n\n## The Solution\n\nAI-powered marketing automation changes everything. Here is how...`,
        ad: `Headline: ${createBrief.slice(0, 30)}\n\nPrimary Text: Stop spending hours on content that AI can create in minutes. Ooumph AI generates, schedules, and publishes across all your channels — automatically.\n\nCTA: Start Free Trial`,
      }
      setCreateGenerated(samples[createType] || samples.social)
      setCreateGenerating(false)
    }, 2000)
  }

  function handleApproveContent(id: string) {
    setContent(prev => prev.map(c => c.id === id ? { ...c, status: 'approved' } : c))
  }
  function handleRejectContent(id: string) {
    setContent(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' } : c))
  }
  function handleDuplicateContent(id: string) {
    const item = content.find(c => c.id === id)
    if (!item) return
    setContent(prev => [...prev, { ...item, id: `c${Date.now()}`, status: 'draft', score: null, publishedAt: null, scheduledAt: null }])
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-950 overflow-hidden">

      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────────── */}
      <div className={`${sidebarCollapsed ? 'w-12' : 'w-56'} flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col transition-all duration-200`}>
        <div className="flex items-center justify-between px-3 py-4 border-b border-gray-800">
          {!sidebarCollapsed && <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filters</span>}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="text-gray-600 hover:text-gray-300 transition-colors ml-auto"
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto py-2">
            {/* Content type */}
            <div className="px-3 mb-1">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</span>
            </div>
            {([
              ['all', '🗂', 'All Content'],
              ['social', '📱', 'Social Posts'],
              ['email', '📧', 'Email'],
              ['blog', '✍', 'Blog Posts'],
              ['ad', '📣', 'Ad Copy'],
              ['video', '🎬', 'Video Scripts'],
              ['image', '📸', 'Image Prompts'],
              ['repurposed', '🔁', 'Repurposed'],
            ] as [ContentType, string, string][]).map(([t, icon, label]) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${typeFilter === t ? 'bg-indigo-600/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                <span className="text-base">{icon}</span>
                <span className="truncate">{label}</span>
              </button>
            ))}

            {/* Status */}
            <div className="px-3 mt-4 mb-1">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</span>
            </div>
            {(['all', 'draft', 'pending', 'approved', 'published', 'rejected'] as ContentStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors ${statusFilter === s ? 'bg-indigo-600/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}

            {/* Platform */}
            <div className="px-3 mt-4 mb-1">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Platform</span>
            </div>
            {(['all', 'instagram', 'linkedin', 'twitter', 'facebook', 'tiktok', 'email'] as ContentPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors ${platformFilter === p ? 'bg-indigo-600/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                {p === 'all' ? 'All Platforms' : (
                  <><span>{PLATFORM_META[p as Exclude<ContentPlatform, 'all'>]?.icon}</span><span>{p.charAt(0).toUpperCase() + p.slice(1)}</span></>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── MAIN AREA ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-white">Content Hub</h1>
            <p className="text-gray-500 text-xs mt-0.5">AI-generated content across all channels</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="hidden lg:flex items-center gap-4">
              {[
                { label: 'Generated Today', val: stats.generatedToday, color: 'text-indigo-400' },
                { label: 'Pending Approval', val: stats.pendingApproval, color: 'text-yellow-400' },
                { label: 'Published This Week', val: stats.publishedThisWeek, color: 'text-green-400' },
                { label: 'Avg Engagement', val: `${stats.avgEngagement}/10`, color: 'text-purple-400' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <div className={`text-lg font-bold ${stat.color}`}>{stat.val}</div>
                  <div className="text-xs text-gray-600">{stat.label}</div>
                </div>
              ))}
            </div>
            {/* View toggle */}
            <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
              {([['grid', '⊞ Grid'], ['list', '☰ List'], ['calendar', '🗓 Calendar']] as [ViewMode, string][]).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBriefBuilder(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              🗓 Schedule All
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              ✍ Create Content
            </button>
            <button
              onClick={() => setAgentPanelOpen(v => !v)}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors ${agentPanelOpen ? 'bg-purple-600/20 border-purple-500/40 text-purple-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
            >
              🤖 AI Agent
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* ── GRID VIEW ─────────────────────────────────────────── */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(item => {
                  const pm = PLATFORM_META[item.platform]
                  const sm = STATUS_META[item.status]
                  const tm = TYPE_META[item.type]
                  return (
                    <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all group">
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pm.bg} ${pm.color}`}>
                            {pm.icon} {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
                          </span>
                          <span className="text-xs text-gray-600">{tm.icon} {tm.label}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sm.classes}`}>{sm.label}</span>
                      </div>

                      {/* Preview */}
                      <p className="text-gray-300 text-sm leading-relaxed line-clamp-3 mb-3 font-mono text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                        {item.preview}
                      </p>

                      {/* Performance */}
                      {item.score !== null && (
                        <div className={`text-xs mb-2 font-medium ${item.score >= 8 ? 'text-green-400' : item.score >= 6 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {item.score >= 8 ? '↑' : item.score >= 6 ? '→' : '↓'} {item.score}/10 score
                          {item.score >= 8 && <span className="text-gray-500 ml-1">· above average</span>}
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-3">
                        <span>{item.publishedAt ? `Published ${item.publishedAt}` : item.scheduledAt ? `Scheduled: ${item.scheduledAt}` : 'Not scheduled'}</span>
                        <span>{item.agent}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                        <button className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-2 py-1 rounded-lg transition-colors border border-gray-700">Edit</button>
                        <button className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-2 py-1 rounded-lg transition-colors border border-gray-700">Schedule</button>
                        {item.status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveContent(item.id)} className="text-xs bg-green-900/50 hover:bg-green-900 text-green-400 px-2 py-1 rounded-lg transition-colors">Approve</button>
                            <button onClick={() => handleRejectContent(item.id)} className="text-xs bg-red-900/50 hover:bg-red-900 text-red-400 px-2 py-1 rounded-lg transition-colors">Reject</button>
                          </>
                        )}
                        <button onClick={() => handleDuplicateContent(item.id)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-2 py-1 rounded-lg transition-colors border border-gray-700">Duplicate</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── LIST VIEW ─────────────────────────────────────────── */}
            {viewMode === 'list' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Type', 'Platform', 'Preview', 'Status', 'Agent', 'Score', 'Date', 'Actions'].map(h => (
                        <th key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const pm = PLATFORM_META[item.platform]
                      const sm = STATUS_META[item.status]
                      const tm = TYPE_META[item.type]
                      return (
                        <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-400">{tm.icon} {tm.label}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-xs font-medium ${pm.color}`}>{pm.icon} {item.platform}</span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-gray-300 text-xs truncate">{item.preview}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sm.classes}`}>{sm.label}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-500">{item.agent}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {item.score !== null ? (
                              <span className={`text-xs font-bold ${item.score >= 8 ? 'text-green-400' : item.score >= 6 ? 'text-yellow-400' : 'text-red-400'}`}>{item.score}/10</span>
                            ) : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-600">{item.publishedAt || item.scheduledAt || '—'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                              {item.status === 'pending' && <>
                                <span className="text-gray-700">·</span>
                                <button onClick={() => handleApproveContent(item.id)} className="text-xs text-green-400 hover:text-green-300">Approve</button>
                                <span className="text-gray-700">·</span>
                                <button onClick={() => handleRejectContent(item.id)} className="text-xs text-red-400 hover:text-red-300">Reject</button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="py-12 text-center text-gray-600 text-sm">No content matches your filters</div>
                )}
              </div>
            )}

            {/* ── CALENDAR VIEW ─────────────────────────────────────── */}
            {viewMode === 'calendar' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalendarWeek(v => v - 1)} className="text-gray-400 hover:text-white bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg text-sm transition-colors">← Prev Week</button>
                  <span className="text-sm font-semibold text-gray-300">
                    {calendarWeek === 0 ? 'This Week' : calendarWeek === 1 ? 'Next Week' : `Week ${calendarWeek > 0 ? '+' : ''}${calendarWeek}`}
                  </span>
                  <button onClick={() => setCalendarWeek(v => v + 1)} className="text-gray-400 hover:text-white bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg text-sm transition-colors">Next Week →</button>
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {calDays.map((day, i) => {
                    const dayItems = calendarMap[i] || []
                    const isToday = i === 0 && calendarWeek === 0
                    return (
                      <div
                        key={day.key}
                        className={`min-h-32 rounded-xl border p-2 ${isToday ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-800 bg-gray-900 hover:border-gray-700'} cursor-pointer transition-colors`}
                        onClick={() => setExpandedCalDay(expandedCalDay === day.key ? null : day.key)}
                      >
                        <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-indigo-400' : 'text-gray-500'}`}>{day.label}</div>
                        <div className="space-y-1">
                          {dayItems.slice(0, 3).map(item => (
                            <div
                              key={item.id}
                              className={`text-xs px-1.5 py-0.5 rounded text-white truncate ${CALENDAR_COLORS[item.platform] || 'bg-gray-600'}`}
                              title={item.preview}
                            >
                              {PLATFORM_META[item.platform].icon} {item.preview.slice(0, 20)}…
                            </div>
                          ))}
                          {dayItems.length > 3 && <div className="text-xs text-gray-600">+{dayItems.length - 3} more</div>}
                          {dayItems.length === 0 && <div className="text-xs text-gray-800 text-center pt-4">—</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex gap-3 mt-4 flex-wrap">
                  {Object.entries(CALENDAR_COLORS).map(([p, color]) => (
                    <div key={p} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-xs text-gray-500 capitalize">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── AI AGENT PANEL (right, w-72) ──────────────────────── */}
          {agentPanelOpen && (
            <div className="w-72 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">🤖 Content Agent</span>
                  <span className="text-xs bg-green-900/40 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full">Active</span>
                </div>
                <button onClick={() => setAgentPanelOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
              </div>

              {/* Stats */}
              <div className="px-4 py-3 border-b border-gray-800 flex gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-400">{stats.generatedToday}</div>
                  <div className="text-xs text-gray-600">Today</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-400">43K</div>
                  <div className="text-xs text-gray-600">Tokens used</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">{content.length}</div>
                  <div className="text-xs text-gray-600">Total pieces</div>
                </div>
              </div>

              {/* Quick action chips */}
              <div className="px-4 py-3 border-b border-gray-800">
                <div className="flex flex-wrap gap-1.5">
                  {['5 Instagram posts', 'Email sequence', 'Repurpose blog', 'Twitter thread', 'Ad variants'].map(chip => (
                    <button
                      key={chip}
                      onClick={() => setChatInput(`Generate ${chip}`)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white px-2 py-1 rounded-full transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-300 rounded-tl-sm'}`}>
                      {msg.body}
                    </div>
                  </div>
                ))}
                {agentTyping && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 px-3 py-2 rounded-xl rounded-tl-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="px-4 py-3 border-t border-gray-800">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-gray-600"
                    placeholder="Ask the content agent..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendChat() }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                  >
                    ↗
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CREATE CONTENT MODAL ────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
              <h2 className="text-white font-bold text-lg">✍ Create Content</h2>
              <button onClick={() => { setShowCreateModal(false); setCreateGenerated('') }} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Content type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Content Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(TYPE_META) as [Exclude<ContentType, 'all'>, typeof TYPE_META[keyof typeof TYPE_META]][]).map(([t, meta]) => (
                    <button
                      key={t}
                      onClick={() => setCreateType(t)}
                      className={`py-3 rounded-xl border text-center transition-all ${createType === t ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >
                      <div className="text-xl mb-1">{meta.icon}</div>
                      <div className="text-xs">{meta.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform multi-select */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Platform(s)</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(PLATFORM_META) as [Exclude<ContentPlatform, 'all'>, typeof PLATFORM_META[keyof typeof PLATFORM_META]][]).map(([p, meta]) => {
                    const selected = createPlatforms.includes(p)
                    return (
                      <button
                        key={p}
                        onClick={() => setCreatePlatforms(prev => selected ? prev.filter(x => x !== p) : [...prev, p])}
                        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all ${selected ? `${meta.bg} ${meta.color}` : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                      >
                        {meta.icon} {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Brief */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Brief / Prompt</label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm px-4 py-3 rounded-xl outline-none focus:border-indigo-500 resize-none placeholder-gray-600"
                  rows={3}
                  placeholder="Describe what you want to create... e.g. 'Summer sale announcement with 40% off, targeting marketing managers'"
                  value={createBrief}
                  onChange={e => setCreateBrief(e.target.value)}
                />
              </div>

              {/* Tone */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Tone</label>
                <div className="flex gap-2">
                  {(['professional', 'friendly', 'bold', 'educational'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => setCreateTone(tone)}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition-colors border ${createTone === tone ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              {!createGenerated && (
                <button
                  onClick={handleGenerateContent}
                  disabled={!createBrief.trim() || createGenerating}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {createGenerating ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                  ) : '⚡ Generate with AI'}
                </button>
              )}

              {/* Generated result */}
              {createGenerated && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated Content</label>
                    <button onClick={handleGenerateContent} className="text-xs text-indigo-400 hover:text-indigo-300">↻ Regenerate</button>
                  </div>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm px-4 py-3 rounded-xl outline-none focus:border-indigo-500 resize-none font-mono"
                    rows={8}
                    value={createGenerated}
                    onChange={e => setCreateGenerated(e.target.value)}
                  />
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => {
                        const newItem: ContentItem = {
                          id: `c${Date.now()}`, type: createType, platform: createPlatforms[0] || 'instagram',
                          preview: createGenerated, status: 'pending', score: null,
                          scheduledAt: null, publishedAt: null, agent: 'Content Agent',
                          campaign: null, tags: [],
                        }
                        setContent(prev => [newItem, ...prev])
                        setShowCreateModal(false)
                        setCreateGenerated('')
                        setCreateBrief('')
                      }}
                      className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-400 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Send to Approvals
                    </button>
                    <button
                      onClick={() => {
                        const newItem: ContentItem = {
                          id: `c${Date.now()}`, type: createType, platform: createPlatforms[0] || 'instagram',
                          preview: createGenerated, status: 'draft', score: null,
                          scheduledAt: null, publishedAt: null, agent: 'Content Agent',
                          campaign: null, tags: [],
                        }
                        setContent(prev => [newItem, ...prev])
                        setShowCreateModal(false)
                        setCreateGenerated('')
                        setCreateBrief('')
                      }}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    >
                      Save as Draft
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BRIEF BUILDER MODAL ─────────────────────────────────────────────── */}
      {showBriefBuilder && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
              <h2 className="text-white font-bold text-lg">📋 Content Brief Builder</h2>
              <button onClick={() => setShowBriefBuilder(false)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Campaign</label>
                <select className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg outline-none">
                  <option>Select campaign...</option>
                  <option>Summer Sale</option>
                  <option>Q3 Nurture</option>
                  <option>Performance Max</option>
                  <option>Brand Refresh</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Target Audience</label>
                <input className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="e.g. Marketing managers at B2B SaaS companies, 50-500 employees" value={briefAudience} onChange={e => setBriefAudience(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Key Message</label>
                <input className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="The single most important thing to communicate" value={briefMessage} onChange={e => setBriefMessage(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Supporting Points</label>
                {briefPoints.map((point, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-gray-600"
                      placeholder={`Point ${i + 1}`}
                      value={point}
                      onChange={e => setBriefPoints(prev => prev.map((p, j) => j === i ? e.target.value : p))}
                    />
                    {i === briefPoints.length - 1 && (
                      <button onClick={() => setBriefPoints(prev => [...prev, ''])} className="text-xs bg-gray-700 text-gray-400 px-3 rounded-lg hover:bg-gray-600 transition-colors">+</button>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Call to Action</label>
                <input className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-gray-600" placeholder="e.g. Start free trial, Book a demo, Download guide" value={briefCta} onChange={e => setBriefCta(e.target.value)} />
              </div>

              <button
                onClick={() => {
                  setBriefGenerating(true)
                  setTimeout(() => {
                    const newItems: ContentItem[] = [
                      { id: `brief-s-${Date.now()}`, type: 'social', platform: 'instagram', preview: `[Brief: ${briefMessage || 'Generated'} — Instagram] Crafted social post with CTA: ${briefCta || 'Learn more'}`, status: 'pending', score: null, scheduledAt: null, publishedAt: null, agent: 'Brief Builder', campaign: briefCampaign || null, tags: ['brief'] },
                      { id: `brief-e-${Date.now()}`, type: 'email', platform: 'email', preview: `Subject: ${briefMessage || 'Generated'}\n\nDear [Name],\n\n${briefAudience ? `We know ${briefAudience} care about...` : ''}`, status: 'pending', score: null, scheduledAt: null, publishedAt: null, agent: 'Brief Builder', campaign: briefCampaign || null, tags: ['brief'] },
                      { id: `brief-b-${Date.now()}`, type: 'blog', platform: 'linkedin', preview: `# ${briefMessage || 'Generated Article'}\n\nFor ${briefAudience || 'marketing professionals'}: ${briefPoints.filter(Boolean).join(', ')}`, status: 'pending', score: null, scheduledAt: null, publishedAt: null, agent: 'Brief Builder', campaign: briefCampaign || null, tags: ['brief'] },
                    ]
                    setContent(prev => [...newItems, ...prev])
                    setBriefGenerating(false)
                    setShowBriefBuilder(false)
                  }, 2000)
                }}
                disabled={briefGenerating}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {briefGenerating ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating Social + Email + Blog...</>
                ) : '⚡ Generate Multiple Formats'}
              </button>
              <p className="text-center text-xs text-gray-600">Creates Instagram post, email, and blog article simultaneously</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
