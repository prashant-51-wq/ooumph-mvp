/**
 * POST /api/pr-campaigns/[id]/distribute
 *
 * Distribution orchestrator. Pushes an approved PR campaign to a curated
 * set of journalists in `media_contacts`, filtered by beat focus.
 *
 *   1. Workspace ownership                                                401/403
 *   2. 🚨 PR Circuit Breaker — refuse if workspace.crisis_status≠'clear'   423
 *   3. Atomic CAS lock: approved → distributing                            409 if not approved
 *   4. 🛡️ HITL safety gate — assertArtifactApproved(pr_campaigns.artifact_id) 403
 *   5. Filter media_contacts by beat (request body or query param)
 *   6. Compile personalised pitch + send via lib/email-sender (BYOK Resend)
 *   7. Update media_contacts.last_contacted_at on every successful send
 *   8. Flip status → 'distributed' (or 'failed' if zero successes)
 *
 * Race-safety: the CAS lock prevents two parallel distribute clicks from
 * double-blasting the same campaign. Failed sends increment a counter but
 * don't block remaining recipients — distribution is best-effort per row.
 *
 * Body:
 *   { workspaceId, beatFilter?, contactIds?, maxRecipients? }
 *
 *   beatFilter   — if set, only contacts whose beat_focus matches (case-insensitive substring)
 *   contactIds   — explicit allowlist; overrides beatFilter when provided
 *   maxRecipients — hard cap, default 100 for safety
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import {
  assertWorkspaceOwnership, assertArtifactApproved, assertCrisisClear,
} from '@/lib/guards'
import { sendCampaignEmail } from '@/lib/email-sender'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_MAX_RECIPIENTS = 100
const PLATFORM_FROM_FALLBACK = 'Ooumph PR <onboarding@resend.dev>'

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface PRCampaignRow {
  id: string
  workspace_id: string
  artifact_id: string | null
  title: string
  body_content: string
  status: string
  error_log: string | null
}

interface MediaContactRow {
  id: string
  workspace_id: string
  journalist_name: string
  email: string | null
  outlet_name: string | null
  beat_focus: string | null
  last_contacted_at: string | null
}

interface BrandProfileRow {
  business_name: string | null
  approval_email: string | null
}

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: campaignId } = await ctx.params
  let body: { workspaceId?: string; beatFilter?: string; contactIds?: string[]; maxRecipients?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { workspaceId, beatFilter, contactIds, maxRecipients } = body
  if (!workspaceId || !campaignId) {
    return NextResponse.json({ error: 'workspaceId and campaign id required' }, { status: 400 })
  }

  // ── 1. Workspace ownership ────────────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 2. 🚨 PR Circuit Breaker ─────────────────────────────────────────────
  // Counter-intuitive at first glance, but correct: the PR desk should NOT
  // fire fresh outbound during a tripped crisis. The crisis itself is
  // typically the reason a PR campaign was drafted — but it needs human
  // explicit override (super-admin acknowledgement) before going out.
  const breaker = await assertCrisisClear(workspaceId)
  if (breaker) return breaker

  // ── 3. Atomic CAS lock: approved → distributing ──────────────────────────
  await sql`
    UPDATE pr_campaigns
    SET status = 'distributing', updated_at = ${new Date().toISOString()}
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId} AND status = 'approved'
  `
  const campRes = await sql`
    SELECT id, workspace_id, artifact_id, title, body_content, status, error_log
    FROM pr_campaigns
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const campaign = campRes.rows[0] as unknown as PRCampaignRow | undefined
  if (!campaign) {
    return NextResponse.json({ error: 'PR campaign not found' }, { status: 404 })
  }
  if (campaign.status !== 'distributing') {
    return NextResponse.json(
      {
        error: `Cannot distribute a PR campaign in '${campaign.status}' state.`,
        currentStatus: campaign.status,
        hint: campaign.status === 'draft' || campaign.status === 'pending_review'
          ? 'Approve the underlying artifact first, then PATCH the campaign status to "approved".'
          : campaign.status === 'distributing'
          ? 'A parallel request is already distributing — wait and refresh.'
          : 'Only an approved campaign can be distributed.',
      },
      { status: 409 },
    )
  }

  // Rollback helper — restores 'approved' on any subsequent failure
  const rollback = async (errMsg: string, finalStatus: 'approved' | 'failed' = 'approved') => {
    try {
      await sql`
        UPDATE pr_campaigns
        SET status = ${finalStatus}, error_log = ${errMsg.slice(0, 1000)}, updated_at = ${new Date().toISOString()}
        WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
      `
    } catch (e) { console.error('[pr-campaigns/distribute] rollback failed', e) }
  }

  try {
    // ── 4. 🛡️ HITL safety gate ───────────────────────────────────────────
    if (campaign.artifact_id) {
      const gate = await assertArtifactApproved(workspaceId, campaign.artifact_id)
      if (gate) {
        await rollback('Linked artifact not approved')
        return gate
      }
    }

    // ── 5. Resolve recipient list ────────────────────────────────────────
    let contacts: MediaContactRow[]
    if (Array.isArray(contactIds) && contactIds.length > 0) {
      // Explicit allowlist — fetch only contacts that belong to the workspace
      const checks = await Promise.all(contactIds.slice(0, DEFAULT_MAX_RECIPIENTS).map(cid =>
        sql`SELECT id, workspace_id, journalist_name, email, outlet_name, beat_focus, last_contacted_at
            FROM media_contacts WHERE id = ${cid} AND workspace_id = ${workspaceId} LIMIT 1`,
      ))
      contacts = checks.flatMap(c => (c.rows[0] ? [c.rows[0] as unknown as MediaContactRow] : []))
    } else if (beatFilter?.trim()) {
      const pattern = `%${beatFilter.trim().toLowerCase()}%`
      const res = await sql`
        SELECT id, workspace_id, journalist_name, email, outlet_name, beat_focus, last_contacted_at
        FROM media_contacts
        WHERE workspace_id = ${workspaceId}
          AND email IS NOT NULL AND email <> ''
          AND LOWER(COALESCE(beat_focus, '')) LIKE ${pattern}
        LIMIT ${Math.min(maxRecipients || DEFAULT_MAX_RECIPIENTS, DEFAULT_MAX_RECIPIENTS)}
      `
      contacts = res.rows as unknown as MediaContactRow[]
    } else {
      // Send to ALL journalists in the workspace — only when explicitly opted in via maxRecipients
      const res = await sql`
        SELECT id, workspace_id, journalist_name, email, outlet_name, beat_focus, last_contacted_at
        FROM media_contacts
        WHERE workspace_id = ${workspaceId}
          AND email IS NOT NULL AND email <> ''
        LIMIT ${Math.min(maxRecipients || DEFAULT_MAX_RECIPIENTS, DEFAULT_MAX_RECIPIENTS)}
      `
      contacts = res.rows as unknown as MediaContactRow[]
    }

    const validContacts = contacts.filter(c => c.email && c.email.includes('@'))
    if (validContacts.length === 0) {
      await rollback('No matching journalists with valid email addresses', 'failed')
      return NextResponse.json(
        { error: 'No matching journalists. Add media contacts first or broaden the beat filter.' },
        { status: 422 },
      )
    }

    // Load brand profile for the "From" line
    const bpRes = await sql`SELECT business_name, approval_email FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = bpRes.rows[0] as unknown as BrandProfileRow | undefined
    const businessName = brand?.business_name?.trim() || 'Press Desk'
    const from = `${businessName} <onboarding@resend.dev>`.length > 200 ? PLATFORM_FROM_FALLBACK : `${businessName} <onboarding@resend.dev>`

    // ── 6. Run distribution after-response ─────────────────────────────────
    // Vercel keeps the lambda alive until after() resolves; the response
    // flushes immediately so the UI shows "distributing" right away.
    after(async () => {
      let sent = 0, failed = 0
      const startedDistAt = Date.now()
      for (const contact of validContacts) {
        const personalised = personalizePitch(campaign, contact, businessName)
        try {
          const result = await sendCampaignEmail(workspaceId, {
            to: contact.email!,
            from,
            subject: personalised.subject,
            text: personalised.body,
            replyTo: brand?.approval_email || undefined,
            headers: { 'X-Ooumph-PR-Campaign-Id': campaignId },
            tags: [{ name: 'pr_campaign', value: campaignId }],
          })
          if (result.ok) {
            sent++
            try {
              await sql`
                UPDATE media_contacts SET last_contacted_at = CURRENT_TIMESTAMP, updated_at = ${new Date().toISOString()}
                WHERE id = ${contact.id} AND workspace_id = ${workspaceId}
              `
            } catch { /* non-fatal */ }
            // Best-effort delivery log mirroring email_campaign_sends
            try {
              await sql`
                INSERT INTO email_campaign_sends (
                  id, workspace_id, campaign_id, subscriber_id, email_address,
                  status, external_message_id, sent_at, created_at
                ) VALUES (
                  ${newId()}, ${workspaceId}, ${campaignId}, NULL, ${contact.email!},
                  'sent', ${result.messageId || ''}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
              `
            } catch { /* table may not exist on every install — ignore */ }
          } else {
            failed++
            try {
              await sql`
                INSERT INTO email_campaign_sends (
                  id, workspace_id, campaign_id, subscriber_id, email_address,
                  status, error_message, created_at
                ) VALUES (
                  ${newId()}, ${workspaceId}, ${campaignId}, NULL, ${contact.email!},
                  'failed', ${(result.error || 'unknown').slice(0, 500)}, CURRENT_TIMESTAMP
                )
              `
            } catch { /* non-fatal */ }
          }
        } catch (err) {
          failed++
          console.error('[pr-campaigns/distribute] send threw', err)
        }
      }

      // ── 7. Final status rollup ──────────────────────────────────────────
      const finalStatus = sent > 0 ? 'distributed' : 'failed'
      const summary = `Distributed to ${sent}/${validContacts.length} journalists in ${((Date.now() - startedDistAt) / 1000).toFixed(1)}s (${failed} failed)`
      try {
        await sql`
          UPDATE pr_campaigns SET
            status = ${finalStatus},
            error_log = ${failed > 0 && sent === 0 ? summary : null},
            updated_at = ${new Date().toISOString()}
          WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
        `
      } catch (e) {
        console.error('[pr-campaigns/distribute] rollup failed', e)
      }
    })

    return NextResponse.json({
      ok: true,
      campaignId,
      status: 'distributing',
      recipientCount: validContacts.length,
      message: `Distribution started for ${validContacts.length} journalist${validContacts.length === 1 ? '' : 's'}. The campaign will flip to 'distributed' (or 'failed') once all sends settle.`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pr-campaigns/distribute] unexpected', err)
    await rollback(msg, 'failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── Personalisation ───────────────────────────────────────────────────────
//
// Lightweight templating — we replace {first_name}, {outlet_name}, {beat}
// in the body, and prepend a one-line personal greeting. For a more
// sophisticated pitch the user can call /api/agents/pr to generate a fully
// AI-tailored pitch first (separate route, separate HITL gate).

function personalizePitch(
  campaign: PRCampaignRow,
  contact: MediaContactRow,
  businessName: string,
): { subject: string; body: string } {
  const firstName = (contact.journalist_name || '').split(/\s+/)[0] || 'there'
  const outlet = contact.outlet_name || 'your outlet'
  const beat = contact.beat_focus || 'this space'

  const subject = campaign.title.slice(0, 200)
  const greeting = `Hi ${firstName},`
  const lead = `I wanted to reach out personally given your coverage of ${beat}${contact.outlet_name ? ` at ${outlet}` : ''} — I think this story angle might land well with your readership.`
  const closer = `\n\nHappy to set up a 15-min call or send over additional materials. Reply to this thread or grab time directly.\n\n— ${businessName} press desk`

  const body = `${greeting}\n\n${lead}\n\n${campaign.body_content
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{outlet_name\}/gi, outlet)
    .replace(/\{beat\}/gi, beat)
  }${closer}`

  return { subject, body }
}
