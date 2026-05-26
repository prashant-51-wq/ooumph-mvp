'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'Active' | 'Draft' | 'Scheduled' | 'Completed' | 'Paused'
type CampaignType = 'Email' | 'Social' | 'Ads' | 'Content' | 'Multi-channel'

interface Channel {
  name: string
  icon: string
  enabled: boolean
  budget: number
  impressions: number
  clicks: number
  ctr: number
}

interface ContentPiece {
  type: string
  title: string
  status: 'Draft' | 'Approved' | 'Published'
  platform: string
  performance?: string
}

interface Campaign {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  goal: string
  description: string
  startDate: string
  endDate: string
  budget: number
  spend: number
  roi: number
  performanceScore: number
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  leads: number
  cpl: number
  roas: number
  channels: Channel[]
  content: ContentPiece[]
  progress: number
  dailyData: number[]
  funnel: { stage: string; count: number; cvr: number; drop: number }[]
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1',
    name: 'Summer Product Launch 2026',
    type: 'Multi-channel',
    status: 'Active',
    goal: 'Generate 1,000 qualified leads at under $25 CPL',
    description: 'Full-funnel launch campaign for our new product line. Targeting warm audiences via email + social + paid ads.',
    startDate: 'May 1, 2026',
    endDate: 'Jun 30, 2026',
    budget: 15000,
    spend: 7240,
    roi: 312,
    performanceScore: 87,
    impressions: 284000,
    clicks: 8520,
    ctr: 3.0,
    conversions: 612,
    leads: 612,
    cpl: 11.82,
    roas: 4.1,
    progress: 48,
    dailyData: [180, 220, 310, 270, 340, 290, 380, 420, 390, 450, 410, 480, 520, 490, 540, 500, 570, 610, 580, 640, 700, 660, 720, 680, 750, 780, 810, 770],
    channels: [
      { name: 'Email', icon: '✉', enabled: true, budget: 30, impressions: 45000, clicks: 2700, ctr: 6.0 },
      { name: 'Social', icon: '📱', enabled: true, budget: 25, impressions: 156000, clicks: 3120, ctr: 2.0 },
      { name: 'Ads', icon: '🎯', enabled: true, budget: 35, impressions: 74000, clicks: 2220, ctr: 3.0 },
      { name: 'Blog', icon: '📝', enabled: true, budget: 10, impressions: 9000, clicks: 480, ctr: 5.3 },
    ],
    content: [
      { type: 'Email', title: 'Launch Announcement', status: 'Published', platform: 'Klaviyo', performance: '42% open rate' },
      { type: 'Social', title: 'Hero Product Reel', status: 'Published', platform: 'Instagram', performance: '8.4K views' },
      { type: 'Ad', title: 'Carousel Ad — Benefits', status: 'Approved', platform: 'Meta Ads', performance: '3.2% CTR' },
      { type: 'Blog', title: 'Why Our Product Changes Everything', status: 'Draft', platform: 'Website' },
    ],
    funnel: [
      { stage: 'Impressions', count: 284000, cvr: 100, drop: 0 },
      { stage: 'Clicks', count: 8520, cvr: 3.0, drop: 97.0 },
      { stage: 'Leads', count: 612, cvr: 7.2, drop: 92.8 },
      { stage: 'Qualified', count: 204, cvr: 33.3, drop: 66.7 },
      { stage: 'Customers', count: 41, cvr: 20.1, drop: 79.9 },
    ],
  },
  {
    id: '2',
    name: 'Q2 Brand Awareness Push',
    type: 'Social',
    status: 'Active',
    goal: 'Reach 500K unique users and grow social following by 20%',
    description: 'Organic + paid social campaign to boost brand recognition in new markets.',
    startDate: 'Apr 15, 2026',
    endDate: 'Jun 15, 2026',
    budget: 8000,
    spend: 5100,
    roi: 180,
    performanceScore: 74,
    impressions: 412000,
    clicks: 9080,
    ctr: 2.2,
    conversions: 320,
    leads: 320,
    cpl: 15.94,
    roas: 2.8,
    progress: 64,
    dailyData: [120, 140, 190, 210, 180, 240, 270, 250, 310, 290, 330, 350, 320, 380, 400, 370, 410, 430, 460, 440, 480, 500, 470, 520, 540, 510, 560, 580],
    channels: [
      { name: 'Social', icon: '📱', enabled: true, budget: 70, impressions: 320000, clicks: 7040, ctr: 2.2 },
      { name: 'Ads', icon: '🎯', enabled: true, budget: 30, impressions: 92000, clicks: 2040, ctr: 2.2 },
    ],
    content: [
      { type: 'Social', title: 'Behind the Brand Series Ep.1', status: 'Published', platform: 'Instagram', performance: '12.1K views' },
      { type: 'Social', title: 'Customer Spotlight Video', status: 'Published', platform: 'LinkedIn', performance: '4.2K views' },
      { type: 'Ad', title: 'Brand Story Ad', status: 'Approved', platform: 'Facebook' },
    ],
    funnel: [
      { stage: 'Impressions', count: 412000, cvr: 100, drop: 0 },
      { stage: 'Clicks', count: 9080, cvr: 2.2, drop: 97.8 },
      { stage: 'Leads', count: 320, cvr: 3.5, drop: 96.5 },
      { stage: 'Qualified', count: 96, cvr: 30.0, drop: 70.0 },
      { stage: 'Customers', count: 18, cvr: 18.8, drop: 81.2 },
    ],
  },
  {
    id: '3',
    name: 'Lead Gen — Enterprise Tier',
    type: 'Email',
    status: 'Scheduled',
    goal: 'Book 50 enterprise demos in June',
    description: 'Targeted outbound email + LinkedIn sequence to enterprise decision makers.',
    startDate: 'Jun 1, 2026',
    endDate: 'Jun 30, 2026',
    budget: 4000,
    spend: 0,
    roi: 0,
    performanceScore: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    conversions: 0,
    leads: 0,
    cpl: 0,
    roas: 0,
    progress: 0,
    dailyData: Array(28).fill(0),
    channels: [
      { name: 'Email', icon: '✉', enabled: true, budget: 60, impressions: 0, clicks: 0, ctr: 0 },
      { name: 'Social', icon: '📱', enabled: true, budget: 40, impressions: 0, clicks: 0, ctr: 0 },
    ],
    content: [
      { type: 'Email', title: 'Cold Outreach Sequence (5 emails)', status: 'Approved', platform: 'Klaviyo' },
      { type: 'Social', title: 'LinkedIn Thought Leadership Post', status: 'Draft', platform: 'LinkedIn' },
    ],
    funnel: [
      { stage: 'Impressions', count: 0, cvr: 0, drop: 0 },
      { stage: 'Clicks', count: 0, cvr: 0, drop: 0 },
      { stage: 'Leads', count: 0, cvr: 0, drop: 0 },
      { stage: 'Qualified', count: 0, cvr: 0, drop: 0 },
      { stage: 'Customers', count: 0, cvr: 0, drop: 0 },
    ],
  },
  {
    id: '4',
    name: 'Re-engagement — Churned Users',
    type: 'Email',
    status: 'Paused',
    goal: 'Win back 15% of churned users with a special offer',
    description: 'Automated re-engagement flow for users inactive 90+ days.',
    startDate: 'Mar 1, 2026',
    endDate: 'Apr 30, 2026',
    budget: 2000,
    spend: 1840,
    roi: 94,
    performanceScore: 52,
    impressions: 18400,
    clicks: 920,
    ctr: 5.0,
    conversions: 87,
    leads: 87,
    cpl: 21.15,
    roas: 1.9,
    progress: 92,
    dailyData: [80, 90, 70, 110, 100, 95, 120, 140, 130, 150, 160, 140, 170, 190, 180, 200, 210, 195, 220, 240, 230, 0, 0, 0, 0, 0, 0, 0],
    channels: [
      { name: 'Email', icon: '✉', enabled: true, budget: 100, impressions: 18400, clicks: 920, ctr: 5.0 },
    ],
    content: [
      { type: 'Email', title: 'We miss you! Come back offer', status: 'Published', platform: 'Klaviyo', performance: '28% open rate' },
      { type: 'Email', title: 'Last chance — offer expires', status: 'Published', platform: 'Klaviyo', performance: '19% open rate' },
    ],
    funnel: [
      { stage: 'Impressions', count: 18400, cvr: 100, drop: 0 },
      { stage: 'Clicks', count: 920, cvr: 5.0, drop: 95.0 },
      { stage: 'Leads', count: 87, cvr: 9.5, drop: 90.5 },
      { stage: 'Qualified', count: 42, cvr: 48.3, drop: 51.7 },
      { stage: 'Customers', count: 14, cvr: 33.3, drop: 66.7 },
    ],
  },
  {
    id: '5',
    name: 'Holiday Content Blitz',
    type: 'Content',
    status: 'Completed',
    goal: 'Publish 60 holiday posts across all channels in December',
    description: 'High-volume content production and scheduling for holiday season.',
    startDate: 'Dec 1, 2025',
    endDate: 'Dec 31, 2025',
    budget: 3000,
    spend: 2980,
    roi: 240,
    performanceScore: 91,
    impressions: 198000,
    clicks: 7920,
    ctr: 4.0,
    conversions: 580,
    leads: 580,
    cpl: 5.14,
    roas: 3.4,
    progress: 100,
    dailyData: [200, 240, 280, 260, 320, 350, 380, 420, 400, 450, 480, 500, 520, 560, 540, 600, 640, 680, 700, 720, 760, 800, 840, 880, 920, 960, 980, 1020],
    channels: [
      { name: 'Social', icon: '📱', enabled: true, budget: 50, impressions: 112000, clicks: 4480, ctr: 4.0 },
      { name: 'Email', icon: '✉', enabled: true, budget: 30, impressions: 52000, clicks: 2600, ctr: 5.0 },
      { name: 'Blog', icon: '📝', enabled: true, budget: 20, impressions: 34000, clicks: 840, ctr: 2.5 },
    ],
    content: [
      { type: 'Social', title: '12 Days of Deals Series', status: 'Published', platform: 'Instagram', performance: '62K reach' },
      { type: 'Email', title: 'Holiday Gift Guide Email', status: 'Published', platform: 'Klaviyo', performance: '51% open rate' },
      { type: 'Blog', title: 'Top 10 Gifts for 2025', status: 'Published', platform: 'Website', performance: '3.2K views' },
    ],
    funnel: [
      { stage: 'Impressions', count: 198000, cvr: 100, drop: 0 },
      { stage: 'Clicks', count: 7920, cvr: 4.0, drop: 96.0 },
      { stage: 'Leads', count: 580, cvr: 7.3, drop: 92.7 },
      { stage: 'Qualified', count: 232, cvr: 40.0, drop: 60.0 },
      { stage: 'Customers', count: 68, cvr: 29.3, drop: 70.7 },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

function statusStyle(s: CampaignStatus) {
  if (s === 'Active') return 'bg-green-500/15 text-green-400 border border-green-500/20'
  if (s === 'Draft') return 'bg-gray-700/60 text-gray-400 border border-gray-600/20'
  if (s === 'Scheduled') return 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
  if (s === 'Completed') return 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
  return 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
}

function typeStyle(t: CampaignType) {
  if (t === 'Email') return 'bg-purple-500/15 text-purple-400'
  if (t === 'Social') return 'bg-pink-500/15 text-pink-400'
  if (t === 'Ads') return 'bg-orange-500/15 text-orange-400'
  if (t === 'Content') return 'bg-cyan-500/15 text-cyan-400'
  return 'bg-indigo-500/15 text-indigo-400'
}

function contentStatusStyle(s: string) {
  if (s === 'Published') return 'bg-green-500/15 text-green-400'
  if (s === 'Approved') return 'bg-blue-500/15 text-blue-400'
  return 'bg-gray-700/60 text-gray-400'
}

// ─── New Campaign Modal ───────────────────────────────────────────────────────

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', type: [] as string[], goal: '', description: '',
    audience: '', budget: '', startDate: '', endDate: '',
    template: '',
    budgets: { Email: 25, Social: 35, Ads: 30, Blog: 10 } as Record<string, number>,
  })
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  function f(k: string, v: unknown) { setForm(p => ({ ...p, [k]: v })) }
  function toggleType(t: string) {
    setForm(p => ({
      ...p,
      type: p.type.includes(t) ? p.type.filter(x => x !== t) : [...p.type, t],
    }))
  }

  async function generatePlan() {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 1800))
    setGenerating(false)
    setGenerated(true)
    setStep(2)
  }

  const TEMPLATES = ['Product Launch', 'Brand Awareness', 'Lead Gen', 'Re-engagement', 'Seasonal']
  const CHANNEL_TYPES = ['Email', 'Social', 'Ads', 'Blog', 'SMS', 'Push']

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-lg">New Campaign</h2>
            <p className="text-gray-500 text-xs mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {step === 1 && (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Campaign Name</label>
                <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Summer Product Launch 2026"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-2 block">Campaign Channels (multi-select)</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_TYPES.map(t => (
                    <button key={t} onClick={() => toggleType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.type.includes(t) ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Campaign Goal</label>
                <input value={form.goal} onChange={e => f('goal', e.target.value)} placeholder="Generate 500 qualified leads at under $25 CPL"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Description</label>
                <textarea rows={3} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Describe the campaign strategy and key messages..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Target Audience</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option>Select CRM segment...</option>
                  {['All Leads', 'Warm Prospects', 'Enterprise Decision Makers', 'Churned Users', 'VIP Customers'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Total Budget ($)</label>
                  <input value={form.budget} onChange={e => f('budget', e.target.value)} placeholder="10000" type="number"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Start Date</label>
                  <input value={form.startDate} onChange={e => f('startDate', e.target.value)} type="date"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">End Date</label>
                  <input value={form.endDate} onChange={e => f('endDate', e.target.value)} type="date"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-2 block">Template</label>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map(t => (
                    <button key={t} onClick={() => f('template', t)}
                      className={`py-2.5 px-3 text-xs rounded-lg border transition-colors ${form.template === t ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={generatePlan} disabled={generating || !form.name || !form.goal}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2">
                {generating ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating Campaign Plan with AI...
                  </>
                ) : 'Generate Campaign Plan with AI'}
              </button>
            </>
          )}
          {step === 2 && generated && (
            <>
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                <p className="text-indigo-300 text-sm font-medium mb-1">AI Campaign Plan Generated</p>
                <p className="text-gray-400 text-xs">Your campaign brief has been created with channel strategy, content plan, and budget allocation. Review and launch below.</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-2 block">Budget Allocation by Channel</label>
                <div className="space-y-3">
                  {form.type.length > 0 ? form.type.map(ch => (
                    <div key={ch} className="flex items-center gap-3">
                      <span className="text-gray-300 text-sm w-16">{ch}</span>
                      <input type="range" min={0} max={100}
                        value={form.budgets[ch] || 25}
                        onChange={e => setForm(p => ({ ...p, budgets: { ...p.budgets, [ch]: Number(e.target.value) } }))}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-white text-sm w-10 text-right">{form.budgets[ch] || 25}%</span>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-xs">No channels selected</p>
                  )}
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="text-white">{form.name || 'New Campaign'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Channels</span><span className="text-white">{form.type.length > 0 ? form.type.join(', ') : 'Multi-channel'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Goal</span><span className="text-white text-xs max-w-xs text-right">{form.goal || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Budget</span><span className="text-white">{form.budget ? `$${Number(form.budget).toLocaleString()}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Template</span><span className="text-white">{form.template || 'Custom'}</span></div>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-5">
          {step === 2 && <button onClick={() => setStep(1)} className="flex-1 py-2.5 text-sm text-gray-400 border border-gray-700 rounded-xl hover:text-white transition-colors">Back</button>}
          <button onClick={onClose} className="flex-1 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors">
            {step === 2 ? 'Launch Campaign' : 'Save as Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Detail ──────────────────────────────────────────────────────────

function CampaignDetail({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [detailTab, setDetailTab] = useState<'overview' | 'channels' | 'content' | 'funnel' | 'analytics' | 'budget'>('overview')
  const maxBar = Math.max(...campaign.dailyData.filter(n => n > 0), 1)
  const totalBudget = campaign.budget
  const spendPct = totalBudget > 0 ? Math.round((campaign.spend / totalBudget) * 100) : 0

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h2 className="text-white font-bold text-xl">{campaign.name}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeStyle(campaign.type)}`}>{campaign.type}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle(campaign.status)}`}>{campaign.status}</span>
            </div>
            <p className="text-gray-400 text-sm">{campaign.startDate} — {campaign.endDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-4">×</button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-gray-800 overflow-x-auto">
          {([
            ['overview', 'Overview'],
            ['channels', 'Channels'],
            ['content', 'Content'],
            ['funnel', 'Funnel Insights'],
            ['analytics', 'Analytics'],
            ['budget', 'Budget'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setDetailTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${detailTab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Overview */}
          {detailTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Goal</p>
                <p className="text-white text-sm">{campaign.goal}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Description</p>
                <p className="text-gray-300 text-sm leading-relaxed">{campaign.description}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1.5">Campaign Progress</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${campaign.progress >= 80 ? 'bg-green-500' : campaign.progress >= 40 ? 'bg-indigo-500' : 'bg-gray-600'}`}
                      style={{ width: `${campaign.progress}%` }} />
                  </div>
                  <span className="text-white text-sm font-semibold w-10">{campaign.progress}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Performance Score', value: campaign.performanceScore ? `${campaign.performanceScore}/100` : '—', color: campaign.performanceScore >= 75 ? 'text-green-400' : campaign.performanceScore >= 50 ? 'text-amber-400' : 'text-gray-500' },
                  { label: 'ROI', value: campaign.roi ? `${campaign.roi}%` : '—', color: campaign.roi >= 200 ? 'text-green-400' : campaign.roi > 0 ? 'text-amber-400' : 'text-gray-500' },
                  { label: 'Budget Used', value: totalBudget > 0 ? `${spendPct}%` : '—', color: 'text-white' },
                  { label: 'Leads', value: campaign.leads ? fmtNum(campaign.leads) : '—', color: 'text-indigo-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800 rounded-xl p-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-gray-500 text-xs mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Channels */}
          {detailTab === 'channels' && (
            <div className="space-y-3">
              {campaign.channels.map(ch => (
                <div key={ch.name} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ch.icon}</span>
                      <span className="text-white font-semibold">{ch.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs">Budget: {ch.budget}%</span>
                      <div className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <span className="text-gray-400 text-xs">{ch.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-gray-500 text-xs mb-0.5">Impressions</p><p className="text-white font-semibold">{fmtNum(ch.impressions)}</p></div>
                    <div><p className="text-gray-500 text-xs mb-0.5">Clicks</p><p className="text-white font-semibold">{fmtNum(ch.clicks)}</p></div>
                    <div><p className="text-gray-500 text-xs mb-0.5">CTR</p><p className={`font-semibold ${ch.ctr >= 3 ? 'text-green-400' : ch.ctr >= 1 ? 'text-amber-400' : 'text-gray-400'}`}>{ch.ctr > 0 ? `${ch.ctr.toFixed(1)}%` : '—'}</p></div>
                  </div>
                  <div className="mt-3">
                    <p className="text-gray-500 text-xs mb-1">Budget allocation</p>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${ch.budget}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="w-full py-2.5 border border-dashed border-gray-700 hover:border-gray-500 text-gray-500 hover:text-gray-300 text-sm rounded-xl transition-colors">
                + Add Channel
              </button>
            </div>
          )}
          {/* Content */}
          {detailTab === 'content' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">Content Pieces ({campaign.content.length})</h3>
                <div className="flex gap-2">
                  <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">Generate Content</button>
                  <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs transition-colors">View in Approvals →</button>
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      {['Type', 'Title', 'Status', 'Platform', 'Performance'].map(h => (
                        <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.content.map((c, i) => (
                      <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                        <td className="px-4 py-3"><span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded">{c.type}</span></td>
                        <td className="px-4 py-3 text-white font-medium text-sm">{c.title}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${contentStatusStyle(c.status)}`}>{c.status}</span></td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{c.platform}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.performance || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Funnel */}
          {detailTab === 'funnel' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-1">Conversion Funnel</h3>
                <p className="text-gray-500 text-xs">Click-through at each funnel stage</p>
              </div>
              {campaign.funnel[0].count === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
                  <p className="text-lg mb-1">No funnel data yet</p>
                  <p className="text-sm">Launch the campaign to see funnel metrics</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {campaign.funnel.map((stage, i) => {
                    const maxCount = campaign.funnel[0].count || 1
                    const pct = (stage.count / maxCount) * 100
                    const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-green-500']
                    return (
                      <div key={stage.stage} className="bg-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 text-xs w-4">{i + 1}</span>
                            <span className="text-white font-medium text-sm">{stage.stage}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-white font-bold">{fmtNum(stage.count)}</span>
                            {i > 0 && <span className="text-gray-400">CVR: <span className="text-cyan-400">{stage.cvr.toFixed(1)}%</span></span>}
                            {i > 0 && stage.drop > 0 && <span className="text-red-400">Drop: {stage.drop.toFixed(0)}%</span>}
                          </div>
                        </div>
                        <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {campaign.funnel[0].count > 0 && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                  <p className="text-indigo-300 text-xs font-medium mb-2">AI Recommendations</p>
                  <ul className="space-y-1.5">
                    {['Improve ad creative to boost click-through from Impressions to Clicks stage',
                      'Add lead magnet on landing page to increase Clicks to Leads conversion',
                      'Implement lead scoring to qualify leads faster and improve Leads to Qualified rate'].map(r => (
                      <li key={r} className="text-gray-400 text-xs flex gap-1.5">
                        <span className="text-indigo-400">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {/* Analytics */}
          {detailTab === 'analytics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Impressions', value: fmtNum(campaign.impressions), color: 'text-white' },
                  { label: 'Clicks', value: fmtNum(campaign.clicks), color: 'text-white' },
                  { label: 'CTR', value: campaign.ctr ? `${campaign.ctr.toFixed(1)}%` : '—', color: campaign.ctr >= 3 ? 'text-green-400' : campaign.ctr >= 1 ? 'text-amber-400' : 'text-gray-500' },
                  { label: 'Conversions', value: fmtNum(campaign.conversions), color: 'text-white' },
                  { label: 'CPL', value: campaign.cpl ? `$${campaign.cpl.toFixed(2)}` : '—', color: campaign.cpl <= 20 ? 'text-green-400' : campaign.cpl <= 40 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'ROAS', value: campaign.roas ? `${campaign.roas.toFixed(1)}x` : '—', color: campaign.roas >= 3 ? 'text-green-400' : campaign.roas >= 1 ? 'text-amber-400' : 'text-gray-500' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-800 rounded-xl p-4 text-center">
                    <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                    <p className="text-gray-500 text-xs mt-1">{k.label}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-gray-400 text-xs font-medium mb-2">Daily Performance (last 28 days)</p>
                {campaign.dailyData.every(n => n === 0) ? (
                  <div className="h-24 bg-gray-800 rounded-xl flex items-center justify-center text-gray-600 text-sm">No data yet</div>
                ) : (
                  <div className="flex items-end gap-0.5 h-24 bg-gray-800 rounded-xl px-3 pt-3 pb-2">
                    {campaign.dailyData.map((v, i) => (
                      <div key={i} className="flex-1 bg-indigo-600/70 hover:bg-indigo-500 rounded-t transition-colors"
                        style={{ height: `${(v / Math.max(...campaign.dailyData)) * 100}%` }} title={`Day ${i + 1}: ${v}`} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs font-medium mb-2">Channel Breakdown</p>
                <div className="space-y-2">
                  {campaign.channels.map(ch => {
                    const maxImp = Math.max(...campaign.channels.map(c => c.impressions), 1)
                    return (
                      <div key={ch.name} className="flex items-center gap-3">
                        <span className="text-gray-300 text-xs w-14">{ch.name}</span>
                        <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${maxImp > 0 ? (ch.impressions / maxImp) * 100 : 0}%` }} />
                        </div>
                        <span className="text-gray-400 text-xs w-14 text-right">{fmtNum(ch.impressions)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-medium mb-2">Top Performing Content</p>
                <div className="space-y-2">
                  {campaign.content.filter(c => c.performance).map((c, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded">{c.type}</span>
                        <span className="text-gray-300 text-sm">{c.title}</span>
                      </div>
                      <span className="text-green-400 text-xs font-medium">{c.performance}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Budget */}
          {detailTab === 'budget' && (
            <div className="space-y-5">
              <div className="bg-gray-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-gray-300 font-semibold">Total Budget</p>
                  <p className="text-white font-bold">${campaign.budget.toLocaleString()}</p>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full ${spendPct >= 90 ? 'bg-red-500' : spendPct >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${spendPct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Spent: <span className="text-white font-medium">${campaign.spend.toLocaleString()}</span></span>
                  <span className="text-gray-400">Remaining: <span className="text-green-400 font-medium">${(campaign.budget - campaign.spend).toLocaleString()}</span></span>
                  <span className="text-gray-400">{spendPct}% used</span>
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-medium mb-3">Per-Channel Spend vs Budget</p>
                <div className="space-y-3">
                  {campaign.channels.map(ch => {
                    const chBudget = Math.round((ch.budget / 100) * campaign.budget)
                    const chSpend = Math.round((ch.budget / 100) * campaign.spend)
                    const chPct = chBudget > 0 ? Math.round((chSpend / chBudget) * 100) : 0
                    return (
                      <div key={ch.name} className="bg-gray-800 rounded-xl p-4">
                        <div className="flex justify-between mb-2">
                          <span className="text-gray-300 text-sm font-medium">{ch.icon} {ch.name}</span>
                          <span className="text-gray-400 text-xs">${chSpend.toLocaleString()} / ${chBudget.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(chPct, 100)}%` }} />
                        </div>
                        <p className="text-gray-500 text-xs mt-1">{chPct}% of budget used</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-3">Budget Projection</p>
                <div className="grid grid-cols-3 gap-3 text-sm text-center">
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-white font-bold">${campaign.budget.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">Total Budget</p>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-amber-400 font-bold">${Math.round(campaign.budget * 1.05).toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">Projected Spend</p>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-white font-bold">${campaign.spend.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">Actual Spend</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ campaigns, onSelect }: { campaigns: Campaign[]; onSelect: (c: Campaign) => void }) {
  const COLUMNS: { status: CampaignStatus; color: string; headerColor: string }[] = [
    { status: 'Draft', color: 'border-t-gray-500', headerColor: 'text-gray-400' },
    { status: 'Active', color: 'border-t-green-500', headerColor: 'text-green-400' },
    { status: 'Scheduled', color: 'border-t-blue-500', headerColor: 'text-blue-400' },
    { status: 'Paused', color: 'border-t-amber-500', headerColor: 'text-amber-400' },
    { status: 'Completed', color: 'border-t-teal-500', headerColor: 'text-teal-400' },
  ]
  const byStatus = (s: CampaignStatus) => campaigns.filter(c => c.status === s)
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map(col => (
          <div key={col.status} className={`w-56 bg-gray-900 border border-gray-800 rounded-xl flex flex-col border-t-2 ${col.color}`}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
              <span className={`text-xs font-bold uppercase tracking-wider ${col.headerColor}`}>{col.status}</span>
              <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">{byStatus(col.status).length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {byStatus(col.status).length === 0 ? (
                <div className="border border-dashed border-gray-700 rounded-lg p-4 text-center">
                  <p className="text-gray-600 text-xs">No campaigns</p>
                </div>
              ) : byStatus(col.status).map(c => (
                <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3 space-y-2 cursor-pointer hover:border-gray-500 transition-colors" onClick={() => onSelect(c)}>
                  <p className="text-white text-xs font-semibold leading-tight">{c.name}</p>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${typeStyle(c.type)}`}>{c.type}</span>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div className="flex justify-between"><span>Budget</span><span className="text-gray-300">${c.budget.toLocaleString()}</span></div>
                    {c.leads > 0 && <div className="flex justify-between"><span>Leads</span><span className="text-indigo-400">{fmtNum(c.leads)}</span></div>}
                    {c.roi > 0 && <div className="flex justify-between"><span>ROI</span><span className={c.roi >= 200 ? 'text-green-400' : 'text-amber-400'}>{c.roi}%</span></div>}
                  </div>
                  {c.progress > 0 && (
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'All' | CampaignStatus

export default function CampaignPage() {
  const [view, setView] = useState<'list' | 'board'>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const filtered = MOCK_CAMPAIGNS.filter(c => {
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    const matchType = typeFilter === 'All' || c.type === typeFilter
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchType && matchSearch
  })

  const activeCampaigns = MOCK_CAMPAIGNS.filter(c => c.status === 'Active').length
  const totalReach = MOCK_CAMPAIGNS.reduce((s, c) => s + c.impressions, 0)
  const avgEngagement = MOCK_CAMPAIGNS.filter(c => c.ctr > 0).reduce((s, c) => s + c.ctr, 0) / Math.max(MOCK_CAMPAIGNS.filter(c => c.ctr > 0).length, 1)
  const totalLeads = MOCK_CAMPAIGNS.reduce((s, c) => s + c.leads, 0)
  const totalRevenue = MOCK_CAMPAIGNS.reduce((s, c) => s + (c.spend * c.roi / 100), 0)
  const bestChannel = 'Instagram'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
      {selectedCampaign && <CampaignDetail campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white mb-0.5">Campaign Manager</h1>
          <p className="text-gray-400 text-sm">Plan, launch, and track campaigns across all channels.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + New Campaign
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Active Campaigns', value: activeCampaigns, color: 'text-green-400' },
          { label: 'Total Reach', value: fmtNum(totalReach), color: 'text-white' },
          { label: 'Avg Engagement', value: `${avgEngagement.toFixed(1)}%`, color: 'text-indigo-400' },
          { label: 'Total Leads', value: fmtNum(totalLeads), color: 'text-white' },
          { label: 'Revenue Attr.', value: `$${Math.round(totalRevenue).toLocaleString()}`, color: 'text-green-400' },
          { label: 'Best Channel', value: bestChannel, color: 'text-pink-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-400 text-xs mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Search + View Toggle */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['All', 'Active', 'Draft', 'Scheduled', 'Completed', 'Paused'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 text-xs focus:outline-none focus:border-indigo-500">
          <option>All</option>
          {(['Email', 'Social', 'Ads', 'Content', 'Multi-channel'] as CampaignType[]).map(t => <option key={t}>{t}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48" />
        <div className="ml-auto flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <button onClick={() => setView('list')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
            List
          </button>
          <button onClick={() => setView('board')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'board' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
            Board
          </button>
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Campaign', 'Type', 'Status', 'Progress', 'Dates', 'Budget', 'Spend', 'ROI', 'Score', ''].map(h => (
                  <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer" onClick={() => setSelectedCampaign(c)}>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium text-sm">{c.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{c.goal.substring(0, 50)}…</p>
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${typeStyle(c.type)}`}>{c.type}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle(c.status)}`}>{c.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.progress}%` }} />
                      </div>
                      <span className="text-gray-400 text-xs">{c.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    <p>{c.startDate}</p>
                    <p>{c.endDate}</p>
                  </td>
                  <td className="px-4 py-3 text-white">${c.budget.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-300">${c.spend.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${c.roi >= 200 ? 'text-green-400' : c.roi >= 100 ? 'text-amber-400' : c.roi === 0 ? 'text-gray-600' : 'text-white'}`}>
                      {c.roi > 0 ? `${c.roi}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.performanceScore > 0 ? (
                      <span className={`font-bold ${c.performanceScore >= 80 ? 'text-green-400' : c.performanceScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                        {c.performanceScore}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedCampaign(c)} className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">View →</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-gray-500">No campaigns match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <BoardView campaigns={filtered} onSelect={c => setSelectedCampaign(c)} />
      )}
    </div>
  )
}
