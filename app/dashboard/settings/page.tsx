'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_MODELS } from '@/lib/models'

const CHANNELS = ['Instagram', 'LinkedIn', 'Twitter/X', 'YouTube', 'WhatsApp', 'Email', 'Google Ads', 'Meta Ads'] as const
const TONES = ['Professional', 'Friendly & Conversational', 'Bold & Direct', 'Educational', 'Inspirational', 'Witty & Playful', 'Founder-led / Personal']
const INDUSTRIES = ['SaaS / Tech', 'E-commerce', 'Consulting / Coaching', 'Agency / Services', 'Healthcare', 'Education / EdTech', 'Finance / FinTech', 'Real Estate', 'Food & Beverage', 'Other']

const input = 'w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const textarea = 'w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none'

interface ModelSettings {
  defaultModel: string
  braveSearchApiKey: string
  hubspotAccessToken: string
  ga4PropertyId: string
  ga4AccessToken: string
  metaWebhookVerifyToken: string
  resendApiKey: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'brand' | 'ai-models' | 'api-keys' | 'account'>('brand')
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    businessName: '', industry: '', website: '', tagline: '',
    offer: '', uniqueValue: '', targetAudience: '', tone: '',
    competitors: '', channels: [] as string[], goals: '',
    monthlyBudget: '', prohibitedClaims: '', approvalEmail: '',
  })
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    defaultModel: 'claude-sonnet-4-6',
    braveSearchApiKey: '',
    hubspotAccessToken: '',
    ga4PropertyId: '',
    ga4AccessToken: '',
    metaWebhookVerifyToken: '',
    resendApiKey: '',
  })

  // Account state
  const [accountName, setAccountName] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountSaved, setAccountSaved] = useState(false)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/workspaces?id=${wid}`)
      .then(r => r.json())
      .then(d => {
        if (d) {
          setForm({
            businessName: d.business_name || d.name || '',
            industry: d.industry || '',
            website: d.website || '',
            tagline: d.tagline || '',
            offer: d.offer || '',
            uniqueValue: d.unique_value || '',
            targetAudience: d.target_audience || '',
            tone: d.tone || '',
            competitors: d.competitors || '',
            channels: Array.isArray(d.channels) ? d.channels : (typeof d.channels === 'string' ? JSON.parse(d.channels || '[]') : []),
            goals: d.goals || '',
            monthlyBudget: d.monthly_budget || '',
            prohibitedClaims: d.prohibited_claims || '',
            approvalEmail: d.approval_email || '',
          })
          if (d.model_settings) {
            const ms = typeof d.model_settings === 'string' ? JSON.parse(d.model_settings) : d.model_settings
            setModelSettings(prev => ({ ...prev, ...ms }))
          }
        }
      })
      .finally(() => setFetching(false))

    setAccountEmail(localStorage.getItem('userEmail') || '')
    setAccountName(localStorage.getItem('userName') || '')
  }, [router])

  const update = (field: string, value: string | string[]) => setForm(f => ({ ...f, [field]: value }))
  const updateModel = (field: keyof ModelSettings, value: string) => setModelSettings(prev => ({ ...prev, [field]: value }))
  const toggleChannel = (ch: string) => update('channels', form.channels.includes(ch) ? form.channels.filter(c => c !== ch) : [...form.channels, ch])

  const save = async () => {
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
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else setError(data.error || 'Save failed')
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  const saveAccount = async () => {
    if (newPassword && newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setAccountSaving(true)
    localStorage.setItem('userName', accountName)
    localStorage.setItem('userEmail', accountEmail)
    setAccountSaving(false); setAccountSaved(true)
    setTimeout(() => setAccountSaved(false), 2000)
  }

  if (fetching) return (
    <div className="p-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Loading settings...</p>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">⚙️ Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Manage brand profile, AI models, API keys, and your account.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([['brand', '🏢 Brand'], ['ai-models', '🤖 AI Models'], ['api-keys', '🔑 API Keys'], ['account', '👤 Account']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}
      {saved && <div className="mb-6 p-4 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">Changes saved successfully.</div>}
      {accountSaved && <div className="mb-6 p-4 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">Account updated.</div>}

      {/* Brand Tab */}
      {tab === 'brand' && (
        <div className="space-y-6">
          <Section title="Business Basics">
            <Field label="Business Name *">
              <input className={input} value={form.businessName} onChange={e => update('businessName', e.target.value)} />
            </Field>
            <Field label="Industry">
              <select className={input} value={form.industry} onChange={e => update('industry', e.target.value)}>
                <option value="">Select industry</option>
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="Website URL">
              <input className={input} value={form.website} onChange={e => update('website', e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Tagline or Slogan">
              <input className={input} value={form.tagline} onChange={e => update('tagline', e.target.value)} />
            </Field>
            <Field label="Approval Email *">
              <input className={input} type="email" value={form.approvalEmail} onChange={e => update('approvalEmail', e.target.value)} />
            </Field>
          </Section>

          <Section title="Offer & Audience">
            <Field label="What do you sell / offer? *" hint="Be specific — include the result/transformation.">
              <textarea className={textarea} value={form.offer} onChange={e => update('offer', e.target.value)} rows={3} />
            </Field>
            <Field label="What makes you unique? *">
              <textarea className={textarea} value={form.uniqueValue} onChange={e => update('uniqueValue', e.target.value)} rows={3} />
            </Field>
            <Field label="Who is your ideal customer? *">
              <textarea className={textarea} value={form.targetAudience} onChange={e => update('targetAudience', e.target.value)} rows={3} />
            </Field>
            <Field label="Top competitors">
              <input className={input} value={form.competitors} onChange={e => update('competitors', e.target.value)} placeholder="e.g. HubSpot, Jasper" />
            </Field>
          </Section>

          <Section title="Channels, Goals & Preferences">
            <Field label="Marketing Channels">
              <div className="flex flex-wrap gap-2 mt-2">
                {CHANNELS.map(ch => (
                  <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.channels.includes(ch) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700'}`}>
                    {ch}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Brand Tone">
              <select className={input} value={form.tone} onChange={e => update('tone', e.target.value)}>
                <option value="">Select tone</option>
                {TONES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="30-Day Marketing Goal">
              <textarea className={textarea} value={form.goals} onChange={e => update('goals', e.target.value)} rows={2} />
            </Field>
            <Field label="Monthly Marketing Budget">
              <input className={input} value={form.monthlyBudget} onChange={e => update('monthlyBudget', e.target.value)} placeholder="e.g. Rs.50,000/month" />
            </Field>
            <Field label="Prohibited Claims or Topics">
              <input className={input} value={form.prohibitedClaims} onChange={e => update('prohibitedClaims', e.target.value)} placeholder="e.g. No guarantees, no competitor bashing" />
            </Field>
          </Section>

          <button onClick={save} disabled={saving || !form.businessName || !form.approvalEmail}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
            {saving ? 'Saving...' : 'Save Brand Settings'}
          </button>
        </div>
      )}

      {/* AI Models Tab */}
      {tab === 'ai-models' && (
        <div className="space-y-6">
          <Section title="Default AI Model">
            <p className="text-gray-400 text-sm mb-4">Choose which Claude model powers your AI agents. Different models balance speed vs capability.</p>
            <div className="space-y-3">
              {SUPPORTED_MODELS.map(m => (
                <label key={m.id} className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${modelSettings.defaultModel === m.id ? 'bg-indigo-950 border-indigo-700' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                  <input type="radio" name="model" value={m.id} checked={modelSettings.defaultModel === m.id}
                    onChange={() => updateModel('defaultModel', m.id)} className="mt-0.5 accent-indigo-500" />
                  <div>
                    <p className="text-white font-medium text-sm">{m.name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </Section>

          <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
            <p className="text-gray-400 text-xs">The selected model is used for all content generation, strategy, campaign, and analytics agents. You can change this at any time — existing generated content is not affected.</p>
          </div>

          <button onClick={save} disabled={saving}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving...' : 'Save Model Preference'}
          </button>
        </div>
      )}

      {/* API Keys Tab */}
      {tab === 'api-keys' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-yellow-950 border border-yellow-800 text-yellow-300 text-sm">
            API keys entered here are stored in your workspace and used by agents to access external services. Keys stored here take precedence over environment variables.
          </div>

          <Section title="Growth & Data Sources">
            <Field label="Brave Search API Key" hint="Enables live trend signals in the Trend Scout agent">
              <input type="password" className={input} value={modelSettings.braveSearchApiKey}
                onChange={e => updateModel('braveSearchApiKey', e.target.value)}
                placeholder="BSA..." />
            </Field>
            <Field label="Google Analytics 4 Property ID" hint="Format: 1234567890">
              <input className={input} value={modelSettings.ga4PropertyId}
                onChange={e => updateModel('ga4PropertyId', e.target.value)}
                placeholder="GA4 Property ID" />
            </Field>
            <Field label="Google Analytics 4 Access Token" hint="Service account access token for GA4 Data API">
              <input type="password" className={input} value={modelSettings.ga4AccessToken}
                onChange={e => updateModel('ga4AccessToken', e.target.value)}
                placeholder="ya29..." />
            </Field>
          </Section>

          <Section title="CRM & Email">
            <Field label="HubSpot Access Token" hint="Enables automatic CRM push after lead qualification">
              <input type="password" className={input} value={modelSettings.hubspotAccessToken}
                onChange={e => updateModel('hubspotAccessToken', e.target.value)}
                placeholder="pat-..." />
            </Field>
            <Field label="Resend API Key" hint="Used for sending email sequences and campaigns">
              <input type="password" className={input} value={modelSettings.resendApiKey}
                onChange={e => updateModel('resendApiKey', e.target.value)}
                placeholder="re_..." />
            </Field>
          </Section>

          <Section title="Social & Webhooks">
            <Field label="Meta Webhook Verify Token" hint="Required to receive real-time Meta comments and DMs">
              <input className={input} value={modelSettings.metaWebhookVerifyToken}
                onChange={e => updateModel('metaWebhookVerifyToken', e.target.value)}
                placeholder="Your chosen verify token" />
            </Field>
          </Section>

          <button onClick={save} disabled={saving}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving...' : 'Save API Keys'}
          </button>
        </div>
      )}

      {/* Account Tab */}
      {tab === 'account' && (
        <div className="space-y-6">
          <Section title="Your Account">
            <Field label="Full Name">
              <input className={input} value={accountName} onChange={e => setAccountName(e.target.value)} />
            </Field>
            <Field label="Email Address">
              <input type="email" className={input} value={accountEmail} onChange={e => setAccountEmail(e.target.value)} />
            </Field>
          </Section>

          <Section title="Change Password">
            <Field label="New Password">
              <input type="password" className={input} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" />
            </Field>
            <Field label="Confirm New Password">
              <input type="password" className={input} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
            </Field>
            <p className="text-gray-600 text-xs">Leave password fields blank to keep your current password.</p>
          </Section>

          <button onClick={saveAccount} disabled={accountSaving}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
            {accountSaving ? 'Saving...' : 'Save Account Changes'}
          </button>

          <div className="pt-4 border-t border-gray-800">
            <button onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              localStorage.clear()
              window.location.href = '/login'
            }} className="px-6 py-3 rounded-lg border border-red-800 text-red-400 hover:bg-red-950 text-sm font-medium transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      <h2 className="text-white font-semibold text-sm border-b border-gray-800 pb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  )
}
