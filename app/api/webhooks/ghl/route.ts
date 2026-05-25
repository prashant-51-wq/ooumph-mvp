/**
 * POST /api/webhooks/ghl
 * GoHighLevel webhook receiver.
 *
 * Supported event types:
 *   ContactCreate       → upsert lead, fire ghl_contact_created workflow trigger
 *   ContactUpdate       → update existing lead fields
 *   OpportunityCreate   → update lead status/score, fire ghl_opportunity_updated trigger
 *   OpportunityUpdate   → update lead status/score, fire ghl_opportunity_updated trigger
 *   NoteCreate          → add activity to lead_activities
 *   TaskCreate          → add activity to lead_activities
 *
 * Signature: x-ghl-signature = HMAC-SHA256(body, GHL_WEBHOOK_SECRET)
 * If GHL_WEBHOOK_SECRET is not set, signature check is skipped (dev mode).
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

// ─── Signature verification ────────────────────────────────────────────────────

function verifyGhlSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET
  if (!secret) return true // dev mode: skip verification

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

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

  // Find matching active workflows then POST to /api/workflows/trigger for each
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
      }).catch(() => {}) // fire-and-forget
    }
  }).catch(() => {})
}

// ─── GHL event body shape ──────────────────────────────────────────────────────

interface GhlContact {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  tags?: string[]
  customField?: Record<string, unknown>
  source?: string
}

interface GhlOpportunity {
  id: string
  contactId?: string
  name?: string
  status?: string
  monetaryValue?: number
  stage?: string
}

interface GhlNote {
  id: string
  contactId?: string
  body?: string
}

interface GhlTask {
  id: string
  contactId?: string
  title?: string
  dueDate?: string
}

interface GhlWebhookBody {
  type: string
  locationId: string
  contact?: GhlContact
  opportunity?: GhlOpportunity
  note?: GhlNote
  task?: GhlTask
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Signature check
  const signature = req.headers.get('x-ghl-signature') || ''
  if (signature && !verifyGhlSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: GhlWebhookBody
  try {
    body = JSON.parse(rawBody) as GhlWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, locationId } = body

  const SUPPORTED_TYPES = [
    'ContactCreate',
    'ContactUpdate',
    'OpportunityCreate',
    'OpportunityUpdate',
    'NoteCreate',
    'TaskCreate',
  ]
  if (!SUPPORTED_TYPES.includes(type)) {
    return NextResponse.json({ error: `Unrecognized event type: ${type}` }, { status: 400 })
  }

  // Map locationId → workspace
  const integResult = await sql`
    SELECT workspace_id FROM integrations
    WHERE platform = 'ghl' AND account_id = ${locationId}
    LIMIT 1
  `
  const workspaceId = integResult.rows[0] ? String(integResult.rows[0].workspace_id) : null

  if (!workspaceId) {
    // No workspace mapped to this locationId — return 200 to avoid GHL retries
    console.warn(`GHL webhook: no workspace found for locationId=${locationId}`)
    return NextResponse.json({ ok: true, skipped: true })
  }

  const now = new Date().toISOString()

  // ── ContactCreate ────────────────────────────────────────────────────────────
  if (type === 'ContactCreate' && body.contact) {
    const c = body.contact
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || null
    const email = c.email || null
    const phone = c.phone || null
    const source = c.source || 'ghl'
    const customFieldsJson = JSON.stringify(c.customField || {})
    const tagsJson = JSON.stringify(c.tags || [])

    // Check if lead already exists by email or by GHL contact id stored in custom_fields
    let leadId: string | null = null

    if (email) {
      const existing = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND email = ${email}
        LIMIT 1
      `
      if (existing.rows[0]) {
        leadId = String(existing.rows[0].id)
        await sql`
          UPDATE leads_captured
          SET name = COALESCE(${name}, name),
              phone = COALESCE(${phone}, phone),
              source = ${source},
              custom_fields = ${customFieldsJson}
          WHERE id = ${leadId}
        `
      }
    }

    if (!leadId) {
      leadId = newId()
      await sql`
        INSERT INTO leads_captured
          (id, workspace_id, name, email, phone, source, status, score, custom_fields, created_at)
        VALUES
          (${leadId}, ${workspaceId}, ${name}, ${email}, ${phone}, ${source}, 'new', 0, ${customFieldsJson}, ${now})
      `
    }

    // Log activity
    await sql`
      INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
      VALUES (${newId()}, ${workspaceId}, ${leadId}, 'ghl_contact_created', 'GHL Contact Created',
              ${'GHL contact ID: ' + c.id}, ${JSON.stringify({ ghl_contact_id: c.id, tags: tagsJson })}, ${now})
    `

    // Fire workflow trigger (fire-and-forget)
    fireWorkflowTrigger(workspaceId, 'ghl_contact_created', leadId, email, {
      ghl_contact_id: c.id,
      name,
      email,
      phone,
      source,
    })

    return NextResponse.json({ ok: true, leadId })
  }

  // ── ContactUpdate ────────────────────────────────────────────────────────────
  if (type === 'ContactUpdate' && body.contact) {
    const c = body.contact
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || null
    const email = c.email || null
    const phone = c.phone || null
    const customFieldsJson = JSON.stringify(c.customField || {})

    // Find lead by email or skip if not found
    if (email) {
      const existing = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${workspaceId} AND email = ${email}
        LIMIT 1
      `
      if (existing.rows[0]) {
        const leadId = String(existing.rows[0].id)
        await sql`
          UPDATE leads_captured
          SET name = COALESCE(${name}, name),
              phone = COALESCE(${phone}, phone),
              custom_fields = ${customFieldsJson}
          WHERE id = ${leadId}
        `
        await sql`
          INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at)
          VALUES (${newId()}, ${workspaceId}, ${leadId}, 'ghl_contact_updated', 'GHL Contact Updated',
                  ${JSON.stringify({ ghl_contact_id: c.id })}, ${now})
        `
      }
    }

    return NextResponse.json({ ok: true })
  }

  // ── OpportunityCreate / OpportunityUpdate ────────────────────────────────────
  if ((type === 'OpportunityCreate' || type === 'OpportunityUpdate') && body.opportunity) {
    const opp = body.opportunity

    // Find the lead associated with this opportunity's contact
    let leadId: string | null = null
    if (opp.contactId) {
      // Opportunity contactId maps to a GHL contact — find lead by searching activities
      const actResult = await sql`
        SELECT lead_id FROM lead_activities
        WHERE workspace_id = ${workspaceId}
          AND metadata_json LIKE ${'%"ghl_contact_id":"' + opp.contactId + '"%'}
        LIMIT 1
      `
      if (actResult.rows[0]) {
        leadId = String(actResult.rows[0].lead_id)
      }
    }

    if (leadId) {
      // Map GHL stage/status to a score delta
      const statusScoreMap: Record<string, number> = {
        open: 10,
        won: 40,
        lost: -10,
        abandoned: -20,
      }
      const scoreDelta = statusScoreMap[String(opp.status || '').toLowerCase()] ?? 5
      const newStatus = opp.status?.toLowerCase() === 'won' ? 'converted' :
                        opp.status?.toLowerCase() === 'lost' ? 'lost' : undefined

      await sql`
        UPDATE leads_captured
        SET score = LEAST(100, GREATEST(0, score + ${scoreDelta}))
            ${newStatus ? sql`, status = ${newStatus}` : sql``}
        WHERE id = ${leadId}
      `

      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${leadId}, 'ghl_opportunity_updated',
                ${'GHL Opportunity: ' + (opp.name || opp.id)},
                ${opp.stage ? 'Stage: ' + opp.stage : null},
                ${JSON.stringify({ ghl_opportunity_id: opp.id, status: opp.status, value: opp.monetaryValue })},
                ${now})
      `

      // Fire workflow trigger (fire-and-forget)
      fireWorkflowTrigger(workspaceId, 'ghl_opportunity_updated', leadId, null, {
        ghl_opportunity_id: opp.id,
        status: opp.status,
        stage: opp.stage,
        value: opp.monetaryValue,
      })
    }

    return NextResponse.json({ ok: true })
  }

  // ── NoteCreate ───────────────────────────────────────────────────────────────
  if (type === 'NoteCreate' && body.note) {
    const note = body.note

    let leadId: string | null = null
    if (note.contactId) {
      const actResult = await sql`
        SELECT lead_id FROM lead_activities
        WHERE workspace_id = ${workspaceId}
          AND metadata_json LIKE ${'%"ghl_contact_id":"' + note.contactId + '"%'}
        LIMIT 1
      `
      if (actResult.rows[0]) leadId = String(actResult.rows[0].lead_id)
    }

    if (leadId) {
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${leadId}, 'note_added', 'GHL Note',
                ${note.body || null},
                ${JSON.stringify({ ghl_note_id: note.id, ghl_contact_id: note.contactId })},
                ${now})
      `
    }

    return NextResponse.json({ ok: true })
  }

  // ── TaskCreate ───────────────────────────────────────────────────────────────
  if (type === 'TaskCreate' && body.task) {
    const task = body.task

    let leadId: string | null = null
    if (task.contactId) {
      const actResult = await sql`
        SELECT lead_id FROM lead_activities
        WHERE workspace_id = ${workspaceId}
          AND metadata_json LIKE ${'%"ghl_contact_id":"' + task.contactId + '"%'}
        LIMIT 1
      `
      if (actResult.rows[0]) leadId = String(actResult.rows[0].lead_id)
    }

    if (leadId) {
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${leadId}, 'task_created', ${task.title || 'GHL Task'},
                ${task.dueDate ? 'Due: ' + task.dueDate : null},
                ${JSON.stringify({ ghl_task_id: task.id, ghl_contact_id: task.contactId, due_date: task.dueDate })},
                ${now})
      `
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
