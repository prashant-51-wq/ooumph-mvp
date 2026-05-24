'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type PrType = 'launch' | 'funding' | 'partnership' | 'award' | 'update' | 'custom'

interface PressRelease {
  headline: string
  subheadline: string
  dateline: string
  body: string
  boilerplate: string
  contactInfo: string
}

interface PitchEmail {
  angle: string
  subject: string
  body: string
}

interface MediaTarget {
  tier: string
  outlets: string[]
}

interface PRResult {
  pressRelease: PressRelease
  pitchEmails: PitchEmail[]
  mediaTargets: MediaTarget[]
  sendAdvice: string
  followUpTimeline: string
  artifactId?: string
}

// ─── PR type cards config ─────────────────────────────────────────────────────

const PR_TYPES: { id: PrType; label: string; icon: string; hint: string }[] = [
  { id: 'launch',      label: 'Product Launch',       icon: '🚀', hint: 'New product, feature, or service' },
  { id: 'funding',     label: 'Funding Round',         icon: '💰', hint: 'Seed, Series A/B, grant won' },
  { id: 'partnership', label: 'Partnership',           icon: '🤝', hint: 'New partner, integration, collab' },
  { id: 'award',       label: 'Award / Recognition',   icon: '🏆', hint: 'Won an award, ranking, certification' },
  { id: 'update',      label: 'Company Update',        icon: '📣', hint: 'Milestone, expansion, new hire' },
  { id: 'custom',      label: 'Custom Story',          icon: '✍️', hint: 'Any other newsworthy angle' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyToClipboard(text: string, setMsg: (m: string) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setMsg('Copied!')
    setTimeout(() => setMsg(''), 1800)
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PRPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [prType, setPrType] = useState<PrType>('launch')
  const [angle, setAngle] = useState('')
  const [keyFacts, setKeyFacts] = useState('')
  const [targetMedia, setTargetMedia] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PRResult | null>(null)
  const [activeTab, setActiveTab] = useState<'release' | 'emails' | 'strategy'>('release')
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    setWorkspaceId(localStorage.getItem('workspaceId') || '')
  }, [])

  async function generate() {
    if (!workspaceId || !angle.trim() || !keyFacts.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/agents/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, prType, angle: angle.trim(), keyFacts: keyFacts.trim(), targetMedia: targetMedia.trim() || undefined }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data as PRResult)
      setActiveTab('release')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const pr = result?.pressRelease
  const fullReleaseText = pr
    ? `${pr.headline}\n${pr.subheadline}\n\n${pr.dateline}\n\n${pr.body}\n\n###\n\n${pr.boilerplate}\n\n${pr.contactInfo}`
    : ''

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">📰</div>
          <h1 className="text-2xl font-bold text-white">PR & Press Release Studio</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">AI-crafted press releases and media pitches — AP style, journalist-ready</p>
      </div>

      {error && (
        <div className="mb-5 bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Input form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 space-y-6">

        {/* PR Type selector */}
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-3">What type of announcement is this?</label>
          <div className="grid grid-cols-3 gap-3">
            {PR_TYPES.map(t => (
              <button key={t.id} onClick={() => setPrType(t.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  prType === t.id
                    ? 'border-indigo-500 bg-indigo-600/20 text-white'
                    : 'border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white'
                }`}>
                <span className="text-2xl leading-none mt-0.5">{t.icon}</span>
                <div>
                  <p className="font-medium text-sm leading-snug">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{t.hint}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Angle */}
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            What&apos;s the story angle / hook? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={angle}
            onChange={e => setAngle(e.target.value)}
            placeholder="We just crossed 1000 customers in 3 months — fastest in our industry..."
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Key facts */}
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Key facts, numbers & quotes <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={4}
            value={keyFacts}
            onChange={e => setKeyFacts(e.target.value)}
            placeholder={`Founded in 2024, 50% MoM growth\nCEO quote: "We're redefining how SMBs do marketing"\n₹2Cr ARR in year 1\nPresent in 5 cities`}
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Target media (optional) */}
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Target publications <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={targetMedia}
            onChange={e => setTargetMedia(e.target.value)}
            placeholder="TechCrunch, YourStory, Economic Times, Inc42, Forbes India..."
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={loading || !workspaceId || !angle.trim() || !keyFacts.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Spinner />
              Crafting your PR package...
            </>
          ) : (
            '📰 Generate PR Package'
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div>
          {/* Result tab nav */}
          <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {[
              { id: 'release' as const,  label: 'Press Release', icon: '📄' },
              { id: 'emails'  as const,  label: 'Pitch Emails',  icon: '✉️' },
              { id: 'strategy' as const, label: 'Media Strategy', icon: '🗺️' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── PRESS RELEASE TAB ──────────────────────────────────────────── */}
          {activeTab === 'release' && pr && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-semibold">Press Release</h2>
                <button
                  onClick={() => copyToClipboard(fullReleaseText, setCopyMsg)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm transition-colors">
                  {copyMsg || 'Copy full release'}
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5 font-serif">
                {/* Headline */}
                <div className="border-b border-gray-800 pb-5">
                  <h1 className="text-white text-2xl font-bold leading-tight mb-2">{pr.headline}</h1>
                  <p className="text-gray-300 text-base leading-relaxed">{pr.subheadline}</p>
                  <p className="text-gray-500 text-sm mt-3 font-sans">{pr.dateline}</p>
                </div>

                {/* Body */}
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {pr.body}
                </div>

                {/* Separator */}
                <div className="border-t border-gray-800 pt-5 space-y-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider font-sans mb-2">About the Company</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{pr.boilerplate}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider font-sans mb-2">Media Contact</p>
                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{pr.contactInfo}</p>
                  </div>
                </div>
              </div>

              {/* Copy sections */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Copy Headline',   text: pr.headline },
                  { label: 'Copy Subheadline', text: pr.subheadline },
                  { label: 'Copy Body',        text: pr.body },
                  { label: 'Copy Boilerplate', text: pr.boilerplate },
                ].map(item => (
                  <button key={item.label}
                    onClick={() => copyToClipboard(item.text, setCopyMsg)}
                    className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors text-left">
                    {copyMsg === 'Copied!' ? '✓ Copied!' : item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── PITCH EMAILS TAB ───────────────────────────────────────────── */}
          {activeTab === 'emails' && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold">Journalist Pitch Emails</h2>
              <p className="text-gray-500 text-xs">3 different angles — use the one that fits the publication best</p>
              {(result.pitchEmails || []).map((email, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      i === 0 ? 'bg-indigo-900/40 text-indigo-400' :
                      i === 1 ? 'bg-violet-900/40 text-violet-400' :
                                'bg-emerald-900/40 text-emerald-400'
                    }`}>{email.angle}</span>
                    <button
                      onClick={() => copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`, setCopyMsg)}
                      className="text-xs text-gray-500 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-gray-800">
                      {copyMsg === 'Copied!' ? '✓ Copied' : 'Copy email'}
                    </button>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Subject Line</p>
                    <p className="text-white font-semibold text-sm">{email.subject}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Email Body</p>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{email.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── MEDIA STRATEGY TAB ─────────────────────────────────────────── */}
          {activeTab === 'strategy' && (
            <div className="space-y-5">
              <h2 className="text-white font-semibold">Media Strategy</h2>

              {/* Tiered outlets */}
              <div className="space-y-3">
                {(result.mediaTargets || []).map((tier, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-blue-400' : 'text-green-400'
                    }`}>{tier.tier}</p>
                    <div className="flex flex-wrap gap-2">
                      {(tier.outlets || []).map((outlet, j) => (
                        <span key={j} className="px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-sm">{outlet}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Send advice */}
              {result.sendAdvice && (
                <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-2xl p-5">
                  <p className="text-indigo-400 text-xs uppercase tracking-wider font-semibold mb-2">Optimal Send Time</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{result.sendAdvice}</p>
                </div>
              )}

              {/* Follow-up timeline */}
              {result.followUpTimeline && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Follow-Up Timeline</p>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{result.followUpTimeline}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
