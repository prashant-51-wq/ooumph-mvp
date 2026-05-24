'use client'

import { useState, useEffect } from 'react'

type ContentType = 'headline' | 'cta' | 'email_subject' | 'ad_copy' | 'social_post' | 'landing_page_copy'

interface ABVariation {
  id: string
  label: string
  content: string
  hypothesis: string
  expectedOutcome: string
  targetEmotion: string
}

interface ABResult {
  variations: ABVariation[]
  testingAdvice: string
  successMetric: string
}

const CONTENT_TYPES: { key: ContentType; label: string; icon: string }[] = [
  { key: 'headline', label: 'Headline', icon: '📰' },
  { key: 'cta', label: 'CTA', icon: '🖱️' },
  { key: 'email_subject', label: 'Email Subject', icon: '📧' },
  { key: 'ad_copy', label: 'Ad Copy', icon: '📣' },
  { key: 'social_post', label: 'Social Post', icon: '💬' },
  { key: 'landing_page_copy', label: 'Landing Page', icon: '🌐' },
]

const EMOTION_COLORS: Record<string, string> = {
  'Curiosity': 'bg-purple-900 border-purple-700 text-purple-300',
  'Fear of missing out': 'bg-orange-900 border-orange-700 text-orange-300',
  'Trust': 'bg-blue-900 border-blue-700 text-blue-300',
  'Urgency': 'bg-red-900 border-red-700 text-red-300',
  'Delight': 'bg-green-900 border-green-700 text-green-300',
  'Authority': 'bg-indigo-900 border-indigo-700 text-indigo-300',
  'Relatability': 'bg-yellow-900 border-yellow-700 text-yellow-300',
}

const LABEL_COLORS: Record<string, string> = {
  A: 'bg-indigo-600 text-white',
  B: 'bg-purple-600 text-white',
  C: 'bg-emerald-600 text-white',
  D: 'bg-orange-600 text-white',
  E: 'bg-rose-600 text-white',
}

export default function ABTestPage() {
  const [contentType, setContentType] = useState<ContentType>('headline')
  const [content, setContent] = useState('')
  const [testGoal, setTestGoal] = useState('')
  const [variationCount, setVariationCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ABResult | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<{ id: string; title: string; content_json: ABResult & { contentType: string; originalContent: string }; created_at: string }[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    fetch(`/api/agents/ab-test?workspaceId=${wid}`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setHistory(data) : null)
      .catch(() => null)
  }, [])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    if (!content.trim()) { setError('Please paste your original content first.'); return }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/agents/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content: content.trim(), contentType, variations: variationCount, testGoal: testGoal.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to generate variations'); return }
      setResult({ variations: data.variations, testingAdvice: data.testingAdvice, successMetric: data.successMetric })

      // Refresh history
      fetch(`/api/agents/ab-test?workspaceId=${workspaceId}`)
        .then(r => r.json())
        .then(d => Array.isArray(d) ? setHistory(d) : null)
        .catch(() => null)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const emotionClass = (emotion: string) => EMOTION_COLORS[emotion] || 'bg-gray-800 border-gray-700 text-gray-300'

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">🧪 A/B Testing Lab</h1>
        <p className="text-gray-400 text-sm mt-1">Generate scientifically different variations for testing — not just synonyms, but entirely different angles.</p>
      </div>

      {/* Generator Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5 mb-6">
        {/* Content Type Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">Content Type</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(ct => (
              <button
                key={ct.key}
                onClick={() => setContentType(ct.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${contentType === ct.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700 hover:text-white'}`}
              >
                <span>{ct.icon}</span>
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Original Content */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-1.5">Original Content</label>
          <p className="text-xs text-gray-500 mb-2">Paste your original content to create variations from</p>
          <textarea
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={contentType === 'headline' ? 'e.g. Double Your Sales in 30 Days — Guaranteed' : contentType === 'email_subject' ? 'e.g. Quick question about your marketing...' : 'Paste your content here...'}
          />
        </div>

        {/* Test Goal */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-1.5">Test Goal</label>
          <input
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
            value={testGoal}
            onChange={e => setTestGoal(e.target.value)}
            placeholder="What are you optimizing for? e.g. click-through rate, email opens, conversions"
          />
        </div>

        {/* Variation Count */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">Number of Variations: <span className="text-indigo-400 font-bold">{variationCount}</span></label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setVariationCount(v => Math.max(2, v - 1))}
              className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 text-white text-lg font-bold hover:bg-gray-700 transition-colors flex items-center justify-center"
            >
              −
            </button>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setVariationCount(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${variationCount === n ? 'bg-indigo-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => setVariationCount(v => Math.min(5, v + 1))}
              className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 text-white text-lg font-bold hover:bg-gray-700 transition-colors flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {error && <div className="p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

        <button
          onClick={generate}
          disabled={loading || !content.trim()}
          className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating Variations...
            </>
          ) : (
            <>🧪 Generate Variations</>
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Success Metric */}
          <div className="bg-indigo-950 border border-indigo-800 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-0.5">Primary Success Metric</p>
              <p className="text-white font-semibold text-sm">{result.successMetric}</p>
            </div>
          </div>

          {/* Variation Cards */}
          <div className="space-y-4">
            <h2 className="text-white font-semibold text-sm">Generated Variations</h2>
            {result.variations.map(variation => (
              <div key={variation.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${LABEL_COLORS[variation.label] || 'bg-gray-700 text-white'}`}>
                      {variation.label}
                    </span>
                    <span className="text-gray-300 text-sm font-medium">Variation {variation.label}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${emotionClass(variation.targetEmotion)}`}>
                    {variation.targetEmotion}
                  </span>
                </div>

                {/* Content Box */}
                <div className="relative bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{variation.content}</p>
                  <button
                    onClick={() => copyToClipboard(variation.content, variation.id)}
                    className="absolute top-3 right-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {copied === variation.id ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-500 font-medium mb-1">Hypothesis</p>
                    <p className="text-gray-300 text-xs leading-relaxed">{variation.hypothesis}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-500 font-medium mb-1">Expected Outcome</p>
                    <p className="text-gray-300 text-xs leading-relaxed">{variation.expectedOutcome}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Testing Advice */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-white font-semibold text-sm mb-3">📋 Testing Advice</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{result.testingAdvice}</p>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && !result && (
        <div className="mt-8">
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Previous Tests</h2>
          <div className="space-y-2">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  const cj = item.content_json
                  setResult({ variations: cj.variations, testingAdvice: cj.testingAdvice, successMetric: cj.successMetric })
                  if (cj.contentType) setContentType(cj.contentType as ContentType)
                  if (cj.originalContent) setContent(cj.originalContent)
                }}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-white text-sm">{item.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-gray-600 text-xs">{item.content_json?.variations?.length || 0} variations</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
