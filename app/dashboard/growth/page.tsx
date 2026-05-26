'use client'

import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type GrowthTab = 'dashboard' | 'cohort' | 'levers' | 'experiments'
type ExperimentStatus = 'Running' | 'Completed' | 'Failed'
type EffortLevel = 'Low' | 'Medium' | 'High'
type CohortToggle = 'users' | 'revenue'

interface Experiment {
  id: string
  hypothesis: string
  metric: string
  variant: string
  status: ExperimentStatus
  result?: string
  significance?: number
  actualLift?: number
  expectedLift?: number
  winner?: boolean
  duration: string
  startDate: string
}

interface GrowthOpportunity {
  id: string
  title: string
  description: string
  potentialMrr: number
  effort: EffortLevel
  category: string
  icon: string
}

interface AddExperimentForm {
  hypothesis: string
  metric: string
  targetLift: number
  duration: number
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MRR_TREND = [
  { month: 'Jun 25', mrr: 18200 },
  { month: 'Jul 25', mrr: 21400 },
  { month: 'Aug 25', mrr: 24800 },
  { month: 'Sep 25', mrr: 27300 },
  { month: 'Oct 25', mrr: 29900 },
  { month: 'Nov 25', mrr: 32100 },
  { month: 'Dec 25', mrr: 35600 },
  { month: 'Jan 26', mrr: 38200 },
  { month: 'Feb 26', mrr: 41500 },
  { month: 'Mar 26', mrr: 44800 },
  { month: 'Apr 26', mrr: 48300 },
  { month: 'May 26', mrr: 52400 },
]

const maxMrr = Math.max(...MRR_TREND.map(m => m.mrr))

// Cohort retention data (% retained)
const COHORT_USER_DATA = [
  { month: 'Jan 26', m0: 100, m1: 78, m2: 64, m3: 58, m4: 52, m5: 49 },
  { month: 'Feb 26', m0: 100, m1: 81, m2: 67, m3: 61, m4: 56, m5: null },
  { month: 'Mar 26', m0: 100, m1: 75, m2: 62, m3: 55, m4: null, m5: null },
  { month: 'Apr 26', m0: 100, m1: 83, m2: 70, m3: null, m4: null, m5: null },
  { month: 'May 26', m0: 100, m1: 86, m2: null, m3: null, m4: null, m5: null },
]

const COHORT_REVENUE_DATA = [
  { month: 'Jan 26', m0: 100, m1: 92, m2: 88, m3: 91, m4: 96, m5: 94 },
  { month: 'Feb 26', m0: 100, m1: 94, m2: 90, m3: 94, m4: 98, m5: null },
  { month: 'Mar 26', m0: 100, m1: 88, m2: 85, m3: 87, m4: null, m5: null },
  { month: 'Apr 26', m0: 100, m1: 95, m2: 93, m3: null, m4: null, m5: null },
  { month: 'May 26', m0: 100, m1: 97, m2: null, m3: null, m4: null, m5: null },
]

const GROWTH_OPPORTUNITIES: GrowthOpportunity[] = [
  {
    id: 'o1', icon: '📈',
    title: 'Upsell 12 customers from Pro → Agency',
    description: 'These 12 Pro customers are hitting plan limits consistently (avg 92% usage). Personalized upgrade campaign could convert 8+.',
    potentialMrr: 2400,
    effort: 'Low',
    category: 'Expansion',
  },
  {
    id: 'o2', icon: '🔄',
    title: 'Win-back 5 churned customers (last 90 days)',
    description: '5 customers churned due to pricing concerns. Current market has improved — targeted win-back email + 20% for 3 months could recover.',
    potentialMrr: 1250,
    effort: 'Low',
    category: 'Win-back',
  },
  {
    id: 'o3', icon: '📢',
    title: 'Expand LinkedIn Ads — 2.3x ROAS, budget headroom available',
    description: 'LinkedIn campaigns are at 2.3x ROAS with daily budget only 60% utilized. Scaling budget by 40% could yield proportional returns.',
    potentialMrr: 3800,
    effort: 'Medium',
    category: 'Paid Acquisition',
  },
  {
    id: 'o4', icon: '✉️',
    title: 'Fix trial → paid conversion gap (12% vs 22% industry avg)',
    description: 'Trial-to-paid conversion is 12%, 10 points below industry benchmark. Onboarding email sequence redesign with value triggers could close the gap.',
    potentialMrr: 4100,
    effort: 'Medium',
    category: 'Conversion',
  },
  {
    id: 'o5', icon: '🤝',
    title: 'Launch referral program — 0 referrals currently',
    description: 'NPS is 54. No referral program exists. A 2-sided incentive (1 free month for referrer + 20% off for referred) is low-cost, high-ROI.',
    potentialMrr: 2900,
    effort: 'Medium',
    category: 'Referral',
  },
  {
    id: 'o6', icon: '🌍',
    title: 'SEO gap — 47 high-volume keywords with no content',
    description: 'Competitor analysis reveals 47 transactional keywords your competitors rank for but you have no content for. Avg monthly volume: 12,400.',
    potentialMrr: 1800,
    effort: 'High',
    category: 'SEO',
  },
]

const EXPERIMENTS: Experiment[] = [
  {
    id: 'e1',
    hypothesis: 'Showing a "Time to value" counter on onboarding increases trial activation',
    metric: 'Trial Activation Rate',
    variant: 'Progress bar showing "3 steps to your first result"',
    status: 'Running',
    duration: '14 days',
    startDate: '2026-05-19',
    expectedLift: 15,
  },
  {
    id: 'e2',
    hypothesis: 'Adding social proof (customer count) near pricing CTA lifts conversions',
    metric: 'Pricing Page Conversion',
    variant: '"Join 1,200+ marketing teams" badge near CTA button',
    status: 'Completed',
    duration: '21 days',
    startDate: '2026-04-28',
    result: 'Winner: Variant B',
    significance: 94,
    actualLift: 18,
    expectedLift: 12,
    winner: true,
  },
  {
    id: 'e3',
    hypothesis: 'Personalized onboarding email (mentions their industry) improves open rate',
    metric: 'Email Open Rate',
    variant: 'Dynamic industry-specific subject line + first paragraph',
    status: 'Completed',
    duration: '14 days',
    startDate: '2026-04-10',
    result: 'No significant difference',
    significance: 61,
    actualLift: 3,
    expectedLift: 20,
    winner: false,
  },
  {
    id: 'e4',
    hypothesis: 'Exit-intent popup with 15% off reduces churn at payment fail step',
    metric: 'Payment Failure Churn',
    variant: '15% discount popup triggered at payment retry screen',
    status: 'Failed',
    duration: '7 days',
    startDate: '2026-05-01',
    result: 'Failed — insufficient traffic to payment retry page',
    significance: 0,
    actualLift: 0,
    expectedLift: 25,
    winner: false,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMrr(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`
}

function getCohortColor(val: number | null): string {
  if (val === null) return 'bg-gray-800 text-gray-700'
  if (val >= 90) return 'bg-emerald-600/80 text-white'
  if (val >= 75) return 'bg-emerald-700/60 text-emerald-100'
  if (val >= 60) return 'bg-teal-800/60 text-teal-200'
  if (val >= 50) return 'bg-blue-800/60 text-blue-200'
  return 'bg-gray-700/60 text-gray-300'
}

const EFFORT_STYLES: Record<EffortLevel, string> = {
  Low: 'bg-green-900/40 border border-green-700/50 text-green-300',
  Medium: 'bg-yellow-900/40 border border-yellow-700/50 text-yellow-300',
  High: 'bg-red-900/40 border border-red-700/50 text-red-300',
}

const EXP_STATUS_STYLES: Record<ExperimentStatus, string> = {
  Running: 'bg-indigo-900/40 border border-indigo-700/50 text-indigo-300',
  Completed: 'bg-green-900/40 border border-green-700/50 text-green-300',
  Failed: 'bg-red-900/40 border border-red-700/50 text-red-300',
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function GrowthPage() {
  const [activeTab, setActiveTab] = useState<GrowthTab>('dashboard')
  const [cohortToggle, setCohortToggle] = useState<CohortToggle>('users')
  const [showAddExperiment, setShowAddExperiment] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState<string | null>(null)
  const [planCreated, setPlanCreated] = useState<string | null>(null)
  const [expForm, setExpForm] = useState<AddExperimentForm>({
    hypothesis: '', metric: '', targetLift: 15, duration: 14,
  })

  const cohortData = cohortToggle === 'users' ? COHORT_USER_DATA : COHORT_REVENUE_DATA

  const currentMrr = MRR_TREND[MRR_TREND.length - 1].mrr
  const prevMrr = MRR_TREND[MRR_TREND.length - 2].mrr
  const mrrChange = ((currentMrr - prevMrr) / prevMrr * 100).toFixed(1)

  const handleCreatePlan = (oppId: string) => {
    setCreatingPlan(oppId)
    setTimeout(() => {
      setCreatingPlan(null)
      setPlanCreated(oppId)
    }, 1800)
  }

  const TABS = [
    { id: 'dashboard', label: 'Growth Dashboard', icon: '📊' },
    { id: 'cohort', label: 'Cohort Analysis', icon: '🔬' },
    { id: 'levers', label: 'Growth Levers', icon: '⚡' },
    { id: 'experiments', label: 'Experiments', icon: '🧪' },
  ] as const

  return (
    <div className="p-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Growth Intelligence</h1>
          <p className="text-gray-400 text-sm mt-1">Revenue metrics, cohort analysis, and AI-identified growth opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-emerald-900/30 border border-emerald-700/50">
            <p className="text-emerald-300 text-xs">Current MRR</p>
            <p className="text-white font-bold text-lg leading-tight">{formatMrr(currentMrr)}</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <span>📊</span> Growth Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 flex-wrap">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Early-stage banner: growth metrics need 30 days of data to be meaningful */}
      <div className="mb-6 bg-indigo-950/30 border border-indigo-900/60 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-xl">📈</span>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">Not enough data yet</p>
          <p className="text-gray-400 text-xs mt-0.5">Growth metrics, cohort retention, and experiments will populate after about 30 days of active customer activity. The figures below are illustrative sample data.</p>
        </div>
      </div>

      {/* ── TAB 1: Growth Dashboard ─────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* MRR metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'MRR', value: formatMrr(currentMrr), sub: `+${mrrChange}% MoM`, color: 'text-emerald-400', subColor: 'text-emerald-500' },
              { label: 'ARR', value: formatMrr(currentMrr * 12), sub: 'annualized', color: 'text-white', subColor: 'text-gray-500' },
              { label: 'New MRR', value: formatMrr(6800), sub: 'this month', color: 'text-green-400', subColor: 'text-gray-500' },
              { label: 'Churned MRR', value: formatMrr(1240), sub: '-2.4%', color: 'text-red-400', subColor: 'text-red-600' },
              { label: 'Expansion MRR', value: formatMrr(2100), sub: 'upsells + seats', color: 'text-blue-400', subColor: 'text-gray-500' },
              { label: 'Net MRR Growth', value: formatMrr(7660), sub: '+17.1%', color: 'text-indigo-400', subColor: 'text-indigo-600' },
            ].map(m => (
              <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{m.label}</p>
                <p className={`text-xs mt-0.5 ${m.subColor}`}>{m.sub}</p>
              </div>
            ))}
          </div>

          {/* MRR Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">MRR Trend — Last 12 Months</h3>
              <span className="text-emerald-400 text-sm font-medium">+188% YoY</span>
            </div>
            <div className="flex items-end gap-2 h-40">
              {MRR_TREND.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="relative flex-1 w-full flex items-end">
                    <div
                      className={`w-full rounded-t-sm transition-all ${i === MRR_TREND.length - 1 ? 'bg-emerald-500' : 'bg-emerald-700/50 group-hover:bg-emerald-600/70'}`}
                      style={{ height: `${(m.mrr / maxMrr) * 100}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {formatMrr(m.mrr)}
                    </div>
                  </div>
                  <span className="text-gray-600 text-xs truncate w-full text-center hidden lg:block">{m.month.split(' ')[0]}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>{MRR_TREND[0].month}</span>
              <span>{MRR_TREND[MRR_TREND.length - 1].month}</span>
            </div>
          </div>

          {/* Customer metrics + CAC/LTV */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Customer metrics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Customer Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Total Customers', value: '487', color: 'text-white' },
                  { label: 'New This Month', value: '64', color: 'text-green-400' },
                  { label: 'Churned This Month', value: '11', color: 'text-red-400' },
                  { label: 'Net New', value: '+53', color: 'text-emerald-400' },
                ].map(c => (
                  <div key={c.label} className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>
              {/* Churn rate */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Monthly Churn Rate</span>
                <span className="text-yellow-400 font-bold text-sm">2.4%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full mt-1.5">
                <div className="h-full w-[2.4%] bg-yellow-500 rounded-full min-w-[4px]" />
              </div>
              <p className="text-gray-600 text-xs mt-1">Industry avg: 3.5% — You&apos;re 1.1 points better</p>
            </div>

            {/* LTV / CAC */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">LTV : CAC Analysis</h3>
              {/* LTV:CAC ratio highlight */}
              <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4 mb-4 text-center">
                <p className="text-gray-400 text-xs mb-1">LTV : CAC Ratio</p>
                <p className="text-4xl font-bold text-emerald-400">4.2x</p>
                <p className="text-emerald-500 text-xs mt-1">Healthy (target: &gt;3x) ✅</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Avg Customer LTV', value: '$3,240', sub: 'based on 41mo avg lifespan' },
                  { label: 'CAC (blended)', value: '$771', sub: 'paid + organic combined' },
                  { label: 'CAC Payback Period', value: '4.8 months', sub: 'industry avg: 7.2 months' },
                  { label: 'LTV / Segment (Agency)', value: '$5,820', sub: 'highest value segment' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">{item.label}</p>
                      <p className="text-gray-600 text-xs">{item.sub}</p>
                    </div>
                    <span className="text-white font-semibold text-sm">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Cohort Analysis ──────────────────────────────────────── */}
      {activeTab === 'cohort' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-white font-semibold">Cohort Retention Analysis</h2>
              <p className="text-gray-400 text-xs mt-0.5">Percentage of cohort retained by month after acquisition</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
                {([
                  { v: 'users', label: 'User Cohorts' },
                  { v: 'revenue', label: 'Revenue Cohorts' },
                ] as const).map(({ v, label }) => (
                  <button key={v} onClick={() => setCohortToggle(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${cohortToggle === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors">
                Download Data
              </button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/40">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-24">Cohort</th>
                    {['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5'].map(m => (
                      <th key={m} className="text-center px-3 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortData.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-800 last:border-0">
                      <td className="px-4 py-3 text-gray-300 text-sm font-medium">{row.month}</td>
                      {[row.m0, row.m1, row.m2, row.m3, row.m4, row.m5].map((val, ci) => (
                        <td key={ci} className="px-3 py-3 text-center">
                          {val === null ? (
                            <span className="text-gray-700 text-xs">—</span>
                          ) : (
                            <div className={`inline-flex items-center justify-center w-14 h-8 rounded-lg text-xs font-bold ${getCohortColor(val)}`}>
                              {val}%
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Legend */}
            <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-4 flex-wrap">
              <span className="text-gray-500 text-xs">Retention intensity:</span>
              {[
                { color: 'bg-emerald-600/80', label: '≥90%' },
                { color: 'bg-emerald-700/60', label: '75-89%' },
                { color: 'bg-teal-800/60', label: '60-74%' },
                { color: 'bg-blue-800/60', label: '50-59%' },
                { color: 'bg-gray-700/60', label: '<50%' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={`w-4 h-4 rounded ${l.color}`} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* Cohort insights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Best Cohort (Month 1)', value: 'May 26', sub: '86% retained at M1', color: 'text-emerald-400' },
              { label: 'Avg M3 Retention', value: '58%', sub: 'vs 44% industry avg', color: 'text-blue-400' },
              { label: 'Revenue Expansion', value: '+94%', sub: 'avg revenue per cohort at M5 vs M0', color: 'text-purple-400' },
            ].map(c => (
              <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-gray-400 text-xs mt-0.5">{c.label}</p>
                <p className="text-gray-600 text-xs mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: Growth Levers ────────────────────────────────────────── */}
      {activeTab === 'levers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-white font-semibold">AI-Identified Growth Opportunities</h2>
              <p className="text-gray-400 text-xs mt-0.5">Ranked by potential impact — analyzed from your current pipeline, campaigns, and customer data</p>
            </div>
            <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-xl px-4 py-2 text-center">
              <p className="text-indigo-300 text-xs">Total Potential</p>
              <p className="text-white font-bold text-lg">{formatMrr(GROWTH_OPPORTUNITIES.reduce((s, o) => s + o.potentialMrr, 0))}/mo</p>
            </div>
          </div>

          {GROWTH_OPPORTUNITIES.map(opp => (
            <div key={opp.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row gap-4">
              <div className="text-3xl flex-shrink-0">{opp.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-white font-semibold text-sm">{opp.title}</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EFFORT_STYLES[opp.effort]}`}>
                      {opp.effort} effort
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400 border border-gray-700">{opp.category}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">{opp.description}</p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold text-lg">+{formatMrr(opp.potentialMrr)}</span>
                    <span className="text-gray-500 text-xs">MRR potential</span>
                  </div>
                  {planCreated === opp.id ? (
                    <span className="flex items-center gap-2 text-green-400 text-sm font-medium">
                      <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
                      Action plan created — sent to CMO Agent
                    </span>
                  ) : (
                    <button onClick={() => handleCreatePlan(opp.id)} disabled={creatingPlan === opp.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-medium transition-colors">
                      {creatingPlan === opp.id ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating Plan...</>
                      ) : 'Create Action Plan'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB 4: Experiments ──────────────────────────────────────────── */}
      {activeTab === 'experiments' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Growth Experiments</h2>
              <p className="text-gray-400 text-xs mt-0.5">{EXPERIMENTS.filter(e => e.status === 'Running').length} running · {EXPERIMENTS.filter(e => e.status === 'Completed').length} completed</p>
            </div>
            <button onClick={() => setShowAddExperiment(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <span>+</span> Add Experiment
            </button>
          </div>

          <div className="space-y-4">
            {EXPERIMENTS.map(exp => (
              <div key={exp.id} className={`bg-gray-900 border rounded-xl p-5 ${exp.winner ? 'border-emerald-700/60' : 'border-gray-800'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${EXP_STATUS_STYLES[exp.status]}`}>
                      {exp.status === 'Running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse mr-1.5 align-middle" />}
                      {exp.status}
                    </span>
                    {exp.winner && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-900/60 border border-emerald-600 text-emerald-300">
                        🏆 Winner
                      </span>
                    )}
                    <span className="text-gray-500 text-xs">{exp.startDate} · {exp.duration}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs">{exp.metric}</span>
                </div>

                <h3 className="text-white font-semibold text-sm mb-1">{exp.hypothesis}</h3>
                <p className="text-gray-400 text-xs mb-3 leading-relaxed">
                  <span className="text-gray-500 font-medium">Variant: </span>{exp.variant}
                </p>

                {/* Results */}
                {exp.status !== 'Running' && (
                  <div className={`rounded-lg px-4 py-3 mt-3 ${exp.winner ? 'bg-emerald-900/20 border border-emerald-800/40' : exp.status === 'Failed' ? 'bg-red-900/20 border border-red-800/40' : 'bg-gray-800'}`}>
                    <p className={`text-sm font-medium mb-2 ${exp.winner ? 'text-emerald-300' : exp.status === 'Failed' ? 'text-red-300' : 'text-gray-300'}`}>{exp.result}</p>
                    {exp.significance !== undefined && exp.significance > 0 && (
                      <div className="flex gap-6 flex-wrap">
                        <div>
                          <p className="text-gray-500 text-xs">Statistical Significance</p>
                          <p className={`text-sm font-bold ${exp.significance >= 90 ? 'text-green-400' : exp.significance >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>{exp.significance}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Actual Lift</p>
                          <p className={`text-sm font-bold ${(exp.actualLift ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{exp.actualLift != null ? (exp.actualLift > 0 ? '+' : '') + exp.actualLift + '%' : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Expected Lift</p>
                          <p className="text-gray-300 text-sm font-bold">+{exp.expectedLift}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Running state */}
                {exp.status === 'Running' && (
                  <div className="mt-3 bg-gray-800 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-xs">Expected lift: +{exp.expectedLift}%</span>
                      <span className="text-indigo-300 text-xs">Collecting data...</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '45%' }} />
                    </div>
                    <p className="text-gray-600 text-xs mt-1.5">Day 7 of {exp.duration} — 45% complete</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Experiment Modal */}
      {showAddExperiment && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Add Growth Experiment</h2>
              <button onClick={() => setShowAddExperiment(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-white text-sm font-medium block mb-2">Hypothesis</label>
                <textarea value={expForm.hypothesis} onChange={e => setExpForm(p => ({ ...p, hypothesis: e.target.value }))}
                  placeholder="e.g. Showing social proof near the CTA will increase conversion rate"
                  rows={3} className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder-gray-600" />
              </div>
              <div>
                <label className="text-white text-sm font-medium block mb-2">Primary Metric to Track</label>
                <input value={expForm.metric} onChange={e => setExpForm(p => ({ ...p, metric: e.target.value }))}
                  placeholder="e.g. Pricing Page Conversion Rate"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-600" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white text-sm font-medium block mb-2">Target Lift (%)</label>
                  <input type="number" value={expForm.targetLift} onChange={e => setExpForm(p => ({ ...p, targetLift: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-white text-sm font-medium block mb-2">Duration (days)</label>
                  <input type="number" value={expForm.duration} onChange={e => setExpForm(p => ({ ...p, duration: +e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex gap-3">
              <button onClick={() => setShowAddExperiment(false)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Launch Experiment
              </button>
              <button onClick={() => setShowAddExperiment(false)}
                className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
