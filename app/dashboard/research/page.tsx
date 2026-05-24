'use client'

import { useState, useEffect, useCallback } from 'react'

type ResearchType = 'market' | 'competitor' | 'keyword' | 'general'

interface ResearchReport {
  title: string
  summary: string
  keyFindings: string[]
  opportunities: string[]
  threats: string[]
  recommendations: string[]
  sources: { title: string; url: string }[]
  type: ResearchType
  query: string
  businessName?: string
}

interface SavedReport {
  id: string
  title: string
  content_json: ResearchReport
  created_at: string
}

const RESEARCH_TYPES: {
  id: ResearchType
  icon: string
  label: string
  description: string
}[] = [
  { id: 'market',     icon: '🔍', label: 'Market Research',       description: 'Market trends, size, growth opportunities' },
  { id: 'competitor', icon: '🏢', label: 'Competitor Analysis',    description: 'Scrape & analyse a competitor website' },
  { id: 'keyword',    icon: '🔑', label: 'Keyword Intelligence',   description: 'SEO / AEO keyword & content opportunities' },
  { id: 'general',    icon: '💡', label: 'General Research',       description: 'Deep-dive into any topic or question' },
]

export default function ResearchPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [type, setType] = useState<ResearchType>('market')
  const [query, setQuery] = useState('')
  const [competitorUrl, setCompetitorUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ResearchReport | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [savedLoading, setSavedLoading] = useState(true)

  const loadSaved = useCallback(async (wid: string) => {
    setSavedLoading(true)
    try {
      const res = await fetch(`/api/agents/research?workspaceId=${wid}`)
      const data = await res.json()
      if (Array.isArray(data)) setSaved(data)
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId') || ''
    setWorkspaceId(wid)
    if (wid) loadSaved(wid)
  }, [loadSaved])

  async function research() {
    if (!query.trim()) { setError('Enter a research query'); return }
    if (type === 'competitor' && !competitorUrl.trim()) { setError('Enter a competitor URL'); return }
    setLoading(true); setError(''); setReport(null)
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          query: query.trim(),
          type,
          competitorUrl: type === 'competitor' ? competitorUrl.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setReport(data.report)
      await loadSaved(workspaceId)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold">🔍</div>
          <h1 className="text-2xl font-bold text-white">Research & Intelligence</h1>
        </div>
        <p className="text-gray-400 text-sm ml-11">Real-time web research powered by live data</p>
      </div>

      {/* Research type selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {RESEARCH_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setType(t.id); setError('') }}
            className={`p-4 rounded-xl border text-left transition-all ${
              type === t.id
                ? 'border-indigo-500 bg-indigo-900/30'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-2">{t.icon}</div>
            <p className={`font-semibold text-sm mb-1 ${type === t.id ? 'text-indigo-300' : 'text-white'}`}>{t.label}</p>
            <p className="text-gray-500 text-xs leading-relaxed">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="space-y-4">
          {type === 'competitor' ? (
            <>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Competitor Name / Topic</label>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="e.g. HubSpot, Canva, Notion"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1.5 block">Competitor Website URL</label>
                <input
                  value={competitorUrl}
                  onChange={e => setCompetitorUrl(e.target.value)}
                  placeholder="https://competitor.com"
                  type="url"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                {type === 'market' ? 'Market / Industry to research' :
                 type === 'keyword' ? 'Topic or product to find keywords for' :
                 'Research query or topic'}
              </label>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && research()}
                placeholder={
                  type === 'market' ? 'e.g. AI marketing tools for SMBs' :
                  type === 'keyword' ? 'e.g. social media scheduling software' :
                  'e.g. best practices for B2B lead generation'
                }
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={research}
            disabled={loading || !workspaceId}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Researching the web...
              </>
            ) : '🔍 Research Now'}
          </button>
        </div>
      </div>

      {/* Results */}
      {report && (
        <div className="space-y-5 mb-10">
          {/* Title & summary */}
          <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{RESEARCH_TYPES.find(t => t.id === report.type)?.icon}</span>
              <div>
                <h2 className="text-white font-bold text-lg">{report.title}</h2>
                <span className="text-indigo-400 text-xs uppercase tracking-wide">{report.type?.replace('_', ' ')} Report</span>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{report.summary}</p>
          </div>

          {/* Key Findings */}
          {report.keyFindings?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Key Findings</h3>
              <ol className="space-y-3">
                {report.keyFindings.map((f, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-indigo-400 font-bold flex-shrink-0 w-5">{i + 1}.</span>
                    <span className="text-gray-300 leading-relaxed">{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Opportunities & Threats grid */}
          <div className="grid grid-cols-2 gap-4">
            {report.opportunities?.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Opportunities</h3>
                <div className="space-y-2">
                  {report.opportunities.map((o, i) => (
                    <div key={i} className="bg-green-900/20 border border-green-800/30 rounded-lg px-3 py-2">
                      <p className="text-green-300 text-xs leading-relaxed">{o}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {report.threats?.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Threats & Risks</h3>
                <div className="space-y-2">
                  {report.threats.map((t, i) => (
                    <div key={i} className="bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                      <p className="text-red-300 text-xs leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {report.recommendations?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Recommendations</h3>
              <div className="space-y-2.5">
                {report.recommendations.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded border border-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-sm bg-indigo-600" />
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {report.sources?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">Sources</h3>
              <div className="space-y-2">
                {report.sources.filter(s => s.url).map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm group"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span className="underline underline-offset-2 truncate">{s.title || s.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Previously saved reports */}
      <div>
        <h2 className="text-white font-semibold mb-4">Previous Research Reports</h2>
        {savedLoading ? (
          <div className="text-gray-600 text-sm animate-pulse p-6 text-center">Loading reports...</div>
        ) : saved.length === 0 ? (
          <div className="border border-dashed border-gray-700 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-white font-medium mb-1">No research reports yet</p>
            <p className="text-gray-500 text-sm">Run your first research query above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {saved.map(s => (
              <button
                key={s.id}
                onClick={() => setReport(s.content_json)}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{RESEARCH_TYPES.find(t => t.id === s.content_json?.type)?.icon || '📄'}</span>
                    <div>
                      <p className="text-white text-sm font-medium truncate max-w-xl">{s.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">
                    {s.content_json?.type?.replace('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
