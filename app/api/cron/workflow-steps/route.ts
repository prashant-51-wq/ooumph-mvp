/**
 * GET /api/cron/workflow-steps
 * Runs daily — processes all pending workflow steps whose scheduled_for has passed.
 * This is what makes delayed nodes (wait 1 day → send follow-up) actually fire.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'

interface WorkflowNode {
  type: string
  subject?: string
  body?: string
  status?: string
  scoreChange?: number
  scoreSet?: number
  note?: string
  activityTitle?: string
  activityType?: string
}

function personalize(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  let executed = 0; let failed = 0

  // Get all pending steps that are due
  const stepsResult = await sql`
    SELECT s.*, l.name as lead_name, l.email as lead_email, l.score, l.status as lead_status,
           bp.business_name
    FROM workflow_pending_steps s
    LEFT JOIN leads_captured l ON l.id = s.lead_id
    LEFT JOIN brand_profiles bp ON bp.workspace_id = s.workspace_id
    WHERE s.status = 'pending'
      AND s.scheduled_for <= ${now}
    LIMIT 100
  `

  const resendKey = process.env.RESEND_API_KEY
  const resend = resendKey ? new Resend(resendKey) : null

  for (const step of stepsResult.rows) {
    try {
      const node = JSON.parse(String(step.node_data)) as WorkflowNode
      const contactEmail = String(step.contact_email || step.lead_email || '')
      const fromName = String(step.business_name || 'Ooumph AI')
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
      const bookingUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${String(step.workspace_id)}`

      const vars: Record<string, string> = {
        name: String(step.lead_name || contactEmail || 'there'),
        email: contactEmail,
        first_name: String(step.lead_name || '').split(' ')[0] || 'there',
        company: fromName,
        booking_link: bookingUrl,
      }

      switch (node.type) {
        case 'send_email': {
          if (contactEmail && resend) {
            await resend.emails.send({
              from: `${fromName} <${fromEmail}>`,
              to: [contactEmail],
              subject: personalize(node.subject || 'Hi there', vars),
              text: personalize(node.body || '', vars),
            })
            // Log in inbox
            if (step.lead_id) {
              const convResult = await sql`SELECT id FROM inbox_conversations WHERE contact_id = ${String(step.lead_id)} AND status != 'closed' LIMIT 1`
              if (convResult.rows[0]) {
                await sql`INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, to_address, subject, body, channel, status, ai_generated, sent_at, created_at) VALUES (${newId()}, ${String(convResult.rows[0].id)}, ${String(step.workspace_id)}, 'outbound', ${contactEmail}, ${node.subject || ''}, ${node.body || ''}, 'email', 'delivered', 1, ${now}, ${now})`
                await sql`UPDATE inbox_conversations SET last_message_at = ${now} WHERE id = ${String(convResult.rows[0].id)}`
              }
            }
          }
          break
        }
        case 'update_status': {
          if (step.lead_id && node.status) {
            await sql`UPDATE leads_captured SET status = ${node.status} WHERE id = ${String(step.lead_id)}`
            await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${String(step.workspace_id)}, ${String(step.lead_id)}, 'status_changed', ${'Workflow: status → ' + node.status}, '{}', ${now})`
          }
          break
        }
        case 'update_score': {
          if (step.lead_id) {
            if (node.scoreSet !== undefined) {
              await sql`UPDATE leads_captured SET score = ${node.scoreSet} WHERE id = ${String(step.lead_id)}`
            } else if (node.scoreChange) {
              await sql`UPDATE leads_captured SET score = LEAST(100, GREATEST(0, score + ${node.scoreChange})) WHERE id = ${String(step.lead_id)}`
            }
            await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${String(step.workspace_id)}, ${String(step.lead_id)}, 'score_changed', 'Workflow: score updated', '{}', ${now})`
          }
          break
        }
        case 'add_note':
        case 'log_activity': {
          if (step.lead_id) {
            await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${String(step.workspace_id)}, ${String(step.lead_id)}, ${node.activityType || 'agent_action'}, ${node.activityTitle || node.note || 'Workflow step'}, ${node.note || null}, '{}', ${now})`
          }
          break
        }
        case 'send_booking_link': {
          if (contactEmail && resend) {
            await resend.emails.send({
              from: `${fromName} <${fromEmail}>`,
              to: [contactEmail],
              subject: `📅 Book a time with ${fromName}`,
              text: `Hi ${vars.name},\n\nI'd love to connect. Book a time here:\n\n${bookingUrl}\n\n— ${fromName}`,
            })
          }
          break
        }
      }

      await sql`UPDATE workflow_pending_steps SET status = 'executed' WHERE id = ${String(step.id)}`
      executed++
    } catch (e) {
      await sql`UPDATE workflow_pending_steps SET status = 'failed', error_message = ${String(e)} WHERE id = ${String(step.id)}`
      failed++
    }
  }

  return NextResponse.json({ ok: true, executed, failed })
}
