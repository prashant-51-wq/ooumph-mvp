/**
 * Email Sequence Worker — Lead & Funnel Ops Supervisor
 * Generates personalised email nurture sequences with full copy,
 * subject lines, and scheduling. Integrates with Resend for actual delivery.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { Resend } from 'resend'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Email Sequence Agent for Ooumph AI Marketing OS.
You write high-converting email nurture sequences: welcome, onboarding, sales, re-engagement.
Write emails that feel personal, not automated. Each email should feel like it was written
specifically for the reader. Apply proven email frameworks: problem-agitate-solve, AIDA, story-based.
Always respond with valid JSON.`

interface Email {
  day: number                  // day 0 = immediately after opt-in
  subject: string              // A-tested subject line
  previewText: string          // email preview / snippet text
  goal: string                 // what this email should achieve
  framework: string            // PAS | AIDA | Story | Value | Direct
  body: string                 // full email body (markdown format)
  cta: string                  // call-to-action text
  ctaUrl: string               // placeholder URL e.g. "{{PRODUCT_URL}}"
  segmentNote: string          // when to skip or modify this email based on behaviour
  abSubject: string            // alternative subject line to A/B test
}

interface EmailSequence {
  sequenceName: string
  sequenceType: 'welcome' | 'nurture' | 'sales' | 'onboarding' | 're_engagement' | 'post_purchase'
  totalEmails: number
  durationDays: number
  overview: string
  unsubscribeNote: string      // compliance note for unsubscribe
  fromName: string             // suggested sender name
  replyTo: string              // reply-to instruction
  emails: Email[]
  segmentationRules: string[]  // how to segment this sequence
  successMetrics: string[]     // what open rates / click rates to aim for
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, sequenceType, sendEmails } = await req.json() as {
      workspaceId: string
      sequenceType?: 'welcome' | 'nurture' | 'sales' | 'onboarding' | 're_engagement' | 'post_purchase'
      sendEmails?: boolean   // if true, send via Resend (requires approved leads list)
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, strategyResult, funnelResult, leadsResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'lead_gen_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'email_sequence', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const funnel = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const leads = leadsResult.rows[0]?.content_json as Record<string, unknown> | undefined

    const funnelEmails = (funnel as { emailNurture?: Array<{ day: number; subject: string; goal: string }> })?.emailNurture
    const icpPainPoints = (strategy as { icp?: { painPoints?: string[] } })?.icp?.painPoints

    const type = sequenceType || 'welcome'
    const emailCount = type === 'welcome' ? 5 : type === 'sales' ? 7 : type === 'nurture' ? 10 : 7

    const prompt = `Write a complete ${type} email sequence for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Industry: ${brand.industry || 'Not specified'}
Prohibited Claims: ${brand.prohibited_claims || 'None'}

${icpPainPoints ? `ICP Pain Points: ${icpPainPoints.join(', ')}` : ''}
${funnelEmails ? `Funnel blueprint emails: ${JSON.stringify(funnelEmails)}` : ''}
${leads ? `Lead intelligence: ${JSON.stringify((leads as Record<string, unknown>).qualificationRules || [])}` : ''}

Write ${emailCount} emails for a ${type} sequence.

Rules:
- Each email should have ONE goal and ONE CTA
- Subject lines: max 50 chars, no spam words (FREE, GUARANTEED, !!!)
- Body: conversational, personal, no corporate speak
- Day 0 = immediately after opt-in / trigger
- Include {{FIRST_NAME}} personalisation tokens
- Emails must flow like a conversation, not disconnected blasts
- Sales emails should address objections progressively
- End sequence with clear next step (not just unsubscribe)

Return JSON:
{
  "sequenceName": "Name for this sequence",
  "sequenceType": "${type}",
  "totalEmails": ${emailCount},
  "durationDays": "X days",
  "overview": "What this sequence achieves",
  "unsubscribeNote": "Always include one-click unsubscribe per CAN-SPAM/GDPR",
  "fromName": "Suggested sender name",
  "replyTo": "Suggested reply-to instruction",
  "emails": [
    {
      "day": 0,
      "subject": "Subject line under 50 chars",
      "previewText": "Preview text under 90 chars",
      "goal": "What this email achieves",
      "framework": "PAS|AIDA|Story|Value|Direct",
      "body": "Full email body in markdown. Use {{FIRST_NAME}} for personalisation.",
      "cta": "CTA button text",
      "ctaUrl": "{{PRODUCT_URL}} or specific placeholder",
      "segmentNote": "Skip if subscriber has already clicked X",
      "abSubject": "Alternative subject line"
    }
  ],
  "segmentationRules": ["Rule 1", "Rule 2"],
  "successMetrics": ["Target open rate: 35%+", "Target CTR: 5%+"]
}`

    const sequence = await runAgent<EmailSequence>(SYSTEM, prompt, workspaceId)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(sequence)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `${type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Email Sequence — ${brand.business_name}`
    const contentJson = { ...sequence, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'email_sequence', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    // Send approval email if configured
    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'email_sequence',
        artifactTitle: title,
      })
    }

    // Save sequence metadata as learning note
    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'email_sequence', ${artifactId},
                      ${`${type} sequence written for ${brand.business_name}: ${sequence.totalEmails} emails over ${sequence.durationDays}. Success target: ${sequence.successMetrics?.[0] || 'not specified'}`}, 0.8)`

    return NextResponse.json({
      artifactId,
      sequence: contentJson,
      emailCount: sequence.emails?.length || 0,
      message: `${sequence.sequenceName}: ${sequence.emails?.length || 0} emails written over ${sequence.durationDays}. Ready for review and approval before scheduling.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Email sequence error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'email_sequence'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}

/**
 * PUT /api/agents/funnel/email-sequence
 * Send the approved email sequence to a list of recipients via Resend.
 * Body: { workspaceId, artifactId, recipients: [{email, firstName}], fromEmail? }
 */
export async function PUT(req: NextRequest) {
  try {
    const { workspaceId, artifactId, recipients, fromEmail } = await req.json() as {
      workspaceId: string
      artifactId: string
      recipients: Array<{ email: string; firstName: string }>
      fromEmail?: string
    }

    if (!workspaceId || !artifactId) return NextResponse.json({ error: 'Missing workspaceId or artifactId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!recipients?.length) return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })

    // Load the artifact and verify approval
    const [artifactResult, approvalResult, brandResult] = await Promise.all([
      sql`SELECT content_json FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} AND type = 'email_sequence' LIMIT 1`,
      sql`SELECT status FROM approvals WHERE artifact_id = ${artifactId} LIMIT 1`,
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
    ])

    if (!artifactResult.rows[0]) return NextResponse.json({ error: 'Email sequence not found' }, { status: 404 })
    if (approvalResult.rows[0]?.status !== 'approved') {
      return NextResponse.json({ error: 'Email sequence must be approved before sending' }, { status: 403 })
    }

    const sequence = artifactResult.rows[0].content_json as Record<string, unknown>
    const brand = brandResult.rows[0] as unknown as BrandProfile
    const emails = sequence.emails as Array<{ day: number; subject: string; body: string; previewText: string; cta: string; ctaUrl: string }>
    if (!emails?.length) return NextResponse.json({ error: 'Sequence has no emails' }, { status: 400 })

    const resendKey = (process.env.RESEND_API_KEY || '').replace(/^﻿/, '').trim()
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })

    const resend = new Resend(resendKey)
    const from = fromEmail || `${sequence.fromName || brand.business_name} <onboarding@resend.dev>`
    const sent: Array<{ recipient: string; emailsScheduled: number; day0Id: string | null }> = []

    // For each recipient, send the day-0 email immediately; log the rest for scheduled delivery
    for (const recipient of recipients.slice(0, 50)) {
      const day0 = emails.find(e => e.day === 0) || emails[0]
      const personalised = (text: string) => text.replace(/\{\{FIRST_NAME\}\}/g, recipient.firstName || 'there')

      let day0Id: string | null = null
      try {
        const { data } = await resend.emails.send({
          from,
          to: recipient.email,
          subject: personalised(day0.subject),
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6;">
            <p style="color:#6b7280;font-size:12px;margin-bottom:24px;">${day0.previewText ? personalised(day0.previewText) : ''}</p>
            ${personalised(day0.body).replace(/\n/g, '<br>')}
            <br><br>
            <a href="${day0.ctaUrl || '#'}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${day0.cta}</a>
            <p style="color:#9ca3af;font-size:11px;margin-top:32px;">You're receiving this because you opted in to ${brand.business_name} updates. <a href="#" style="color:#9ca3af;">Unsubscribe</a></p>
          </div>`,
        })
        day0Id = data?.id || null
      } catch (e) { console.error('Send failed for', recipient.email, e) }

      sent.push({ recipient: recipient.email, emailsScheduled: emails.length, day0Id })
    }

    // Sprint 16C (audit P1 #19): schedule remaining emails into the
    // workflow_pending_steps table — NOT scheduled_posts. The audit found
    // that scheduled_posts bypassed the Sprint 15C reply-cancellation: an
    // inbound human reply cancelled workflow_pending_steps rows but did
    // nothing about pending scheduled_posts. Now sequence follow-ups land
    // in workflow_pending_steps so the email-inbound webhook's
    // notifyNurtureReplyReceived path actually cancels them.
    //
    // We create one synthetic workflow_run per recipient so the audit log
    // tells you which recipient was enrolled. The pending steps reference
    // node_data with the personalised email payload, which the cron at
    // /api/cron/workflow-steps already knows how to dispatch via
    // lib/workflow-engine.ts → 'send_email' case.
    const remainingEmails = emails.filter(e => e.day > 0)
    let scheduledCount = 0
    const syntheticWorkflowId = artifactId  // sequence artifact == workflow id for this run
    for (const recipient of recipients.slice(0, 50)) {
      // Look up lead_id if this email matches a known lead — lets the
      // reply-cancellation join on contact_email reach these rows.
      let leadId: string | null = null
      try {
        const leadRes = await sql`
          SELECT id FROM leads_captured
          WHERE workspace_id = ${workspaceId} AND email = ${recipient.email}
          LIMIT 1
        `
        leadId = (leadRes.rows[0] as { id?: string } | undefined)?.id || null
      } catch { /* non-fatal */ }

      const runId = newId()
      try {
        await sql`
          INSERT INTO workflow_runs (id, workflow_id, workspace_id, lead_id, contact_email, trigger_data, status, current_node)
          VALUES (
            ${runId}, ${syntheticWorkflowId}, ${workspaceId},
            ${leadId}, ${recipient.email},
            ${JSON.stringify({ source: 'email_sequence', artifactId, firstName: recipient.firstName })},
            'running', 0
          )
        `
      } catch { /* workflow_runs may not exist on legacy installs */ }

      for (let nodeIdx = 0; nodeIdx < remainingEmails.length; nodeIdx++) {
        const email = remainingEmails[nodeIdx]
        const scheduledTime = new Date(Date.now() + email.day * 24 * 60 * 60 * 1000).toISOString()
        const personalised = (text: string) => text.replace(/\{\{FIRST_NAME\}\}/g, recipient.firstName || 'there')
        // node_data shape matches lib/workflow-engine.ts WorkflowNode for send_email.
        const nodeData = {
          type: 'send_email',
          subject: personalised(email.subject),
          body: personalised(email.body),
          // Keep cta/ctaUrl in metadata so the workflow engine can render
          // them into the email body template if it chooses.
          metadata: {
            cta: email.cta,
            ctaUrl: email.ctaUrl,
            previewText: email.previewText ? personalised(email.previewText) : '',
            from,
            businessName: brand.business_name,
            day: email.day,
            artifactId,
          },
        }
        await sql`
          INSERT INTO workflow_pending_steps (
            id, workflow_run_id, workflow_id, workspace_id,
            node_index, node_data, lead_id, contact_email,
            scheduled_for, status
          ) VALUES (
            ${newId()}, ${runId}, ${syntheticWorkflowId}, ${workspaceId},
            ${nodeIdx}, ${JSON.stringify(nodeData)}, ${leadId}, ${recipient.email},
            ${scheduledTime}, 'pending'
          )
        `
        scheduledCount++
      }
    }

    // Log to learning_notes
    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'email_sequence_send', ${artifactId},
                      ${`Sent day-0 email to ${sent.length} recipients from sequence "${sequence.sequenceName}". Scheduled ${scheduledCount} follow-up emails.`}, 0.9)`

    // Sprint 17G (audit pass #3 P2 #33): surface the 50-recipient cap so
    // the caller knows when their list was truncated. Previously the cap
    // was silent — a CRM bulk-send of 200 leads would silently drop 150.
    const totalRequested = recipients.length
    const capped = totalRequested > 50
    const overflow = capped ? totalRequested - 50 : 0
    return NextResponse.json({
      ok: true,
      sentCount: sent.length,
      totalEmailsInSequence: emails.length,
      scheduledFollowUps: scheduledCount,
      recipients: sent,
      requestedRecipients: totalRequested,
      capped,
      overflow,
      message: `Day-0 email sent to ${sent.length} recipients. ${scheduledCount} follow-up emails scheduled (days ${remainingEmails.map(e => e.day).join(', ')}) via the publish cron.`
        + (capped ? ` (Capped at 50 — ${overflow} recipient${overflow === 1 ? '' : 's'} skipped. Send again with the remaining list.)` : ''),
    })
  } catch (error) {
    console.error('Email sequence send error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
