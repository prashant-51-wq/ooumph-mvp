'use client'

/**
 * /dashboard/calendar — Calendar Agent dashboard
 * Shows: upcoming bookings, booking link, agent actions, availability settings
 */
import { useState, useEffect, useCallback } from 'react'

interface Booking {
  id: string
  contact_name: string
  contact_email: string
  title: string
  start_time: string
  end_time: string
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
  meeting_url: string | null
  notes: string | null
  reminder_sent: number
}

interface Availability {
  days_of_week: string | number[]
  start_hour: number
  end_hour: number
  slot_minutes: number
  timezone: string
  buffer_minutes: number
  advance_days: number
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed: { bg: '#1e3a5f', color: '#60a5fa', label: '📅 Confirmed' },
    completed: { bg: '#1e3a2f', color: '#6ee7b7', label: '✅ Completed' },
    cancelled: { bg: '#2d1a1a', color: '#fca5a5', label: '❌ Cancelled' },
    no_show: { bg: '#3b1f00', color: '#fbbf24', label: '👻 No-show' },
    rescheduled: { bg: '#1e2d3d', color: '#a5b4fc', label: '🔄 Rescheduled' },
  }
  return map[status] || { bg: '#1f2937', color: '#9ca3af', label: status }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  if (mins < 60) return diff > 0 ? `in ${mins}m` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return diff > 0 ? `in ${hrs}h` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return diff > 0 ? `in ${days}d` : `${days}d ago`
}

export default function CalendarPage() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'all' | 'settings'>('upcoming')
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult] = useState<string | null>(null)
  const [savingAvail, setSavingAvail] = useState(false)
  const [pipelineData, setPipelineData] = useState<{ summary?: string; insights?: string[]; recommendations?: string[] } | null>(null)
  const [bookingLink, setBookingLink] = useState('')
  const [copied, setCopied] = useState(false)

  // Availability form
  const [availForm, setAvailForm] = useState({
    startHour: 9, endHour: 17, slotMinutes: 30, bufferMinutes: 10,
    timezone: 'UTC', advanceDays: 14,
    daysOfWeek: [1, 2, 3, 4, 5],
  })

  useEffect(() => {
    const raw = localStorage.getItem('ooumph_workspace')
    const ws = raw ? (JSON.parse(raw) as { id?: string }) : null
    const id = ws?.id || ''
    setWorkspaceId(id)
    if (id) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
      setBookingLink(`${base}/book/${id}`)
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!workspaceId) return
    const res = await fetch(`/api/calendar?workspaceId=${workspaceId}&upcoming=${activeTab === 'upcoming' ? '1' : '0'}${activeTab === 'all' ? '' : ''}`)
    if (res.ok) {
      const data = await res.json() as { bookings: Booking[]; availability: Availability | null }
      setBookings(data.bookings)
      if (data.availability) {
        setAvailability(data.availability)
        const days = typeof data.availability.days_of_week === 'string'
          ? JSON.parse(data.availability.days_of_week) as number[]
          : data.availability.days_of_week
        setAvailForm({
          startHour: data.availability.start_hour,
          endHour: data.availability.end_hour,
          slotMinutes: data.availability.slot_minutes,
          bufferMinutes: data.availability.buffer_minutes,
          timezone: data.availability.timezone,
          advanceDays: data.availability.advance_days,
          daysOfWeek: days,
        })
      }
    }
  }, [workspaceId, activeTab])

  useEffect(() => { void loadData() }, [loadData])

  async function runAgent(mode: string, extra?: Record<string, string>) {
    if (!workspaceId) return
    setAgentLoading(true)
    setAgentResult(null)
    const res = await fetch('/api/agents/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, mode, bookingId: selectedBooking?.id, ...extra }),
    })
    const data = await res.json() as Record<string, unknown>
    if (mode === 'analyze_pipeline' && data.pipeline) {
      const p = data.pipeline as { summary?: string; insights?: string[]; recommendations?: string[] }
      setPipelineData(p)
    } else if (data.email) {
      const e = data.email as { subject?: string; body?: string; nextStep?: string; reasoning?: string }
      setAgentResult(`Subject: ${e.subject || ''}\n\n${e.body || ''}${e.nextStep ? `\n\nNext step: ${e.nextStep}` : ''}`)
    } else if (data.summary) {
      setAgentResult(String(data.summary))
    }
    setAgentLoading(false)
    void loadData()
  }

  async function saveAvailability() {
    if (!workspaceId) return
    setSavingAvail(true)
    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, ...availForm }),
    })
    setSavingAvail(false)
    void loadData()
  }

  function copyLink() {
    void navigator.clipboard.writeText(bookingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleDay(d: number) {
    setAvailForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d].sort(),
    }))
  }

  const s = {
    page: { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
    header: { marginBottom: '24px' },
    title: { fontSize: '22px', fontWeight: 700, color: '#e5e7eb', marginBottom: '4px' },
    sub: { fontSize: '13px', color: '#6b7280' },

    tabs: { display: 'flex', gap: '8px', marginBottom: '24px' },
    tab: (active: boolean) => ({
      padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      background: active ? '#4f46e5' : '#1f2937', color: active ? '#fff' : '#9ca3af',
      fontSize: '13px', fontWeight: active ? 600 : 400,
    }),

    linkBox: {
      background: '#111827', border: '1px solid #1f2937', borderRadius: '12px',
      padding: '14px 18px', marginBottom: '20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    },
    linkText: { fontSize: '13px', color: '#818cf8', fontFamily: 'monospace', wordBreak: 'break-all' as const },
    btn: (v: 'primary' | 'ghost' | 'danger' | 'green') => ({
      padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
      background: v === 'primary' ? '#4f46e5' : v === 'green' ? '#065f46' : v === 'danger' ? '#7f1d1d' : '#1f2937',
      color: v === 'primary' ? '#fff' : v === 'green' ? '#6ee7b7' : v === 'danger' ? '#fca5a5' : '#9ca3af',
      whiteSpace: 'nowrap' as const,
    }),

    grid: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' } as React.CSSProperties,
    bookingList: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
    bookingCard: (selected: boolean) => ({
      background: '#111827', border: `1px solid ${selected ? '#4f46e5' : '#1f2937'}`,
      borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
    }),
    agentPanel: {
      background: '#111827', border: '1px solid #1f2937', borderRadius: '12px',
      padding: '18px', alignSelf: 'start' as const,
    },
    sectionTitle: { fontSize: '10px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '12px' },

    input: {
      width: '100%', padding: '8px 12px', background: '#1f2937', border: '1px solid #374151',
      borderRadius: '8px', color: '#e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const,
    },
    dayBtn: (on: boolean) => ({
      width: '32px', height: '32px', borderRadius: '6px', border: 'none', cursor: 'pointer',
      background: on ? '#4f46e5' : '#1f2937', color: on ? '#fff' : '#6b7280', fontSize: '11px', fontWeight: 600,
    }),
  }

  const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>📅 Calendar</div>
        <div style={s.sub}>Manage bookings, send reminders, handle no-shows</div>
      </div>

      {/* Booking link bar */}
      {bookingLink && (
        <div style={s.linkBox}>
          <div>
            <div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '4px', fontWeight: 600 }}>YOUR BOOKING LINK</div>
            <div style={s.linkText}>{bookingLink}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button style={s.btn('ghost')} onClick={copyLink}>{copied ? '✓ Copied' : '📋 Copy'}</button>
            <a href={bookingLink} target="_blank" rel="noreferrer" style={{ ...s.btn('primary'), textDecoration: 'none' }}>↗ Preview</a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {(['upcoming', 'all', 'settings'] as const).map(t => (
          <button key={t} style={s.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
            {t === 'upcoming' ? '📅 Upcoming' : t === 'all' ? '📋 All Bookings' : '⚙️ Availability'}
          </button>
        ))}
        <button style={{ ...s.btn('ghost'), marginLeft: 'auto' }} onClick={() => void runAgent('analyze_pipeline')} disabled={agentLoading}>
          {agentLoading ? '⏳' : '🤖 Analyse Pipeline'}
        </button>
      </div>

      {/* Pipeline analysis result */}
      {pipelineData && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
          <div style={s.sectionTitle}>Pipeline Analysis</div>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>{pipelineData.summary}</div>
          {pipelineData.insights?.map((ins, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>💡 {ins}</div>
          ))}
          {pipelineData.recommendations?.map((rec, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#818cf8', marginTop: '4px' }}>→ {rec}</div>
          ))}
        </div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '24px', maxWidth: '560px' }}>
          <div style={s.sectionTitle}>Availability Settings</div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...s.sectionTitle, display: 'block', marginBottom: '8px' }}>Working Days</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {DAYS_SHORT.map((d, i) => (
                <button key={i} style={s.dayBtn(availForm.daysOfWeek.includes(i))} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>Start Hour (24h)</label>
              <input type="number" min={0} max={23} style={s.input} value={availForm.startHour} onChange={e => setAvailForm(f => ({ ...f, startHour: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>End Hour (24h)</label>
              <input type="number" min={1} max={24} style={s.input} value={availForm.endHour} onChange={e => setAvailForm(f => ({ ...f, endHour: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>Slot (minutes)</label>
              <select style={{ ...s.input }} value={availForm.slotMinutes} onChange={e => setAvailForm(f => ({ ...f, slotMinutes: Number(e.target.value) }))}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>Buffer (minutes)</label>
              <input type="number" min={0} max={60} style={s.input} value={availForm.bufferMinutes} onChange={e => setAvailForm(f => ({ ...f, bufferMinutes: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>Advance days</label>
              <input type="number" min={1} max={60} style={s.input} value={availForm.advanceDays} onChange={e => setAvailForm(f => ({ ...f, advanceDays: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={{ ...s.sectionTitle, display: 'block' }}>Timezone</label>
              <input style={s.input} value={availForm.timezone} onChange={e => setAvailForm(f => ({ ...f, timezone: e.target.value }))} placeholder="UTC" />
            </div>
          </div>

          <button style={{ ...s.btn('primary'), marginTop: '8px' }} onClick={() => void saveAvailability()} disabled={savingAvail}>
            {savingAvail ? 'Saving...' : '💾 Save Availability'}
          </button>
        </div>
      )}

      {/* ── Bookings tabs ─────────────────────────────────────────────────────── */}
      {activeTab !== 'settings' && (
        <div style={s.grid}>
          {/* Booking list */}
          <div style={s.bookingList}>
            {bookings.length === 0 && (
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '32px', textAlign: 'center', color: '#4b5563' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                No bookings yet. Share your booking link to start receiving appointments.
              </div>
            )}
            {bookings.map(b => {
              const badge = statusBadge(b.status)
              return (
                <div
                  key={b.id}
                  style={s.bookingCard(selectedBooking?.id === b.id)}
                  onClick={() => setSelectedBooking(selectedBooking?.id === b.id ? null : b)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb' }}>{b.title}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {b.contact_name} · {b.contact_email}
                      </div>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '16px' }}>
                    <span>📅 {formatDateTime(b.start_time)}</span>
                    <span>({timeAgo(b.start_time)})</span>
                  </div>
                  {b.meeting_url && (
                    <a href={b.meeting_url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#818cf8', textDecoration: 'none', marginTop: '6px', display: 'block' }}>
                      🎥 Join Meeting →
                    </a>
                  )}
                  {b.reminder_sent === 1 && (
                    <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '4px' }}>✓ Reminder sent</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Agent panel */}
          <div style={s.agentPanel}>
            <div style={s.sectionTitle}>🤖 AI Agent Actions</div>
            {!selectedBooking ? (
              <div style={{ fontSize: '12px', color: '#4b5563', textAlign: 'center', padding: '16px 0' }}>
                Select a booking to take action
              </div>
            ) : (
              <>
                <div style={{ background: '#0f1117', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '2px' }}>{selectedBooking.title}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedBooking.contact_name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{formatDateTime(selectedBooking.start_time)}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button style={{ ...s.btn('ghost'), width: '100%', textAlign: 'left', fontSize: '12px' }}
                    onClick={() => void runAgent('send_followup')} disabled={agentLoading}>
                    ✅ Mark Complete + Follow-up
                  </button>
                  <button style={{ ...s.btn('ghost'), width: '100%', textAlign: 'left', fontSize: '12px' }}
                    onClick={() => void runAgent('handle_noshow')} disabled={agentLoading}>
                    👻 Handle No-show
                  </button>
                  <button style={{ ...s.btn('ghost'), width: '100%', textAlign: 'left', fontSize: '12px' }}
                    onClick={() => void runAgent('reschedule')} disabled={agentLoading}>
                    🔄 Reschedule
                  </button>
                </div>

                {agentLoading && <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '12px' }}>⏳ Agent working...</div>}

                {agentResult && (
                  <div style={{ background: '#0f1117', borderRadius: '8px', padding: '10px 12px', marginTop: '12px', fontSize: '11px', color: '#9ca3af', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: '220px', overflowY: 'auto' }}>
                    {agentResult}
                  </div>
                )}
              </>
            )}

            <div style={{ borderTop: '1px solid #1f2937', marginTop: '16px', paddingTop: '16px' }}>
              <div style={s.sectionTitle}>Quick Share</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                Send your booking link in emails, DMs, or add it to your bio.
              </div>
              <button style={{ ...s.btn('primary'), width: '100%' }} onClick={copyLink}>
                {copied ? '✓ Copied!' : '📋 Copy Booking Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
