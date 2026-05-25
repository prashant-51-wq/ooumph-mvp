// Cal.com API v2

const CAL_BASE = 'https://api.cal.com/v2'

export interface CalEventType {
  id: number
  slug: string
  title: string
  length: number
  description: string
  link: string
}

export async function getCalEventTypes(apiKey: string): Promise<CalEventType[]> {
  if (!apiKey) return []
  try {
    const res = await fetch(`${CAL_BASE}/event-types`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    const items = json.data?.eventTypeGroups?.[0]?.eventTypes || json.data || []
    return (Array.isArray(items) ? items : []).map(
      (et: { id: number; slug: string; title: string; length: number; description: string; bookingFields?: unknown }) => ({
        id: et.id,
        slug: et.slug || '',
        title: et.title || '',
        length: et.length || 0,
        description: et.description || '',
        link: `https://cal.com/${et.slug}`,
      })
    )
  } catch {
    return []
  }
}

export async function getBookingLink(apiKey: string, eventTypeSlug?: string): Promise<string> {
  if (!apiKey) return 'https://cal.com'
  try {
    if (eventTypeSlug) {
      const res = await fetch(`${CAL_BASE}/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.ok) {
        const json = await res.json()
        const username = json.data?.username || json.username || ''
        if (username) return `https://cal.com/${username}/${eventTypeSlug}`
      }
      return `https://cal.com/${eventTypeSlug}`
    }

    const res = await fetch(`${CAL_BASE}/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return 'https://cal.com'
    const json = await res.json()
    const username = json.data?.username || json.username || ''
    return username ? `https://cal.com/${username}` : 'https://cal.com'
  } catch {
    return 'https://cal.com'
  }
}

export async function getUpcomingBookings(
  apiKey: string,
  limit = 10
): Promise<{ id: number; title: string; startTime: string; attendees: { email: string; name: string }[] }[]> {
  if (!apiKey) return []
  try {
    const res = await fetch(`${CAL_BASE}/bookings?status=upcoming&limit=${limit}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    const bookings = json.data || []
    return (Array.isArray(bookings) ? bookings : []).map(
      (b: {
        id: number
        title: string
        startTime: string
        attendees?: { email: string; name: string }[]
      }) => ({
        id: b.id,
        title: b.title || '',
        startTime: b.startTime || '',
        attendees: (b.attendees || []).map((a: { email: string; name: string }) => ({
          email: a.email || '',
          name: a.name || '',
        })),
      })
    )
  } catch {
    return []
  }
}

export function generateBookingWidget(bookingUrl: string, buttonText?: string): string {
  const label = buttonText || 'Book a Demo'
  return `<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:#0069ff;color:#fff;font-family:sans-serif;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">${label}</a>`
}
