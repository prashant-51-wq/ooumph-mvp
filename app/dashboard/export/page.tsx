'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ExportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setReady(true)
  }, [router])

  const exportPlan = async (format: string) => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/export?workspaceId=${workspaceId}&format=${format}`)
      if (format === 'docx') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ooumph-marketing-plan-${Date.now()}.docx`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ooumph-marketing-plan-${Date.now()}.json`
        a.click()
      }
    } finally { setLoading(false) }
  }

  if (!ready) return null

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">📄 Export Marketing Plan</h1>
        <p className="text-gray-400 text-sm mt-1">Download your complete AI-generated marketing plan as a client-ready document. Only approved artifacts are included.</p>
      </div>

      <div className="grid grid-cols-2 gap-6 max-w-2xl">
        <ExportCard
          icon="📝"
          format="DOCX"
          label="Word Document"
          desc="Full marketing plan with strategy, calendar, assets, funnel, and lead gen. Ready for client presentation."
          onClick={() => exportPlan('docx')}
          loading={loading}
          color="indigo"
        />
        <ExportCard
          icon="🔧"
          format="JSON"
          label="Raw Data (JSON)"
          desc="All structured data from every agent run. Use for developers or to import into other tools."
          onClick={() => exportPlan('json')}
          loading={loading}
          color="gray"
        />
      </div>

      <div className="mt-8 p-5 rounded-xl bg-gray-900 border border-gray-800">
        <p className="text-white font-medium text-sm mb-3">📋 What's included in the export</p>
        <ul className="space-y-2 text-sm text-gray-400">
          {[
            'Marketing Strategy (positioning, ICP, content pillars, KPIs)',
            '30-Day Content Calendar (week-by-week breakdown)',
            '5 Marketing Assets (carousel, reel script, ad copy, email, LinkedIn)',
            'Funnel Blueprint (lead magnet, landing page, nurture sequence)',
            'Lead Generation Plan (inbound + outbound playbook)',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-600 mt-3">Approved versions are used when available; latest draft is used as fallback.</p>
      </div>
    </div>
  )
}

function ExportCard({ icon, format, label, desc, onClick, loading, color }: {
  icon: string; format: string; label: string; desc: string
  onClick: () => void; loading: boolean; color: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="text-3xl mb-3">{icon}</div>
      <p className="text-white font-semibold mb-1">{label}</p>
      <p className="text-xs text-gray-500 mb-1 font-mono">.{format.toLowerCase()}</p>
      <p className="text-gray-400 text-sm mb-5">{desc}</p>
      <button onClick={onClick} disabled={loading}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
          color === 'indigo'
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
            : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
        }`}>
        {loading ? 'Generating...' : `Download ${format}`}
      </button>
    </div>
  )
}
