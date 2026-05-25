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

const PLATFORM_DOT: Record<string, string> = {
  Instagram: 'bg-pink-500',
  LinkedIn: 'bg-blue-500',
  'Twitter/X': 'bg-gray-400',
  YouTube: 'bg-red-500',
  WhatsApp: 'bg-green-500',
  Email: 'bg-yellow-500',
  'Google Ads': 'bg-orange-500',
  'Meta Ads': 'bg-purple-500',
}

type View = 'calendar' | 'list'

function SkeletonCalendar() {
  return (
    <div className="grid grid-cols-7 gap-1 animate-pulse">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="h-6 bg-gray-800 rounded text-center text-xs text-gray-600 flex items-center justify-center">{d}</div>
      ))}
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="h-20 bg-gray-800 rounded-lg" />
      ))}
    </div>
  )
}

export default function ContentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [calendar, setCalendar] = useState<ContentCalendarItem[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('calendar')
  const [scheduleModal, setScheduleModal] = useState<{ item: ContentCalendarItem } | null>(null)
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduleResult, setScheduleResult] = useState('')
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [showQueue, setShowQueue] = useState(false)
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) { router.push('/dashboard/onboarding'); return }
    setFetching(true)
    Promise.all([
      fetch(`/api/agents/content?workspaceId=${wid}`).then(r => r.json()),
      fetch(`/api/schedule?workspaceId=${wid}`).then(r => r.json()),
    ]).then(([d, sched]) => {
      if (d?.content_json) setCalendar(d.content_json)
      if (Array.isArray(sched)) setScheduledPosts(sched)
    }).finally(() => setFetching(false))
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

  // Group AI calendar plan by day number
  const byDay = useMemo(() => {
    const map: Record<number, ContentCalendarItem[]> = {}
    for (const item of calendar) {
      if (!map[item.day]) map[item.day] = []
      map[item.day].push(item)
    }
    return map
  }, [calendar])

  // Map real scheduled_posts to day numbers relative to today (day 1 = today)
  const scheduledByDay = useMemo(() => {
    const map: Record<number, ScheduledPost[]> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const post of scheduledPosts) {
      const postDate = new Date(post.scheduled_time)
      postDate.setHours(0, 0, 0, 0)
      const diffDays = Math.round((postDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (diffDays >= 1 && diffDays <= 35) {
        if (!map[diffDays]) map[diffDays] = []
        map[diffDays].push(post)
      }
    }
    return map
  }, [scheduledPosts])

  // Group by week for list view
  const weeks = useMemo(() => {
    const grouped: Record<number, ContentCalendarItem[]> = {}
    for (const item of calendar) {
      const week = Math.ceil(item.day / 7)
      if (!grouped[week]) grouped[week] = []
      grouped[week].push(item)
    }
    return grouped
  }, [calendar])

  // Build 35-cell calendar grid (5 weeks × 7 days)
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 30-Day Content Calendar</h1>
          <p className="text-gray-400 text-sm mt-1">AI-generated posts for every channel</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {(['calendar', 'list'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {v === 'calendar' ? '📆 Grid' : '☰ List'}
              </button>
            ))}
          </div>

          {scheduledPosts.length > 0 && (
            <button onClick={() => setShowQueue(v => !v)} className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
              📋 Queue ({scheduledPosts.filter(p => p.status === 'queued').length})
            </button>
          )}
          {calendar.length > 0 && (
            <button onClick={() => router.push('/dashboard/assets')} className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors hidden sm:block">
              Next: Assets →
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? '⏳ Generating...' : calendar.length ? '↻ Regenerate' : '⚡ Generate'}
          </button>
        </div>
      </div>

      {error && <div className="mb-5 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="bg-gray-900 border border-indigo-800 rounded-xl p-6 flex items-center gap-4 mb-5">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-gray-300 text-sm">Content Calendar Agent is planning your 30-day schedule...</p>
        </div>
      )}

      {fetching && !loading && <SkeletonCalendar />}

      {!fetching && !loading && (
        <>
          {/* ── CALENDAR GRID VIEW ─────────────────────────── */}
          {view === 'calendar' && (
            <div>
              {calendar.length > 0 ? (
                <>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    {Object.entries(PLATFORM_DOT).map(([platform, dot]) => {
                      const hasPosts = calendar.some(c => c.platform === platform)
                      if (!hasPosts) return null
                      return (
                        <div key={platform} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          <span className="text-gray-500 text-xs">{platform}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {DAYS.map(d => (
                      <div key={d} className="text-center text-xs font-medium text-gray-600 py-1">{d}</div>
                    ))}
                  </div>

                  {/* 5 weeks × 7 days = 35 cells */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 35 }, (_, i) => {
                      const day = i + 1
                      const posts = byDay[day] || []
                      const scheduled = scheduledByDay[day] || []
                      const hasAnything = posts.length > 0 || scheduled.length > 0
                      const isHovered = hoveredDay === day
                      return (
                        <div
                          key={day}
                          onMouseEnter={() => setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`relative min-h-20 rounded-lg border p-1.5 transition-colors cursor-default ${
                            hasAnything
                              ? isHovered
                                ? 'border-indigo-600 bg-indigo-950/40'
                                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                              : 'border-gray-800 bg-gray-900/50'
                          }`}
                        >
                          {/* Day number */}
                          <div className={`text-xs font-medium mb-1 ${hasAnything ? 'text-gray-300' : 'text-gray-700'}`}>
                            {day}
                          </div>

                          {/* AI plan dots */}
                          <div className="space-y-0.5">
                            {posts.slice(0, 2).map((post, pi) => (
                              <div
                                key={pi}
                                onClick={() => { setScheduleModal({ item: post }); setScheduleResult(''); setScheduleTime('') }}
                                className="flex items-center gap-1 cursor-pointer group"
                                title={post.hook}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PLATFORM_DOT[post.platform] || 'bg-gray-600'}`} />
                                <span className="text-gray-400 text-xs truncate group-hover:text-white transition-colors leading-tight">
                                  {post.hook.slice(0, 16)}{post.hook.length > 16 ? '…' : ''}
                                </span>
                              </div>
                            ))}
                            {posts.length > 2 && (
                              <div className="text-gray-600 text-xs">+{posts.length - 2} planned</div>
                            )}
                          </div>

                          {/* Real scheduled posts from DB — green indicators */}
                          {scheduled.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {scheduled.slice(0, 2).map((sp, si) => (
                                <div key={si} className="flex items-center gap-1" title={`Scheduled: ${sp.platform} at ${new Date(sp.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sp.status === 'published' ? 'bg-green-500' : sp.status === 'failed' ? 'bg-red-500' : 'bg-emerald-400'}`} />
                                  <span className="text-emerald-400 text-xs truncate leading-tight">
                                    {sp.status === 'published' ? '✓' : '📅'} {sp.platform}
                                  </span>
                                </div>
                              ))}
                              {scheduled.length > 2 && (
                                <div className="text-emerald-600 text-xs">+{scheduled.length - 2} scheduled</div>
                              )}
                            </div>
                          )}

                          {/* Hover tooltip */}
                          {isHovered && hasAnything && (
                            <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-xl">
                              {/* AI plan items */}
                              {posts.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 mb-2">📋 Plan — {posts.length} post{posts.length > 1 ? 's' : ''}</p>
                                  {posts.map((post, pi) => (
                                    <div key={pi} className="mb-2 last:mb-0">
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${PLATFORM_DOT[post.platform] || 'bg-gray-600'}`} />
                                        <span className="text-xs text-gray-400">{post.platform}</span>
                                      </div>
                                      <p className="text-white text-xs leading-snug">{post.hook}</p>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setScheduleModal({ item: post }); setScheduleResult(''); setScheduleTime('') }}
                                        className="mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                                      >
                                        🗓 Schedule →
                                      </button>
                                    </div>
                                  ))}
                                </>
                              )}
                              {/* Real scheduled posts */}
                              {scheduled.length > 0 && (
                                <>
                                  {posts.length > 0 && <div className="border-t border-gray-700 my-2" />}
                                  <p className="text-xs text-emerald-500 mb-2">📅 Scheduled — {scheduled.length}</p>
                                  {scheduled.map((sp, si) => (
                                    <div key={si} className="mb-1.5 last:mb-0 flex items-start gap-1.5">
                                      <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${sp.status === 'published' ? 'bg-green-500' : sp.status === 'failed' ? 'bg-red-500' : 'bg-emerald-400'}`} />
                                      <div>
                                        <span className="text-xs text-gray-300">{sp.platform}</span>
                                        <span className="text-xs text-gray-600 ml-1">{new Date(sp.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        <p className={`text-xs mt-0.5 ${sp.status === 'published' ? 'text-green-400' : sp.status === 'failed' ? 'text-red-400' : 'text-emerald-400'}`}>
                                          {sp.status}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <EmptyState onGenerate={generate} loading={loading} />
              )}
            </div>
          )}

          {/* ── LIST VIEW ──────────────────────────────────── */}
          {view === 'list' && (
            <div>
              {calendar.length > 0 ? (
                <div className="space-y-8">
                  {Object.entries(weeks).map(([week, items]) => {
                    const w = parseInt(week)
                    const startDay = (w - 1) * 7 + 1
                    const endDay = Math.min(w * 7, 30)
                    return (
                      <div key={week}>
                        <div className="flex items-center gap-3 mb-4">
                          <h2 className="text-white font-semibold text-sm">Week {week}</h2>
                          <span className="text-gray-500 text-xs">Days {startDay}–{endDay}</span>
                          <span className="text-gray-600 text-xs">({items.length} posts)</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {items.map((item, i) => (
                            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                              <div className="flex items-start gap-4">
                                <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 font-mono text-xs flex-shrink-0">
                                  {item.day}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[item.platform] || 'bg-gray-800 text-gray-300'}`}>
                                      {item.platform}
                                    </span>
                                    <span className="text-gray-500 text-xs">{item.postType}</span>
                                    <span className="text-indigo-400 text-xs">{item.pillar}</span>
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
              ) : (
                <EmptyState onGenerate={generate} loading={loading} />
              )}
            </div>
          )}
        </>
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
          <p className="text-gray-600 text-xs mt-3">Posts publish automatically via the scheduled cron job.</p>
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
            <div className="bg-gray-800 rounded-lg p-3 mb-4 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs ${PLATFORM_COLORS[scheduleModal.item.platform] || 'bg-gray-700 text-gray-300'}`}>{scheduleModal.item.platform}</span>
                <span className="text-gray-500">Day {scheduleModal.item.day}</span>
              </div>
              <p className="text-white">{scheduleModal.item.hook}</p>
              {scheduleModal.item.cta && <p className="text-gray-400">CTA: {scheduleModal.item.cta}</p>}
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
            <p className="text-gray-600 text-xs mt-2 text-center">Requires platform connection in Connections.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      {/* Skeleton calendar grid */}
      <div className="p-4 border-b border-gray-800">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs text-gray-700 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-800/50 border border-gray-800 p-1.5">
              <div className="text-xs text-gray-700">{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-8 text-center">
        <p className="text-white font-medium mb-2">Calendar is empty</p>
        <p className="text-gray-500 text-sm mb-4">Generate your strategy first, then create a 30-day plan.</p>
        <button onClick={onGenerate} disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
          {loading ? '⏳ Generating...' : '⚡ Generate Calendar'}
        </button>
      </div>
    </div>
  )
}
