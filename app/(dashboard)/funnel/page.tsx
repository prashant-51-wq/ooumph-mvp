'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { FunnelPlan } from '@/types'

export default function FunnelPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [funnel, setFunnel] = useState<FunnelPlan | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (wid) {
      fetch(`/api/agents/funnel?workspaceId=${wid}`)
        .then((r) => r.json())
        .then((d) => { if (d?.content_json) setFunnel(d.content_json) })
    }
  }, [])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch('/api/agents/funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.funnel) setFunnel(data.funnel)
    } finally { setLoading(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">🔮 Funnel Blueprint</h1>
          <p className="text-gray-400 text-sm mt-1">Lead magnet, landing page, email nurture, and CRM stages</p>
        </div>
        <div className="flex gap-3">
          {funnel && <button onClick={() => router.push('/leads')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm">Next: Lead Gen Plan →</button>}
          <button onClick={generate} disabled={loading} className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium">
            {loading ? 'Generating...' : funnel ? '↻ Regenerate' : '⚡ Generate Funnel Plan'}
          </button>
        </div>
      </div>

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

      {!funnel && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🔮</div>
          <p className="text-white font-medium mb-2">No funnel plan yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then design your complete funnel.</p>
        </div>
      )}
    </div>
  )
}
