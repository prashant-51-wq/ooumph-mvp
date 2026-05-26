'use client'

import { useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = 'campaigns' | 'creator' | 'analytics' | 'library'
type CreatorStep = 1 | 2 | 3 | 4 | 5

interface Campaign {
  id: string
  platform: string
  name: string
  status: 'Active' | 'Paused' | 'Learning' | 'Ended'
  budget: number
  spendToday: number
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  cpc: number
  roas: number
}

interface ApiCreds {
  googleDevToken: string
  googleCustomerId: string
  googleClientId: string
  googleClientSecret: string
  googleRefreshToken: string
  metaAppId: string
  metaAppSecret: string
  metaAccessToken: string
  metaAdAccountId: string
  linkedinClientId: string
  linkedinClientSecret: string
  linkedinAccessToken: string
  linkedinAccountId: string
  tiktokAppId: string
  tiktokSecret: string
  tiktokAccessToken: string
}

interface AdVariant {
  headline: string
  description: string
}

interface CreatorState {
  platforms: string[]
  adFormat: string
  ageMin: number
  ageMax: number
  gender: string
  location: string
  interests: string
  goal: string
  productDescription: string
  tone: string
  headlineVariants: AdVariant[]
  selectedHeadline: number
  selectedDescription: number
  imageGenerated: boolean
  imageApproved: boolean
  budget: number
  budgetType: 'daily' | 'total'
  startDate: string
  endDate: string
  bidStrategy: string
  previewDevice: 'mobile' | 'desktop'
  generating: boolean
  showLaunchModal: boolean
  launched: boolean
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: '1', platform: 'google', name: 'Brand Awareness - Q2 2026', status: 'Active', budget: 150, spendToday: 112.40, impressions: 48200, clicks: 1240, ctr: 2.57, conversions: 87, cpc: 0.91, roas: 4.2 },
  { id: '2', platform: 'meta', name: 'Lead Gen - SaaS Founders', status: 'Active', budget: 200, spendToday: 187.20, impressions: 62400, clicks: 1890, ctr: 3.03, conversions: 134, cpc: 1.40, roas: 5.1 },
  { id: '3', platform: 'meta', name: 'Retargeting - Website Visitors', status: 'Learning', budget: 80, spendToday: 43.10, impressions: 18900, clicks: 560, ctr: 2.96, conversions: 42, cpc: 0.77, roas: 3.8 },
  { id: '4', platform: 'linkedin', name: 'B2B Decision Makers', status: 'Active', budget: 300, spendToday: 241.80, impressions: 22100, clicks: 490, ctr: 2.22, conversions: 31, cpc: 4.93, roas: 2.9 },
  { id: '5', platform: 'google', name: 'Competitor Keywords', status: 'Paused', budget: 100, spendToday: 0, impressions: 31400, clicks: 870, ctr: 2.77, conversions: 56, cpc: 1.15, roas: 3.6 },
  { id: '6', platform: 'tiktok', name: 'Gen Z Awareness', status: 'Ended', budget: 120, spendToday: 0, impressions: 94000, clicks: 2100, ctr: 2.23, conversions: 78, cpc: 0.57, roas: 2.1 },
]

const PLATFORM_STATUS = [
  { id: 'google', label: 'Google Ads', status: 'connected', icon: 'G', color: 'text-blue-400' },
  { id: 'meta', label: 'Meta Ads', status: 'connected', icon: 'f', color: 'text-blue-500' },
  { id: 'linkedin', label: 'LinkedIn Ads', status: 'warning', icon: 'in', color: 'text-blue-300' },
  { id: 'tiktok', label: 'TikTok Ads', status: 'disconnected', icon: 'T', color: 'text-gray-400' },
  { id: 'twitter', label: 'Twitter Ads', status: 'disconnected', icon: 'X', color: 'text-gray-400' },
]

const MOCK_AD_LIBRARY = [
  { id: '1', name: 'SaaS Product Launch', platform: 'meta', score: 92, impressions: 124000, ctr: 3.8, status: 'top' },
  { id: '2', name: 'Free Trial Offer', platform: 'google', score: 88, impressions: 98000, ctr: 3.2, status: 'top' },
  { id: '3', name: 'Webinar Registration', platform: 'linkedin', score: 71, impressions: 45000, ctr: 2.1, status: 'ok' },
  { id: '4', name: 'Case Study Promo', platform: 'meta', score: 65, impressions: 38000, ctr: 1.9, status: 'ok' },
  { id: '5', name: 'Holiday Sale 2025', platform: 'google', score: 44, impressions: 22000, ctr: 1.2, status: 'low' },
  { id: '6', name: 'Competitor Comparison', platform: 'meta', score: 38, impressions: 18000, ctr: 0.9, status: 'low' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformIcon(p: string) {
  const icons: Record<string, string> = { google: 'G', meta: 'f', linkedin: 'in', tiktok: 'T', twitter: 'X' }
  return icons[p] || p[0].toUpperCase()
}

function platformColor(p: string) {
  const colors: Record<string, string> = {
    google: 'bg-red-500/20 text-red-400',
    meta: 'bg-blue-500/20 text-blue-400',
    linkedin: 'bg-blue-400/20 text-blue-300',
    tiktok: 'bg-pink-500/20 text-pink-400',
    twitter: 'bg-gray-500/20 text-gray-400',
  }
  return colors[p] || 'bg-gray-500/20 text-gray-400'
}

function statusStyle(s: string) {
  const map: Record<string, string> = {
    Active: 'bg-green-400/10 text-green-400',
    Paused: 'bg-amber-400/10 text-amber-400',
    Learning: 'bg-purple-400/10 text-purple-400',
    Ended: 'bg-gray-500/10 text-gray-500',
  }
  return map[s] || 'bg-gray-500/10 text-gray-500'
}

function fmtNum(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}

function fmtMoney(n: number) { return `$${n.toFixed(2)}` }

// ─── Masked Input ─────────────────────────────────────────────────────────────

function MaskedInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="text-gray-500 text-xs block mb-1">{label}</label>
      <div className="flex gap-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg focus:outline-none focus:border-indigo-500"
        />
        <button onClick={() => setShow(v => !v)} className="px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg text-xs transition-colors">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

function PlainInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-gray-500 text-xs block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg focus:outline-none focus:border-indigo-500"
      />
    </div>
  )
}

// ─── API Settings Slide-over ──────────────────────────────────────────────────

function ApiSettingsPanel({ open, onClose, creds, setCreds }: {
  open: boolean
  onClose: () => void
  creds: ApiCreds
  setCreds: (c: ApiCreds) => void
}) {
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({
    google: 'idle', meta: 'idle', linkedin: 'idle', tiktok: 'idle',
  })
  const [saved, setSaved] = useState(false)

  function set(key: keyof ApiCreds, val: string) {
    setCreds({ ...creds, [key]: val })
    setSaved(false)
  }

  async function testConnection(platform: string) {
    setTestStatus(s => ({ ...s, [platform]: 'testing' }))
    await new Promise(r => setTimeout(r, 1400))
    setTestStatus(s => ({ ...s, [platform]: Math.random() > 0.3 ? 'ok' : 'fail' }))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const statusRows = [
    { platform: 'Google Ads', status: testStatus.google === 'ok' ? 'Connected' : testStatus.google === 'fail' ? 'Error' : 'Not tested', synced: '2 min ago', spend: '$112.40' },
    { platform: 'Meta Ads', status: testStatus.meta === 'ok' ? 'Connected' : testStatus.meta === 'fail' ? 'Error' : 'Connected', synced: '5 min ago', spend: '$230.30' },
    { platform: 'LinkedIn Ads', status: 'Warning', synced: '1 hr ago', spend: '$241.80' },
    { platform: 'TikTok Ads', status: 'Not configured', synced: '—', spend: '$0.00' },
  ]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-96 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <h2 className="text-white font-semibold">API Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-6 flex-1">
          {/* Status table */}
          <div>
            <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Connection Status</p>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-500 px-3 py-2">Platform</th>
                    <th className="text-left text-gray-500 px-3 py-2">Status</th>
                    <th className="text-right text-gray-500 px-3 py-2">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.map(r => (
                    <tr key={r.platform} className="border-b border-gray-700/50 last:border-0">
                      <td className="px-3 py-2 text-gray-300">{r.platform}</td>
                      <td className="px-3 py-2">
                        <span className={`${r.status === 'Connected' ? 'text-green-400' : r.status === 'Warning' ? 'text-amber-400' : r.status === 'Error' ? 'text-red-400' : 'text-gray-500'}`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400">{r.spend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Google Ads */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-medium">Google Ads</p>
              <button onClick={() => testConnection('google')} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {testStatus.google === 'testing' ? 'Testing...' : testStatus.google === 'ok' ? '✓ OK' : testStatus.google === 'fail' ? '✗ Fail' : 'Test'}
              </button>
            </div>
            <MaskedInput label="Developer Token" value={creds.googleDevToken} onChange={v => set('googleDevToken', v)} />
            <PlainInput label="Customer ID" value={creds.googleCustomerId} onChange={v => set('googleCustomerId', v)} placeholder="123-456-7890" />
            <PlainInput label="Client ID" value={creds.googleClientId} onChange={v => set('googleClientId', v)} />
            <MaskedInput label="Client Secret" value={creds.googleClientSecret} onChange={v => set('googleClientSecret', v)} />
            <MaskedInput label="Refresh Token" value={creds.googleRefreshToken} onChange={v => set('googleRefreshToken', v)} />
          </div>

          {/* Meta Ads */}
          <div className="space-y-3 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-medium">Meta Ads</p>
              <button onClick={() => testConnection('meta')} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {testStatus.meta === 'testing' ? 'Testing...' : testStatus.meta === 'ok' ? '✓ OK' : testStatus.meta === 'fail' ? '✗ Fail' : 'Test'}
              </button>
            </div>
            <PlainInput label="App ID" value={creds.metaAppId} onChange={v => set('metaAppId', v)} placeholder="1234567890123456" />
            <MaskedInput label="App Secret" value={creds.metaAppSecret} onChange={v => set('metaAppSecret', v)} />
            <MaskedInput label="Access Token" value={creds.metaAccessToken} onChange={v => set('metaAccessToken', v)} />
            <PlainInput label="Ad Account ID" value={creds.metaAdAccountId} onChange={v => set('metaAdAccountId', v)} placeholder="act_1234567890" />
          </div>

          {/* LinkedIn Ads */}
          <div className="space-y-3 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-medium">LinkedIn Ads</p>
              <button onClick={() => testConnection('linkedin')} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {testStatus.linkedin === 'testing' ? 'Testing...' : testStatus.linkedin === 'ok' ? '✓ OK' : testStatus.linkedin === 'fail' ? '✗ Fail' : 'Test'}
              </button>
            </div>
            <PlainInput label="Client ID" value={creds.linkedinClientId} onChange={v => set('linkedinClientId', v)} />
            <MaskedInput label="Client Secret" value={creds.linkedinClientSecret} onChange={v => set('linkedinClientSecret', v)} />
            <MaskedInput label="Access Token" value={creds.linkedinAccessToken} onChange={v => set('linkedinAccessToken', v)} />
            <PlainInput label="Account ID" value={creds.linkedinAccountId} onChange={v => set('linkedinAccountId', v)} />
          </div>

          {/* TikTok Ads */}
          <div className="space-y-3 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-medium">TikTok Ads</p>
              <button onClick={() => testConnection('tiktok')} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {testStatus.tiktok === 'testing' ? 'Testing...' : testStatus.tiktok === 'ok' ? '✓ OK' : testStatus.tiktok === 'fail' ? '✗ Fail' : 'Test'}
              </button>
            </div>
            <PlainInput label="App ID" value={creds.tiktokAppId} onChange={v => set('tiktokAppId', v)} />
            <MaskedInput label="Secret" value={creds.tiktokSecret} onChange={v => set('tiktokSecret', v)} />
            <MaskedInput label="Access Token" value={creds.tiktokAccessToken} onChange={v => set('tiktokAccessToken', v)} />
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 sticky bottom-0 bg-gray-900">
          <button onClick={handleSave} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            {saved ? '✓ Saved!' : 'Save All Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaigns Tab ────────────────────────────────────────────────────────────

function CampaignsTab() {
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [campaigns, setCampaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS)

  const filtered = campaigns.filter(c =>
    (filterPlatform === 'all' || c.platform === filterPlatform) &&
    (filterStatus === 'all' || c.status === filterStatus)
  )

  function toggleCampaign(id: string) {
    setCampaigns(prev => prev.map(c => c.id === id
      ? { ...c, status: c.status === 'Active' ? 'Paused' : 'Active' }
      : c
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg focus:outline-none focus:border-indigo-500">
          <option value="all">All Platforms</option>
          <option value="google">Google Ads</option>
          <option value="meta">Meta Ads</option>
          <option value="linkedin">LinkedIn Ads</option>
          <option value="tiktok">TikTok Ads</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg focus:outline-none focus:border-indigo-500">
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="Learning">Learning</option>
          <option value="Ended">Ended</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setCampaigns(prev => prev.map(c => ({ ...c, status: 'Paused' })))}
            className="px-3 py-1.5 bg-amber-600/20 border border-amber-700 text-amber-400 text-xs rounded-lg hover:bg-amber-600/30 transition-colors">
            Pause All
          </button>
          <button onClick={() => setCampaigns(prev => prev.map(c => ({ ...c, status: 'Active' })))}
            className="px-3 py-1.5 bg-green-600/20 border border-green-700 text-green-400 text-xs rounded-lg hover:bg-green-600/30 transition-colors">
            Resume All
          </button>
          <button className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg hover:bg-gray-700 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Platform', 'Campaign', 'Status', 'Budget/Day', 'Spend', 'Impressions', 'Clicks', 'CTR', 'Conv.', 'CPC', 'ROAS', 'Actions'].map(h => (
                <th key={h} className="text-left text-xs text-gray-500 px-3 py-2 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${platformColor(c.platform)}`}>
                    {platformIcon(c.platform)}
                  </span>
                </td>
                <td className="px-3 py-3 text-white text-sm font-medium max-w-[180px] truncate">{c.name}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(c.status)}`}>{c.status}</span>
                </td>
                <td className="px-3 py-3 text-gray-300 text-sm">${c.budget}</td>
                <td className="px-3 py-3 text-gray-300 text-sm">{fmtMoney(c.spendToday)}</td>
                <td className="px-3 py-3 text-gray-300 text-sm">{fmtNum(c.impressions)}</td>
                <td className="px-3 py-3 text-gray-300 text-sm">{fmtNum(c.clicks)}</td>
                <td className="px-3 py-3 text-gray-300 text-sm">{c.ctr.toFixed(2)}%</td>
                <td className="px-3 py-3 text-gray-300 text-sm">{c.conversions}</td>
                <td className="px-3 py-3 text-gray-300 text-sm">${c.cpc.toFixed(2)}</td>
                <td className="px-3 py-3">
                  <span className={`text-sm font-semibold ${c.roas >= 4 ? 'text-green-400' : c.roas >= 2.5 ? 'text-amber-400' : 'text-red-400'}`}>
                    {c.roas.toFixed(1)}x
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-1">
                    <button className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors">Edit</button>
                    <button onClick={() => toggleCampaign(c.id)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${c.status === 'Active' ? 'bg-amber-900/40 hover:bg-amber-900/60 text-amber-400' : 'bg-green-900/40 hover:bg-green-900/60 text-green-400'}`}>
                      {c.status === 'Active' ? 'Pause' : 'Resume'}
                    </button>
                    <button className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors">Dup</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Ad Creator Tab ───────────────────────────────────────────────────────────

const PLATFORM_FORMATS: Record<string, string[]> = {
  'Google Search': ['Headline ×3 (30c)', 'Description ×2 (90c)'],
  'Google Display': ['Headline (30c)', 'Long Headline (90c)', 'Description (90c)'],
  'Meta Feed': ['Primary Text (125c)', 'Headline (40c)', 'CTA Button'],
  'Meta Stories': ['Primary Text (125c)', 'Overlay Text'],
  'Meta Reels': ['Primary Text (125c)', 'Audio-off Caption'],
  'LinkedIn Sponsored': ['Intro Text', 'Headline (70c)', 'Description (100c)'],
  'TikTok In-feed': ['Ad Text (100c)', 'CTA Button'],
}

const MOCK_VARIANTS = [
  { headline: 'Scale Your Marketing With AI — Free for 14 Days', description: 'Join 10,000+ founders using Ooumph to automate campaigns, generate ad copy, and hit revenue targets on autopilot.' },
  { headline: 'The AI Marketing Platform Built for Fast-Growing Teams', description: 'From strategy to execution in minutes. Let Ooumph handle campaigns, content, and analytics while you focus on growth.' },
  { headline: 'Stop Guessing. Start Growing. Try Ooumph Free Today', description: 'AI-powered ads, funnels, and lead gen — all in one dashboard. No agency fees. No learning curve. Just results.' },
]

function AdCreatorTab() {
  const [step, setStep] = useState<CreatorStep>(1)
  const [state, setState] = useState<CreatorState>({
    platforms: [],
    adFormat: '',
    ageMin: 25,
    ageMax: 55,
    gender: 'All',
    location: 'United States',
    interests: '',
    goal: 'Lead Gen',
    productDescription: '',
    tone: 'Professional',
    headlineVariants: MOCK_VARIANTS,
    selectedHeadline: 0,
    selectedDescription: 0,
    imageGenerated: false,
    imageApproved: false,
    budget: 50,
    budgetType: 'daily',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    bidStrategy: 'Target CPA',
    previewDevice: 'desktop',
    generating: false,
    showLaunchModal: false,
    launched: false,
  })

  function set<K extends keyof CreatorState>(key: K, val: CreatorState[K]) {
    setState(prev => ({ ...prev, [key]: val }))
  }

  function togglePlatform(p: string) {
    setState(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p],
    }))
  }

  async function generateVariants() {
    set('generating', true)
    await new Promise(r => setTimeout(r, 2200))
    set('generating', false)
    set('headlineVariants', MOCK_VARIANTS.map(v => ({ ...v })))
    setStep(4)
  }

  async function generateImage() {
    set('imageGenerated', false)
    await new Promise(r => setTimeout(r, 1800))
    set('imageGenerated', true)
  }

  const steps = [
    { n: 1, label: 'Platform & Format' },
    { n: 2, label: 'Audience' },
    { n: 3, label: 'AI Content' },
    { n: 4, label: 'Preview' },
    { n: 5, label: 'Launch' },
  ]

  const firstPlatform = state.platforms[0] || 'Meta Feed'
  const formats = PLATFORM_FORMATS[firstPlatform] || []

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <button onClick={() => setStep(s.n as CreatorStep)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${step === s.n ? 'bg-indigo-600 text-white' : step > s.n ? 'text-indigo-400 hover:text-indigo-300' : 'text-gray-500 hover:text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${step === s.n ? 'bg-white text-indigo-600 border-white' : step > s.n ? 'bg-indigo-600/30 border-indigo-500 text-indigo-400' : 'border-gray-600 text-gray-500'}`}>
                {step > s.n ? '✓' : s.n}
              </span>
              <span className="text-sm font-medium hidden sm:block">{s.label}</span>
            </button>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${step > s.n ? 'bg-indigo-600' : 'bg-gray-800'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
          <h3 className="text-white font-semibold">Choose Platform & Format</h3>
          <div>
            <p className="text-gray-400 text-xs mb-3">Select platforms (multi-select)</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PLATFORM_FORMATS).map(p => (
                <button key={p} onClick={() => togglePlatform(p)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${state.platforms.includes(p) ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {state.platforms.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-3">Ad fields for <span className="text-white">{firstPlatform}</span>:</p>
              <div className="space-y-2">
                {formats.map(f => (
                  <div key={f} className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-gray-300 text-sm">{f}</span>
                  </div>
                ))}
              </div>
              {state.adFormat === '' && (
                <div className="mt-3">
                  <label className="text-gray-400 text-xs block mb-2">Ad Format</label>
                  <select value={state.adFormat} onChange={e => set('adFormat', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                    <option value="">Select format...</option>
                    {formats.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setStep(2)} disabled={state.platforms.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            Continue to Audience &rarr;
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h3 className="text-white font-semibold">Target Audience</h3>
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="text-gray-400 text-xs block mb-2">Age Range: {state.ageMin}–{state.ageMax}</label>
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <p className="text-gray-500 text-xs mb-1">Min: {state.ageMin}</p>
                  <input type="range" min={18} max={65} value={state.ageMin} onChange={e => set('ageMin', parseInt(e.target.value))}
                    className="w-full accent-indigo-500" />
                </div>
                <div className="flex-1">
                  <p className="text-gray-500 text-xs mb-1">Max: {state.ageMax}</p>
                  <input type="range" min={18} max={65} value={state.ageMax} onChange={e => set('ageMax', parseInt(e.target.value))}
                    className="w-full accent-indigo-500" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Gender</label>
              <select value={state.gender} onChange={e => set('gender', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                <option>All</option>
                <option>Male</option>
                <option>Female</option>
                <option>Non-binary</option>
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Location</label>
              <input type="text" value={state.location} onChange={e => set('location', e.target.value)}
                placeholder="United States, UK, Global..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="col-span-2">
              <label className="text-gray-400 text-xs block mb-1">Interests / Keywords</label>
              <textarea value={state.interests} onChange={e => set('interests', e.target.value)}
                rows={3} placeholder="SaaS, marketing automation, digital marketing, entrepreneurship..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Custom Audience</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                <option value="">Import from CRM Segment...</option>
                <option>Hot Leads - Q2 2026</option>
                <option>Trial Users (Non-converted)</option>
                <option>Email List - 30d active</option>
                <option>Website Visitors 60d</option>
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Lookalike Based On</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                <option value="">Select segment...</option>
                <option>Paying Customers</option>
                <option>High-value Leads</option>
                <option>Trial Converts</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">&larr; Back</button>
            <button onClick={() => setStep(3)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">Continue to AI Content &rarr;</button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h3 className="text-white font-semibold">AI Content Generation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Campaign Goal</label>
              <select value={state.goal} onChange={e => set('goal', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500">
                <option>Brand Awareness</option>
                <option>Lead Gen</option>
                <option>Traffic</option>
                <option>Sales</option>
                <option>App Installs</option>
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {['Professional', 'Conversational', 'Urgent', 'Playful', 'Authoritative'].map(t => (
                  <button key={t} onClick={() => set('tone', t)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${state.tone === t ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-gray-400 text-xs block mb-1">Product / Service Description</label>
              <textarea value={state.productDescription} onChange={e => set('productDescription', e.target.value)}
                rows={3} placeholder="Describe your product or service, key benefits, and what makes it unique..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
          </div>

          <button onClick={generateVariants} disabled={state.generating}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            {state.generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating 3 Variants...
              </>
            ) : (
              '🤖 Generate Ad Variants'
            )}
          </button>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">&larr; Back</button>
          </div>
        </div>
      )}

      {/* Step 4 — Preview */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Ad Variants</h3>
              <div className="flex gap-1 p-1 bg-gray-800 rounded-lg">
                <button onClick={() => set('previewDevice', 'desktop')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${state.previewDevice === 'desktop' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Desktop
                </button>
                <button onClick={() => set('previewDevice', 'mobile')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${state.previewDevice === 'mobile' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Mobile
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {state.headlineVariants.map((v, i) => (
                <div key={i} onClick={() => set('selectedHeadline', i)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${state.selectedHeadline === i ? 'border-indigo-500 bg-indigo-600/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Variant {i + 1}</span>
                    {state.selectedHeadline === i && <span className="text-xs text-indigo-400">Selected</span>}
                  </div>
                  <textarea value={v.headline} onChange={e => {
                    const updated = [...state.headlineVariants]
                    updated[i] = { ...updated[i], headline: e.target.value }
                    set('headlineVariants', updated)
                  }} rows={2}
                    className="w-full bg-transparent text-white text-sm font-semibold resize-none focus:outline-none mb-2" />
                  <textarea value={v.description} onChange={e => {
                    const updated = [...state.headlineVariants]
                    updated[i] = { ...updated[i], description: e.target.value }
                    set('headlineVariants', updated)
                  }} rows={3}
                    className="w-full bg-transparent text-gray-400 text-xs resize-none focus:outline-none" />
                  <button className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Refresh</button>
                </div>
              ))}
            </div>

            <button className="px-4 py-2 bg-purple-600/20 border border-purple-600 text-purple-400 text-xs font-medium rounded-lg hover:bg-purple-600/30 transition-colors mb-4">
              Combine Best
            </button>

            {/* Image Section */}
            <div className="border-t border-gray-800 pt-4">
              <p className="text-gray-400 text-sm font-medium mb-3">Ad Image</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-gray-600 transition-colors cursor-pointer">
                  <p className="text-gray-500 text-sm mb-1">Drop image here</p>
                  <p className="text-gray-600 text-xs">or click to upload</p>
                </div>
                <div className="space-y-2">
                  <button onClick={generateImage}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors">
                    Generate Ad Image with AI
                  </button>
                  {state.imageGenerated && (
                    <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                      <div className="w-full h-24 bg-gradient-to-br from-indigo-600/40 to-purple-600/40 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400 text-xs">Generated Image Preview</span>
                      </div>
                      <div className="flex items-center gap-1 text-green-400 text-xs">
                        <span>✓</span>
                        <span>1200×628 — Facebook recommended</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => set('imageApproved', true)}
                          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${state.imageApproved ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                          {state.imageApproved ? '✓ Approved' : 'Approve'}
                        </button>
                        <button onClick={generateImage} className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors">Regenerate</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Preview card */}
            <div className="border-t border-gray-800 pt-4 mt-4">
              <p className="text-gray-400 text-xs mb-3 font-medium">Live Preview — {state.platforms[0] || 'Meta Feed'} {state.previewDevice}</p>
              <div className={`border border-gray-700 rounded-xl bg-white p-4 ${state.previewDevice === 'mobile' ? 'max-w-[320px]' : 'max-w-full'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">O</div>
                  <div>
                    <p className="text-gray-900 text-xs font-semibold">Ooumph</p>
                    <p className="text-gray-500 text-[10px]">Sponsored</p>
                  </div>
                </div>
                <div className="w-full h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg mb-3 flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">{state.imageGenerated && state.imageApproved ? 'AI Generated Image' : 'Ad Creative'}</span>
                </div>
                <p className="text-gray-900 text-sm font-bold mb-1 leading-tight">
                  {state.headlineVariants[state.selectedHeadline]?.headline || 'Your Ad Headline Here'}
                </p>
                <p className="text-gray-600 text-xs mb-3 line-clamp-2">
                  {state.headlineVariants[state.selectedHeadline]?.description || 'Your ad description will appear here.'}
                </p>
                <button className="w-full py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg">Learn More</button>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">&larr; Back</button>
            <button onClick={() => setStep(5)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">Continue to Launch &rarr;</button>
          </div>
        </div>
      )}

      {/* Step 5 — Launch */}
      {step === 5 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h3 className="text-white font-semibold">Launch Campaign</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Budget Type</label>
              <div className="flex gap-2">
                {(['daily', 'total'] as const).map(t => (
                  <button key={t} onClick={() => set('budgetType', t)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all capitalize ${state.budgetType === t ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Budget (USD)</label>
              <input type="number" value={state.budget} onChange={e => set('budget', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Start Date</label>
              <input type="date" value={state.startDate} onChange={e => set('startDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">End Date</label>
              <input type="date" value={state.endDate} onChange={e => set('endDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="col-span-2">
              <label className="text-gray-400 text-xs block mb-1">Bid Strategy</label>
              <div className="grid grid-cols-4 gap-2">
                {['Manual CPC', 'Target CPA', 'Maximize Clicks', 'Target ROAS'].map(s => (
                  <button key={s} onClick={() => set('bidStrategy', s)}
                    className={`py-2 rounded-lg border text-xs font-medium transition-all ${state.bidStrategy === s ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(4)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">&larr; Back</button>
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors">Save as Draft</button>
            <button onClick={() => set('showLaunchModal', true)}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors">
              Launch Campaign
            </button>
          </div>

          {state.showLaunchModal && !state.launched && (
            <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                <h3 className="text-white font-semibold text-lg mb-2">Launch Campaign?</h3>
                <p className="text-gray-400 text-sm mb-4">
                  You are about to launch on {state.platforms.join(', ')} with a ${state.budget}/{state.budgetType} budget.
                  This will immediately begin delivering ads.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => set('showLaunchModal', false)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">Cancel</button>
                  <button onClick={() => { set('launched', true); set('showLaunchModal', false) }}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors">
                    Confirm Launch
                  </button>
                </div>
              </div>
            </div>
          )}
          {state.launched && (
            <div className="p-4 bg-green-900/20 border border-green-700 rounded-xl text-green-400 text-sm flex items-center gap-2">
              <span>✓</span>
              Campaign launched successfully! Ads are now in review on {state.platforms.join(', ')}.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [pauseThreshold, setPauseThreshold] = useState(1.5)
  const [paused, setPaused] = useState(false)

  const platformStats = [
    { platform: 'Google Ads', spend: 1240.80, impressions: 198000, ctr: 2.57, roas: 4.2, color: 'text-red-400' },
    { platform: 'Meta Ads', spend: 3820.40, impressions: 482000, ctr: 3.03, roas: 5.1, color: 'text-blue-400' },
    { platform: 'LinkedIn Ads', spend: 2180.20, impressions: 89000, ctr: 2.22, roas: 2.9, color: 'text-blue-300' },
    { platform: 'TikTok Ads', spend: 580.00, impressions: 94000, ctr: 2.23, roas: 2.1, color: 'text-pink-400' },
  ]

  const roasData = [3.1, 3.4, 2.9, 4.0, 3.8, 4.2, 3.7, 4.5, 4.1, 3.9, 4.8, 5.1, 4.9, 5.2, 4.7, 5.4, 5.0, 4.6, 5.3, 4.8, 5.5, 5.8, 5.2, 5.6, 6.0, 5.7, 5.4, 5.9, 6.1, 5.8]
  const maxRoas = Math.max(...roasData)

  const topAds = [
    { name: 'SaaS Founders - Lead Gen v3', platform: 'meta', ctr: 4.2, conv: 89, spend: 890, score: 94 },
    { name: 'Free Trial - Google Search', platform: 'google', ctr: 3.8, conv: 76, spend: 720, score: 91 },
    { name: 'Decision Makers - LinkedIn', platform: 'linkedin', ctr: 2.9, conv: 34, spend: 1240, score: 78 },
    { name: 'Gen Z Awareness TikTok', platform: 'tiktok', ctr: 1.2, conv: 12, spend: 340, score: 41 },
    { name: 'Competitor Keywords', platform: 'google', ctr: 0.9, conv: 8, spend: 290, score: 32 },
  ]

  return (
    <div className="space-y-6">
      {/* Platform comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {platformStats.map(p => (
          <div key={p.platform} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className={`text-xs font-medium mb-3 ${p.color}`}>{p.platform}</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Spend</span>
                <span className="text-white text-xs font-medium">${p.spend.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Impressions</span>
                <span className="text-white text-xs font-medium">{fmtNum(p.impressions)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">CTR</span>
                <span className="text-white text-xs font-medium">{p.ctr.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">ROAS</span>
                <span className={`text-xs font-semibold ${p.roas >= 4 ? 'text-green-400' : p.roas >= 2.5 ? 'text-amber-400' : 'text-red-400'}`}>{p.roas.toFixed(1)}x</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ROAS Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-white font-medium text-sm mb-4">ROAS — Last 30 Days</p>
        <div className="flex items-end gap-1 h-28">
          {roasData.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                style={{ height: `${(v / maxRoas) * 100}%` }}
                className="w-full bg-indigo-600 rounded-sm group-hover:bg-indigo-500 transition-colors min-h-[4px]"
              />
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {v.toFixed(1)}x
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-gray-600 text-xs mt-2">
          <span>Day 1</span>
          <span>Day 15</span>
          <span>Day 30</span>
        </div>
      </div>

      {/* Top/worst performing ads */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-medium text-sm">Ad Performance Breakdown</p>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">Pause CTR &lt;</span>
            <input type="number" step={0.1} value={pauseThreshold} onChange={e => setPauseThreshold(parseFloat(e.target.value))}
              className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 text-white text-xs rounded focus:outline-none" />
            <span className="text-gray-500 text-xs">%</span>
            <button onClick={() => setPaused(true)}
              className="px-3 py-1 bg-amber-600/20 border border-amber-700 text-amber-400 text-xs rounded-lg hover:bg-amber-600/30 transition-colors">
              {paused ? '✓ Paused' : 'Pause Underperformers'}
            </button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Ad', 'Platform', 'CTR', 'Conv.', 'Spend', 'Score'].map(h => (
                <th key={h} className="text-left text-xs text-gray-500 px-2 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topAds.map((ad, i) => (
              <tr key={i} className={`border-b border-gray-800/50 ${paused && ad.ctr < pauseThreshold ? 'opacity-40' : ''}`}>
                <td className="px-2 py-3 text-white text-xs max-w-[180px] truncate">{ad.name}</td>
                <td className="px-2 py-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${platformColor(ad.platform)}`}>{platformIcon(ad.platform)}</span>
                </td>
                <td className="px-2 py-3 text-sm font-medium">{ad.ctr.toFixed(1)}%</td>
                <td className="px-2 py-3 text-gray-300 text-sm">{ad.conv}</td>
                <td className="px-2 py-3 text-gray-300 text-sm">${ad.spend}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div style={{ width: `${ad.score}%` }} className={`h-full rounded-full ${ad.score >= 80 ? 'bg-green-500' : ad.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} />
                    </div>
                    <span className={`text-xs font-semibold ${ad.score >= 80 ? 'text-green-400' : ad.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{ad.score}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Ad Library Tab ───────────────────────────────────────────────────────────

function AdLibraryTab() {
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterPerf, setFilterPerf] = useState('all')
  const [items, setItems] = useState(MOCK_AD_LIBRARY)

  const filtered = items.filter(a =>
    (filterPlatform === 'all' || a.platform === filterPlatform) &&
    (filterPerf === 'all' || a.status === filterPerf)
  )

  function archive(id: string) {
    setItems(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg focus:outline-none focus:border-indigo-500">
          <option value="all">All Platforms</option>
          <option value="google">Google</option>
          <option value="meta">Meta</option>
          <option value="linkedin">LinkedIn</option>
          <option value="tiktok">TikTok</option>
        </select>
        <select value={filterPerf} onChange={e => setFilterPerf(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg focus:outline-none focus:border-indigo-500">
          <option value="all">All Performance</option>
          <option value="top">Top Performers</option>
          <option value="ok">Average</option>
          <option value="low">Underperforming</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(ad => (
          <div key={ad.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
            <div className={`h-24 flex items-center justify-center text-2xl font-bold ${platformColor(ad.platform)}`}>
              {platformIcon(ad.platform)}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-white text-sm font-medium leading-tight">{ad.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 shrink-0 ${ad.status === 'top' ? 'bg-green-400/10 text-green-400' : ad.status === 'ok' ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                  {ad.status === 'top' ? 'Top' : ad.status === 'ok' ? 'Avg' : 'Low'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-white text-xs font-semibold">{fmtNum(ad.impressions)}</p>
                  <p className="text-gray-500 text-[10px]">Impressions</p>
                </div>
                <div className="text-center">
                  <p className="text-white text-xs font-semibold">{ad.ctr.toFixed(1)}%</p>
                  <p className="text-gray-500 text-[10px]">CTR</p>
                </div>
                <div className="text-center">
                  <p className={`text-xs font-semibold ${ad.score >= 80 ? 'text-green-400' : ad.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{ad.score}</p>
                  <p className="text-gray-500 text-[10px]">Score</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 bg-indigo-600/20 border border-indigo-600 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">Duplicate</button>
                <button onClick={() => archive(ad.id)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">Archive</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('campaigns')
  const [showApiSettings, setShowApiSettings] = useState(false)
  const [creds, setCreds] = useState<ApiCreds>({
    googleDevToken: '', googleCustomerId: '', googleClientId: '', googleClientSecret: '', googleRefreshToken: '',
    metaAppId: '', metaAppSecret: '', metaAccessToken: '', metaAdAccountId: '',
    linkedinClientId: '', linkedinClientSecret: '', linkedinAccessToken: '', linkedinAccountId: '',
    tiktokAppId: '', tiktokSecret: '', tiktokAccessToken: '',
  })

  const totalSpendToday = MOCK_CAMPAIGNS.reduce((s, c) => s + c.spendToday, 0)
  const totalSpendMonth = 28420.60
  const totalImpressions = MOCK_CAMPAIGNS.reduce((s, c) => s + c.impressions, 0)
  const avgCtr = (MOCK_CAMPAIGNS.reduce((s, c) => s + c.ctr, 0) / MOCK_CAMPAIGNS.length)
  const totalConversions = MOCK_CAMPAIGNS.reduce((s, c) => s + c.conversions, 0)
  const avgRoas = MOCK_CAMPAIGNS.filter(c => c.roas > 0).reduce((s, c, _, arr) => s + c.roas / arr.length, 0)

  const tabs: { id: MainTab; label: string }[] = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'creator', label: 'Ad Creator' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'library', label: 'Ad Library' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Paid Ads</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {PLATFORM_STATUS.map(p => (
              <span key={p.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${p.status === 'connected' ? 'border-green-800 bg-green-900/20 text-green-400' : p.status === 'warning' ? 'border-amber-800 bg-amber-900/20 text-amber-400' : 'border-gray-700 bg-gray-800 text-gray-500'}`}>
                <span className={`text-xs font-bold ${p.color}`}>{p.icon}</span>
                <span>{p.label}</span>
                <span>{p.status === 'connected' ? '✅' : p.status === 'warning' ? '⚠' : '❌'}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg">
            Today: <span className="text-white font-semibold">${totalSpendToday.toFixed(2)}</span>
          </span>
          <button onClick={() => setShowApiSettings(true)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
            API Settings
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            + New Ad
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Spend Today', value: `$${totalSpendToday.toFixed(0)}` },
          { label: 'Spend Month', value: `$${fmtNum(totalSpendMonth)}` },
          { label: 'Impressions', value: fmtNum(totalImpressions) },
          { label: 'Avg CTR', value: `${avgCtr.toFixed(2)}%` },
          { label: 'Conversions', value: totalConversions.toString() },
          { label: 'Avg ROAS', value: `${avgRoas.toFixed(1)}x` },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-white text-lg font-bold">{s.value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${mainTab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {mainTab === 'campaigns' && <CampaignsTab />}
      {mainTab === 'creator' && <AdCreatorTab />}
      {mainTab === 'analytics' && <AnalyticsTab />}
      {mainTab === 'library' && <AdLibraryTab />}

      {/* API Settings Slide-over */}
      <ApiSettingsPanel open={showApiSettings} onClose={() => setShowApiSettings(false)} creds={creds} setCreds={setCreds} />
    </div>
  )
}
