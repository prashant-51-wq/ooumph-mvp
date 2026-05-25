'use client'

/**
 * /book/[workspaceId] — Public booking page
 * Prospects pick a date → select a time slot → fill their details → confirm.
 * No login required. Works like Calendly.
 */
import { useState, useEffect, use } from 'react'

interface Slot { start: string; end: string; label: string }
interface WorkspaceInfo { name: string; business_name?: string; timezone?: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BookingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params)

  const [wsInfo, setWsInfo] = useState<WorkspaceInfo>({ name: 'Loading...' })
  const [step, setStep] = useState<'pick-date' | 'pick-time' | 'fill-form' | 'confirmed'>('pick-date')

  // Calendar state
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Slots
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Form
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingResult, setBookingResult] = useState<{ meetingUrl?: string } | null>(null)

  // Load workspace info
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces?workspaceId=${workspaceId}`)
        if (res.ok) {
          const data = await res.json() as { workspace?: { name?: string }; brand?: { business_name?: string } }
          setWsInfo({
            name: data.workspace?.name || 'Ooumph',
            business_name: data.brand?.business_name,
          })
        }
      } catch { /* use default */ }
    })()
  }, [workspaceId])

  // Load slots when date selected
  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    setSlots([])
    void (async () => {
      const res = await fetch(`/api/calendar/slots?workspaceId=${workspaceId}&date=${selectedDate}`)
      if (res.ok) {
        const data = await res.json() as { slots: Slot[] }
        setSlots(data.slots)
      }
      setSlotsLoading(false)
    })()
  }, [selectedDate, workspaceId])

  // Build calendar grid
  function buildCalendar() {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const cells: Array<Date | null> = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calYear, calMonth, d))
    return cells
  }

  function isPast(d: Date): boolean {
    return d < today
  }
  function isTooFar(d: Date): boolean {
    const maxDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    return d > maxDate
  }
  function isWeekend(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6
  }

  async function submitBooking() {
    if (!selectedSlot || !form.name || !form.email) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          contactName: form.name,
          contactEmail: form.email,
          contactPhone: form.phone || undefined,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          notes: form.notes || undefined,
          source: 'booking_page',
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; meetingUrl?: string }
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setBookingResult(data)
        setStep('confirmed')
      }
    } catch (e) {
      setError(String(e))
    }
    setSubmitting(false)
  }

  const displayName = wsInfo.business_name || wsInfo.name

  // ── Styles ──────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0a1e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px',
    } as React.CSSProperties,
    card: {
      background: '#111827', border: '1px solid #1f2937', borderRadius: '20px',
      overflow: 'hidden', maxWidth: '860px', width: '100%',
      boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
      display: 'flex', minHeight: '540px',
    } as React.CSSProperties,
    sidebar: {
      width: '280px', background: 'linear-gradient(160deg, #1e1b4b, #0f172a)',
      padding: '36px 28px', borderRight: '1px solid #1f2937', flexShrink: 0,
    } as React.CSSProperties,
    main: { flex: 1, padding: '36px 32px', overflowY: 'auto' as const },
    avatar: {
      width: '56px', height: '56px', borderRadius: '50%', marginBottom: '16px',
      background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '22px', fontWeight: 700, color: '#fff',
    } as React.CSSProperties,
    bizName: { fontSize: '18px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' },
    meetingType: { fontSize: '14px', color: '#818cf8', fontWeight: 600, marginBottom: '12px' },
    duration: { fontSize: '13px', color: '#6b7280', marginBottom: '8px' },
    desc: { fontSize: '12px', color: '#4b5563', lineHeight: 1.6, marginTop: '16px' },

    calHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
    calTitle: { fontSize: '15px', fontWeight: 600, color: '#e5e7eb' },
    navBtn: { background: '#1f2937', border: 'none', borderRadius: '6px', color: '#9ca3af', padding: '4px 10px', cursor: 'pointer', fontSize: '14px' },

    dayLabel: { fontSize: '10px', fontWeight: 600, color: '#4b5563', textAlign: 'center' as const, marginBottom: '4px' },
    calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '24px' },
    dayCell: (d: Date | null, selected: boolean, disabled: boolean) => ({
      height: '34px', borderRadius: '8px', border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: selected ? '#4f46e5' : disabled ? 'transparent' : '#1f2937',
      color: selected ? '#fff' : disabled ? '#374151' : '#e5e7eb',
      fontSize: '13px', fontWeight: selected ? 700 : 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
      opacity: d ? 1 : 0,
    } as React.CSSProperties),

    slotsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' },
    slotBtn: (selected: boolean) => ({
      padding: '10px', borderRadius: '10px', border: '2px solid',
      borderColor: selected ? '#4f46e5' : '#1f2937',
      background: selected ? '#1e1b4b' : '#1f2937',
      color: selected ? '#818cf8' : '#9ca3af',
      fontSize: '13px', fontWeight: selected ? 700 : 500, cursor: 'pointer',
      transition: 'all 0.15s',
    } as React.CSSProperties),

    input: {
      width: '100%', padding: '10px 14px', background: '#1f2937', border: '1px solid #374151',
      borderRadius: '10px', color: '#e5e7eb', fontSize: '14px', outline: 'none',
      boxSizing: 'border-box' as const, marginBottom: '12px', fontFamily: 'inherit',
    },
    label: { fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' },
    submitBtn: {
      width: '100%', padding: '13px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
      border: 'none', borderRadius: '12px', color: '#fff', fontSize: '15px',
      fontWeight: 700, cursor: 'pointer', marginTop: '4px',
    } as React.CSSProperties,
    backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0 },

    stepTitle: { fontSize: '18px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' },
    stepSub: { fontSize: '13px', color: '#6b7280', marginBottom: '20px' },
  }

  const calendar = buildCalendar()
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T12:00:00') : null

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.avatar}>{displayName[0]?.toUpperCase()}</div>
          <div style={s.bizName}>{displayName}</div>
          <div style={s.meetingType}>Discovery Call</div>
          <div style={s.duration}>⏱ 30 minutes</div>
          <div style={s.duration}>📹 Google Meet / Video call</div>
          {selectedSlot && (
            <div style={{ marginTop: '20px', background: '#1e1b4b', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, marginBottom: '6px' }}>SELECTED TIME</div>
              <div style={{ fontSize: '13px', color: '#e5e7eb' }}>
                {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: '13px', color: '#818cf8', fontWeight: 600 }}>{selectedSlot.label}</div>
            </div>
          )}
          <div style={s.desc}>
            Book a 30-minute call to explore how we can help grow your business with AI-powered marketing.
          </div>
        </div>

        {/* Main content */}
        <div style={s.main}>

          {/* ── Step: confirmed ─────────────────────────────────────────── */}
          {step === 'confirmed' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
              <div style={{ width: '72px', height: '72px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '20px' }}>✓</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#e5e7eb', marginBottom: '10px' }}>You&apos;re booked!</div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', lineHeight: 1.6 }}>
                A confirmation has been sent to <strong style={{ color: '#9ca3af' }}>{form.email}</strong>.<br />
                {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedSlot?.label}
              </div>
              {bookingResult?.meetingUrl && (
                <a
                  href={bookingResult.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: '#4f46e5', color: '#fff', padding: '12px 24px', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}
                >
                  🎥 Join Meeting Link
                </a>
              )}
            </div>
          )}

          {/* ── Step: pick-date ─────────────────────────────────────────── */}
          {step === 'pick-date' && (
            <>
              <div style={s.stepTitle}>Select a Date</div>
              <div style={s.stepSub}>Choose a day that works for you</div>

              <div style={s.calHeader}>
                <button style={s.navBtn} onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
                  else setCalMonth(m => m - 1)
                }}>‹</button>
                <span style={s.calTitle}>{MONTHS[calMonth]} {calYear}</span>
                <button style={s.navBtn} onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
                  else setCalMonth(m => m + 1)
                }}>›</button>
              </div>

              <div style={s.calGrid}>
                {DAYS.map(d => <div key={d} style={s.dayLabel}>{d}</div>)}
                {calendar.map((d, i) => {
                  if (!d) return <div key={i} />
                  const ds = toDateStr(d)
                  const disabled = isPast(d) || isTooFar(d) || isWeekend(d)
                  return (
                    <button
                      key={i}
                      style={s.dayCell(d, selectedDate === ds, disabled)}
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) {
                          setSelectedDate(ds)
                          setSelectedSlot(null)
                          setStep('pick-time')
                        }
                      }}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Step: pick-time ─────────────────────────────────────────── */}
          {step === 'pick-time' && (
            <>
              <button style={s.backBtn} onClick={() => setStep('pick-date')}>← Back</button>
              <div style={s.stepTitle}>
                {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={s.stepSub}>Pick a time slot</div>

              {slotsLoading && <div style={{ color: '#6b7280', fontSize: '13px' }}>Loading available times...</div>}
              {!slotsLoading && slots.length === 0 && (
                <div style={{ color: '#6b7280', fontSize: '13px', padding: '20px 0' }}>
                  No slots available for this day. Please choose another date.
                </div>
              )}
              {!slotsLoading && slots.length > 0 && (
                <div style={s.slotsGrid}>
                  {slots.map(slot => (
                    <button
                      key={slot.start}
                      style={s.slotBtn(selectedSlot?.start === slot.start)}
                      onClick={() => { setSelectedSlot(slot); setStep('fill-form') }}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step: fill-form ─────────────────────────────────────────── */}
          {step === 'fill-form' && (
            <>
              <button style={s.backBtn} onClick={() => setStep('pick-time')}>← Back</button>
              <div style={s.stepTitle}>Your Details</div>
              <div style={s.stepSub}>
                {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedSlot?.label}
              </div>

              <label style={s.label}>Full Name *</label>
              <input
                style={s.input}
                placeholder="John Smith"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <label style={s.label}>Email Address *</label>
              <input
                style={s.input}
                type="email"
                placeholder="john@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
              <label style={s.label}>Phone (optional)</label>
              <input
                style={s.input}
                placeholder="+1 555 000 0000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
              <label style={s.label}>Anything you&apos;d like us to know? (optional)</label>
              <input
                style={s.input}
                placeholder="I'm interested in marketing automation for my agency..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />

              {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}

              <button
                style={s.submitBtn}
                onClick={() => { void submitBooking() }}
                disabled={submitting || !form.name || !form.email}
              >
                {submitting ? 'Confirming...' : 'Confirm Booking →'}
              </button>

              <div style={{ fontSize: '11px', color: '#374151', textAlign: 'center', marginTop: '12px' }}>
                By booking, you agree to receive a confirmation email with your meeting details.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
