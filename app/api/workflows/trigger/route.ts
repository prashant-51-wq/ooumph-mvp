/**
 * POST /api/workflows/trigger
 * Fires a trigger event — finds matching active workflows and executes them.
 * Called by: lead capture, inbox webhook, booking confirmation, cron no-show.
 *
 * Body: { workspaceId, triggerType, leadId?, contactEmail?, data? }
 *
 * This is the central nervous system of the automation engine.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { Resend } from 'resend'
import { assertWorkspaceOwnership } from '@/lib/guards'

// ── Node types ─────────────────────────────────────────────────────────────────
interface WorkflowNode {
  id: string
  type:
    | 'send_email' | 'send_sms' | 'update_status' | 'update_score'
    | 'add_tag' | 'add_note' | 'log_activity' | 'wait' | 'condition'
    | 'notify_slack' | 'notify' | 'send_booking_link' | 'ai_reply'
    | 'ai_action' | 'update_contact' | 'trigger'
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
  // next node (linear flow)
  next?: string
}

interface WorkflowTriggerConfig {
  score_min?: number
  score_max?: number
  status?: string
  source?: string
  campaign?: string
}

// ── Personalize templates ──────────────────────────────────────────────────────
function personalize(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

// ── Execute a single node immediately ─────────────────────────────────────────
async function executeNode(
  node: WorkflowNode,
  workspaceId: string,
  leadId: string | null,
  contactEmail: string | null,
  lead: Record<string, unknown>,
  brand: Record<string, unknown>
): Promise<void> {
  const vars: Record<string, string> = {
    name: String(lead.name || contactEmail || 'there'),
    email: String(lead.email || contactEmail || ''),
    first_name: String(lead.name || '').split(' ')[0] || 'there',
    company: String(brand.business_name || 'Us'),
    booking_link: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}`,
  }

  switch (node.type) {
    case 'send_email': {
      if (!contactEmail) break
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) break
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
      const fromName = String(brand.business_name || 'Ooumph AI')
      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [contactEmail],
        subject: personalize(node.subject || 'Hi there', vars),
        text: personalize(node.body || '', vars),
      })
      // Log to inbox
      if (leadId) {
        const convResult = await sql`SELECT id FROM inbox_conversations WHERE contact_id = ${leadId} AND status != 'closed' LIMIT 1`
        if (convResult.rows[0]) {
          const now = new Date().toISOString()
          await sql`
            INSERT INTO inbox_messages (id, conversation_id, workspace_id, direction, to_address, subject, body, channel, status, ai_generated, sent_at, created_at)
            VALUES (${newId()}, ${String(convResult.rows[0].id)}, ${workspaceId}, 'outbound', ${contactEmail}, ${node.subject || ''}, ${node.body || ''}, 'email', 'delivered', 1, ${now}, ${now})
          `
          await sql`UPDATE inbox_conversations SET last_message_at = ${now} WHERE id = ${String(convResult.rows[0].id)}`
        }
      }
      break
    }
    case 'update_status': {
      if (!leadId || !node.status) break
      const oldStatusResult = await sql`SELECT status FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      const oldStatus = String(oldStatusResult.rows[0]?.status || '')
      await sql`UPDATE leads_captured SET status = ${node.status} WHERE id = ${leadId}`
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'status_changed', ${'Workflow: ' + oldStatus + ' → ' + node.status}, '{}', ${new Date().toISOString()})`
      break
    }
    case 'update_score': {
      if (!leadId) break
      if (node.scoreSet !== undefined) {
        await sql`UPDATE leads_captured SET score = ${node.scoreSet} WHERE id = ${leadId}`
      } else if (node.scoreChange) {
        await sql`UPDATE leads_captured SET score = LEAST(100, GREATEST(0, score + ${node.scoreChange})) WHERE id = ${leadId}`
      }
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'score_changed', ${'Workflow: score updated'}, '{}', ${new Date().toISOString()})`
      break
    }
    case 'add_note': {
      if (!leadId || !node.note) break
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'note_added', 'Workflow note', ${node.note}, '{}', ${new Date().toISOString()})`
      break
    }
    case 'log_activity': {
      if (!leadId) break
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, ${node.activityType || 'agent_action'}, ${node.activityTitle || 'Workflow action'}, '{}', ${new Date().toISOString()})`
      break
    }
    case 'send_booking_link': {
      if (!contactEmail) break
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) break
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@ooumph.ai'
      const fromName = String(brand.business_name || 'Ooumph AI')
      const bookingUrl = vars.booking_link
      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [contactEmail],
        subject: `📅 Book a time with ${fromName}`,
        text: `Hi ${vars.name},\n\nI'd love to connect. You can book a time that works for you here:\n\n${bookingUrl}\n\nLooking forward to speaking with you!\n\n— ${fromName}`,
      })
      break
    }
    case 'add_tag': {
      if (!leadId || !node.tag) break
      // Tags live in custom_fields JSON.tags[]
      const lr = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      let custom: Record<string, unknown> = {}
      try { custom = JSON.parse(String(lr.rows[0]?.custom_fields || '{}')) } catch {}
      const tags: string[] = Array.isArray(custom.tags) ? (custom.tags as string[]) : []
      if (!tags.includes(node.tag)) tags.push(node.tag)
      custom.tags = tags
      await sql`UPDATE leads_captured SET custom_fields = ${JSON.stringify(custom)} WHERE id = ${leadId}`
      await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'tag_added', ${'Tagged: ' + node.tag}, '{}', ${new Date().toISOString()})`
      break
    }
    case 'update_contact': {
      if (!leadId || !node.field_updates) break
      // Apply each field update (only known columns; the rest go to custom_fields)
      const knownColumns = ['name', 'email', 'phone', 'source', 'status', 'score', 'notes', 'campaign']
      const lr = await sql`SELECT custom_fields FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      let custom: Record<string, unknown> = {}
      try { custom = JSON.parse(String(lr.rows[0]?.custom_fields || '{}')) } catch {}
      for (const [k, v] of Object.entries(node.field_updates)) {
        if (knownColumns.includes(k)) {
          // Build a single-column update — using template literal interpolation is safe for known columns
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
      break
    }
    case 'ai_action':
    case 'ai_reply': {
      // Use Claude to generate a personalized response/action
      const anthropicKey = process.env.ANTHROPIC_API_KEY
      if (!anthropicKey || !node.prompt) break
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
          // Log the AI action result as an activity on the lead
          if (leadId) {
            await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'agent_action', ${'AI action: ' + (node.prompt || '').slice(0, 60)}, ${text}, ${JSON.stringify({ workflow_ai: true })}, ${new Date().toISOString()})`
          }
        }
      } catch (err) {
        console.error('[workflow ai_action] failed:', err)
      }
      break
    }
    case 'notify_slack':
    case 'notify': {
      // In-app notification (always works); Slack only if SLACK_WEBHOOK_URL is set
      const title = personalize(node.subject || node.activityTitle || 'Workflow notification', vars)
      const body = personalize(node.body || node.note || '', vars)
      await sql`
        INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
        VALUES (${newId()}, ${workspaceId}, ${'workflow'}, ${title}, ${body}, ${'info'}, ${new Date().toISOString()})
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
      break
    }
    case 'send_sms': {
      // SMS placeholder — would integrate with Twilio. For now, log as activity.
      if (leadId) {
        await sql`INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at) VALUES (${newId()}, ${workspaceId}, ${leadId}, 'sms_sent', 'Workflow: SMS would be sent', ${personalize(node.message || node.body || '', vars)}, ${JSON.stringify({ pending_provider: 'twilio' })}, ${new Date().toISOString()})`
      }
      break
    }
    case 'wait':
    case 'trigger':
    case 'condition': {
      // wait nodes are handled by scheduling in the main trigger loop
      // condition nodes are handled by the branching path
      // trigger nodes are entry points and don't have execution semantics
      break
    }
  }
}

// ── Evaluate condition node ────────────────────────────────────────────────────
function evaluateCondition(node: WorkflowNode, lead: Record<string, unknown>, data: Record<string, unknown>): boolean {
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

// ── Check trigger conditions ───────────────────────────────────────────────────
function matchesTriggerConditions(config: WorkflowTriggerConfig, lead: Record<string, unknown>): boolean {
  if (config.score_min !== undefined && Number(lead.score || 0) < config.score_min) return false
  if (config.score_max !== undefined && Number(lead.score || 0) > config.score_max) return false
  if (config.status && String(lead.status || '') !== config.status) return false
  if (config.source && String(lead.source || '') !== config.source) return false
  if (config.campaign && !String(lead.campaign || '').toLowerCase().includes(config.campaign.toLowerCase())) return false
  return true
}

// ── Main trigger handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      triggerType: string
      leadId?: string
      contactEmail?: string
      data?: Record<string, unknown>
    }
    const { workspaceId, triggerType, leadId, contactEmail, data } = body

    if (!workspaceId || !triggerType) {
      return NextResponse.json({ error: 'workspaceId, triggerType required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Find all active workflows that match this trigger
    const workflowsResult = await sql`
      SELECT * FROM workflows
      WHERE workspace_id = ${workspaceId}
        AND trigger_type = ${triggerType}
        AND status = 'active'
    `

    if (workflowsResult.rows.length === 0) {
      return NextResponse.json({ ok: true, triggered: 0 })
    }

    // Load lead data + brand
    let lead: Record<string, unknown> = {}
    if (leadId) {
      const lr = await sql`SELECT * FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      lead = lr.rows[0] || {}
    } else if (contactEmail) {
      const lr = await sql`SELECT * FROM leads_captured WHERE email = ${contactEmail} LIMIT 1`
      lead = lr.rows[0] || {}
    }

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] || {}

    const resolvedLeadId = leadId || String(lead.id || '')
    const resolvedEmail = contactEmail || String(lead.email || '')

    let triggered = 0

    for (const wf of workflowsResult.rows) {
      // Check trigger conditions
      const triggerConfig = (() => {
        try { return JSON.parse(String(wf.trigger_config || '{}')) as WorkflowTriggerConfig }
        catch { return {} }
      })()

      if (!matchesTriggerConditions(triggerConfig, lead)) continue

      const nodes: WorkflowNode[] = (() => {
        try { return JSON.parse(String(wf.nodes || '[]')) as WorkflowNode[] }
        catch { return [] }
      })()

      if (!nodes.length) continue

      // Create run record
      const runId = newId()
      const now = new Date().toISOString()
      await sql`
        INSERT INTO workflow_runs (id, workflow_id, workspace_id, lead_id, contact_email, trigger_data, status, current_node, nodes_completed, started_at)
        VALUES (${runId}, ${String(wf.id)}, ${workspaceId}, ${resolvedLeadId || null}, ${resolvedEmail || null}, ${JSON.stringify(data || {})}, 'running', 0, '[]', ${now})
      `

      // Execute nodes — immediate ones now, delayed ones scheduled
      // Wait nodes accumulate delay; condition nodes branch; trigger nodes are entry points (skipped).
      let cumulativeDelayMinutes = 0
      const completedNodes: string[] = []
      const triggerData = data || {}

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]

        // Skip trigger entry-point nodes
        if (node.type === 'trigger') continue

        // Wait nodes accumulate delay for subsequent nodes
        if (node.type === 'wait') {
          cumulativeDelayMinutes += (node.delay_minutes || 0)
          cumulativeDelayMinutes += (node.delay_hours || 0) * 60
          cumulativeDelayMinutes += (node.delay_days || 0) * 1440
          completedNodes.push(node.id || String(i))
          continue
        }

        // Condition nodes evaluate the branch and skip subsequent if false
        if (node.type === 'condition') {
          const passes = evaluateCondition(node, lead, triggerData)
          completedNodes.push(node.id || String(i))
          if (!passes) {
            // Skip until we hit a sibling or end of branch
            // Simple linear model: if condition fails, stop the rest of the workflow
            // (more advanced: would jump to a "false-branch" sub-array)
            break
          }
          continue
        }

        // Any node may also declare its own delay
        const nodeOwnDelay = (node.delay_minutes || 0) + (node.delay_hours || 0) * 60 + (node.delay_days || 0) * 1440
        const totalDelay = cumulativeDelayMinutes + nodeOwnDelay

        if (totalDelay === 0) {
          try {
            await executeNode(node, workspaceId, resolvedLeadId || null, resolvedEmail || null, lead, brand)
            completedNodes.push(node.id || String(i))
          } catch (nodeErr) {
            console.error(`[workflow node ${node.type}] failed:`, nodeErr)
          }
        } else {
          const scheduledFor = new Date(Date.now() + totalDelay * 60000).toISOString()
          await sql`
            INSERT INTO workflow_pending_steps (id, workflow_run_id, workflow_id, workspace_id, node_index, node_data, lead_id, contact_email, scheduled_for, status, created_at)
            VALUES (${newId()}, ${runId}, ${String(wf.id)}, ${workspaceId}, ${i}, ${JSON.stringify(node)}, ${resolvedLeadId || null}, ${resolvedEmail || null}, ${scheduledFor}, 'pending', ${now})
          `
          completedNodes.push(`${node.id || i}:scheduled@${totalDelay}min`)
        }
      }

      // Update run
      await sql`
        UPDATE workflow_runs SET status = 'completed', current_node = ${nodes.length}, nodes_completed = ${JSON.stringify(completedNodes)}, completed_at = ${new Date().toISOString()}
        WHERE id = ${runId}
      `
      // Update workflow run count
      await sql`UPDATE workflows SET run_count = run_count + 1, last_run_at = ${now} WHERE id = ${String(wf.id)}`

      triggered++
    }

    return NextResponse.json({ ok: true, triggered })
  } catch (error) {
    console.error('Workflow trigger error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
