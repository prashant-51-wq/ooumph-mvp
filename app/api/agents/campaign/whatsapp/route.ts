/**
 * WhatsApp Broadcast Worker — Campaign Manager Supervisor
 * Creates WhatsApp Business API broadcast campaigns: message templates,
 * audience segments, scheduling, and performance tracking.
 * Integrates with WhatsApp Business API (via 360dialog or direct Meta Cloud API).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { readAccessToken } from '@/lib/integrations'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the WhatsApp Broadcast Agent for Ooumph AI Marketing OS.
You create compliant, high-converting WhatsApp Business API message campaigns.
WhatsApp has strict rules: no spam, must use pre-approved templates for broadcast,
only contact opted-in users. Messages must be value-first, not promotional-first.
Always respond with valid JSON.`

interface WhatsAppTemplate {
  templateName: string           // internal name for Meta approval
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string               // e.g. "en_US", "en_IN"
  header?: {
    type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
    content: string
  }
  body: string                   // main message body (max 1024 chars)
  footer?: string                // footer text (max 60 chars)
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
    text: string
    value?: string               // URL or phone number
  }>
  variables: string[]            // {{1}}, {{2}} variable descriptions
  complianceNote: string         // why this is compliant
}

interface WhatsAppBroadcast {
  campaignName: string
  objective: string
  targetAudience: string         // who to send to (opted-in segment)
  totalMessages: number          // sequence length
  schedulingStrategy: string     // when to send
  templates: WhatsAppTemplate[]  // pre-approved message templates
  followUpFlow: Array<{
    triggerEvent: string         // e.g. "no reply after 24h", "clicked CTA"
    message: string              // follow-up message content
    delayHours: number
  }>
  optOutInstructions: string     // how to honour opt-outs
  complianceChecklist: string[]  // GDPR/WhatsApp policy compliance
  estimatedOpenRate: string      // expected open rate (WhatsApp avg ~98%)
  kpis: string[]
  setupInstructions: string      // how to set up via WhatsApp Business API
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, broadcastGoal, templateType } = await req.json() as {
      workspaceId: string
      broadcastGoal?: string
      templateType?: 'promotional' | 'reengagement' | 'transactional' | 'event' | 'support'
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, strategyResult, funnelResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // Check if WhatsApp integration is configured.
    // Sprint 10B: select both token columns. isConnected is now based on
    // whether readAccessToken() returns a usable token rather than just
    // the row's existence (a row with empty access_token shouldn't count).
    const integrationResult = await sql`
      SELECT access_token, encrypted_access_token, account_id, metadata FROM integrations
      WHERE workspace_id = ${workspaceId} AND platform = 'whatsapp' AND status = 'active'
      LIMIT 1
    `
    const integration = integrationResult.rows[0]
    const _integToken = integration ? readAccessToken({
      access_token: integration.access_token as string | null,
      encrypted_access_token: integration.encrypted_access_token as string | null,
    }) : null
    const isConnected = !!_integToken

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'whatsapp_broadcast', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const funnel = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const emailNurture = (funnel as { emailNurture?: Array<{ subject: string; goal: string }> })?.emailNurture

    const type = templateType || 'promotional'

    const prompt = `Create a WhatsApp Broadcast campaign for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Campaign Goal: ${broadcastGoal || 'Promote offer and drive conversions'}
Template Type: ${type}
${emailNurture ? `Email nurture context: ${JSON.stringify(emailNurture.slice(0, 3))}` : ''}
${strategy ? `Brand positioning: ${JSON.stringify((strategy as Record<string, unknown>).positioning || '')}` : ''}
Prohibited Claims: ${brand.prohibited_claims || 'None'}
Integration Status: ${isConnected ? 'WhatsApp Business API connected' : 'Not yet connected — generate strategy only'}

WhatsApp Compliance Rules:
- Broadcast messages MUST use pre-approved message templates
- Only send to users who have opted in
- Include clear opt-out mechanism in every marketing message
- No deceptive content or false urgency
- MARKETING category templates are reviewed by Meta (24-48h approval)
- UTILITY templates have faster approval (transactional)
- Rich media (images, videos) in header increases engagement by 40%

Create 2-3 message templates for the campaign. Each template must be Meta-compliant.
Include a follow-up flow for engaged vs non-engaged contacts.

Return JSON:
{
  "campaignName": "Campaign name",
  "objective": "Specific objective",
  "targetAudience": "Who receives this (opted-in customers / leads / etc)",
  "totalMessages": 3,
  "schedulingStrategy": "When to send (day/time recommendations for WhatsApp)",
  "templates": [
    {
      "templateName": "brand_name_promo_v1",
      "category": "MARKETING|UTILITY|AUTHENTICATION",
      "language": "en_IN",
      "header": {
        "type": "IMAGE",
        "content": "Description of image to use"
      },
      "body": "Full message body. Use {{1}} for recipient name. Max 1024 chars.",
      "footer": "Optional footer text",
      "buttons": [
        { "type": "URL", "text": "View Offer", "value": "{{2}}" },
        { "type": "QUICK_REPLY", "text": "Not Interested" }
      ],
      "variables": ["{{1}} = Recipient first name", "{{2}} = Product URL"],
      "complianceNote": "Why this template is compliant"
    }
  ],
  "followUpFlow": [
    {
      "triggerEvent": "No reply after 24 hours",
      "message": "Follow-up message content",
      "delayHours": 24
    }
  ],
  "optOutInstructions": "How to honour opt-outs immediately",
  "complianceChecklist": ["Compliance item 1", "Compliance item 2"],
  "estimatedOpenRate": "85-98% (WhatsApp average)",
  "kpis": ["Open rate", "Reply rate", "Click-through rate", "Conversion rate"],
  "setupInstructions": "Step-by-step guide to launch via WhatsApp Business API / 360dialog / Twilio"
}`

    const broadcast = await runAgent<WhatsAppBroadcast>(SYSTEM, prompt, workspaceId)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(broadcast)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `WhatsApp Broadcast — ${broadcast.campaignName || brand.business_name}`
    const contentJson = {
      ...broadcast,
      businessName: brand.business_name,
      whatsappConnected: isConnected,
      phoneNumberId: integration ? String(integration.account_id || '') : null,
    }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'whatsapp_broadcast', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'whatsapp_broadcast',
        artifactTitle: title,
      })
    }

    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'whatsapp_broadcast', ${artifactId},
                      ${`WhatsApp broadcast: ${broadcast.campaignName} — ${broadcast.templates?.length || 0} templates, target: ${broadcast.targetAudience}`}, 0.8)`

    return NextResponse.json({
      artifactId,
      broadcast: contentJson,
      templateCount: broadcast.templates?.length || 0,
      whatsappConnected: isConnected,
      message: `WhatsApp broadcast created: ${broadcast.templates?.length || 0} message templates${isConnected ? ' — connected to WhatsApp Business API' : ' — connect WhatsApp in Integrations to activate'}.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('WhatsApp broadcast error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'whatsapp_broadcast'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}

// ─── Send a WhatsApp broadcast via Meta Cloud API ─────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const { workspaceId, broadcastArtifactId, recipientPhones } = await req.json() as {
      workspaceId: string
      broadcastArtifactId: string
      recipientPhones: string[]  // E.164 format, opted-in numbers only
    }

    if (!workspaceId || !broadcastArtifactId || !recipientPhones?.length) {
      return NextResponse.json({ error: 'Missing workspaceId, broadcastArtifactId, or recipientPhones' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify broadcast is approved
    const approvalResult = await sql`
      SELECT ap.status FROM approvals ap
      JOIN artifacts a ON a.id = ap.artifact_id
      WHERE a.id = ${broadcastArtifactId} AND a.workspace_id = ${workspaceId}
      LIMIT 1
    `
    if (approvalResult.rows[0]?.status !== 'approved') {
      return NextResponse.json({ error: 'Broadcast must be approved before sending.' }, { status: 403 })
    }

    // Sprint 10B: select both token columns; readAccessToken() resolves
    // encrypted (preferred) or legacy plaintext.
    const integrationResult = await sql`
      SELECT access_token, encrypted_access_token, account_id, metadata FROM integrations
      WHERE workspace_id = ${workspaceId} AND platform = 'whatsapp' AND status = 'active'
      LIMIT 1
    `
    const integration = integrationResult.rows[0]
    const accessToken = integration ? readAccessToken({
      access_token: integration.access_token as string | null,
      encrypted_access_token: integration.encrypted_access_token as string | null,
    }) : null
    if (!integration || !accessToken) {
      return NextResponse.json({ error: 'WhatsApp Business API not connected. Add it in Integrations.' }, { status: 400 })
    }

    const phoneNumberId = String(integration.account_id)

    const artifactResult = await sql`
      SELECT content_json FROM artifacts WHERE id = ${broadcastArtifactId} AND workspace_id = ${workspaceId}
    `
    const broadcast = typeof artifactResult.rows[0]?.content_json === 'string'
      ? JSON.parse(artifactResult.rows[0].content_json)
      : artifactResult.rows[0]?.content_json

    const template = broadcast?.templates?.[0]
    if (!template) return NextResponse.json({ error: 'No template found in broadcast.' }, { status: 400 })

    // Send to each recipient via Meta Cloud API
    const results: Array<{ phone: string; status: string; messageId?: string; error?: string }> = []
    for (const phone of recipientPhones.slice(0, 500)) { // cap at 500 per batch
      try {
        const response = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone,
              type: 'template',
              template: {
                name: template.templateName,
                language: { code: template.language || 'en_IN' },
              },
            }),
          }
        )
        const data = await response.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
        if (response.ok && data.messages?.[0]?.id) {
          results.push({ phone, status: 'sent', messageId: data.messages[0].id })
        } else {
          results.push({ phone, status: 'failed', error: data.error?.message || 'Unknown error' })
        }
      } catch (err) {
        results.push({ phone, status: 'failed', error: String(err) })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
    const failed = results.filter(r => r.status === 'failed').length

    // Log to publish_log
    await sql`INSERT INTO publish_log (id, workspace_id, artifact_id, platform, post_id, status)
              VALUES (${newId()}, ${workspaceId}, ${broadcastArtifactId}, 'whatsapp',
                      ${`batch_${Date.now()}`}, ${failed === 0 ? 'published' : 'partial'})`

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      total: recipientPhones.length,
      results,
      message: `WhatsApp broadcast sent: ${sent}/${recipientPhones.length} delivered.`,
    })
  } catch (error) {
    console.error('WhatsApp send error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
