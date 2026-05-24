'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { FunnelPlan } from '@/types'

const FUNNEL_WORKERS = [
  {
    id: 'landing-page',
    icon: '🌐',
    label: 'Landing Page Builder',
    description: 'Production-ready HTML landing page with CRO-optimised copy, A/B variant, and SEO schema',
    endpoint: '/api/agents/funnel/landing-page',
    extraFields: [
      { key: 'pageType', label: 'Page Type', options: ['lead_magnet', 'product', 'webinar', 'consultation', 'waitlist'] },
    ],
  },
  {
    id: 'email-sequence',
    icon: '📧',
    label: 'Email Sequence',
    description: 'Full email nurture sequences with subject lines, copy, CTAs, and A/B variants',
    endpoint: '/api/agents/funnel/email-sequence',
    extraFields: [
      { key: 'sequenceType', label: 'Sequence Type', options: ['welcome', 'nurture', 'sales', 'onboarding', 're_engagement', 'post_purchase'] },
    ],
  },
  {
    id: 'qualify',
    icon: '🎯',
    label: 'Lead Qualifier',
    description: 'Lead scoring model, qualification scripts (BANT/MEDDIC), and CRM automation rules',
    endpoint: '/api/agents/funnel/qualify',
    extraFields: [],
  },
]

export default function FunnelPage() {
  const router = useRouter()
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [funnel, setFunnel] = useState<FunnelPlan | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [workerLoading, setWorkerLoading] = useState<Record<string, boolean>>({})
  const [workerResults, setWorkerResults] = useState<Record<string, string>>({})
  const [workerSelections, setWorkerSelections] = useState<Record<string, string>>({
    'landing-page': 'lead_magnet',
    'email-sequence': 'welcome',
  })
  const [landingPageHtml, setLandingPageHtml] = useState<string | null>(null)
  const [showLandingPreview, setShowLandingPreview] = useState(false)
  const [sendEmailModal, setSendEmailModal] = useState<{ artifactId: string; sequenceName: string } | null>(null)
  const [sendRecipients, setSendRecipients] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/agents/funnel?workspaceId=${wid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.content_json) {
          setFunnel(d.content_json)
          setApprovalStatus(d.approval_status || null)
        }
      })
      .finally(() => setFetching(false))
  }, [router])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/agents/funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.funnel) { setFunnel(data.funnel); setApprovalStatus('pending') }
      else setError(data.error || 'Generation failed')
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  async function runFunnelWorker(worker: typeof FUNNEL_WORKERS[number]) {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    setWorkerLoading(prev => ({ ...prev, [worker.id]: true }))
    setWorkerResults(prev => ({ ...prev, [worker.id]: '' }))
    try {
      const body: Record<string, string> = { workspaceId: wid }
      const sel = workerSelections[worker.id]
      if (worker.id === 'landing-page' && sel) body.pageType = sel
      if (worker.id === 'email-sequence' && sel) body.sequenceType = sel
      if (worker.id === 'qualify') body.mode = 'build_model'
      const res = await fetch(worker.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setWorkerResults(prev => ({
        ...prev,
        [worker.id]: data.error ? `Error: ${data.error}` : data.message || 'Done — check Approvals',
      }))
      if (worker.id === 'landing-page' && data.page?.htmlTemplate) {
        setLandingPageHtml(data.page.htmlTemplate)
      }
      if (worker.id === 'email-sequence' && data.artifactId) {
        setSendEmailModal({ artifactId: data.artifactId, sequenceName: data.sequence?.sequenceName || 'Email Sequence' })
      }
    } catch (e) {
      setWorkerResults(prev => ({ ...prev, [worker.id]: `Error: ${String(e)}` }))
    } finally {
      setWorkerLoading(prev => ({ ...prev, [worker.id]: false }))
    }
  }

  function downloadHtml() {
    if (!landingPageHtml) return
    const blob = new Blob([landingPageHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'landing-page.html'; a.click()
    URL.revokeObjectURL(url)
  }

  async function sendEmailSequence() {
    if (!sendEmailModal) return
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    setSending(true); setSendResult('')
    try {
      const lines = sendRecipients.split('\n').map(l => l.trim()).filter(Boolean)
      const recipients = lines.map(l => {
        const [email, firstName = 'there'] = l.split(',').map(s => s.trim())
        return { email, firstName }
      })
      const res = await fetch('/api/agents/funnel/email-sequence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wid, artifactId: sendEmailModal.artifactId, recipients }),
      })
      const data = await res.json()
      setSendResult(data.error ? `Error: ${data.error}` : data.message || 'Sent!')
    } catch (e) { setSendResult(`Error: ${String(e)}`) } finally { setSending(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">🔮 Funnel Blueprint</h1>
            {approvalStatus && <ApprovalBadge status={approvalStatus} />}
          </div>
          <p className="text-gray-400 text-sm">Lead magnet, landing page, email nurture, and CRM stages</p>
        </div>
        <div className="flex gap-3">
          {funnel && <button onClick={() => router.push('/dashboard/leads')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">Next: Lead Gen Plan →</button>}
          <button onClick={generate} disabled={loading} className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Generating...' : funnel ? '↻ Regenerate' : '⚡ Generate Funnel Plan'}
          </button>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300">Funnel Planner Agent is designing your full funnel...</p>
        </div>
      )}

      {funnel && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-purple-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🎁 Lead Magnet</h3>
              <p className="text-purple-300 text-lg font-bold mb-2">{funnel.leadMagnet?.title}</p>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2"><span className="text-gray-500">Format:</span><span className="text-gray-300">{funnel.leadMagnet?.format}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">Topic:</span><span className="text-gray-300">{funnel.leadMagnet?.topic}</span></div>
                <div className="mt-3 p-3 rounded-lg bg-gray-800">
                  <p className="text-xs text-gray-500 mb-1">What they get:</p>
                  <p className="text-gray-300 text-sm">{funnel.leadMagnet?.deliverable}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-blue-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🌐 Landing Page</h3>
              <p className="text-white font-bold text-lg mb-1">{funnel.landingPage?.headline}</p>
              <p className="text-gray-400 text-sm mb-4">{funnel.landingPage?.subheadline}</p>
              <ul className="space-y-1 mb-4">
                {funnel.landingPage?.bulletPoints?.map((bp, i) => (
                  <li key={i} className="text-gray-300 text-sm flex gap-2"><span className="text-green-500">✓</span>{bp}</li>
                ))}
              </ul>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500">CTA:</span>
                <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm">{funnel.landingPage?.cta}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">📧 Email Nurture Sequence</h3>
            <div className="space-y-2">
              {funnel.emailNurture?.map((email, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-gray-800">
                  <div className="w-12 text-center">
                    <span className="text-indigo-400 text-sm font-mono">Day {email.day}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{email.subject}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{email.goal}</p>
                  </div>
                  <span className="text-gray-600 text-xs">{email.cta}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-green-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🏷️ CRM Pipeline Stages</h3>
              <div className="flex flex-wrap gap-2">
                {funnel.crmStages?.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm">{stage}</span>
                    {i < (funnel.crmStages?.length || 0) - 1 && <span className="text-gray-600">→</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 border border-yellow-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">⭐ Lead Scoring Model</h3>
              <div className="space-y-2">
                {funnel.leadScoring?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{item.action}</span>
                    <span className="text-yellow-400 font-mono">+{item.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {fetching && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading funnel plan...</p>
        </div>
      )}

      {/* Lead & Funnel Worker Agents */}
      <div className="mt-8">
        <h2 className="text-white font-semibold mb-3">Lead & Funnel Worker Agents</h2>
        <div className="grid grid-cols-3 gap-4">
          {FUNNEL_WORKERS.map(worker => (
            <div key={worker.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{worker.icon}</span>
                <span className="text-white font-medium text-sm">{worker.label}</span>
              </div>
              <p className="text-gray-400 text-xs mb-3 leading-relaxed">{worker.description}</p>
              {worker.extraFields.map(field => (
                <div key={field.key} className="mb-3">
                  <label className="text-gray-500 text-xs block mb-1">{field.label}</label>
                  <select
                    value={workerSelections[worker.id] || field.options[0]}
                    onChange={e => setWorkerSelections(prev => ({ ...prev, [worker.id]: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg"
                  >
                    {field.options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                  </select>
                </div>
              ))}
              {workerResults[worker.id] && (
                <p className={`text-xs mb-2 ${workerResults[worker.id].startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {workerResults[worker.id]}
                </p>
              )}
              <button
                onClick={() => runFunnelWorker(worker)}
                disabled={workerLoading[worker.id]}
                className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {workerLoading[worker.id] ? '⏳ Running...' : `Run ${worker.label}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {!funnel && !loading && !fetching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center mt-6">
          <div className="text-5xl mb-4">🔮</div>
          <p className="text-white font-medium mb-2">No funnel plan yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then design your complete funnel.</p>
        </div>
      )}

      {/* Landing Page Preview / Download */}
      {landingPageHtml && (
        <div className="mt-6 bg-gray-900 border border-blue-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">🌐 Landing Page Generated</h3>
            <div className="flex gap-2">
              <button onClick={() => setShowLandingPreview(v => !v)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {showLandingPreview ? 'Hide Preview' : '👁 Preview'}
              </button>
              <button onClick={downloadHtml} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors">
                ⬇ Download HTML
              </button>
            </div>
          </div>
          {showLandingPreview && (
            <iframe
              srcDoc={landingPageHtml}
              className="w-full rounded-lg border border-gray-700"
              style={{ height: '500px' }}
              sandbox="allow-same-origin"
              title="Landing Page Preview"
            />
          )}
        </div>
      )}

      {/* Email Sequence Send Modal */}
      {sendEmailModal && (
        <div className="mt-6 bg-gray-900 border border-indigo-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">📧 Send &quot;{sendEmailModal.sequenceName}&quot;</h3>
            <button onClick={() => { setSendEmailModal(null); setSendResult('') }} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          <p className="text-gray-500 text-xs mb-3">Enter recipients (one per line): <code className="text-gray-400">email@example.com, FirstName</code></p>
          <textarea
            value={sendRecipients}
            onChange={e => setSendRecipients(e.target.value)}
            placeholder={`jane@example.com, Jane\nbob@example.com, Bob`}
            rows={4}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg mb-3 resize-none"
          />
          {sendResult && <p className={`text-xs mb-3 ${sendResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{sendResult}</p>}
          <button onClick={sendEmailSequence} disabled={sending || !sendRecipients.trim()} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
            {sending ? '⏳ Sending...' : '🚀 Send Day-0 Email via Resend'}
          </button>
          <p className="text-gray-600 text-xs mt-2">Requires approved sequence + RESEND_API_KEY configured. Sends day-0 email only; schedule remaining days in your email platform.</p>
        </div>
      )}
    </div>
  )
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300 border-yellow-800',
    approved: 'bg-green-900 text-green-300 border-green-800',
    rejected: 'bg-red-900 text-red-300 border-red-800',
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${map[status] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {status}
    </span>
  )
}
