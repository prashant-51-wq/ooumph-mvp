'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FunnelTab = 'overview' | 'builder' | 'analytics' | 'forms'

interface FunnelCard {
  id: string
  name: string
  campaign: string
  conversionRate: number
  visitors: number
  revenue: number
  status: 'Active' | 'Draft' | 'Paused'
  lastUpdated: string
  steps: string[]
}

interface FunnelStep {
  id: string
  type: string
  name: string
  convRate: number
  dropOff: number
}

interface FormField {
  id: string
  type: string
  label: string
  placeholder: string
  required: boolean
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FUNNELS: FunnelCard[] = [
  {
    id: '1', name: 'SaaS Lead Magnet Funnel', campaign: 'LinkedIn B2B Q2', conversionRate: 4.8,
    visitors: 12400, revenue: 48200, status: 'Active', lastUpdated: '2 hours ago',
    steps: ['Landing Page', 'Email Capture', 'Thank You', 'Upsell'],
  },
  {
    id: '2', name: 'Free Trial Funnel', campaign: 'Google Search Brand', conversionRate: 7.2,
    visitors: 8900, revenue: 63100, status: 'Active', lastUpdated: '1 day ago',
    steps: ['Landing Page', 'Signup', 'Onboarding', 'Upgrade'],
  },
  {
    id: '3', name: 'Webinar Registration', campaign: 'Meta Awareness', conversionRate: 12.4,
    visitors: 5200, revenue: 0, status: 'Active', lastUpdated: '3 days ago',
    steps: ['Landing Page', 'Registration', 'Confirmation'],
  },
  {
    id: '4', name: 'Cold Email Outbound', campaign: 'Direct Outreach', conversionRate: 2.1,
    visitors: 2400, revenue: 18900, status: 'Draft', lastUpdated: '1 week ago',
    steps: ['Email', 'Landing Page', 'Demo Book'],
  },
]

const MOCK_FUNNEL_STEPS: FunnelStep[] = [
  { id: '1', type: 'Landing Page', name: 'Hero Landing Page', convRate: 100, dropOff: 0 },
  { id: '2', type: 'Email Capture', name: 'Lead Magnet Opt-in', convRate: 24, dropOff: 76 },
  { id: '3', type: 'Thank You', name: 'Thank You + Offer', convRate: 37, dropOff: 63 },
  { id: '4', type: 'Upsell', name: 'Pro Upgrade Offer', convRate: 26, dropOff: 74 },
  { id: '5', type: 'Checkout', name: 'Payment Page', convRate: 68, dropOff: 32 },
]

const AVAILABLE_FIELDS = [
  { type: 'text', label: 'Text Input', icon: 'T' },
  { type: 'email', label: 'Email', icon: '@' },
  { type: 'phone', label: 'Phone', icon: '#' },
  { type: 'dropdown', label: 'Dropdown', icon: '▼' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'radio', label: 'Radio', icon: '●' },
  { type: 'textarea', label: 'Textarea', icon: '¶' },
  { type: 'file', label: 'File Upload', icon: '↑' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'hidden', label: 'Hidden Field', icon: '○' },
  { type: 'divider', label: 'Divider', icon: '—' },
  { type: 'heading', label: 'Heading', icon: 'H' },
]

const FORM_TEMPLATES = [
  { name: 'Contact Form', fields: ['name', 'email', 'message'] },
  { name: 'Lead Magnet', fields: ['name', 'email', 'company'] },
  { name: 'Event Registration', fields: ['name', 'email', 'phone', 'company'] },
  { name: 'Quote Request', fields: ['name', 'email', 'phone', 'budget', 'message'] },
  { name: 'Survey', fields: ['name', 'email', 'radio', 'textarea'] },
]

const SAVED_FORMS = [
  { id: '1', name: 'Lead Magnet Opt-in', submissions: 1240, convRate: 24.4 },
  { id: '2', name: 'Demo Booking Form', submissions: 389, convRate: 18.2 },
  { id: '3', name: 'Webinar Registration', submissions: 648, convRate: 31.0 },
]

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const totalVisitors = MOCK_FUNNELS.reduce((s, f) => s + f.visitors, 0)
  const totalRevenue = MOCK_FUNNELS.reduce((s, f) => s + f.revenue, 0)
  const avgConv = MOCK_FUNNELS.reduce((s, f) => s + f.conversionRate, 0) / MOCK_FUNNELS.length
  const bestFunnel = [...MOCK_FUNNELS].sort((a, b) => b.conversionRate - a.conversionRate)[0]

  return (
    <div className="space-y-6">
      {/* Global stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Visitors', value: totalVisitors.toLocaleString() },
          { label: 'Overall Conv. Rate', value: `${avgConv.toFixed(1)}%` },
          { label: 'Revenue Generated', value: `$${(totalRevenue / 1000).toFixed(1)}K` },
          { label: 'Best Funnel', value: bestFunnel.name.slice(0, 16) + '…' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-white text-xl font-bold">{s.value}</p>
            <p className="text-gray-500 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Funnel cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {MOCK_FUNNELS.map(f => (
          <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-white font-semibold text-sm">{f.name}</h3>
                <p className="text-gray-500 text-xs mt-0.5">Campaign: {f.campaign}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.status === 'Active' ? 'bg-green-400/10 text-green-400' : f.status === 'Draft' ? 'bg-amber-400/10 text-amber-400' : 'bg-gray-500/10 text-gray-500'}`}>
                {f.status}
              </span>
            </div>

            {/* Mini funnel diagram */}
            <div className="flex items-end gap-1 mb-4 h-8">
              {f.steps.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div style={{ height: `${100 - i * 20}%` }} className="w-full bg-indigo-600/40 rounded-sm border border-indigo-600/60 min-h-[6px]" />
                  <span className="text-[8px] text-gray-600 text-center leading-tight truncate w-full">{s}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-white text-sm font-semibold">{f.visitors.toLocaleString()}</p>
                <p className="text-gray-500 text-xs">Visitors</p>
              </div>
              <div className="text-center">
                <p className="text-green-400 text-sm font-semibold">{f.conversionRate}%</p>
                <p className="text-gray-500 text-xs">Conv. Rate</p>
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-semibold">{f.revenue > 0 ? `$${(f.revenue / 1000).toFixed(1)}K` : '—'}</p>
                <p className="text-gray-500 text-xs">Revenue</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600 text-xs">Updated {f.lastUpdated}</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-indigo-600/20 border border-indigo-600 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">View Details</button>
                <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Funnel Builder Tab ───────────────────────────────────────────────────────

const STEP_TYPES = ['Landing Page', 'Email Capture', 'Thank You', 'Upsell', 'Downsell', 'Checkout', 'Confirmation']

function FunnelBuilderTab() {
  const [steps, setSteps] = useState<FunnelStep[]>(MOCK_FUNNEL_STEPS)
  const [selectedStep, setSelectedStep] = useState<string | null>('1')
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiGoal, setAiGoal] = useState('')
  const [aiBuilding, setAiBuilding] = useState(false)
  const [linkedCampaign, setLinkedCampaign] = useState('LinkedIn B2B Q2')

  function addStep(afterId: string) {
    const idx = steps.findIndex(s => s.id === afterId)
    const newStep: FunnelStep = {
      id: Date.now().toString(),
      type: 'Landing Page',
      name: 'New Step',
      convRate: 50,
      dropOff: 50,
    }
    const updated = [...steps]
    updated.splice(idx + 1, 0, newStep)
    setSteps(updated)
  }

  function removeStep(id: string) {
    setSteps(prev => prev.filter(s => s.id !== id))
    setSelectedStep(null)
  }

  function updateStep(id: string, key: keyof FunnelStep, val: string | number) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [key]: val } : s))
  }

  async function aiBuildFunnel() {
    setAiBuilding(true)
    await new Promise(r => setTimeout(r, 2000))
    setSteps([
      { id: '1', type: 'Landing Page', name: 'Hero Landing Page', convRate: 100, dropOff: 0 },
      { id: '2', type: 'Email Capture', name: 'Free Guide Opt-in', convRate: 32, dropOff: 68 },
      { id: '3', type: 'Thank You', name: 'Welcome + Offer', convRate: 41, dropOff: 59 },
      { id: '4', type: 'Upsell', name: 'Pro Plan Offer', convRate: 28, dropOff: 72 },
      { id: '5', type: 'Checkout', name: 'Secure Payment', convRate: 71, dropOff: 29 },
      { id: '6', type: 'Confirmation', name: 'Order Confirmation', convRate: 100, dropOff: 0 },
    ])
    setAiBuilding(false)
    setShowAiModal(false)
  }

  const selectedStepData = steps.find(s => s.id === selectedStep)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main builder */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <label className="text-gray-500 text-xs block mb-1">Link to Campaign</label>
              <select value={linkedCampaign} onChange={e => setLinkedCampaign(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg focus:outline-none focus:border-indigo-500">
                <option>LinkedIn B2B Q2</option>
                <option>Google Search Brand</option>
                <option>Meta Awareness</option>
                <option>Direct Outreach</option>
              </select>
            </div>
          </div>
          <button onClick={() => setShowAiModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors">
            AI Build Funnel
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={step.id}>
              <div onClick={() => setSelectedStep(step.id)}
                className={`relative bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all ${selectedStep === step.id ? 'border-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-gray-800 hover:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${selectedStep === step.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{step.name}</p>
                    <p className="text-gray-500 text-xs">{step.type}</p>
                  </div>
                  <div className="flex items-center gap-4 mr-2">
                    <div className="text-center">
                      <p className="text-green-400 text-xs font-semibold">{step.convRate}%</p>
                      <p className="text-gray-600 text-[10px]">Conv</p>
                    </div>
                    {step.dropOff > 0 && (
                      <div className="text-center">
                        <p className="text-red-400 text-xs font-semibold">{step.dropOff}%</p>
                        <p className="text-gray-600 text-[10px]">Drop</p>
                      </div>
                    )}
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeStep(step.id) }}
                    className="text-gray-600 hover:text-red-400 transition-colors text-sm">&times;</button>
                </div>
              </div>
              {/* Add step button between steps */}
              {i < steps.length - 1 && (
                <div className="flex items-center justify-center py-1.5">
                  <div className="flex-1 h-px bg-gray-800 max-w-[40px]" />
                  <button onClick={() => addStep(step.id)}
                    className="mx-2 w-6 h-6 rounded-full border border-dashed border-gray-600 text-gray-500 hover:border-indigo-500 hover:text-indigo-400 transition-colors text-sm flex items-center justify-center">
                    +
                  </button>
                  <div className="flex-1 h-px bg-gray-800 max-w-[40px]" />
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-center pt-2">
            <button onClick={() => addStep(steps[steps.length - 1]?.id || '0')}
              className="px-4 py-2 border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 rounded-xl text-sm transition-colors">
              + Add Step
            </button>
          </div>
        </div>
      </div>

      {/* Config panel */}
      <div className="space-y-4">
        {selectedStepData ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-medium text-sm">Step Configuration</h3>
            <div>
              <label className="text-gray-500 text-xs block mb-1">Step Name</label>
              <input value={selectedStepData.name} onChange={e => updateStep(selectedStepData.id, 'name', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">Page Type</label>
              <select value={selectedStepData.type} onChange={e => updateStep(selectedStepData.id, 'type', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                {STEP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">Page Goal / CTA Text</label>
              <input placeholder="e.g. Get your free guide" defaultValue=""
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">Conv. Rate (%)</label>
              <input type="number" value={selectedStepData.convRate} onChange={e => updateStep(selectedStepData.id, 'convRate', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center text-gray-500 text-sm">
            Click a step to configure it
          </div>
        )}
      </div>

      {/* AI Build Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-semibold text-lg mb-2">AI Build Funnel</h3>
            <p className="text-gray-400 text-sm mb-4">Describe your goal and AI will create the optimal funnel structure.</p>
            <textarea value={aiGoal} onChange={e => setAiGoal(e.target.value)}
              rows={3} placeholder="e.g. Generate leads for a B2B SaaS tool with a free trial offer..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowAiModal(false)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={aiBuildFunnel} disabled={aiBuilding || !aiGoal.trim()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                {aiBuilding ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Building...</> : 'Build Funnel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

const FUNNEL_ANALYTICS = {
  visits: 10000,
  leads: 2400,
  qualified: 890,
  customers: 234,
}

const ATTRIBUTION_CAMPAIGNS = [
  { name: 'LinkedIn B2B Q2', visitors: 4200, convRate: 5.1, revenue: 28400, roas: 4.8, best: true },
  { name: 'Google Search Brand', visitors: 2800, convRate: 7.2, revenue: 19200, roas: 6.1, best: false },
  { name: 'Meta Awareness', visitors: 1900, convRate: 3.1, revenue: 8800, roas: 2.9, best: false },
  { name: 'Email Newsletter', visitors: 1100, convRate: 9.2, revenue: 7200, roas: 0, best: false },
]

const TRAFFIC_SOURCES = [
  { name: 'Paid', pct: 52, convRate: 4.2, color: 'bg-indigo-500' },
  { name: 'Organic', pct: 24, convRate: 2.1, color: 'bg-green-500' },
  { name: 'Social', pct: 12, convRate: 3.4, color: 'bg-blue-500' },
  { name: 'Email', pct: 8, convRate: 9.2, color: 'bg-purple-500' },
  { name: 'Direct', pct: 4, convRate: 6.8, color: 'bg-amber-500' },
]

function AnalyticsTab() {
  const [selectedFunnel, setSelectedFunnel] = useState('SaaS Lead Magnet Funnel')
  const [createAbTest, setCreateAbTest] = useState(false)

  const stageData = [
    { label: 'Visits', count: FUNNEL_ANALYTICS.visits, color: 'bg-indigo-600', pct: 100 },
    { label: 'Leads', count: FUNNEL_ANALYTICS.leads, color: 'bg-indigo-500', pct: (FUNNEL_ANALYTICS.leads / FUNNEL_ANALYTICS.visits) * 100 },
    { label: 'Qualified', count: FUNNEL_ANALYTICS.qualified, color: 'bg-indigo-400', pct: (FUNNEL_ANALYTICS.qualified / FUNNEL_ANALYTICS.visits) * 100 },
    { label: 'Customers', count: FUNNEL_ANALYTICS.customers, color: 'bg-indigo-300', pct: (FUNNEL_ANALYTICS.customers / FUNNEL_ANALYTICS.visits) * 100 },
  ]

  return (
    <div className="space-y-6">
      {/* Funnel selector */}
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm">Funnel:</label>
        <select value={selectedFunnel} onChange={e => setSelectedFunnel(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
          {MOCK_FUNNELS.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
        </select>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-5">Conversion Funnel</h3>
        <div className="space-y-3">
          {stageData.map((stage, i) => (
            <div key={stage.label} className="relative group">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-gray-400 text-xs w-20">{stage.label}</span>
                <span className="text-white text-sm font-semibold">{stage.count.toLocaleString()}</span>
                {i > 0 && (
                  <span className="text-gray-500 text-xs">
                    ({((stageData[i].count / stageData[i-1].count) * 100).toFixed(1)}% from previous)
                  </span>
                )}
              </div>
              <div className="relative h-10 flex items-center">
                <div
                  style={{ width: `${stage.pct}%` }}
                  className={`${stage.color} h-8 rounded-r-lg transition-all flex items-center px-3`}
                >
                  <span className="text-white text-xs font-medium">{stage.pct.toFixed(1)}%</span>
                </div>
                {/* Hover tooltip */}
                <div className="absolute left-0 -top-8 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  Avg time at stage: {i === 0 ? '0s' : i === 1 ? '2m 14s' : i === 2 ? '4m 30s' : '8m 10s'} | Top source: Paid
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Attribution */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-4">Campaign Attribution</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['Campaign', 'Visitors Sent', 'Conv. Rate', 'Revenue', 'ROAS'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ATTRIBUTION_CAMPAIGNS.map((c, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{c.name}</span>
                      {c.best && <span className="text-xs bg-green-600/20 border border-green-600 text-green-400 px-1.5 py-0.5 rounded-full">Best</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-300 text-sm">{c.visitors.toLocaleString()}</td>
                  <td className="px-3 py-3 text-green-400 text-sm font-medium">{c.convRate}%</td>
                  <td className="px-3 py-3 text-gray-300 text-sm">${c.revenue.toLocaleString()}</td>
                  <td className="px-3 py-3">
                    {c.roas > 0 ? (
                      <span className={`text-sm font-semibold ${c.roas >= 4 ? 'text-green-400' : 'text-amber-400'}`}>{c.roas.toFixed(1)}x</span>
                    ) : <span className="text-gray-500 text-sm">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drop-off Analysis */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-4">Drop-off Analysis</h3>
        <div className="space-y-3">
          {[
            { step: 'Homepage → Email Capture', exit: 76, insight: '67% of visitors drop off at the email capture step — consider testing a shorter form' },
            { step: 'Thank You → Upsell', exit: 63, insight: 'High drop-off after thank you page — offer a lower-price entry point' },
            { step: 'Upsell → Checkout', exit: 32, insight: 'Checkout abandonment is within normal range; try adding a guarantee badge' },
          ].map((d, i) => (
            <div key={i} className={`p-4 rounded-xl border ${d.exit > 60 ? 'border-red-800 bg-red-900/10' : 'border-amber-800 bg-amber-900/10'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 text-sm">{d.step}</span>
                <span className={`text-sm font-bold ${d.exit > 60 ? 'text-red-400' : 'text-amber-400'}`}>{d.exit}% exit</span>
              </div>
              <p className="text-gray-500 text-xs">AI insight: {d.insight}</p>
              <button onClick={() => setCreateAbTest(true)}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors underline">
                Fix This
              </button>
            </div>
          ))}
          {createAbTest && (
            <div className="p-3 bg-indigo-900/20 border border-indigo-700 rounded-xl text-indigo-300 text-xs">
              A/B test suggestion created: Shorter email capture form (3 fields vs 6 fields). View in the AB Testing dashboard.
            </div>
          )}
        </div>
      </div>

      {/* Traffic Sources */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-4">Traffic Sources</h3>
        <div className="space-y-3">
          {TRAFFIC_SOURCES.map(s => (
            <div key={s.name}>
              <div className="flex justify-between mb-1">
                <span className="text-gray-300 text-xs font-medium">{s.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs">{s.convRate}% conv</span>
                  <span className="text-white text-xs font-semibold">{s.pct}%</span>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div style={{ width: `${s.pct}%` }} className={`${s.color} h-2 rounded-full`} />
              </div>
            </div>
          ))}
          <p className="text-gray-500 text-xs pt-2">Best source: <span className="text-green-400 font-medium">Email (9.2% conv)</span> vs Organic (2.1% conv)</p>
        </div>
      </div>
    </div>
  )
}

// ─── Form Builder Tab ─────────────────────────────────────────────────────────

function FormBuilderTab() {
  const [formFields, setFormFields] = useState<FormField[]>([
    { id: '1', type: 'text', label: 'Full Name', placeholder: 'Enter your name', required: true },
    { id: '2', type: 'email', label: 'Email Address', placeholder: 'you@company.com', required: true },
    { id: '3', type: 'phone', label: 'Phone Number', placeholder: '+1 (555) 000-0000', required: false },
  ])
  const [selectedField, setSelectedField] = useState<string | null>('1')
  const [onSubmit, setOnSubmit] = useState<'message' | 'redirect' | 'webhook'>('message')
  const [doubleOptIn, setDoubleOptIn] = useState(false)
  const [gdprConsent, setGdprConsent] = useState(true)
  const [spamProtection, setSpamProtection] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  function addField(type: string) {
    const newField: FormField = {
      id: Date.now().toString(),
      type,
      label: AVAILABLE_FIELDS.find(f => f.type === type)?.label || type,
      placeholder: '',
      required: false,
    }
    setFormFields(prev => [...prev, newField])
    setSelectedField(newField.id)
  }

  function removeField(id: string) {
    setFormFields(prev => prev.filter(f => f.id !== id))
    setSelectedField(null)
  }

  function updateField(id: string, key: keyof FormField, val: string | boolean) {
    setFormFields(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f))
  }

  function loadTemplate(name: string) {
    setActiveTemplate(name)
    const t = FORM_TEMPLATES.find(f => f.name === name)
    if (!t) return
    setFormFields(t.fields.map((type, i) => ({
      id: (Date.now() + i).toString(),
      type: type === 'name' ? 'text' : type === 'message' ? 'textarea' : type === 'budget' ? 'dropdown' : type,
      label: type === 'name' ? 'Full Name' : type === 'email' ? 'Email' : type === 'phone' ? 'Phone' : type === 'company' ? 'Company' : type === 'message' ? 'Message' : type,
      placeholder: '',
      required: type === 'email' || type === 'name',
    })))
  }

  const selectedFieldData = formFields.find(f => f.id === selectedField)

  const embedCode = `<script src="https://app.ooumph.ai/embed.js"></script>
<div data-ooumph-form="demo-form-${Date.now().toString().slice(-4)}"></div>`

  return (
    <div className="space-y-6">
      {/* Templates */}
      <div>
        <p className="text-gray-400 text-xs mb-2 font-medium">Pre-built Templates</p>
        <div className="flex flex-wrap gap-2">
          {FORM_TEMPLATES.map(t => (
            <button key={t.name} onClick={() => loadTemplate(t.name)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${activeTemplate === t.name ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Available fields sidebar */}
        <div className="col-span-2">
          <p className="text-gray-500 text-xs mb-2 font-medium uppercase tracking-wide">Fields</p>
          <div className="space-y-1">
            {AVAILABLE_FIELDS.map(f => (
              <button key={f.type} onClick={() => addField(f.type)}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 text-xs rounded-lg transition-colors">
                <span className="w-5 h-5 flex items-center justify-center bg-gray-700 rounded text-[10px] font-mono">{f.icon}</span>
                <span className="truncate">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div className="col-span-7">
          <div className="bg-gray-900 border-2 border-dashed border-gray-700 rounded-xl p-4 min-h-[400px]">
            <p className="text-gray-600 text-xs mb-3 text-center">Form Preview — Click to edit fields</p>
            <div className="space-y-3">
              {formFields.map((field, i) => (
                <div key={field.id} onClick={() => setSelectedField(field.id)}
                  className={`relative p-3 rounded-lg border cursor-pointer transition-all ${selectedField === field.id ? 'border-indigo-500 bg-indigo-600/5' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-medium">{field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600 text-[10px]">{field.type}</span>
                      <button onClick={e => { e.stopPropagation(); removeField(field.id) }}
                        className="text-gray-600 hover:text-red-400 transition-colors text-xs leading-none">&times;</button>
                    </div>
                  </div>
                  {field.type !== 'divider' && field.type !== 'heading' && field.type !== 'checkbox' && field.type !== 'radio' && (
                    <div className={`w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-gray-400 text-xs ${field.type === 'textarea' ? 'h-12' : ''}`}>
                      {field.placeholder || `${field.label}...`}
                    </div>
                  )}
                  {field.type === 'divider' && <div className="w-full h-px bg-gray-600 my-1" />}
                  {field.type === 'heading' && <p className="text-white font-bold text-sm">Heading Text</p>}
                  {(field.type === 'checkbox' || field.type === 'radio') && (
                    <div className="flex items-center gap-2 text-gray-400 text-xs">
                      <span className="w-4 h-4 border border-gray-500 rounded" />
                      <span>Option 1</span>
                    </div>
                  )}
                  <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
                    {i > 0 && <button onClick={e => { e.stopPropagation(); const f = [...formFields]; [f[i-1],f[i]]=[f[i],f[i-1]]; setFormFields(f) }} className="text-gray-600 hover:text-gray-400 text-[10px]">▲</button>}
                    {i < formFields.length - 1 && <button onClick={e => { e.stopPropagation(); const f = [...formFields]; [f[i+1],f[i]]=[f[i],f[i+1]]; setFormFields(f) }} className="text-gray-600 hover:text-gray-400 text-[10px]">▼</button>}
                  </div>
                </div>
              ))}
              <button className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-lg mt-2">Submit</button>
            </div>
          </div>
        </div>

        {/* Field config */}
        <div className="col-span-3 space-y-4">
          {selectedFieldData ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-white text-xs font-medium">Field Config</p>
              <div>
                <label className="text-gray-500 text-[10px] block mb-1">Label</label>
                <input value={selectedFieldData.label} onChange={e => updateField(selectedFieldData.id, 'label', e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-500 text-[10px] block mb-1">Placeholder</label>
                <input value={selectedFieldData.placeholder} onChange={e => updateField(selectedFieldData.id, 'placeholder', e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-500 text-[10px] block mb-1">CSS Class</label>
                <input placeholder="form-field-custom"
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Required</span>
                <button onClick={() => updateField(selectedFieldData.id, 'required', !selectedFieldData.required)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${selectedFieldData.required ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${selectedFieldData.required ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-gray-500 text-[10px] block mb-1">Conditional Logic</label>
                <select className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs rounded focus:outline-none">
                  <option>Always show</option>
                  <option>Show if: Email filled</option>
                  <option>Hide if: Dropdown = Option A</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center text-gray-500 text-xs">
              Click a field to configure
            </div>
          )}

          {/* Form Settings */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-white text-xs font-medium">Form Settings</p>
            <div>
              <label className="text-gray-500 text-[10px] block mb-1">On Submit</label>
              <div className="space-y-1">
                {(['message', 'redirect', 'webhook'] as const).map(o => (
                  <label key={o} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={onSubmit === o} onChange={() => setOnSubmit(o)} className="accent-indigo-500" />
                    <span className="text-gray-400 text-xs capitalize">{o === 'message' ? 'Show thank you message' : o === 'redirect' ? 'Redirect to URL' : 'Fire webhook'}</span>
                  </label>
                ))}
              </div>
            </div>
            {[
              { label: 'Double Opt-in', val: doubleOptIn, set: setDoubleOptIn },
              { label: 'GDPR Consent', val: gdprConsent, set: setGdprConsent },
              { label: 'Spam Protection', val: spamProtection, set: setSpamProtection },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">{s.label}</span>
                <button onClick={() => s.set(!s.val)}
                  className={`w-9 h-4 rounded-full transition-colors relative ${s.val ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${s.val ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Preview</button>
            <button onClick={() => setShowEmbed(true)} className="flex-1 py-2 bg-indigo-600/20 border border-indigo-600 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">Embed Code</button>
          </div>
        </div>
      </div>

      {/* Saved Forms */}
      <div>
        <p className="text-white font-medium text-sm mb-3">Saved Forms</p>
        <div className="grid grid-cols-3 gap-4">
          {SAVED_FORMS.map(form => (
            <div key={form.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-white text-sm font-medium mb-2">{form.name}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <p className="text-white text-sm font-semibold">{form.submissions.toLocaleString()}</p>
                  <p className="text-gray-500 text-xs">Submissions</p>
                </div>
                <div>
                  <p className="text-green-400 text-sm font-semibold">{form.convRate}%</p>
                  <p className="text-gray-500 text-xs">Conv. Rate</p>
                </div>
              </div>
              <button className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">View Submissions</button>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Form Preview</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white transition-colors">&times;</button>
            </div>
            <div className="space-y-3">
              {formFields.filter(f => f.type !== 'divider' && f.type !== 'heading' && f.type !== 'hidden').map(f => (
                <div key={f.id}>
                  <label className="text-gray-300 text-xs block mb-1">{f.label}{f.required && <span className="text-red-400">*</span>}</label>
                  {f.type === 'textarea' ? (
                    <textarea rows={3} placeholder={f.placeholder} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg" />
                  ) : f.type === 'dropdown' ? (
                    <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-400 text-sm rounded-lg"><option>Select an option...</option></select>
                  ) : (
                    <input type={f.type} placeholder={f.placeholder} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg" />
                  )}
                </div>
              ))}
              {gdprConsent && <label className="flex items-start gap-2 text-gray-400 text-xs cursor-pointer"><input type="checkbox" className="mt-0.5 accent-indigo-500" /><span>I agree to receive marketing communications and accept the Privacy Policy.</span></label>}
              <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Embed Modal */}
      {showEmbed && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Embed Code</h3>
              <button onClick={() => setShowEmbed(false)} className="text-gray-500 hover:text-white transition-colors">&times;</button>
            </div>
            <p className="text-gray-400 text-xs mb-3">Paste this code on any webpage to display the form.</p>
            <pre className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-green-400 text-xs overflow-x-auto">
              {embedCode}
            </pre>
            <button onClick={() => navigator.clipboard.writeText(embedCode)}
              className="mt-3 w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors">
              Copy Code
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const [activeTab, setActiveTab] = useState<FunnelTab>('overview')

  const activeFunnels = MOCK_FUNNELS.filter(f => f.status === 'Active').length

  const tabs: { id: FunnelTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'builder', label: 'Funnel Builder' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'forms', label: 'Form Builder' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Funnel Intelligence</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">
              <span className="text-green-400 font-semibold">{activeFunnels}</span> active funnels
            </span>
          </div>
        </div>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          + Build New Funnel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'builder' && <FunnelBuilderTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'forms' && <FormBuilderTab />}
    </div>
  )
}
