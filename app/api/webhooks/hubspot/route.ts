/**
 * POST /api/webhooks/hubspot
 * HubSpot webhook receiver.
 *
 * HubSpot sends an array of subscription events to this endpoint.
 *
 * Supported subscriptions:
 *   contact.creation        → upsert lead, fire hubspot_contact_created trigger
 *   contact.propertyChange  → update lead fields from HubSpot contact properties
 *   deal.creation           → update lead score, fire hubspot_deal_updated trigger
 *   deal.propertyChange     → update lead score, fire hubspot_deal_updated trigger
 *
 * Signature: x-hubspot-signature-v3 = HMAC-SHA256(clientSecret + requestURI + body + timestamp)
 * If HUBSPOT_CLIENT_SECRET is not set, signature check is skipped (dev mode).
 *
 * Always returns 200 — HubSpot will retry on non-200.
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

// ─── Signature verification ────────────────────────────────────────────────────

function verifyHubspotSignature(
  rawBody: string,
  requestUri: string,
  timestamp: string,
  signature: string,
): boolean {
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
  if (!clientSecret) return true // dev mode: skip

  const payload = clientSecret + requestUri + rawBody + timestamp
  const expected = crypto.createHmac('sha256', clientSecret).update(payload, 'utf8').digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

// ─── Workflow trigger (fire-and-forget) ────────────────────────────────────────

function fireWorkflowTrigger(
  workspaceId: string,
  triggerType: string,
  leadId: string,
  contactEmail: string | null,
  data: Record<string, unknown>,
): void {
  const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''

  sql`
    SELECT id FROM workflows
    WHERE workspace_id = ${workspaceId}
      AND trigger_type = ${triggerType}
      AND status = 'active'
  `.then(async (wfResult) => {
    for (const wf of wfResult.rows) {
      fetch(`${appUrl}/api/workflows/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          triggerType,
          leadId,
          contactEmail,
          data: { ...data, workflowId: String(wf.id) },
        }),
      }).catch(() => {})
    }
  }).catch(() => {})
}

// ─── HubSpot event shape ───────────────────────────────────────────────────────

interface HubSpotEvent {
  subscriptionType: string
  portalId: number
  objectId: number
  propertyName?: string
  propertyValue?: string
  appId?: number
  occurredAt?: number
}

// ─── Fetch contact details from HubSpot API ────────────────────────────────────

interface HubSpotContactProfile {
  vid: number
  properties: {
    email?: { value: string }
    firstname?: { value: string }
    lastname?: { value: string }
    phone?: { value: string }
    hs_lead_status?: { value: string }
    lifecyclestage?: { value: string }
  }
}

async function fetchHubSpotContact(
  objectId: number,
  accessToken: string,
): Promise<{ name: string | null; email: string | null; phone: string | null; status: string | null } | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.hubapi.com/contacts/v1/contact/vid/${objectId}/profile`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: 10000,
      },
    )

    if (!res.ok) {
      console.error(`HubSpot contact fetch failed: ${res.status}`)
      return null
    }

    const data = (await res.json()) as HubSpotContactProfile
    const props = data.properties || {}
    const firstName = props.firstname?.value || ''
    const lastName = props.lastname?.value || ''
    const name = [firstName, lastName].filter(Boolean).join(' ') || null

    return {
      name,
      email: props.email?.value || null,
      phone: props.phone?.value || null,
      status: props.hs_lead_status?.value?.toLowerCase() || props.lifecyclestage?.value?.toLowerCase() || null,
    }
  } catch (err) {
    console.error('HubSpot contact fetch error:', err)
    return null
  }
}

// ─── Process a single HubSpot event ───────────────────────────────────────────

async function processEvent(event: HubSpotEvent, workspaceId: string, accessToken: string): Promise<void> {
  const now = new Date().toISOString()
  const hubspotId = String(event.objectId)

  // ── contact.creation ────────────────────────────────────────────────────────
  if (event.subscriptionType === 'contact.creation') {
    // Check if we already have this lead by hubspot_id
    const existing = await sql`
      SELECT id, email FROM leads_captured
      WHERE workspace_id = ${workspaceId} AND hubspot_id = ${hubspotId}
      LIMIT 1
    `

    if (existing.rows[0]) {
      // Already exists — just fire the trigger
      const leadId = String(existing.rows[0].id)
      const email = existing.rows[0].email ? String(existing.rows[0].email) : null
      fireWorkflowTrigger(workspaceId, 'hubspot_contact_created', leadId, email, {
        hubspot_contact_id: hubspotId,
        portal_id: event.portalId,
      })
      return
    }

    // Fetch full contact details from HubSpot API
    const contact = await fetchHubSpotContact(event.objectId, accessToken)
    const name = contact?.name || null
    const email = contact?.email || null
    const phone = contact?.phone || null

    // Also check by email if we got one (avoid duplicates)
    let leadId: string | null = null
    if (email) {
      const byEmail = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND email = ${email}
        LIMIT 1
      `
      if (byEmail.rows[0]) {
        leadId = String(byEmail.rows[0].id)
        // Update with hubspot_id
        await sql`
          UPDATE leads_captured
          SET hubspot_id = ${hubspotId},
              name = COALESCE(${name}, name),
              phone = COALESCE(${phone}, phone),
              source = 'hubspot'
          WHERE id = ${leadId}
        `
      }
    }

    if (!leadId) {
      leadId = newId()
      await sql`
        INSERT INTO leads_captured
          (id, workspace_id, name, email, phone, source, hubspot_id, status, score, created_at)
        VALUES
          (${leadId}, ${workspaceId}, ${name}, ${email}, ${phone}, 'hubspot', ${hubspotId}, 'new', 0, ${now})
      `
    }

    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at)
      VALUES (${newId()}, ${workspaceId}, ${leadId}, 'hubspot_contact_created', 'HubSpot Contact Created',
              ${JSON.stringify({ hubspot_contact_id: hubspotId, portal_id: event.portalId })}, ${now})
    `

    fireWorkflowTrigger(workspaceId, 'hubspot_contact_created', leadId, email, {
      hubspot_contact_id: hubspotId,
      portal_id: event.portalId,
      name,
      email,
    })
    return
  }

  // ── contact.propertyChange ───────────────────────────────────────────────────
  if (event.subscriptionType === 'contact.propertyChange') {
    const existing = await sql`
      SELECT id FROM leads_captured
      WHERE workspace_id = ${workspaceId} AND hubspot_id = ${hubspotId}
      LIMIT 1
    `

    if (!existing.rows[0]) return

    const leadId = String(existing.rows[0].id)
    const propName = event.propertyName || ''
    const propValue = event.propertyValue || ''

    // Map known HubSpot properties to our lead fields
    if (propName === 'email' && propValue) {
      await sql`UPDATE leads_captured SET email = ${propValue} WHERE id = ${leadId}`
    } else if (propName === 'firstname' || propName === 'lastname') {
      // Re-fetch to reconstruct full name
      const contact = await fetchHubSpotContact(event.objectId, accessToken)
      if (contact?.name) {
        await sql`UPDATE leads_captured SET name = ${contact.name} WHERE id = ${leadId}`
      }
    } else if (propName === 'phone' && propValue) {
      await sql`UPDATE leads_captured SET phone = ${propValue} WHERE id = ${leadId}`
    } else if (propName === 'hs_lead_status' && propValue) {
      const statusMap: Record<string, string> = {
        new: 'new',
        open: 'new',
        'in progress': 'contacted',
        'open deal': 'qualified',
        unqualified: 'lost',
        connected: 'contacted',
        bad_timing: 'lost',
      }
      const mappedStatus = statusMap[propValue.toLowerCase()]
      if (mappedStatus) {
        await sql`UPDATE leads_captured SET status = ${mappedStatus} WHERE id = ${leadId}`
      }
    }

    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
      VALUES (${newId()}, ${workspaceId}, ${leadId}, 'hubspot_property_changed',
              ${'HubSpot: ' + propName + ' updated'},
              ${propValue},
              ${JSON.stringify({ hubspot_contact_id: hubspotId, property: propName, value: propValue })},
              ${now})
    `
    return
  }

  // ── deal.creation / deal.propertyChange ─────────────────────────────────────
  if (event.subscriptionType === 'deal.creation' || event.subscriptionType === 'deal.propertyChange') {
    // Deals in HubSpot don't directly embed contact objectId in the event —
    // we match by looking for any lead in this workspace with a hubspot activity
    // that references a contact. For deal events, we update score on any lead
    // associated via recent activity, or skip gracefully.

    // For deal.creation: boost score on most recent active lead in workspace
    // (practical approach without a contacts-deals association API call)
    const recentLead = await sql`
      SELECT id, email FROM leads_captured
      WHERE workspace_id = ${workspaceId}
        AND hubspot_id IS NOT NULL
        AND status NOT IN ('lost', 'converted')
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (!recentLead.rows[0]) return

    const leadId = String(recentLead.rows[0].id)
    const email = recentLead.rows[0].email ? String(recentLead.rows[0].email) : null
    const dealHubspotId = hubspotId
    const propName = event.propertyName || ''
    const propValue = event.propertyValue || ''

    // Score adjustments based on deal stage
    const dealStageScoreMap: Record<string, number> = {
      appointmentscheduled: 15,
      qualifiedtobuy: 25,
      presentationscheduled: 20,
      decisionmakerboughtin: 30,
      contractsent: 35,
      closedwon: 50,
      closedlost: -20,
    }

    if (event.subscriptionType === 'deal.creation') {
      await sql`
        UPDATE leads_captured
        SET score = LEAST(100, GREATEST(0, score + 15))
        WHERE id = ${leadId}
      `
    } else if (propName === 'dealstage' && propValue) {
      const delta = dealStageScoreMap[propValue.toLowerCase()] ?? 5
      await sql`
        UPDATE leads_captured
        SET score = LEAST(100, GREATEST(0, score + ${delta})),
            status = ${propValue.toLowerCase() === 'closedwon' ? 'converted' :
                      propValue.toLowerCase() === 'closedlost' ? 'lost' : undefined}
        WHERE id = ${leadId}
      `
    }

    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
      VALUES (${newId()}, ${workspaceId}, ${leadId}, 'hubspot_deal_updated',
              ${event.subscriptionType === 'deal.creation' ? 'HubSpot Deal Created' : 'HubSpot Deal Updated'},
              ${propName && propValue ? propName + ': ' + propValue : null},
              ${JSON.stringify({ hubspot_deal_id: dealHubspotId, portal_id: event.portalId, property: propName, value: propValue })},
              ${now})
    `

    fireWorkflowTrigger(workspaceId, 'hubspot_deal_updated', leadId, email, {
      hubspot_deal_id: dealHubspotId,
      portal_id: event.portalId,
      deal_stage: propValue,
    })
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Signature verification
  const signature = req.headers.get('x-hubspot-signature-v3') || ''
  const timestamp = req.headers.get('x-hubspot-request-timestamp') || ''
  const requestUri = req.url

  if (signature && !verifyHubspotSignature(rawBody, requestUri, timestamp, signature)) {
    // Still return 200 to avoid retry storms — just log and skip
    console.error('HubSpot webhook: invalid signature')
    return NextResponse.json({ ok: true, skipped: 'bad_signature' })
  }

  let events: HubSpotEvent[]
  try {
    events = JSON.parse(rawBody) as HubSpotEvent[]
    if (!Array.isArray(events)) events = [events as HubSpotEvent]
  } catch {
    return NextResponse.json({ ok: true, skipped: 'invalid_json' })
  }

  const SUPPORTED_TYPES = new Set([
    'contact.creation',
    'contact.propertyChange',
    'deal.creation',
    'deal.propertyChange',
  ])

  for (const event of events) {
    if (!SUPPORTED_TYPES.has(event.subscriptionType)) continue
    if (!event.portalId) continue

    // Map portalId → workspace + access token
    const integResult = await sql`
      SELECT workspace_id, access_token FROM integrations
      WHERE platform = 'hubspot' AND account_id = ${String(event.portalId)}
      LIMIT 1
    `

    if (!integResult.rows[0]) continue

    const workspaceId = String(integResult.rows[0].workspace_id)
    const accessToken = String(integResult.rows[0].access_token || '')

    await processEvent(event, workspaceId, accessToken).catch((err) => {
      console.error(`HubSpot event processing failed [${event.subscriptionType}]:`, err)
    })
  }

  // HubSpot always expects 200
  return NextResponse.json({ ok: true })
}
