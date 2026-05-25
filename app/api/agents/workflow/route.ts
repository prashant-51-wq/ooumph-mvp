/**
 * Workflow Design Agent
 * POST { workspaceId, mode, description?, workflowId? }
 *
 * modes:
 *   design   — Generate a complete workflow from a natural language description
 *   analyze  — Analyze workflow performance, suggest improvements
 *   suggest  — Suggest workflows for this workspace based on their setup
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'

const SYSTEM = `You are the Workflow Design Agent for Ooumph AI Marketing OS.
You design marketing automation workflows that convert leads into customers.
You understand triggers, actions, delays, and conditions deeply.
You write workflow nodes as precise JSON that an execution engine will run.
Always respond with valid JSON.`

const NODE_REFERENCE = `
Available node types:
- send_email: { type, subject, body } — body supports {{name}}, {{email}}, {{first_name}}, {{company}}, {{booking_link}}
- update_status: { type, status } — status: new|contacted|qualified|converted|lost
- update_score: { type, scoreChange } — scoreChange: +10 or -5 etc. OR scoreSet: 80
- add_note: { type, note } — adds activity note to lead timeline
- log_activity: { type, activityTitle, activityType } — logs custom activity
- wait: { type, delay_minutes } — pauses before next node (e.g. 1440 = 24h)
- send_booking_link: { type } — sends email with booking link

Each node must have a unique id field (e.g. "n1", "n2", etc.).
Add delay_minutes to any node to wait before executing it.

Available trigger types:
- lead_captured: fires when a new lead is added to CRM
- email_received: fires when lead sends an inbound email
- meeting_booked: fires when lead books a meeting
- meeting_noshow: fires when lead misses their meeting
- meeting_completed: fires when meeting is marked complete
- score_threshold: fires when lead score crosses a value
- status_changed: fires when lead status changes
- manual: triggered manually from dashboard

Trigger conditions (trigger_config):
- score_min, score_max: filter by score range
- status: filter by current status
- source: filter by lead source`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'design' | 'analyze' | 'suggest'
      description?: string
      workflowId?: string
    }
    const { workspaceId, mode, description, workflowId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] || {}

    // ── design ─────────────────────────────────────────────────────────────────
    if (mode === 'design') {
      if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

      interface WorkflowDesign {
        name: string
        description: string
        trigger_type: string
        trigger_config: Record<string, unknown>
        nodes: Array<Record<string, unknown>>
        explanation: string
        expectedOutcome: string
      }

      const result = await runAgent<WorkflowDesign>(
        SYSTEM,
        `Design a marketing automation workflow for this business.

Business: ${String(brand.business_name || 'our company')}
Offer: ${String(brand.offer || 'marketing services')}
Target audience: ${String(brand.target_audience || 'businesses')}
Brand tone: ${String(brand.tone || 'professional')}

Requested workflow:
"${description}"

${NODE_REFERENCE}

Design a complete workflow. Make emails personal, specific, and on-brand.
Do not use generic filler — write actual compelling email copy.

Respond with JSON:
{
  "name": "workflow name",
  "description": "what this workflow does",
  "trigger_type": "lead_captured",
  "trigger_config": {},
  "nodes": [
    { "id": "n1", "type": "send_email", "subject": "...", "body": "..." },
    { "id": "n2", "type": "wait", "delay_minutes": 1440 },
    { "id": "n3", "type": "update_status", "status": "contacted" }
  ],
  "explanation": "step-by-step explanation of what this does",
  "expectedOutcome": "what result this workflow achieves"
}`,
      )

      return NextResponse.json({ ok: true, workflow: result })
    }

    // ── suggest ────────────────────────────────────────────────────────────────
    if (mode === 'suggest') {
      const [existingWfs, leadsResult, bookingsResult] = await Promise.all([
        sql`SELECT name, trigger_type FROM workflows WHERE workspace_id = ${workspaceId}`,
        sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId}`,
        sql`SELECT COUNT(*) as c FROM bookings WHERE workspace_id = ${workspaceId}`,
      ])

      const existing = existingWfs.rows.map(w => String(w.name)).join(', ') || 'none'
      const leadCount = Number(leadsResult.rows[0]?.c || 0)
      const bookingCount = Number(bookingsResult.rows[0]?.c || 0)

      interface SuggestionResult { suggestions: Array<{ name: string; description: string; trigger: string; priority: string; reasoning: string }> }
      const result = await runAgent<SuggestionResult>(
        SYSTEM,
        `Suggest the most impactful automation workflows for this business.

Business: ${String(brand.business_name || 'unnamed')}
Leads in CRM: ${leadCount}
Meetings booked: ${bookingCount}
Existing workflows: ${existing}

Based on their stage and gaps, suggest 5 workflows they should build next.
Prioritise by revenue impact.

Respond with JSON:
{
  "suggestions": [
    {
      "name": "workflow name",
      "description": "what it does in 1 sentence",
      "trigger": "trigger_type",
      "priority": "high|medium|low",
      "reasoning": "why this workflow matters for them right now"
    }
  ]
}`,
      )

      return NextResponse.json({ ok: true, ...result })
    }

    // ── analyze ────────────────────────────────────────────────────────────────
    if (mode === 'analyze') {
      if (!workflowId) return NextResponse.json({ error: 'workflowId required for analyze' }, { status: 400 })

      const [wfResult, runsResult, pendingResult] = await Promise.all([
        sql`SELECT * FROM workflows WHERE id = ${workflowId} LIMIT 1`,
        sql`SELECT status, COUNT(*) as c FROM workflow_runs WHERE workflow_id = ${workflowId} GROUP BY status`,
        sql`SELECT COUNT(*) as c FROM workflow_pending_steps WHERE workflow_id = ${workflowId} AND status = 'pending'`,
      ])

      const wf = wfResult.rows[0]
      if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })

      const runStats = Object.fromEntries(runsResult.rows.map(r => [String(r.status), Number(r.c)]))

      interface AnalysisResult { health: string; summary: string; issues: string[]; improvements: string[] }
      const result = await runAgent<AnalysisResult>(
        SYSTEM,
        `Analyze this workflow's performance and suggest improvements.

Workflow: ${String(wf.name)}
Trigger: ${String(wf.trigger_type)}
Status: ${String(wf.status)}
Total runs: ${String(wf.run_count)}
Run breakdown: ${JSON.stringify(runStats)}
Pending steps: ${String(pendingResult.rows[0]?.c || 0)}
Nodes: ${String(wf.nodes)}

Respond with JSON:
{
  "health": "healthy|warning|issues",
  "summary": "one paragraph assessment",
  "issues": ["issue1", "issue2"],
  "improvements": ["specific improvement 1", "specific improvement 2"]
}`,
      )

      return NextResponse.json({ ok: true, analysis: result, stats: { ...runStats, pending: Number(pendingResult.rows[0]?.c || 0) } })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (error) {
    console.error('Workflow agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
