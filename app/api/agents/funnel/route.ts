import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { generateFunnelPlan } from '@/lib/agents/funnel'
import { sendApprovalRequestEmail } from '@/lib/email'
import { generateLandingVisual } from '@/lib/creative-workers'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import type { BrandProfile } from '@/types'

// ── Sub-agent dispatch ────────────────────────────────────────────────────────
//
// Sprint 18D: the funnel agent used to inline-generate landing page, form, and
// email-sequence content in a single Claude call (via generateFunnelPlan).
// That worked but it meant the dedicated sub-agents (landing-page builder,
// form builder, email-sequence writer) were skipped — their own artifact
// pipelines, approval rows, and quotas didn't run. We now CALL them as
// sub-agents after generating the high-level funnel blueprint, so each
// sub-agent's specialized prompt, schema, and artifact wiring is reused.

const INTERNAL_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  `http://localhost:${process.env.PORT || 3000}`

async function callSubAgent<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  forwardCookie?: string | null,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${INTERNAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Same internal-secret pattern the strategy decomposer uses to
        // bypass per-request auth on internal sub-agent calls.
        ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
        ...(forwardCookie ? { cookie: forwardCookie } : {}),
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: `${path} ${res.status}: ${text.slice(0, 200)}` }
    }
    try {
      return { ok: true, data: JSON.parse(text) as T }
    } catch {
      return { ok: false, error: `${path}: invalid JSON response` }
    }
  } catch (err) {
    return { ok: false, error: `${path}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId } = await req.json()
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota
    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])
    const brand = brandResult.rows[0] as unknown as BrandProfile
    const strategy = strategyResult.rows[0]?.content_json as unknown as import('@/types').Strategy
    if (!brand || !strategy) return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'funnel_planner', 'running')`

    let funnel
    try {
      funnel = await generateFunnelPlan(brand, strategy)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(funnel)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json) VALUES (${artifactId}, ${workspaceId}, ${runId}, 'funnel_plan', 'Funnel Blueprint', ${JSON.stringify(funnel)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'funnel_plan',
        artifactTitle: 'Funnel Blueprint',
      })
    }

    // ── Sub-agent decomposition (Sprint 18D) ─────────────────────────────────
    // The high-level blueprint (lead magnet, LP structure, nurture outline) is
    // now generated above. Dispatch to the specialized sub-agents in parallel
    // to produce the actual landing page HTML, form structure, and full email
    // bodies. Each sub-agent writes its own artifact + approval row, so the
    // user sees granular review items in addition to the top-level blueprint.
    const forwardCookie = req.headers.get('cookie')
    const leadMagnetTitle = funnel.leadMagnet?.title || 'Lead magnet'
    const nurtureGoal = `${brand.business_name} — nurture sequence for ${leadMagnetTitle}`
    const emailCount = Math.max(1, Math.min(10, funnel.emailNurture?.length || 5))

    const [landingResult, formResult, emailResult] = await Promise.all([
      callSubAgent<{ artifactId: string; publicUrl: string; sectionCount: number }>(
        '/api/agents/funnel/landing-page',
        { workspaceId, pageType: 'lead_magnet', leadMagnet: leadMagnetTitle },
        forwardCookie,
      ),
      callSubAgent<{ suggested: unknown; configured: boolean }>(
        '/api/agents/funnel/form',
        {
          workspaceId,
          formType: 'lead_capture',
          fields: funnel.landingPage?.formFields,
          context: `Lead magnet: ${leadMagnetTitle}. Funnel goal: ${strategy.thirtyDayObjective || ''}`,
        },
        forwardCookie,
      ),
      callSubAgent<{ sequence: unknown[]; metadata: Record<string, unknown> }>(
        '/api/agents/email/sequence',
        {
          workspaceId,
          action: 'generate',
          goal: nurtureGoal,
          audience: brand.target_audience,
          numEmails: emailCount,
          daysBetween: 3,
          tone: brand.tone,
        },
        forwardCookie,
      ),
    ])

    const subAgents = {
      landingPage: landingResult.ok ? landingResult.data : { error: landingResult.error },
      form:        formResult.ok    ? formResult.data    : { error: formResult.error    },
      emailSequence: emailResult.ok ? emailResult.data   : { error: emailResult.error   },
    }

    // ── Creative Supervisor request ───────────────────────────────────────────
    // Lead Funnel Agent → requests landing page visual to match the funnel
    Promise.resolve().then(async () => {
      try {
        const landingVisual = await generateLandingVisual(workspaceId, 'lead_capture')
        await sql`INSERT INTO creative_requests (id, workspace_id, requesting_agent, creative_type, context_json, status, artifact_id)
                  VALUES (${newId()}, ${workspaceId}, 'lead_funnel', 'landing_visual_pack',
                          ${JSON.stringify({ funnelId: artifactId })}, 'completed', ${landingVisual.artifactId})`
      } catch (e) { console.error('Funnel landing page creative failed:', e) }
    })

    return NextResponse.json({ funnel, artifactId, subAgents })
  } catch (error) {
    console.error('Funnel error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT a.*, ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'funnel_plan'
    ORDER BY a.created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}
