import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { Resend } from 'resend'
import type { BrandProfile } from '@/types'
import { assertArtifactApproved, assertWorkspaceOwnership } from '@/lib/guards'
import { buildMemoryMatrix, logMemoryInjection } from '@/lib/agents/memory-retrieval'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, action, campaignName, goal, audience, campaignId, recipients } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile

    if (action === 'generate') {
      if (!brand) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 400 })

      const runId = newId()
      await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'email_marketing_agent', 'running')`

      // ─── Sprint 1: Postgres memory matrix ────────────────────────────
      // Top historic email CTRs + brand voice rules + live campaign
      // state get injected as an explicit '### SYSTEM MEMORY' block
      // ABOVE the campaign-specific brief, so the copywriter LLM treats
      // past winners as authoritative style reference. logMemoryInjection
      // writes the agent_run_events row that proves it.
      const memoryMatrix = await buildMemoryMatrix(workspaceId)
      await logMemoryInjection({ workspaceId, agentRunId: runId, agent: 'email_marketing_agent', matrix: memoryMatrix })

      const content = await runAgent<{
        subject: string; previewText: string; headline: string; body: string;
        cta: string; ctaUrl: string; ps: string; suggestedSendTime: string;
      }>(
        'You are an expert email marketing copywriter. Write high-converting email campaigns that get opens, clicks, and replies. Always respond with valid JSON.',
        `### SYSTEM MEMORY & PAST WORKSPACE LEARNINGS
${memoryMatrix.matrix}

Business: ${brand.business_name}
Offer: ${brand.offer}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Campaign Goal: ${goal || 'Drive engagement and conversions'}
Audience Segment: ${audience || 'Full subscriber list'}
Campaign Name: ${campaignName}

Write a marketing email campaign. Return JSON:
{
  "subject": "compelling subject line (under 60 chars)",
  "previewText": "preview text that complements the subject (under 90 chars)",
  "headline": "email body headline",
  "body": "email body (3-4 paragraphs, conversational, value-first)",
  "cta": "call-to-action button text",
  "ctaUrl": "example CTA URL placeholder",
  "ps": "P.S. line that adds urgency or extra value",
  "suggestedSendTime": "best time to send (e.g. Tuesday 10am)"
}`
      )

      await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      // ─── Artifact + approval row (so the campaign can pass through HITL) ──
      // Creating an artifact + pending approval row here means the email body
      // gets the same human-governance gate as every other generated asset.
      // The campaign row links back via artifact_id so the send route can run
      // assertArtifactApproved() before dispatching.
      const artifactId = newId()
      const artifactTitle = `Email: ${content.subject || campaignName || 'Untitled'}`
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
        VALUES (${artifactId}, ${workspaceId}, ${runId}, 'emailDraft', ${artifactTitle}, ${JSON.stringify(content)}, 'pending')
      `
      const approvalId = newId()
      await sql`
        INSERT INTO approvals (id, workspace_id, artifact_id, status)
        VALUES (${approvalId}, ${workspaceId}, ${artifactId}, 'pending')
      `

      const campaignId = newId()
      await sql`
        INSERT INTO email_campaigns (id, workspace_id, name, subject, status, content_json, artifact_id)
        VALUES (${campaignId}, ${workspaceId}, ${campaignName || 'New Campaign'}, ${content.subject}, 'draft', ${JSON.stringify(content)}, ${artifactId})
      `

      return NextResponse.json({ ok: true, campaignId, artifactId, approvalId, content })
    }

    if (action === 'send' && campaignId && recipients?.length) {
      const campaignRes = await sql`SELECT * FROM email_campaigns WHERE id = ${campaignId} AND workspace_id = ${workspaceId} LIMIT 1`
      const campaign = campaignRes.rows[0] as { subject: string; content_json: Record<string, unknown>; name: string; artifact_id?: string } | undefined
      if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

      // ─── Human governance gate ──────────────────────────────────────────
      // If this campaign was generated by an agent (it has an artifact_id),
      // verify that artifact has been approved by a human before we mass-mail
      // anyone. Campaigns created manually (no artifact_id) are treated as
      // direct user actions and skip this check.
      if (campaign.artifact_id) {
        const gate = await assertArtifactApproved(workspaceId, campaign.artifact_id)
        if (gate) return gate
      }

      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return NextResponse.json({ error: 'Resend not configured' }, { status: 400 })

      const resend = new Resend(resendKey)
      const content = campaign.content_json
      let sentCount = 0

      for (const email of recipients.slice(0, 100)) {
        try {
          await resend.emails.send({
            from: `${brand?.business_name || 'Ooumph'} <onboarding@resend.dev>`,
            to: email,
            subject: campaign.subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
              <h1 style="color:#1a1a2e;font-size:24px">${String(content.headline || '')}</h1>
              <div style="color:#374151;line-height:1.6">${String(content.body || '').replace(/\n/g, '<br>')}</div>
              <a href="${String(content.ctaUrl || '#')}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${String(content.cta || 'Learn More')}</a>
              <p style="color:#6b7280;font-size:14px">${String(content.ps || '')}</p>
            </div>`,
          })
          sentCount++
        } catch { /* continue */ }
      }

      await sql`UPDATE email_campaigns SET status = 'sent', sent_count = ${sentCount}, recipient_count = ${recipients.length}, sent_at = CURRENT_TIMESTAMP WHERE id = ${campaignId}`
      return NextResponse.json({ ok: true, sentCount })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Email marketing error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([])
  const result = await sql`SELECT * FROM email_campaigns WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 20`
  return NextResponse.json(result.rows)
}
