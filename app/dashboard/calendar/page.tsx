'use client'

import { useState, useMemo } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day' | 'agenda'
type EventType = 'Content' | 'Campaign' | 'Email' | 'Social' | 'Ads' | 'PR' | 'Meeting' | 'Deadline'
type Recurrence = 'None' | 'Daily' | 'Weekly' | 'Monthly'

interface CalEvent {
  id: string
  title: string
  type: EventType
  date: string       // YYYY-MM-DD
  time?: string      // HH:MM
  allDay?: boolean
  description?: string
  assignee?: string
  linkedCampaign?: string
  completed?: boolean
  color: string
  recurrence?: Recurrence
}

// ─── Event type config ─────────────────────────────────────────────────────────

const EVENT_TYPES: { type: EventType; color: string; bg: string; label: string }[] = [
  { type: 'Content', color: 'bg-blue-600', bg: 'bg-blue-900/30', label: 'Content' },
  { type: 'Campaign', color: 'bg-indigo-600', bg: 'bg-indigo-900/30', label: 'Campaign' },
  { type: 'Email', color: 'bg-green-600', bg: 'bg-green-900/30', label: 'Email Send' },
  { type: 'Social', color: 'bg-pink-600', bg: 'bg-pink-900/30', label: 'Social Post' },
  { type: 'Ads', color: 'bg-yellow-600', bg: 'bg-yellow-900/30', label: 'Ads' },
  { type: 'PR', color: 'bg-purple-600', bg: 'bg-purple-900/30', label: 'PR' },
  { type: 'Meeting', color: 'bg-cyan-600', bg: 'bg-cyan-900/30', label: 'Meeting' },
  { type: 'Deadline', color: 'bg-red-600', bg: 'bg-red-900/30', label: 'Deadline' },
]

function getTypeColor(type: EventType) {
  return EVENT_TYPES.find(t => t.type === type)?.color ?? 'bg-gray-600'
}
function getTypeBg(type: EventType) {
  return EVENT_TYPES.find(t => t.type === type)?.bg ?? 'bg-gray-900/30'
}

// ─── Mock data (realistic, spanning May–June 2026) ─────────────────────────────

const MOCK_EVENTS: CalEvent[] = [
  { id: '1',  title: 'Launch Blog: "AI Marketing Trends 2026"', type: 'Content',  date: '2026-05-26', time: '09:00', color: 'blue',   assignee: 'Content Agent', linkedCampaign: 'May Content Push' },
  { id: '2',  title: 'Weekly Newsletter Send',                   type: 'Email',    date: '2026-05-26', time: '10:00', color: 'green',  assignee: 'Email Agent',   recurrence: 'Weekly' },
  { id: '3',  title: 'LinkedIn Thought Leadership Post',         type: 'Social',   date: '2026-05-26', time: '11:00', color: 'pink',   assignee: 'Social Agent' },
  { id: '4',  title: 'Seed Round PR Distribution',              type: 'PR',       date: '2026-05-27', time: '08:00', color: 'purple', description: 'Distribute to PR Newswire & Business Wire' },
  { id: '5',  title: 'Google Ads Campaign Launch — Summer',     type: 'Ads',      date: '2026-05-27', time: '10:00', color: 'yellow', linkedCampaign: 'Summer Ads' },
  { id: '6',  title: 'Investor Sync — Q2 Update',               type: 'Meeting',  date: '2026-05-27', time: '14:00', color: 'cyan',   assignee: 'Team' },
  { id: '7',  title: 'Instagram Carousel — Product Features',   type: 'Social',   date: '2026-05-28', time: '12:00', color: 'pink',   assignee: 'Social Agent' },
  { id: '8',  title: 'Q2 Campaign Budget Deadline',             type: 'Deadline', date: '2026-05-28', allDay: true,  color: 'red',    description: 'All Q2 campaign budgets must be approved' },
  { id: '9',  title: 'Welcome Email Sequence Go-Live',          type: 'Email',    date: '2026-05-29', time: '09:00', color: 'green',  assignee: 'Email Agent' },
  { id: '10', title: 'TikTok Video: Behind-the-scenes',         type: 'Social',   date: '2026-05-29', time: '13:00', color: 'pink' },
  { id: '11', title: 'Monthly Campaign Review',                 type: 'Campaign', date: '2026-05-30', time: '11:00', color: 'indigo', assignee: 'Team' },
  { id: '12', title: 'Blog: "How We Built Our AI Stack"',       type: 'Content',  date: '2026-05-30', time: '09:00', color: 'blue',   assignee: 'Content Agent' },
  { id: '13', title: 'Meta Ads A/B Test Launch',               type: 'Ads',      date: '2026-06-01', time: '08:00', color: 'yellow', linkedCampaign: 'Summer Ads' },
  { id: '14', title: 'Press Release: Partnership Announcement', type: 'PR',       date: '2026-06-02', time: '09:00', color: 'purple' },
  { id: '15', title: 'Sales Team Standup',                     type: 'Meeting',  date: '2026-06-02', time: '09:30', color: 'cyan',   assignee: 'Team', recurrence: 'Weekly' },
  { id: '16', title: 'Email: June Product Update',             type: 'Email',    date: '2026-06-03', time: '10:00', color: 'green',  assignee: 'Email Agent' },
  { id: '17', title: 'LinkedIn Ads Campaign Start',            type: 'Ads',      date: '2026-06-03', time: '08:00', color: 'yellow' },
  { id: '18', title: 'Content Calendar Review',                type: 'Meeting',  date: '2026-06-04', time: '10:00', color: 'cyan' },
  { id: '19', title: 'Twitter/X Thread: Product Deep-dive',    type: 'Social',   date: '2026-06-05', time: '14:00', color: 'pink' },
  { id: '20', title: 'SEO Audit Report Deadline',              type: 'Deadline', date: '2026-06-05', allDay: true,  color: 'red' },
  { id: '21', title: 'Summer Promotion Campaign Launch',       type: 'Campaign', date: '2026-06-07', time: '08:00', color: 'indigo', linkedCampaign: 'Summer Promo' },
  { id: '22', title: 'Podcast Guest Appearance',               type: 'Meeting',  date: '2026-06-09', time: '15:00', color: 'cyan',   description: 'The Marketing Machine podcast' },
  { id: '23', title: 'Instagram Stories Week',                 type: 'Social',   date: '2026-06-10', time: '09:00', color: 'pink',   recurrence: 'Daily' },
  { id: '24', title: 'Mid-month Email Campaign',               type: 'Email',    date: '2026-06-15', time: '10:00', color: 'green' },
  { id: '25', title: 'Q2 End-of-quarter Report',               type: 'Deadline', date: '2026-06-30', allDay: true,  color: 'red',    description: 'Full Q2 marketing performance report due' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function isSameDay(a: string, b: string) { return a === b }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const TODAY = '2026-05-26'
  const [currentYear, setCurrentYear] = useState(2026)
  const [currentMonth, setCurrentMonth] = useState(4) // 0-indexed: 4 = May
  const [currentDay, setCurrentDay] = useState(26)
  const [view, setView] = useState<ViewMode>('month')
  const [filter, setFilter] = useState<EventType | 'All'>('All')
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [gcalSync, setGcalSync] = useState(false)

  // Add/Edit event form
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState<EventType>('Content')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formAllDay, setFormAllDay] = useState(false)
  const [formDesc, setFormDesc] = useState('')
  const [formRecurrence, setFormRecurrence] = useState<Recurrence>('None')

  function openAddEvent(date?: string) {
    setFormTitle('')
    setFormType('Content')
    setFormDate(date || TODAY)
    setFormTime('')
    setFormAllDay(false)
    setFormDesc('')
    setFormRecurrence('None')
    setQuickAddDate(date || null)
    setShowAddEvent(true)
  }

  const filteredEvents = useMemo(() =>
    filter === 'All' ? MOCK_EVENTS : MOCK_EVENTS.filter(e => e.type === filter),
    [filter]
  )

  function eventsForDay(dateStr: string) {
    return filteredEvents.filter(e => isSameDay(e.date, dateStr))
  }

  function navigateMonth(dir: 1 | -1) {
    let m = currentMonth + dir
    let y = currentYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCurrentMonth(m)
    setCurrentYear(y)
  }

  function goToday() {
    setCurrentYear(2026)
    setCurrentMonth(4)
    setCurrentDay(26)
  }

  const FILTER_TYPES: (EventType | 'All')[] = ['All', 'Content', 'Campaign', 'Email', 'Social', 'Ads', 'PR', 'Meeting', 'Deadline']

  // ── Month grid data
  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const cells: { day: number | null; dateStr: string | null }[] = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: toDateStr(currentYear, currentMonth, d) })
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  // ── Week view: get 7 days starting from currentDay's week
  function getWeekDays() {
    const d = new Date(currentYear, currentMonth, currentDay)
    const dow = d.getDay()
    const start = new Date(d); start.setDate(d.getDate() - dow)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start); day.setDate(start.getDate() + i)
      return {
        label: DAY_NAMES[day.getDay()],
        dayNum: day.getDate(),
        dateStr: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      }
    })
  }

  const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8–20

  const upcomingEvents = useMemo(() =>
    MOCK_EVENTS
      .filter(e => e.date >= TODAY)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5),
    []
  )

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg">📅</div>
            <h1 className="text-lg font-bold text-white">Marketing Calendar</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button onClick={() => navigateMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                ←
              </button>
              <button onClick={goToday} className="px-3 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors">
                Today
              </button>
              <button onClick={() => navigateMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                →
              </button>
            </div>
            <span className="text-white font-semibold text-sm w-32">{MONTH_NAMES[currentMonth]} {currentYear}</span>
            {/* Filter */}
            <select value={filter} onChange={e => setFilter(e.target.value as EventType | 'All')}
              className="px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-xs focus:outline-none focus:border-indigo-500">
              {FILTER_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={() => openAddEvent()} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add Event
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content: Calendar + Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar Area */}
        <div className="flex-1 overflow-auto p-6">

          {/* ═══ MONTH VIEW ═══ */}
          {view === 'month' && (
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-gray-500 text-xs font-semibold uppercase tracking-wider py-2">{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div className="grid grid-cols-7 gap-px bg-gray-800 rounded-xl overflow-hidden border border-gray-800">
                {cells.map((cell, i) => {
                  const isToday = cell.dateStr === TODAY
                  const dayEvents = cell.dateStr ? eventsForDay(cell.dateStr) : []
                  const maxVisible = 3
                  const overflow = dayEvents.length - maxVisible
                  return (
                    <div
                      key={i}
                      onClick={() => { if (cell.dateStr) { openAddEvent(cell.dateStr) } }}
                      className={`min-h-24 p-2 cursor-pointer transition-colors ${
                        cell.day === null
                          ? 'bg-gray-900/50'
                          : isToday
                            ? 'bg-indigo-950/60 hover:bg-indigo-950/80'
                            : 'bg-gray-950 hover:bg-gray-900/80'
                      }`}>
                      {cell.day !== null && (
                        <>
                          <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                            {cell.day}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, maxVisible).map(ev => (
                              <div
                                key={ev.id}
                                onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                                title={ev.title}
                                className={`${getTypeColor(ev.type)} text-white text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity`}>
                                {ev.allDay ? '' : ev.time ? `${ev.time} ` : ''}{ev.title}
                              </div>
                            ))}
                            {overflow > 0 && (
                              <div className="text-gray-500 text-xs px-1.5 cursor-pointer hover:text-white">+{overflow} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ WEEK VIEW ═══ */}
          {view === 'week' && (
            <div>
              {/* Day header row */}
              <div className="grid grid-cols-8 border-b border-gray-800 mb-0">
                <div className="py-2" />
                {getWeekDays().map(day => (
                  <div key={day.dateStr} className={`text-center py-2 ${day.dateStr === TODAY ? 'text-indigo-400' : 'text-gray-400'}`}>
                    <p className="text-xs font-medium">{day.label}</p>
                    <p className={`text-lg font-bold mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto ${day.dateStr === TODAY ? 'bg-indigo-600 text-white' : ''}`}>{day.dayNum}</p>
                  </div>
                ))}
              </div>
              {/* Time slots */}
              <div className="overflow-y-auto max-h-[600px]">
                {HOURS.map(hour => {
                  const weekDays = getWeekDays()
                  return (
                    <div key={hour} className="grid grid-cols-8 border-b border-gray-800/50 min-h-16">
                      <div className="px-2 py-1 text-gray-600 text-xs text-right pr-3">{hour}:00</div>
                      {weekDays.map(day => {
                        const hourStr = `${String(hour).padStart(2, '0')}:00`
                        const evs = filteredEvents.filter(e => e.date === day.dateStr && e.time && e.time.startsWith(String(hour).padStart(2, '0')))
                        return (
                          <div key={day.dateStr} className={`border-l border-gray-800/50 p-0.5 ${day.dateStr === TODAY ? 'bg-indigo-950/20' : ''}`}>
                            {evs.map(ev => (
                              <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                                className={`${getTypeColor(ev.type)} text-white text-xs px-1.5 py-1 rounded mb-0.5 cursor-pointer hover:opacity-80 transition-opacity leading-tight`}>
                                <p className="font-medium truncate">{ev.title}</p>
                                <p className="opacity-75">{ev.time}</p>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ DAY VIEW ═══ */}
          {view === 'day' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setCurrentDay(d => d - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">←</button>
                <h2 className="text-white font-bold text-lg">{DAY_NAMES[new Date(currentYear, currentMonth, currentDay).getDay()]}, {MONTH_NAMES[currentMonth]} {currentDay}, {currentYear}</h2>
                <button onClick={() => setCurrentDay(d => d + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">→</button>
              </div>
              {(() => {
                const dateStr = toDateStr(currentYear, currentMonth, currentDay)
                const dayEvs = eventsForDay(dateStr)
                const allDayEvs = dayEvs.filter(e => e.allDay)
                const timedEvs = dayEvs.filter(e => !e.allDay)
                return (
                  <div>
                    {allDayEvs.length > 0 && (
                      <div className="mb-4">
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">All Day</p>
                        <div className="space-y-2">
                          {allDayEvs.map(ev => (
                            <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                              className={`${getTypeBg(ev.type)} border border-gray-800 rounded-xl p-3 cursor-pointer hover:border-gray-600 transition-colors flex items-center gap-3`}>
                              <span className={`w-2 h-2 rounded-full ${getTypeColor(ev.type)}`} />
                              <p className="text-white text-sm font-medium">{ev.title}</p>
                              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${getTypeColor(ev.type)} text-white opacity-80`}>{ev.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {HOURS.map(hour => {
                        const hourEvs = timedEvs.filter(e => e.time && parseInt(e.time) === hour)
                        return (
                          <div key={hour} className={`flex gap-4 ${hourEvs.length === 0 ? 'opacity-40' : ''}`}>
                            <span className="text-gray-500 text-xs w-14 pt-2 text-right">{hour}:00</span>
                            <div className="flex-1 border-t border-gray-800 min-h-10 pt-1">
                              {hourEvs.map(ev => (
                                <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                                  className={`${getTypeBg(ev.type)} border border-gray-800 rounded-xl p-3 mb-1 cursor-pointer hover:border-gray-600 transition-colors flex items-center gap-3`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getTypeColor(ev.type)}`} />
                                  <div>
                                    <p className="text-white text-sm font-medium">{ev.title}</p>
                                    {ev.description && <p className="text-gray-500 text-xs mt-0.5">{ev.description}</p>}
                                  </div>
                                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${getTypeColor(ev.type)} text-white opacity-80`}>{ev.type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {dayEvs.length === 0 && (
                      <div className="text-center py-16 text-gray-600">
                        <p className="text-4xl mb-3">📭</p>
                        <p className="text-sm">No events on this day</p>
                        <button onClick={() => openAddEvent(dateStr)} className="mt-3 text-indigo-400 text-sm hover:text-indigo-300">+ Add Event</button>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ═══ AGENDA VIEW ═══ */}
          {view === 'agenda' && (
            <div>
              <h2 className="text-white font-semibold mb-4">Upcoming Events</h2>
              {(() => {
                const upcoming = filteredEvents.filter(e => e.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date))
                const grouped: Record<string, CalEvent[]> = {}
                for (const ev of upcoming) {
                  if (!grouped[ev.date]) grouped[ev.date] = []
                  grouped[ev.date].push(ev)
                }
                return Object.entries(grouped).map(([date, evs]) => (
                  <div key={date} className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${date === TODAY ? 'bg-indigo-600' : 'bg-gray-800'}`}>
                        <p className="text-white text-xs font-medium leading-none">{MONTH_NAMES[parseInt(date.split('-')[1]) - 1].slice(0, 3)}</p>
                        <p className="text-white text-base font-bold leading-none">{parseInt(date.split('-')[2])}</p>
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        <p className="text-gray-500 text-xs">{evs.length} event{evs.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="space-y-2 pl-14">
                      {evs.map(ev => (
                        <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                          className={`${getTypeBg(ev.type)} border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors flex items-center gap-4`}>
                          <span className={`w-1 h-10 rounded-full flex-shrink-0 ${getTypeColor(ev.type)}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white text-sm font-medium">{ev.title}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(ev.type)} text-white opacity-80`}>{ev.type}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {ev.allDay ? <span>All day</span> : ev.time && <span>{ev.time}</span>}
                              {ev.assignee && <span>Assigned: {ev.assignee}</span>}
                              {ev.recurrence && ev.recurrence !== 'None' && <span>Repeats {ev.recurrence.toLowerCase()}</span>}
                              {ev.description && <span className="truncate max-w-xs">{ev.description}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {ev.completed && <span className="text-green-400 text-xs">✓ Done</span>}
                            <button className="text-gray-500 hover:text-white text-xs">Edit</button>
                            <button className="text-gray-500 hover:text-red-400 text-xs transition-colors">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-64 border-l border-gray-800 bg-gray-900/50 flex flex-col overflow-y-auto">
          <div className="p-4">
            {/* Mini month navigator */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-xs font-semibold">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                <div className="flex gap-1">
                  <button onClick={() => navigateMonth(-1)} className="text-gray-500 hover:text-white text-xs px-1">←</button>
                  <button onClick={() => navigateMonth(1)} className="text-gray-500 hover:text-white text-xs px-1">→</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-px">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="text-center text-gray-600 text-xs py-1">{d}</div>
                ))}
                {Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }, (_, i) => (
                  <div key={`e${i}`} />
                ))}
                {Array.from({ length: getDaysInMonth(currentYear, currentMonth) }, (_, i) => {
                  const d = i + 1
                  const ds = toDateStr(currentYear, currentMonth, d)
                  const hasEv = MOCK_EVENTS.some(e => e.date === ds)
                  const isT = ds === TODAY
                  return (
                    <button key={d} onClick={() => { setCurrentDay(d); setView('day') }}
                      className={`text-center text-xs py-1 rounded-full transition-colors ${isT ? 'bg-indigo-600 text-white font-bold' : hasEv ? 'text-indigo-400 hover:text-white' : 'text-gray-500 hover:text-white'}`}>
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Upcoming events */}
            <div className="mb-6">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Upcoming</p>
              <div className="space-y-2">
                {upcomingEvents.map(ev => (
                  <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                    className="flex items-start gap-2 cursor-pointer hover:bg-gray-800 rounded-lg p-1.5 transition-colors -mx-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${getTypeColor(ev.type)}`} />
                    <div className="min-w-0">
                      <p className="text-gray-300 text-xs font-medium leading-snug truncate">{ev.title}</p>
                      <p className="text-gray-600 text-xs">{ev.date.split('-').slice(1).join('/')} {ev.time || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mb-6">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Legend</p>
              <div className="space-y-1.5">
                {EVENT_TYPES.map(et => (
                  <div key={et.type} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${et.color}`} />
                    <span className="text-gray-400 text-xs">{et.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Google Calendar sync */}
            <div className="bg-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-gray-300 text-xs font-medium">Sync Google Calendar</p>
                <button onClick={() => setGcalSync(s => !s)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${gcalSync ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${gcalSync ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {gcalSync && <p className="text-green-400 text-xs mt-2">Syncing with Google Calendar</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ADD/EDIT EVENT MODAL ═══ */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-bold">Add Event</h2>
              <button onClick={() => setShowAddEvent(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Title</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  placeholder="Event title..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              {/* Event type */}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-2">Event Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {EVENT_TYPES.map(et => (
                    <button key={et.type} onClick={() => setFormType(et.type)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${formType === et.type ? `${et.color} text-white` : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}>
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Time</label>
                  <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} disabled={formAllDay}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-40" />
                </div>
              </div>
              {/* All day toggle */}
              <div className="flex items-center gap-3">
                <button onClick={() => setFormAllDay(s => !s)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${formAllDay ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formAllDay ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-gray-400 text-sm">All-day event</span>
              </div>
              {/* Recurrence */}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Recurrence</label>
                <select value={formRecurrence} onChange={e => setFormRecurrence(e.target.value as Recurrence)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {(['None', 'Daily', 'Weekly', 'Monthly'] as Recurrence[]).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {/* Description */}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Description</label>
                <textarea rows={3} value={formDesc} onChange={e => setFormDesc(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
              {/* Assign / Link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Assign To</label>
                  <select className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">Nobody</option>
                    <option>Content Agent</option>
                    <option>Social Agent</option>
                    <option>Email Agent</option>
                    <option>Team</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Link to Campaign</label>
                  <select className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">None</option>
                    <option>May Content Push</option>
                    <option>Summer Ads</option>
                    <option>Summer Promo</option>
                  </select>
                </div>
              </div>
              {/* Reminder */}
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Reminder</label>
                <select className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option>No reminder</option>
                  <option>1 hour before</option>
                  <option>1 day before</option>
                  <option>1 week before</option>
                </select>
              </div>
              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddEvent(false)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Add to Calendar
                </button>
                <button onClick={() => setShowAddEvent(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EVENT DETAIL SLIDE-OVER ═══ */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-40 flex items-start justify-end" onClick={() => setSelectedEvent(null)}>
          <div className="w-80 h-full bg-gray-900 border-l border-gray-800 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${getTypeColor(selectedEvent.type)}`} />
                <span className="text-gray-400 text-xs">{selectedEvent.type}</span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <h3 className="text-white font-bold text-base leading-snug">{selectedEvent.title}</h3>
              <div className="space-y-2">
                {[
                  { label: 'Date', value: selectedEvent.date },
                  selectedEvent.time ? { label: 'Time', value: selectedEvent.time } : null,
                  selectedEvent.allDay ? { label: 'Duration', value: 'All day' } : null,
                  selectedEvent.assignee ? { label: 'Assigned to', value: selectedEvent.assignee } : null,
                  selectedEvent.linkedCampaign ? { label: 'Campaign', value: selectedEvent.linkedCampaign } : null,
                  selectedEvent.recurrence && selectedEvent.recurrence !== 'None' ? { label: 'Recurrence', value: selectedEvent.recurrence } : null,
                ].filter(Boolean).map(row => row && (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">{row.label}</span>
                    <span className="text-white text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
              {selectedEvent.description && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <p className="text-gray-400 text-xs mb-1">Notes</p>
                  <p className="text-gray-300 text-sm">{selectedEvent.description}</p>
                </div>
              )}
              <div className="flex flex-col gap-2 pt-2">
                {/* Mark complete */}
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                  <span className="text-gray-300 text-sm">Mark Complete</span>
                  <button
                    className={`relative w-9 h-5 rounded-full transition-colors ${selectedEvent.completed ? 'bg-green-600' : 'bg-gray-700'}`}
                    onClick={() => setSelectedEvent(ev => ev ? { ...ev, completed: !ev.completed } : null)}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${selectedEvent.completed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <button onClick={() => { setSelectedEvent(null); openAddEvent(selectedEvent.date) }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Edit Event
                </button>
                <button className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700">
                  Duplicate
                </button>
                <button onClick={() => setSelectedEvent(null)}
                  className="w-full bg-gray-800 hover:bg-red-900/30 text-red-400 py-2.5 rounded-xl text-sm font-medium transition-colors border border-gray-700 hover:border-red-800">
                  Delete Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
