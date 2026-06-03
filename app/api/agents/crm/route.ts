/**
 * CRM Intelligence Agent
 * POST { workspaceId, mode, leadId?, listId?, context? }
 *
 * modes:
 *   suggest_action   — For a specific lead: what should we do next?
 *   analyze_contact  — Deep analysis of a lead's history + signals
 *   list_insights    — Insights on a smart list (what do these leads have in common?)
 *   bulk_tag         — Auto-tag all leads in a smart list based on behavior
 *   write_outreach   — Generate personalised outreach for a lead or list
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

const SYSTEM = `You are the CRM Intelligence Agent for Ooumph AI Marketing OS.
You analyse lead data, activity timelines, and behavioral signals to recommend precise actions.
You know that timing and personalisation are the difference between a closed deal and a lost lead.
Always respond with valid JSON.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'suggest_action' | 'analyze_contact' | 'list_insights' | 'bulk_tag' | 'write_outreach'
      leadId?: string
      listId?: string
      context?: string
    }
    const { workspaceId, mode, leadId, listId, context } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] || {}

    // ── suggest_action & analyze_contact ──────────────────────────────────────
    if (mode === 'suggest_action' || mode === 'analyze_contact') {
      if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

      const [leadResult, activitiesResult, bookingsResult] = await Promise.all([
        sql`SELECT * FROM leads_captured WHERE id = ${leadId} LIMIT 1`,
        sql`SELECT * FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 20`,
        sql`SELECT title, start_time, status FROM bookings WHERE contact_id = ${leadId} ORDER BY start_time DESC LIMIT 5`,
      ])

      const lead = leadResult.rows[0]
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

      const activitySummary = activitiesResult.rows
        .map(a => `[${new Date(String(a.created_at)).toLocaleDateString()}] ${String(a.type)}: ${String(a.title)}`)
        .join('\n') || 'No recorded activity yet'

      const bookingSummary = bookingsResult.rows
        .map(b => `- ${String(b.title)} on ${new Date(String(b.start_time)).toLocaleDateString()} (${String(b.status)})`)
        .join('\n') || 'No meetings'

      if (mode === 'analyze_contact') {
        interface AnalysisResult {
          buyingSignals: string[]
          concerns: string[]
          likelyObjections: string[]
          recommendedApproach: string
          estimatedCloseTime: string
          confidence: string
          summary: string
        }
        const result = await runAgent<AnalysisResult>(
          SYSTEM,
          `Deep analysis of this lead for ${String(brand.business_name || 'our company')}.

Lead: ${String(lead.name || 'Unknown')} | ${String(lead.email || '')}
Score: ${String(lead.score)} | Status: ${String(lead.status)} | Source: ${String(lead.source)}
Notes: ${String(lead.notes || 'none')}

Activity history:
${activitySummary}

Meetings:
${bookingSummary}

${context ? `Additional context: ${context}` : ''}

Respond with JSON:
{
  "buyingSignals": ["signal1", "signal2"],
  "concerns": ["concern1"],
  "likelyObjections": ["objection1"],
  "recommendedApproach": "how to engage this lead",
  "estimatedCloseTime": "e.g. 2 weeks / 30 days / unlikely",
  "confidence": "high|medium|low",
  "summary": "2-3 sentence executive summary"
}`,
          workspaceId,
        )
        return NextResponse.json({ ok: true, analysis: result })
      }

      // suggest_action
      interface ActionResult {
        nextAction: string
        actionType: string
        urgency: string
        message?: { subject: string; body: string }
        reasoning: string
        scoreChange?: number
      }
      const result = await runAgent<ActionResult>(
        SYSTEM,
        `What is the single best next action for this lead?

Business: ${String(brand.business_name || 'our company')}
Lead: ${String(lead.name)} | Score: ${String(lead.score)} | Status: ${String(lead.status)}
Activity: ${activitySummary}
Meetings: ${bookingSummary}
${context ? `Context: ${context}` : ''}

Respond with JSON:
{
  "nextAction": "specific action description",
  "actionType": "send_email|book_meeting|call|close|disqualify|nurture|wait",
  "urgency": "immediate|today|this_week|low",
  "message": { "subject": "...", "body": "..." },
  "reasoning": "why this action now",
  "scoreChange": 5
}`,
        workspaceId,
      )

      // Auto-log the suggestion as an activity
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${leadId}, 'agent_action', ${'AI Suggestion: ' + result.nextAction}, ${result.reasoning}, ${JSON.stringify({ actionType: result.actionType, urgency: result.urgency })}, ${new Date().toISOString()})
      `

      return NextResponse.json({ ok: true, action: result })
    }

    // ── list_insights ─────────────────────────────────────────────────────────
    if (mode === 'list_insights') {
      if (!listId) return NextResponse.json({ error: 'listId required' }, { status: 400 })

      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const listRes = await fetch(`${appUrl}/api/leads-captured/smart-lists?workspaceId=${workspaceId}&list=${listId}`)
      const leads = await listRes.json() as Array<Record<string, unknown>>

      if (!leads.length) return NextResponse.json({ ok: true, insights: { summary: 'No leads in this list.', patterns: [], recommendations: [] } })

      const sample = leads.slice(0, 20).map(l => ({
        score: l.score, status: l.status, source: l.source, campaign: l.campaign,
        created: l.created_at,
      }))

      interface InsightResult { summary: string; patterns: string[]; recommendations: string[]; bestNextAction: string }
      const result = await runAgent<InsightResult>(
        SYSTEM,
        `Analyze this smart list of ${leads.length} leads for ${String(brand.business_name || 'our company')}.
List: "${listId}"
Sample data: ${JSON.stringify(sample)}

Find patterns, what these leads have in common, and what action to take on this segment.

Respond with JSON:
{
  "summary": "what defines this segment",
  "patterns": ["pattern1", "pattern2"],
  "recommendations": ["action1", "action2"],
  "bestNextAction": "the single highest-leverage action for this whole list"
}`,
        workspaceId,
      )
      return NextResponse.json({ ok: true, insights: result, count: leads.length })
    }

    // ── write_outreach ────────────────────────────────────────────────────────
    if (mode === 'write_outreach') {
      if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

      const leadResult = await sql`SELECT * FROM leads_captured WHERE id = ${leadId} LIMIT 1`
      const actResult = await sql`SELECT * FROM lead_activities WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 10`
      const lead = leadResult.rows[0]
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

      const actSummary = actResult.rows.map(a => String(a.title)).join(', ') || 'no prior contact'

      interface OutreachResult { subject: string; body: string; cta: string; tone: string }
      const result = await runAgent<OutreachResult>(
        SYSTEM,
        `Write a personalised outreach email for this lead.

Business: ${String(brand.business_name || 'our company')}
Brand tone: ${String(brand.tone || 'professional')}
Offer: ${String(brand.offer || '')}
Booking link: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://ooumph-mvp.vercel.app'}/book/${workspaceId}

Lead: ${String(lead.name)} | ${String(lead.email)}
Score: ${String(lead.score)} | Source: ${String(lead.source)} | Campaign: ${String(lead.campaign || 'unknown')}
Recent activity: ${actSummary}
${context ? `Special instruction: ${context}` : ''}

Write a concise, personalised email. No generic templates — reference their context.

Respond with JSON: { "subject": "...", "body": "...", "cta": "the call to action", "tone": "professional|casual|urgent" }`,
        workspaceId,
      )

      // Log outreach generation
      await sql`
        INSERT INTO lead_activities (id, workspace_id, lead_id, type, title, description, metadata_json, created_at)
        VALUES (${newId()}, ${workspaceId}, ${leadId}, 'agent_action', 'AI outreach email drafted', ${result.subject}, '{}', ${new Date().toISOString()})
      `

      return NextResponse.json({ ok: true, outreach: result })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (error) {
    console.error('CRM agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
