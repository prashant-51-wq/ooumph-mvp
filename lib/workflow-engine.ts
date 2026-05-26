/**
 * lib/workflow-engine.ts
 *
 * Shared workflow node executor used by both:
 *   - POST /api/workflows/trigger (immediate execution path)
 *   - GET  /api/cron/workflow-steps (delayed execution path)
 *
 * Centralizes all node-type handlers so the visual builder and the runtime
 * stay in sync.
 */

import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'

export interface WorkflowNode {
  id?: string
  type: string
  // send_email / send_sms
  subject?: string
  body?: string
  message?: string
  to_phone?: string
  // update_status / update_contact
  status?: string
  field_updates?: Record<string, string | number>
  // update_score
  scoreChange?: number
  scoreSet?: number
  // add_tag / add_note / log_activity
  tag?: string
  note?: string
  activityTitle?: string
  activityType?: string
  // wait
  delay_minutes?: number
  delay_hours?: number
  delay_days?: number
  // condition
  field?: string
  operator?: 'equals' | 'not_equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains'
  value?: string | number
  if_true?: string[]
  if_false?: string[]
  // ai_action / ai_reply
  prompt?: string
  output_field?: string
  // notify
  channel?: 'slack' | 'email' | 'in_app'
  recipient?: string
  // linear flow
  next?: string
}

export function personalize(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

export function buildVars(
  lead: Record<string, unknown>,
  brand: Record<string, unknown>,
  workspaceId: string,
  contactEmail: string | null,
): Record<string, string> {
  return {
    name: String(lead.name || contactEmail || 'there'),
    email: String(lead.email || contactEmail || ''),
    first_name: String(lead.name || '').split(' ')[0] || 'there',
    company: String(brand.business_name || 'Us'),
    booking_link: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}`,
  }
}

export function evaluateCondition(
  node: WorkflowNode,
  lead: Record<string, unknown>,
  data: Record<string, unknown>,
): boolean {
  if (!node.field || !node.operator) return false
  const source: Record<string, unknown> = { ...lead, ...data }
  const actual = source[node.field]
  const expected = node.value
  switch (node.operator) {
    case 'equals': return String(actual) === String(expected)
    case 'not_equals': return String(actual) !== String(expected)
    case 'gt': return Number(actual) > Number(expected)
    case 'lt': return Number(actual) < Number(expected)
    case 'gte': return Number(actual) >= Number(expected)
    case 'lte': return Number(actual) <= Number(expected)
    case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase())
    default: return false
  }
}

export interface ExecuteContext {
  workspaceId: string
  leadId: string | null
  contactEmail: string | null
  lead: Record<string, unknown>
  brand: Record<string, unknown>
}

export async function executeNode(node: WorkflowNode, ctx: ExecuteContext): Promise<void> {
  const { workspaceId, leadId, contactEmail, lead, brand } = ctx
  const vars = buildVars(lead, brand, workspaceId, contactEmail)
  const now = new Date().toISOString()

  switch (node.type) {
    case 'send_email': {
      if (!contactEmail) return
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
      const fromName = String(brand.business_name || 'Ooumph AI')
      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [contactEmail],
        subject: personalize(node.subject || 'Hi there', vars),
        text: personalize(node.body || '', vars),
      })
      if (leadId) {
        const convRes = await sql`SELECT id FROM inbox_conversations WHERE contact_id = ${leadId} AND status != 'closed' LIMIT 1`
        const convId = (convRes.rows[0] as { id?: string } | undefined)?.id
        if (convId) {
          await sql`INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, to_address, subject, body, channel, status, ai_generated, sent_at, created_at) VALUES (${newId()}, ${convId}, ${workspaceId}, 'outbound', ${contactEmail}, ${node.subject || ''}, ${node.body || ''}, 'email', 'delivered', 1, ${now}, ${now})`
          await sql`UPDATE inbox_conversations SET last_message_at = ${now} WHERE id = ${convId}`
        }
      }
      return
    }

    case 'update_status': {
      if (!leadId || !node.status) return
      await sql`UPDATE leads_captured SET status = ${node.status} WHERE id = ${leadId}`
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'status_changed', ${'Workflow: status → ' + node.status}, '{}', ${now})`
      return
    }

    case 'update_score': {
      if (!leadId) return
      if (node.scoreSet !== undefined) {
        await sql`UPDATE leads_captured SET score = ${node.scoreSet} WHERE id = ${leadId}`
      } else if (node.scoreChange) {
        await sql`UPDATE leads_captured SET score = MIN(100, MAX(0, score + ${node.scoreChange})) WHERE id = ${leadId}`
      }
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'score_changed', 'Workflow: score updated', '{}', ${now})`
      return
    }

    case 'add_tag': {
      if (!leadId || !node.tag) return
      const lr = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      let custom: Record<string, unknown> = {}
      try { custom = JSON.parse(String((lr.rows[0] as { custom_fields?: string } | undefined)?.custom_fields || '{}')) } catch {}
      const tags: string[] = Array.isArray(custom.tags) ? (custom.tags as string[]) : []
      if (!tags.includes(node.tag)) tags.push(node.tag)
      custom.tags = tags
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(custom)} WHERE id = ${leadId}`
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'tag_added', ${'Tagged: ' + node.tag}, '{}', ${now})`
      return
    }

    case 'add_note': {
      if (!leadId || !node.note) return
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'note_added', 'Workflow note', ${node.note}, '{}', ${now})`
      return
    }

    case 'log_activity': {
      if (!leadId) return
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, ${node.activityType || 'agent_action'}, ${node.activityTitle || 'Workflow action'}, '{}', ${now})`
      return
    }

    case 'update_contact': {
      if (!leadId || !node.field_updates) return
      const knownColumns = ['name', 'email', 'phone', 'source', 'status', 'score', 'notes', 'campaign']
      const lr = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      let custom: Record<string, unknown> = {}
      try { custom = JSON.parse(String((lr.rows[0] as { custom_fields?: string } | undefined)?.custom_fields || '{}')) } catch {}
      for (const [k, v] of Object.entries(node.field_updates)) {
        if (knownColumns.includes(k)) {
          if (k === 'status') await sql`UPDATE leads_captured SET status = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'name') await sql`UPDATE leads_captured SET name = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'email') await sql`UPDATE leads_captured SET email = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'phone') await sql`UPDATE leads_captured SET phone = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'source') await sql`UPDATE leads_captured SET source = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'score') await sql`UPDATE leads_captured SET score = ${Number(v)} WHERE id = ${leadId}`
          else if (k === 'notes') await sql`UPDATE leads_captured SET notes = ${String(v)} WHERE id = ${leadId}`
          else if (k === 'campaign') await sql`UPDATE leads_captured SET campaign = ${String(v)} WHERE id = ${leadId}`
        } else {
          custom[k] = v
        }
      }
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(custom)} WHERE id = ${leadId}`
      return
    }

    case 'send_booking_link': {
      if (!contactEmail) return
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
      const fromName = String(brand.business_name || 'Ooumph AI')
      const bookingUrl = vars.booking_link
      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [contactEmail],
        subject: `📅 Book a time with ${fromName}`,
        text: `Hi ${vars.name},\n\nI'd love to connect. Book a time here:\n\n${bookingUrl}\n\n— ${fromName}`,
      })
      return
    }

    case 'ai_action':
    case 'ai_reply': {
      const anthropicKey = process.env.ANTHROPIC_API_KEY
      if (!anthropicKey || !node.prompt) return
      try {
        const personalizedPrompt = personalize(node.prompt, vars)
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 600,
            messages: [{ role: 'user', content: personalizedPrompt }],
          }),
        })
        if (aiRes.ok) {
          const data = await aiRes.json()
          const text = data?.content?.[0]?.text || ''
          if (leadId) {
            await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'agent_action', ${'AI action: ' + (node.prompt || '').slice(0, 60)}, ${text}, ${JSON.stringify({ workflow_ai: true })}, ${now})`
          }
        }
      } catch (err) {
        console.error('[workflow ai_action] failed:', err)
      }
      return
    }

    case 'notify_slack':
    case 'notify': {
      const title = personalize(node.subject || node.activityTitle || 'Workflow notification', vars)
      const body = personalize(node.body || node.note || '', vars)
      await sql`
        INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
        VALUES (${newId()}, ${workspaceId}, ${'workflow'}, ${title}, ${body}, ${'info'}, ${now})
      `
      if (node.channel === 'slack' && process.env.SLACK_WEBHOOK_URL) {
        try {
          await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `*${title}*\n${body}` }),
          })
        } catch (err) {
          console.error('[workflow notify_slack] failed:', err)
        }
      }
      return
    }

    case 'send_sms': {
      if (leadId) {
        await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'sms_sent', 'Workflow: SMS would be sent', ${personalize(node.message || node.body || '', vars)}, ${JSON.stringify({ pending_provider: 'twilio' })}, ${now})`
      }
      return
    }

    case 'wait':
    case 'condition':
    case 'trigger':
      // These node types are handled by the orchestrator (trigger route),
      // not by the per-node executor.
      return

    default:
      console.warn(`[workflow] unknown node type: ${node.type}`)
  }
}
