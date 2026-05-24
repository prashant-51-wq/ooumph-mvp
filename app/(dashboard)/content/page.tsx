'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ContentCalendarItem } from '@/types'

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-900 text-pink-300',
  LinkedIn: 'bg-blue-900 text-blue-300',
  'Twitter/X': 'bg-gray-800 text-gray-300',
  YouTube: 'bg-red-900 text-red-300',
  WhatsApp: 'bg-green-900 text-green-300',
  Email: 'bg-yellow-900 text-yellow-300',
}

export default function ContentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState<ContentCalendarItem[]>([])

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (wid) {
      fetch(`/api/agents/content?workspaceId=${wid}`)
        .then((r) => r.json())
        .then((d) => { if (d?.content_json) setCalendar(d.content_json) })
    }
  }, [])

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.calendar) setCalendar(data.calendar)
    } finally { setLoading(false) }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 30-Day Content Calendar</h1>
          <p className="text-gray-400 text-sm mt-1">AI-generated posts for every channel, every day</p>
        </div>
        <div className="flex gap-3">
          {calendar.length > 0 && (
            <button onClick={() => router.push('/assets')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm">
              Next: Generate Assets →
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium">
            {loading ? 'Generating...' : calendar.length ? '↻ Regenerate' : '⚡ Generate Calendar'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300">Content Calendar Agent is planning your 30-day schedule...</p>
        </div>
      )}

      {calendar.length > 0 && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Day', 'Platform', 'Type', 'Pillar', 'Hook', 'CTA', 'Format'].map((h) => (
                  <th key={h} className="text-left text-gray-500 text-xs uppercase tracking-wide pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900">
              {calendar.map((item, i) => (
                <tr key={i} className="hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4 text-gray-500 font-mono text-xs">{item.day}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[item.platform] || 'bg-gray-800 text-gray-300'}`}>
                      {item.platform}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-300 text-xs">{item.postType}</td>
                  <td className="py-3 pr-4 text-indigo-400 text-xs max-w-24 truncate">{item.pillar}</td>
                  <td className="py-3 pr-4 text-white text-xs max-w-48">{item.hook}</td>
                  <td className="py-3 pr-4 text-gray-400 text-xs max-w-32 truncate">{item.cta}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{item.format}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!calendar.length && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-white font-medium mb-2">No calendar yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then come back to build the calendar.</p>
        </div>
      )}
    </div>
  )
}
