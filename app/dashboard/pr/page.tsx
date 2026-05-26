'use client'

import { useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

type PRStatus = 'Draft' | 'Review' | 'Published' | 'Distributed'
type Beat = 'Tech' | 'Business' | 'Marketing' | 'Lifestyle' | 'Finance' | 'Health'
type Tier = 'Tier 1' | 'Tier 2' | 'Tier 3'
type Relationship = 'Cold' | 'Warm' | 'Hot'
type Sentiment = 'Positive' | 'Neutral' | 'Negative'

interface PressRelease {
  id: string
  title: string
  status: PRStatus
  date: string
  distributionCount: number
  coverageLinks: number
}

interface Journalist {
  id: string
  name: string
  publication: string
  beat: Beat
  email: string
  twitter: string
  location: string
  pastCoverage: number
  relationship: Relationship
  lastContacted: string
}

interface OutreachCampaign {
  id: string
  name: string
  targeted: number
  sent: number
  opened: number
  replied: number
  coverage: number
}

interface MediaMention {
  id: string
  source: string
  headline: string
  date: string
  sentiment: Sentiment
  reach: number
  tier: Tier
  link: string
  value: number
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_PRS: PressRelease[] = [
  { id: '1', title: 'Ooumph Raises $2M Seed Round to Democratize AI Marketing for SMBs', status: 'Distributed', date: '2026-05-20', distributionCount: 847, coverageLinks: 12 },
  { id: '2', title: 'Ooumph Launches AI-Powered Social Media Agent That Writes, Schedules & Optimizes Content Automatically', status: 'Published', date: '2026-05-15', distributionCount: 423, coverageLinks: 5 },
  { id: '3', title: 'Ooumph Crosses 500 Paying Customers in First Quarter, Reports 210% MoM Growth', status: 'Review', date: '2026-05-22', distributionCount: 0, coverageLinks: 0 },
  { id: '4', title: 'Ooumph Partners with Shopify to Bring AI Marketing to 2 Million E-commerce Stores', status: 'Draft', date: '2026-05-25', distributionCount: 0, coverageLinks: 0 },
]

const MOCK_JOURNALISTS: Journalist[] = [
  { id: '1', name: 'Sarah Chen', publication: 'TechCrunch', beat: 'Tech', email: 'sarah@techcrunch.com', twitter: '@sarahchen', location: 'San Francisco', pastCoverage: 3, relationship: 'Warm', lastContacted: '2026-05-10' },
  { id: '2', name: 'Raj Sharma', publication: 'YourStory', beat: 'Business', email: 'raj@yourstory.com', twitter: '@rajsharma', location: 'Bangalore', pastCoverage: 2, relationship: 'Hot', lastContacted: '2026-05-18' },
  { id: '3', name: 'Emily Torres', publication: 'Forbes', beat: 'Marketing', email: 'emily@forbes.com', twitter: '@emilyforbes', location: 'New York', pastCoverage: 0, relationship: 'Cold', lastContacted: '—' },
  { id: '4', name: 'David Kim', publication: 'VentureBeat', beat: 'Tech', email: 'dkim@venturebeat.com', twitter: '@davidkim', location: 'Seattle', pastCoverage: 1, relationship: 'Warm', lastContacted: '2026-04-28' },
  { id: '5', name: 'Priya Nair', publication: 'Economic Times', beat: 'Business', email: 'priya@et.com', twitter: '@priyanair', location: 'Mumbai', pastCoverage: 4, relationship: 'Hot', lastContacted: '2026-05-21' },
  { id: '6', name: 'James Liu', publication: 'Inc42', beat: 'Tech', email: 'james@inc42.com', twitter: '@jamesliu', location: 'Delhi', pastCoverage: 2, relationship: 'Warm', lastContacted: '2026-05-05' },
]

const MOCK_CAMPAIGNS: OutreachCampaign[] = [
  { id: '1', name: 'Seed Round Announcement', targeted: 45, sent: 45, opened: 31, replied: 8, coverage: 12 },
  { id: '2', name: 'Product Launch — May 2026', targeted: 30, sent: 28, opened: 19, replied: 5, coverage: 4 },
  { id: '3', name: 'Q1 Milestone Story', targeted: 20, sent: 0, opened: 0, replied: 0, coverage: 0 },
]

const MOCK_MENTIONS: MediaMention[] = [
  { id: '1', source: 'TechCrunch', headline: 'Ooumph raises $2M to bring AI marketing automation to SMBs', date: '2026-05-21', sentiment: 'Positive', reach: 4200000, tier: 'Tier 1', link: '#', value: 84000 },
  { id: '2', source: 'YourStory', headline: 'This Bangalore startup wants to be your AI CMO — and it\'s growing fast', date: '2026-05-20', sentiment: 'Positive', reach: 1800000, tier: 'Tier 1', link: '#', value: 36000 },
  { id: '3', source: 'VentureBeat', headline: 'AI marketing tools boom: Ooumph among new wave of SMB-focused platforms', date: '2026-05-19', sentiment: 'Neutral', reach: 950000, tier: 'Tier 2', link: '#', value: 19000 },
  { id: '4', source: 'Inc42', headline: 'Indian SaaS startups raising big in 2026 — Ooumph leads AI marketing category', date: '2026-05-18', sentiment: 'Positive', reach: 620000, tier: 'Tier 2', link: '#', value: 12400 },
  { id: '5', source: 'Startup Blink', headline: 'Ooumph listed in Top 10 AI marketing tools for 2026', date: '2026-05-16', sentiment: 'Positive', reach: 180000, tier: 'Tier 3', link: '#', value: 3600 },
  { id: '6', source: 'Medium Blog', headline: 'Why I switched to AI-first marketing (and how Ooumph changed my workflow)', date: '2026-05-14', sentiment: 'Positive', reach: 45000, tier: 'Tier 3', link: '#', value: 900 },
]

const PITCH_TEMPLATES = [
  { id: '1', name: 'Product Launch', icon: '🚀', description: 'Announce a new product, feature, or service to tech and business media.' },
  { id: '2', name: 'Funding Announcement', icon: '💰', description: 'Pitch the news of a seed, Series A, or grant to investors and media.' },
  { id: '3', name: 'Expert Commentary', icon: '🎤', description: 'Position your CEO or founders as thought leaders on trending topics.' },
  { id: '4', name: 'Partnership Announcement', icon: '🤝', description: 'Announce strategic partnerships or integrations with other brands.' },
  { id: '5', name: 'Event Coverage', icon: '📅', description: 'Invite media to cover your launch event, webinar, or conference.' },
]

const CRISIS_SCENARIOS = [
  {
    id: '1',
    scenario: 'Data Breach',
    statement: 'We recently became aware of an incident affecting some customer data. We are actively investigating the scope of the incident and have taken immediate steps to contain it. The security and privacy of our customers is our highest priority. We have notified the appropriate authorities and are working to notify affected customers directly. We will provide updates as our investigation progresses.',
  },
  {
    id: '2',
    scenario: 'Service Outage',
    statement: 'We are currently experiencing a service disruption affecting some users. Our engineering team is working urgently to restore full service. We sincerely apologize for the inconvenience and will provide updates every 30 minutes on our status page. Affected customers will receive credit for the downtime.',
  },
  {
    id: '3',
    scenario: 'Negative Coverage',
    statement: 'We have seen recent coverage that does not accurately reflect our product and practices. We take all feedback seriously and are committed to transparency. We invite the reporter to speak directly with our team so we can address any concerns and provide accurate information.',
  },
  {
    id: '4',
    scenario: 'Social Media Controversy',
    statement: 'We are aware of the discussion circulating on social media regarding our company. We want to be clear that the situation has been misrepresented. We stand firmly by our values and are taking the following steps to address the underlying concern. We will continue to engage transparently with our community.',
  },
]

const MEDIA_LISTS = [
  { id: '1', name: 'Tech Press — Tier 1', count: 12, lastUpdated: '2026-05-18' },
  { id: '2', name: 'Indian Startup Media', count: 24, lastUpdated: '2026-05-15' },
  { id: '3', name: 'Marketing & Martech', count: 18, lastUpdated: '2026-05-10' },
  { id: '4', name: 'Business & Finance Press', count: 31, lastUpdated: '2026-05-01' },
]

// ─── Helper Components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PRStatus }) {
  const map: Record<PRStatus, string> = {
    Draft: 'bg-gray-800 text-gray-400',
    Review: 'bg-yellow-900/40 text-yellow-400',
    Published: 'bg-blue-900/40 text-blue-400',
    Distributed: 'bg-green-900/40 text-green-400',
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>{status}</span>
}

function RelBadge({ rel }: { rel: Relationship }) {
  const map: Record<Relationship, string> = {
    Cold: 'bg-gray-800 text-gray-400',
    Warm: 'bg-orange-900/40 text-orange-400',
    Hot: 'bg-red-900/40 text-red-400',
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[rel]}`}>{rel}</span>
}

function SentimentBadge({ s }: { s: Sentiment }) {
  const map: Record<Sentiment, string> = {
    Positive: 'bg-green-900/40 text-green-400',
    Neutral: 'bg-gray-800 text-gray-400',
    Negative: 'bg-red-900/40 text-red-400',
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[s]}`}>{s}</span>
}

function TierBadge({ tier }: { tier: Tier }) {
  const map: Record<Tier, string> = {
    'Tier 1': 'text-yellow-400',
    'Tier 2': 'text-blue-400',
    'Tier 3': 'text-gray-500',
  }
  const stars: Record<Tier, string> = { 'Tier 1': '⭐⭐⭐', 'Tier 2': '⭐⭐', 'Tier 3': '⭐' }
  return <span className={`text-xs font-medium ${map[tier]}`}>{stars[tier]} {tier}</span>
}

function fmtNum(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

function fmtMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n}`
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PRStudioPage() {
  const [activeTab, setActiveTab] = useState<'releases' | 'outreach' | 'monitoring' | 'crisis' | 'contacts'>('releases')

  // PR Editor state
  const [showPREditor, setShowPREditor] = useState(false)
  const [prHeadline, setPrHeadline] = useState('')
  const [prSubheadline, setPrSubheadline] = useState('')
  const [prDateline, setPrDateline] = useState('Mumbai, India — May 26, 2026')
  const [prBody, setPrBody] = useState('')
  const [prBoilerplate, setPrBoilerplate] = useState('About Ooumph: Ooumph is an AI-first marketing automation platform that helps SMBs and growth-stage companies run full-stack marketing with autonomous AI agents. Founded in 2024, Ooumph is trusted by 500+ businesses across India and Southeast Asia.')
  const [prContact, setPrContact] = useState('Media Contact:\nPress Team, Ooumph\npress@ooumph.ai\n+91 98765 43210')
  const [aiGenerating, setAiGenerating] = useState(false)

  // Outreach state
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [selectedJournalists, setSelectedJournalists] = useState<Set<string>>(new Set())
  const [journalistFilter, setJournalistFilter] = useState<Beat | 'All'>('All')
  const [relFilter, setRelFilter] = useState<Relationship | 'All'>('All')

  // Monitoring state
  const [mentionFilter, setMentionFilter] = useState<Sentiment | 'All'>('All')
  const [alertKeyword, setAlertKeyword] = useState('')

  // Crisis state
  const [crisisDescription, setCrisisDescription] = useState('')
  const [generatedStatement, setGeneratedStatement] = useState('')
  const [crisisGenerating, setCrisisGenerating] = useState(false)
  const [crisisStatus, setCrisisStatus] = useState<'normal' | 'monitoring' | 'active'>('normal')

  // Contacts state
  const [showAddJournalist, setShowAddJournalist] = useState(false)
  const [showCreateList, setShowCreateList] = useState(false)

  // Slide-over
  const [selectedPR, setSelectedPR] = useState<PressRelease | null>(null)

  function simulateAI(delay = 1200) {
    return new Promise<void>(r => setTimeout(r, delay))
  }

  async function generateHeadline() {
    setAiGenerating(true)
    await simulateAI()
    setPrHeadline('Ooumph Raises $2M Seed to Bring AI Marketing Automation to 500,000 SMBs Across Southeast Asia')
    setAiGenerating(false)
  }

  async function writeWithAI() {
    if (!prHeadline) return
    setAiGenerating(true)
    await simulateAI(1800)
    setPrBody(`MUMBAI, INDIA — Ooumph, the AI-first marketing automation platform, today announced a major expansion milestone, crossing 500 paying customers with 210% month-over-month growth in Q1 2026. The company is redefining how small and medium businesses approach digital marketing by deploying autonomous AI agents that handle content creation, campaign management, social media, SEO, and PR simultaneously.

"We built Ooumph because SMBs deserve the same marketing firepower as Fortune 500 companies, without the agency fees or headcount," said the founder of Ooumph. "Our AI agents work 24/7, learning and optimizing in real time."

The platform's flagship product — a suite of seven AI marketing agents covering content, social media, email, ads, SEO, PR, and analytics — has processed over 50,000 marketing tasks in the past quarter alone. Customers report an average 4x improvement in content output and a 2.3x increase in qualified leads.

Ooumph's growth comes at a time when the global marketing automation market is projected to reach $13.7 billion by 2030. Unlike enterprise platforms such as HubSpot and Marketo, Ooumph is purpose-built for resource-constrained teams, with pricing starting at $49/month.

The company plans to expand its agent capabilities to include voice marketing, video production, and advanced predictive analytics in the coming months.

###`)
    setAiGenerating(false)
  }

  async function improveCopy() {
    if (!prBody) return
    setAiGenerating(true)
    await simulateAI(1400)
    setAiGenerating(false)
  }

  async function generateCrisisStatement() {
    if (!crisisDescription) return
    setCrisisGenerating(true)
    await simulateAI(1600)
    setGeneratedStatement(`We are aware of the situation regarding ${crisisDescription.slice(0, 40)}... Our leadership team has been briefed and is taking immediate action. We want to be transparent with our customers, partners, and the press: we take this matter extremely seriously. We have activated our response protocol and will provide verified updates every two hours. We are committed to resolving this swiftly and will not speculate until our investigation is complete. Our customers' trust is paramount, and we are doing everything in our power to address this situation with the urgency and care it deserves.`)
    setCrisisGenerating(false)
  }

  function toggleJournalist(id: string) {
    setSelectedJournalists(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredJournalists = MOCK_JOURNALISTS.filter(j => {
    if (journalistFilter !== 'All' && j.beat !== journalistFilter) return false
    if (relFilter !== 'All' && j.relationship !== relFilter) return false
    return true
  })

  const filteredMentions = MOCK_MENTIONS.filter(m => mentionFilter === 'All' || m.sentiment === mentionFilter)

  const totalCoverageValue = MOCK_MENTIONS.reduce((s, m) => s + m.value, 0)
  const positiveMentions = MOCK_MENTIONS.filter(m => m.sentiment === 'Positive').length
  const neutralMentions = MOCK_MENTIONS.filter(m => m.sentiment === 'Neutral').length
  const negativeMentions = MOCK_MENTIONS.filter(m => m.sentiment === 'Negative').length

  const TABS = [
    { id: 'releases' as const, label: 'Press Releases', icon: '📄' },
    { id: 'outreach' as const, label: 'Media Outreach', icon: '✉' },
    { id: 'monitoring' as const, label: 'Media Monitoring', icon: '📡' },
    { id: 'crisis' as const, label: 'Crisis Comms', icon: '🚨' },
    { id: 'contacts' as const, label: 'Contacts & Lists', icon: '👥' },
  ]

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-950">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg">📰</div>
            <div>
              <h1 className="text-lg font-bold text-white">PR Studio</h1>
              <p className="text-gray-500 text-xs">Full-stack PR, outreach & media monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 bg-blue-900/30 text-blue-400 border border-blue-800/40 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {MOCK_MENTIONS.length} mentions this month
            </span>
            <button onClick={() => setShowPREditor(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              📰 New Press Release
            </button>
            <button onClick={() => { setActiveTab('outreach'); setShowCampaignModal(true) }} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
              ✉ New Outreach
            </button>
            <button
              onClick={() => {
                const data = { generatedAt: new Date().toISOString(), mentions: MOCK_MENTIONS, coverageValue: totalCoverageValue }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'pr-report.json'; a.click()
              }}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
              📊 PR Report
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-6 gap-4 mt-5">
          {[
            { label: 'Press Releases', value: String(MOCK_PRS.filter(p => p.status !== 'Draft').length), sub: 'Published' },
            { label: 'Media Mentions', value: String(MOCK_MENTIONS.length), sub: 'This month' },
            { label: 'Journalist Contacts', value: String(MOCK_JOURNALISTS.length), sub: 'In database' },
            { label: 'Outreach Sent', value: String(MOCK_CAMPAIGNS.reduce((s, c) => s + c.sent, 0)), sub: 'Across campaigns' },
            { label: 'Response Rate', value: '22%', sub: 'Avg this quarter' },
            { label: 'Coverage Value', value: fmtMoney(totalCoverageValue), sub: 'Ad equivalent' },
          ].map(stat => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-white font-bold text-xl leading-none">{stat.value}</p>
              <p className="text-gray-400 text-xs mt-1">{stat.label}</p>
              <p className="text-gray-600 text-xs">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mt-5">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto p-6">

        {/* ═══ PRESS RELEASES TAB ═══ */}
        {activeTab === 'releases' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Press Releases</h2>
              <button onClick={() => setShowPREditor(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                + New Press Release
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">Title</th>
                    <th className="text-left px-5 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">Status</th>
                    <th className="text-left px-5 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">Date</th>
                    <th className="text-left px-5 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">Distribution</th>
                    <th className="text-left px-5 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">Coverage</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {MOCK_PRS.map((pr, i) => (
                    <tr key={pr.id} className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-900/40'}`}>
                      <td className="px-5 py-4">
                        <p className="text-white text-sm font-medium leading-snug max-w-md">{pr.title}</p>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={pr.status} /></td>
                      <td className="px-5 py-4 text-gray-400 text-sm">{pr.date}</td>
                      <td className="px-5 py-4 text-gray-400 text-sm">{pr.distributionCount > 0 ? fmtNum(pr.distributionCount) + ' reached' : '—'}</td>
                      <td className="px-5 py-4">
                        {pr.coverageLinks > 0
                          ? <span className="text-green-400 text-sm font-medium">{pr.coverageLinks} links</span>
                          : <span className="text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => setSelectedPR(pr)} className="text-indigo-400 hover:text-indigo-300 text-xs border border-indigo-900 hover:border-indigo-700 px-3 py-1.5 rounded-lg transition-colors">
                          {pr.status === 'Draft' ? 'Edit' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ MEDIA OUTREACH TAB ═══ */}
        {activeTab === 'outreach' && (
          <div className="space-y-8">
            {/* Journalist Database */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Journalist Database</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowAddJournalist(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + Add Journalist
                  </button>
                  <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                    Import CSV
                  </button>
                  {selectedJournalists.size > 0 && (
                    <button onClick={() => setShowCampaignModal(true)} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Send Outreach to {selectedJournalists.size} selected
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-500 text-xs">Beat:</span>
                {(['All', 'Tech', 'Business', 'Marketing', 'Lifestyle', 'Finance'] as const).map(f => (
                  <button key={f} onClick={() => setJournalistFilter(f as Beat | 'All')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${journalistFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    {f}
                  </button>
                ))}
                <span className="text-gray-500 text-xs ml-4">Relationship:</span>
                {(['All', 'Cold', 'Warm', 'Hot'] as const).map(f => (
                  <button key={f} onClick={() => setRelFilter(f as Relationship | 'All')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${relFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    {f}
                  </button>
                ))}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="w-10 px-4 py-3" />
                      {['Name', 'Publication', 'Beat', 'Email', 'Location', 'Coverage', 'Relationship', 'Last Contact'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJournalists.map(j => (
                      <tr key={j.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedJournalists.has(j.id)} onChange={() => toggleJournalist(j.id)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-0 cursor-pointer" />
                        </td>
                        <td className="px-3 py-3 text-white text-sm font-medium">{j.name}</td>
                        <td className="px-3 py-3 text-gray-400 text-sm">{j.publication}</td>
                        <td className="px-3 py-3"><span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{j.beat}</span></td>
                        <td className="px-3 py-3 text-gray-400 text-sm">{j.email}</td>
                        <td className="px-3 py-3 text-gray-400 text-sm">{j.location}</td>
                        <td className="px-3 py-3 text-gray-400 text-sm">{j.pastCoverage}</td>
                        <td className="px-3 py-3"><RelBadge rel={j.relationship} /></td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{j.lastContacted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Outreach Campaigns */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Outreach Campaigns</h2>
                <button onClick={() => setShowCampaignModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  + New Campaign
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {MOCK_CAMPAIGNS.map(c => (
                  <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-white font-semibold text-sm mb-3">{c.name}</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Targeted', value: c.targeted, color: 'text-gray-400' },
                        { label: 'Sent', value: c.sent, color: 'text-gray-300' },
                        { label: 'Opened', value: c.opened, color: 'text-blue-400' },
                        { label: 'Replied', value: c.replied, color: 'text-green-400' },
                        { label: 'Coverage pieces', value: c.coverage, color: 'text-indigo-400' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span className="text-gray-500 text-xs">{row.label}</span>
                          <span className={`font-semibold text-sm ${row.color}`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    {c.sent > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-800">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500">Open rate</span>
                          <span className="text-blue-400">{Math.round((c.opened / c.sent) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(c.opened / c.sent) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pitch Templates */}
            <div>
              <h2 className="text-white font-semibold mb-4">Pitch Template Library</h2>
              <div className="grid grid-cols-5 gap-3">
                {PITCH_TEMPLATES.map(t => (
                  <div key={t.id} className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl p-4 cursor-pointer transition-colors group">
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <p className="text-white text-sm font-medium mb-1">{t.name}</p>
                    <p className="text-gray-500 text-xs leading-relaxed">{t.description}</p>
                    <button className="mt-3 text-indigo-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">Use template →</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MEDIA MONITORING TAB ═══ */}
        {activeTab === 'monitoring' && (
          <div className="space-y-6">
            {/* Sentiment overview */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Positive', count: positiveMentions, color: 'text-green-400', bar: 'bg-green-500' },
                { label: 'Neutral', count: neutralMentions, color: 'text-gray-400', bar: 'bg-gray-500' },
                { label: 'Negative', count: negativeMentions, color: 'text-red-400', bar: 'bg-red-500' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">{s.label}</span>
                    <span className={`font-bold text-xl ${s.color}`}>{s.count}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${(s.count / MOCK_MENTIONS.length) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Coverage value */}
            <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">Estimated Coverage Value</p>
                <p className="text-white font-bold text-3xl">{fmtMoney(totalCoverageValue)}</p>
                <p className="text-indigo-300 text-xs mt-1">Ad equivalent value based on publication reach</p>
              </div>
              <button
                onClick={() => {
                  const data = { generatedAt: new Date().toISOString(), mentions: filteredMentions, totalValue: totalCoverageValue }
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'coverage-report.json'; a.click()
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Export Coverage Report
              </button>
            </div>

            {/* Alert settings */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-3">Alert when mentioned</p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={alertKeyword}
                  onChange={e => setAlertKeyword(e.target.value)}
                  placeholder="Enter keyword (e.g. Ooumph, your brand name)..."
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Set Alert
                </button>
              </div>
            </div>

            {/* Mentions feed */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">Mentions Feed</h2>
                <div className="flex items-center gap-2">
                  {(['All', 'Positive', 'Neutral', 'Negative'] as const).map(f => (
                    <button key={f} onClick={() => setMentionFilter(f as Sentiment | 'All')}
                      className={`text-xs px-3 py-1 rounded-full transition-colors ${mentionFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {filteredMentions.map(m => (
                  <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {m.source[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{m.headline}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-gray-500 text-xs">{m.source}</span>
                        <span className="text-gray-600 text-xs">{m.date}</span>
                        <TierBadge tier={m.tier} />
                        <span className="text-gray-500 text-xs">{fmtNum(m.reach)} reach</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <SentimentBadge s={m.sentiment} />
                      <span className="text-green-400 text-sm font-medium">{fmtMoney(m.value)}</span>
                      <a href={m.link} className="text-indigo-400 hover:text-indigo-300 text-xs">View →</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage by beat */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white text-sm font-semibold mb-4">Coverage by Publication Tier</h3>
              <div className="space-y-3">
                {[
                  { label: 'Tier 1 — Major Publications', count: MOCK_MENTIONS.filter(m => m.tier === 'Tier 1').length, color: 'bg-yellow-500' },
                  { label: 'Tier 2 — Industry Publications', count: MOCK_MENTIONS.filter(m => m.tier === 'Tier 2').length, color: 'bg-blue-500' },
                  { label: 'Tier 3 — Blogs & Niche Media', count: MOCK_MENTIONS.filter(m => m.tier === 'Tier 3').length, color: 'bg-gray-500' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-gray-400 text-xs w-48 flex-shrink-0">{row.label}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div className={`h-2 rounded-full ${row.color}`} style={{ width: `${(row.count / MOCK_MENTIONS.length) * 100}%` }} />
                    </div>
                    <span className="text-gray-400 text-xs w-4 text-right">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ CRISIS COMMUNICATIONS TAB ═══ */}
        {activeTab === 'crisis' && (
          <div className="space-y-6">
            {/* Crisis status banner */}
            <div className={`rounded-xl p-4 flex items-center justify-between ${crisisStatus === 'active' ? 'bg-red-900/30 border border-red-800' : crisisStatus === 'monitoring' ? 'bg-yellow-900/20 border border-yellow-800/50' : 'bg-green-900/20 border border-green-800/40'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full animate-pulse ${crisisStatus === 'active' ? 'bg-red-500' : crisisStatus === 'monitoring' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <span className={`font-semibold text-sm ${crisisStatus === 'active' ? 'text-red-400' : crisisStatus === 'monitoring' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {crisisStatus === 'active' ? 'ACTIVE CRISIS — Response in progress' : crisisStatus === 'monitoring' ? 'Monitoring — Elevated sensitivity' : 'All Clear — No active crisis'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(['normal', 'monitoring', 'active'] as const).map(s => (
                  <button key={s} onClick={() => setCrisisStatus(s)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors capitalize ${crisisStatus === s ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Crisis Response Playbook */}
            <div>
              <h2 className="text-white font-semibold mb-4">Crisis Response Playbook</h2>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { step: 1, title: 'Acknowledge', icon: '👁', desc: 'Publish a brief statement within 1 hour acknowledging the situation without admitting fault.' },
                  { step: 2, title: 'Investigate', icon: '🔍', desc: 'Gather verified facts. Brief leadership and legal team before any external communication.' },
                  { step: 3, title: 'Respond', icon: '📢', desc: 'Issue a full statement with facts, corrective actions, and timeline to resolution.' },
                  { step: 4, title: 'Monitor', icon: '📡', desc: 'Track media coverage and social sentiment in real time. Respond to journalist inquiries.' },
                  { step: 5, title: 'Follow-up', icon: '✅', desc: 'Publish resolution post, thank supporters, and update all stakeholders on outcome.' },
                ].map(step => (
                  <div key={step.step} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">{step.step}</span>
                      <span className="text-lg">{step.icon}</span>
                    </div>
                    <p className="text-white text-sm font-semibold mb-2">{step.title}</p>
                    <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
                    <button className="mt-3 text-indigo-400 hover:text-indigo-300 text-xs transition-colors">Draft message →</button>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Crisis Statement Generator */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">Generate Crisis Statement with AI</h3>
              <textarea
                rows={3}
                value={crisisDescription}
                onChange={e => setCrisisDescription(e.target.value)}
                placeholder="Describe the crisis situation briefly (e.g. 'A data breach affecting 200 customer email addresses was discovered on May 26, 2026')..."
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none mb-3"
              />
              <button
                onClick={generateCrisisStatement}
                disabled={crisisGenerating || !crisisDescription}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {crisisGenerating ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</> : '🤖 Generate Crisis Statement'}
              </button>
              {generatedStatement && (
                <div className="mt-4 p-4 bg-gray-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">AI-Generated Statement</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedStatement)}
                      className="text-xs text-indigo-400 hover:text-indigo-300">
                      Copy
                    </button>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{generatedStatement}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Distribute to Media
                    </button>
                    <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      Edit Statement
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Holding Statements */}
            <div>
              <h3 className="text-white font-semibold mb-4">Pre-Written Holding Statements</h3>
              <div className="grid grid-cols-2 gap-4">
                {CRISIS_SCENARIOS.map(s => (
                  <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-white font-semibold text-sm">{s.scenario}</p>
                      <button onClick={() => navigator.clipboard.writeText(s.statement)} className="text-xs text-indigo-400 hover:text-indigo-300">Copy</button>
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">{s.statement}</p>
                    <button className="mt-3 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">Customize with AI</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Crisis log */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Crisis Log Timeline</h3>
              <div className="space-y-3">
                {[
                  { time: '2026-05-20 09:14', event: 'Negative article published in Tech Insider', type: 'alert' },
                  { time: '2026-05-20 09:32', event: 'Holding statement published on website and social channels', type: 'action' },
                  { time: '2026-05-20 11:00', event: 'Full response statement issued to press', type: 'action' },
                  { time: '2026-05-20 14:00', event: 'Sentiment monitoring shows stabilisation', type: 'resolved' },
                ].map((entry, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${entry.type === 'alert' ? 'bg-red-500' : entry.type === 'action' ? 'bg-blue-500' : 'bg-green-500'}`} />
                    <div>
                      <p className="text-white text-sm">{entry.event}</p>
                      <p className="text-gray-500 text-xs">{entry.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ CONTACTS & LISTS TAB ═══ */}
        {activeTab === 'contacts' && (
          <div className="space-y-6">
            {/* Media Lists */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Media Lists</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowCreateList(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + Create List
                  </button>
                  <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                    Import CSV
                  </button>
                  <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                    Export All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {MEDIA_LISTS.map(list => (
                  <div key={list.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-indigo-700 transition-colors cursor-pointer">
                    <p className="text-white font-semibold text-sm">{list.name}</p>
                    <p className="text-gray-400 text-2xl font-bold mt-2">{list.count}</p>
                    <p className="text-gray-500 text-xs">journalists</p>
                    <p className="text-gray-600 text-xs mt-2">Updated {list.lastUpdated}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <button className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                      <span className="text-gray-700">·</span>
                      <button className="text-xs text-green-400 hover:text-green-300">Send Outreach</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Journalist Contacts */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">All Journalist Contacts</h2>
                <button onClick={() => setShowAddJournalist(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  + Add Journalist
                </button>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Name', 'Publication', 'Beat', 'Email', 'Twitter', 'Location', 'Past Coverage', 'Relationship', 'Last Contact', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-gray-500 text-xs font-medium uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_JOURNALISTS.map(j => (
                      <tr key={j.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3 text-white text-sm font-medium">{j.name}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{j.publication}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{j.beat}</span></td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{j.email}</td>
                        <td className="px-4 py-3 text-indigo-400 text-xs">{j.twitter}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{j.location}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{j.pastCoverage}</td>
                        <td className="px-4 py-3"><RelBadge rel={j.relationship} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{j.lastContacted}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                            <button className="text-xs text-gray-500 hover:text-red-400 transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ PR EDITOR MODAL ═══ */}
      {showPREditor && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-start justify-end">
          <div className="w-full max-w-3xl h-full bg-gray-900 border-l border-gray-800 overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-white font-bold text-lg">New Press Release</h2>
              <div className="flex items-center gap-2">
                <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                  Preview
                </button>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Publish & Distribute
                </button>
                <button onClick={() => setShowPREditor(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Headline */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Headline</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={prHeadline}
                    onChange={e => setPrHeadline(e.target.value)}
                    placeholder="Write a compelling headline..."
                    className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={generateHeadline} disabled={aiGenerating}
                    className="bg-gray-800 hover:bg-gray-700 text-indigo-400 px-3 py-2 rounded-xl border border-gray-700 text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 disabled:opacity-50">
                    {aiGenerating ? <span className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> : '🤖'}
                    Generate Headline
                  </button>
                </div>
              </div>
              {/* Subheadline */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Subheadline</label>
                <input
                  type="text"
                  value={prSubheadline}
                  onChange={e => setPrSubheadline(e.target.value)}
                  placeholder="Supporting detail that expands on the headline..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {/* Dateline */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Dateline</label>
                <input
                  type="text"
                  value={prDateline}
                  onChange={e => setPrDateline(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              {/* Formatting toolbar */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Body</label>
                <div className="flex items-center gap-1 mb-2 p-2 bg-gray-800 rounded-t-xl border border-gray-700 border-b-0">
                  {['Bold', 'Italic', 'H2', 'H3', 'Bullet', 'Quote'].map(fmt => (
                    <button key={fmt} className="px-3 py-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-medium transition-colors">
                      {fmt === 'Bold' ? 'B' : fmt === 'Italic' ? 'I' : fmt}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <textarea
                    rows={10}
                    value={prBody}
                    onChange={e => setPrBody(e.target.value)}
                    placeholder="Write the body of your press release here, or use the AI tools below..."
                    className="w-full px-4 py-3 rounded-b-xl bg-gray-800 border border-gray-700 border-t-0 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={writeWithAI} disabled={aiGenerating || !prHeadline}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5">
                      {aiGenerating ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Writing...</> : '📝 Write with AI'}
                    </button>
                    <button onClick={improveCopy} disabled={aiGenerating || !prBody}
                      className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700 flex items-center gap-1.5">
                      📋 Improve
                    </button>
                  </div>
                </div>
              </div>
              {/* Boilerplate */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Boilerplate (About section)</label>
                <textarea
                  rows={3}
                  value={prBoilerplate}
                  onChange={e => setPrBoilerplate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              {/* Contact info */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Media Contact</label>
                <textarea
                  rows={3}
                  value={prContact}
                  onChange={e => setPrContact(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              {/* Media assets */}
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Media Assets</label>
                <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center">
                  <p className="text-gray-500 text-sm">Drop images or videos here, or click to browse</p>
                  <button className="mt-2 text-indigo-400 text-xs">Browse files</button>
                </div>
              </div>
              {/* Distribution */}
              <div className="bg-gray-800 rounded-xl p-4">
                <label className="block text-gray-300 text-sm font-semibold mb-3">Distribution</label>
                <p className="text-gray-500 text-xs mb-3">Select wire services and journalist lists</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { name: 'PR Newswire', status: 'connected' },
                    { name: 'Business Wire', status: 'connected' },
                    { name: 'PRWeb', status: 'disconnected' },
                    { name: 'EIN Presswire', status: 'disconnected' },
                  ].map(wire => (
                    <div key={wire.name} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                      <span className="text-gray-300 text-sm">{wire.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${wire.status === 'connected' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                        {wire.status === 'connected' ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-500 text-xs">Estimated reach: <span className="text-white font-semibold">~1.2M journalists & newsrooms</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NEW OUTREACH CAMPAIGN MODAL ═══ */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold">New Outreach Campaign</h2>
              <button onClick={() => setShowCampaignModal(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Campaign Name</label>
                <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. Series A Funding Announcement"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Email Template</label>
                <select className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {PITCH_TEMPLATES.map(t => <option key={t.id}>{t.name}</option>)}
                  <option>Custom template</option>
                </select>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Personalization fields</p>
                <div className="flex flex-wrap gap-2">
                  {['{firstName}', '{publication}', '{recentArticle}', '{beat}'].map(f => (
                    <span key={f} className="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800/40 px-2 py-1 rounded">{f}</span>
                  ))}
                </div>
                <button className="mt-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                  🤖 Personalize with AI
                </button>
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Follow-up Sequence</label>
                <div className="space-y-2">
                  {[{ day: 3, label: 'Day 3 follow-up' }, { day: 7, label: 'Day 7 reminder' }, { day: 14, label: 'Day 14 final check-in' }].map(f => (
                    <div key={f.day} className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-0" />
                      <span className="text-gray-300 text-sm">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Schedule Send</label>
                <input type="datetime-local" className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setShowCampaignModal(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Launch Campaign
                </button>
                <button onClick={() => setShowCampaignModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD JOURNALIST MODAL ═══ */}
      {showAddJournalist && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold">Add Journalist</h2>
              <button onClick={() => setShowAddJournalist(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Name', placeholder: 'Sarah Chen', type: 'text' },
                { label: 'Publication', placeholder: 'TechCrunch', type: 'text' },
                { label: 'Email', placeholder: 'sarah@techcrunch.com', type: 'email' },
                { label: 'Twitter', placeholder: '@sarahchen', type: 'text' },
                { label: 'Location', placeholder: 'San Francisco, CA', type: 'text' },
              ].map(field => (
                <div key={field.label}>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              ))}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Beat</label>
                <select className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {(['Tech', 'Business', 'Marketing', 'Lifestyle', 'Finance', 'Health'] as Beat[]).map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddJournalist(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Add Contact
                </button>
                <button onClick={() => setShowAddJournalist(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREATE LIST MODAL ═══ */}
      {showCreateList && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold">Create Media List</h2>
              <button onClick={() => setShowCreateList(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">List Name</label>
                <input type="text" placeholder="e.g. Series B Announcement — Tier 1 Tech Press"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-2">Add journalists from database</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {MOCK_JOURNALISTS.map(j => (
                    <div key={j.id} className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-0" />
                      <div>
                        <p className="text-white text-sm">{j.name}</p>
                        <p className="text-gray-500 text-xs">{j.publication} · {j.beat}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreateList(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Create List
                </button>
                <button onClick={() => setShowCreateList(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PR DETAIL SLIDE-OVER ═══ */}
      {selectedPR && (
        <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-40 flex items-start justify-end" onClick={() => setSelectedPR(null)}>
          <div className="w-96 h-full bg-gray-900 border-l border-gray-800 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">PR Details</h3>
              <button onClick={() => setSelectedPR(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <StatusBadge status={selectedPR.status} />
              <h4 className="text-white font-semibold text-sm leading-snug mt-2">{selectedPR.title}</h4>
              <div className="space-y-2">
                {[
                  { label: 'Date', value: selectedPR.date },
                  { label: 'Distribution reach', value: selectedPR.distributionCount > 0 ? fmtNum(selectedPR.distributionCount) : 'Not distributed' },
                  { label: 'Coverage links', value: selectedPR.coverageLinks > 0 ? String(selectedPR.coverageLinks) : 'None yet' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">{row.label}</span>
                    <span className="text-white text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => { setShowPREditor(true); setSelectedPR(null) }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Edit Press Release
                </button>
                {selectedPR.status !== 'Distributed' && (
                  <button className="w-full bg-green-700 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    Distribute Now
                  </button>
                )}
                <button className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Duplicate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
