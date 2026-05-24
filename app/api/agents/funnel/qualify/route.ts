/**
 * Lead Qualifier Worker — Lead & Funnel Ops Supervisor
 * Scores and qualifies leads based on ICP criteria, behavioural signals,
 * and custom qualification frameworks (BANT, MEDDIC, GPCTBA/C&I).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Lead Qualifier Agent for Ooumph AI Marketing OS.
You score leads against ICP criteria and qualification frameworks.
You create scoring models, qualification scripts, and CRM pipeline rules.
Be specific and data-driven. Avoid vague scoring criteria.
Always respond with valid JSON.`

interface ScoringCriterion {
  criterion: string            // what to evaluate
  weight: number               // 1-10 importance weight
  values: Array<{
    answer: string             // possible answer/value
    score: number              // points awarded (0-10)
    note: string               // sales rep note
  }>
}

interface QualificationScript {
  framework: 'BANT' | 'MEDDIC' | 'GPCTBA' | 'SPIN' | 'custom'
  questions: Array<{
    question: string
    purpose: string            // what this question reveals
    goodAnswers: string[]      // signals of a qualified lead
    badAnswers: string[]       // disqualifying signals
    followUp: string           // follow-up question if answer is ambiguous
  }>
}

interface LeadScoringModel {
  modelName: string
  thresholds: {
    hot: number                // 80+ = hot, call immediately
    warm: number               // 50-79 = warm, nurture
    cold: number               // below 50 = cold, long-term nurture / discard
  }
  scoringCriteria: ScoringCriterion[]
  qualificationScript: QualificationScript
  disqualificationRules: string[]    // instant disqualifiers
  automationRules: string[]          // CRM automation triggers based on score
  handoffCriteria: string[]          // when to hand off to sales
  nurturePath: {
    hot: string                      // next step for hot leads
    warm: string                     // next step for warm leads
    cold: string                     // next step for cold leads
  }
}

interface LeadScore {
  leadId: string
  totalScore: number
  tier: 'hot' | 'warm' | 'cold'
  breakdown: Array<{ criterion: string; score: number; maxScore: number }>
  recommendation: string
  nextAction: string
  estimatedCloseTime: string
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json() as {
      workspaceId: string
      mode: 'build_model' | 'score_lead'
      leadData?: Record<string, unknown>
    }
    const { workspaceId, mode, leadData } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const [brandResult, strategyResult, leadsResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'lead_gen_plan' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'lead_qualifier', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const leadsGen = leadsResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const icp = (strategy as { icp?: Record<string, unknown> })?.icp
    const qualRules = (leadsGen as { qualificationRules?: string[] })?.qualificationRules
    const icpFilters = (leadsGen as { icpFilters?: Record<string, unknown> })?.icpFilters

    // Mode 1: Build the scoring model
    if (mode === 'build_model' || !mode) {
      const prompt = `Build a lead scoring and qualification model for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Industry: ${brand.industry || 'Not specified'}
${icp ? `ICP: ${JSON.stringify(icp)}` : ''}
${icpFilters ? `ICP Filters: ${JSON.stringify(icpFilters)}` : ''}
${qualRules ? `Qualification Rules: ${qualRules.join(' | ')}` : ''}

Create a practical lead scoring model that:
- Has 5-8 scoring criteria weighted by importance
- Includes clear thresholds for hot/warm/cold classification
- Has a qualification script (BANT or MEDDIC appropriate for B2B/B2C)
- Includes automation rules for CRM (e.g. Notion, HubSpot, Airtable)
- Gives clear next actions for each tier

Return JSON:
{
  "modelName": "Lead Scoring Model for ${brand.business_name}",
  "thresholds": { "hot": 80, "warm": 50, "cold": 0 },
  "scoringCriteria": [
    {
      "criterion": "Budget match",
      "weight": 9,
      "values": [
        { "answer": "Within budget range", "score": 10, "note": "Proceed immediately" },
        { "answer": "Slightly under budget", "score": 5, "note": "Explore flexibility" },
        { "answer": "No budget", "score": 0, "note": "Add to long-term nurture" }
      ]
    }
  ],
  "qualificationScript": {
    "framework": "BANT|MEDDIC|GPCTBA|SPIN|custom",
    "questions": [
      {
        "question": "Specific qualification question",
        "purpose": "What this reveals",
        "goodAnswers": ["signal1", "signal2"],
        "badAnswers": ["disqualifier1"],
        "followUp": "Follow-up if answer is vague"
      }
    ]
  },
  "disqualificationRules": ["Instant disqualifier 1"],
  "automationRules": ["If score >= 80, assign to sales rep and send hot lead alert"],
  "handoffCriteria": ["When to transfer to a human salesperson"],
  "nurturePath": {
    "hot": "Call within 24 hours, send proposal",
    "warm": "Add to 14-day email nurture sequence",
    "cold": "Add to 90-day content newsletter"
  }
}`

      const model = await runAgent<LeadScoringModel>(SYSTEM, prompt)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(model)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      const artifactId = newId()
      const title = `Lead Scoring Model — ${brand.business_name}`
      const contentJson = { ...model, businessName: brand.business_name }
      await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
                VALUES (${artifactId}, ${workspaceId}, ${runId}, 'lead_scoring_model', ${title}, ${JSON.stringify(contentJson)})`
      await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

      await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
                VALUES (${newId()}, ${workspaceId}, 'lead_qualifier', ${artifactId},
                        ${`Lead scoring model built: hot threshold ${model.thresholds?.hot}, ${model.scoringCriteria?.length || 0} criteria. Framework: ${model.qualificationScript?.framework}`}, 0.85)`

      return NextResponse.json({
        artifactId,
        model: contentJson,
        criteriaCount: model.scoringCriteria?.length || 0,
        message: `Lead scoring model created: ${model.scoringCriteria?.length || 0} criteria, hot threshold at ${model.thresholds?.hot} points.`,
      })
    }

    // Mode 2: Score a specific lead
    if (mode === 'score_lead' && leadData) {
      // Load the latest scoring model
      const modelResult = await sql`
        SELECT content_json FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'lead_scoring_model'
        ORDER BY created_at DESC LIMIT 1
      `
      const model = modelResult.rows[0]?.content_json as LeadScoringModel | undefined
      if (!model) {
        return NextResponse.json({ error: 'Build a lead scoring model first.' }, { status: 400 })
      }

      const scorePrompt = `Score this lead against the model:

Lead Data: ${JSON.stringify(leadData, null, 2)}

Scoring Model: ${JSON.stringify(model, null, 2)}

Calculate the lead's total score, tier, and next action.

Return JSON:
{
  "leadId": "${leadData.id || 'unknown'}",
  "totalScore": 0-100,
  "tier": "hot|warm|cold",
  "breakdown": [
    { "criterion": "criterion name", "score": 8, "maxScore": 10 }
  ],
  "recommendation": "Specific recommendation for this lead",
  "nextAction": "Specific next step",
  "estimatedCloseTime": "e.g. 7-14 days"
}`

      const score = await runAgent<LeadScore>(SYSTEM, scorePrompt)

      await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(score)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

      // Push to HubSpot CRM if configured
      let hubspotContactId: string | null = null
      const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN
      if (hubspotToken && leadData.email) {
        try {
          // Upsert contact and set lead score property
          const hubRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${hubspotToken}`,
            },
            body: JSON.stringify({
              properties: {
                email: String(leadData.email),
                firstname: String(leadData.firstName || leadData.first_name || ''),
                lastname: String(leadData.lastName || leadData.last_name || ''),
                company: String(leadData.company || ''),
                hs_lead_status: score.tier === 'hot' ? 'IN_PROGRESS' : score.tier === 'warm' ? 'OPEN' : 'UNQUALIFIED',
                hubspot_owner_notes: `Ooumph AI Lead Score: ${score.totalScore}/100 (${score.tier.toUpperCase()}). Next: ${score.nextAction}`,
              },
            }),
          })
          if (hubRes.ok) {
            const hubData = await hubRes.json() as { id?: string }
            hubspotContactId = hubData.id || null
          } else if (hubRes.status === 409) {
            // Contact already exists — update via email search
            const searchRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(String(leadData.email))}?idProperty=email`, {
              headers: { 'Authorization': `Bearer ${hubspotToken}` },
            })
            if (searchRes.ok) {
              const existing = await searchRes.json() as { id?: string }
              hubspotContactId = existing.id || null
              if (hubspotContactId) {
                await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hubspotContactId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hubspotToken}` },
                  body: JSON.stringify({
                    properties: {
                      hs_lead_status: score.tier === 'hot' ? 'IN_PROGRESS' : score.tier === 'warm' ? 'OPEN' : 'UNQUALIFIED',
                      hubspot_owner_notes: `Ooumph AI Score: ${score.totalScore}/100 (${score.tier.toUpperCase()})`,
                    },
                  }),
                })
              }
            }
          }
        } catch (e) { console.error('HubSpot push failed (non-fatal):', e) }
      }

      return NextResponse.json({
        score,
        hubspotContactId,
        message: `Lead scored: ${score.totalScore}/100 — ${score.tier.toUpperCase()}. Next action: ${score.nextAction}${hubspotContactId ? `. HubSpot contact ${hubspotContactId} updated.` : ''}`,
      })
    }

    await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    return NextResponse.json({ error: 'Invalid mode. Use build_model or score_lead.' }, { status: 400 })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Lead qualifier error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'lead_scoring_model'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
