/**
 * POST /api/f/submit
 *
 * Public form-submission endpoint for funnel pages. Captures lead inputs,
 * inserts a `form_submissions` row, and atomically bumps the parent
 * `funnel_steps.conversion_count`.
 *
 * Request body (JSON or form-encoded):
 *   {
 *     slug:           "saas-demo-2026",     // OR funnelStepId
 *     funnelStepId:   "f_abc123",
 *     email:          "jane@acme.com",
 *     ...arbitraryFields                    // company, name, mrr, etc.
 *   }
 *
 * Response:
 *   200  { ok: true, submissionId, conversionCount }
 *   400  { error: "..." }                   // missing slug + email
 *   404  { error: "..." }                   // unknown funnel
 *   429  { error: "..." }                   // dedup window hit (same email <60s)
 *
 * Security & safety
 * ─────────────────
 * - Route is intentionally public (forms are filled by anonymous visitors).
 * - We strict-validate `email` with a conservative regex before any DB write.
 * - `submitted_data` is the JSON of WHITELISTED scalar fields only — we
 *   discard nested objects / arrays / non-scalar values to prevent stored
 *   payloads from getting weaponised (XSS via reflected data, JSON-bomb).
 * - Per-funnel + per-email dedup window of 60s protects against double-tap
 *   submissions and crude flood attacks. Returns 429 with a friendly message.
 * - All writes are scoped by the funnel's `workspace_id` — leads land in
 *   the correct tenant's table, never a sibling's.
 * - The conversion_count bump and lead activity feed use `after()` so the
 *   user gets their "thanks!" response instantly while audit writes commit
 *   in the background.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { notifyLeadCaptured } from '@/lib/notifications'
import { fireSegmentTriggersForNewLead } from '@/lib/segment-trigger'
import { getBaseUrl } from '@/lib/base-url'

export const runtime = 'nodejs'

// Conservative RFC-5322 subset. Catches the obvious garbage without
// rejecting valid edge cases like plus-addressing or hyphens.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const DEDUP_WINDOW_SECONDS = 60

// Fields we'll never store in submitted_data even if the client sends them.
const RESERVED_FIELDS = new Set([
  'slug', 'funnelStepId', 'funnel_step_id', 'email',
  'workspaceId', 'workspace_id', 'id',
])

/**
 * Sanitise the form payload to scalar values only. Strings are length-capped
 * at 2000 chars to prevent storage abuse.
 */
function sanitiseSubmittedData(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input)) {
    if (RESERVED_FIELDS.has(key)) continue
    if (value == null) { out[key] = null; continue }
    if (typeof value === 'string') {
      out[key] = value.slice(0, 2000)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
    // Arrays / objects / functions / symbols silently dropped.
  }
  return out
}

interface FunnelLookup {
  id: string
  workspace_id: string
  slug?: string | null
}

async function resolveFunnelStep(slugOrId: { slug?: string; funnelStepId?: string }): Promise<FunnelLookup | null> {
  const slug = (slugOrId.slug || '').trim().replace(/[.,!?)\];:]+$/, '')
  const id = (slugOrId.funnelStepId || '').trim()

  if (id) {
    const r = await sql`
      SELECT id, workspace_id, slug FROM funnel_steps WHERE id = ${id} LIMIT 1
    `
    const row = r.rows[0] as unknown as FunnelLookup | undefined
    if (row) return row
  }
  if (slug && SLUG_PATTERN.test(slug)) {
    const r = await sql`
      SELECT id, workspace_id, slug FROM funnel_steps WHERE slug = ${slug} LIMIT 1
    `
    const row = r.rows[0] as unknown as FunnelLookup | undefined
    if (row) return row
  }
  return null
}

export async function POST(req: NextRequest) {
  // ── 1. Parse body — accept JSON or url-encoded form posts ────────────
  let raw: Record<string, unknown>
  try {
    const contentType = (req.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      raw = await req.json() as Record<string, unknown>
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      raw = {}
      form.forEach((v, k) => { raw[k] = typeof v === 'string' ? v : String(v) })
    } else {
      // Best-effort JSON parse as fallback.
      raw = await req.json() as Record<string, unknown>
    }
  } catch {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 })
  }

  // ── 2. Validate required inputs ───────────────────────────────────────
  const email = String(raw.email || '').trim().toLowerCase()
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const funnel = await resolveFunnelStep({
    slug: typeof raw.slug === 'string' ? raw.slug : undefined,
    funnelStepId: typeof raw.funnelStepId === 'string'
      ? raw.funnelStepId
      : typeof raw.funnel_step_id === 'string' ? raw.funnel_step_id : undefined,
  })
  if (!funnel) {
    return NextResponse.json({ error: 'Funnel step not found' }, { status: 404 })
  }

  // ── 3. Per-funnel + per-email dedup window ───────────────────────────
  // Postgres `NOW() - interval` works server-side; SQLite needs an explicit
  // ISO string. We compute the cutoff in JS for cross-dialect portability.
  const cutoffIso = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString()
  try {
    const dupRes = await sql`
      SELECT id FROM form_submissions
      WHERE funnel_step_id = ${funnel.id}
        AND email = ${email}
        AND created_at >= ${cutoffIso}
      LIMIT 1
    `
    if (dupRes.rows.length > 0) {
      return NextResponse.json(
        {
          error: 'Duplicate submission — please wait a moment before retrying.',
          dedupWindowSeconds: DEDUP_WINDOW_SECONDS,
        },
        { status: 429 },
      )
    }
  } catch {
    // Index might not be there yet on a fresh-install — non-fatal, continue.
  }

  // ── 4. Persist the submission ─────────────────────────────────────────
  const submittedData = sanitiseSubmittedData(raw)
  const submissionId = newId()
  await sql`
    INSERT INTO form_submissions (id, workspace_id, funnel_step_id, email, submitted_data, created_at)
    VALUES (
      ${submissionId}, ${funnel.workspace_id}, ${funnel.id}, ${email},
      ${JSON.stringify(submittedData)}, CURRENT_TIMESTAMP
    )
  `

  // ── 5. Background atomic conversion_count bump + CRM activity write ──
  // `after()` keeps the lambda alive past the response so these analytics
  // writes always commit, while the visitor sees an instant "thanks!".
  after(async () => {
    try {
      await sql`
        UPDATE funnel_steps
        SET conversion_count = conversion_count + 1
        WHERE id = ${funnel.id}
      `
    } catch (err) {
      console.error('[api/f/submit] conversion_count bump failed:', err)
    }

    // Sprint 15C (P0 #2): CRM ingestion is now first-class. If the email
    // already matches a lead, append a form_submitted activity. If not,
    // CREATE the lead so submissions through `/api/f/[slug]` funnels show
    // up in /leads-crm — mirrors lp-submit behaviour and closes the gap
    // where form-builder funnels silently orphaned submissions.
    try {
      const leadRes = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${funnel.workspace_id} AND email = ${email}
        LIMIT 1
      `
      let leadId = (leadRes.rows[0] as { id?: string } | undefined)?.id
      const inferredName =
        (submittedData.name as string) ||
        (submittedData.full_name as string) ||
        (submittedData.first_name as string) ||
        null
      const inferredPhone = (submittedData.phone as string) || null
      if (!leadId) {
        leadId = newId()
        await sql`
          INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, campaign, status, score, notes, enrichment_status)
          VALUES (
            ${leadId}, ${funnel.workspace_id}, ${inferredName}, ${email}, ${inferredPhone},
            'funnel_form', ${funnel.slug || funnel.id}, 'new', 0, ${null}, 'pending'
          )
        `
        // Fire the notification AFTER the lead is in place so the bell
        // link resolves to the real row.
        await notifyLeadCaptured(
          funnel.workspace_id,
          leadId,
          inferredName || email,
          'funnel form' + (funnel.slug ? ` (${funnel.slug})` : ''),
        )
      }
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (
          ${newId()}, ${funnel.workspace_id}, ${leadId},
          'form_submitted',
          ${'Submitted a funnel form'},
          ${`Funnel step: ${funnel.id}`},
          ${JSON.stringify({ funnel_step_id: funnel.id, submitted_data: submittedData })},
          CURRENT_TIMESTAMP
        )
      `

      // Sprint 16E (audit P2 #29): auto-score parity with /api/lp-submit.
      // The audit found lp-submit fires /api/agents/funnel/qualify but
      // f/submit didn't — inconsistent. Now both paths score equally.
      try {
        const modelResult = await sql`
          SELECT id FROM artifacts
          WHERE workspace_id = ${funnel.workspace_id} AND type = 'lead_scoring_model'
          LIMIT 1
        `
        if (modelResult.rows[0]) {
          const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
          const internalSecretScore = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''
          await fetch(`${appUrl}/api/agents/funnel/qualify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(internalSecretScore ? { 'x-internal-secret': internalSecretScore } : {}),
            },
            body: JSON.stringify({
              workspaceId: funnel.workspace_id,
              mode: 'score_lead',
              leadData: { id: leadId, name: inferredName, email, phone: inferredPhone, source: 'funnel_form' },
            }),
          }).catch(() => undefined)
        }
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error('[api/f/submit] CRM ingestion failed (non-fatal):', err)
    }

    // Fire the workflow trigger for downstream automations.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
      if (baseUrl) {
        await fetch(`${baseUrl}/api/workflows/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
          },
          body: JSON.stringify({
            workspaceId: funnel.workspace_id,
            triggerType: 'form_submitted',
            contactEmail: email,
            data: { funnel_step_id: funnel.id, submitted_data: submittedData },
          }),
        }).catch(() => undefined)
      }
    } catch { /* best-effort */ }

    // Sprint 17C (audit P1 #7): fire lead_added_to_segment workflow
    // triggers for every persisted segment this new lead now matches.
    // Re-look-up the lead by email since the CRM-ingestion block above
    // scoped its leadId locally.
    try {
      const lr = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${funnel.workspace_id} AND email = ${email}
        LIMIT 1
      `
      const resolvedLeadId = (lr.rows[0] as { id?: string } | undefined)?.id
      if (resolvedLeadId) {
        await fireSegmentTriggersForNewLead({
          workspaceId: funnel.workspace_id,
          leadId: resolvedLeadId,
          contactEmail: email,
        })
      }
    } catch { /* non-fatal */ }

    // ── Sprint 3 Loop 2: enrichment → email drip chain ────────────────────
    // Re-resolve the lead so we have a stable leadId even if the CRM block
    // above ran on an existing lead (different local scope).
    try {
      const lr2 = await sql`
        SELECT id FROM leads_captured
        WHERE workspace_id = ${funnel.workspace_id} AND email = ${email}
        LIMIT 1
      `
      const nurturLeadId = (lr2.rows[0] as { id?: string } | undefined)?.id
      if (!nurturLeadId) return

      const baseUrl = getBaseUrl()
      const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-internal-secret': secret } : {}),
      }

      // 1. Trigger parallel firmographic enrichment
      let enrichOk = false
      try {
        const enrichRes = await fetch(`${baseUrl}/api/agents/enrich-lead`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ workspaceId: funnel.workspace_id, leadId: nurturLeadId }),
        })
        enrichOk = enrichRes.ok
        if (!enrichOk) console.warn(`[f/submit after] enrich-lead ${enrichRes.status}`)
      } catch (e) {
        console.warn('[f/submit after] enrich-lead error (non-fatal):', e)
      }

      // 2. Inject into drip queue once firmographic data is appended
      if (enrichOk) {
        try {
          await fetch(`${baseUrl}/api/agents/funnel/email-sequence`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              workspaceId: funnel.workspace_id,
              sequenceType: 'nurture',
              leadContext: { leadId: nurturLeadId, email },
            }),
          }).catch(() => undefined)
        } catch { /* non-fatal */ }
      }

      // 3. Track this lead's personalised nurture journey in workflow_runs
      try {
        const wfRes = await sql`
          SELECT id FROM workflows
          WHERE workspace_id = ${funnel.workspace_id}
            AND trigger_type = 'lead_captured'
            AND status = 'active'
          LIMIT 1
        `
        const wfId = (wfRes.rows[0] as { id?: string } | undefined)?.id
        if (wfId) {
          await sql`
            INSERT INTO workflow_runs (
              id, workflow_id, workspace_id, lead_id, contact_email,
              trigger_data, status, current_node, nodes_completed, started_at
            ) VALUES (
              ${newId()}, ${wfId}, ${funnel.workspace_id}, ${nurturLeadId}, ${email},
              ${JSON.stringify({ source: 'funnel_form', funnelStepId: funnel.id, enriched: enrichOk })},
              'running', 0, '[]', NOW()
            )
          `
        }
      } catch (e) {
        console.warn('[f/submit after] workflow_runs insert failed (non-fatal):', e)
      }
    } catch (e) {
      console.error('[f/submit after] Sprint 3 nurture chain failed (non-fatal):', e)
    }
  })

  // ── 6. Get the updated count for the response (approximate, pre-bump) ─
  // We return the count BEFORE the after() update so it's at least
  // monotonically non-decreasing across the user's perspective.
  const countRes = await sql`
    SELECT conversion_count FROM funnel_steps WHERE id = ${funnel.id} LIMIT 1
  `
  const conversionCount = Number(
    (countRes.rows[0] as { conversion_count?: number | string } | undefined)?.conversion_count || 0,
  ) + 1   // +1 to account for the pending bump

  return NextResponse.json({
    ok: true,
    submissionId,
    funnelStepId: funnel.id,
    conversionCount,
  })
}
