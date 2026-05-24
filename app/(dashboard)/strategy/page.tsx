'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Strategy } from '@/types'

export default function StrategyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (wid) {
      fetch(`/api/agents/strategy?workspaceId=${wid}`)
        .then((r) => r.json())
        .then((d) => { if (d?.content_json) setStrategy(d.content_json) })
    }
  }, [])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) { setError('Complete onboarding first'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/agents/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.strategy) setStrategy(data.strategy)
      else setError(data.error || 'Generation failed')
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">🧠 Marketing Strategy</h1>
          <p className="text-gray-400 text-sm mt-1">AI-generated positioning, ICP, content pillars, and KPIs</p>
        </div>
        <div className="flex gap-3">
          {strategy && (
            <button onClick={() => router.push('/content')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
              Next: Content Calendar →
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2">
            {loading ? <><Spinner /> Generating...</> : strategy ? '↻ Regenerate' : '⚡ Generate Strategy'}
          </button>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {loading && <LoadingCard label="AI Strategy Agent is analysing your business..." />}

      {strategy && !loading && (
        <div className="space-y-6">
          <Card title="🎯 Positioning" color="indigo">
            <p className="text-gray-200">{strategy.positioning}</p>
          </Card>

          <Card title="💡 Unique Value Proposition" color="purple">
            <p className="text-gray-200 text-lg font-medium">{strategy.uniqueValueProposition}</p>
          </Card>

          <Card title="📈 30-Day Objective" color="blue">
            <p className="text-gray-200">{strategy.thirtyDayObjective}</p>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card title="👤 Ideal Customer Profile" color="green">
              <div className="space-y-3 text-sm">
                <Section label="Demographics">{strategy.icp?.demographics}</Section>
                <Section label="Psychographics">{strategy.icp?.psychographics}</Section>
                <Section label="Pain Points">
                  <ul className="space-y-1">{strategy.icp?.painPoints?.map((p, i) => <li key={i} className="text-gray-300">• {p}</li>)}</ul>
                </Section>
                <Section label="Buying Triggers">
                  <ul className="space-y-1">{strategy.icp?.buyingTriggers?.map((t, i) => <li key={i} className="text-gray-300">• {t}</li>)}</ul>
                </Section>
                <Section label="Objections">
                  <ul className="space-y-1">{strategy.icp?.objections?.map((o, i) => <li key={i} className="text-gray-300">• {o}</li>)}</ul>
                </Section>
              </div>
            </Card>

            <Card title="📊 KPIs" color="yellow">
              <div className="space-y-3">
                {strategy.kpis?.map((kpi, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-800">
                    <p className="text-white text-sm font-medium">{kpi.metric}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-indigo-400 text-xs">{kpi.target}</span>
                      <span className="text-gray-500 text-xs">{kpi.timeframe}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="🏛️ Content Pillars" color="pink">
            <div className="grid grid-cols-3 gap-4">
              {strategy.contentPillars?.map((p, i) => (
                <div key={i} className="p-4 rounded-lg bg-gray-800">
                  <p className="text-white font-medium text-sm mb-1">{p.name}</p>
                  <p className="text-gray-400 text-xs mb-3">{p.description}</p>
                  <ul className="space-y-1">
                    {p.topics?.map((t, j) => <li key={j} className="text-gray-500 text-xs">• {t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card title="📡 Channel Strategy" color="indigo">
            <div className="divide-y divide-gray-800">
              {strategy.channelStrategy?.map((ch, i) => (
                <div key={i} className="py-3 flex items-center justify-between">
                  <span className="text-white text-sm font-medium">{ch.channel}</span>
                  <span className="text-gray-400 text-xs">{ch.frequency}</span>
                  <span className="text-gray-500 text-xs">{ch.contentType}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!strategy && !loading && (
        <EmptyState
          icon="🧠"
          title="Strategy not generated yet"
          desc="Click 'Generate Strategy' to have your AI Strategy Agent create a complete marketing plan."
        />
      )}
    </div>
  )
}

function Card({ title, children, color }: { title: string; children: React.ReactNode; color: string }) {
  const border: Record<string, string> = { indigo: 'border-indigo-800', purple: 'border-purple-800', blue: 'border-blue-800', green: 'border-green-800', yellow: 'border-yellow-800', pink: 'border-pink-800' }
  return (
    <div className={`bg-gray-900 border ${border[color] || 'border-gray-800'} rounded-xl p-6`}>
      <h3 className="text-white font-semibold mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-300">{label}</p>
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-white font-medium mb-2">{title}</p>
      <p className="text-gray-500 text-sm">{desc}</p>
    </div>
  )
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
}
