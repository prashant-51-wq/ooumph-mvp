'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CHANNELS = ['Instagram', 'LinkedIn', 'Twitter/X', 'YouTube', 'WhatsApp', 'Email', 'Google Ads', 'Meta Ads'] as const
const TONES = ['Professional', 'Friendly & Conversational', 'Bold & Direct', 'Educational', 'Inspirational', 'Witty & Playful', 'Founder-led / Personal']
const INDUSTRIES = ['SaaS / Tech', 'E-commerce', 'Consulting / Coaching', 'Agency / Services', 'Healthcare', 'Education / EdTech', 'Finance / FinTech', 'Real Estate', 'Food & Beverage', 'Other']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    businessName: '', industry: '', website: '', tagline: '',
    offer: '', uniqueValue: '', targetAudience: '', tone: '',
    competitors: '', channels: [] as string[], goals: '',
    monthlyBudget: '', prohibitedClaims: '', approvalEmail: '',
  })

  const update = (field: string, value: string | string[]) => setForm((f) => ({ ...f, [field]: value }))

  const fillDemo = () => {
    setForm({
      businessName: 'Ooumph',
      industry: 'SaaS / Tech',
      website: 'https://ooumph.com',
      tagline: 'Your AI Marketing Agency OS',
      offer: 'AI-powered marketing automation for SMBs — we replace a full marketing team with autonomous AI agents that generate, plan, and optimize content. Human approval on every output.',
      uniqueValue: 'India-first, 10x cheaper than an agency, fully autonomous agents with human-in-the-loop governance, supports Hinglish and regional campaigns.',
      targetAudience: 'Founders and marketing heads of B2B SaaS companies in India with 10-100 employees, spending ₹50k-5L/month on marketing, frustrated with inconsistent agency results and lack of transparency.',
      tone: 'Bold & Direct',
      competitors: 'Jasper, Copy.ai, HubSpot, traditional agencies',
      channels: ['LinkedIn', 'Instagram', 'Email', 'Twitter/X'],
      goals: 'Get 50 qualified demo requests in 30 days, grow LinkedIn from 200 to 1000 followers, close first 5 paying clients at ₹50k/month each.',
      monthlyBudget: '₹1,00,000/month',
      prohibitedClaims: 'No ROI guarantees, no promises of viral content, no competitor bashing, no aggressive cold outreach without approval.',
      approvalEmail: 'prashant.mishra@ooumph.com',
    })
  }

  const toggleChannel = (ch: string) => {
    const next = form.channels.includes(ch)
      ? form.channels.filter((c) => c !== ch)
      : [...form.channels, ch]
    update('channels', next)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      // Get userId from auth/me so workspace is linked to the logged-in user
      let userId: string | null = null
      try {
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()
        userId = meData.user?.id || null
      } catch { /* ignore — allows demo mode without auth */ }

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, userId }),
      })
      const data = await res.json()
      if (data.workspaceId) {
        localStorage.setItem('workspaceId', data.workspaceId)
        localStorage.setItem('businessName', form.businessName)
        router.push('/dashboard/strategy')
      } else {
        setError(data.error || 'Workspace creation failed. Please try again.')
      }
    } catch (err) {
      console.error(err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= n ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'}`}>{n}</div>
              {n < 3 && <div className={`w-12 h-0.5 ${step > n ? 'bg-indigo-600' : 'bg-gray-800'}`} />}
            </div>
          ))}
          <span className="ml-2 text-gray-500 text-xs">Step {step} of 3</span>
        </div>
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-white">
            {step === 1 && 'Tell us about your business'}
            {step === 2 && 'Your offer and audience'}
            {step === 3 && 'Channels, goals, and preferences'}
          </h1>
          {step === 1 && (
            <button onClick={fillDemo} type="button"
              className="px-3 py-1.5 rounded-lg border border-indigo-700 text-indigo-400 text-xs hover:bg-indigo-950 transition-colors whitespace-nowrap">
              ⚡ Fill Demo Data
            </button>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-1">Your AI marketing team is being briefed. This takes ~5 minutes.</p>
      </div>

      {/* Step 1: Business Basics */}
      {step === 1 && (
        <div className="space-y-5">
          <Field label="Business Name *" required>
            <input className={input} value={form.businessName} onChange={(e) => update('businessName', e.target.value)} placeholder="e.g. Ooumph" />
          </Field>
          <Field label="Industry *">
            <select className={input} value={form.industry} onChange={(e) => update('industry', e.target.value)}>
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Website URL">
            <input className={input} value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://ooumph.com" />
          </Field>
          <Field label="Tagline or Slogan">
            <input className={input} value={form.tagline} onChange={(e) => update('tagline', e.target.value)} placeholder="What's your VIBE?" />
          </Field>
          <Field label="Approval Email (who reviews AI outputs) *">
            <input className={input} type="email" value={form.approvalEmail} onChange={(e) => update('approvalEmail', e.target.value)} placeholder="praveen@ooumph.com" />
          </Field>
          <NavButtons next={() => setStep(2)} canNext={!!form.businessName && !!form.industry && !!form.approvalEmail} />
        </div>
      )}

      {/* Step 2: Offer & Audience */}
      {step === 2 && (
        <div className="space-y-5">
          <Field label="What do you sell / offer? *" hint="Be specific. Include the result/transformation.">
            <textarea className={textarea} value={form.offer} onChange={(e) => update('offer', e.target.value)} placeholder="e.g. AI-powered marketing automation for SMBs in India - replace a full marketing team with autonomous AI agents that generate, publish, and optimize content." rows={3} />
          </Field>
          <Field label="What makes you unique? *" hint="Your unfair advantage vs competitors.">
            <textarea className={textarea} value={form.uniqueValue} onChange={(e) => update('uniqueValue', e.target.value)} placeholder="e.g. India-first, Hinglish support, 10x cheaper than an agency, human approval on every output" rows={3} />
          </Field>
          <Field label="Who is your ideal customer? *" hint="Be specific: their role, company size, pain, situation.">
            <textarea className={textarea} value={form.targetAudience} onChange={(e) => update('targetAudience', e.target.value)} placeholder="e.g. Founders of B2B SaaS companies in India with 10-100 employees, spending Rs.50k-5L/month on marketing, frustrated with inconsistent agency results" rows={3} />
          </Field>
          <Field label="Top 3 competitors">
            <input className={input} value={form.competitors} onChange={(e) => update('competitors', e.target.value)} placeholder="e.g. Hubspot, Jasper, Copy.ai" />
          </Field>
          <NavButtons prev={() => setStep(1)} next={() => setStep(3)} canNext={!!form.offer && !!form.uniqueValue && !!form.targetAudience} />
        </div>
      )}

      {/* Step 3: Channels & Goals */}
      {step === 3 && (
        <div className="space-y-5">
          <Field label="Marketing Channels *" hint="Select all channels you want to use.">
            <div className="flex flex-wrap gap-2 mt-2">
              {CHANNELS.map((ch) => (
                <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.channels.includes(ch) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700'}`}>
                  {ch}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Brand Tone *">
            <select className={input} value={form.tone} onChange={(e) => update('tone', e.target.value)}>
              <option value="">Select tone</option>
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="30-Day Marketing Goal *" hint="What does success look like in 30 days?">
            <textarea className={textarea} value={form.goals} onChange={(e) => update('goals', e.target.value)} placeholder="e.g. Get 50 qualified leads, close 5 clients, grow LinkedIn from 200 to 500 followers, get first Rs.5L in MRR" rows={2} />
          </Field>
          <Field label="Monthly Marketing Budget" hint="Approximate spend on ads, tools, content.">
            <input className={input} value={form.monthlyBudget} onChange={(e) => update('monthlyBudget', e.target.value)} placeholder="e.g. Rs.50,000/month" />
          </Field>
          <Field label="Prohibited Claims or Topics" hint="Anything we should NEVER say.">
            <input className={input} value={form.prohibitedClaims} onChange={(e) => update('prohibitedClaims', e.target.value)} placeholder="e.g. No guarantees, no ROI promises, no competitor bashing" />
          </Field>
          {error && (
            <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>
          )}
          <NavButtons
            prev={() => setStep(2)}
            next={handleSubmit}
            nextLabel={loading ? 'Creating workspace...' : 'Launch AI Agents →'}
            canNext={form.channels.length > 0 && !!form.tone && !!form.goals && !loading}
          />
        </div>
      )}
    </div>
  )
}

const input = 'w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const textarea = 'w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none'

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">
        {label} {required && <span className="text-indigo-400">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

function NavButtons({ prev, next, nextLabel, canNext }: { prev?: () => void; next?: () => void; nextLabel?: string; canNext?: boolean }) {
  return (
    <div className="flex justify-between pt-4">
      {prev ? (
        <button onClick={prev} className="px-5 py-2.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 text-sm transition-colors">
          ← Back
        </button>
      ) : <div />}
      {next && (
        <button onClick={next} disabled={!canNext}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
          {nextLabel || 'Continue →'}
        </button>
      )}
    </div>
  )
}
