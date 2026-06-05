/**
 * /api/webhooks/zapier
 * Zapier webhook receiver — generic catch-all Zapier integration endpoint.
 *
 * GET  → test/discovery response (used by Zapier to verify the endpoint)
 * POST → receive lead data from any Zapier Zap, upsert into leads_captured,
 *         fire lead_captured workflow trigger
 *
 * No signature verification (Zapier uses unique URLs, not shared secrets).
 *
 * Required body field: workspaceId
 * Optional: name, email, phone, source, campaign, customFields, event
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

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

// ─── GET: Discovery / test endpoint ───────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'Zapier webhook active',
    accepts: [
      'workspaceId (required)',
      'name',
      'email',
      'phone',
      'source',
      'campaign',
      'customFields',
    ],
  })
}

// ─── POST: Receive Zapier payload ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Extract fields — Zapier can send camelCase or snake_case
  const workspaceId =
    String(body.workspaceId || body.workspace_id || '').trim()

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'workspaceId is required' },
      { status: 400 },
    )
  }

  // Verify workspace exists AND the inbound Zapier token matches.
  // Audit pass #6 P1: previously the endpoint accepted any payload bearing a
  // valid workspaceId — letting anyone POST leads into anyone's CRM. We now
  // require the x-zapier-token header to match workspaces.webhook_secret.
  // (Column added via inline migration in workspaces' init block.)
  const wsResult = await sql`
    SELECT id, webhook_secret FROM workspaces WHERE id = ${workspaceId} AND status = 'active' LIMIT 1
  `
  const wsRow = wsResult.rows[0] as { id?: string; webhook_secret?: string | null } | undefined
  if (!wsRow) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const provided = req.headers.get('x-zapier-token') || ''
  const expected = wsRow.webhook_secret || ''
  if (!expected) {
    // No token provisioned on this workspace yet — refuse inbound writes
    // rather than silently accepting them.
    return NextResponse.json(
      { error: 'Zapier webhook token not provisioned for this workspace. Generate one in Integrations → Zapier.' },
      { status: 401 },
    )
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Invalid or missing x-zapier-token' }, { status: 401 })
  }

  const name = String(
    body.name || body.full_name || body.fullName ||
    [body.first_name || body.firstName, body.last_name || body.lastName]
      .filter(Boolean).join(' ') || '',
  ).trim() || null

  const email = String(body.email || '').trim().toLowerCase() || null
  const phone = String(body.phone || body.phone_number || body.phoneNumber || '').trim() || null
  const source = String(body.source || 'zapier').trim()
  const campaign = String(body.campaign || body.utm_campaign || '').trim() || null

  // Merge customFields — accept both camelCase and snake_case
  const rawCustomFields = (body.customFields || body.custom_fields || {}) as Record<string, unknown>
  // Also include any non-standard top-level keys as custom data
  const reservedKeys = new Set([
    'workspaceId', 'workspace_id', 'name', 'full_name', 'fullName',
    'first_name', 'firstName', 'last_name', 'lastName',
    'email', 'phone', 'phone_number', 'phoneNumber',
    'source', 'campaign', 'utm_campaign',
    'customFields', 'custom_fields', 'event',
  ])
  const extraFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!reservedKeys.has(key)) {
      extraFields[key] = value
    }
  }
  const customFields = JSON.stringify({ ...rawCustomFields, ...extraFields })

  const now = new Date().toISOString()

  // Upsert: check by email + workspace first
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
        SET name        = COALESCE(${name}, name),
            phone       = COALESCE(${phone}, phone),
            source      = ${source},
            campaign    = COALESCE(${campaign}, campaign),
            custom_fields = ${customFields}
        WHERE id = ${leadId}
      `
    }
  }

  if (!leadId) {
    leadId = newId()
    await sql`
      INSERT INTO leads_captured
        (id, workspace_id, name, email, phone, source, campaign, status, score, custom_fields, created_at)
      VALUES
        (${leadId}, ${workspaceId}, ${name}, ${email}, ${phone}, ${source}, ${campaign}, 'new', 0, ${customFields}, ${now})
    `
  }

  // Log activity
  await sql`
    INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at)
    VALUES (${newId()}, ${workspaceId}, ${leadId}, 'zapier_lead_received', 'Zapier Lead Received',
            ${JSON.stringify({ source, campaign, event: body.event || null })}, ${now})
  `

  // Fire lead_captured workflow trigger (fire-and-forget)
  fireWorkflowTrigger(workspaceId, 'lead_captured', leadId, email, {
    source,
    campaign,
    name,
    email,
    phone,
  })

  return NextResponse.json({ ok: true, leadId })
}
