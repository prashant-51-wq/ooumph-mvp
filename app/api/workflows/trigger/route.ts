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

// ── Node types ─────────────────────────────────────────────────────────────────
interface WorkflowNode {
  id: string
  type: 'send_email' | 'update_status' | 'update_score' | 'add_tag' | 'add_note' | 'log_activity' | 'wait' | 'condition' | 'notify_slack' | 'send_booking_link' | 'ai_reply'
  // send_email
  subject?: string
  body?: string
  // update_status
  status?: string
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
  // condition
  field?: string
  operator?: 'equals' | 'not_equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains'
  value?: string | number
  if_true?: string[]    // node ids to execute if true
  if_false?: string[]   // node ids to execute if false
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
      let cumulativeDelay = 0
      let completedNodes: string[] = []

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const nodeDelay = node.delay_minutes || 0
        cumulativeDelay += nodeDelay

        if (cumulativeDelay === 0) {
          // Execute immediately
          try {
            await executeNode(node, workspaceId, resolvedLeadId || null, resolvedEmail || null, lead, brand)
            completedNodes.push(node.id || String(i))
          } catch (nodeErr) {
            console.error(`Node ${node.type} failed:`, nodeErr)
          }
        } else {
          // Schedule for later
          const scheduledFor = new Date(Date.now() + cumulativeDelay * 60000).toISOString()
          await sql`
            INSERT INTO workflow_pending_steps (id, workflow_run_id, workflow_id, workspace_id, node_index, node_data, lead_id, contact_email, scheduled_for, status, created_at)
            VALUES (${newId()}, ${runId}, ${String(wf.id)}, ${workspaceId}, ${i}, ${JSON.stringify(node)}, ${resolvedLeadId || null}, ${resolvedEmail || null}, ${scheduledFor}, 'pending', ${now})
          `
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
