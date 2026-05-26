'use client'

import { useState } from 'react'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CAMPAIGNS = [
  {
    id: 'c1',
    name: 'May Product Launch — AI Reports',
    type: 'Announcement',
    status: 'sent',
    list: 'Newsletter',
    listCount: 2400,
    subject: 'Introducing AI-powered reports — built just for you',
    sentAt: 'May 10, 2026 · 9:02 AM',
    stats: { sent: 2400, opens: 34.2, clicks: 8.7, unsubs: 12, revenue: 4820 },
    opensByHour: [2, 8, 42, 180, 220, 195, 130, 96, 72, 54, 38, 27, 22, 18, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3],
    clickedLinks: [
      { url: 'https://app.ooumph.co/reports', clicks: 187 },
      { url: 'https://app.ooumph.co/pricing', clicks: 43 },
      { url: 'https://ooumph.co/blog/ai-reports', clicks: 29 },
    ],
    devices: { desktop: 58, mobile: 34, tablet: 8 },
    geo: [{ name: 'United States', clicks: 124 }, { name: 'United Kingdom', clicks: 38 }, { name: 'Canada', clicks: 27 }, { name: 'Australia', clicks: 19 }, { name: 'Germany', clicks: 14 }],
  },
  {
    id: 'c2',
    name: 'Spring Promotion — 20% Off Everything',
    type: 'Promotional',
    status: 'sent',
    list: 'Promotions',
    listCount: 3100,
    subject: 'Your 20% spring discount — expires Friday',
    sentAt: 'Apr 28, 2026 · 10:15 AM',
    stats: { sent: 3100, opens: 28.5, clicks: 6.2, unsubs: 21, revenue: 7340 },
    opensByHour: [1, 3, 12, 95, 210, 280, 245, 190, 150, 110, 78, 58, 44, 33, 26, 20, 17, 14, 12, 10, 8, 7, 6, 5],
    clickedLinks: [
      { url: 'https://app.ooumph.co/upgrade', clicks: 224 },
      { url: 'https://ooumph.co/promo', clicks: 89 },
    ],
    devices: { desktop: 52, mobile: 40, tablet: 8 },
    geo: [{ name: 'United States', clicks: 198 }, { name: 'United Kingdom', clicks: 44 }, { name: 'India', clicks: 31 }, { name: 'Canada', clicks: 22 }, { name: 'Brazil', clicks: 11 }],
  },
  {
    id: 'c3',
    name: 'April Newsletter — Growth Marketing Trends',
    type: 'Newsletter',
    status: 'sent',
    list: 'Newsletter',
    listCount: 2400,
    subject: '5 growth marketing trends you can\'t ignore in 2026',
    sentAt: 'Apr 15, 2026 · 8:30 AM',
    stats: { sent: 2400, opens: 41.8, clicks: 12.4, unsubs: 8, revenue: 2100 },
    opensByHour: [4, 12, 56, 210, 280, 220, 180, 140, 100, 74, 58, 44, 36, 30, 24, 20, 16, 14, 12, 10, 8, 7, 6, 5],
    clickedLinks: [
      { url: 'https://ooumph.co/blog/trends', clicks: 312 },
      { url: 'https://ooumph.co/webinar', clicks: 97 },
      { url: 'https://app.ooumph.co/templates', clicks: 54 },
    ],
    devices: { desktop: 64, mobile: 28, tablet: 8 },
    geo: [{ name: 'United States', clicks: 267 }, { name: 'United Kingdom', clicks: 58 }, { name: 'Canada', clicks: 39 }, { name: 'Australia', clicks: 24 }, { name: 'Germany', clicks: 18 }],
  },
  {
    id: 'c4',
    name: 'Welcome Series — New Trial Users',
    type: 'Automated',
    status: 'sent',
    list: 'Leads',
    listCount: 890,
    subject: 'Welcome to Ooumph — here\'s how to get started',
    sentAt: 'Apr 2, 2026 · 12:00 PM',
    stats: { sent: 890, opens: 62.3, clicks: 24.1, unsubs: 3, revenue: 980 },
    opensByHour: [8, 22, 78, 140, 168, 145, 120, 92, 70, 52, 40, 32, 26, 22, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4],
    clickedLinks: [
      { url: 'https://app.ooumph.co/onboarding', clicks: 214 },
      { url: 'https://ooumph.co/docs', clicks: 76 },
    ],
    devices: { desktop: 48, mobile: 44, tablet: 8 },
    geo: [{ name: 'United States', clicks: 142 }, { name: 'India', clicks: 48 }, { name: 'United Kingdom', clicks: 34 }, { name: 'Philippines', clicks: 18 }, { name: 'Nigeria', clicks: 12 }],
  },
  {
    id: 'c5',
    name: 'Win-back — 90-Day Inactive Subscribers',
    type: 'Re-engagement',
    status: 'sent',
    list: 'Inactive',
    listCount: 634,
    subject: 'We miss you — here\'s what\'s new at Ooumph',
    sentAt: 'Mar 20, 2026 · 2:00 PM',
    stats: { sent: 634, opens: 18.7, clicks: 3.4, unsubs: 44, revenue: 340 },
    opensByHour: [1, 2, 5, 18, 28, 34, 30, 22, 18, 14, 10, 8, 7, 6, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1],
    clickedLinks: [
      { url: 'https://app.ooumph.co/whats-new', clicks: 22 },
      { url: 'https://app.ooumph.co/login', clicks: 14 },
    ],
    devices: { desktop: 60, mobile: 32, tablet: 8 },
    geo: [{ name: 'United States', clicks: 24 }, { name: 'United Kingdom', clicks: 8 }, { name: 'Germany', clicks: 4 }, { name: 'France', clicks: 3 }, { name: 'Spain', clicks: 2 }],
  },
  {
    id: 'c6',
    name: 'June Newsletter — Coming Soon',
    type: 'Newsletter',
    status: 'scheduled',
    list: 'Newsletter',
    listCount: 2847,
    subject: '[Draft] June newsletter',
    sentAt: 'Scheduled for Jun 10, 2026 · 9:00 AM',
    stats: { sent: 0, opens: 0, clicks: 0, unsubs: 0, revenue: 0 },
    opensByHour: [],
    clickedLinks: [],
    devices: { desktop: 0, mobile: 0, tablet: 0 },
    geo: [],
  },
  {
    id: 'c7',
    name: 'Flash Sale — 48 Hours Only',
    type: 'Promotional',
    status: 'draft',
    list: 'Newsletter',
    listCount: 2847,
    subject: '[Draft] Flash sale',
    sentAt: 'Not scheduled',
    stats: { sent: 0, opens: 0, clicks: 0, unsubs: 0, revenue: 0 },
    opensByHour: [],
    clickedLinks: [],
    devices: { desktop: 0, mobile: 0, tablet: 0 },
    geo: [],
  },
  {
    id: 'c8',
    name: 'Q1 Results — Stakeholder Update',
    type: 'Newsletter',
    status: 'archived',
    list: 'Customers',
    listCount: 412,
    subject: 'Ooumph Q1 2026 — our biggest quarter yet',
    sentAt: 'Mar 1, 2026 · 10:00 AM',
    stats: { sent: 412, opens: 55.1, clicks: 18.2, unsubs: 2, revenue: 1240 },
    opensByHour: [2, 6, 22, 60, 90, 82, 68, 52, 40, 30, 24, 18, 14, 12, 10, 8, 7, 6, 5, 4, 4, 3, 2, 2],
    clickedLinks: [
      { url: 'https://ooumph.co/q1-report', clicks: 75 },
    ],
    devices: { desktop: 70, mobile: 22, tablet: 8 },
    geo: [{ name: 'United States', clicks: 56 }, { name: 'United Kingdom', clicks: 18 }],
  },
]

const SUBSCRIBER_ACTIVITY = [
  { name: 'Alex Morgan', email: 'alex.morgan@techcorp.com', opened: true, clicked: true, unsubbed: false },
  { name: 'Sarah Chen', email: 'sarah.chen@startup.io', opened: true, clicked: false, unsubbed: false },
  { name: 'Priya Patel', email: 'priya.patel@ventures.co', opened: true, clicked: true, unsubbed: false },
  { name: 'James Wilson', email: 'james.wilson@example.com', opened: false, clicked: false, unsubbed: false },
  { name: 'Nora Kim', email: 'nora.kim@design.co', opened: true, clicked: true, unsubbed: false },
  { name: 'Dan Foster', email: 'dan.foster@media.io', opened: false, clicked: false, unsubbed: true },
  { name: 'Mike Torres', email: 'mike.torres@agency.com', opened: true, clicked: false, unsubbed: false },
]

const LISTS = ['Newsletter (2,847)', 'Leads (560)', 'Promotions (890)', 'Customers (412)', 'Inactive (634)', 'Trial Users (234)']

const TEMPLATES = ['Welcome Email', 'Monthly Newsletter', 'Product Announcement', 'Flash Sale Promo', 'Re-engagement Win-back', 'Event Invitation']

const AI_SUBJECTS = [
  'You asked. We built it. Here\'s what\'s new.',
  '5 reasons our customers are switching to Ooumph',
  '[First name], your personalized marketing report is ready',
  'The one thing top marketers do differently',
  'Don\'t open this email if you\'re happy with slow growth',
]

type Campaign = typeof MOCK_CAMPAIGNS[0]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    sent: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    scheduled: 'bg-blue-900/40 text-blue-300 border-blue-800',
    sending: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    draft: 'bg-gray-800 text-gray-400 border-gray-700',
    archived: 'bg-gray-800 text-gray-500 border-gray-700',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs border capitalize ${cfg[status] ?? cfg.draft}`}>{status}</span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    Newsletter: 'bg-indigo-900/40 text-indigo-300 border-indigo-800/40',
    Promotional: 'bg-orange-900/40 text-orange-300 border-orange-800/40',
    Announcement: 'bg-violet-900/40 text-violet-300 border-violet-800/40',
    Automated: 'bg-teal-900/40 text-teal-300 border-teal-800/40',
    Transactional: 'bg-sky-900/40 text-sky-300 border-sky-800/40',
    'Re-engagement': 'bg-pink-900/40 text-pink-300 border-pink-800/40',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${cfg[type] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>{type}</span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS)

  // New campaign wizard
  const [showNew, setShowNew] = useState(false)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    type: 'Newsletter',
    fromName: 'Ooumph Team',
    fromEmail: 'hello@ooumph.co',
    replyTo: 'support@ooumph.co',
    trackOpens: true,
    trackClicks: true,
    utmSource: 'email',
    utmMedium: 'newsletter',
    list: '',
    excludeDays: 30,
    recipientTimezone: false,
    subject: '',
    previewText: '',
    template: '',
    useHtml: false,
    htmlContent: '',
    sendNow: true,
    scheduleDate: '',
    scheduleTime: '',
    abTest: false,
    abSubjectB: '',
  })
  const [showAiSubjects, setShowAiSubjects] = useState(false)
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [launched, setLaunched] = useState(false)

  // Test send
  const [testEmail, setTestEmail] = useState('')
  const [testSent, setTestSent] = useState(false)

  // Campaign report
  const [reportCampaign, setReportCampaign] = useState<Campaign | null>(null)

  const filteredCampaigns = campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter)

  const STATUS_COUNTS: Record<string, number> = { all: campaigns.length }
  campaigns.forEach(c => { STATUS_COUNTS[c.status] = (STATUS_COUNTS[c.status] || 0) + 1 })

  const sentCampaigns = campaigns.filter(c => c.status === 'sent')
  const avgOpen = sentCampaigns.length ? (sentCampaigns.reduce((a, c) => a + c.stats.opens, 0) / sentCampaigns.length).toFixed(1) : '0'
  const avgClick = sentCampaigns.length ? (sentCampaigns.reduce((a, c) => a + c.stats.clicks, 0) / sentCampaigns.length).toFixed(1) : '0'
  const totalRevenue = sentCampaigns.reduce((a, c) => a + c.stats.revenue, 0)
  const totalSent = sentCampaigns.reduce((a, c) => a + c.stats.sent, 0)
  const bestCampaign = [...sentCampaigns].sort((a, b) => b.stats.opens - a.stats.opens)[0]

  function handleLaunch() {
    const estimatedList = form.list ? parseInt(form.list.match(/\((\d+),?(\d*)\)/)?.[1] + (form.list.match(/\((\d+),?(\d*)\)/)?.[2] || '') || '0') : 0
    const newCampaign: Campaign = {
      id: `c${campaigns.length + 1}`,
      name: form.name || 'Untitled Campaign',
      type: form.type,
      status: form.sendNow ? 'sent' : 'scheduled',
      list: form.list.replace(/\s*\(.*\)/, '') || 'Newsletter',
      listCount: estimatedList || 2847,
      subject: form.subject,
      sentAt: form.sendNow ? new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : `Scheduled for ${form.scheduleDate} · ${form.scheduleTime}`,
      stats: { sent: form.sendNow ? (estimatedList || 2847) : 0, opens: form.sendNow ? 0 : 0, clicks: 0, unsubs: 0, revenue: 0 },
      opensByHour: [],
      clickedLinks: [],
      devices: { desktop: 0, mobile: 0, tablet: 0 },
      geo: [],
    }
    setCampaigns(prev => [newCampaign, ...prev])
    setLaunched(true)
    setTimeout(() => {
      setShowNew(false)
      setLaunched(false)
      setStep(1)
      setForm(f => ({ ...f, name: '', subject: '', list: '', template: '' }))
    }, 1800)
  }

  function handleDuplicate(c: Campaign) {
    const dup: Campaign = { ...c, id: `c${campaigns.length + 1}`, name: `${c.name} (Copy)`, status: 'draft', sentAt: 'Not scheduled', stats: { ...c.stats, sent: 0, opens: 0, clicks: 0, unsubs: 0, revenue: 0 } }
    setCampaigns(prev => [dup, ...prev])
  }

  function handleArchive(id: string) {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'archived' } : c))
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

  const estimatedReach = form.list ? (form.list.match(/\d[\d,]*/)?.[0]?.replace(',', '') || '—') : '—'

  const maxHourly = reportCampaign ? Math.max(...(reportCampaign.opensByHour.length ? reportCampaign.opensByHour : [1])) : 1

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Email Campaigns</h1>
        <div className="flex items-center gap-3">
          {/* Test send */}
          <div className="flex items-center gap-2">
            <input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-48 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => { setTestSent(true); setTimeout(() => setTestSent(false), 2000) }}
              disabled={!testEmail}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors"
            >
              {testSent ? 'Sent!' : 'Send Test'}
            </button>
          </div>
          <button
            onClick={() => { setShowNew(true); setStep(1) }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            + New Campaign
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Campaigns This Month', value: campaigns.filter(c => c.status !== 'archived').length.toString() },
          { label: 'Total Sent', value: totalSent.toLocaleString() },
          { label: 'Avg Open Rate', value: `${avgOpen}%` },
          { label: 'Avg Click Rate', value: `${avgClick}%` },
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}` },
          { label: 'Best Campaign', value: bestCampaign?.stats.opens + '%' || '—', sub: bestCampaign?.name.slice(0, 20) + '...' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 text-xs leading-tight">{s.label}</p>
            <p className="text-white font-bold text-lg mt-0.5">{s.value}</p>
            {s.sub && <p className="text-gray-600 text-xs leading-tight">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Status Filter Tabs ── */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {['all', 'draft', 'scheduled', 'sending', 'sent', 'archived'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {s} {STATUS_COUNTS[s] !== undefined && <span className="ml-1 text-xs opacity-70">({STATUS_COUNTS[s] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* ── Campaign Cards ── */}
      <div className="space-y-3">
        {filteredCampaigns.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-sm">No campaigns found for this status</p>
          </div>
        )}
        {filteredCampaigns.map(c => (
          <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-semibold">{c.name}</h3>
                  <TypeBadge type={c.type} />
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-gray-500 text-xs">{c.sentAt}</p>
                {c.status === 'sending' && (
                  <div className="mt-2 w-48 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '62%' }} />
                  </div>
                )}
              </div>
              {/* Mini stats */}
              {c.status === 'sent' && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Sent</p>
                    <p className="text-white font-bold text-sm">{c.stats.sent.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Opens</p>
                    <p className="text-emerald-400 font-bold text-sm">{c.stats.opens}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Clicks</p>
                    <p className="text-indigo-400 font-bold text-sm">{c.stats.clicks}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Unsubs</p>
                    <p className="text-gray-400 font-bold text-sm">{c.stats.unsubs}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Revenue</p>
                    <p className="text-white font-bold text-sm">${c.stats.revenue.toLocaleString()}</p>
                  </div>
                </div>
              )}
              {(c.status === 'draft' || c.status === 'scheduled') && (
                <div className="text-right">
                  <p className="text-gray-500 text-xs">{c.list}</p>
                  <p className="text-white text-sm font-medium">{c.listCount.toLocaleString()} contacts</p>
                </div>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800 flex-wrap">
              {c.status === 'sent' && (
                <>
                  <button
                    onClick={() => setReportCampaign(c)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                  >
                    View Report
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                    Resend to Unopened ({Math.round(c.stats.sent * (1 - c.stats.opens / 100))})
                  </button>
                </>
              )}
              <button
                onClick={() => handleDuplicate(c)}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
              >
                Duplicate
              </button>
              {c.status !== 'archived' && (
                <button
                  onClick={() => handleArchive(c.id)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          NEW CAMPAIGN MODAL
      ══════════════════════════════════════════════════════════ */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold">New Campaign</h2>
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3, 4].map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-500'}`}>{s}</div>
                      {s < 4 && <div className={`w-8 h-px ${step > s ? 'bg-indigo-600' : 'bg-gray-700'}`} />}
                    </div>
                  ))}
                  <span className="text-gray-500 text-xs ml-2">{['Setup', 'Audience', 'Content', 'Schedule'][step - 1]}</span>
                </div>
              </div>
              <button onClick={() => { setShowNew(false); setStep(1) }} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {/* ── Step 1: Setup ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Campaign Name *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. June Newsletter" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Campaign Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Newsletter', 'Promotional', 'Announcement', 'Re-engagement'].map(t => (
                        <button
                          key={t}
                          onClick={() => setForm(f => ({ ...f, type: t }))}
                          className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${form.type === t ? 'border-indigo-500 bg-indigo-900/30 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">From Name</label>
                      <input value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">From Email</label>
                      <input value={form.fromEmail} onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Reply-to Email</label>
                    <input value={form.replyTo} onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="border border-gray-800 rounded-xl p-4 space-y-3">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Tracking</p>
                    {[
                      { key: 'trackOpens', label: 'Open Tracking' },
                      { key: 'trackClicks', label: 'Click Tracking' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center justify-between cursor-pointer">
                        <span className="text-gray-300 text-sm">{label}</span>
                        <button
                          onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                          className={`w-10 h-6 rounded-full transition-colors relative ${(form as Record<string, unknown>)[key] ? 'bg-indigo-600' : 'bg-gray-700'}`}
                        >
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${(form as Record<string, unknown>)[key] ? 'left-5' : 'left-1'}`} />
                        </button>
                      </label>
                    ))}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">UTM Source</label>
                        <input value={form.utmSource} onChange={e => setForm(f => ({ ...f, utmSource: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-gray-500 text-xs mb-1">UTM Medium</label>
                        <input value={form.utmMedium} onChange={e => setForm(f => ({ ...f, utmMedium: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 2: Audience ── */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Send To *</label>
                    <select value={form.list} onChange={e => setForm(f => ({ ...f, list: e.target.value }))} className={inputCls}>
                      <option value="">Select a list or segment...</option>
                      {LISTS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    {form.list && (
                      <p className="text-indigo-300 text-xs mt-1.5">Estimated reach: ~{estimatedReach} contacts</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Exclude Contacts</label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">Who received a campaign in the last</span>
                      <input
                        type="number"
                        value={form.excludeDays}
                        onChange={e => setForm(f => ({ ...f, excludeDays: parseInt(e.target.value) || 30 }))}
                        className="w-16 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 text-center"
                        min={1}
                        max={365}
                      />
                      <span className="text-gray-400 text-sm">days</span>
                    </div>
                  </div>
                  <label className="flex items-center justify-between cursor-pointer border border-gray-800 rounded-xl p-4">
                    <div>
                      <p className="text-gray-300 text-sm font-medium">Send in recipient&apos;s timezone</p>
                      <p className="text-gray-500 text-xs mt-0.5">Delivers at the same local time for each subscriber</p>
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, recipientTimezone: !f.recipientTimezone }))}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.recipientTimezone ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.recipientTimezone ? 'left-5' : 'left-1'}`} />
                    </button>
                  </label>
                </div>
              )}

              {/* ── Step 3: Content ── */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Subject Line *</label>
                      <span className={`text-xs ${form.subject.length > 60 ? 'text-red-400' : 'text-gray-500'}`}>{form.subject.length}/60</span>
                    </div>
                    <input
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      placeholder="Write a compelling subject line..."
                      className={inputCls}
                    />
                    <button
                      onClick={() => setShowAiSubjects(s => !s)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-900/30 border border-indigo-800/40 text-indigo-300 text-xs font-medium hover:bg-indigo-900/50 transition-colors"
                    >
                      AI Subject Line Suggestions
                    </button>
                    {showAiSubjects && (
                      <div className="mt-2 space-y-1.5">
                        {AI_SUBJECTS.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => { setForm(f => ({ ...f, subject: s })); setShowAiSubjects(false) }}
                            className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-indigo-600 hover:text-white text-sm transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Preview Text</label>
                    <input
                      value={form.previewText}
                      onChange={e => setForm(f => ({ ...f, previewText: e.target.value }))}
                      placeholder="Short preview shown in inbox..."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Email Template</label>
                      <button
                        onClick={() => setForm(f => ({ ...f, useHtml: !f.useHtml }))}
                        className="text-gray-500 hover:text-indigo-300 text-xs transition-colors"
                      >
                        {form.useHtml ? 'Use Template' : 'Write HTML'}
                      </button>
                    </div>
                    {!form.useHtml ? (
                      <div className="grid grid-cols-2 gap-2">
                        {TEMPLATES.map(t => (
                          <button
                            key={t}
                            onClick={() => setForm(f => ({ ...f, template: t }))}
                            className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${form.template === t ? 'border-indigo-500 bg-indigo-900/30 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={form.htmlContent}
                        onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))}
                        rows={8}
                        placeholder="<html>...</html>"
                        className={inputCls + ' font-mono text-xs resize-y'}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => setShowEmailPreview(true)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                  >
                    Preview Email
                  </button>
                </div>
              )}

              {/* ── Step 4: Schedule ── */}
              {step === 4 && (
                <div className="space-y-5">
                  {/* Send options */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setForm(f => ({ ...f, sendNow: true }))}
                      className={`p-4 rounded-xl border text-left transition-colors ${form.sendNow ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                    >
                      <p className={`font-semibold text-sm ${form.sendNow ? 'text-white' : 'text-gray-300'}`}>Send Now</p>
                      <p className="text-gray-500 text-xs mt-0.5">Dispatch immediately</p>
                    </button>
                    <button
                      onClick={() => setForm(f => ({ ...f, sendNow: false }))}
                      className={`p-4 rounded-xl border text-left transition-colors ${!form.sendNow ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                    >
                      <p className={`font-semibold text-sm ${!form.sendNow ? 'text-white' : 'text-gray-300'}`}>Schedule</p>
                      <p className="text-gray-500 text-xs mt-0.5">Pick date and time</p>
                    </button>
                  </div>
                  {!form.sendNow && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-400 text-xs mb-1.5">Date</label>
                        <input type="date" value={form.scheduleDate} onChange={e => setForm(f => ({ ...f, scheduleDate: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-xs mb-1.5">Time</label>
                        <input type="time" value={form.scheduleTime} onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between border border-gray-800 rounded-xl p-4">
                    <div>
                      <p className="text-gray-300 text-sm font-medium">Best Time (AI Recommended)</p>
                      <p className="text-indigo-300 text-xs mt-0.5">Tuesday 9:00 AM — based on your past campaigns</p>
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, sendNow: false, scheduleDate: '2026-06-10', scheduleTime: '09:00' }))}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                    >
                      Use
                    </button>
                  </div>
                  {/* A/B Test */}
                  <label className="flex items-center justify-between cursor-pointer border border-gray-800 rounded-xl p-4">
                    <div>
                      <p className="text-gray-300 text-sm font-medium">A/B Test</p>
                      <p className="text-gray-500 text-xs mt-0.5">Split-test subject lines or send times</p>
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, abTest: !f.abTest }))}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.abTest ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.abTest ? 'left-5' : 'left-1'}`} />
                    </button>
                  </label>
                  {form.abTest && (
                    <div>
                      <label className="block text-gray-400 text-xs mb-1.5">Variant B Subject Line</label>
                      <input value={form.abSubjectB} onChange={e => setForm(f => ({ ...f, abSubjectB: e.target.value }))} placeholder="Alternative subject..." className={inputCls} />
                    </div>
                  )}
                  {/* Summary */}
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Campaign Summary</p>
                    {[
                      { label: 'Name', value: form.name || 'Untitled' },
                      { label: 'Type', value: form.type },
                      { label: 'From', value: `${form.fromName} <${form.fromEmail}>` },
                      { label: 'List', value: form.list || '—' },
                      { label: 'Subject', value: form.subject || '—' },
                      { label: 'Template', value: form.template || (form.useHtml ? 'Custom HTML' : '—') },
                      { label: 'Send', value: form.sendNow ? 'Immediately' : `${form.scheduleDate} at ${form.scheduleTime}` },
                    ].map(row => (
                      <div key={row.label} className="flex items-start gap-3">
                        <span className="text-gray-500 text-xs w-20 flex-shrink-0">{row.label}</span>
                        <span className="text-gray-200 text-xs">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 flex-shrink-0">
              <button
                onClick={() => setStep(s => Math.max(1, s - 1))}
                disabled={step === 1}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 text-sm transition-colors"
              >
                Back
              </button>
              {step < 4 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 1 && !form.name}
                  className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleLaunch}
                  disabled={launched || !form.name || !form.subject}
                  className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  {launched ? 'Launching...' : form.sendNow ? 'Send Campaign' : 'Schedule Campaign'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          EMAIL PREVIEW MODAL
      ══════════════════════════════════════════════════════════ */}
      {showEmailPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">Email Preview</h3>
              <button onClick={() => setShowEmailPreview(false)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
            </div>
            <div className="p-4 bg-gray-950 overflow-y-auto max-h-[70vh]">
              <div className="max-w-sm mx-auto bg-white rounded-xl overflow-hidden shadow-lg">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                  <p className="text-gray-700 text-xs"><span className="font-medium">From:</span> {form.fromName} &lt;{form.fromEmail}&gt;</p>
                  <p className="text-gray-700 text-xs mt-0.5"><span className="font-medium">Subject:</span> {form.subject || '(No subject)'}</p>
                  {form.previewText && <p className="text-gray-500 text-xs mt-0.5 italic">{form.previewText}</p>}
                </div>
                <div className="bg-indigo-700 px-6 py-4 text-center">
                  <p className="text-white font-bold text-lg">Ooumph</p>
                </div>
                <div className="bg-gray-100 h-28 flex items-center justify-center">
                  <p className="text-gray-400 text-xs">[Hero Image: {form.template || 'Template'}]</p>
                </div>
                <div className="p-6">
                  <h2 className="text-gray-900 font-bold text-base mb-3">{form.subject || 'Your Email Headline'}</h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    Hi {'{{first_name}}'},<br /><br />
                    Your personalized email content will appear here. This preview shows how your email will look to subscribers.
                  </p>
                  <div className="text-center">
                    <span className="inline-block px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium">View Now</span>
                  </div>
                </div>
                <div className="bg-gray-200 px-6 py-3 text-center space-y-1">
                  <p className="text-gray-500 text-xs">{form.fromName} · {form.fromEmail}</p>
                  <p className="text-gray-400 text-xs">Unsubscribe | View in browser | Privacy Policy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CAMPAIGN REPORT
      ══════════════════════════════════════════════════════════ */}
      {reportCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold">{reportCampaign.name}</h2>
                <p className="text-gray-500 text-xs mt-0.5">{reportCampaign.sentAt}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(reportCampaign, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = `report_${reportCampaign.id}.json`; a.click()
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  Export Report
                </button>
                <button onClick={() => setReportCampaign(null)} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">x</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* KPI Header */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { label: 'Delivered', value: reportCampaign.stats.sent.toLocaleString(), color: 'text-white' },
                  { label: 'Opens', value: `${reportCampaign.stats.opens}%`, color: 'text-emerald-400' },
                  { label: 'Clicks', value: `${reportCampaign.stats.clicks}%`, color: 'text-indigo-400' },
                  { label: 'Unsubscribes', value: reportCampaign.stats.unsubs.toString(), color: 'text-red-400' },
                  { label: 'Bounces', value: Math.round(reportCampaign.stats.sent * 0.014).toString(), color: 'text-yellow-400' },
                  { label: 'Revenue', value: `$${reportCampaign.stats.revenue.toLocaleString()}`, color: 'text-white' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs">{k.label}</p>
                    <p className={`font-bold text-base mt-0.5 ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Opens over time (hourly) */}
              {reportCampaign.opensByHour.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                  <h3 className="text-white font-medium text-sm mb-4">Open Rate Over Time — First 24 Hours</h3>
                  <div className="flex items-end gap-0.5 h-20">
                    {reportCampaign.opensByHour.map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                        <div
                          className="bg-indigo-500 rounded-t-sm w-full"
                          style={{ height: `${(v / maxHourly) * 100}%` }}
                          title={`Hour ${i}: ${v} opens`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-gray-600 text-xs mt-1">
                    <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span>
                  </div>
                </div>
              )}

              {/* Click map + Device breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Clicked links */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                  <h3 className="text-white font-medium text-sm mb-3">Link Click Map</h3>
                  {reportCampaign.clickedLinks.length > 0 ? (
                    <div className="space-y-2">
                      {reportCampaign.clickedLinks.map((link, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400 truncate max-w-[180px]">{link.url}</span>
                            <span className="text-white font-medium">{link.clicks}</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(link.clicks / reportCampaign.clickedLinks[0].clicks) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-600 text-sm">No click data available</p>}
                </div>

                {/* Device breakdown */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                  <h3 className="text-white font-medium text-sm mb-3">Device Breakdown</h3>
                  <div className="space-y-2">
                    {[
                      { device: 'Desktop', pct: reportCampaign.devices.desktop, color: 'bg-indigo-500' },
                      { device: 'Mobile', pct: reportCampaign.devices.mobile, color: 'bg-emerald-500' },
                      { device: 'Tablet', pct: reportCampaign.devices.tablet, color: 'bg-yellow-500' },
                    ].map(d => (
                      <div key={d.device}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">{d.device}</span>
                          <span className="text-white font-medium">{d.pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${d.color} rounded-full`} style={{ width: `${d.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Simulated pie */}
                  <div className="flex gap-2 mt-3">
                    {[
                      { device: 'Desktop', color: 'bg-indigo-500', pct: reportCampaign.devices.desktop },
                      { device: 'Mobile', color: 'bg-emerald-500', pct: reportCampaign.devices.mobile },
                      { device: 'Tablet', color: 'bg-yellow-500', pct: reportCampaign.devices.tablet },
                    ].map(d => (
                      <div key={d.device} className={`h-3 rounded-full ${d.color}`} style={{ flex: d.pct }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Geographic spread */}
              {reportCampaign.geo.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                  <h3 className="text-white font-medium text-sm mb-3">Geographic Spread</h3>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-xs text-gray-500 pb-2">Country / City</th>
                        <th className="text-right text-xs text-gray-500 pb-2">Clicks</th>
                        <th className="text-right text-xs text-gray-500 pb-2">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportCampaign.geo.map((g, i) => {
                        const total = reportCampaign.geo.reduce((a, x) => a + x.clicks, 0)
                        return (
                          <tr key={i} className="border-b border-gray-700 last:border-0">
                            <td className="py-2 text-gray-300 text-sm">{g.name}</td>
                            <td className="py-2 text-right text-white text-sm font-medium">{g.clicks}</td>
                            <td className="py-2 text-right text-gray-500 text-xs">{((g.clicks / total) * 100).toFixed(0)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Subscriber Activity */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                  <h3 className="text-white font-medium text-sm">Subscriber Activity</h3>
                  <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
                    Resend to Unopened ({Math.round(reportCampaign.stats.sent * (1 - reportCampaign.stats.opens / 100))})
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      {['Subscriber', 'Opened', 'Clicked', 'Unsubscribed'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SUBSCRIBER_ACTIVITY.map((sub, i) => (
                      <tr key={i} className="border-b border-gray-700 last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="text-white text-sm">{sub.name}</p>
                          <p className="text-gray-500 text-xs">{sub.email}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          {sub.opened ? <span className="text-emerald-400 text-xs font-medium">Yes</span> : <span className="text-gray-600 text-xs">No</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {sub.clicked ? <span className="text-indigo-400 text-xs font-medium">Yes</span> : <span className="text-gray-600 text-xs">No</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {sub.unsubbed ? <span className="text-red-400 text-xs font-medium">Yes</span> : <span className="text-gray-600 text-xs">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
