'use client'

import { useState } from 'react'

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
  wordCount: number
  includedInCmo: boolean
}

interface RepurposeJob {
  id: string
  sourceTitle: string
  sourceType: SourceType
  formatsGenerated: number
  date: string
  status: 'completed' | 'running' | 'failed'
  engagement?: string
}

interface CmoBriefItem {
  id: string
  contentSummary: string
  performancePrediction: string
  recommendedAction: string
  format: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'twitter_thread', icon: '🐦', label: 'Twitter Thread', platform: '10 tweets', color: 'bg-sky-900/30 border-sky-800/40 text-sky-300' },
  { id: 'linkedin_post', icon: '💼', label: 'LinkedIn Post', platform: '1,300 chars', color: 'bg-blue-900/30 border-blue-800/40 text-blue-300' },
  { id: 'instagram_carousel', icon: '📸', label: 'Instagram Carousel', platform: '5 slides', color: 'bg-pink-900/30 border-pink-800/40 text-pink-300' },
  { id: 'tiktok_script', icon: '📱', label: 'TikTok Script', platform: '60s video', color: 'bg-rose-900/30 border-rose-800/40 text-rose-300' },
  { id: 'email_newsletter', icon: '📧', label: 'Email Newsletter', platform: '400 words', color: 'bg-yellow-900/30 border-yellow-800/40 text-yellow-300' },
  { id: 'linkedin_article', icon: '📰', label: 'LinkedIn Article', platform: '800 words', color: 'bg-indigo-900/30 border-indigo-800/40 text-indigo-300' },
  { id: 'podcast_script', icon: '🎙', label: 'Podcast Script', platform: '5-7 minutes', color: 'bg-violet-900/30 border-violet-800/40 text-violet-300' },
  { id: 'infographic_brief', icon: '🖼', label: 'Infographic Brief', platform: '5 key points', color: 'bg-green-900/30 border-green-800/40 text-green-300' },
  { id: 'slide_deck', icon: '📊', label: 'Slide Deck Outline', platform: '10 slides', color: 'bg-amber-900/30 border-amber-800/40 text-amber-300' },
  { id: 'youtube_short', icon: '🎬', label: 'YouTube Short Script', platform: '60s video', color: 'bg-red-900/30 border-red-800/40 text-red-300' },
]

const MOCK_OUTPUTS: Record<string, string> = {
  twitter_thread: `🧵 THREAD: The single most underrated marketing strategy that 99% of brands ignore...

1/ Most companies spend $10k on ads to get 100 leads. The best companies spend $0 on ads and get 10,000 leads. Here's what separates them:

2/ It's called content compounding. One piece of content, distributed across 10+ formats = 10x the reach, same effort.

3/ The math is simple: A 2,000-word blog post contains enough material for 12 tweets, 3 LinkedIn posts, 1 newsletter, 2 Reels, and a podcast episode.

4/ Most brands treat every platform separately. Smart brands treat every platform as a distribution channel for ONE big idea.

5/ The playbook: Create → Repurpose → Distribute → Amplify. Repeat weekly. In 90 days, you'll have more content than most brands produce in a year.

6/ Action step: Take your top-performing blog post from last month. Extract 3 key insights. Post them as a Twitter thread today.

7/ Watch what happens. Then scale what works.

🔁 RT if this changed how you think about content. Follow for weekly marketing frameworks.`,

  linkedin_post: `Most brands are fighting for attention the wrong way.

They're spending more on ads when they should be spending more on content.

Here's the uncomfortable truth I've learned from working with 50+ companies:

The brands winning in 2026 aren't the ones with the biggest budgets. They're the ones with the most consistent content engines.

This means:
→ One big idea per week
→ Distributed across 5+ formats
→ Repurposed intelligently, not lazily

The result? Compounding reach that grows every month, even when you don't post.

I call this "content debt" — every piece you publish earns interest over time through SEO, shares, and brand recognition.

Most companies are taking on content debt every week without knowing it.

Are you building yours strategically or randomly?

—

What's your biggest content challenge right now? Drop it below.`,

  instagram_carousel: `SLIDE 1: "Stop creating more content. Start repurposing smarter."

SLIDE 2: The 1→10 Framework
One blog post → 10 pieces of content:
• 3 Twitter threads
• 2 LinkedIn posts
• 1 Email newsletter
• 2 Instagram carousels
• 1 Reel script
• 1 Podcast episode

SLIDE 3: Why this works
→ Different audiences consume differently
→ Repetition builds brand recognition
→ More touchpoints = faster trust-building

SLIDE 4: The secret ingredient
Don't just copy-paste. ADAPT.
Each platform has its own language.
Twitter = punchy. LinkedIn = professional.
Instagram = visual. Email = personal.

SLIDE 5: Your action step
Take ONE piece of old content.
Repurpose it for ONE new platform.
Do it TODAY.
See the difference in 7 days.`,

  email_newsletter: `Subject: The 10x content strategy that most brands are sleeping on

Hey [First Name],

Quick question: when did you last repurpose a piece of content?

If you're like most marketers, the answer is "not often enough."

Here's what I keep seeing: brands put enormous effort into creating original content, then publish it once and move on. That's leaving 90% of its value on the table.

**The 1→10 framework:**
Instead of creating 10 new pieces, take 1 great piece and adapt it for 10 formats. The blog post becomes a Twitter thread. The thread becomes a LinkedIn article. The article gets summarized for your newsletter. The newsletter key points become a carousel.

Same ideas. 10x the distribution.

**This week's challenge:**
Pick your best-performing post from the last 6 months. Identify 3 key insights. Schedule them as 3 separate social posts over the next week.

Watch your engagement. Then scale what works.

Talk soon,
[Name]

P.S. Hit reply and tell me which format converts best for your audience. I read every response.`,
}

const MOCK_HISTORY: RepurposeJob[] = [
  { id: '1', sourceTitle: '10 AI Marketing Tools That Will Replace Your Agency', sourceType: 'blog_url', formatsGenerated: 8, date: '2026-05-24', status: 'completed', engagement: '4.2k impressions' },
  { id: '2', sourceTitle: 'Product Demo Video — Q1 Launch', sourceType: 'video_url', formatsGenerated: 6, date: '2026-05-21', status: 'completed', engagement: '2.8k impressions' },
  { id: '3', sourceTitle: 'The CMO\'s Guide to Marketing Automation', sourceType: 'text', formatsGenerated: 10, date: '2026-05-18', status: 'completed', engagement: '7.1k impressions' },
  { id: '4', sourceTitle: 'Customer Success Podcast Episode 12', sourceType: 'podcast', formatsGenerated: 5, date: '2026-05-15', status: 'completed' },
  { id: '5', sourceTitle: 'Brand Identity Document 2026', sourceType: 'upload', formatsGenerated: 0, date: '2026-05-10', status: 'failed' },
]

const CMO_BRIEF_ITEMS: CmoBriefItem[] = [
  { id: '1', contentSummary: 'Twitter thread on 1→10 content strategy — 7 tweets, punchy hooks, framework-style', performancePrediction: 'High engagement likely — framework content consistently performs 2-3x above average for this audience', recommendedAction: 'Publish Tuesday 9AM, boost top tweet at $20 for 24h', format: 'Twitter Thread' },
  { id: '2', contentSummary: 'LinkedIn post on content compounding — professional tone, 400 words, 3 bullet points', performancePrediction: 'Moderate reach — text-only LinkedIn posts reach 60% more people than image posts in this niche', recommendedAction: 'Schedule for Thursday 2PM — peak LinkedIn time for B2B audience', format: 'LinkedIn Post' },
  { id: '3', contentSummary: 'Instagram carousel: 5 slides on the 1→10 repurposing framework — visual, actionable', performancePrediction: 'Carousel saves rate expected 4-8% — strong for email list growth', recommendedAction: 'Pair with "save this post" CTA, boost for 3 days at $15/day', format: 'Instagram Carousel' },
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RepurposePage() {
  const [activeTab, setActiveTab] = useState<RepurposeTab>('repurpose')
  const [sourceType, setSourceType] = useState<SourceType>('blog_url')
  const [sourceInput, setSourceInput] = useState('')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['twitter_thread', 'linkedin_post', 'instagram_carousel', 'email_newsletter'])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([])
  const [editingFormat, setEditingFormat] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<Record<string, string>>({})
  const [cmoItems, setCmoItems] = useState<CmoBriefItem[]>(CMO_BRIEF_ITEMS)
  const [autoBriefCmo, setAutoBriefCmo] = useState(false)
  const [sentToCmo, setSentToCmo] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  function toggleFormat(id: string) {
    setSelectedFormats(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  async function analyzeContent() {
    if (!sourceInput.trim()) return
    setAnalyzing(true)
    await new Promise(r => setTimeout(r, 1200))
    setAnalyzing(false)
    setAnalyzed(true)
  }

  async function generateAll() {
    if (!sourceInput.trim() || selectedFormats.length === 0) return
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2500))
    const results: GeneratedOutput[] = selectedFormats.map(fid => ({
      formatId: fid,
      content: MOCK_OUTPUTS[fid] || `[Generated ${OUTPUT_FORMATS.find(f => f.id === fid)?.label || fid} content based on your source material. Full AI-generated content would appear here with proper formatting, hooks, and platform-specific optimization.]`,
      wordCount: Math.floor(Math.random() * 300) + 80,
      includedInCmo: false,
    }))
    setOutputs(results)
    setGenerating(false)
  }

  function toggleCmoInclude(formatId: string) {
    setOutputs(prev => prev.map(o => o.formatId === formatId ? { ...o, includedInCmo: !o.includedInCmo } : o))
  }

  async function sendToCmo() {
    setSentToCmo(true)
    setTimeout(() => setSentToCmo(false), 3000)
  }

  function sendJobToCmo(jobId: string) {
    // Add brief items from job
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
          <p className="text-gray-400 text-sm ml-11">Turn one piece of content into 10+ formats for every platform</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setActiveTab('cmo')}
            className="border border-indigo-700/50 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/40 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          >
            📤 Feed to CMO
            {cmoIncludedCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{cmoIncludedCount}</span>
            )}
          </button>
          <button
            onClick={() => { setSourceInput(''); setOutputs([]); setAnalyzed(false) }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            + New Job
          </button>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { step: '1', label: 'Input Content', icon: '📥', color: 'bg-gray-800 border-gray-700 text-gray-300' },
            { step: '2', label: 'AI Analysis', icon: '🧠', color: 'bg-indigo-900/40 border-indigo-800/40 text-indigo-300' },
            { step: '3', label: 'Format Outputs', icon: '🔄', color: 'bg-violet-900/40 border-violet-800/40 text-violet-300' },
            { step: '4', label: 'Publish', icon: '🚀', color: 'bg-green-900/40 border-green-800/40 text-green-300' },
            { step: '5', label: 'CMO Briefing', icon: '📊', color: 'bg-amber-900/40 border-amber-800/40 text-amber-300' },
          ].map((s, i, arr) => (
            <>
              <div key={s.step} className={`flex-shrink-0 border rounded-xl px-4 py-2.5 text-center ${s.color}`}>
                <div className="text-xl mb-0.5">{s.icon}</div>
                <p className="text-xs font-medium">{s.label}</p>
              </div>
              {i < arr.length - 1 && <span key={`a${i}`} className="text-gray-700 text-lg flex-shrink-0">→</span>}
            </>
          ))}
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

            {/* Source type pills */}
            <div className="flex gap-2 flex-wrap">
              {SOURCE_TYPES.map(st => (
                <button
                  key={st.id}
                  onClick={() => { setSourceType(st.id); setAnalyzed(false) }}
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

            {/* Input field */}
            {(sourceType === 'blog_url' || sourceType === 'video_url') && (
              <input
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder={sourceType === 'blog_url' ? 'https://yourblog.com/your-post-url' : 'https://youtube.com/watch?v=...'}
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
              <div className="space-y-3">
                <input
                  value={sourceInput}
                  onChange={e => setSourceInput(e.target.value)}
                  placeholder="Podcast episode URL or RSS feed link..."
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                />
              </div>
            )}

            {sourceType === 'upload' && (
              <div className="border-2 border-dashed border-gray-700 hover:border-indigo-600 rounded-2xl p-8 text-center cursor-pointer transition-colors">
                <div className="text-3xl mb-2">📄</div>
                <p className="text-white font-medium">Drop your document here</p>
                <p className="text-gray-500 text-sm mt-1">PDF, DOCX, TXT — up to 10MB</p>
              </div>
            )}

            {sourceInput.trim() && !analyzed && (
              <button
                onClick={analyzeContent}
                disabled={analyzing}
                className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {analyzing ? <><SpinnerSm /> Analyzing...</> : '🔍 Analyze Content'}
              </button>
            )}

            {analyzed && (
              <div className="bg-indigo-900/20 border border-indigo-800/30 rounded-xl p-4 flex items-start gap-3">
                <span className="text-indigo-400 text-lg">✅</span>
                <div>
                  <p className="text-white font-medium text-sm">Content analyzed successfully</p>
                  <p className="text-indigo-300 text-xs mt-0.5">
                    Detected: Blog Post · ~2,847 words · Topics: AI marketing, automation, content strategy
                  </p>
                </div>
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
            disabled={generating || !sourceInput.trim() || selectedFormats.length === 0}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
          >
            {generating ? (
              <><SpinnerSm /> Generating {selectedFormats.length} formats...</>
            ) : (
              <>🔄 Generate All Selected Formats ({selectedFormats.length})</>
            )}
          </button>

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
                  <div key={output.formatId} className={`bg-gray-900 border rounded-2xl overflow-hidden ${fmt?.color.includes('border') ? '' : 'border-gray-800'}`}>
                    {/* Header */}
                    <div className={`px-5 py-3 flex items-center justify-between border-b border-gray-800`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{fmt?.icon}</span>
                        <div>
                          <span className="text-white font-semibold text-sm">{fmt?.label}</span>
                          <span className="text-gray-500 text-xs ml-2">{output.wordCount} words</span>
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
                        {/* CMO toggle */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">CMO Brief</span>
                          <button
                            onClick={() => toggleCmoInclude(output.formatId)}
                            className={`relative w-8 h-4 rounded-full transition-colors ${output.includedInCmo ? 'bg-indigo-600' : 'bg-gray-700'}`}
                          >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${output.includedInCmo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      {isEditing ? (
                        <textarea
                          value={editContent[output.formatId] ?? output.content}
                          onChange={e => setEditContent(prev => ({ ...prev, [output.formatId]: e.target.value }))}
                          rows={8}
                          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs px-3 py-3 rounded-xl focus:outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed"
                        />
                      ) : (
                        <pre className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                          {editContent[output.formatId] ?? output.content}
                        </pre>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="px-5 pb-4 flex gap-2">
                      <button className="text-xs border border-indigo-700/40 bg-indigo-900/20 text-indigo-400 hover:bg-indigo-900/40 px-3 py-1.5 rounded-lg transition-colors">
                        Send to Approvals
                      </button>
                      <button className="text-xs border border-green-800/40 bg-green-900/20 text-green-400 hover:bg-green-900/40 px-3 py-1.5 rounded-lg transition-colors">
                        Publish Now
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
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">{MOCK_HISTORY.length} repurpose jobs</p>
          </div>
          {MOCK_HISTORY.map(job => (
            <div key={job.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
                onClick={() => setExpandedHistory(expandedHistory === job.id ? null : job.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">
                      {job.sourceType === 'blog_url' ? '📝' :
                       job.sourceType === 'video_url' ? '🎬' :
                       job.sourceType === 'podcast' ? '🎙' :
                       job.sourceType === 'upload' ? '📄' : '✏️'}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{job.sourceTitle}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                      <span className="text-gray-500 text-xs">{job.formatsGenerated} formats</span>
                      <span className="text-gray-600 text-xs">{job.date}</span>
                      {job.engagement && (
                        <span className="text-green-400 text-xs">🔥 {job.engagement}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); sendJobToCmo(job.id) }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 border border-indigo-800/40 rounded-lg"
                  >
                    Feed CMO
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setSourceInput(''); setActiveTab('repurpose') }}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-700 rounded-lg"
                  >
                    Re-generate
                  </button>
                  <span className="text-gray-600 text-sm">{expandedHistory === job.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedHistory === job.id && (
                <div className="px-5 pb-4 border-t border-gray-800 pt-4">
                  <p className="text-gray-500 text-xs mb-3">Generated formats</p>
                  <div className="flex flex-wrap gap-2">
                    {OUTPUT_FORMATS.slice(0, job.formatsGenerated).map(fmt => (
                      <span key={fmt.id} className={`text-xs px-3 py-1 rounded-lg border ${fmt.color}`}>
                        {fmt.icon} {fmt.label}
                      </span>
                    ))}
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
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">CMO Brief</h2>
              <p className="text-gray-500 text-xs mt-0.5">Actionable insights ready to send to your CMO Dashboard</p>
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
                onClick={sendToCmo}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              >
                {sentToCmo ? '✅ Sent!' : '🚀 Send to CMO Dashboard'}
              </button>
            </div>
          </div>

          {/* Brief preview */}
          {cmoIncludedCount === 0 && outputs.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Example CMO Brief Items</p>
              {CMO_BRIEF_ITEMS.map(item => (
                <CmoBriefCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              {cmoIncludedCount > 0 ? (
                <>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{cmoIncludedCount} items selected for briefing</p>
                  {outputs.filter(o => o.includedInCmo).map(output => {
                    const fmt = OUTPUT_FORMATS.find(f => f.id === output.formatId)
                    const mockBrief = CMO_BRIEF_ITEMS[Math.floor(Math.random() * CMO_BRIEF_ITEMS.length)]
                    return (
                      <div key={output.formatId} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{fmt?.icon}</span>
                          <span className="text-white font-semibold text-sm">{fmt?.label}</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-2">{mockBrief.performancePrediction}</p>
                        <p className="text-indigo-300 text-xs font-medium">{mockBrief.recommendedAction}</p>
                      </div>
                    )
                  })}
                </>
              ) : (
                <p className="text-gray-500 text-sm text-center py-6">
                  Generate content and toggle "CMO Brief" on the outputs you want to include.
                </p>
              )}
            </div>
          )}

          {/* CMO brief items from history */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Accumulated Brief Items</p>
            <div className="space-y-3">
              {cmoItems.map(item => (
                <CmoBriefCard key={item.id} item={item} />
              ))}
            </div>
          </div>
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
      </div>
      <p className="text-gray-300 text-sm mb-2">{item.contentSummary}</p>
      <div className="space-y-2">
        <div className="flex gap-2 items-start">
          <span className="text-green-400 text-xs font-medium flex-shrink-0 mt-0.5">Prediction:</span>
          <p className="text-gray-400 text-xs">{item.performancePrediction}</p>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-indigo-400 text-xs font-medium flex-shrink-0 mt-0.5">Action:</span>
          <p className="text-gray-400 text-xs">{item.recommendedAction}</p>
        </div>
      </div>
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
