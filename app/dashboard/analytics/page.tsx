'use client'

import { useState } from 'react'

// ── Mock data ──────────────────────────────────────────────────────────────────

const STAT_BAR = [
  { label: 'Content Published', value: '142', delta: '+18 vs prev', up: true },
  { label: 'Total Reach', value: '2.4M', delta: '+340K vs prev', up: true },
  { label: 'Avg Engagement', value: '4.7%', delta: '+0.8pp vs prev', up: true },
  { label: 'Total Leads', value: '847', delta: '+122 vs prev', up: true },
  { label: 'Revenue Attributed', value: '$68,200', delta: '+$9,400 vs prev', up: true },
  { label: 'AI Cost This Month', value: '$142', delta: '-$12 vs prev', up: false },
]

const CHANNELS = [
  { name: 'Instagram', reach: 820000, eng: 5.8, leads: 210, cpl: '$4.20', icon: '📸' },
  { name: 'LinkedIn', reach: 540000, eng: 6.2, leads: 312, cpl: '$2.90', icon: '💼' },
  { name: 'Email', reach: 380000, eng: 28.4, leads: 198, cpl: '$1.80', icon: '✉️' },
  { name: 'Blog/SEO', reach: 290000, eng: 3.1, leads: 89, cpl: '$6.40', icon: '📝' },
  { name: 'TikTok', reach: 240000, eng: 8.3, leads: 22, cpl: '$14.20', icon: '🎵' },
  { name: 'Facebook', reach: 90000, eng: 2.1, leads: 12, cpl: '$22.10', icon: '🟦' },
  { name: 'Twitter/X', reach: 38000, eng: 1.4, leads: 4, cpl: '$41.00', icon: '𝕏' },
]

const TOP_POSTS = [
  {
    title: '10 Marketing Automation Secrets for Agencies',
    platform: 'LinkedIn',
    type: 'Long-form Article',
    reach: 48200,
    eng: 8.9,
    clicks: 1840,
    badge: '+340% above average',
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
    color: 'bg-gradient-to-br from-blue-700 to-blue-900',
  },
  {
    title: 'Behind the scenes: How we built an AI content pipeline',
    platform: 'Instagram',
    type: 'Carousel',
    reach: 39700,
    eng: 7.4,
    clicks: 960,
    badge: '+210% above average',
    badgeColor: 'bg-indigo-500/20 text-indigo-400',
    color: 'bg-gradient-to-br from-pink-700 to-purple-900',
  },
  {
    title: 'Q2 Agency Growth Playbook (Free Download)',
    platform: 'Email',
    type: 'Newsletter',
    reach: 32100,
    eng: 34.2,
    clicks: 2180,
    badge: '+180% above average',
    badgeColor: 'bg-amber-500/20 text-amber-400',
    color: 'bg-gradient-to-br from-amber-700 to-orange-900',
  },
]

const AI_AGENTS = [
  { name: 'Content Strategist', runs: 48, tasks: 192, cost: '$22.40' },
  { name: 'Copy Writer', runs: 87, tasks: 348, cost: '$41.30' },
  { name: 'SEO Analyst', runs: 24, tasks: 96, cost: '$18.60' },
  { name: 'Brand Voice Guard', runs: 142, tasks: 142, cost: '$12.80' },
  { name: 'Image Generator', runs: 56, tasks: 56, cost: '$28.00' },
  { name: 'Analytics Agent', runs: 12, tasks: 48, cost: '$9.20' },
]

const CONTENT_BY_TYPE = [
  { type: 'Social Posts', count: 62, color: 'bg-indigo-500' },
  { type: 'Blog Articles', count: 28, color: 'bg-purple-500' },
  { type: 'Email Newsletters', count: 18, color: 'bg-pink-500' },
  { type: 'Ad Creatives', count: 14, color: 'bg-amber-500' },
  { type: 'Video Scripts', count: 12, color: 'bg-emerald-500' },
  { type: 'Landing Pages', count: 8, color: 'bg-blue-500' },
]

const TOP_CONTENT_TABLE = [
  { preview: '10 Marketing Automation Secrets…', platform: 'LinkedIn', reach: '48,200', eng: '8.9%', clicks: '1,840', date: 'May 22' },
  { preview: 'Behind the scenes: AI pipeline…', platform: 'Instagram', reach: '39,700', eng: '7.4%', clicks: '960', date: 'May 19' },
  { preview: 'Q2 Agency Growth Playbook…', platform: 'Email', reach: '32,100', eng: '34.2%', clicks: '2,180', date: 'May 15' },
  { preview: 'How to 10x your content output…', platform: 'TikTok', reach: '28,400', eng: '9.1%', clicks: '340', date: 'May 12' },
  { preview: 'The future of AI in marketing', platform: 'Blog', reach: '22,000', eng: '3.8%', clicks: '680', date: 'May 9' },
  { preview: '5 tools every agency needs in 2026', platform: 'LinkedIn', reach: '18,900', eng: '6.2%', clicks: '920', date: 'May 6' },
  { preview: 'Client onboarding checklist', platform: 'Email', reach: '16,400', eng: '29.8%', clicks: '1,420', date: 'May 3' },
  { preview: 'Why your content strategy is failing', platform: 'Blog', reach: '14,200', eng: '2.9%', clicks: '510', date: 'Apr 30' },
  { preview: 'Agency pricing models explained', platform: 'LinkedIn', reach: '12,700', eng: '5.4%', clicks: '760', date: 'Apr 27' },
  { preview: 'Building a content calendar that converts', platform: 'Email', reach: '11,200', eng: '31.4%', clicks: '980', date: 'Apr 24' },
]

const LEAD_FUNNEL = [
  { stage: 'Total Leads', count: 847, pct: 100 },
  { stage: 'Marketing Qualified (MQL)', count: 423, pct: 50 },
  { stage: 'Sales Qualified (SQL)', count: 186, pct: 22 },
  { stage: 'Customers Won', count: 62, pct: 7.3 },
]

const LEAD_SOURCES = [
  { source: 'Organic Search', leads: 248, pct: 29.3, color: 'bg-emerald-500' },
  { source: 'LinkedIn', leads: 196, pct: 23.1, color: 'bg-blue-500' },
  { source: 'Email Marketing', leads: 142, pct: 16.8, color: 'bg-indigo-500' },
  { source: 'Referral', leads: 98, pct: 11.6, color: 'bg-purple-500' },
  { source: 'Direct', leads: 84, pct: 9.9, color: 'bg-pink-500' },
  { source: 'Paid Social', leads: 79, pct: 9.3, color: 'bg-amber-500' },
]

const COST_PER_LEAD = [
  { channel: 'Email Marketing', cpl: '$1.80', leads: 142, quality: 'High' },
  { channel: 'LinkedIn Organic', cpl: '$2.90', leads: 196, quality: 'High' },
  { channel: 'SEO / Blog', cpl: '$4.20', leads: 89, quality: 'High' },
  { channel: 'Instagram', cpl: '$4.20', leads: 210, quality: 'Medium' },
  { channel: 'TikTok', cpl: '$14.20', leads: 22, quality: 'Low' },
  { channel: 'Paid Facebook', cpl: '$22.10', leads: 12, quality: 'Medium' },
]

const REVENUE_CHANNELS = [
  { channel: 'Email Campaigns', revenue: 28400, roas: '18.2x', color: 'bg-indigo-500' },
  { channel: 'LinkedIn Content', revenue: 19800, roas: '14.1x', color: 'bg-blue-500' },
  { channel: 'SEO / Blog', revenue: 12600, roas: '9.8x', color: 'bg-emerald-500' },
  { channel: 'Instagram', revenue: 4800, roas: '4.2x', color: 'bg-pink-500' },
  { channel: 'Paid Social', revenue: 2600, roas: '2.1x', color: 'bg-amber-500' },
]

const TOP_CAMPAIGNS = [
  { name: 'Q2 Agency Playbook Launch', type: 'Lead Gen', revenue: '$14,200', roas: '22.4x', leads: 98 },
  { name: 'Content Automation Webinar', type: 'Product', revenue: '$11,800', roas: '18.9x', leads: 76 },
  { name: 'May Newsletter Series', type: 'Nurture', revenue: '$8,400', roas: '14.2x', leads: 54 },
  { name: 'LinkedIn Thought Leadership', type: 'Brand', revenue: '$6,200', roas: '11.4x', leads: 42 },
  { name: 'Blog SEO Push', type: 'Organic', revenue: '$5,800', roas: '9.8x', leads: 38 },
]

const REPORT_TEMPLATES = [
  {
    id: 'monthly',
    name: 'Monthly Performance Report',
    desc: 'Comprehensive month-over-month overview for clients',
    useCase: 'Monthly client reporting',
    sections: ['Executive Summary', 'KPIs', 'Content Performance', 'Channel Breakdown', 'Lead Generation', 'Recommendations'],
    color: 'bg-gradient-to-br from-indigo-900 to-blue-900',
    icon: '📊',
  },
  {
    id: 'campaign',
    name: 'Campaign Results Report',
    desc: 'Deep-dive into a specific campaign\'s performance and ROI',
    useCase: 'Post-campaign wrap-up',
    sections: ['Campaign Overview', 'Reach & Engagement', 'Lead & Revenue Impact', 'ROAS Analysis', 'Next Steps'],
    color: 'bg-gradient-to-br from-purple-900 to-pink-900',
    icon: '🎯',
  },
  {
    id: 'qbr',
    name: 'Quarterly Business Review',
    desc: 'Executive-level QBR with trend analysis and forecasting',
    useCase: 'Quarterly stakeholder meeting',
    sections: ['Executive Summary', 'Q/Q Growth', 'Channel ROI', 'Revenue Attribution', 'Forecast', 'Strategic Roadmap'],
    color: 'bg-gradient-to-br from-emerald-900 to-teal-900',
    icon: '📈',
  },
  {
    id: 'yir',
    name: 'Year-in-Review Report',
    desc: 'Annual highlight reel with wins, learnings, and outlook',
    useCase: 'Annual client presentation',
    sections: ['Year Highlights', 'Annual KPIs', 'Top Content', 'Milestones', 'YoY Comparison', 'Strategy for Next Year'],
    color: 'bg-gradient-to-br from-amber-900 to-orange-900',
    icon: '🏆',
  },
]

const SCHEDULED_REPORTS = [
  { template: 'Monthly Performance', client: 'Acme Corp', freq: 'Monthly', next: 'Jun 1, 2026', recipients: 'john@acme.com', enabled: true },
  { template: 'Campaign Results', client: 'TechStart Inc', freq: 'Per Campaign', next: 'May 30, 2026', recipients: 'sara@techstart.io', enabled: true },
  { template: 'Quarterly Business Review', client: 'GrowthCo', freq: 'Quarterly', next: 'Jul 1, 2026', recipients: '2 recipients', enabled: false },
  { template: 'Monthly Performance', client: 'Studio Blue', freq: 'Monthly', next: 'Jun 1, 2026', recipients: 'tom@studioblue.co', enabled: true },
]

const PAST_REPORTS = [
  { name: 'Acme Corp – May 2026 Monthly Report', template: 'Monthly Performance', date: 'May 1, 2026', size: '2.4 MB' },
  { name: 'TechStart Campaign Results – Q2 Launch', template: 'Campaign Results', date: 'Apr 28, 2026', size: '1.8 MB' },
  { name: 'GrowthCo Q1 2026 QBR', template: 'Quarterly Business Review', date: 'Apr 1, 2026', size: '4.2 MB' },
  { name: 'Acme Corp – April 2026 Monthly Report', template: 'Monthly Performance', date: 'Apr 1, 2026', size: '2.1 MB' },
  { name: 'Studio Blue – Q1 Year-in-Review', template: 'Year-in-Review', date: 'Mar 31, 2026', size: '5.8 MB' },
]

// ── Bar chart helpers ──────────────────────────────────────────────────────────

const CHART_DAYS = ['May 1', 'May 5', 'May 10', 'May 15', 'May 20', 'May 25', 'May 26']
const CHART_CONTENT = [4, 6, 5, 8, 7, 9, 3]
const CHART_ENGAGEMENT = [12, 18, 15, 22, 20, 28, 9]
const CHART_LEADS = [18, 24, 20, 32, 28, 38, 14]

function BarChart() {
  const maxVal = Math.max(...CHART_LEADS)
  return (
    <div className="flex items-end gap-2 h-40">
      {CHART_DAYS.map((day, i) => (
        <div key={day} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: 120 }}>
            <div
              className="w-full bg-indigo-500/60 rounded-t-sm"
              style={{ height: `${(CHART_LEADS[i] / maxVal) * 100}%` }}
              title={`Leads: ${CHART_LEADS[i]}`}
            />
            <div
              className="w-full bg-purple-500/50 rounded-t-sm"
              style={{ height: `${(CHART_ENGAGEMENT[i] / maxVal) * 60}%` }}
              title={`Engagement score: ${CHART_ENGAGEMENT[i]}`}
            />
            <div
              className="w-full bg-pink-500/40 rounded-t-sm"
              style={{ height: `${(CHART_CONTENT[i] / maxVal) * 30}%` }}
              title={`Content: ${CHART_CONTENT[i]}`}
            />
          </div>
          <span className="text-gray-600 text-xs whitespace-nowrap" style={{ fontSize: 9 }}>{day}</span>
        </div>
      ))}
    </div>
  )
}

// ── Report Builder Modal ───────────────────────────────────────────────────────

function ReportBuilderModal({
  template,
  onClose,
}: {
  template: typeof REPORT_TEMPLATES[0]
  onClose: () => void
}) {
  const [step, setStep] = useState<'build' | 'preview'>('build')
  const [range, setRange] = useState('Last 30 days')
  const [client, setClient] = useState('Acme Corp')
  const [agencyName, setAgencyName] = useState('My Agency')
  const [commentary, setCommentary] = useState('')
  const [sections, setSections] = useState<Record<string, boolean>>(
    Object.fromEntries(template.sections.map(s => [s, true]))
  )
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [schedFreq, setSchedFreq] = useState('Monthly')
  const [schedEmail, setSchedEmail] = useState('')
  const [scheduled, setScheduled] = useState(false)

  function handleDownload() {
    const data = JSON.stringify({
      report: template.name,
      client,
      range,
      agencyName,
      sections: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
      commentary,
      generatedAt: new Date().toISOString(),
    }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name.replace(/\s+/g, '_')}_${client.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">{template.icon} {template.name}</h2>
            <p className="text-gray-500 text-xs mt-0.5">Report Builder</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(step === 'build' ? 'preview' : 'build')}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              {step === 'build' ? 'Preview Report' : '← Back to Builder'}
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl px-2 transition-colors">✕</button>
          </div>
        </div>

        {step === 'build' ? (
          <div className="p-6 space-y-6">
            {/* Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Date Range</label>
                <select
                  value={range}
                  onChange={e => setRange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                >
                  {['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 12 months'].map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Client / Workspace</label>
                <select
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                >
                  {['Acme Corp', 'TechStart Inc', 'GrowthCo', 'Studio Blue', 'All Clients'].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sections */}
            <div>
              <label className="text-gray-400 text-xs mb-3 block uppercase tracking-wider">Include Sections</label>
              <div className="grid grid-cols-2 gap-2">
                {template.sections.map(sec => (
                  <label key={sec} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections[sec] ?? true}
                      onChange={e => setSections(prev => ({ ...prev, [sec]: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-500"
                    />
                    <span className="text-gray-300 text-sm">{sec}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Branding */}
            <div>
              <label className="text-gray-400 text-xs mb-3 block uppercase tracking-wider">Branding</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Agency Name</label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2"
                    placeholder="Your Agency Name"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" defaultValue="#6366f1" className="w-10 h-9 rounded-lg bg-gray-800 border border-gray-700 cursor-pointer" />
                    <span className="text-gray-400 text-xs">Accent color for report headers</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commentary */}
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block uppercase tracking-wider">Custom Commentary</label>
              <textarea
                value={commentary}
                onChange={e => setCommentary(e.target.value)}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 resize-none"
                placeholder="Add a personalized message or analysis note to the report…"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep('preview')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Preview Report
              </button>
              <button
                onClick={handleDownload}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                ↓ Download Report
              </button>
              <button
                onClick={() => setScheduleOpen(v => !v)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Schedule Delivery
              </button>
            </div>

            {/* Schedule panel */}
            {scheduleOpen && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-white text-sm font-medium">Schedule Recurring Delivery</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Frequency</label>
                    <select
                      value={schedFreq}
                      onChange={e => setSchedFreq(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5"
                    >
                      {['Weekly', 'Monthly', 'Quarterly', 'Per Campaign'].map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Recipient Email</label>
                    <input
                      type="email"
                      value={schedEmail}
                      onChange={e => setSchedEmail(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5"
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                <button
                  onClick={() => { setScheduled(true); setScheduleOpen(false) }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Confirm Schedule
                </button>
                {scheduled && <p className="text-emerald-400 text-xs">Report scheduled successfully.</p>}
              </div>
            )}
          </div>
        ) : (
          /* Preview */
          <div className="p-6 space-y-5">
            <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-xl p-5">
              <p className="text-indigo-200 text-xs uppercase tracking-wider mb-1">{agencyName}</p>
              <h3 className="text-white text-xl font-bold">{template.name}</h3>
              <p className="text-indigo-300 text-sm mt-1">{client} · {range}</p>
            </div>

            {sections['Executive Summary'] && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-2 text-sm">Executive Summary</h4>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {client} achieved strong marketing performance in this period, with total reach of 2.4M and 847 leads generated across all channels. LinkedIn and Email were top performers, driving 60% of qualified leads. Revenue attribution reached $68,200 — an increase of $9,400 vs. the prior period.
                  {commentary && ` ${commentary}`}
                </p>
              </div>
            )}

            {sections['KPIs'] && (
              <div>
                <h4 className="text-white font-medium mb-3 text-sm">Key Performance Indicators</h4>
                <div className="grid grid-cols-3 gap-3">
                  {STAT_BAR.slice(0, 6).map(s => (
                    <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">{s.label}</p>
                      <p className="text-white font-bold text-lg">{s.value}</p>
                      <p className={`text-xs ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.delta}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sections['Recommendations'] && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h4 className="text-white font-medium mb-2 text-sm">Strategic Recommendations</h4>
                <ol className="space-y-1.5">
                  {[
                    'Double down on LinkedIn long-form content — highest CPL efficiency at $2.90.',
                    'Increase email newsletter cadence from 2x/mo to 4x/mo to capitalize on 28.4% engagement.',
                    'Pause Facebook paid ads — $22.10 CPL is 12x higher than email.',
                  ].map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      {r}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleDownload}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                ↓ Download PDF / JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'content' | 'leads' | 'revenue' | 'reports'
type RangeId = '7d' | '30d' | '90d' | '12mo'

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [range, setRange] = useState<RangeId>('30d')
  const [compare, setCompare] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<typeof REPORT_TEMPLATES[0] | null>(null)
  const [scheduledToggles, setScheduledToggles] = useState<Record<number, boolean>>(
    Object.fromEntries(SCHEDULED_REPORTS.map((r, i) => [i, r.enabled]))
  )
  const [roisPend, setRoiSpend] = useState(5000)
  const [roiRoas] = useState(14)

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Content Analytics' },
    { id: 'leads', label: 'Lead Analytics' },
    { id: 'revenue', label: 'Revenue Analytics' },
    { id: 'reports', label: 'Reports' },
  ]

  const RANGES: { id: RangeId; label: string }[] = [
    { id: '7d', label: 'Last 7d' },
    { id: '30d', label: 'Last 30d' },
    { id: '90d', label: 'Last 90d' },
    { id: '12mo', label: '12 Months' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics &amp; Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Data-rich insights across all marketing channels</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Range picker */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${range === r.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
            <button className={`px-3 py-1.5 rounded text-xs font-medium transition-colors text-gray-400 hover:text-white`}>Custom</button>
          </div>

          {/* Compare toggle */}
          <button
            onClick={() => setCompare(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${compare ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${compare ? 'bg-indigo-400' : 'bg-gray-600'}`} />
            Compare to previous period
          </button>

          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            Generate Report
          </button>
          <button className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            Export Data
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_BAR.map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 text-xs mb-1">{s.label}</p>
            <p className="text-white font-bold text-lg">{s.value}</p>
            <p className={`text-xs mt-0.5 ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.delta}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* KPI Grid */}
          <div>
            <h2 className="text-white font-semibold mb-3">Performance KPIs</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: 'Content Published', value: '142', sub: '+18 this period' },
                { label: 'Total Reach', value: '2.4M', sub: '+340K vs prev' },
                { label: 'Avg Engagement', value: '4.7%', sub: 'Industry avg: 2.1%' },
                { label: 'Total Clicks', value: '94,200', sub: '+22% vs prev' },
                { label: 'Total Leads', value: '847', sub: 'Target: 800 ✓' },
                { label: 'Revenue Attr.', value: '$68,200', sub: '+$9,400 vs prev' },
                { label: 'AI Cost', value: '$142', sub: '$0.17/content piece' },
                { label: 'Time Saved', value: '284 hrs', sub: 'vs manual baseline' },
                { label: 'Approval Rate', value: '89%', sub: 'Target: 85% ✓' },
                { label: 'Brand Voice Score', value: '94/100', sub: '+2 pts vs prev' },
                { label: 'Top Channel', value: 'LinkedIn', sub: '312 leads this period' },
                { label: 'Best Content Type', value: 'Long-form', sub: '8.9% avg engagement' },
              ].map(k => (
                <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                  <p className="text-white font-bold">{k.value}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Trend Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Performance Trend</h2>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-indigo-500/60 inline-block" /> Leads</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-purple-500/50 inline-block" /> Engagement</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-pink-500/40 inline-block" /> Content</span>
              </div>
            </div>
            <BarChart />
          </div>

          {/* Channel Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Channel Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Channel', 'Reach', 'Engagement Rate', 'Leads', 'Cost per Lead'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CHANNELS.map(ch => (
                    <tr key={ch.name} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-3 text-sm text-white">
                        <span className="mr-2">{ch.icon}</span>{ch.name}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(ch.reach / 820000) * 100}%` }} />
                          </div>
                          <span className="text-gray-300 text-xs">{(ch.reach / 1000).toFixed(0)}K</span>
                        </div>
                      </td>
                      <td className={`px-3 py-3 text-sm font-medium ${ch.eng >= 5 ? 'text-emerald-400' : ch.eng >= 3 ? 'text-amber-400' : 'text-gray-400'}`}>
                        {ch.eng}%
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">{ch.leads}</td>
                      <td className="px-3 py-3 text-sm text-gray-300">{ch.cpl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Performing Content */}
          <div>
            <h2 className="text-white font-semibold mb-3">Top Performing Content</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TOP_POSTS.map(post => (
                <div key={post.title} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className={`h-24 ${post.color} flex items-center justify-center`}>
                    <span className="text-4xl">
                      {post.platform === 'LinkedIn' ? '💼' : post.platform === 'Instagram' ? '📸' : '✉️'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">{post.platform}</span>
                      <span className="text-gray-500 text-xs">{post.type}</span>
                    </div>
                    <p className="text-white text-sm font-medium mb-2 line-clamp-2">{post.title}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{(post.reach / 1000).toFixed(1)}K reach · {post.eng}% eng</span>
                    </div>
                    <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${post.badgeColor}`}>{post.badge}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Agent Activity */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">AI Agent Activity</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Agent', 'Runs', 'Tasks Completed', 'Cost'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AI_AGENTS.map(agent => (
                    <tr key={agent.name} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-3 text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        {agent.name}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">{agent.runs}</td>
                      <td className="px-3 py-3 text-sm text-gray-300">{agent.tasks}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{agent.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* CONTENT ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Content by type */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Content Volume by Type</h2>
              <div className="space-y-3">
                {CONTENT_BY_TYPE.map(item => (
                  <div key={item.type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{item.type}</span>
                      <span className="text-gray-300 font-medium">{item.count}</span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.count / 62) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best performing */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Best Performing</h2>
              <div className="space-y-3">
                {[
                  { label: 'Content Type', value: 'Long-form Article', badge: '8.9% avg engagement', color: 'text-emerald-400' },
                  { label: 'Top Platform', value: 'LinkedIn', badge: '312 leads', color: 'text-blue-400' },
                  { label: 'Best Posting Time', value: 'Tuesday 9–11am', badge: '+34% above average', color: 'text-indigo-400' },
                  { label: 'Optimal Length', value: '1,200–1,800 words', badge: 'Blog posts', color: 'text-purple-400' },
                  { label: 'Brand Voice Score', value: '94/100', badge: '+2 pts vs last period', color: 'text-amber-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                    <span className="text-gray-400 text-sm">{item.label}</span>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${item.color}`}>{item.value}</p>
                      <p className="text-gray-600 text-xs">{item.badge}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Content velocity */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Content Velocity</h2>
              <span className="text-gray-400 text-sm">Avg <span className="text-white font-medium">4.7</span> posts/day</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {[3, 5, 4, 7, 6, 5, 8, 4, 6, 7, 5, 9, 6, 8].map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-indigo-500/50 hover:bg-indigo-500 rounded-t transition-colors cursor-default"
                  style={{ height: `${(v / 9) * 100}%` }}
                  title={`${v} posts`}
                />
              ))}
            </div>
          </div>

          {/* Top 10 posts table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Top 10 Posts</h2>
              <button className="text-gray-400 hover:text-white text-xs border border-gray-700 px-3 py-1 rounded-lg transition-colors">Export CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Content', 'Platform', 'Reach', 'Eng Rate', 'Clicks', 'Date'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TOP_CONTENT_TABLE.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{row.preview}</td>
                      <td className="px-4 py-3 text-sm text-indigo-400">{row.platform}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{row.reach}</td>
                      <td className="px-4 py-3 text-sm text-emerald-400 font-medium">{row.eng}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{row.clicks}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* LEAD ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'leads' && (
        <div className="space-y-6">

          {/* Funnel */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-5">Lead Funnel</h2>
            <div className="space-y-3">
              {LEAD_FUNNEL.map((stage, i) => (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-300">{stage.stage}</span>
                    <span className="text-white font-bold">{stage.count} <span className="text-gray-500 font-normal text-xs">({stage.pct}%)</span></span>
                  </div>
                  <div className="h-8 bg-gray-800 rounded-lg overflow-hidden">
                    <div
                      className={`h-full rounded-lg flex items-center px-3 ${
                        i === 0 ? 'bg-indigo-600' : i === 1 ? 'bg-indigo-500' : i === 2 ? 'bg-purple-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${stage.pct}%` }}
                    >
                      <span className="text-white text-xs font-medium whitespace-nowrap">{stage.count}</span>
                    </div>
                  </div>
                  {i < LEAD_FUNNEL.length - 1 && (
                    <div className="flex justify-end text-xs text-gray-600 mt-0.5">
                      {Math.round((LEAD_FUNNEL[i + 1].count / stage.count) * 100)}% conversion
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Highlight + sources */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best month highlight */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/60 border border-indigo-700/40 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <p className="text-indigo-300 text-xs font-medium uppercase tracking-wider mb-1">Best Month</p>
                <h3 className="text-white text-2xl font-bold">April 2026</h3>
                <p className="text-indigo-200 text-sm mt-1">1,142 leads generated — a record month</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-indigo-200 text-xs">Top Source</p>
                  <p className="text-white font-semibold text-sm">LinkedIn</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-indigo-200 text-xs">Avg CPL</p>
                  <p className="text-white font-semibold text-sm">$3.40</p>
                </div>
              </div>
            </div>

            {/* Lead sources */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Lead Sources</h2>
              <div className="space-y-3">
                {LEAD_SOURCES.map(src => (
                  <div key={src.source}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">{src.source}</span>
                      <span className="text-gray-300 font-medium">{src.leads} ({src.pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${src.color} rounded-full`} style={{ width: `${src.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CPL table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Cost Per Lead by Channel</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Channel', 'CPL', 'Leads', 'Lead Quality'].map(h => (
                    <th key={h} className="text-left text-gray-400 text-xs font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COST_PER_LEAD.map(row => (
                  <tr key={row.channel} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-white">{row.channel}</td>
                    <td className="px-5 py-3 text-sm font-medium text-indigo-300">{row.cpl}</td>
                    <td className="px-5 py-3 text-sm text-gray-300">{row.leads}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        row.quality === 'High' ? 'bg-emerald-500/20 text-emerald-400' :
                        row.quality === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>{row.quality}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lead scoring distribution */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Lead Scoring Distribution</h2>
            <div className="flex items-end gap-2 h-28">
              {[
                { range: '0–20', count: 42, color: 'bg-red-500/60' },
                { range: '21–40', count: 88, color: 'bg-amber-500/60' },
                { range: '41–60', count: 156, color: 'bg-yellow-500/60' },
                { range: '61–80', count: 312, color: 'bg-indigo-500/60' },
                { range: '81–100', count: 249, color: 'bg-emerald-500/60' },
              ].map(bar => (
                <div key={bar.range} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-gray-500 text-xs">{bar.count}</span>
                  <div className={`w-full ${bar.color} rounded-t`} style={{ height: `${(bar.count / 312) * 80}%`, minHeight: 4 }} />
                  <span className="text-gray-600 text-xs">{bar.range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* REVENUE ANALYTICS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">

          {/* Revenue summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Revenue Attributed', value: '$68,200', delta: '+$9,400 vs prev', sub: 'Marketing-driven revenue', up: true },
              { label: 'Customer Acq. Cost', value: '$38.40', delta: '-$4.20 vs prev', sub: '62 new customers', up: false },
              { label: 'Blended ROAS', value: '14.1x', delta: '+1.8x vs prev', sub: 'Across all channels', up: true },
            ].map(card => (
              <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-gray-400 text-xs mb-1">{card.label}</p>
                <p className="text-white text-3xl font-bold">{card.value}</p>
                <p className={`text-sm mt-1 ${card.up ? 'text-emerald-400' : 'text-emerald-400'}`}>{card.delta}</p>
                <p className="text-gray-600 text-xs mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue by channel */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">Revenue by Channel</h2>
            <div className="space-y-3">
              {REVENUE_CHANNELS.map(ch => (
                <div key={ch.channel} className="flex items-center gap-4">
                  <div className="w-36 text-sm text-gray-300 flex-shrink-0">{ch.channel}</div>
                  <div className="flex-1 h-6 bg-gray-800 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${ch.color} rounded-lg flex items-center px-3`}
                      style={{ width: `${(ch.revenue / 28400) * 100}%` }}
                    >
                      <span className="text-white text-xs font-medium whitespace-nowrap">
                        ${(ch.revenue / 1000).toFixed(1)}K
                      </span>
                    </div>
                  </div>
                  <div className="w-16 text-right text-xs text-gray-400 flex-shrink-0">{ch.roas}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ROI Calculator + Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">ROI Calculator</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Monthly Marketing Spend ($)</label>
                  <input
                    type="range"
                    min={1000}
                    max={50000}
                    step={500}
                    value={roisPend}
                    onChange={e => setRoiSpend(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>$1K</span>
                    <span className="text-white font-medium">${roisPend.toLocaleString()}</span>
                    <span>$50K</span>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs">Projected Revenue</p>
                    <p className="text-emerald-400 font-bold text-xl">${(roisPend * roiRoas).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Projected ROAS</p>
                    <p className="text-white font-bold text-xl">{roiRoas}x</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Net Profit</p>
                    <p className="text-white font-bold text-xl">${(roisPend * roiRoas - roisPend).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">ROI</p>
                    <p className="text-indigo-400 font-bold text-xl">{((roiRoas - 1) * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <p className="text-gray-600 text-xs">Based on your current blended ROAS of {roiRoas}x. Past performance does not guarantee future results.</p>
              </div>
            </div>

            {/* Revenue forecast */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Revenue Forecast</h2>
              <div className="flex items-end gap-1 h-32">
                {[
                  { month: 'Jan', rev: 42000, forecast: false },
                  { month: 'Feb', rev: 48000, forecast: false },
                  { month: 'Mar', rev: 54000, forecast: false },
                  { month: 'Apr', rev: 61000, forecast: false },
                  { month: 'May', rev: 68200, forecast: false },
                  { month: 'Jun', rev: 74000, forecast: true },
                  { month: 'Jul', rev: 80000, forecast: true },
                  { month: 'Aug', rev: 87000, forecast: true },
                ].map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t ${m.forecast ? 'border-t-2 border-dashed border-indigo-400 bg-indigo-500/20' : 'bg-indigo-500/70'}`}
                      style={{ height: `${(m.rev / 87000) * 100}%` }}
                    />
                    <span className="text-gray-600 text-xs">{m.month}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-indigo-500/70 rounded inline-block" /> Actual</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-indigo-500/20 border border-dashed border-indigo-400 rounded inline-block" /> Forecast</span>
              </div>
            </div>
          </div>

          {/* Top campaigns */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Top Revenue-Generating Campaigns</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Campaign', 'Type', 'Revenue', 'ROAS', 'Leads'].map(h => (
                    <th key={h} className="text-left text-gray-400 text-xs font-medium px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_CAMPAIGNS.map(camp => (
                  <tr key={camp.name} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-white">{camp.name}</td>
                    <td className="px-5 py-3"><span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded">{camp.type}</span></td>
                    <td className="px-5 py-3 text-sm font-medium text-emerald-400">{camp.revenue}</td>
                    <td className="px-5 py-3 text-sm text-indigo-300 font-medium">{camp.roas}</td>
                    <td className="px-5 py-3 text-sm text-gray-300">{camp.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* REPORTS TAB */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="space-y-8">

          {/* Template gallery */}
          <div>
            <h2 className="text-white font-semibold mb-4">Report Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {REPORT_TEMPLATES.map(tpl => (
                <div key={tpl.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors">
                  <div className={`h-28 ${tpl.color} flex items-center justify-center`}>
                    <span className="text-5xl">{tpl.icon}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-medium text-sm mb-1">{tpl.name}</h3>
                    <p className="text-gray-500 text-xs mb-2">{tpl.desc}</p>
                    <p className="text-gray-600 text-xs mb-3">Use case: {tpl.useCase}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tpl.sections.slice(0, 3).map(s => (
                        <span key={s} className="bg-gray-800 text-gray-400 text-xs px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                      {tpl.sections.length > 3 && (
                        <span className="bg-gray-800 text-gray-500 text-xs px-1.5 py-0.5 rounded">+{tpl.sections.length - 3} more</span>
                      )}
                    </div>
                    <button
                      onClick={() => setActiveTemplate(tpl)}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      Generate Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduled reports */}
          <div>
            <h2 className="text-white font-semibold mb-4">Scheduled Reports</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Template', 'Client', 'Frequency', 'Next Send', 'Recipients', 'Status'].map(h => (
                      <th key={h} className="text-left text-gray-400 text-xs font-medium px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCHEDULED_REPORTS.map((r, i) => (
                    <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3 text-sm text-white">{r.template}</td>
                      <td className="px-5 py-3 text-sm text-gray-300">{r.client}</td>
                      <td className="px-5 py-3 text-sm text-gray-400">{r.freq}</td>
                      <td className="px-5 py-3 text-sm text-gray-400">{r.next}</td>
                      <td className="px-5 py-3 text-sm text-gray-400">{r.recipients}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setScheduledToggles(prev => ({ ...prev, [i]: !prev[i] }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${scheduledToggles[i] ? 'bg-indigo-600' : 'bg-gray-700'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${scheduledToggles[i] ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Past reports */}
          <div>
            <h2 className="text-white font-semibold mb-4">Past Reports</h2>
            <div className="space-y-2">
              {PAST_REPORTS.map((r, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 flex items-center justify-between hover:border-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <div>
                      <p className="text-white text-sm font-medium">{r.name}</p>
                      <p className="text-gray-500 text-xs">{r.template} · {r.date} · {r.size}</p>
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-medium border border-indigo-800/50 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ Download
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Report builder modal */}
      {activeTemplate && (
        <ReportBuilderModal
          template={activeTemplate}
          onClose={() => setActiveTemplate(null)}
        />
      )}

    </div>
  )
}
