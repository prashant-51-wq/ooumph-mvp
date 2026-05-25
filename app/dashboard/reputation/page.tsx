'use client'

import { useState, useEffect, useCallback } from 'react'

interface Review {
  id: string
  contact_name: string | null
  contact_email: string | null
  source: string
  rating: number | null
  title: string | null
  body: string | null
  sentiment: string
  status: string
  response_text: string | null
  response_sent_at: string | null
  external_url: string | null
  reviewed_at: string | null
  created_at: string
}

interface ReviewRequest {
  id: string
  contact_name: string | null
  contact_email: string
  booking_id: string | null
  status: string
  sent_at: string | null
  review_platform: string
  review_link: string | null
  created_at: string
}

interface Summary {
  avgRating: number
  totalReviews: number
  starBreakdown: Record<number, number>
  reviews: Array<{ sentiment: string; status: string; total: number }>
  requests: Array<{ status: string; total: number }>
}

interface ReputationAnalysis {
  health: string
  score: number
  summary: string
  strengths: string[]
  issues: string[]
  actions: string[]
  avgRating: number
  totalReviews: number
  unansweredNegative: number
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'text-green-400',
  neutral: 'text-yellow-400',
  negative: 'text-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-300',
  urgent: 'bg-red-500/20 text-red-300',
  responded: 'bg-green-500/20 text-green-300',
  ignored: 'bg-gray-500/20 text-gray-400',
}

const SOURCE_ICON: Record<string, string> = {
  google: '🟡',
  trustpilot: '🟢',
  facebook: '🔵',
  manual: '📝',
  internal: '🏠',
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-gray-600 text-xs">No rating</span>
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function timeAgo(ts: string | null) {
  if (!ts) return ''
  const d = Date.now() - new Date(ts).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ReputationPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [reviews, setReviews] = useState<Review[]>([])
  const [requests, setRequests] = useState<ReviewRequest[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'reviews' | 'requests' | 'analyze'>('reviews')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [analysis, setAnalysis] = useState<ReputationAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // Draft response state
  const [drafting, setDrafting] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [savingResponse, setSavingResponse] = useState(false)

  // Add review modal
  const [addModal, setAddModal] = useState(false)
  const [newReview, setNewReview] = useState({ contactName: '', contactEmail: '', source: 'manual', rating: 5, body: '', title: '' })
  const [submitting, setSubmitting] = useState(false)

  // Request review modal
  const [reqModal, setReqModal] = useState(false)
  const [reqEmail, setReqEmail] = useState('')
  const [reqName, setReqName] = useState('')
  const [reqPlatform, setReqPlatform] = useState('google')
  const [reqLink, setReqLink] = useState('')
  const [sending, setSending] = useState(false)
  const [reqMsg, setReqMsg] = useState('')

  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const wid = raw ? (JSON.parse(raw) as { id: string }).id : (localStorage.getItem('workspaceId') || '')
    setWorkspaceId(wid)
  }, [])

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const [revRes, reqRes, sumRes] = await Promise.all([
        fetch(`/api/reputation?workspaceId=${workspaceId}`),
        fetch(`/api/reputation?workspaceId=${workspaceId}&type=requests`),
        fetch(`/api/reputation?workspaceId=${workspaceId}&type=summary`),
      ])
      const [revData, reqData, sumData] = await Promise.all([
        revRes.json() as Promise<Review[]>,
        reqRes.json() as Promise<ReviewRequest[]>,
        sumRes.json() as Promise<Summary>,
      ])
      setReviews(revData)
      setRequests(reqData)
      setSummary(sumData)
    } catch { /* ignore */ }
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  const filteredReviews = reviews.filter(r => {
    if (sentimentFilter !== 'all' && r.sentiment !== sentimentFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    return true
  })

  const handleDraftResponse = async (review: Review) => {
    setSelectedReview(review)
    setDraftText('')
    setDrafting(true)
    try {
      const res = await fetch('/api/agents/reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, mode: 'draft_response', reviewId: review.id }),
      })
      const data = await res.json() as { draft?: string }
      setDraftText(data.draft || '')
    } catch { /* ignore */ }
    setDrafting(false)
  }

  const handleSaveResponse = async () => {
    if (!selectedReview || !draftText) return
    setSavingResponse(true)
    await fetch('/api/reputation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedReview.id, status: 'responded', responseText: draftText }),
    })
    setSavingResponse(false)
    setSelectedReview(null)
    setDraftText('')
    await load()
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/agents/reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, mode: 'analyze' }),
      })
      const data = await res.json() as { analysis?: ReputationAnalysis }
      setAnalysis(data.analysis || null)
    } catch { /* ignore */ }
    setAnalyzing(false)
  }

  const handleAddReview = async () => {
    setSubmitting(true)
    await fetch('/api/reputation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...newReview }),
    })
    setSubmitting(false)
    setAddModal(false)
    setNewReview({ contactName: '', contactEmail: '', source: 'manual', rating: 5, body: '', title: '' })
    await load()
  }

  const handleSendRequest = async () => {
    if (!reqEmail) return
    setSending(true)
    setReqMsg('')
    try {
      const res = await fetch('/api/agents/reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, mode: 'request_review',
          contactEmail: reqEmail, contactName: reqName,
          reviewPlatform: reqPlatform,
          reviewLink: reqLink || undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; skipped?: string; error?: string }
      if (data.ok) {
        setReqMsg('✅ Review request sent!')
        await load()
      } else {
        setReqMsg(`⚠️ ${data.skipped || data.error || 'Unknown error'}`)
      }
    } catch { setReqMsg('❌ Failed to send') }
    setSending(false)
  }

  const healthColor: Record<string, string> = {
    excellent: 'text-green-400',
    good: 'text-blue-400',
    fair: 'text-yellow-400',
    poor: 'text-red-400',
    no_data: 'text-gray-400',
  }

  const avgRating = summary?.avgRating ?? 0
  const totalReviews = summary?.totalReviews ?? 0
  const negCount = reviews.filter(r => r.sentiment === 'negative').length
  const urgentCount = reviews.filter(r => r.status === 'urgent').length
  const sentReqs = requests.filter(r => r.status === 'sent').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Reputation Agent</h1>
          <p className="text-gray-400 text-sm">Monitor reviews, draft responses, automate review requests</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReqModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
            + Request Review
          </button>
          <button onClick={() => setAddModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
            + Add Review
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">Avg Rating</p>
          <div className="flex justify-center mt-1">
            <StarRating rating={avgRating > 0 ? Math.round(avgRating) : null} />
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{totalReviews}</p>
          <p className="text-xs text-gray-400 mt-1">Total Reviews</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold ${urgentCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{urgentCount}</p>
          <p className="text-xs text-gray-400 mt-1">Urgent (unanswered neg.)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-indigo-400">{sentReqs}</p>
          <p className="text-xs text-gray-400 mt-1">Requests Sent</p>
        </div>
      </div>

      {/* Star breakdown */}
      {summary && totalReviews > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-300 mb-3">Rating Breakdown</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map(star => {
              const count = summary.starBreakdown[star] || 0
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-3">
                  <span className="text-yellow-400 text-xs w-6">{star}★</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-gray-500 text-xs w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {(['reviews', 'requests', 'analyze'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${activeTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {tab === 'reviews' ? `Reviews (${filteredReviews.length})` : tab === 'requests' ? `Requests (${requests.length})` : '🤖 AI Analysis'}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-500">Loading...</div>}

      {/* ── Reviews tab ─────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'reviews' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'positive', 'neutral', 'negative'] as const).map(s => (
              <button key={s} onClick={() => setSentimentFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${sentimentFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {s}
              </button>
            ))}
            <span className="text-gray-700 px-1">|</span>
            {(['all', 'new', 'urgent', 'responded'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {s}
              </button>
            ))}
          </div>

          {filteredReviews.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-4xl mb-3">⭐</p>
              <p className="text-sm">No reviews yet. Send review requests to start collecting feedback.</p>
            </div>
          )}

          {filteredReviews.map(review => (
            <div key={review.id} className={`bg-gray-900 border rounded-xl p-5 space-y-3 ${review.status === 'urgent' ? 'border-red-500/50' : 'border-gray-800'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{SOURCE_ICON[review.source] || '📝'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium">{review.contact_name || 'Anonymous'}</p>
                      {review.contact_email && <p className="text-gray-500 text-xs">{review.contact_email}</p>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StarRating rating={review.rating} />
                      <span className={`text-xs ${SENTIMENT_COLOR[review.sentiment]}`}>{review.sentiment}</span>
                      <span className="text-gray-600 text-xs capitalize">{review.source}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[review.status] || 'bg-gray-700 text-gray-400'}`}>
                    {review.status}
                  </span>
                  <span className="text-gray-600 text-xs">{timeAgo(review.reviewed_at || review.created_at)}</span>
                </div>
              </div>

              {review.title && <p className="text-gray-200 text-sm font-medium">{review.title}</p>}
              {review.body && <p className="text-gray-400 text-sm leading-relaxed">{review.body}</p>}
              {review.external_url && (
                <a href={review.external_url} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-400 text-xs hover:underline">View on platform →</a>
              )}

              {/* Existing response */}
              {review.response_text && (
                <div className="bg-gray-800 rounded-lg p-3 border-l-2 border-green-500">
                  <p className="text-xs text-green-400 mb-1">Your response · {timeAgo(review.response_sent_at)}</p>
                  <p className="text-gray-300 text-sm">{review.response_text}</p>
                </div>
              )}

              {/* Response composer */}
              {selectedReview?.id === review.id && (
                <div className="space-y-2">
                  {drafting && <p className="text-indigo-400 text-xs animate-pulse">AI drafting response...</p>}
                  {draftText && (
                    <textarea
                      value={draftText}
                      onChange={e => setDraftText(e.target.value)}
                      rows={4}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleSaveResponse} disabled={savingResponse || !draftText}
                      className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                      {savingResponse ? 'Saving...' : 'Save Response'}
                    </button>
                    <button onClick={() => { setSelectedReview(null); setDraftText('') }}
                      className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {review.status !== 'responded' && selectedReview?.id !== review.id && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleDraftResponse(review)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors">
                    🤖 Draft AI Response
                  </button>
                  <button onClick={async () => {
                    await fetch('/api/reputation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id, status: 'ignored' }) })
                    await load()
                  }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors">
                    Ignore
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Requests tab ────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-4xl mb-3">📧</p>
              <p className="text-sm">No review requests sent yet. Click &quot;+ Request Review&quot; to start.</p>
            </div>
          )}
          {requests.map(req => (
            <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-white text-sm font-medium">{req.contact_name || req.contact_email}</p>
                <p className="text-gray-500 text-xs">{req.contact_email}</p>
                <p className="text-gray-600 text-xs mt-0.5 capitalize">{req.review_platform} · {timeAgo(req.sent_at || req.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                {req.review_link && (
                  <a href={req.review_link} target="_blank" rel="noopener noreferrer"
                    className="text-indigo-400 text-xs hover:underline">Review link</a>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${
                  req.status === 'sent' ? 'bg-blue-500/20 text-blue-300' :
                  req.status === 'reviewed' ? 'bg-green-500/20 text-green-300' :
                  req.status === 'clicked' ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-gray-700 text-gray-400'
                }`}>{req.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Analysis tab ──────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'analyze' && (
        <div className="space-y-4">
          {!analysis && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-gray-400 text-sm mb-6">AI will analyse all your reviews and give you an actionable reputation health report.</p>
              <button onClick={handleAnalyze} disabled={analyzing}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50">
                {analyzing ? 'Analysing...' : '🤖 Run Reputation Analysis'}
              </button>
            </div>
          )}

          {analysis && (
            <div className="space-y-4">
              {/* Health card */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
                <p className={`text-5xl font-bold ${healthColor[analysis.health] || 'text-gray-400'}`}>
                  {analysis.score}
                </p>
                <p className={`text-lg font-semibold mt-1 capitalize ${healthColor[analysis.health]}`}>
                  {analysis.health} Reputation
                </p>
                <p className="text-gray-400 text-sm mt-2 max-w-lg mx-auto">{analysis.summary}</p>
                <div className="flex justify-center gap-6 mt-4 text-sm">
                  <div className="text-center">
                    <p className="text-yellow-400 font-bold">{(analysis.avgRating ?? 0).toFixed(1)}★</p>
                    <p className="text-gray-500 text-xs">Avg Rating</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold">{analysis.totalReviews}</p>
                    <p className="text-gray-500 text-xs">Reviews</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-bold ${(analysis.unansweredNegative ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {analysis.unansweredNegative ?? 0}
                    </p>
                    <p className="text-gray-500 text-xs">Unanswered Neg.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-green-400 font-medium text-sm mb-3">✅ Strengths</p>
                  <ul className="space-y-1.5">
                    {(analysis.strengths || []).map((s, i) => (
                      <li key={i} className="text-gray-300 text-sm flex gap-2">
                        <span className="text-green-500 flex-shrink-0">•</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Issues */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-red-400 font-medium text-sm mb-3">⚠️ Issues</p>
                  <ul className="space-y-1.5">
                    {(analysis.issues || []).map((s, i) => (
                      <li key={i} className="text-gray-300 text-sm flex gap-2">
                        <span className="text-red-500 flex-shrink-0">•</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action plan */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-indigo-400 font-medium text-sm mb-3">🎯 Action Plan</p>
                <ol className="space-y-2">
                  {(analysis.actions || []).map((a, i) => (
                    <li key={i} className="text-gray-300 text-sm flex gap-3">
                      <span className="text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>{a}
                    </li>
                  ))}
                </ol>
              </div>

              <button onClick={handleAnalyze} disabled={analyzing}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                {analyzing ? 'Re-analysing...' : '↻ Refresh Analysis'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Add Review Modal ─────────────────────────────────────────────────────── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAddModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold">Add Manual Review</h2>
            <div className="space-y-3">
              <input placeholder="Customer name" value={newReview.contactName}
                onChange={e => setNewReview(p => ({ ...p, contactName: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              <input placeholder="Customer email" value={newReview.contactEmail}
                onChange={e => setNewReview(p => ({ ...p, contactEmail: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              <select value={newReview.source} onChange={e => setNewReview(p => ({ ...p, source: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                {['manual', 'google', 'trustpilot', 'facebook', 'internal'].map(s => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-sm">Rating:</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setNewReview(p => ({ ...p, rating: n }))}
                      className={`text-xl transition-colors ${n <= newReview.rating ? 'text-yellow-400' : 'text-gray-700'}`}>★</button>
                  ))}
                </div>
              </div>
              <input placeholder="Review title (optional)" value={newReview.title}
                onChange={e => setNewReview(p => ({ ...p, title: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              <textarea placeholder="Review text" value={newReview.body}
                onChange={e => setNewReview(p => ({ ...p, body: e.target.value }))}
                rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAddModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Cancel</button>
              <button onClick={handleAddReview} disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Review Modal ─────────────────────────────────────────────────── */}
      {reqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setReqModal(false); setReqMsg('') }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold">Send Review Request</h2>
            <p className="text-gray-400 text-xs">AI will write a personalised email and send it immediately.</p>
            <div className="space-y-3">
              <input placeholder="Contact email *" value={reqEmail}
                onChange={e => setReqEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              <input placeholder="Contact name (optional)" value={reqName}
                onChange={e => setReqName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              <select value={reqPlatform} onChange={e => setReqPlatform(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                <option value="google">Google</option>
                <option value="trustpilot">Trustpilot</option>
                <option value="facebook">Facebook</option>
              </select>
              <input placeholder="Review link URL (optional — uses Google search if blank)" value={reqLink}
                onChange={e => setReqLink(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
            </div>
            {reqMsg && <p className="text-sm text-gray-300 bg-gray-800 rounded-lg px-3 py-2">{reqMsg}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setReqModal(false); setReqMsg('') }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Close</button>
              <button onClick={handleSendRequest} disabled={sending || !reqEmail}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                {sending ? 'Sending...' : '📧 Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
