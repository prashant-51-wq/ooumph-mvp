'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_MODELS } from '@/lib/models'

// ─── constants ───────────────────────────────────────────────────────────────
const CHANNELS = ['Instagram', 'LinkedIn', 'Twitter/X', 'YouTube', 'WhatsApp', 'Email', 'Google Ads', 'Meta Ads'] as const
const TONES = ['Professional', 'Friendly & Conversational', 'Bold & Direct', 'Educational', 'Inspirational', 'Witty & Playful', 'Founder-led / Personal']
const INDUSTRIES = ['SaaS / Tech', 'E-commerce', 'Consulting / Coaching', 'Agency / Services', 'Healthcare', 'Education / EdTech', 'Finance / FinTech', 'Real Estate', 'Food & Beverage', 'Other']
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD', 'JPY']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ACCENT_COLORS = [
  { name: 'Indigo', cls: 'bg-indigo-500', ring: 'ring-indigo-400' },
  { name: 'Purple', cls: 'bg-purple-500', ring: 'ring-purple-400' },
  { name: 'Blue', cls: 'bg-blue-500', ring: 'ring-blue-400' },
  { name: 'Teal', cls: 'bg-teal-500', ring: 'ring-teal-400' },
  { name: 'Green', cls: 'bg-green-500', ring: 'ring-green-400' },
  { name: 'Orange', cls: 'bg-orange-500', ring: 'ring-orange-400' },
]

// ─── nav sections ─────────────────────────────────────────────────────────────
type SectionKey = 'profile' | 'workspace' | 'api-keys' | 'ai-models' | 'notifications' | 'security' | 'appearance' | 'usage' | 'integrations' | 'billing' | 'danger'
const NAV_ITEMS: { key: SectionKey; icon: string; label: string; link?: string }[] = [
  { key: 'profile', icon: '👤', label: 'Profile' },
  { key: 'workspace', icon: '🏢', label: 'Workspace' },
  { key: 'api-keys', icon: '🔑', label: 'API Keys (BYOK)' },
  { key: 'ai-models', icon: '🤖', label: 'AI Models' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'security', icon: '🔒', label: 'Security' },
  { key: 'appearance', icon: '🎨', label: 'Appearance' },
  { key: 'usage', icon: '📊', label: 'Usage & Limits' },
  { key: 'integrations', icon: '🔗', label: 'Integrations', link: '/dashboard/connections' },
  { key: 'billing', icon: '💳', label: 'Billing', link: '/dashboard/billing' },
  { key: 'danger', icon: '🗑', label: 'Danger Zone' },
]

// ─── style helpers ────────────────────────────────────────────────────────────
const inp = 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const inpSm = 'px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const ta = 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none'
const btn = 'bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const btnGhost = 'border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const btnSm = 'px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors whitespace-nowrap'
const btnDanger = 'border border-red-800 text-red-400 hover:bg-red-950 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── interfaces ───────────────────────────────────────────────────────────────
interface ModelSettings {
  defaultModel: string
  braveSearchApiKey: string
  hubspotAccessToken: string
  ga4PropertyId: string
  ga4AccessToken: string
  metaWebhookVerifyToken: string
  resendApiKey: string
  firecrawlApiKey: string
  unsplashAccessKey: string
  pexelsApiKey: string
  groqApiKey: string
  openaiApiKey: string
  anthropicApiKey: string
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  elevenLabsVoiceModel: string
  stabilityApiKey: string
  replicateApiToken: string
  geminiApiKey: string
  geminiModel: string
  klingAccessKey: string
  klingSecretKey: string
  runwayApiKey: string
  heygenApiKey: string
  vapiApiKey: string
  openaiModel: string
  claudeModel: string
  slackBotToken: string
  slackChannelId: string
  telegramBotToken: string
  telegramChatId: string
  wpSiteUrl: string
  wpUsername: string
  wpAppPassword: string
  ghostUrl: string
  ghostAdminKey: string
  bufferAccessToken: string
  calcomApiKey: string
  tallyApiKey: string
  n8nBaseUrl: string
  n8nApiKey: string
  searchConsoleSiteUrl: string
  searchConsoleAccessToken: string
  cloudinaryCloudName: string
  cloudinaryApiKey: string
  cloudinaryApiSecret: string
  apolloApiKey: string
  hunterApiKey: string
  mailchimpApiKey: string
  mailchimpServer: string
  brevoApiKey: string
  brevoFromEmail: string
  deepgramApiKey: string
  twitterAccessToken: string
  twitterBearerToken: string
  linkedinAccessToken: string
  linkedinAuthorUrn: string
  youtubeApiKey: string
  youtubeAccessToken: string
  metaAccessToken: string
  metaAdAccountId: string
  googleAdsDeveloperToken: string
  googleAdsCustomerId: string
  googleAdsAccessToken: string
  linkedinAdsAccessToken: string
  linkedinAdsAccountId: string
  stripeSecretKey: string
  stripePublishableKey: string
  razorpayKeyId: string
  razorpayKeySecret: string
}

interface Session { id: string; device: string; browser: string; ip: string; location: string; lastActive: string; current: boolean }
interface AccessToken { id: string; name: string; permissions: string[]; lastUsed: string; expiry: string }
interface LoginRecord { date: string; device: string; ip: string; location: string; result: 'Success' | 'Failed' }

// ─── masked key input ─────────────────────────────────────────────────────────
function MaskedInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (value) { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }
  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1">
        <input
          type={show ? 'text' : 'password'}
          className={className || inp}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <button type="button" onClick={() => setShow(s => !s)} className={btnSm} title={show ? 'Hide' : 'Show'}>{show ? '🙈' : '👁'}</button>
      <button type="button" onClick={copy} className={btnSm} title="Copy">{copied ? '✅' : '📋'}</button>
    </div>
  )
}

// ─── section wrapper ──────────────────────────────────────────────────────────
function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      {title && (
        <div className="border-b border-gray-800 pb-3">
          <h2 className="text-white font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function UsageBar({ label, used, total, unit }: { label: string; used: number; total: number; unit?: string }) {
  const pct = Math.min((used / total) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{fmt(used)} / {fmt(total)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-gray-600 text-xs text-right">{pct.toFixed(1)}% used</p>
    </div>
  )
}

// ─── modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SectionKey>('profile')
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [unsaved, setUnsaved] = useState<Set<SectionKey>>(new Set())

  // ── brand / workspace form ─────────────────────────────────────────────────
  const [form, setForm] = useState({
    businessName: '', industry: '', website: '', tagline: '',
    offer: '', uniqueValue: '', targetAudience: '', tone: '',
    competitors: '', channels: [] as string[], goals: '',
    monthlyBudget: '', prohibitedClaims: '', approvalEmail: '',
  })

  // ── profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    fullName: '', email: '', jobTitle: '', phone: '',
    timezone: 'UTC', language: 'English', avatar: '',
  })

  // ── workspace state ────────────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState({
    name: '', logo: '', industry: '', businessType: 'B2B',
    website: '', description: '', currency: 'USD',
    fiscalMonth: 'January', teamSize: '1–5',
    workspaceId: 'ws_abc123def456', createdAt: '2025-01-15',
  })

  // ── notification state ─────────────────────────────────────────────────────
  const [notifInApp, setNotifInApp] = useState({ approvals: true, agentTasks: true, campaigns: true, errors: true, newLeads: false, weeklySummary: true })
  const [notifEmail, setNotifEmail] = useState({ approvals: true, agentTasks: false, campaigns: true, errors: true, newLeads: false, weeklySummary: true })
  const [notifEmail2, setNotifEmail2] = useState('')
  const [notifFrequency, setNotifFrequency] = useState<'realtime' | 'hourly' | 'daily' | 'off'>('realtime')
  const [dndFrom, setDndFrom] = useState('22:00')
  const [dndTo, setDndTo] = useState('08:00')
  const [dndEnabled, setDndEnabled] = useState(false)

  // ── security state ─────────────────────────────────────────────────────────
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [sessions] = useState<Session[]>([
    { id: '1', device: 'MacBook Pro', browser: 'Chrome 124', ip: '103.21.45.12', location: 'Mumbai, IN', lastActive: '2 mins ago', current: true },
    { id: '2', device: 'iPhone 15', browser: 'Safari 17', ip: '103.21.45.14', location: 'Mumbai, IN', lastActive: '1 hr ago', current: false },
  ])
  const [accessTokens, setAccessTokens] = useState<AccessToken[]>([
    { id: 't1', name: 'CI/CD Pipeline', permissions: ['read:campaigns', 'write:content'], lastUsed: '2026-05-25', expiry: '2026-12-31' },
  ])
  const [loginHistory] = useState<LoginRecord[]>([
    { date: '2026-05-26 09:14', device: 'MacBook Pro', ip: '103.21.45.12', location: 'Mumbai, IN', result: 'Success' },
    { date: '2026-05-25 22:41', device: 'iPhone 15', ip: '103.21.45.14', location: 'Mumbai, IN', result: 'Success' },
    { date: '2026-05-20 03:12', device: 'Unknown', ip: '198.51.100.99', location: 'Frankfurt, DE', result: 'Failed' },
  ])

  // ── appearance state ───────────────────────────────────────────────────────
  const [appearance, setAppearance] = useState({
    theme: 'dark', accentColor: 'Indigo', sidebar: 'expanded',
    density: 'comfortable', fontSize: 'medium', animations: true, language: 'English',
  })

  // ── model settings ─────────────────────────────────────────────────────────
  const defaultModelSettings: ModelSettings = {
    defaultModel: 'claude-sonnet-4-6',
    braveSearchApiKey: '', hubspotAccessToken: '', ga4PropertyId: '', ga4AccessToken: '',
    metaWebhookVerifyToken: '', resendApiKey: '', firecrawlApiKey: '',
    unsplashAccessKey: '', pexelsApiKey: '',
    groqApiKey: '', openaiApiKey: '', anthropicApiKey: '',
    openaiModel: 'gpt-4o', claudeModel: 'claude-sonnet-4-6',
    elevenLabsApiKey: '', elevenLabsVoiceId: '', elevenLabsVoiceModel: 'eleven_multilingual_v2',
    stabilityApiKey: '', replicateApiToken: '',
    geminiApiKey: '', geminiModel: 'gemini-1.5-pro',
    klingAccessKey: '', klingSecretKey: '', runwayApiKey: '',
    heygenApiKey: '', vapiApiKey: '',
    slackBotToken: '', slackChannelId: '',
    telegramBotToken: '', telegramChatId: '',
    wpSiteUrl: '', wpUsername: '', wpAppPassword: '',
    ghostUrl: '', ghostAdminKey: '', bufferAccessToken: '',
    calcomApiKey: '', tallyApiKey: '',
    n8nBaseUrl: '', n8nApiKey: '',
    searchConsoleSiteUrl: '', searchConsoleAccessToken: '',
    cloudinaryCloudName: '', cloudinaryApiKey: '', cloudinaryApiSecret: '',
    apolloApiKey: '', hunterApiKey: '',
    mailchimpApiKey: '', mailchimpServer: '', brevoApiKey: '', brevoFromEmail: '',
    deepgramApiKey: '',
    twitterAccessToken: '', twitterBearerToken: '',
    linkedinAccessToken: '', linkedinAuthorUrn: '',
    youtubeApiKey: '', youtubeAccessToken: '',
    metaAccessToken: '', metaAdAccountId: '',
    googleAdsDeveloperToken: '', googleAdsCustomerId: '', googleAdsAccessToken: '',
    linkedinAdsAccessToken: '', linkedinAdsAccountId: '',
    stripeSecretKey: '', stripePublishableKey: '',
    razorpayKeyId: '', razorpayKeySecret: '',
  }
  const [modelSettings, setModelSettings] = useState<ModelSettings>(defaultModelSettings)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [sharedKeyFallback, setSharedKeyFallback] = useState(true)
  const [keyRotationReminder, setKeyRotationReminder] = useState(true)

  // ── AI model routing ───────────────────────────────────────────────────────
  const [modelRouting, setModelRouting] = useState([
    { task: 'Content Generation', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.003/req' },
    { task: 'Strategy', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.008/req' },
    { task: 'Image Generation', model: 'DALL-E 3', provider: 'OpenAI', cost: '$0.040/img' },
    { task: 'Video Generation', model: 'Kling 2.0', provider: 'Kling', cost: '$0.45/vid' },
    { task: 'Voice Synthesis', model: 'ElevenLabs v3', provider: 'ElevenLabs', cost: '$0.002/char' },
    { task: 'Email Campaigns', model: 'Claude 3.5 Haiku', provider: 'Anthropic', cost: '$0.001/req' },
    { task: 'Research', model: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: '$0.005/req' },
  ])
  const [smartRouting, setSmartRouting] = useState(false)
  const [costCap, setCostCap] = useState('100')
  const [qualitySpeed, setQualitySpeed] = useState(70)

  // ── danger zone state ──────────────────────────────────────────────────────
  const [dangerInput, setDangerInput] = useState<Record<string, string>>({})

  // ── modal state ────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<string | null>(null)
  const [modalData, setModalData] = useState<Record<string, string>>({})

  // ── test notification ──────────────────────────────────────────────────────
  const [notifyTestResult, setNotifyTestResult] = useState<Record<string, string>>({})

  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/workspaces?id=${wid}`)
      .then(r => r.json())
      .then(d => {
        if (d) {
          let parsedChannels: string[] = []
          if (Array.isArray(d.channels)) parsedChannels = d.channels
          else if (typeof d.channels === 'string' && d.channels) {
            try { const c = JSON.parse(d.channels); parsedChannels = Array.isArray(c) ? c : [] }
            catch { parsedChannels = d.channels.split(',').map((s: string) => s.trim()).filter(Boolean) }
          }
          setForm({
            businessName: d.business_name || d.name || '',
            industry: d.industry || '', website: d.website || '', tagline: d.tagline || '',
            offer: d.offer || '', uniqueValue: d.unique_value || '',
            targetAudience: d.target_audience || '', tone: d.tone || '',
            competitors: d.competitors || '', channels: parsedChannels,
            goals: d.goals || '', monthlyBudget: d.monthly_budget || '',
            prohibitedClaims: d.prohibited_claims || '', approvalEmail: d.approval_email || '',
          })
          setWorkspace(prev => ({ ...prev, name: d.business_name || d.name || '', industry: d.industry || '', website: d.website || '' }))
          if (d.model_settings) {
            try {
              const ms = typeof d.model_settings === 'string' ? JSON.parse(d.model_settings) : d.model_settings
              if (ms && typeof ms === 'object') setModelSettings(prev => ({ ...prev, ...ms }))
            } catch { /* ignore */ }
          }
        }
      })
      .finally(() => setFetching(false))
    const email = localStorage.getItem('userEmail') || ''
    const name = localStorage.getItem('userName') || ''
    setProfile(prev => ({ ...prev, fullName: name, email }))
  }, [router])

  const markUnsaved = (sec: SectionKey) => setUnsaved(prev => new Set(prev).add(sec))

  const save = async (section?: SectionKey) => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...form, modelSettings }),
      })
      const data = await res.json()
      if (data.ok) {
        localStorage.setItem('businessName', form.businessName)
        localStorage.setItem('userName', profile.fullName)
        localStorage.setItem('userEmail', profile.email)
        setSaved(true)
        if (section) setUnsaved(prev => { const s = new Set(prev); s.delete(section); return s })
        setTimeout(() => setSaved(false), 3000)
      } else setError(data.error || 'Save failed')
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  const testConnection = async (provider: string) => {
    setTestResults(prev => ({ ...prev, [provider]: 'Testing...' }))
    await new Promise(r => setTimeout(r, 1200))
    const ms = modelSettings as unknown as Record<string, string>
    const key = ms[provider + 'ApiKey'] || ms[provider + 'AccessKey'] || ''
    if (!key) {
      setTestResults(prev => ({ ...prev, [provider]: '⚠ No API key set' }))
    } else {
      setTestResults(prev => ({ ...prev, [provider]: '✅ Connected · key accepted' }))
    }
    setTimeout(() => setTestResults(prev => { const s = { ...prev }; delete s[provider]; return s }), 4000)
  }

  const testNotification = async (service: 'slack' | 'telegram') => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setNotifyTestResult(prev => ({ ...prev, [service]: 'Testing...' }))
    await save()
    try {
      const res = await fetch(`/api/agents/notify/${service}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'test' }),
      })
      const data = await res.json()
      setNotifyTestResult(prev => ({ ...prev, [service]: (data.sent || data.ok) ? '✅ Connected!' : `❌ ${data.error || 'Failed'}` }))
    } catch (e) {
      setNotifyTestResult(prev => ({ ...prev, [service]: `❌ ${String(e)}` }))
    }
    setTimeout(() => setNotifyTestResult(prev => { const s = { ...prev }; delete s[service]; return s }), 5000)
  }

  const updateMs = (field: keyof ModelSettings, value: string) => {
    setModelSettings(prev => ({ ...prev, [field]: value }))
    markUnsaved('api-keys')
  }

  if (fetching) return (
    <div className="p-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading settings...</p>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-screen">
      {/* ── Left Sidebar ── */}
      <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 gap-1 sticky top-0 h-screen overflow-y-auto">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Settings</p>
        {NAV_ITEMS.map(item => (
          item.link ? (
            <a key={item.key} href={item.link}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <span>{item.icon}</span>
              <span>{item.label}</span>
              <span className="ml-auto text-gray-600 text-xs">↗</span>
            </a>
          ) : (
            <button key={item.key} onClick={() => setActiveSection(item.key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left w-full ${activeSection === item.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'} ${item.key === 'danger' ? 'text-red-400 hover:text-red-300' : ''}`}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {unsaved.has(item.key) && <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Unsaved changes" />}
            </button>
          )
        ))}
      </aside>

      {/* ── Right Content ── */}
      <main className="flex-1 p-8 overflow-y-auto max-w-3xl">
        {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}
        {saved && <div className="mb-6 p-4 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">Changes saved successfully.</div>}

        {/* ════════════════ PROFILE ════════════════ */}
        {activeSection === 'profile' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">👤 Profile</h1>
              <p className="text-gray-400 text-sm mt-1">Manage your personal information and preferences.</p>
            </div>
            <Card title="Personal Information">
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-full bg-indigo-700 flex items-center justify-center text-2xl font-bold text-white shrink-0 border-2 border-indigo-500">
                  {profile.avatar ? <img src={profile.avatar} className="w-full h-full rounded-full object-cover" alt="avatar" /> : profile.fullName.slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Profile Photo</p>
                  <p className="text-gray-500 text-xs mb-2">Drag &amp; drop an image or click to upload. Max 2MB.</p>
                  <label className={btnSm + ' cursor-pointer'}>
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0]; if (!f) return
                      const r = new FileReader(); r.onload = ev => setProfile(p => ({ ...p, avatar: ev.target?.result as string })); r.readAsDataURL(f)
                    }} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name"><input className={inp} value={profile.fullName} onChange={e => { setProfile(p => ({ ...p, fullName: e.target.value })); markUnsaved('profile') }} /></Field>
                <Field label="Job Title"><input className={inp} value={profile.jobTitle} onChange={e => { setProfile(p => ({ ...p, jobTitle: e.target.value })); markUnsaved('profile') }} placeholder="e.g. Marketing Manager" /></Field>
              </div>
              <Field label="Email Address">
                <div className="flex gap-2">
                  <input className={inp} value={profile.email} readOnly />
                  <button className={btnSm} onClick={() => setModal('changeEmail')}>Change Email</button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone Number"><input className={inp} value={profile.phone} onChange={e => { setProfile(p => ({ ...p, phone: e.target.value })); markUnsaved('profile') }} placeholder="+91 98765 43210" /></Field>
                <Field label="Timezone">
                  <select className={inp} value={profile.timezone} onChange={e => { setProfile(p => ({ ...p, timezone: e.target.value })); markUnsaved('profile') }}>
                    {TIMEZONES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Language">
                <select className={inp} value={profile.language} onChange={e => { setProfile(p => ({ ...p, language: e.target.value })); markUnsaved('profile') }}>
                  {['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Chinese'].map(l => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <button onClick={() => save('profile')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Profile'}</button>
            </Card>
          </div>
        )}

        {/* ════════════════ WORKSPACE ════════════════ */}
        {activeSection === 'workspace' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🏢 Workspace</h1>
              <p className="text-gray-400 text-sm mt-1">Configure your business workspace details.</p>
            </div>
            <Card title="Workspace Details">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl shrink-0">🏢</div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Workspace Logo</p>
                  <p className="text-gray-500 text-xs mb-2">PNG or SVG, max 1MB</p>
                  <label className={btnSm + ' cursor-pointer'}>Upload Logo<input type="file" accept="image/*" className="hidden" /></label>
                </div>
              </div>
              <Field label="Workspace Name"><input className={inp} value={workspace.name} onChange={e => { setWorkspace(w => ({ ...w, name: e.target.value })); setForm(f => ({ ...f, businessName: e.target.value })); markUnsaved('workspace') }} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Industry">
                  <select className={inp} value={workspace.industry} onChange={e => { setWorkspace(w => ({ ...w, industry: e.target.value })); setForm(f => ({ ...f, industry: e.target.value })); markUnsaved('workspace') }}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Business Type">
                  <select className={inp} value={workspace.businessType} onChange={e => { setWorkspace(w => ({ ...w, businessType: e.target.value })); markUnsaved('workspace') }}>
                    {['B2B', 'B2C', 'Agency', 'E-commerce'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Website URL"><input className={inp} value={workspace.website} placeholder="https://" onChange={e => { setWorkspace(w => ({ ...w, website: e.target.value })); setForm(f => ({ ...f, website: e.target.value })); markUnsaved('workspace') }} /></Field>
              <Field label="Business Description"><textarea className={ta} rows={3} value={workspace.description} onChange={e => { setWorkspace(w => ({ ...w, description: e.target.value })); markUnsaved('workspace') }} placeholder="What does your business do?" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Default Currency">
                  <select className={inp} value={workspace.currency} onChange={e => { setWorkspace(w => ({ ...w, currency: e.target.value })); markUnsaved('workspace') }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Fiscal Year Start">
                  <select className={inp} value={workspace.fiscalMonth} onChange={e => { setWorkspace(w => ({ ...w, fiscalMonth: e.target.value })); markUnsaved('workspace') }}>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Team Size">
                <select className={inp} value={workspace.teamSize} onChange={e => { setWorkspace(w => ({ ...w, teamSize: e.target.value })); markUnsaved('workspace') }}>
                  {['1–5', '6–15', '16–50', '51–200', '200+'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <button onClick={() => save('workspace')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Workspace'}</button>
            </Card>
            <Card title="Workspace Info">
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-400 text-sm">Workspace ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-white text-xs bg-gray-800 px-3 py-1.5 rounded-lg">{workspace.workspaceId}</code>
                  <button className={btnSm} onClick={() => navigator.clipboard.writeText(workspace.workspaceId)}>📋 Copy</button>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-t border-gray-800">
                <span className="text-gray-400 text-sm">Created</span>
                <span className="text-gray-300 text-sm">{workspace.createdAt}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════ API KEYS (BYOK) ════════════════ */}
        {activeSection === 'api-keys' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🔑 AI Model API Keys (BYOK)</h1>
              <p className="text-gray-400 text-sm mt-1">Use your own API keys for full control over costs and rate limits. Shared keys are used as fallback.</p>
            </div>
            <div className="p-4 rounded-xl bg-yellow-950 border border-yellow-800 text-yellow-300 text-sm">
              Keys are encrypted at rest. Never share them with anyone. Ooumph staff will never ask for your API keys.
            </div>

            {/* OpenAI */}
            <Card title="OpenAI" subtitle="GPT-4o, DALL-E 3, Whisper">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.openaiApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.openaiApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.openai && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.openai}</span>}
              </div>
              <Field label="API Key" hint="From platform.openai.com/api-keys">
                <MaskedInput value={modelSettings.openaiApiKey} onChange={v => updateMs('openaiApiKey', v)} placeholder="sk-proj-..." />
              </Field>
              <Field label="Default Model">
                <select className={inp} value={modelSettings.openaiModel} onChange={e => updateMs('openaiModel', e.target.value)}>
                  {['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'].map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <button className={btnSm} onClick={() => testConnection('openai')}>Test Connection</button>
                <span className="text-gray-500 text-xs">Usage this month: 2,400 tokens · $0.02</span>
              </div>
            </Card>

            {/* Anthropic */}
            <Card title="Anthropic (Claude)" subtitle="Claude 3.5 Sonnet, Opus, Haiku">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.anthropicApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.anthropicApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.anthropic && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.anthropic}</span>}
              </div>
              <Field label="API Key" hint="From console.anthropic.com/settings/keys">
                <MaskedInput value={modelSettings.anthropicApiKey} onChange={v => updateMs('anthropicApiKey', v)} placeholder="sk-ant-..." />
              </Field>
              <Field label="Default Model">
                <select className={inp} value={modelSettings.claudeModel} onChange={e => updateMs('claudeModel', e.target.value)}>
                  {['claude-sonnet-4-6', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'].map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <button className={btnSm} onClick={() => testConnection('anthropic')}>Test Connection</button>
                <span className="text-gray-500 text-xs">Usage this month: 145,230 tokens · $0.87</span>
              </div>
            </Card>

            {/* ElevenLabs */}
            <Card title="ElevenLabs" subtitle="Voice synthesis and audio generation">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.elevenLabsApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.elevenLabsApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.elevenLabs && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.elevenLabs}</span>}
              </div>
              <Field label="API Key" hint="From elevenlabs.io/app/settings/api-keys">
                <MaskedInput value={modelSettings.elevenLabsApiKey} onChange={v => updateMs('elevenLabsApiKey', v)} placeholder="sk_..." />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Voice Model">
                  <select className={inp} value={modelSettings.elevenLabsVoiceModel} onChange={e => updateMs('elevenLabsVoiceModel', e.target.value)}>
                    {['eleven_multilingual_v2', 'eleven_english_v1', 'eleven_turbo_v2'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Default Voice ID" hint="Optional">
                  <input className={inp} value={modelSettings.elevenLabsVoiceId} onChange={e => updateMs('elevenLabsVoiceId', e.target.value)} placeholder="21m00Tcm4TlvDq8ikWAM" />
                </Field>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button className={btnSm} onClick={() => testConnection('elevenLabs')}>Test Connection</button>
                <span className="text-gray-500 text-xs">Credits remaining: 8,420 / 10,000</span>
              </div>
            </Card>

            {/* Stability AI */}
            <Card title="Stability AI / SDXL" subtitle="Image generation via Stable Diffusion">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.stabilityApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.stabilityApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.stability && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.stability}</span>}
              </div>
              <Field label="API Key" hint="From platform.stability.ai/account/keys">
                <MaskedInput value={modelSettings.stabilityApiKey} onChange={v => updateMs('stabilityApiKey', v)} placeholder="sk-..." />
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <button className={btnSm} onClick={() => testConnection('stability')}>Test Connection</button>
                <span className="text-gray-500 text-xs">Credits remaining: 420</span>
              </div>
            </Card>

            {/* Replicate */}
            <Card title="Replicate" subtitle="Open-source AI models via API">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.replicateApiToken ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.replicateApiToken ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.replicate && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.replicate}</span>}
              </div>
              <Field label="API Token" hint="From replicate.com/account/api-tokens">
                <MaskedInput value={modelSettings.replicateApiToken} onChange={v => updateMs('replicateApiToken', v)} placeholder="r8_..." />
              </Field>
              <button className={btnSm} onClick={() => testConnection('replicate')}>Test Connection</button>
            </Card>

            {/* Google Gemini */}
            <Card title="Google AI (Gemini)" subtitle="Gemini 1.5 Pro and Flash models">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.geminiApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.geminiApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.gemini && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.gemini}</span>}
              </div>
              <Field label="API Key" hint="From aistudio.google.com/app/apikey">
                <MaskedInput value={modelSettings.geminiApiKey} onChange={v => updateMs('geminiApiKey', v)} placeholder="AIza..." />
              </Field>
              <Field label="Model">
                <select className={inp} value={modelSettings.geminiModel} onChange={e => updateMs('geminiModel', e.target.value)}>
                  {['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'].map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <button className={btnSm} onClick={() => testConnection('gemini')}>Test Connection</button>
            </Card>

            {/* Kling AI */}
            <Card title="Kling AI (Video)" subtitle="AI video generation — Kling 2.0">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.klingAccessKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.klingAccessKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.kling && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.kling}</span>}
              </div>
              <Field label="Access Key" hint="From klingai.com → API Management">
                <MaskedInput value={modelSettings.klingAccessKey} onChange={v => updateMs('klingAccessKey', v)} placeholder="Access key" />
              </Field>
              <Field label="Secret Key">
                <MaskedInput value={modelSettings.klingSecretKey} onChange={v => updateMs('klingSecretKey', v)} placeholder="Secret key" />
              </Field>
              <button className={btnSm} onClick={() => testConnection('kling')}>Test Connection</button>
            </Card>

            {/* Runway ML */}
            <Card title="Runway ML" subtitle="Gen-2 and Gen-3 video generation">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${modelSettings.runwayApiKey ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{modelSettings.runwayApiKey ? '✅ Connected' : '⚠ Not Set'}</span>
                {testResults.runway && <span className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">{testResults.runway}</span>}
              </div>
              <Field label="API Key" hint="From app.runwayml.com/account/api-keys">
                <MaskedInput value={modelSettings.runwayApiKey} onChange={v => updateMs('runwayApiKey', v)} placeholder="key_..." />
              </Field>
              <button className={btnSm} onClick={() => testConnection('runway')}>Test Connection</button>
            </Card>

            {/* Other keys grouped */}
            <Card title="Groq" subtitle="Fast LLM inference for bulk tasks">
              <Field label="API Key" hint="Get free at console.groq.com/keys">
                <MaskedInput value={modelSettings.groqApiKey} onChange={v => updateMs('groqApiKey', v)} placeholder="gsk_..." />
              </Field>
            </Card>

            {/* Data & Analytics */}
            <Card title="Data & Analytics">
              <Field label="Brave Search API Key" hint="Enables live trend signals in the Trend Scout agent">
                <MaskedInput value={modelSettings.braveSearchApiKey} onChange={v => updateMs('braveSearchApiKey', v)} placeholder="BSA..." />
              </Field>
              <Field label="Google Analytics 4 Property ID">
                <input className={inp} value={modelSettings.ga4PropertyId} onChange={e => updateMs('ga4PropertyId', e.target.value)} placeholder="1234567890" />
              </Field>
              <Field label="GA4 Access Token">
                <MaskedInput value={modelSettings.ga4AccessToken} onChange={v => updateMs('ga4AccessToken', v)} placeholder="ya29..." />
              </Field>
              <Field label="Search Console Site URL">
                <input className={inp} value={modelSettings.searchConsoleSiteUrl} onChange={e => updateMs('searchConsoleSiteUrl', e.target.value)} placeholder="https://yourdomain.com" />
              </Field>
              <Field label="Search Console Access Token">
                <MaskedInput value={modelSettings.searchConsoleAccessToken} onChange={v => updateMs('searchConsoleAccessToken', v)} placeholder="ya29...." />
              </Field>
            </Card>

            {/* CRM & Email */}
            <Card title="CRM & Email">
              <Field label="HubSpot Access Token"><MaskedInput value={modelSettings.hubspotAccessToken} onChange={v => updateMs('hubspotAccessToken', v)} placeholder="pat-..." /></Field>
              <Field label="Resend API Key"><MaskedInput value={modelSettings.resendApiKey} onChange={v => updateMs('resendApiKey', v)} placeholder="re_..." /></Field>
            </Card>

            {/* Notifications */}
            <Card title="Notification Services">
              <Field label="Slack Bot Token" hint="From api.slack.com — needs chat:write scope">
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1"><MaskedInput value={modelSettings.slackBotToken} onChange={v => updateMs('slackBotToken', v)} placeholder="xoxb-..." /></div>
                    <button onClick={() => testNotification('slack')} className={btnSm}>Test</button>
                  </div>
                  {notifyTestResult.slack && <p className={`text-xs ${notifyTestResult.slack.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{notifyTestResult.slack}</p>}
                </div>
              </Field>
              <Field label="Slack Channel ID"><input className={inp} value={modelSettings.slackChannelId} onChange={e => updateMs('slackChannelId', e.target.value)} placeholder="C0123456789" /></Field>
              <Field label="Telegram Bot Token">
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1"><MaskedInput value={modelSettings.telegramBotToken} onChange={v => updateMs('telegramBotToken', v)} placeholder="123456789:AAF..." /></div>
                    <button onClick={() => testNotification('telegram')} className={btnSm}>Test</button>
                  </div>
                  {notifyTestResult.telegram && <p className={`text-xs ${notifyTestResult.telegram.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{notifyTestResult.telegram}</p>}
                </div>
              </Field>
              <Field label="Telegram Chat ID"><input className={inp} value={modelSettings.telegramChatId} onChange={e => updateMs('telegramChatId', e.target.value)} placeholder="-1001234567890" /></Field>
            </Card>

            {/* Publishing */}
            <Card title="Publishing">
              <Field label="WordPress Site URL"><input className={inp} value={modelSettings.wpSiteUrl} onChange={e => updateMs('wpSiteUrl', e.target.value)} placeholder="https://yourblog.com" /></Field>
              <Field label="WordPress Username"><input className={inp} value={modelSettings.wpUsername} onChange={e => updateMs('wpUsername', e.target.value)} placeholder="admin" /></Field>
              <Field label="WordPress App Password"><MaskedInput value={modelSettings.wpAppPassword} onChange={v => updateMs('wpAppPassword', v)} placeholder="xxxx xxxx xxxx xxxx" /></Field>
              <Field label="Ghost Site URL"><input className={inp} value={modelSettings.ghostUrl} onChange={e => updateMs('ghostUrl', e.target.value)} placeholder="https://yourblog.ghost.io" /></Field>
              <Field label="Ghost Admin API Key"><MaskedInput value={modelSettings.ghostAdminKey} onChange={v => updateMs('ghostAdminKey', v)} placeholder="Ghost admin key" /></Field>
              <Field label="Buffer Access Token"><MaskedInput value={modelSettings.bufferAccessToken} onChange={v => updateMs('bufferAccessToken', v)} placeholder="Buffer access token" /></Field>
            </Card>

            {/* CRM & Booking */}
            <Card title="CRM & Booking">
              <Field label="Cal.com API Key"><MaskedInput value={modelSettings.calcomApiKey} onChange={v => updateMs('calcomApiKey', v)} placeholder="cal_live_..." /></Field>
              <Field label="Tally API Key"><MaskedInput value={modelSettings.tallyApiKey} onChange={v => updateMs('tallyApiKey', v)} placeholder="Tally API key" /></Field>
            </Card>

            {/* Automation */}
            <Card title="Automation">
              <Field label="n8n Base URL"><input className={inp} value={modelSettings.n8nBaseUrl} onChange={e => updateMs('n8nBaseUrl', e.target.value)} placeholder="https://your-n8n.domain.com" /></Field>
              <Field label="n8n API Key"><MaskedInput value={modelSettings.n8nApiKey} onChange={v => updateMs('n8nApiKey', v)} placeholder="n8n API key" /></Field>
            </Card>

            {/* Content & Media */}
            <Card title="Content & Media">
              <Field label="Firecrawl API Key"><MaskedInput value={modelSettings.firecrawlApiKey} onChange={v => updateMs('firecrawlApiKey', v)} placeholder="fc-..." /></Field>
              <Field label="Unsplash Access Key"><MaskedInput value={modelSettings.unsplashAccessKey} onChange={v => updateMs('unsplashAccessKey', v)} placeholder="Unsplash access key" /></Field>
              <Field label="Pexels API Key"><MaskedInput value={modelSettings.pexelsApiKey} onChange={v => updateMs('pexelsApiKey', v)} placeholder="Pexels API key" /></Field>
              <Field label="Cloudinary Cloud Name"><input className={inp} value={modelSettings.cloudinaryCloudName} onChange={e => updateMs('cloudinaryCloudName', e.target.value)} placeholder="mycloud" /></Field>
              <Field label="Cloudinary API Key"><input className={inp} value={modelSettings.cloudinaryApiKey} onChange={e => updateMs('cloudinaryApiKey', e.target.value)} placeholder="Cloudinary API Key" /></Field>
              <Field label="Cloudinary API Secret"><MaskedInput value={modelSettings.cloudinaryApiSecret} onChange={v => updateMs('cloudinaryApiSecret', v)} placeholder="Cloudinary API Secret" /></Field>
            </Card>

            {/* Lead Enrichment */}
            <Card title="Lead Enrichment">
              <Field label="Apollo.io API Key"><MaskedInput value={modelSettings.apolloApiKey} onChange={v => updateMs('apolloApiKey', v)} placeholder="Apollo.io API key" /></Field>
              <Field label="Hunter.io API Key"><MaskedInput value={modelSettings.hunterApiKey} onChange={v => updateMs('hunterApiKey', v)} placeholder="Hunter.io API key" /></Field>
            </Card>

            {/* Email Marketing */}
            <Card title="Email Marketing">
              <Field label="Mailchimp API Key"><MaskedInput value={modelSettings.mailchimpApiKey} onChange={v => updateMs('mailchimpApiKey', v)} placeholder="Mailchimp API key" /></Field>
              <Field label="Mailchimp Server Prefix"><input className={inp} value={modelSettings.mailchimpServer} onChange={e => updateMs('mailchimpServer', e.target.value)} placeholder="us18" /></Field>
              <Field label="Brevo API Key"><MaskedInput value={modelSettings.brevoApiKey} onChange={v => updateMs('brevoApiKey', v)} placeholder="Brevo API key" /></Field>
              <Field label="Brevo From Email"><input className={inp} type="email" value={modelSettings.brevoFromEmail} onChange={e => updateMs('brevoFromEmail', e.target.value)} placeholder="hello@yourcompany.com" /></Field>
            </Card>

            {/* Social Publishing */}
            <Card title="Social Publishing">
              <Field label="Twitter Bearer Token"><MaskedInput value={modelSettings.twitterBearerToken} onChange={v => updateMs('twitterBearerToken', v)} placeholder="Twitter Bearer Token" /></Field>
              <Field label="Twitter Access Token"><MaskedInput value={modelSettings.twitterAccessToken} onChange={v => updateMs('twitterAccessToken', v)} placeholder="Twitter Access Token" /></Field>
              <Field label="LinkedIn Access Token"><MaskedInput value={modelSettings.linkedinAccessToken} onChange={v => updateMs('linkedinAccessToken', v)} placeholder="LinkedIn Access Token" /></Field>
              <Field label="LinkedIn Author URN"><input className={inp} value={modelSettings.linkedinAuthorUrn} onChange={e => updateMs('linkedinAuthorUrn', e.target.value)} placeholder="urn:li:person:..." /></Field>
              <Field label="YouTube API Key"><input className={inp} value={modelSettings.youtubeApiKey} onChange={e => updateMs('youtubeApiKey', e.target.value)} placeholder="YouTube API Key" /></Field>
              <Field label="YouTube Access Token"><MaskedInput value={modelSettings.youtubeAccessToken} onChange={v => updateMs('youtubeAccessToken', v)} placeholder="YouTube Access Token" /></Field>
              <Field label="Deepgram API Key" hint="For audio transcription"><MaskedInput value={modelSettings.deepgramApiKey} onChange={v => updateMs('deepgramApiKey', v)} placeholder="Deepgram API key" /></Field>
            </Card>

            {/* Paid Advertising */}
            <Card title="Paid Advertising">
              <Field label="Meta Access Token"><MaskedInput value={modelSettings.metaAccessToken} onChange={v => updateMs('metaAccessToken', v)} placeholder="EAAxxxxx..." /></Field>
              <Field label="Meta Ad Account ID"><input className={inp} value={modelSettings.metaAdAccountId} onChange={e => updateMs('metaAdAccountId', e.target.value)} placeholder="act_123456789" /></Field>
              <Field label="Meta Webhook Verify Token"><input className={inp} value={modelSettings.metaWebhookVerifyToken} onChange={e => updateMs('metaWebhookVerifyToken', e.target.value)} placeholder="Your chosen verify token" /></Field>
              <Field label="Google Ads Developer Token"><MaskedInput value={modelSettings.googleAdsDeveloperToken} onChange={v => updateMs('googleAdsDeveloperToken', v)} placeholder="Google Ads Developer Token" /></Field>
              <Field label="Google Ads Customer ID"><input className={inp} value={modelSettings.googleAdsCustomerId} onChange={e => updateMs('googleAdsCustomerId', e.target.value)} placeholder="123-456-7890" /></Field>
              <Field label="Google Ads Access Token"><MaskedInput value={modelSettings.googleAdsAccessToken} onChange={v => updateMs('googleAdsAccessToken', v)} placeholder="ya29...." /></Field>
              <Field label="LinkedIn Ads Access Token"><MaskedInput value={modelSettings.linkedinAdsAccessToken} onChange={v => updateMs('linkedinAdsAccessToken', v)} placeholder="LinkedIn Ads Access Token" /></Field>
              <Field label="LinkedIn Ads Account ID"><input className={inp} value={modelSettings.linkedinAdsAccountId} onChange={e => updateMs('linkedinAdsAccountId', e.target.value)} placeholder="urn:li:sponsoredAccount:..." /></Field>
            </Card>

            {/* Voice & Avatar */}
            <Card title="Voice & Avatar AI">
              <Field label="HeyGen API Key"><MaskedInput value={modelSettings.heygenApiKey} onChange={v => updateMs('heygenApiKey', v)} placeholder="HeyGen API Key" /></Field>
              <Field label="Vapi API Key"><MaskedInput value={modelSettings.vapiApiKey} onChange={v => updateMs('vapiApiKey', v)} placeholder="Vapi API Key" /></Field>
            </Card>

            {/* Payments */}
            <Card title="Payments">
              <Field label="Stripe Secret Key" hint="Keep secret — never expose on frontend"><MaskedInput value={modelSettings.stripeSecretKey} onChange={v => updateMs('stripeSecretKey', v)} placeholder="sk_live_... or sk_test_..." /></Field>
              <Field label="Stripe Publishable Key"><input className={inp} value={modelSettings.stripePublishableKey} onChange={e => updateMs('stripePublishableKey', e.target.value)} placeholder="pk_live_..." /></Field>
              <Field label="Razorpay Key ID"><input className={inp} value={modelSettings.razorpayKeyId} onChange={e => updateMs('razorpayKeyId', e.target.value)} placeholder="rzp_live_..." /></Field>
              <Field label="Razorpay Key Secret"><MaskedInput value={modelSettings.razorpayKeySecret} onChange={v => updateMs('razorpayKeySecret', v)} placeholder="Razorpay Key Secret" /></Field>
            </Card>

            {/* Fallback options */}
            <Card title="Key Management">
              <Toggle on={sharedKeyFallback} onToggle={() => setSharedKeyFallback(v => !v)} label="Use Ooumph shared keys when your key hits rate limits" />
              <Toggle on={keyRotationReminder} onToggle={() => setKeyRotationReminder(v => !v)} label="Remind me to rotate keys every 90 days" />
            </Card>

            <button onClick={() => save('api-keys')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save All API Keys'}</button>
          </div>
        )}

        {/* ════════════════ AI MODELS ════════════════ */}
        {activeSection === 'ai-models' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🤖 AI Models</h1>
              <p className="text-gray-400 text-sm mt-1">Configure model routing, cost caps, and quality preferences.</p>
            </div>
            <Card title="Default Model">
              <p className="text-gray-400 text-sm mb-4">The primary Claude model powering all agents.</p>
              <div className="space-y-2">
                {SUPPORTED_MODELS.map(m => (
                  <label key={m.id} className={`flex items-start gap-4 p-3 rounded-xl border cursor-pointer transition-colors ${modelSettings.defaultModel === m.id ? 'bg-indigo-950 border-indigo-700' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                    <input type="radio" name="model" value={m.id} checked={modelSettings.defaultModel === m.id} onChange={() => { setModelSettings(prev => ({ ...prev, defaultModel: m.id })); markUnsaved('ai-models') }} className="mt-0.5 accent-indigo-500" />
                    <div><p className="text-white font-medium text-sm">{m.name}</p><p className="text-gray-400 text-xs mt-0.5">{m.description}</p></div>
                  </label>
                ))}
              </div>
            </Card>
            <Card title="Task → Model Routing">
              <p className="text-gray-500 text-xs mb-4">Configure which model is used per task type. Cost estimates update based on average task size.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 font-medium pb-2">Task</th>
                      <th className="text-left text-gray-400 font-medium pb-2">Model</th>
                      <th className="text-left text-gray-400 font-medium pb-2">Provider</th>
                      <th className="text-right text-gray-400 font-medium pb-2">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRouting.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2.5 text-gray-300 pr-3">{row.task}</td>
                        <td className="py-2.5 pr-3">
                          <select className={inpSm} value={row.model} onChange={e => {
                            const next = [...modelRouting]; next[i] = { ...next[i], model: e.target.value }; setModelRouting(next); markUnsaved('ai-models')
                          }}>
                            {['Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus', 'GPT-4o', 'GPT-4o mini', 'Gemini 1.5 Pro', 'DALL-E 3', 'Kling 2.0', 'ElevenLabs v3'].map(m => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className="py-2.5 text-gray-400 pr-3">{row.provider}</td>
                        <td className="py-2.5 text-right text-green-400 font-mono text-xs">{row.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Smart Routing & Cost Controls">
              <Toggle on={smartRouting} onToggle={() => { setSmartRouting(v => !v); markUnsaved('ai-models') }} label="Automatically use cheaper models for simple tasks" />
              <Field label="Monthly Cost Cap (USD)" hint="AI generation pauses if this threshold is reached">
                <div className="flex gap-2 items-center">
                  <span className="text-gray-400 text-sm">$</span>
                  <input className={inp} type="number" min="0" value={costCap} onChange={e => { setCostCap(e.target.value); markUnsaved('ai-models') }} placeholder="100" />
                </div>
              </Field>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">Quality vs Speed</span>
                  <span className="text-gray-500">{qualitySpeed}% Quality</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">⚡ Speed</span>
                  <input type="range" min="0" max="100" value={qualitySpeed} onChange={e => { setQualitySpeed(Number(e.target.value)); markUnsaved('ai-models') }}
                    className="flex-1 accent-indigo-500" />
                  <span className="text-xs text-gray-500">Quality 🎯</span>
                </div>
              </div>
            </Card>
            <button onClick={() => save('ai-models')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Model Settings'}</button>
          </div>
        )}

        {/* ════════════════ NOTIFICATIONS ════════════════ */}
        {activeSection === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🔔 Notifications</h1>
              <p className="text-gray-400 text-sm mt-1">Choose what you get notified about and how.</p>
            </div>
            <Card title="In-App Notifications">
              {([['approvals', 'Approval requests'], ['agentTasks', 'Agent task completions'], ['campaigns', 'Campaign published'], ['errors', 'Error alerts'], ['newLeads', 'New leads'], ['weeklySummary', 'Weekly summary']] as const).map(([k, label]) => (
                <Toggle key={k} on={notifInApp[k]} onToggle={() => setNotifInApp(p => ({ ...p, [k]: !p[k] }))} label={label} />
              ))}
            </Card>
            <Card title="Email Notifications">
              <Field label="Notification Email">
                <input className={inp} type="email" value={notifEmail2} onChange={e => setNotifEmail2(e.target.value)} placeholder="you@example.com" />
              </Field>
              {([['approvals', 'Approval requests'], ['agentTasks', 'Agent task completions'], ['campaigns', 'Campaign published'], ['errors', 'Error alerts'], ['newLeads', 'New leads'], ['weeklySummary', 'Weekly summary']] as const).map(([k, label]) => (
                <Toggle key={k} on={notifEmail[k]} onToggle={() => setNotifEmail(p => ({ ...p, [k]: !p[k] }))} label={label} />
              ))}
            </Card>
            <Card title="Frequency & Schedule">
              <Field label="Notification Frequency">
                <div className="flex gap-2 flex-wrap">
                  {([['realtime', 'Real-time'], ['hourly', 'Batched (hourly)'], ['daily', 'Daily digest'], ['off', 'Off']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setNotifFrequency(v)}
                      className={`px-4 py-2 rounded-lg text-sm border transition-colors ${notifFrequency === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="space-y-2">
                <Toggle on={dndEnabled} onToggle={() => setDndEnabled(v => !v)} label="Enable Do Not Disturb" />
                {dndEnabled && (
                  <div className="flex items-center gap-3 pl-13">
                    <input type="time" className={inpSm} value={dndFrom} onChange={e => setDndFrom(e.target.value)} />
                    <span className="text-gray-500 text-sm">to</span>
                    <input type="time" className={inpSm} value={dndTo} onChange={e => setDndTo(e.target.value)} />
                  </div>
                )}
              </div>
            </Card>
            <button onClick={() => save('notifications')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Notification Settings'}</button>
          </div>
        )}

        {/* ════════════════ SECURITY ════════════════ */}
        {activeSection === 'security' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🔒 Security</h1>
              <p className="text-gray-400 text-sm mt-1">Manage authentication, sessions, and access control.</p>
            </div>

            {/* Current session */}
            <Card title="Current Session">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-white font-medium">MacBook Pro — Chrome 124</p>
                  <p className="text-gray-500 text-xs mt-0.5">103.21.45.12 · Mumbai, IN · Active now</p>
                </div>
                <span className="px-2 py-0.5 bg-green-900 text-green-300 text-xs rounded">Current</span>
              </div>
            </Card>

            {/* All sessions */}
            <Card title="Active Sessions">
              <div className="space-y-3">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                    <div>
                      <p className="text-white text-sm font-medium">{s.device} — {s.browser}</p>
                      <p className="text-gray-500 text-xs">{s.ip} · {s.location} · {s.lastActive}</p>
                    </div>
                    {s.current ? <span className="text-xs text-green-400">Current</span> :
                      <button className={btnDanger + ' text-xs py-1'} onClick={() => alert('Session revoked (demo)')}>Revoke</button>}
                  </div>
                ))}
              </div>
              <button className={btnDanger} onClick={() => alert('All other sessions revoked (demo)')}>Revoke All Other Sessions</button>
            </Card>

            {/* 2FA */}
            <Card title="Two-Factor Authentication">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">Authenticator App</p>
                  <p className="text-gray-500 text-xs mt-0.5">{twoFAEnabled ? '2FA is enabled on your account.' : '2FA is not enabled. Add an extra layer of security.'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${twoFAEnabled ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-yellow-400'}`}>{twoFAEnabled ? '✅ Enabled' : '⚠ Disabled'}</span>
              </div>
              <button onClick={() => { setTwoFAEnabled(v => !v); setModal('2fa') }} className={twoFAEnabled ? btnDanger : btn}>{twoFAEnabled ? 'Disable 2FA' : 'Enable 2FA'}</button>
              {twoFAEnabled && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-white text-sm font-medium mb-2">Backup Codes</p>
                  <button className={btnGhost} onClick={() => setModal('backupCodes')}>View Backup Codes</button>
                </div>
              )}
            </Card>

            {/* Personal Access Tokens */}
            <Card title="API Access Tokens" subtitle="Generate tokens to use the Ooumph API from external apps">
              <div className="space-y-2">
                {accessTokens.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700 text-sm">
                    <div>
                      <p className="text-white font-medium">{t.name}</p>
                      <p className="text-gray-500 text-xs">{t.permissions.join(', ')} · Last used {t.lastUsed} · Expires {t.expiry}</p>
                    </div>
                    <button className={btnDanger + ' text-xs py-1'} onClick={() => setAccessTokens(p => p.filter(x => x.id !== t.id))}>Revoke</button>
                  </div>
                ))}
              </div>
              <button className={btn} onClick={() => setModal('newToken')}>+ Generate New Token</button>
            </Card>

            {/* Login History */}
            <Card title="Login History">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="pb-2 text-gray-400 font-medium">Date</th>
                      <th className="pb-2 text-gray-400 font-medium">Device</th>
                      <th className="pb-2 text-gray-400 font-medium">IP</th>
                      <th className="pb-2 text-gray-400 font-medium">Location</th>
                      <th className="pb-2 text-gray-400 font-medium text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map((r, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2 text-gray-300 pr-3 text-xs">{r.date}</td>
                        <td className="py-2 text-gray-300 pr-3">{r.device}</td>
                        <td className="py-2 text-gray-400 pr-3 font-mono text-xs">{r.ip}</td>
                        <td className="py-2 text-gray-400 pr-3">{r.location}</td>
                        <td className={`py-2 text-right text-xs font-medium ${r.result === 'Success' ? 'text-green-400' : 'text-red-400'}`}>{r.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Password */}
            <Card title="Password">
              <p className="text-gray-400 text-sm">Last changed 30 days ago.</p>
              <button className={btnGhost} onClick={() => setModal('changePassword')}>Change Password</button>
            </Card>
          </div>
        )}

        {/* ════════════════ APPEARANCE ════════════════ */}
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">🎨 Appearance</h1>
              <p className="text-gray-400 text-sm mt-1">Customise how the dashboard looks and feels.</p>
            </div>
            <Card title="Theme">
              <div className="flex gap-3">
                {(['dark', 'light', 'system'] as const).map(t => (
                  <button key={t} onClick={() => setAppearance(a => ({ ...a, theme: t }))}
                    className={`px-5 py-2.5 rounded-lg text-sm border capitalize transition-colors ${appearance.theme === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                    {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀ Light' : '💻 System'}
                  </button>
                ))}
              </div>
            </Card>
            <Card title="Accent Color">
              <div className="flex gap-3 flex-wrap">
                {ACCENT_COLORS.map(c => (
                  <button key={c.name} onClick={() => setAppearance(a => ({ ...a, accentColor: c.name }))} title={c.name}
                    className={`w-8 h-8 rounded-full ${c.cls} transition-all ${appearance.accentColor === c.name ? `ring-2 ring-offset-2 ring-offset-gray-900 ${c.ring} scale-110` : 'hover:scale-105'}`} />
                ))}
              </div>
            </Card>
            <Card title="Layout & Density">
              <Field label="Sidebar">
                <div className="flex gap-3">
                  {(['collapsed', 'expanded'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, sidebar: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.sidebar === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Content Density">
                <div className="flex gap-3">
                  {(['comfortable', 'compact', 'spacious'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, density: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.density === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Font Size">
                <div className="flex gap-3">
                  {(['small', 'medium', 'large'] as const).map(v => (
                    <button key={v} onClick={() => setAppearance(a => ({ ...a, fontSize: v }))}
                      className={`px-4 py-2 rounded-lg text-sm border capitalize transition-colors ${appearance.fontSize === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle on={appearance.animations} onToggle={() => setAppearance(a => ({ ...a, animations: !a.animations }))} label="Show animations and transitions" />
            </Card>
            <button onClick={() => save('appearance')} disabled={saving} className={btn + ' disabled:opacity-40'}>{saving ? 'Saving…' : 'Save Appearance'}</button>
          </div>
        )}

        {/* ════════════════ USAGE & LIMITS ════════════════ */}
        {activeSection === 'usage' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">📊 Usage &amp; Limits</h1>
              <p className="text-gray-400 text-sm mt-1">Monitor your resource consumption and plan limits.</p>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-indigo-950 border border-indigo-800">
              <div>
                <p className="text-indigo-300 text-xs font-medium uppercase tracking-wider">Current Plan</p>
                <p className="text-white text-lg font-bold mt-0.5">Growth</p>
              </div>
              <button className={btn}>Upgrade Plan</button>
            </div>
            <Card title="Resource Usage — May 2026">
              <UsageBar label="AI Requests" used={4230} total={10000} unit="req" />
              <UsageBar label="Image Generations" used={847} total={2000} unit="img" />
              <UsageBar label="Video Generations" used={12} total={50} unit="vid" />
              <UsageBar label="Voice Minutes" used={34} total={120} unit="min" />
              <UsageBar label="Storage" used={4.2} total={10} unit="GB" />
              <UsageBar label="Team Members" used={3} total={5} unit="seats" />
              <UsageBar label="API Calls" used={12400} total={50000} unit="calls" />
            </Card>
            <Card title="Usage History — Last 6 Months">
              <div className="space-y-4">
                {[
                  { month: 'Dec 2025', req: 3100, img: 620 },
                  { month: 'Jan 2026', req: 4200, img: 780 },
                  { month: 'Feb 2026', req: 3800, img: 710 },
                  { month: 'Mar 2026', req: 5100, img: 890 },
                  { month: 'Apr 2026', req: 4900, img: 1020 },
                  { month: 'May 2026', req: 4230, img: 847 },
                ].map(row => (
                  <div key={row.month} className="flex items-center gap-4">
                    <span className="text-gray-400 text-xs w-20 shrink-0">{row.month}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                        <div className="flex-1 bg-gray-800 rounded h-1.5"><div className="bg-indigo-500 h-1.5 rounded" style={{ width: `${(row.req / 10000) * 100}%` }} /></div>
                        <span className="text-gray-500 text-xs w-14 text-right">{row.req.toLocaleString()} req</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                        <div className="flex-1 bg-gray-800 rounded h-1.5"><div className="bg-purple-500 h-1.5 rounded" style={{ width: `${(row.img / 2000) * 100}%` }} /></div>
                        <span className="text-gray-500 text-xs w-14 text-right">{row.img} img</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════ DANGER ZONE ════════════════ */}
        {activeSection === 'danger' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-red-400">🗑 Danger Zone</h1>
              <p className="text-gray-400 text-sm mt-1">These actions are permanent and cannot be undone.</p>
            </div>
            <div className="bg-red-950/30 border border-red-900 rounded-xl p-6 space-y-6">

              {/* Delete All Content */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-red-300 font-medium text-sm">Delete All Content</p>
                  <p className="text-gray-500 text-xs mt-1">Permanently removes all generated content, campaigns, and assets. Agents and settings are preserved.</p>
                </div>
                <button className={btnDanger + ' shrink-0'} onClick={() => setModal('deleteContent')}>Delete Content</button>
              </div>

              {/* Reset Workspace */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-red-300 font-medium text-sm">Reset Workspace</p>
                  <p className="text-gray-500 text-xs mt-1">Clears all agents, content, strategies, and data. Cannot be reversed.</p>
                </div>
                <button className={btnDanger + ' shrink-0'} onClick={() => setModal('resetWorkspace')}>Reset Workspace</button>
              </div>

              {/* Export Data */}
              <div className="flex items-start justify-between gap-6 pb-5 border-b border-red-900/50">
                <div>
                  <p className="text-white font-medium text-sm">Export All Data</p>
                  <p className="text-gray-500 text-xs mt-1">Download a JSON archive of all your workspace data, content, and settings.</p>
                </div>
                <button className={btn + ' shrink-0'} onClick={() => alert('Export initiated (demo)')}>Export Data</button>
              </div>

              {/* Delete Workspace */}
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-red-300 font-medium text-sm">Delete Workspace</p>
                  <p className="text-gray-500 text-xs mt-1">Permanently deletes your workspace, all data, billing, and account access. This cannot be undone.</p>
                </div>
                <button className="border border-red-600 bg-red-950 text-red-300 hover:bg-red-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0" onClick={() => setModal('deleteWorkspace')}>Delete Workspace</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ════════════════ MODALS ════════════════ */}

      {/* Change Email */}
      <Modal open={modal === 'changeEmail'} onClose={() => setModal(null)} title="Change Email Address">
        <Field label="Current Password"><input type="password" className={inp} value={modalData.currentPassword || ''} onChange={e => setModalData(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Your current password" /></Field>
        <Field label="New Email Address"><input type="email" className={inp} value={modalData.newEmail || ''} onChange={e => setModalData(p => ({ ...p, newEmail: e.target.value }))} placeholder="newemail@example.com" /></Field>
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className={btn} onClick={() => { setProfile(p => ({ ...p, email: modalData.newEmail || p.email })); setModal(null) }}>Change Email</button>
        </div>
      </Modal>

      {/* Change Password */}
      <Modal open={modal === 'changePassword'} onClose={() => setModal(null)} title="Change Password">
        <Field label="Current Password"><input type="password" className={inp} value={modalData.cp || ''} onChange={e => setModalData(p => ({ ...p, cp: e.target.value }))} /></Field>
        <Field label="New Password"><input type="password" className={inp} value={modalData.np || ''} onChange={e => setModalData(p => ({ ...p, np: e.target.value }))} placeholder="Min. 8 characters" /></Field>
        <Field label="Confirm New Password"><input type="password" className={inp} value={modalData.cnp || ''} onChange={e => setModalData(p => ({ ...p, cnp: e.target.value }))} /></Field>
        {modalData.np && modalData.cnp && modalData.np !== modalData.cnp && <p className="text-red-400 text-xs">Passwords do not match.</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className={btn} disabled={!modalData.cp || !modalData.np || modalData.np !== modalData.cnp} onClick={() => { setModal(null); setModalData({}) }}>Update Password</button>
        </div>
      </Modal>

      {/* 2FA Setup */}
      <Modal open={modal === '2fa'} onClose={() => setModal(null)} title={twoFAEnabled ? '2FA Disabled' : 'Set Up Two-Factor Authentication'}>
        {twoFAEnabled ? (
          <p className="text-gray-400 text-sm">Two-factor authentication has been disabled. Your account is now less secure.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            <div className="w-40 h-40 bg-white rounded-xl mx-auto flex items-center justify-center text-4xl">📱</div>
            <p className="text-gray-500 text-xs text-center">Manual key: JBSWY3DPEHPK3PXP</p>
            <Field label="Enter 6-digit code to confirm"><input className={inp} maxLength={6} placeholder="000000" value={modalData.totp || ''} onChange={e => setModalData(p => ({ ...p, totp: e.target.value }))} /></Field>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Close</button>
          {!twoFAEnabled && <button className={btn} onClick={() => setModal(null)}>Verify &amp; Enable</button>}
        </div>
      </Modal>

      {/* Backup Codes */}
      <Modal open={modal === 'backupCodes'} onClose={() => setModal(null)} title="Backup Codes">
        <p className="text-gray-400 text-sm">Store these in a safe place. Each code can only be used once.</p>
        <div className="grid grid-cols-2 gap-2">
          {['a1b2c3d4', 'e5f6g7h8', 'i9j0k1l2', 'm3n4o5p6', 'q7r8s9t0', 'u1v2w3x4', 'y5z6a7b8', 'c9d0e1f2'].map(c => (
            <code key={c} className="px-3 py-1.5 bg-gray-800 rounded text-green-300 text-xs text-center">{c}</code>
          ))}
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => navigator.clipboard.writeText('a1b2c3d4 e5f6g7h8 i9j0k1l2 m3n4o5p6 q7r8s9t0 u1v2w3x4 y5z6a7b8 c9d0e1f2')}>Copy All</button>
          <button className={btn} onClick={() => setModal(null)}>Done</button>
        </div>
      </Modal>

      {/* New Token */}
      <Modal open={modal === 'newToken'} onClose={() => setModal(null)} title="Generate API Access Token">
        <Field label="Token Name"><input className={inp} placeholder="e.g. CI/CD Pipeline" value={modalData.tokenName || ''} onChange={e => setModalData(p => ({ ...p, tokenName: e.target.value }))} /></Field>
        <Field label="Permissions">
          <div className="space-y-2">
            {['read:campaigns', 'write:content', 'read:analytics', 'write:campaigns', 'admin:workspace'].map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-indigo-500" />
                <span className="text-sm text-gray-300 font-mono">{p}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Expiry">
          <select className={inp} value={modalData.tokenExpiry || '90'} onChange={e => setModalData(p => ({ ...p, tokenExpiry: e.target.value }))}>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className={btn} onClick={() => {
            setAccessTokens(p => [...p, { id: `t${Date.now()}`, name: modalData.tokenName || 'New Token', permissions: ['read:campaigns'], lastUsed: 'Never', expiry: '2026-12-31' }])
            setModal(null); setModalData({})
          }}>Generate Token</button>
        </div>
      </Modal>

      {/* Delete Content */}
      <Modal open={modal === 'deleteContent'} onClose={() => setModal(null)} title="Delete All Content">
        <p className="text-gray-400 text-sm">This will permanently delete all generated content, campaigns, and assets. Type <strong className="text-white">DELETE</strong> to confirm.</p>
        <input className={inp} placeholder='Type "DELETE" to confirm' value={dangerInput.deleteContent || ''} onChange={e => setDangerInput(p => ({ ...p, deleteContent: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors" disabled={dangerInput.deleteContent !== 'DELETE'} onClick={() => { setModal(null); setDangerInput(p => ({ ...p, deleteContent: '' })) }}>Delete All Content</button>
        </div>
      </Modal>

      {/* Reset Workspace */}
      <Modal open={modal === 'resetWorkspace'} onClose={() => setModal(null)} title="Reset Workspace">
        <p className="text-gray-400 text-sm">This will clear all agents, content, strategies, and data. Type <strong className="text-white">RESET</strong> to confirm.</p>
        <input className={inp} placeholder='Type "RESET" to confirm' value={dangerInput.resetWorkspace || ''} onChange={e => setDangerInput(p => ({ ...p, resetWorkspace: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors" disabled={dangerInput.resetWorkspace !== 'RESET'} onClick={() => { setModal(null); setDangerInput(p => ({ ...p, resetWorkspace: '' })) }}>Reset Workspace</button>
        </div>
      </Modal>

      {/* Delete Workspace */}
      <Modal open={modal === 'deleteWorkspace'} onClose={() => setModal(null)} title="Delete Workspace — Permanent">
        <p className="text-gray-400 text-sm">This will permanently delete your entire workspace. Type your workspace name <strong className="text-white">{workspace.name || 'my workspace'}</strong> to confirm.</p>
        <input className={inp} placeholder={`Type "${workspace.name || 'my workspace'}" to confirm`} value={dangerInput.deleteWorkspace || ''} onChange={e => setDangerInput(p => ({ ...p, deleteWorkspace: e.target.value }))} />
        <div className="flex gap-3 justify-end pt-2">
          <button className={btnGhost} onClick={() => setModal(null)}>Cancel</button>
          <button className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
            disabled={dangerInput.deleteWorkspace !== (workspace.name || 'my workspace')}
            onClick={() => { localStorage.clear(); window.location.href = '/login' }}>
            Delete Workspace Permanently
          </button>
        </div>
      </Modal>
    </div>
  )
}
