'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentType = 'blog' | 'newsletter' | 'case_study' | 'script'

interface BlogPost {
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  excerpt: string
  readTime: string
  outline: string[]
  content: string
  keywords: string[]
  internalLinkSuggestions: string[]
  callToAction: string
  socialCaption: string
  wordCount: number
}

interface NewsletterSection {
  title: string
  content: string
  type: 'story' | 'tips' | 'news' | 'spotlight' | 'cta'
}

interface Newsletter {
  subject: string
  previewText: string
  headline: string
  intro: string
  sections: NewsletterSection[]
  featuredInsight: string
  cta: { text: string; buttonLabel: string; url?: string }
  footer: string
  estimatedReadTime: string
}

interface CaseStudy {
  headline: string
  subheadline: string
  summary: string
  clientOverview: string
  challengeSection: string
  solutionSection: string
  resultsSection: string
  keyMetrics: { label: string; value: string; improvement: string }[]
  testimonialBlock: string
  lessonsLearned: string[]
  cta: string
  seoTitle: string
  metaDescription: string
  fullHtml: string
}

interface ContentScript {
  title: string
  platform: string
  estimatedDuration: string
  hook: string
  intro: string
  mainContent: {
    timestamp: string
    section: string
    script: string
    broll?: string
    onscreen?: string
  }[]
  cta: string
  outro: string
  description: string
  hashtags: string[]
  thumbnailIdeas: string[]
  chaptersTimestamps?: { time: string; title: string }[]
}

interface SavedArtifact {
  id: string
  title: string
  content_json: BlogPost | Newsletter | CaseStudy | ContentScript
  created_at: string
  artifactType?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { id: ContentType; icon: string; label: string; description: string }[] = [
  { id: 'blog',       icon: '📝', label: 'Blog Post',    description: 'SEO-optimized article' },
  { id: 'newsletter', icon: '📧', label: 'Newsletter',   description: 'Email edition' },
  { id: 'case_study', icon: '📊', label: 'Case Study',   description: 'Customer success story' },
  { id: 'script',     icon: '🎬', label: 'Script',       description: 'Video / Podcast / Ad' },
]

const NEWSLETTER_SECTION_OPTIONS = [
  'Industry News',
  'Tips & Tricks',
  'Company Update',
  'Featured Story',
  'Product Spotlight',
]

const SECTION_TYPE_COLORS: Record<string, string> = {
  story:    'bg-purple-900/30 text-purple-300 border-purple-800/40',
  tips:     'bg-green-900/30 text-green-300 border-green-800/40',
  news:     'bg-blue-900/30 text-blue-300 border-blue-800/40',
  spotlight:'bg-yellow-900/30 text-yellow-300 border-yellow-800/40',
  cta:      'bg-indigo-900/30 text-indigo-300 border-indigo-800/40',
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube:       'YouTube',
  instagram_reel:'Instagram Reel',
  tiktok:        'TikTok',
  podcast:       'Podcast',
  webinar:       'Webinar',
  ad:            'Video Ad',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlogPage() {
  const [workspaceId, setWorkspaceId]   = useState('')
  const [activeType, setActiveType]     = useState<ContentType>('blog')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  // Blog state
  const [blogTopic, setBlogTopic]           = useState('')
  const [blogKeywords, setBlogKeywords]     = useState('')
  const [blogWordCount, setBlogWordCount]   = useState(1500)
  const [blogStyle, setBlogStyle]           = useState<'educational' | 'thought_leadership' | 'how_to' | 'listicle' | 'news_analysis'>('educational')
  const [blogResult, setBlogResult]         = useState<BlogPost | null>(null)

  // Newsletter state
  const [nlTheme, setNlTheme]               = useState('')
  const [nlSections, setNlSections]         = useState<string[]>([])
  const [nlEdition, setNlEdition]           = useState('')
  const [nlTone, setNlTone]                 = useState<'professional' | 'casual' | 'exciting'>('professional')
  const [nlResult, setNlResult]             = useState<Newsletter | null>(null)
  const [nlActiveSection, setNlActiveSection] = useState(0)

  // Case study state
  const [csClient, setCsClient]             = useState('')
  const [csIndustry, setCsIndustry]         = useState('')
  const [csProblem, setCsProblem]           = useState('')
  const [csSolution, setCsSolution]         = useState('')
  const [csResults, setCsResults]           = useState('')
  const [csTimeframe, setCsTimeframe]       = useState('')
  const [csTestimonial, setCsTestimonial]   = useState('')
  const [csResult, setCsResult]             = useState<CaseStudy | null>(null)

  // Script state
  const [scTopic, setScTopic]               = useState('')
  const [scPlatform, setScPlatform]         = useState<'youtube' | 'instagram_reel' | 'tiktok' | 'podcast' | 'webinar' | 'ad'>('youtube')
  const [scDuration, setScDuration]         = useState(300)
  const [scHook, setScHook]                 = useState('')
  const [scResult, setScResult]             = useState<ContentScript | null>(null)

  // Previous artifacts
  const [savedBlogs, setSavedBlogs]         = useState<SavedArtifact[]>([])
  const [savedNewsletters, setSavedNewsletters] = useState<SavedArtifact[]>([])
  const [savedCaseStudies, setSavedCaseStudies] = useState<SavedArtifact[]>([])
  const [savedScripts, setSavedScripts]     = useState<SavedArtifact[]>([])
  const [savedLoading, setSavedLoading]     = useState(false)

  const loadSaved = useCallback(async (wid: string) => {
    setSavedLoading(true)
    try {
      const [blogs, newsletters, caseStudies, scripts] = await Promise.all([
        fetch(`/api/agents/content/blog?workspaceId=${wid}`).then(r => r.json()),
        fetch(`/api/agents/content/newsletter?workspaceId=${wid}`).then(r => r.json()),
        fetch(`/api/agents/content/case-study?workspaceId=${wid}`).then(r => r.json()),
        fetch(`/api/agents/content/script?workspaceId=${wid}`).then(r => r.json()),
      ])
      if (Array.isArray(blogs))        setSavedBlogs(blogs.slice(0, 5).map((a: SavedArtifact) => ({ ...a, artifactType: 'blog' })))
      if (Array.isArray(newsletters))  setSavedNewsletters(newsletters.slice(0, 5).map((a: SavedArtifact) => ({ ...a, artifactType: 'newsletter' })))
      if (Array.isArray(caseStudies))  setSavedCaseStudies(caseStudies.slice(0, 5).map((a: SavedArtifact) => ({ ...a, artifactType: 'case_study' })))
      if (Array.isArray(scripts))      setSavedScripts(scripts.slice(0, 5).map((a: SavedArtifact) => ({ ...a, artifactType: 'script' })))
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) loadSaved(wid)
  }, [loadSaved])

  // ── Generate handlers ────────────────────────────────────────────────────

  async function generateBlog() {
    if (!blogTopic.trim()) { setError('Enter a topic'); return }
    setLoading(true); setError(''); setBlogResult(null)
    try {
      const res = await fetch('/api/agents/content/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, topic: blogTopic, keywords: blogKeywords, targetWordCount: blogWordCount, style: blogStyle }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setBlogResult(data.blog)
      loadSaved(workspaceId)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  async function generateNewsletter() {
    if (!nlTheme.trim()) { setError('Enter a theme or topic'); return }
    setLoading(true); setError(''); setNlResult(null); setNlActiveSection(0)
    try {
      const res = await fetch('/api/agents/content/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, theme: nlTheme, sections: nlSections, edition: nlEdition, tone: nlTone }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setNlResult(data.newsletter)
      loadSaved(workspaceId)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  async function generateCaseStudy() {
    if (!csClient.trim() || !csProblem.trim() || !csSolution.trim() || !csResults.trim()) {
      setError('Client name, problem, solution, and results are required')
      return
    }
    setLoading(true); setError(''); setCsResult(null)
    try {
      const res = await fetch('/api/agents/content/case-study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, clientName: csClient, industry: csIndustry, problem: csProblem, solution: csSolution, results: csResults, timeframe: csTimeframe, testimonial: csTestimonial }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setCsResult(data.caseStudy)
      loadSaved(workspaceId)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  async function generateScript() {
    if (!scTopic.trim()) { setError('Enter a topic or title'); return }
    setLoading(true); setError(''); setScResult(null)
    try {
      const res = await fetch('/api/agents/content/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, topic: scTopic, platform: scPlatform, duration: scDuration, hook: scHook }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setScResult(data.script)
      loadSaved(workspaceId)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const loadingMessages: Record<ContentType, string> = {
    blog:       'Writing blog post...',
    newsletter: 'Drafting newsletter...',
    case_study: 'Writing case study...',
    script:     'Writing script...',
  }

  const handleGenerate = () => {
    setError('')
    if (activeType === 'blog')       return generateBlog()
    if (activeType === 'newsletter') return generateNewsletter()
    if (activeType === 'case_study') return generateCaseStudy()
    if (activeType === 'script')     return generateScript()
  }

  const allSaved = [
    ...savedBlogs,
    ...savedNewsletters,
    ...savedCaseStudies,
    ...savedScripts,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15)

  const TYPE_BADGE: Record<string, string> = {
    blog:       'bg-indigo-900/40 text-indigo-300',
    newsletter: 'bg-yellow-900/40 text-yellow-300',
    case_study: 'bg-green-900/40 text-green-300',
    script:     'bg-purple-900/40 text-purple-300',
  }
  const TYPE_ICON: Record<string, string> = {
    blog: '📝', newsletter: '📧', case_study: '📊', script: '🎬',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">✍️</div>
          <h1 className="text-2xl font-bold text-white">Blog &amp; Long-Form Content</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI-powered SEO content that ranks and converts</p>
      </div>

      {/* Content type selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {CONTENT_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveType(t.id); setError('') }}
            className={`p-4 rounded-xl border text-left transition-all ${
              activeType === t.id
                ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500/40'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-2">{t.icon}</div>
            <p className={`font-semibold text-sm mb-1 ${activeType === t.id ? 'text-indigo-300' : 'text-white'}`}>{t.label}</p>
            <p className="text-gray-500 text-xs leading-relaxed">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Input form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="space-y-4">

          {/* ── Blog Post ── */}
          {activeType === 'blog' && (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Topic <span className="text-red-400">*</span></label>
                <input
                  value={blogTopic}
                  onChange={e => setBlogTopic(e.target.value)}
                  placeholder="e.g. How to build a social media strategy in 2025"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Target keywords</label>
                <input
                  value={blogKeywords}
                  onChange={e => setBlogKeywords(e.target.value)}
                  placeholder="e.g. social media strategy, content marketing, brand growth"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Word count</label>
                  <select
                    value={blogWordCount}
                    onChange={e => setBlogWordCount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value={800}>800 words (Short)</option>
                    <option value={1500}>1,500 words (Standard)</option>
                    <option value={2500}>2,500 words (Long-form)</option>
                    <option value={3000}>3,000+ words (Pillar)</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Style</label>
                  <select
                    value={blogStyle}
                    onChange={e => setBlogStyle(e.target.value as typeof blogStyle)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="educational">Educational</option>
                    <option value="how_to">How-To Guide</option>
                    <option value="listicle">Listicle</option>
                    <option value="thought_leadership">Thought Leadership</option>
                    <option value="news_analysis">News Analysis</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Newsletter ── */}
          {activeType === 'newsletter' && (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Theme / Topic <span className="text-red-400">*</span></label>
                <input
                  value={nlTheme}
                  onChange={e => setNlTheme(e.target.value)}
                  placeholder="e.g. AI tools transforming marketing in 2025"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Sections to include</label>
                <div className="flex flex-wrap gap-2">
                  {NEWSLETTER_SECTION_OPTIONS.map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setNlSections(prev =>
                        prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]
                      )}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        nlSections.includes(sec)
                          ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Edition name</label>
                  <input
                    value={nlEdition}
                    onChange={e => setNlEdition(e.target.value)}
                    placeholder="e.g. May Edition"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Tone</label>
                  <select
                    value={nlTone}
                    onChange={e => setNlTone(e.target.value as typeof nlTone)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="exciting">Exciting</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Case Study ── */}
          {activeType === 'case_study' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Client name <span className="text-red-400">*</span></label>
                  <input
                    value={csClient}
                    onChange={e => setCsClient(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Client industry</label>
                  <input
                    value={csIndustry}
                    onChange={e => setCsIndustry(e.target.value)}
                    placeholder="e.g. E-commerce, SaaS, Healthcare"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Their problem <span className="text-red-400">*</span></label>
                <textarea
                  value={csProblem}
                  onChange={e => setCsProblem(e.target.value)}
                  rows={2}
                  placeholder="Describe the challenge they were facing before working with you..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Your solution <span className="text-red-400">*</span></label>
                <textarea
                  value={csSolution}
                  onChange={e => setCsSolution(e.target.value)}
                  rows={2}
                  placeholder="Describe your approach, methodology, and what you delivered..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Results achieved <span className="text-red-400">*</span></label>
                <textarea
                  value={csResults}
                  onChange={e => setCsResults(e.target.value)}
                  rows={2}
                  placeholder="e.g. Revenue grew 3x, 40% reduction in CAC, 10,000 new signups in 90 days..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Timeframe</label>
                  <input
                    value={csTimeframe}
                    onChange={e => setCsTimeframe(e.target.value)}
                    placeholder="e.g. 3 months, Q1 2025"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Client testimonial (optional)</label>
                  <input
                    value={csTestimonial}
                    onChange={e => setCsTestimonial(e.target.value)}
                    placeholder="Direct quote from client..."
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Script ── */}
          {activeType === 'script' && (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Topic / Title <span className="text-red-400">*</span></label>
                <input
                  value={scTopic}
                  onChange={e => setScTopic(e.target.value)}
                  placeholder="e.g. 5 Marketing Mistakes That Kill Your ROI"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Platform</label>
                  <select
                    value={scPlatform}
                    onChange={e => setScPlatform(e.target.value as typeof scPlatform)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="instagram_reel">Instagram Reel</option>
                    <option value="tiktok">TikTok</option>
                    <option value="podcast">Podcast</option>
                    <option value="webinar">Webinar</option>
                    <option value="ad">Video Ad</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1.5 block">Duration (seconds)</label>
                  <input
                    type="number"
                    value={scDuration}
                    onChange={e => setScDuration(Number(e.target.value))}
                    min={15}
                    max={7200}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Hook idea (optional)</label>
                <input
                  value={scHook}
                  onChange={e => setScHook(e.target.value)}
                  placeholder="e.g. Start with a shocking stat, or describe the moment everything changed..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || !workspaceId}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {loadingMessages[activeType]}
              </>
            ) : `✨ Generate ${CONTENT_TYPES.find(t => t.id === activeType)?.label}`}
          </button>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────────── */}

      {/* Blog Post Result */}
      {blogResult && activeType === 'blog' && (
        <div className="space-y-5 mb-10">
          {/* Header card */}
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <h2 className="text-white font-bold text-xl leading-tight mb-2">{blogResult.title}</h2>
                <p className="text-gray-400 text-sm">{blogResult.metaDescription}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="px-2.5 py-1 bg-indigo-900/40 text-indigo-300 text-xs rounded-full font-medium">
                  {blogResult.wordCount?.toLocaleString() || blogResult.content?.split(' ').length.toLocaleString()} words
                </span>
                <span className="px-2.5 py-1 bg-gray-800 text-gray-400 text-xs rounded-full">{blogResult.readTime}</span>
              </div>
            </div>
            <p className="text-gray-300 text-sm italic leading-relaxed border-l-2 border-indigo-700 pl-3">{blogResult.excerpt}</p>
          </div>

          {/* Outline */}
          {blogResult.outline?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-3">Article Outline</h3>
              <ol className="space-y-1.5">
                {blogResult.outline.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-indigo-400 font-medium flex-shrink-0 w-5">{i + 1}.</span>
                    <span className="text-gray-300">{h}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Full content */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">Full Article</h3>
              <CopyButton text={blogResult.content} label="Copy HTML" />
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none text-gray-300 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent pr-2
                [&_h2]:text-white [&_h2]:font-bold [&_h2]:text-base [&_h2]:mt-5 [&_h2]:mb-2
                [&_p]:text-gray-300 [&_p]:leading-relaxed [&_p]:mb-3
                [&_ul]:text-gray-300 [&_ul]:space-y-1 [&_ul]:pl-4
                [&_li]:text-gray-300
                [&_strong]:text-white"
              dangerouslySetInnerHTML={{ __html: blogResult.content }}
            />
          </div>

          {/* CTA + Social + Keywords */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-2">Call to Action</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{blogResult.callToAction}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold text-sm">Social Caption</h3>
                <CopyButton text={blogResult.socialCaption} />
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">{blogResult.socialCaption}</p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Keywords Used</h3>
            <div className="flex flex-wrap gap-2">
              {blogResult.keywords?.map((kw, i) => (
                <span key={i} className="px-2.5 py-1 bg-indigo-900/30 border border-indigo-800/40 text-indigo-300 text-xs rounded-full">{kw}</span>
              ))}
            </div>
            {blogResult.internalLinkSuggestions?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-gray-500 text-xs mb-2">Internal link opportunities</p>
                <div className="flex flex-wrap gap-2">
                  {blogResult.internalLinkSuggestions.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-gray-800 text-gray-400 text-xs rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <CopyButton text={blogResult.content} label="Copy Full HTML" />
            <button className="px-4 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-700/40 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors">
              Publish (coming soon)
            </button>
          </div>
        </div>
      )}

      {/* Newsletter Result */}
      {nlResult && activeType === 'newsletter' && (
        <div className="space-y-5 mb-10">
          {/* Subject + Preview */}
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-gray-500 text-xs mb-1">Subject line</p>
                <h2 className="text-white font-bold text-lg">{nlResult.subject}</h2>
              </div>
              <span className="px-2.5 py-1 bg-gray-800 text-gray-400 text-xs rounded-full flex-shrink-0">{nlResult.estimatedReadTime}</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              <span className="text-gray-600">Preview:</span>
              <span>{nlResult.previewText}</span>
            </div>
            {nlResult.headline && (
              <p className="mt-3 text-indigo-300 font-semibold">{nlResult.headline}</p>
            )}
            <p className="mt-2 text-gray-300 text-sm leading-relaxed">{nlResult.intro}</p>
          </div>

          {/* Featured insight */}
          {nlResult.featuredInsight && (
            <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-5">
              <p className="text-indigo-300 text-xs font-medium uppercase tracking-wide mb-2">Featured Insight</p>
              <p className="text-white text-sm font-medium leading-relaxed italic">&ldquo;{nlResult.featuredInsight}&rdquo;</p>
            </div>
          )}

          {/* Sections tabs */}
          {nlResult.sections?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex overflow-x-auto border-b border-gray-800">
                {nlResult.sections.map((sec, i) => (
                  <button
                    key={i}
                    onClick={() => setNlActiveSection(i)}
                    className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-r border-gray-800 transition-colors ${
                      nlActiveSection === i
                        ? 'bg-indigo-900/30 text-indigo-300'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <span className={`mr-1.5 px-1.5 py-0.5 rounded text-xs ${SECTION_TYPE_COLORS[sec.type] || 'bg-gray-800 text-gray-400'}`}>
                      {sec.type}
                    </span>
                    {sec.title}
                  </button>
                ))}
              </div>
              <div className="p-5">
                <div
                  className="text-gray-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none
                    [&_p]:mb-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-gray-300 [&_strong]:text-white"
                  dangerouslySetInnerHTML={{ __html: nlResult.sections[nlActiveSection]?.content || '' }}
                />
              </div>
            </div>
          )}

          {/* CTA */}
          {nlResult.cta && (
            <div className="bg-gray-900 border border-indigo-800/30 rounded-xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-gray-300 text-sm leading-relaxed">{nlResult.cta.text}</p>
              </div>
              <button className="flex-shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium whitespace-nowrap">
                {nlResult.cta.buttonLabel}
              </button>
            </div>
          )}

          {/* Footer */}
          {nlResult.footer && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Footer / Sign-off</p>
              <p className="text-gray-300 text-sm">{nlResult.footer}</p>
            </div>
          )}

          <CopyButton text={`Subject: ${nlResult.subject}\n\n${nlResult.intro}\n\n${nlResult.sections?.map(s => `## ${s.title}\n${s.content}`).join('\n\n')}`} label="Copy Newsletter Text" />
        </div>
      )}

      {/* Case Study Result */}
      {csResult && activeType === 'case_study' && (
        <div className="space-y-5 mb-10">
          {/* Headline */}
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <h2 className="text-white font-bold text-xl leading-tight mb-1">{csResult.headline}</h2>
            <p className="text-indigo-300 text-sm mb-3">{csResult.subheadline}</p>
            <p className="text-gray-300 text-sm leading-relaxed">{csResult.summary}</p>
          </div>

          {/* Key Metrics */}
          {csResult.keyMetrics?.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {csResult.keyMetrics.map((m, i) => (
                <div key={i} className="bg-green-950/30 border border-green-800/30 rounded-xl p-4 text-center">
                  <p className="text-green-300 font-bold text-2xl">{m.value}</p>
                  <p className="text-white text-sm font-medium mt-1">{m.label}</p>
                  {m.improvement && <p className="text-green-400/70 text-xs mt-0.5">{m.improvement}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Sections */}
          {[
            { label: 'Client Overview', html: csResult.clientOverview },
            { label: 'The Challenge', html: csResult.challengeSection },
            { label: 'Our Solution', html: csResult.solutionSection },
            { label: 'Results', html: csResult.resultsSection },
          ].map(({ label, html }) => html ? (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-3">{label}</h3>
              <div
                className="text-gray-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none
                  [&_p]:mb-2 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-gray-300 [&_strong]:text-white"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : null)}

          {/* Testimonial */}
          {csResult.testimonialBlock && (
            <div className="bg-gray-900 border border-indigo-800/30 rounded-xl p-5">
              <p className="text-indigo-300 text-xs font-medium uppercase tracking-wide mb-3">Client Testimonial</p>
              <p className="text-white text-sm leading-relaxed italic">{csResult.testimonialBlock}</p>
            </div>
          )}

          {/* Lessons */}
          {csResult.lessonsLearned?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-3">Lessons Learned</h3>
              <ol className="space-y-2">
                {csResult.lessonsLearned.map((l, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-indigo-400 font-bold flex-shrink-0 w-5">{i + 1}.</span>
                    <span className="text-gray-300">{l}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* CTA */}
          {csResult.cta && (
            <div className="bg-gray-900 border border-indigo-800/30 rounded-xl p-5">
              <p className="text-gray-300 text-sm leading-relaxed">{csResult.cta}</p>
            </div>
          )}

          <div className="flex gap-3">
            <CopyButton text={csResult.fullHtml} label="Copy Full HTML" />
            <button className="px-4 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-700/40 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors">
              Export PDF (coming soon)
            </button>
          </div>
        </div>
      )}

      {/* Script Result */}
      {scResult && activeType === 'script' && (
        <div className="space-y-5 mb-10">
          {/* Header */}
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">{PLATFORM_LABELS[scResult.platform] || scResult.platform}</span>
                  <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">{scResult.estimatedDuration}</span>
                </div>
                <h2 className="text-white font-bold text-xl">{scResult.title}</h2>
              </div>
              <CopyButton text={`${scResult.hook}\n\n${scResult.intro}\n\n${scResult.mainContent?.map(s => `[${s.timestamp}] ${s.section}\n${s.script}`).join('\n\n')}\n\nCTA: ${scResult.cta}\n\nOutro: ${scResult.outro}`} label="Copy Script" />
            </div>
          </div>

          {/* Hook — big feature */}
          <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-700/40 rounded-2xl p-6">
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide mb-3">Hook (0:00 — first impression)</p>
            <p className="text-white text-lg font-semibold leading-relaxed">{scResult.hook}</p>
          </div>

          {/* Intro */}
          {scResult.intro && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-2">Intro</p>
              <p className="text-gray-300 text-sm leading-relaxed">{scResult.intro}</p>
            </div>
          )}

          {/* Timeline table */}
          {scResult.mainContent?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h3 className="text-white font-semibold text-sm">Full Script Timeline</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-gray-500 font-medium text-xs w-20">Time</th>
                      <th className="px-4 py-3 text-left text-gray-500 font-medium text-xs w-36">Section</th>
                      <th className="px-4 py-3 text-left text-gray-500 font-medium text-xs">Script</th>
                      <th className="px-4 py-3 text-left text-gray-500 font-medium text-xs w-32">Visual/B-roll</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {scResult.mainContent.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-indigo-400 font-mono text-xs">{row.timestamp}</td>
                        <td className="px-4 py-3 text-gray-300 font-medium text-xs">{row.section}</td>
                        <td className="px-4 py-3 text-gray-300 text-xs leading-relaxed">{row.script}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{row.broll || row.onscreen || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CTA + Outro */}
          <div className="grid grid-cols-2 gap-4">
            {scResult.cta && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-2">Call to Action</p>
                <p className="text-gray-300 text-sm leading-relaxed">{scResult.cta}</p>
              </div>
            )}
            {scResult.outro && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-2">Outro</p>
                <p className="text-gray-300 text-sm leading-relaxed">{scResult.outro}</p>
              </div>
            )}
          </div>

          {/* Description + Hashtags */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-sm">Platform Description</h3>
              <CopyButton text={scResult.description} />
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">{scResult.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {scResult.hashtags?.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">{tag.startsWith('#') ? tag : `#${tag}`}</span>
              ))}
            </div>
          </div>

          {/* Thumbnail Ideas */}
          {scResult.thumbnailIdeas?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-3">Thumbnail Ideas</h3>
              <div className="space-y-2">
                {scResult.thumbnailIdeas.map((idea, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-indigo-400 font-bold text-xs flex-shrink-0 w-5 mt-0.5">{i + 1}.</span>
                    <p className="text-gray-300 text-sm">{idea}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chapter timestamps */}
          {scResult.chaptersTimestamps?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Chapter Timestamps</h3>
                <CopyButton
                  text={scResult.chaptersTimestamps.map(c => `${c.time} ${c.title}`).join('\n')}
                  label="Copy Timestamps"
                />
              </div>
              <div className="space-y-1.5">
                {scResult.chaptersTimestamps.map((ch, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-indigo-400 font-mono text-xs">{ch.time}</span>
                    <span className="text-gray-300">{ch.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Previous Content ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-white font-semibold mb-4 text-sm">Previous Content</h2>
        {savedLoading ? (
          <div className="text-gray-600 text-sm animate-pulse p-6 text-center">Loading content...</div>
        ) : allSaved.length === 0 ? (
          <div className="border border-dashed border-gray-700 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">✍️</div>
            <p className="text-white font-medium mb-1">No content generated yet</p>
            <p className="text-gray-500 text-sm">Select a content type above and generate your first piece</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allSaved.map(artifact => (
              <div
                key={artifact.id}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg flex-shrink-0">{TYPE_ICON[artifact.artifactType || ''] || '📄'}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{artifact.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{new Date(artifact.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-4 flex-shrink-0 ${TYPE_BADGE[artifact.artifactType || ''] || 'bg-gray-800 text-gray-400'}`}>
                  {artifact.artifactType?.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
