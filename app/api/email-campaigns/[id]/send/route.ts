/**
 * /api/email-campaigns/[id]/send
 *
 * The dispatch endpoint. Triggers a real outbound campaign send through
 * the resolved provider (workspace BYOK Resend → platform Resend fallback).
 *
 *   POST { workspaceId, listId? }
 *     → If the campaign has an artifact_id, blocks unless the artifact is
 *       approved (assertArtifactApproved).
 *     → Resolves provider key via lib/email-sender.ts.
 *     → Loads list members (`email_list_members` JOIN `email_subscribers`).
 *     → For each subscriber, inserts `email_campaign_sends` row + dispatches.
 *     → Returns aggregate counts. Per-recipient errors land in the
 *       email_campaign_sends.error_message column for later inspection.
 *
 * ─── Safety invariant preserved ──────────────────────────────────────────
 *   This is the ONLY place email_campaigns transitions to 'sending' → 'sent'.
 *   The artifact gate runs BEFORE any external API call; once we cross that
 *   line we treat the campaign as live and the status reflects that.
 *
 * Vercel lifetime: we use `after()` to keep dispatch alive after the response
 * returns, so the user sees the modal close immediately while sends fan out.
 * Large lists (>500 recipients) should use a queue/cron instead; this path
 * is intended for the MVP-scale list size.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership, assertArtifactApproved, assertCrisisClear } from '@/lib/guards'
import { sendCampaignEmail } from '@/lib/email-sender'

export const runtime = 'nodejs'
export const maxDuration = 300

const PLATFORM_FROM_FALLBACK = 'Ooumph AI <onboarding@resend.dev>'
const MAX_RECIPIENTS_PER_CAMPAIGN = 5000

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface CampaignContent {
  subject?: string
  html?: string
  body?: string
  text?: string
  preview_text?: string
  [key: string]: unknown
}

function parseContent(raw: unknown): CampaignContent {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as CampaignContent } catch { return { body: raw } }
  }
  if (typeof raw === 'object') return raw as CampaignContent
  return {}
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: campaignId } = await ctx.params
  let body: { workspaceId?: string; listId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, listId: overrideListId } = body

  if (!workspaceId || !campaignId) {
    return NextResponse.json({ error: 'workspaceId and campaign id required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 🚨 PR Circuit Breaker — halt mass email when the workspace is in crisis ──
  // One read against `workspaces.crisis_status`. Returns 423 Locked if not
  // 'clear'. Prevents tone-deaf bulk sends during an active brand incident.
  const breaker = await assertCrisisClear(workspaceId)
  if (breaker) return breaker

  // ── Load campaign ─────────────────────────────────────────────────────────
  const campaignRes = await sql`
    SELECT * FROM email_campaigns
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const campaign = campaignRes.rows[0] as {
    id?: string
    status?: string
    artifact_id?: string | null
    list_id?: string | null
    subject?: string | null
    from_name?: string | null
    from_email?: string | null
    reply_to?: string | null
    content_json?: string | Record<string, unknown>
    name?: string
  } | undefined

  if (!campaign?.id) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return NextResponse.json(
      { error: `Campaign is already ${campaign.status}` },
      { status: 409 },
    )
  }
  if (campaign.status === 'archived') {
    return NextResponse.json({ error: 'Campaign is archived' }, { status: 409 })
  }

  // ── 🛡️  SAFETY GATE: assertArtifactApproved ────────────────────────────────
  // If the campaign was generated from an AI artifact, that artifact MUST be
  // human-approved before a single email goes out. This is the publish-side
  // enforcement of the Prime Invariant.
  if (campaign.artifact_id) {
    const gate = await assertArtifactApproved(workspaceId, campaign.artifact_id)
    if (gate) return gate
  }

  // ── Resolve list & members ────────────────────────────────────────────────
  const listId = overrideListId || campaign.list_id
  if (!listId) {
    return NextResponse.json(
      { error: 'No list attached to this campaign. Set listId in the body or on the campaign.' },
      { status: 422 },
    )
  }

  // Ensure list belongs to the workspace
  const listRes = await sql`
    SELECT id, name, default_from_name, default_from_email
    FROM email_lists
    WHERE id = ${listId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const list = listRes.rows[0] as {
    id?: string
    name?: string
    default_from_name?: string | null
    default_from_email?: string | null
  } | undefined
  if (!list?.id) {
    return NextResponse.json({ error: 'List not found in this workspace' }, { status: 404 })
  }

  // Pull only subscribed members with subscribed status.
  const membersRes = await sql`
    SELECT s.id AS subscriber_id, s.email, s.first_name, s.last_name, s.name
    FROM email_list_members m
    JOIN email_subscribers s ON s.id = m.subscriber_id
    WHERE m.workspace_id = ${workspaceId}
      AND m.list_id = ${listId}
      AND m.status = 'subscribed'
      AND s.status = 'subscribed'
    LIMIT ${MAX_RECIPIENTS_PER_CAMPAIGN}
  `
  const members = membersRes.rows as unknown as Array<{
    subscriber_id: string
    email: string
    first_name: string | null
    last_name: string | null
    name: string | null
  }>

  if (members.length === 0) {
    return NextResponse.json(
      { error: 'List has no active subscribers' },
      { status: 422 },
    )
  }

  // ── Build the email envelope ──────────────────────────────────────────────
  const content = parseContent(campaign.content_json)
  const subject = campaign.subject || content.subject || campaign.name || '(no subject)'
  const html = content.html
    || (content.body ? `<div>${htmlEscape(String(content.body)).replace(/\n/g, '<br/>')}</div>` : undefined)
  const text = content.text || (typeof content.body === 'string' ? content.body : undefined)
  if (!html && !text) {
    return NextResponse.json(
      { error: 'Campaign has no html or text content' },
      { status: 422 },
    )
  }

  const fromName = campaign.from_name || list.default_from_name || ''
  const fromEmail = campaign.from_email || list.default_from_email || ''
  const from = fromEmail
    ? (fromName ? `${fromName} <${fromEmail}>` : fromEmail)
    : PLATFORM_FROM_FALLBACK

  // ── Flip status to 'sending' and write a recipient ledger up-front ────────
  const startedAt = new Date().toISOString()
  await sql`
    UPDATE email_campaigns
    SET status = 'sending',
        recipient_count = ${members.length},
        sent_count = 0,
        failed_count = 0,
        bounce_count = 0,
        error_message = NULL,
        updated_at = ${startedAt}
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
  `

  // ── Background dispatch (after-response) ──────────────────────────────────
  // We commit `after()` so the user gets an immediate response confirming the
  // gate has passed; actual fan-out happens after the HTTP response closes.
  after(async () => {
    let sent = 0
    let failed = 0
    let usedByokLogged = false

    for (const m of members) {
      const sendId = newId()
      try {
        await sql`
          INSERT INTO email_campaign_sends (
            id, workspace_id, campaign_id, subscriber_id, email_address, status, created_at
          ) VALUES (
            ${sendId}, ${workspaceId}, ${campaignId}, ${m.subscriber_id}, ${m.email}, 'queued', ${new Date().toISOString()}
          )
        `

        const result = await sendCampaignEmail(workspaceId, {
          to: m.email,
          from,
          subject,
          html,
          text,
          replyTo: campaign.reply_to || undefined,
          headers: { 'X-Ooumph-Campaign-Id': campaignId },
          tags: [{ name: 'campaign', value: campaignId }],
        })

        if (!usedByokLogged) {
          console.log(`[email-campaigns/send] workspace=${workspaceId} campaign=${campaignId} byok=${result.usedByok}`)
          usedByokLogged = true
        }

        const nowIso = new Date().toISOString()
        if (result.ok) {
          await sql`
            UPDATE email_campaign_sends
            SET status = 'sent', external_message_id = ${result.messageId}, sent_at = ${nowIso}
            WHERE id = ${sendId}
          `
          sent++
        } else {
          await sql`
            UPDATE email_campaign_sends
            SET status = 'failed', error_message = ${result.error.slice(0, 500)}
            WHERE id = ${sendId}
          `
          failed++
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[email-campaigns/send] recipient error', m.email, errMsg)
        try {
          await sql`
            UPDATE email_campaign_sends
            SET status = 'failed', error_message = ${errMsg.slice(0, 500)}
            WHERE id = ${sendId}
          `
        } catch { /* best-effort */ }
        failed++
      }
    }

    // Final roll-up
    const completedAt = new Date().toISOString()
    const finalStatus = sent > 0 ? 'sent' : 'failed'
    try {
      await sql`
        UPDATE email_campaigns
        SET status = ${finalStatus},
            sent_count = ${sent},
            failed_count = ${failed},
            sent_at = ${completedAt},
            updated_at = ${completedAt},
            error_message = ${failed > 0 && sent === 0 ? 'All recipients failed' : null}
        WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
      `
    } catch (err) {
      console.error('[email-campaigns/send] rollup failed', err)
    }
  })

  return NextResponse.json({
    ok: true,
    campaignId,
    recipientCount: members.length,
    status: 'sending',
    message: 'Dispatch started. Open the campaign to watch live progress.',
  })
}
