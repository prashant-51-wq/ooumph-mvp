'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { LeadGenPlan } from '@/types'

export default function LeadsPage() {
  const router = useRouter()
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<LeadGenPlan | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/agents/leads?workspaceId=${wid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.content_json) {
          setPlan(d.content_json)
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
      const res = await fetch('/api/agents/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.leadPlan) { setPlan(data.leadPlan); setApprovalStatus('pending') }
      else setError(data.error || 'Generation failed')
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">🎯 Lead Generation Plan</h1>
            {approvalStatus && <ApprovalBadge status={approvalStatus} />}
          </div>
          <p className="text-gray-400 text-sm">ICP filters, inbound channels, cold outreach, and qualification rules</p>
        </div>
        <div className="flex gap-3">
          {plan && <button onClick={() => router.push('/dashboard/export')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">Next: Export Plan →</button>}
          <button onClick={generate} disabled={loading} className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Generating...' : plan ? '↻ Regenerate' : '⚡ Generate Lead Gen Plan'}
          </button>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300">Lead Gen Planner Agent is building your acquisition playbook...</p>
        </div>
      )}

      {plan && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-orange-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🔍 ICP Filters</h3>
              <div className="space-y-3 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">Company Size</p><p className="text-gray-300">{plan.icpFilters?.companySize}</p></div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Industries</p>
                  <div className="flex flex-wrap gap-1">{plan.icpFilters?.industries?.map((i, idx) => <span key={idx} className="px-2 py-0.5 rounded bg-orange-900 text-orange-300 text-xs">{i}</span>)}</div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Target Roles</p>
                  <div className="flex flex-wrap gap-1">{plan.icpFilters?.roles?.map((r, idx) => <span key={idx} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">{r}</span>)}</div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Buying Signals</p>
                  <ul className="space-y-1">{plan.icpFilters?.signals?.map((s, idx) => <li key={idx} className="text-gray-400 text-xs">• {s}</li>)}</ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-green-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🔥 Inbound Strategy</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Primary Channels</p>
                  <div className="flex flex-wrap gap-1">{plan.inboundStrategy?.primaryChannels?.map((c, i) => <span key={i} className="px-2 py-0.5 rounded bg-green-900 text-green-300 text-xs">{c}</span>)}</div>
                </div>
                <div><p className="text-gray-500 text-xs mb-1">Content CTA</p><p className="text-gray-300">{plan.inboundStrategy?.contentCTA}</p></div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Lead Magnets</p>
                  <ul className="space-y-1">{plan.inboundStrategy?.leadMagnets?.map((m, i) => <li key={i} className="text-gray-400 text-xs">• {m}</li>)}</ul>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-blue-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">📤 Outbound Playbook</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Cold Email</p>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Subject Line</p>
                    <p className="text-white font-medium">{plan.outboundStrategy?.coldEmailSubject}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Opening</p>
                    <p className="text-gray-300 text-sm">{plan.outboundStrategy?.coldEmailPreview}</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">LinkedIn Sequence</p>
                <div className="space-y-2">
                  {plan.outboundStrategy?.linkedInSequence?.map((step, i) => (
                    <div key={i} className="p-3 rounded-lg bg-gray-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-indigo-400 text-xs font-mono">Step {step.step}</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 text-xs">{step.type}</span>
                      </div>
                      <p className="text-gray-300 text-xs">{step.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">✅ Qualification Rules</h3>
            <div className="space-y-2">
              {plan.qualificationRules?.map((rule, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800">
                  <span className="text-indigo-400 font-mono text-sm">{i + 1}.</span>
                  <p className="text-gray-300 text-sm">{rule}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {fetching && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading lead gen plan...</p>
        </div>
      )}

      {!plan && !loading && !fetching && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-white font-medium mb-2">No lead gen plan yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then build your lead acquisition playbook.</p>
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
