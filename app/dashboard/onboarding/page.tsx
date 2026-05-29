'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { clearWorkspaceCache } from '@/lib/hooks/use-workspace-id'

// ─── Constants ────────────────────────────────────────────────────────────────
const INDUSTRIES = ['SaaS', 'E-commerce', 'Local Business', 'Agency', 'Healthcare', 'Real Estate', 'Finance', 'Other']
const BUSINESS_TYPES = ['B2B', 'B2C', 'Both']
const PRIMARY_GOALS = [
  { icon: '🎯', label: 'Generate Leads', value: 'leads' },
  { icon: '📈', label: 'Grow Revenue', value: 'revenue' },
  { icon: '🏆', label: 'Build Brand', value: 'brand' },
  { icon: '🔄', label: 'Retain Customers', value: 'retain' },
  // Sprint 18F (audit pass #5 P2): follower growth was the most-requested
  // missing onboarding goal — the platform already tracks follower metrics
  // and the CMO growth-optimizer agent can pursue this as a first-class
  // strategy, but until now users had to pick a different goal as a proxy.
  { icon: '🌱', label: 'Grow Followers', value: 'followers' },
]
const VOICE_ADJECTIVES = ['Professional', 'Friendly', 'Bold', 'Authoritative', 'Playful', 'Innovative', 'Trustworthy', 'Casual', 'Inspirational', 'Educational']
const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', icon: '📘' },
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
  { id: 'youtube', name: 'YouTube', icon: '▶️' },
  { id: 'google_ads', name: 'Google Ads', icon: '🔍' },
  { id: 'meta_ads', name: 'Meta Ads', icon: '📣' },
  { id: 'email', name: 'Email (Klaviyo)', icon: '📧' },
]
const CONTENT_TYPES = [
  { id: 'blog', label: 'Blog Posts', icon: '📝' },
  { id: 'social', label: 'Social Media', icon: '📱' },
  { id: 'email', label: 'Email Campaigns', icon: '📧' },
  { id: 'ads', label: 'Ad Copy', icon: '📣' },
  { id: 'video', label: 'Video Scripts', icon: '🎬' },
  { id: 'pr', label: 'PR', icon: '📰' },
  { id: 'voice', label: 'Voiceover', icon: '🎙️' },
]
const POSTING_FREQS = ['Daily', '3x/week', 'Weekly', 'Monthly']
const TEAM_ROLES = ['Admin', 'Manager', 'Analyst', 'Viewer']

const STEP_NAMES = ['Setup', 'Brand', 'AI Models', 'Channels', 'Content', 'Team', 'Launch']

// Sprint 16H (P1 #21): structured ICP options.
const COMPANY_SIZES: { value: 'solopreneur' | 'smb' | 'mid-market' | 'enterprise'; label: string }[] = [
  { value: 'solopreneur', label: 'Solopreneur' },
  { value: 'smb', label: 'SMB (2–50)' },
  { value: 'mid-market', label: 'Mid-market (51–500)' },
  { value: 'enterprise', label: 'Enterprise (500+)' },
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamMember { email: string; role: string }

interface WizardState {
  // Step 1
  businessName: string
  industry: string
  businessType: string
  website: string
  description: string
  primaryGoal: string
  // Step 2
  colorPrimary: string
  colorSecondary: string
  colorAccent: string
  voiceAdjectives: string[]
  toneExampleSocial: string
  toneExampleEmail: string
  toneExampleCTA: string
  ageMin: number
  ageMax: number
  painPoints: string
  jobTitles: string[]
  jobTitleInput: string
  // Sprint 16H (P1 #15): logo upload state.
  logoUrl: string
  logoUploading: boolean
  // Sprint 16H (P1 #16): competitor tag list (was hardcoded empty before).
  competitors: string[]
  competitorInput: string
  // Sprint 16H (P1 #21): structured ICP collection.
  icpIndustries: string[]
  icpIndustryInput: string
  icpJobRoles: string[]
  icpJobRoleInput: string
  icpCompanySize: '' | 'solopreneur' | 'smb' | 'mid-market' | 'enterprise'
  icpGeos: string[]
  icpGeoInput: string
  // Step 3
  useSharedKeys: boolean
  openaiKey: string
  anthropicKey: string
  elevenlabsKey: string
  modelQuality: number
  aiBudget: string
  // Step 4
  connectedChannels: string[]
  // Step 5
  contentTypes: string[]
  postingFreq: Record<string, string>
  contentTopics: string[]
  contentTopicInput: string
  brandKeywords: string[]
  brandKeywordInput: string
  avoidKeywords: string[]
  avoidKeywordInput: string
  // Step 6
  teamMembers: TeamMember[]
}

const defaultState: WizardState = {
  businessName: '', industry: '', businessType: '', website: '', description: '', primaryGoal: '',
  colorPrimary: '#6366f1', colorSecondary: '#8b5cf6', colorAccent: '#06b6d4',
  voiceAdjectives: [], toneExampleSocial: '', toneExampleEmail: '', toneExampleCTA: '',
  ageMin: 25, ageMax: 45, painPoints: '', jobTitles: [], jobTitleInput: '',
  logoUrl: '', logoUploading: false,
  competitors: [], competitorInput: '',
  icpIndustries: [], icpIndustryInput: '',
  icpJobRoles: [], icpJobRoleInput: '',
  icpCompanySize: '',
  icpGeos: [], icpGeoInput: '',
  useSharedKeys: true, openaiKey: '', anthropicKey: '', elevenlabsKey: '',
  modelQuality: 70, aiBudget: '',
  connectedChannels: [],
  contentTypes: [], postingFreq: {}, contentTopics: [], contentTopicInput: '',
  brandKeywords: [], brandKeywordInput: '', avoidKeywords: [], avoidKeywordInput: '',
  teamMembers: [{ email: '', role: 'Manager' }],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cls = (...args: (string | false | undefined)[]) => args.filter(Boolean).join(' ')
const inp = 'w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
const textarea = 'w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none'

// ─── Component ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WizardState>(defaultState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward')
  const [visible, setVisible] = useState(true)

  // Auto-save to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('onboarding_progress')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.form) setForm({ ...defaultState, ...parsed.form, logoUploading: false })
        if (parsed.step) setStep(parsed.step)
        if (parsed.completedSteps) setCompletedSteps(parsed.completedSteps)
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    // Sprint 17G (audit pass #3 P2 #31): never persist transient upload
    // state to localStorage. If the user navigates away mid-upload, hydration
    // would restore `logoUploading: true` and freeze the UI forever. Strip
    // it here so the persisted snapshot is always upload-idle.
    const { logoUploading: _ignored, ...persistable } = form
    void _ignored
    localStorage.setItem('onboarding_progress', JSON.stringify({ form: persistable, step, completedSteps }))
  }, [form, step, completedSteps])

  const update = (patch: Partial<WizardState>) => setForm(f => ({ ...f, ...patch }))

  const goTo = (n: number) => {
    setAnimDir(n > step ? 'forward' : 'back')
    setVisible(false)
    setTimeout(() => {
      if (!completedSteps.includes(step)) setCompletedSteps(c => [...c, step])
      setStep(n)
      setVisible(true)
    }, 150)
  }

  const next = () => goTo(step + 1)
  const back = () => goTo(step - 1)

  const toggleArr = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  const addTag = (field: keyof WizardState, inputField: keyof WizardState, arr: string[]) => {
    const val = (form[inputField] as string).trim()
    if (val && !arr.includes(val)) {
      update({ [field]: [...arr, val], [inputField]: '' } as Partial<WizardState>)
    }
  }

  const removeTag = (field: keyof WizardState, arr: string[], val: string) =>
    update({ [field]: arr.filter(x => x !== val) } as Partial<WizardState>)

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Resolve the authenticated user (for workspace ownership)
      let userId: string | null = null
      let approvalEmail: string | null = null
      try {
        const me = await fetch('/api/auth/me')
        const d = await me.json()
        userId = d.user?.id || null
        approvalEmail = d.user?.email || null
      } catch { /* allow demo flow */ }

      // 2. Map the 7-step wizard state → full workspace + brand_profile payload
      const goalsArray: string[] = []
      if (form.primaryGoal) goalsArray.push(form.primaryGoal)
      if (form.contentTopics.length) goalsArray.push(...form.contentTopics)
      const tone = form.voiceAdjectives.join(', ') || ''
      // Sprint 17G (audit pass #3 P2 #28): painPoints is now stored ONLY
      // in icp_json.painPoints. Previously it was duplicated into the free-
      // text target_audience too — edits on one diverged from the other.
      // Strategy/research agents read either column, with icp_json taking
      // precedence (it's the structured source of truth).
      const targetAudience = [
        form.jobTitles.length ? `Job titles: ${form.jobTitles.join(', ')}` : null,
        form.ageMin && form.ageMax ? `Age: ${form.ageMin}-${form.ageMax}` : null,
      ].filter(Boolean).join(' | ')

      // Sprint 16H (P1 #21): structured ICP payload that the PATCH below
      // persists to brand_profiles.icp_json.
      const icpJson = {
        industries: form.icpIndustries,
        jobRoles: form.icpJobRoles,
        companySize: form.icpCompanySize,
        geos: form.icpGeos,
        painPoints: form.painPoints,
      }
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          industry: form.industry,
          website: form.website,
          // brand_profile fields
          tagline: form.toneExampleCTA || '',
          offer: form.description || '',
          uniqueValue: form.description || '',
          targetAudience,
          tone,
          // Sprint 16H (P1 #16): real competitors list, no longer hardcoded ''.
          competitors: form.competitors.join(','),
          channels: form.connectedChannels.join(','),
          goals: goalsArray.join(', '),
          monthlyBudget: form.aiBudget || '',
          prohibitedClaims: '',
          approvalEmail: approvalEmail || '',
          userId,
        }),
      })
      const data = await res.json()
      if (!data.workspaceId) {
        setError(data.error || 'Workspace creation failed. Please try again.')
        return
      }
      const workspaceId = data.workspaceId as string
      localStorage.setItem('workspaceId', workspaceId)
      localStorage.setItem('businessName', form.businessName)

      // 3. Persist BYOK keys (if user opted out of shared keys)
      if (!form.useSharedKeys) {
        const byokKeys: Array<{ provider: string; key: string }> = []
        if (form.openaiKey?.trim()) byokKeys.push({ provider: 'openai', key: form.openaiKey.trim() })
        if (form.anthropicKey?.trim()) byokKeys.push({ provider: 'anthropic', key: form.anthropicKey.trim() })
        if (form.elevenlabsKey?.trim()) byokKeys.push({ provider: 'elevenlabs', key: form.elevenlabsKey.trim() })
        await Promise.allSettled(
          byokKeys.map(b =>
            fetch('/api/workspace-secrets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, provider: b.provider, key: b.key }),
            })
          )
        )
      }

      // 4. Persist extra settings (model preferences, content prefs) into workspace
      try {
        await fetch('/api/workspaces', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            businessName: form.businessName,
            industry: form.industry,
            website: form.website,
            tagline: form.toneExampleCTA || '',
            offer: form.description || '',
            uniqueValue: form.description || '',
            targetAudience,
            tone,
            // Sprint 16H (P1 #16): persist competitors on PATCH too.
            competitors: form.competitors.join(','),
            channels: form.connectedChannels.join(','),
            goals: goalsArray.join(', '),
            monthlyBudget: form.aiBudget || '',
            prohibitedClaims: '',
            approvalEmail: approvalEmail || '',
            // Sprint 16H (P1 #15, #21): logo + structured ICP end-to-end.
            logoUrl: form.logoUrl || '',
            icpJson,
            modelSettings: {
              defaultModel: form.modelQuality > 60 ? 'claude-sonnet-4-6' : 'claude-3-5-haiku-20241022',
            },
            extraSettings: {
              businessType: form.businessType,
              primaryGoal: form.primaryGoal,
              brandColors: {
                primary: form.colorPrimary,
                secondary: form.colorSecondary,
                accent: form.colorAccent,
              },
              voiceAdjectives: form.voiceAdjectives,
              toneExamples: {
                social: form.toneExampleSocial,
                email: form.toneExampleEmail,
                cta: form.toneExampleCTA,
              },
              contentTypes: form.contentTypes,
              postingFreq: form.postingFreq,
              contentTopics: form.contentTopics,
              brandKeywords: form.brandKeywords,
              avoidKeywords: form.avoidKeywords || [],
              aiBudget: form.aiBudget,
              modelQuality: form.modelQuality,
              useSharedKeys: form.useSharedKeys,
              onboardedAt: new Date().toISOString(),
            },
          }),
        })
      } catch { /* non-blocking — workspace is already created */ }

      // 5. Send team invites (if user added any)
      if (form.teamMembers && form.teamMembers.length > 0) {
        await Promise.allSettled(
          form.teamMembers
            .filter(m => m.email?.trim())
            .map(m =>
              fetch('/api/team/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId, email: m.email.trim(), role: m.role.toLowerCase() }),
              })
            )
        )
      }

      // Sprint 15F (P0 #8): persist the onboarding_completed_at flag so a
      // mid-wizard refresh in a future visit doesn't relaunch the wizard.
      try {
        await fetch('/api/workspaces', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingStep: 7,
          }),
        })
      } catch { /* non-fatal */ }

      localStorage.removeItem('onboarding_progress')
      // Sprint 18N (user-reported infinite redirect): useWorkspaceId
      // caches /api/auth/me for 60s in a module-level variable. Without
      // this cache bust the dashboard layout reads the stale
      // onboardingCompletedAt: null and redirects right back to the
      // wizard. Clear before navigating so the next /me hits the wire.
      clearWorkspaceCache()
      router.push('/dashboard')
    } catch (err) {
      console.error('[onboarding] launch failed:', err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const pct = Math.round(((step - 1) / 6) * 100)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      {/* Progress header */}
      <div className="w-full max-w-5xl mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 font-medium">Step {step} of 7 · {pct}% complete</span>
          <span className="text-xs text-indigo-400 font-medium">{STEP_NAMES[step - 1]}</span>
        </div>
        {/* Step circles */}
        <div className="flex items-center gap-0">
          {STEP_NAMES.map((name, i) => {
            const n = i + 1
            const done = completedSteps.includes(n)
            const active = step === n
            return (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => completedSteps.includes(n) || n < step ? goTo(n) : undefined}
                  className={cls(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0',
                    done && 'bg-green-600 text-white',
                    active && !done && 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 ring-offset-gray-950',
                    !done && !active && 'bg-gray-800 text-gray-500',
                  )}
                  title={name}
                >
                  {done ? '✓' : n}
                </button>
                {i < 6 && (
                  <div className={cls('h-0.5 flex-1 mx-1 transition-all', (done || step > n) ? 'bg-green-600' : 'bg-gray-800')} />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {STEP_NAMES.map((name, i) => (
            <span key={i} className={cls('text-[10px] font-medium', step === i + 1 ? 'text-indigo-400' : 'text-gray-600')}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Main layout: form + side panel */}
      <div
        className="w-full max-w-5xl flex gap-6 transition-all duration-150"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : animDir === 'forward' ? 'translateX(20px)' : 'translateX(-20px)' }}
      >
        {/* Form panel */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-8 min-h-[520px] flex flex-col">
          {step === 1 && <Step1 form={form} update={update} next={next} toggleArr={toggleArr} />}
          {step === 2 && <Step2 form={form} update={update} next={next} back={back} toggleArr={toggleArr} addTag={addTag} removeTag={removeTag} />}
          {step === 3 && <Step3 form={form} update={update} next={next} back={back} />}
          {step === 4 && <Step4 form={form} update={update} next={next} back={back} toggleArr={toggleArr} />}
          {step === 5 && <Step5 form={form} update={update} next={next} back={back} toggleArr={toggleArr} addTag={addTag} removeTag={removeTag} />}
          {step === 6 && <Step6 form={form} update={update} next={next} back={back} />}
          {step === 7 && <Step7 form={form} loading={loading} error={error} onLaunch={handleLaunch} back={back} router={router} />}
        </div>

        {/* Right preview panel */}
        <div className="w-72 shrink-0 hidden lg:block">
          <SidePanel step={step} form={form} />
        </div>
      </div>
    </div>
  )
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
function Step1({ form, update, next, toggleArr }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  toggleArr: (arr: string[], val: string) => string[]
}) {
  const canNext = !!form.businessName && !!form.industry
  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Welcome to Ooumph 👋</h1>
        <p className="text-gray-400 text-sm mt-1">Let&apos;s get your AI marketing workforce ready in 5 minutes.</p>
      </div>
      <div className="space-y-4 flex-1">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Business Name *">
            <input className={inp} value={form.businessName} onChange={e => update({ businessName: e.target.value })} placeholder="e.g. Acme Corp" />
          </Field>
          <Field label="Industry *">
            <select className={inp} value={form.industry} onChange={e => update({ industry: e.target.value })}>
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Business Type">
          <div className="flex gap-2 mt-1">
            {BUSINESS_TYPES.map(bt => (
              <button key={bt} type="button"
                onClick={() => update({ businessType: bt })}
                className={cls('px-4 py-2 rounded-lg text-sm font-medium border transition-all', form.businessType === bt ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600')}
              >{bt}</button>
            ))}
          </div>
        </Field>

        <Field label="Website URL">
          <input className={inp} value={form.website} onChange={e => update({ website: e.target.value })} placeholder="https://yoursite.com" />
        </Field>

        <Field label="Business Description" hint="Tell us about your business, what you do, and who you serve.">
          <textarea className={textarea} rows={3} value={form.description} onChange={e => update({ description: e.target.value })} placeholder="Tell us about your business..." />
        </Field>

        <Field label="Primary Goal">
          <div className="grid grid-cols-2 gap-2 mt-1">
            {PRIMARY_GOALS.map(g => (
              <button key={g.value} type="button"
                onClick={() => update({ primaryGoal: g.value })}
                className={cls('flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all', form.primaryGoal === g.value ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600')}
              >
                <span>{g.icon}</span>{g.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <NavBtns next={next} canNext={canNext} />
    </div>
  )
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────
function Step2({ form, update, next, back, toggleArr, addTag, removeTag }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  back: () => void
  toggleArr: (arr: string[], val: string) => string[]
  addTag: (field: keyof WizardState, inputField: keyof WizardState, arr: string[]) => void
  removeTag: (field: keyof WizardState, arr: string[], val: string) => void
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Brand Identity</h1>
        <p className="text-gray-400 text-sm mt-1">Set up your brand so your AI agents always stay on-brand.</p>
      </div>
      <div className="space-y-5 flex-1 overflow-y-auto pr-1">
        {/* Brand Colors */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Brand Colors</label>
          <div className="flex gap-3">
            {([
              { label: 'Primary', key: 'colorPrimary' },
              { label: 'Secondary', key: 'colorSecondary' },
              { label: 'Accent', key: 'colorAccent' },
            ] as { label: string; key: keyof WizardState }[]).map(({ label, key }) => (
              <div key={key} className="flex-1">
                <p className="text-xs text-gray-500 mb-1.5">{label}</p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
                  <input type="color" value={form[key] as string} onChange={e => update({ [key]: e.target.value } as Partial<WizardState>)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                  <input className="flex-1 bg-transparent text-white text-xs font-mono focus:outline-none" value={form[key] as string} onChange={e => update({ [key]: e.target.value } as Partial<WizardState>)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Brand Logo — Sprint 16H (P1 #15): real file input + Cloudinary upload */}
        <Field label="Brand Logo">
          <LogoUploader form={form} update={update} />
        </Field>

        {/* Voice adjectives */}
        <Field label="Brand Voice">
          <div className="flex flex-wrap gap-2 mt-1">
            {VOICE_ADJECTIVES.map(v => (
              <button key={v} type="button"
                onClick={() => update({ voiceAdjectives: toggleArr(form.voiceAdjectives, v) })}
                className={cls('px-3 py-1 rounded-full text-xs font-medium border transition-all', form.voiceAdjectives.includes(v) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-600 hover:text-white')}
              >{v}</button>
            ))}
          </div>
        </Field>

        {/* Tone examples */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Tone Examples</label>
          <div className="space-y-2">
            <textarea className={textarea} rows={2} placeholder="Social post example..." value={form.toneExampleSocial} onChange={e => update({ toneExampleSocial: e.target.value })} />
            <textarea className={textarea} rows={2} placeholder="Email subject line example..." value={form.toneExampleEmail} onChange={e => update({ toneExampleEmail: e.target.value })} />
            <textarea className={textarea} rows={2} placeholder="CTA button text example..." value={form.toneExampleCTA} onChange={e => update({ toneExampleCTA: e.target.value })} />
          </div>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">Target Audience</label>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-2">Age Range: {form.ageMin}–{form.ageMax}</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-6">18</span>
                <input type="range" min={18} max={65} value={form.ageMin} onChange={e => update({ ageMin: Number(e.target.value) })} className="flex-1 accent-indigo-500" />
                <input type="range" min={18} max={65} value={form.ageMax} onChange={e => update({ ageMax: Number(e.target.value) })} className="flex-1 accent-indigo-500" />
                <span className="text-xs text-gray-500 w-6">65</span>
              </div>
            </div>
            <textarea className={textarea} rows={2} placeholder="Pain points..." value={form.painPoints} onChange={e => update({ painPoints: e.target.value })} />
            <TagInput
              label="Job Titles"
              tags={form.jobTitles}
              inputValue={form.jobTitleInput}
              onInputChange={v => update({ jobTitleInput: v })}
              onAdd={() => addTag('jobTitles', 'jobTitleInput', form.jobTitles)}
              onRemove={v => removeTag('jobTitles', form.jobTitles, v)}
              placeholder="Add job title, press Enter"
            />
          </div>
        </div>

        {/* Sprint 16H (P1 #16): real competitor capture */}
        <TagInput
          label="Competitors"
          tags={form.competitors}
          inputValue={form.competitorInput}
          onInputChange={v => update({ competitorInput: v })}
          onAdd={() => addTag('competitors', 'competitorInput', form.competitors)}
          onRemove={v => removeTag('competitors', form.competitors, v)}
          placeholder="Add competitor name, press Enter"
        />

        {/* Sprint 16H (P1 #21): structured Ideal Customer Profile */}
        <div className="pt-2 border-t border-gray-800">
          <label className="block text-sm font-medium text-gray-200 mb-1">Ideal Customer Profile</label>
          <p className="text-xs text-gray-500 mb-3">Help your AI agents target the right buyers.</p>
          <div className="space-y-3">
            <TagInput
              label="Industries"
              tags={form.icpIndustries}
              inputValue={form.icpIndustryInput}
              onInputChange={v => update({ icpIndustryInput: v })}
              onAdd={() => addTag('icpIndustries', 'icpIndustryInput', form.icpIndustries)}
              onRemove={v => removeTag('icpIndustries', form.icpIndustries, v)}
              placeholder="e.g. SaaS, Healthcare — press Enter"
            />
            <TagInput
              label="Job Roles / Titles"
              tags={form.icpJobRoles}
              inputValue={form.icpJobRoleInput}
              onInputChange={v => update({ icpJobRoleInput: v })}
              onAdd={() => addTag('icpJobRoles', 'icpJobRoleInput', form.icpJobRoles)}
              onRemove={v => removeTag('icpJobRoles', form.icpJobRoles, v)}
              placeholder="e.g. Head of Marketing, CTO — press Enter"
            />
            <Field label="Company Size">
              <div className="flex flex-wrap gap-2 mt-1">
                {COMPANY_SIZES.map(cs => (
                  <button key={cs.value} type="button"
                    onClick={() => update({ icpCompanySize: form.icpCompanySize === cs.value ? '' : cs.value })}
                    className={cls('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all', form.icpCompanySize === cs.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-600')}
                  >{cs.label}</button>
                ))}
              </div>
            </Field>
            <TagInput
              label="Geography"
              tags={form.icpGeos}
              inputValue={form.icpGeoInput}
              onInputChange={v => update({ icpGeoInput: v })}
              onAdd={() => addTag('icpGeos', 'icpGeoInput', form.icpGeos)}
              onRemove={v => removeTag('icpGeos', form.icpGeos, v)}
              placeholder="e.g. North America, EU — press Enter"
            />
          </div>
        </div>
      </div>
      <NavBtns next={next} back={back} canNext={true} />
    </div>
  )
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────
function Step3({ form, update, next, back }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  back: () => void
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">AI Model Setup</h1>
        <p className="text-gray-400 text-sm mt-1">Connect your AI models — or use shared keys to get started fast.</p>
      </div>
      <div className="space-y-5 flex-1">
        {/* Shared keys toggle */}
        <div className={cls('p-4 rounded-xl border-2 cursor-pointer transition-all', form.useSharedKeys ? 'border-indigo-500 bg-indigo-600/10' : 'border-gray-700 bg-gray-800')}
          onClick={() => update({ useSharedKeys: true })}>
          <div className="flex items-center gap-3">
            <div className={cls('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0', form.useSharedKeys ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600')}>
              {form.useSharedKeys && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-white text-sm font-medium">Use Ooumph Shared Keys (recommended)</p>
              <p className="text-xs text-gray-400 mt-0.5">Get started instantly. Shared rate limits apply — upgrade to bring your own keys for unlimited access.</p>
            </div>
          </div>
        </div>

        <div className={cls('p-4 rounded-xl border-2 cursor-pointer transition-all', !form.useSharedKeys ? 'border-indigo-500 bg-indigo-600/10' : 'border-gray-700 bg-gray-800')}
          onClick={() => update({ useSharedKeys: false })}>
          <div className="flex items-center gap-3">
            <div className={cls('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0', !form.useSharedKeys ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600')}>
              {!form.useSharedKeys && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <p className="text-white text-sm font-medium">Use My Own API Keys (BYOK)</p>
          </div>
        </div>

        {!form.useSharedKeys && (
          <div className="space-y-3 pl-2">
            {([
              { label: 'OpenAI API Key', key: 'openaiKey', placeholder: 'sk-...' },
              { label: 'Anthropic API Key', key: 'anthropicKey', placeholder: 'sk-ant-...' },
              { label: 'ElevenLabs API Key (optional)', key: 'elevenlabsKey', placeholder: 'xi-...' },
            ] as { label: string; key: keyof WizardState; placeholder: string }[]).map(({ label, key, placeholder }) => (
              <Field key={key} label={label}>
                <input type="password" className={inp} value={form[key] as string} onChange={e => update({ [key]: e.target.value } as Partial<WizardState>)} placeholder={placeholder} />
              </Field>
            ))}
            <button className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 transition-colors">
              Test All Connections
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Model Preference</label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-12">Quality</span>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-blue-400">🔵</span>
              <input type="range" min={0} max={100} value={form.modelQuality} onChange={e => update({ modelQuality: Number(e.target.value) })} className="flex-1 accent-indigo-500" />
              <span className="text-gray-500">⚪</span>
            </div>
            <span className="text-xs text-gray-400 w-12 text-right">Speed</span>
          </div>
        </div>

        <Field label="Monthly AI Budget Cap" hint="We'll warn you when approaching this limit.">
          <input className={inp} value={form.aiBudget} onChange={e => update({ aiBudget: e.target.value })} placeholder="e.g. $100" />
        </Field>
      </div>
      <NavBtns next={next} back={back} canNext={true} />
    </div>
  )
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────
function Step4({ form, update, next, back, toggleArr }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  back: () => void
  toggleArr: (arr: string[], val: string) => string[]
}) {
  const connectedCount = form.connectedChannels.length
  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Connect Channels</h1>
          <p className="text-gray-400 text-sm mt-1">Connect your social and marketing channels.</p>
        </div>
        {connectedCount > 0 && (
          <span className="px-3 py-1 rounded-full bg-green-600/20 text-green-400 text-xs font-semibold border border-green-700">
            {connectedCount} connected
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 flex-1">
        {PLATFORMS.map(p => {
          const connected = form.connectedChannels.includes(p.id)
          return (
            <button key={p.id} type="button"
              onClick={() => update({ connectedChannels: toggleArr(form.connectedChannels, p.id) })}
              className={cls('flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-medium transition-all', connected ? 'border-green-500 bg-green-600/10 text-green-300' : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-indigo-600 hover:text-white')}
            >
              <span className="text-2xl">{p.icon}</span>
              <span className="text-xs">{p.name}</span>
              {connected ? <span className="text-[10px] text-green-400">✅ Connected</span> : <span className="text-[10px] text-indigo-400">Connect</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-4">
        <button type="button" onClick={next} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Skip for now →
        </button>
      </div>
      <NavBtns next={next} back={back} canNext={true} />
    </div>
  )
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────
function Step5({ form, update, next, back, toggleArr, addTag, removeTag }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  back: () => void
  toggleArr: (arr: string[], val: string) => string[]
  addTag: (field: keyof WizardState, inputField: keyof WizardState, arr: string[]) => void
  removeTag: (field: keyof WizardState, arr: string[], val: string) => void
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Content Preferences</h1>
        <p className="text-gray-400 text-sm mt-1">Tell your AI agents what content to create.</p>
      </div>
      <div className="space-y-5 flex-1 overflow-y-auto pr-1">
        {/* Content types */}
        <Field label="Content Types">
          <div className="flex flex-wrap gap-2 mt-1">
            {CONTENT_TYPES.map(ct => (
              <button key={ct.id} type="button"
                onClick={() => update({ contentTypes: toggleArr(form.contentTypes, ct.id) })}
                className={cls('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all', form.contentTypes.includes(ct.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-indigo-600 hover:text-white')}
              >
                <span>{ct.icon}</span>{ct.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Posting frequency per connected channel */}
        {form.connectedChannels.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">Posting Frequency</label>
            <div className="space-y-2">
              {form.connectedChannels.slice(0, 4).map(chId => {
                const ch = PLATFORMS.find(p => p.id === chId)
                return ch ? (
                  <div key={chId} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-28">{ch.icon} {ch.name}</span>
                    <select className={cls(inp, 'flex-1')} value={form.postingFreq[chId] || ''} onChange={e => update({ postingFreq: { ...form.postingFreq, [chId]: e.target.value } })}>
                      <option value="">Select frequency</option>
                      {POSTING_FREQS.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}

        <TagInput label="Content Topics" tags={form.contentTopics} inputValue={form.contentTopicInput} onInputChange={v => update({ contentTopicInput: v })} onAdd={() => addTag('contentTopics', 'contentTopicInput', form.contentTopics)} onRemove={v => removeTag('contentTopics', form.contentTopics, v)} placeholder="Add topic, press Enter" />
        <TagInput label="Brand Keywords (always include)" tags={form.brandKeywords} inputValue={form.brandKeywordInput} onInputChange={v => update({ brandKeywordInput: v })} onAdd={() => addTag('brandKeywords', 'brandKeywordInput', form.brandKeywords)} onRemove={v => removeTag('brandKeywords', form.brandKeywords, v)} placeholder="Add keyword, press Enter" />
        <TagInput label="Keywords/Competitors to Avoid" tags={form.avoidKeywords} inputValue={form.avoidKeywordInput} onInputChange={v => update({ avoidKeywordInput: v })} onAdd={() => addTag('avoidKeywords', 'avoidKeywordInput', form.avoidKeywords)} onRemove={v => removeTag('avoidKeywords', form.avoidKeywords, v)} placeholder="Add keyword to avoid, press Enter" />
      </div>
      <NavBtns next={next} back={back} canNext={true} />
    </div>
  )
}

// ─── Step 6 ───────────────────────────────────────────────────────────────────
function Step6({ form, update, next, back }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
  next: () => void
  back: () => void
}) {
  const addMember = () => {
    if (form.teamMembers.length >= 5) return
    update({ teamMembers: [...form.teamMembers, { email: '', role: 'Viewer' }] })
  }
  const removeMember = (i: number) => update({ teamMembers: form.teamMembers.filter((_, idx) => idx !== i) })
  const updateMember = (i: number, patch: Partial<TeamMember>) => {
    const next = [...form.teamMembers]
    next[i] = { ...next[i], ...patch }
    update({ teamMembers: next })
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Invite Your Team</h1>
        <p className="text-gray-400 text-sm mt-1">Optional — you can always do this later from Settings.</p>
      </div>
      <div className="space-y-3 flex-1">
        {form.teamMembers.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={cls(inp, 'flex-1')} type="email" placeholder="team@company.com" value={m.email} onChange={e => updateMember(i, { email: e.target.value })} />
            <select className={cls(inp, 'w-32')} value={m.role} onChange={e => updateMember(i, { role: e.target.value })}>
              {TEAM_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            {form.teamMembers.length > 1 && (
              <button type="button" onClick={() => removeMember(i)} className="text-gray-500 hover:text-red-400 transition-colors text-sm">✕</button>
            )}
          </div>
        ))}
        {form.teamMembers.length < 5 && (
          <button type="button" onClick={addMember} className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">
            + Add Another
          </button>
        )}
        <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/40 text-blue-300 text-xs mt-2">
          Your team will get an email invitation to join your workspace.
        </div>
      </div>
      <div className="mt-3">
        <button type="button" onClick={next} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Skip for now →
        </button>
      </div>
      <NavBtns next={next} back={back} canNext={true} />
    </div>
  )
}

// ─── Step 7 ───────────────────────────────────────────────────────────────────
function Step7({ form, loading, error, onLaunch, back, router }: {
  form: WizardState
  loading: boolean
  error: string
  onLaunch: () => void
  back: () => void
  router: ReturnType<typeof useRouter>
}) {
  const channelNames = form.connectedChannels.map(id => PLATFORMS.find(p => p.id === id)?.name).filter(Boolean)
  const teamFilled = form.teamMembers.some(m => m.email.trim())

  const summaryItems = [
    { ok: !!form.businessName, label: `Workspace: ${form.businessName || '—'} (${[form.industry, form.businessType].filter(Boolean).join(' · ') || '—'})` },
    { ok: form.voiceAdjectives.length > 0 || !!form.colorPrimary, label: 'Brand identity configured' },
    { ok: true, label: form.useSharedKeys ? 'AI Models: Shared keys (upgrade anytime)' : 'AI Models: Own API keys connected' },
    { ok: channelNames.length > 0, label: channelNames.length > 0 ? `Channels: ${channelNames.slice(0, 3).join(', ')}${channelNames.length > 3 ? ' +more' : ''}` : 'Channels: None connected yet' },
    { ok: form.contentTypes.length > 0, label: `Content: ${form.contentTypes.length} types · ${form.contentTopics.length} topics configured` },
    { ok: teamFilled, warn: !teamFilled, label: teamFilled ? 'Team: Invitations sent' : 'Team: No members invited yet' },
  ]

  return (
    <div className="flex flex-col flex-1">
      <div className="text-center mb-8">
        <div className="text-6xl mb-3">🚀</div>
        <h1 className="text-2xl font-bold text-white">Your workspace is ready!</h1>
        <p className="text-gray-400 text-sm mt-1">Everything is configured. Let&apos;s launch your AI marketing workforce.</p>
      </div>

      {/* Summary card */}
      <div className="bg-gray-800 rounded-xl p-4 mb-5 space-y-2">
        {summaryItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className={item.ok ? 'text-green-400' : 'text-yellow-500'}>{item.ok ? '✅' : '⚠'}</span>
            <span className={item.ok ? 'text-gray-200' : 'text-yellow-300'}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* What happens next */}
      <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-4 mb-5">
        <p className="text-white text-sm font-medium mb-2">What happens next</p>
        <ul className="space-y-1.5 text-sm text-indigo-200">
          <li>• Your CMO Agent will brief you on your first strategy</li>
          <li>• AI agents are standing by to generate content</li>
          <li>• Check Approvals before anything goes live</li>
        </ul>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      <div className="mt-auto space-y-3">
        <button onClick={onLaunch} disabled={loading}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-base font-semibold transition-colors">
          {loading ? 'Setting up workspace...' : '🚀 Go to Dashboard'}
        </button>
        <button onClick={() => router.push('/dashboard/onboarding/checklist')} type="button"
          className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium transition-colors">
          📋 View Onboarding Checklist
        </button>
        <button type="button" onClick={back} className="w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors">
          ← Back to review
        </button>
      </div>
    </div>
  )
}

// ─── Side Panel ───────────────────────────────────────────────────────────────
function SidePanel({ step, form }: { step: number; form: WizardState }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 h-full">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-4">Preview</p>
      {step === 1 && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500">Business</p>
            <p className="text-white text-sm font-semibold mt-0.5">{form.businessName || 'Your Business'}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500">Industry</p>
            <p className="text-white text-sm mt-0.5">{form.industry || '—'}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500">Type · Goal</p>
            <p className="text-white text-sm mt-0.5">{[form.businessType, form.primaryGoal].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          {form.website && (
            <div className="p-3 rounded-lg bg-gray-800">
              <p className="text-xs text-gray-500">Website</p>
              <p className="text-indigo-400 text-xs mt-0.5 truncate">{form.website}</p>
            </div>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500 mb-2">Brand Colors</p>
            <div className="flex gap-2">
              {[form.colorPrimary, form.colorSecondary, form.colorAccent].map((c, i) => (
                <div key={i} className="w-8 h-8 rounded-lg border border-gray-700" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {form.voiceAdjectives.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-800">
              <p className="text-xs text-gray-500 mb-2">Voice</p>
              <div className="flex flex-wrap gap-1">
                {form.voiceAdjectives.map(v => <span key={v} className="px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 text-[10px]">{v}</span>)}
              </div>
            </div>
          )}
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500">Age Range</p>
            <p className="text-white text-sm mt-0.5">{form.ageMin}–{form.ageMax} years</p>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500">Keys</p>
            <p className="text-white text-sm mt-0.5">{form.useSharedKeys ? '✓ Shared (Ooumph)' : '✓ Own API keys'}</p>
          </div>
          <div className="p-3 rounded-lg bg-gray-800">
            <p className="text-xs text-gray-500 mb-1">Model preference</p>
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${form.modelQuality}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>Quality</span><span>Speed</span></div>
          </div>
          {form.aiBudget && (
            <div className="p-3 rounded-lg bg-gray-800">
              <p className="text-xs text-gray-500">Monthly cap</p>
              <p className="text-white text-sm mt-0.5">{form.aiBudget}</p>
            </div>
          )}
        </div>
      )}
      {step === 4 && (
        <div className="space-y-2">
          {PLATFORMS.map(p => (
            <div key={p.id} className={cls('flex items-center gap-2 p-2 rounded-lg text-xs', form.connectedChannels.includes(p.id) ? 'bg-green-900/30 text-green-300' : 'bg-gray-800 text-gray-600')}>
              <span>{p.icon}</span>
              <span>{p.name}</span>
              {form.connectedChannels.includes(p.id) && <span className="ml-auto">✓</span>}
            </div>
          ))}
        </div>
      )}
      {step === 5 && (
        <div className="space-y-3">
          {form.contentTypes.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-800">
              <p className="text-xs text-gray-500 mb-2">Content Types</p>
              <div className="flex flex-wrap gap-1">
                {form.contentTypes.map(ct => {
                  const found = CONTENT_TYPES.find(c => c.id === ct)
                  return found ? <span key={ct} className="px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 text-[10px]">{found.icon} {found.label}</span> : null
                })}
              </div>
            </div>
          )}
          {form.contentTopics.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-800">
              <p className="text-xs text-gray-500 mb-2">Topics</p>
              <div className="flex flex-wrap gap-1">
                {form.contentTopics.map(t => <span key={t} className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-[10px]">{t}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
      {step === 6 && (
        <div className="space-y-2">
          {form.teamMembers.filter(m => m.email).map((m, i) => (
            <div key={i} className="p-2 rounded-lg bg-gray-800 text-xs">
              <p className="text-white truncate">{m.email}</p>
              <p className="text-gray-500">{m.role}</p>
            </div>
          ))}
          {!form.teamMembers.some(m => m.email) && (
            <p className="text-gray-600 text-xs">No team members added yet</p>
          )}
        </div>
      )}
      {step === 7 && (
        <div className="space-y-2 text-xs text-gray-400">
          <div className="p-3 rounded-lg bg-green-900/20 border border-green-800/30">
            <p className="text-green-400 font-medium">Setup complete ✓</p>
            <p className="mt-1 text-gray-400">Your AI agents are ready to deploy</p>
          </div>
          <p className="text-gray-600">Workspace · Brand · AI · Channels · Content · Team</p>
        </div>
      )}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

// Sprint 16H (P1 #15): real logo uploader. Reads a File → base64, POSTs to
// /api/upload/logo which either uploads to Cloudinary or echoes back a data:
// URL when CLOUDINARY_* env vars aren't configured.
function LogoUploader({ form, update }: {
  form: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const fileToBase64 = (file: File) =>
    new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const [meta, b64] = result.split(',')
        const mimeMatch = meta.match(/data:([^;]+)/)
        resolve({ base64: b64, mimeType: mimeMatch?.[1] || file.type || 'image/png' })
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  const handleFile = async (file: File) => {
    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image too large (max 5MB).')
      return
    }
    update({ logoUploading: true })
    try {
      const { base64, mimeType } = await fileToBase64(file)
      // Sprint 17A (P0 #1): route now requires workspaceId to gate ownership.
      // The wizard has a workspaceId by the time the user reaches the Brand
      // step (Step 1 creates it). Fall back to localStorage for the rare
      // case where state was hydrated mid-flow.
      const workspaceId = typeof window !== 'undefined'
        ? window.localStorage.getItem('workspaceId') || ''
        : ''
      if (!workspaceId) {
        // No workspaceId yet — degrade to data URL so the wizard still works.
        update({ logoUrl: `data:${mimeType};base64,${base64}`, logoUploading: false })
        return
      }
      const res = await fetch('/api/upload/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, base64, mimeType }),
      })
      const data = await res.json()
      if (data?.url) {
        update({ logoUrl: data.url, logoUploading: false })
      } else {
        // Graceful fallback — if the upload endpoint failed entirely, embed
        // the data URL locally so the user still sees their logo in the
        // wizard. Persisted as-is (server tolerates data URLs in logo_url).
        update({ logoUrl: `data:${mimeType};base64,${base64}`, logoUploading: false })
      }
    } catch (err) {
      console.error('[logo upload] failed:', err)
      setError('Upload failed. Please try again.')
      update({ logoUploading: false })
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (form.logoUrl) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 bg-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={form.logoUrl} alt="Logo preview" className="w-12 h-12 rounded object-contain bg-white/5 border border-gray-700" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Logo uploaded</p>
          <p className="text-[10px] text-gray-500 truncate">{form.logoUrl.startsWith('data:') ? 'Stored locally (no Cloudinary)' : form.logoUrl}</p>
        </div>
        <label className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs cursor-pointer transition-colors">
          Replace
          <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <button type="button" onClick={() => update({ logoUrl: '' })} className="text-gray-500 hover:text-red-400 text-xs transition-colors">Remove</button>
      </div>
    )
  }

  return (
    <div>
      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cls(
          'flex items-center justify-center w-full h-20 rounded-lg border-2 border-dashed transition-colors cursor-pointer text-sm',
          dragOver ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300' : 'border-gray-700 hover:border-indigo-600 text-gray-500',
        )}
      >
        {form.logoUploading ? '⏳ Uploading…' : '📎 Drag & drop logo or click to upload'}
        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function TagInput({ label, tags, inputValue, onInputChange, onAdd, onRemove, placeholder }: {
  label: string; tags: string[]; inputValue: string
  onInputChange: (v: string) => void; onAdd: () => void; onRemove: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 text-xs">
            {t}
            <button type="button" onClick={() => onRemove(t)} className="text-indigo-400 hover:text-white ml-0.5">✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={cls(inp, 'flex-1')} value={inputValue} onChange={e => onInputChange(e.target.value)} placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }} />
        <button type="button" onClick={onAdd} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">Add</button>
      </div>
    </div>
  )
}

function NavBtns({ next, back, canNext, nextLabel }: { next?: () => void; back?: () => void; canNext?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-5 mt-4 border-t border-gray-800">
      {back ? (
        <button type="button" onClick={back} className="px-5 py-2.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 text-sm transition-colors">
          ← Back
        </button>
      ) : <div />}
      {next && (
        <button type="button" onClick={next} disabled={canNext === false}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
          {nextLabel || 'Continue →'}
        </button>
      )}
    </div>
  )
}
