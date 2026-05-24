'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { ContentCalendarItem } from '@/types'

interface ScheduledPost {
  id: string
  platform: string
  content_json: { content: string }
  scheduled_time: string
  status: string
}

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-900 text-pink-300',
  LinkedIn: 'bg-blue-900 text-blue-300',
  'Twitter/X': 'bg-gray-700 text-gray-300',
  YouTube: 'bg-red-900 text-red-300',
  WhatsApp: 'bg-green-900 text-green-300',
  Email: 'bg-yellow-900 text-yellow-300',
  'Google Ads': 'bg-orange-900 text-orange-300',
  'Meta Ads': 'bg-purple-900 text-purple-300',
}

export default function ContentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState<ContentCalendarItem[]>([])
  const [error, setError] = useState('')
  const [scheduleModal, setScheduleModal] = useState<{ item: ContentCalendarItem } | null>(null)
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduleResult, setScheduleResult] = useState('')
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [showQueue, setShowQueue] = useState(false)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    fetch(`/api/agents/content?workspaceId=${wid}`)
      .then((r) => r.json())
      .then((d) => { if (d?.content_json) setCalendar(d.content_json) })
    fetch(`/api/schedule?workspaceId=${wid}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setScheduledPosts(d) })
  }, [router])

  async function schedulePost() {
    if (!scheduleModal || !scheduleTime) return
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    setScheduling(true); setScheduleResult('')
    try {
      const item = scheduleModal.item
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wid,
          platform: item.platform,
          content: `${item.hook}\n\n${item.topic}\n\nCTA: ${item.cta}`,
          scheduledTime: new Date(scheduleTime).toISOString(),
        }),
      })
      const data = await res.json()
      if (data.error) { setScheduleResult(`Error: ${data.error}`); return }
      setScheduleResult(`Scheduled for ${new Date(scheduleTime).toLocaleString()}`)
      setScheduledPosts(prev => [...prev, data as ScheduledPost])
      setTimeout(() => setScheduleModal(null), 1500)
    } catch (e) { setScheduleResult(`Error: ${String(e)}`) } finally { setScheduling(false) }
  }

  async function dequeue(id: string) {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) return
    await fetch(`/api/schedule?id=${id}&workspaceId=${wid}`, { method: 'DELETE' })
    setScheduledPosts(prev => prev.filter(p => p.id !== id))
  }

  const generate = async () => {
    const workspaceId = localStorage.getItem('workspaceId')
    if (!workspaceId) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.calendar) setCalendar(data.calendar)
      else setError(data.error || 'Generation failed')
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  const weeks = useMemo(() => {
    const grouped: Record<number, ContentCalendarItem[]> = {}
    for (const item of calendar) {
      const week = Math.ceil(item.day / 7)
      if (!grouped[week]) grouped[week] = []
      grouped[week].push(item)
    }
    return grouped
  }, [calendar])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 30-Day Content Calendar</h1>
          <p className="text-gray-400 text-sm mt-1">AI-generated posts for every channel, organized by week</p>
        </div>
        <div className="flex gap-3">
          {scheduledPosts.length > 0 && (
            <button onClick={() => setShowQueue(v => !v)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
              📋 Queue ({scheduledPosts.filter(p => p.status === 'queued').length})
            </button>
          )}
          {calendar.length > 0 && (
            <button onClick={() => router.push('/dashboard/assets')} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
              Next: Generate Assets →
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Generating...' : calendar.length ? '↻ Regenerate' : '⚡ Generate Calendar'}
          </button>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-8 flex items-center gap-4 mb-6">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300">Content Calendar Agent is planning your 30-day schedule...</p>
        </div>
      )}

      {calendar.length > 0 && !loading && (
        <div className="space-y-8">
          {Object.entries(weeks).map(([week, items]) => {
            const w = parseInt(week)
            const startDay = (w - 1) * 7 + 1
            const endDay = Math.min(w * 7, 30)
            return (
              <div key={week}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-white font-semibold">Week {week}</h2>
                  <span className="text-gray-500 text-sm">Days {startDay}–{endDay}</span>
                  <span className="text-xs text-gray-600">{items.length} posts</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {items.map((item, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 font-mono text-sm flex-shrink-0">
                          {item.day}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[item.platform] || 'bg-gray-800 text-gray-300'}`}>
                              {item.platform}
                            </span>
                            <span className="text-gray-500 text-xs">{item.postType}</span>
                            <span className="text-indigo-400 text-xs">{item.pillar}</span>
                            <span className="text-gray-600 text-xs">{item.format}</span>
                          </div>
                          <p className="text-white text-sm font-medium leading-snug">{item.hook}</p>
                          {item.cta && <p className="text-gray-500 text-xs mt-1">CTA: {item.cta}</p>}
                        </div>
                        <button
                          onClick={() => { setScheduleModal({ item }); setScheduleResult(''); setScheduleTime('') }}
                          className="flex-shrink-0 px-2.5 py-1.5 bg-gray-800 hover:bg-indigo-900/40 text-gray-400 hover:text-indigo-300 text-xs rounded-lg border border-gray-700 hover:border-indigo-700 transition-colors"
                        >
                          🗓 Schedule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!calendar.length && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-white font-medium mb-2">No calendar yet</p>
          <p className="text-gray-500 text-sm">Generate your strategy first, then come back to build the calendar.</p>
        </div>
      )}

      {/* Scheduled Queue Panel */}
      {showQueue && scheduledPosts.length > 0 && (
        <div className="mt-8 bg-gray-900 border border-indigo-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">📋 Scheduled Posts Queue</h3>
          <div className="space-y-2">
            {scheduledPosts.map(post => (
              <div key={post.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[post.platform] || 'bg-gray-700 text-gray-300'}`}>{post.platform}</span>
                  <span className="text-gray-300 truncate max-w-xs">{post.content_json?.content?.slice(0, 60)}…</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-gray-500">{new Date(post.scheduled_time).toLocaleString()}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${post.status === 'published' ? 'bg-green-900/40 text-green-400' : post.status === 'failed' ? 'bg-red-900/40 text-red-400' : 'bg-indigo-900/40 text-indigo-300'}`}>{post.status}</span>
                  {post.status === 'queued' && (
                    <button onClick={() => dequeue(post.id)} className="text-gray-600 hover:text-red-400 transition-colors">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-3">Posts are published automatically every hour by the cron job at /api/cron/publish-scheduled.</p>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-indigo-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">🗓 Schedule Post</h3>
              <button onClick={() => setScheduleModal(null)} className="text-gray-600 hover:text-gray-400">✕</button>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 mb-4 text-xs">
              <p className="text-gray-400 mb-1">{scheduleModal.item.platform} · Day {scheduleModal.item.day}</p>
              <p className="text-white">{scheduleModal.item.hook}</p>
            </div>
            <label className="text-gray-400 text-xs block mb-1">Publish at</label>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={e => setScheduleTime(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg mb-4"
            />
            {scheduleResult && <p className={`text-xs mb-3 ${scheduleResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{scheduleResult}</p>}
            <button
              onClick={schedulePost}
              disabled={scheduling || !scheduleTime}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {scheduling ? '⏳ Scheduling...' : '🗓 Schedule Post'}
            </button>
            <p className="text-gray-600 text-xs mt-2 text-center">Requires the platform to be connected in Integrations and the post to be approved.</p>
          </div>
        </div>
      )}
    </div>
  )
}
