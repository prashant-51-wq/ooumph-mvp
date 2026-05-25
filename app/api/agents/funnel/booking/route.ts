/**
 * Booking Agent Worker
 * Returns Cal.com event types, booking links, and optionally generates a booking email template.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { getCalEventTypes, getBookingLink, getUpcomingBookings, generateBookingWidget } from '@/lib/tools/calcom'
import type { BrandProfile } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, context, generateEmail } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    // Load workspace settings and brand profile
    const [wsResult, brandResult] = await Promise.all([
      sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
    ])

    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ms = typeof ws.model_settings === 'string' ? JSON.parse(ws.model_settings || '{}') : (ws.model_settings || {})
    const calcomApiKey: string = ms.calcomApiKey || process.env.CALCOM_API_KEY || ''
    const brand = brandResult.rows[0] as unknown as BrandProfile | undefined

    let bookingUrl = ''
    let eventTypes: Awaited<ReturnType<typeof getCalEventTypes>> = []
    let embedWidget = ''
    let upcomingBookings: Awaited<ReturnType<typeof getUpcomingBookings>> = []
    const configured = !!calcomApiKey

    if (calcomApiKey) {
      // Fetch event types and profile link in parallel
      const [types, upcoming] = await Promise.all([
        getCalEventTypes(calcomApiKey),
        getUpcomingBookings(calcomApiKey),
      ])
      eventTypes = types
      upcomingBookings = upcoming

      // Find best primary booking link: prefer demo/discovery event type
      const primaryEvent =
        types.find(et => /demo|discovery/i.test(et.title)) ||
        types.find(et => /consult|call|meeting/i.test(et.title)) ||
        types[0]

      if (primaryEvent) {
        bookingUrl = await getBookingLink(calcomApiKey, primaryEvent.slug)
      } else {
        bookingUrl = await getBookingLink(calcomApiKey)
      }

      embedWidget = generateBookingWidget(bookingUrl, `Book a ${primaryEvent?.title || 'Demo'} with ${brand?.business_name || 'Us'}`)
    } else {
      bookingUrl = 'https://cal.com'
      embedWidget = generateBookingWidget(bookingUrl, 'Book a Demo')
    }

    // Optionally generate booking email template
    let emailTemplate: string | undefined
    if (generateEmail && brand) {
      try {
        const result = await runAgent<{ subject: string; body: string }>(
          `You are an email copywriter for ${brand.business_name}. Write in a ${brand.tone || 'professional'} tone.`,
          `Write a short, friendly booking request email that invites prospects to schedule a ${brand.offer ? `demo of ${brand.offer}` : 'call'}.
Include the Cal.com booking link: ${bookingUrl}
Brand context: ${context || brand.tagline || ''}
Respond with JSON: { "subject": "...", "body": "..." }`,
          '{ "subject": "string", "body": "string" }'
        )
        emailTemplate = `Subject: ${result.subject}\n\n${result.body}`
      } catch {
        emailTemplate = `Subject: Let's find a time to connect\n\nHi [Name],\n\nI'd love to schedule a quick call to see how we can help you.\n\nBook a time that works for you: ${bookingUrl}\n\nLooking forward to connecting!\n\nBest,\n[Your Name]`
      }
    }

    return NextResponse.json({
      bookingUrl,
      eventTypes,
      embedWidget,
      ...(emailTemplate ? { emailTemplate } : {}),
      upcomingBookings,
      configured,
      ...(!configured ? {
        notice: 'Connect your Cal.com account in Settings → API Keys → CRM & Booking to enable live booking links.',
      } : {}),
    })
  } catch (e) {
    console.error('Booking agent error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
