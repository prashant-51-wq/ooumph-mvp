/**
 * /api/agents/cmo
 *
 * Two actions:
 *   action: 'chat'    — User describes a goal → CMO proposes a team + project
 *   action: 'execute' — CMO orchestrates the first sub-agent and routes
 *                       its output through the approvals queue
 *
 * ─── Dual-mode response ─────────────────────────────────────────────────
 * If the client sends `Accept: text/event-stream` we stream live events
 * via lib/agent-stream.ts (the Agent Console). Otherwise we return the
 * legacy JSON shape so existing callers keep working.
 *
 * ─── Serverless lifetime safety ─────────────────────────────────────────
 *
 *   THE INVARIANT:  Background work (saving artifacts, creating approvals,
 *                   recording agent_runs) MUST complete even if the user
 *                   closes their tab mid-stream.
 *
 *   How we guarantee this on Vercel:
 *
 *   1. `runtime = 'nodejs'`             — full Node API (needed for our
 *                                          native deps; Edge would break
 *                                          on better-sqlite3 + pdf-parse).
 *   2. `maxDuration = 300`              — allow up to 5 minutes; some
 *                                          sub-agent calls (strategy with
 *                                          long context, video generation
 *                                          via Runway polling) need it.
 *   3. `after()` from `next/server`     — schedules the work promise to
 *                                          run "after the response". The
 *                                          Vercel runtime keeps the
 *                                          function alive until every
 *                                          after-callback resolves,
 *                                          EVEN IF the client disconnects.
 *   4. The work promise is created BEFORE we return the Response. The
 *      moment the function handler returns, after() takes ownership of
 *      keeping the function alive. The stream's reader (the user's
 *      browser) is decoupled from the writer (our work loop).
 *   5. lib/agent-stream.ts already handles client-disconnect gracefully:
 *      `controller.enqueue` failures flip a `clientConnected = false`
 *      flag and subsequent events skip the wire but still hit the DB.
 *
 *   Net effect: even if a user types a question, sees "Planning..." for
 *   1 second, then closes the tab, the artifact + approval will land
 *   in DB and appear in their Approvals queue when they come back.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent, streamAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { getBaseUrl } from '@/lib/base-url'
import {
  createAgentEventStream,
  recordSubAgentRun,
  streamingResponse,
  type AgentEvent,
} from '@/lib/agent-stream'

// ─── Vercel runtime configuration ────────────────────────────────────────
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — strategy + research can be slow

// ─── Types ───────────────────────────────────────────────────────────────

interface TeamMember {
  role: string
  agent: string
  description: string
}

interface ProjectProposal {
  name: string
  goal: string
  estimatedMinutes: number
  estimatedCostUsd: number
}

interface CMOChatResponse {
  reply: string
  project: ProjectProposal
  team: TeamMember[]
  firstAction: string
}

interface CMORequest {
  workspaceId: string
  message: string
  action: 'chat' | 'execute'
  firstAction?: string
  /** When 'execute' is called from the chat panel, this lets the CMO
   *  pass through the project context to the sub-agent for richer output. */
  projectContext?: {
    name?: string
    goal?: string
    team?: TeamMember[]
  }
}

// ─── System prompt ───────────────────────────────────────────────────────

const CMO_SYSTEM_PROMPT = `You are the AI CMO (Chief Marketing Officer) for Ooumph, an AI marketing platform.
Your role is to listen to what a business owner wants to achieve, then recommend the right team of AI agents to execute it.

You have access to these agents:
- strategy: Creates brand positioning, channel strategy, competitive analysis, and marketing roadmap
- content: Builds content calendars, editorial plans, topic clusters across all channels
- blog: Writes long-form blog posts, thought leadership articles, LinkedIn posts
- email_campaign: Creates ONE-TIME broadcast emails (newsletters, announcements, promotional blasts). Use when the user says "send an email to my list", "newsletter", "announcement", "promo blast".
- email_sequence: Creates MULTI-STEP nurture sequences delivered over days/weeks (welcome series, drip campaigns, re-engagement, abandoned-cart flows). Use when the user says "nurture", "drip", "5-day welcome", "follow-up sequence", "re-engagement".
- leads: Designs lead generation funnels, lead magnets, qualifying systems
- funnel: Builds conversion funnels, landing page copy, nurture flows
- ads: Creates paid ad campaigns, ad copy variants, audience targeting plans
- creative: Designs visual content briefs, creative direction, brand assets
- research: Conducts market research, competitor analysis, audience insights
- growth: Identifies growth levers, partnership opportunities, viral loops
- pr: Drafts press releases, media pitches, thought leadership pieces
- analytics: Sets up tracking, defines KPIs, builds reporting frameworks
- sales: Manages sales pipeline, writes proposals, builds outreach sequences, analyzes deals, forecasts revenue, generates demo scripts and objection playbooks
- retargeting: Segments warm audiences, builds retargeting campaigns, creates lookalike audiences, maps abandoned journeys, writes warm-audience ad copy, designs pixel strategy
- scheduling: Analyzes optimal posting times, audits publishing calendars, auto-schedules content batches, builds recurring schedules, optimizes for multiple timezones
- branding: Generates full brand identity, voice guidelines, visual style guides, brand story, taglines, mission/vision/values, color palettes, and typography systems

When a user describes their marketing goal, analyze it and respond with a JSON object containing:
1. A friendly, confident reply explaining what you'll do (2-3 sentences max)
2. A named project with a clear goal, estimated time (in minutes), and estimated cost (in USD, typically $0.05-$0.50)
3. A team of 2-4 agents best suited for the goal, with their roles and descriptions
4. The firstAction agent to kick things off (always 'strategy' unless strategy already exists)

Your tone: confident, direct, human. Like a real CMO who knows their stuff.
Always return valid JSON matching the schema exactly. No markdown, no prose outside the JSON.`

// ─── Sub-agent routing map ───────────────────────────────────────────────

const AGENT_ROUTE_MAP: Record<string, string> = {
  strategy: '/api/agents/strategy',
  content: '/api/agents/content',
  blog: '/api/agents/content/blog',
  // Sprint 16C (audit P0 #5): split the old `email` slug into two so the CMO
  // can correctly route nurture-sequence requests to the funnel sequence
  // generator instead of the campaign-broadcaster. Audit pass #2 found the
  // CMO was emitting `email` for "create a 5-day nurture" requests and the
  // wrong agent (email-marketing campaigns) was firing.
  email_campaign: '/api/agents/email-marketing',
  email_sequence: '/api/agents/funnel/email-sequence',
  // Back-compat: `email` defaults to campaign (the old behaviour). The CMO
  // prompt should prefer the explicit slugs; this fallback prevents legacy
  // proposals from breaking.
  email: '/api/agents/email-marketing',
  leads: '/api/agents/leads',
  funnel: '/api/agents/funnel',
  ads: '/api/agents/ads/generate',
  creative: '/api/agents/creative/static-post',
  research: '/api/agents/research',
  growth: '/api/agents/growth',
  pr: '/api/agents/pr',
  analytics: '/api/agents/analytics/ga4',
  sales: '/api/agents/sales',
  retargeting: '/api/agents/retargeting',
  scheduling: '/api/agents/scheduling',
  branding: '/api/agents/branding/identity',
}

// Friendly labels for each agent — shown in the Agent Console feed
const AGENT_LABELS: Record<string, string> = {
  strategy: 'Drafting your positioning + 30-day roadmap',
  content: 'Building your content calendar',
  blog: 'Writing long-form content',
  email: 'Designing email sequences',
  leads: 'Designing lead capture system',
  funnel: 'Building conversion funnel',
  ads: 'Writing paid ad campaigns',
  creative: 'Generating visual creative',
  research: 'Researching your market + competitors',
  growth: 'Identifying growth levers',
  pr: 'Drafting PR + media outreach',
  analytics: 'Setting up tracking + KPIs',
  sales: 'Building sales pipeline tooling',
  retargeting: 'Designing retargeting funnel',
  scheduling: 'Building publishing schedule',
  branding: 'Crafting your brand identity',
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Load workspace + brand profile in a single shape for prompt context. */
async function loadWorkspaceContext(workspaceId: string): Promise<{
  workspace: Record<string, unknown> | undefined
  brand: Record<string, unknown> | undefined
  brandContext: string
}> {
  const wsResult = await sql`SELECT * FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0] as Record<string, unknown> | undefined

  const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
  const brand = brandResult.rows[0] as Record<string, unknown> | undefined

  const businessName = (workspace?.name as string) || 'this business'
  let brandContext = `Business: ${businessName}`
  if (brand) {
    if (brand.offer) brandContext += `\nOffer: ${brand.offer as string}`
    if (brand.target_audience) brandContext += `\nTarget audience: ${brand.target_audience as string}`
    if (brand.tone) brandContext += `\nBrand tone: ${brand.tone as string}`
    if (brand.goals) brandContext += `\nGoals: ${brand.goals as string}`
    if (brand.channels) brandContext += `\nPreferred channels: ${brand.channels as string}`
  }
  const modelSettings = workspace?.model_settings as Record<string, unknown> | null
  if (modelSettings?.defaultModel) {
    brandContext += `\nAI model: ${modelSettings.defaultModel as string}`
  }
  return { workspace, brand, brandContext }
}

/** Run the proposal-generation Claude call. Used by the legacy JSON path. */
async function generateProposal(brandContext: string, message: string): Promise<CMOChatResponse> {
  const userPrompt = `Brand context:\n${brandContext}\n\nUser request: "${message}"\n\nRespond with a JSON object like this:\n{\n  "reply": "string",\n  "project": { "name": "string", "goal": "string", "estimatedMinutes": number, "estimatedCostUsd": number },\n  "team": [{ "role": "string", "agent": "string", "description": "string" }],\n  "firstAction": "string"\n}`
  return runAgent<CMOChatResponse>(CMO_SYSTEM_PROMPT, userPrompt)
}

// ─── Two-phase streaming prompt ──────────────────────────────────────────
//
// To get BOTH a streamable reply (for the chat bubble typing animation)
// AND structured project/team data in a single Claude call, we ask Claude
// to emit the reply text first, then a separator, then the JSON. The
// server streams the reply portion as token events, then parses out the
// JSON tail when streaming completes.
//
// A bare `<<<DATA>>>` marker beats markdown fences because it's
// unambiguous and unlikely to appear in natural reply text.
const CMO_CHAT_STREAMING_PROMPT = `${CMO_SYSTEM_PROMPT}

CRITICAL OUTPUT FORMAT — respond in exactly TWO parts:

PART 1: Your friendly reply as plain text (2-3 sentences). NO markdown, NO JSON, NO quotes around it.

PART 2: After PART 1, output the exact marker on its own line: <<<DATA>>>

PART 3: After the marker, output a raw JSON object (NO markdown fence) with this shape:
{"project":{"name":"...","goal":"...","estimatedMinutes":NUMBER,"estimatedCostUsd":NUMBER},"team":[{"role":"...","agent":"...","description":"..."}],"firstAction":"..."}

EXAMPLE OUTPUT:
Let's build a 30-day lead-gen sprint starting with positioning, then layer in multi-channel outreach. I'll coordinate strategy + content + email to hit your goal.

<<<DATA>>>
{"project":{"name":"30-Day Lead Sprint","goal":"Generate 50 qualified leads","estimatedMinutes":35,"estimatedCostUsd":0.14},"team":[{"role":"Strategist","agent":"strategy","description":"Builds positioning + 30-day roadmap"},{"role":"Writer","agent":"content","description":"Designs content sequence across channels"}],"firstAction":"strategy"}`

const STREAM_SEPARATOR = '<<<DATA>>>'

/**
 * Stream Claude's response token-by-token, splitting it into:
 *   - reply tokens (emitted as `token` events for the chat bubble)
 *   - JSON tail (parsed after stream end into the proposal payload)
 *
 * Buffers the last SEPARATOR.length characters before emitting tokens, so
 * a separator that straddles two SDK deltas isn't accidentally streamed
 * to the chat bubble as part of the reply text.
 */
async function streamProposalWithTokens(
  brandContext: string,
  message: string,
  emitToken: (delta: string) => void,
): Promise<CMOChatResponse> {
  const userPrompt = `Brand context:\n${brandContext}\n\nUser request: "${message}"`
  const SAFE_BUFFER_SIZE = STREAM_SEPARATOR.length

  let fullText = ''
  let emittedLen = 0
  let separatorFound = false

  await streamAgent(CMO_CHAT_STREAMING_PROMPT, userPrompt, (delta) => {
    fullText += delta

    // After separator: stop emitting tokens (we're now accumulating JSON).
    if (separatorFound) return

    const sepIdx = fullText.indexOf(STREAM_SEPARATOR)
    if (sepIdx !== -1) {
      // Separator just arrived in this delta. Emit any remaining reply
      // chars up to (but not including) the separator.
      const tail = fullText.slice(emittedLen, sepIdx)
      if (tail.length > 0) emitToken(tail)
      emittedLen = sepIdx
      separatorFound = true
      return
    }

    // Separator not yet seen. Safely emit only up to (length - SAFE_BUFFER)
    // since the separator might straddle this delta and the next one.
    const safeUpto = Math.max(0, fullText.length - SAFE_BUFFER_SIZE)
    if (safeUpto > emittedLen) {
      emitToken(fullText.slice(emittedLen, safeUpto))
      emittedLen = safeUpto
    }
  })

  // Parse the accumulated output. Fall back gracefully if Claude didn't
  // follow the format — we still want a valid proposal back to the client.
  const sepIdx = fullText.indexOf(STREAM_SEPARATOR)
  const defaultProposal = (): Omit<CMOChatResponse, 'reply'> => ({
    project: { name: 'New Project', goal: message.slice(0, 80), estimatedMinutes: 15, estimatedCostUsd: 0.05 },
    team: [{ role: 'Strategist', agent: 'strategy', description: 'Builds the positioning + roadmap' }],
    firstAction: 'strategy',
  })

  if (sepIdx === -1) {
    // No separator — Claude returned freeform text. Treat all of it as reply.
    return { reply: fullText.trim() || "I'll handle this for you.", ...defaultProposal() }
  }

  const replyText = fullText.slice(0, sepIdx).trim()
  let jsonText = fullText.slice(sepIdx + STREAM_SEPARATOR.length).trim()
  // Strip optional markdown fence in case Claude wrapped the JSON anyway
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  try {
    const parsed = JSON.parse(jsonText) as Omit<CMOChatResponse, 'reply'>
    return { reply: replyText || "I'll handle this for you.", ...parsed }
  } catch (err) {
    console.warn('[cmo stream] JSON parse failed, using defaults:', err, jsonText.slice(0, 200))
    return { reply: replyText || "I'll handle this for you.", ...defaultProposal() }
  }
}

/** Query the most recent artifact + pending approval for a workspace.
 *  Used after a sub-agent call to discover what it produced so we can
 *  emit `artifact_created` + `approval_pending` events. */
async function findLatestArtifactAndApproval(
  workspaceId: string,
  sinceISO: string,
): Promise<{ artifactId?: string; artifactType?: string; artifactTitle?: string; approvalId?: string; publishDestination?: string }> {
  const artRes = await sql`
    SELECT id, type, title, content_json
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND created_at >= ${sinceISO}
    ORDER BY created_at DESC
    LIMIT 1
  `
  const art = artRes.rows[0] as { id?: string; type?: string; title?: string; content_json?: string | Record<string, unknown> } | undefined
  if (!art?.id) return {}

  // Pull a publishDestination out of content_json if present (so ReviewRequiredModal
  // can show "this will auto-publish to LinkedIn on approval").
  let publishDestination: string | undefined
  try {
    const parsed = typeof art.content_json === 'string'
      ? JSON.parse(art.content_json)
      : art.content_json
    if (parsed && typeof parsed === 'object') {
      const cj = parsed as Record<string, unknown>
      const dest = cj.platform || cj.publishDestination || cj.destination
      if (typeof dest === 'string') publishDestination = dest
    }
  } catch { /* leave undefined */ }

  const apvRes = await sql`
    SELECT id FROM approvals
    WHERE workspace_id = ${workspaceId} AND artifact_id = ${art.id} AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `
  const apv = apvRes.rows[0] as { id?: string } | undefined

  return {
    artifactId: art.id,
    artifactType: art.type,
    artifactTitle: art.title,
    approvalId: apv?.id,
    publishDestination,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// POST /api/agents/cmo
// ═════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  let body: CMORequest
  try {
    body = (await req.json()) as CMORequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { workspaceId, message, action, firstAction, projectContext } = body

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspaceId is required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Sprint 12C: plan-tier quota gate. CMO is the most expensive single
  // entry point (streams sub-agent calls), so this is the highest-value
  // place to enforce. Internal calls from cron / supervisor → worker
  // bypass via x-internal-secret.
  const overQuota = await assertAgentRunQuota(req, workspaceId)
  if (overQuota) return overQuota

  if (action !== 'chat' && action !== 'execute') {
    return NextResponse.json(
      { ok: false, error: 'Invalid action. Use "chat" or "execute".' },
      { status: 400 },
    )
  }

  const wantsStream = (req.headers.get('accept') || '').includes('text/event-stream')

  // ───────────────────────────────────────────────────────────────────────
  // STREAMING PATH — returns SSE event stream
  // ───────────────────────────────────────────────────────────────────────
  if (wantsStream) {
    if (action === 'chat' && !message?.trim()) {
      return NextResponse.json({ ok: false, error: 'message is required for chat' }, { status: 400 })
    }

    const handle = await createAgentEventStream({
      workspaceId,
      agentName: 'cmo',
      inputJson: { message, action, firstAction, projectContext },
    })

    // Build the work as a single promise so we can both:
    //   - let it run to completion in the stream's lifetime
    //   - hand it to after() so Vercel keeps the function alive even
    //     after the client disconnects
    const workPromise = (action === 'chat'
      ? runCmoChatStreaming(handle, workspaceId, message)
      : runCmoExecuteStreaming(handle, workspaceId, firstAction || 'strategy', projectContext)
    ).catch(async (err) => {
      // Last-resort error reporting — the inner helpers should normally
      // emit their own error events before throwing, but if they don't,
      // we close cleanly here.
      console.error('[cmo stream] uncaught:', err)
      try {
        await handle.close({ error: err instanceof Error ? err : new Error(String(err)) })
      } catch {
        /* swallow — handle may already be closed */
      }
    })

    // ▼▼ THE LIFETIME GUARANTEE ▼▼
    // `after()` registers the work promise with the Vercel runtime so that
    // even if the client disconnects (closes tab, navigates away), the
    // function keeps executing until workPromise resolves. Artifacts +
    // approvals always land in the DB regardless of client connectivity.
    after(async () => {
      try {
        await workPromise
      } catch (err) {
        console.error('[cmo after()] background work threw:', err)
      }
    })

    return streamingResponse(handle.stream)
  }

  // ───────────────────────────────────────────────────────────────────────
  // LEGACY JSON PATH — preserves existing API contract for old clients
  // ───────────────────────────────────────────────────────────────────────
  try {
    if (action === 'chat') {
      if (!message?.trim()) {
        return NextResponse.json({ ok: false, error: 'message is required for chat' }, { status: 400 })
      }
      const { brandContext } = await loadWorkspaceContext(workspaceId)
      const proposal = await generateProposal(brandContext, message)
      return NextResponse.json({
        ok: true,
        response: proposal.reply,
        project: proposal.project,
        team: proposal.team,
        firstAction: proposal.firstAction,
      })
    }

    if (action === 'execute') {
      const result = await executeFirstAgent(workspaceId, firstAction || 'strategy')
      if (result.error) {
        return NextResponse.json(
          { ok: false, error: `Failed to start ${firstAction} agent: ${result.error}` },
          { status: 500 },
        )
      }
      return NextResponse.json({
        ok: true,
        response: `Your ${firstAction} agent is now running. Check the activity feed for live updates.`,
        projectId: result.projectId,
      })
    }
  } catch (err) {
    console.error('[cmo legacy] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: false, error: 'Unreachable' }, { status: 500 })
}

// ═════════════════════════════════════════════════════════════════════════
// Streaming work — CHAT action
// ═════════════════════════════════════════════════════════════════════════

interface StreamHandle {
  send: (event: AgentEvent) => Promise<void>
  close: (final?: { error?: Error; output?: unknown; cost?: number }) => Promise<void>
  runId: string
}

async function runCmoChatStreaming(
  handle: StreamHandle,
  workspaceId: string,
  message: string,
): Promise<void> {
  const startedAt = Date.now()
  try {
    await handle.send({
      t: 'agent_start',
      agent: 'cmo',
      label: 'Analyzing your goal and assembling a team…',
    })

    await handle.send({ t: 'agent_log', agent: 'cmo', level: 'info', msg: 'Loading brand context' })
    const { brandContext } = await loadWorkspaceContext(workspaceId)

    await handle.send({ t: 'agent_log', agent: 'cmo', level: 'info', msg: 'Drafting reply + proposal' })

    // Stream Claude's response. Reply tokens go on the wire as they arrive
    // (live typing in the chat bubble); the JSON tail is parsed at the end.
    const proposal = await streamProposalWithTokens(brandContext, message, (delta) => {
      // Fire-and-forget — the handle.send() Promise is awaited internally
      // by the stream's controller. We don't await each delta here because
      // we want token emission to be as low-latency as possible.
      void handle.send({ t: 'token', text: delta, agent: 'cmo' })
    })

    await handle.send({
      t: 'agent_done',
      agent: 'cmo',
      durationMs: Date.now() - startedAt,
      // We don't have exact usage tokens from streamAgent yet (the SDK
      // does emit usage at the end of the stream but we'd need to plumb
      // it through). Estimate based on reply length: ~3 tokens per word
      // input + output @ ~$0.000003 per token for Sonnet.
      cost: Math.max(0.001, proposal.reply.length * 0.0000015),
    })

    // The proposal itself isn't an artifact yet — it's a transient chat
    // response. The user accepts it by clicking "Deploy team →" in the
    // chat bubble, which fires the execute action below where the FIRST
    // artifact + approval are created. So no `artifact_created` here.

    await handle.close({
      output: {
        reply: proposal.reply,
        project: proposal.project,
        team: proposal.team,
        firstAction: proposal.firstAction,
      },
      cost: Math.max(0.001, proposal.reply.length * 0.0000015),
    })
  } catch (err) {
    await handle.send({
      t: 'agent_error',
      agent: 'cmo',
      msg: err instanceof Error ? err.message : String(err),
    })
    await handle.close({ error: err instanceof Error ? err : new Error(String(err)) })
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Streaming work — EXECUTE action
// ═════════════════════════════════════════════════════════════════════════

async function runCmoExecuteStreaming(
  handle: StreamHandle,
  workspaceId: string,
  agentSlug: string,
  projectContext?: CMORequest['projectContext'],
): Promise<void> {
  const overallStartedAt = Date.now()
  try {
    await handle.send({
      t: 'agent_start',
      agent: 'cmo',
      label: 'Orchestrating your project…',
    })

    await handle.send({
      t: 'agent_log',
      agent: 'cmo',
      level: 'info',
      msg: `Routing to ${agentSlug} agent`,
    })

    // ─── Run the sub-agent ───────────────────────────────────────────────
    // Future-proofing: when the sub-agent route itself supports streaming
    // (step 6 will add this for strategy), we can pipe its events through.
    // Today, we treat each sub-agent as a blocking call and emit lifecycle
    // events around it (start / done) so the user still sees progress.

    const subAgentLabel = AGENT_LABELS[agentSlug] || `Running ${agentSlug} agent`
    const subAgent = await recordSubAgentRun({
      workspaceId,
      agentName: agentSlug,
      parentRunId: handle.runId,
      inputJson: projectContext || {},
    })

    await handle.send({
      t: 'agent_start',
      agent: agentSlug,
      label: subAgentLabel,
    })

    // Mark "before" timestamp so we can find the artifact produced by THIS
    // sub-agent call without confusing it with anything that happened earlier.
    // Subtract a small safety margin to account for clock drift.
    const beforeISO = new Date(Date.now() - 1000).toISOString()

    const routePath = AGENT_ROUTE_MAP[agentSlug] || '/api/agents/strategy'
    // Sprint 19Y: NEXT_PUBLIC_BASE_URL was empty in prod → fell through to
    // localhost:3000 → every sub-agent fetch failed silently with ECONNREFUSED
    // on the Vercel function host. The new getBaseUrl helper adds VERCEL_URL
    // as a fallback so this self-heals.
    const baseUrl = getBaseUrl()

    let subAgentSucceeded = false
    let subAgentResult: Record<string, unknown> = {}
    let subAgentErrorMsg: string | undefined

    try {
      const res = await fetch(`${baseUrl}${routePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward admin secret so the sub-agent passes workspace ownership
          // when invoked from server-to-server.
          ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          // Pass project context so the sub-agent can tailor its output
          // (e.g. strategy uses goal/team to scope the plan).
          context: projectContext,
        }),
      })

      if (res.ok) {
        try {
          subAgentResult = (await res.json()) as Record<string, unknown>
        } catch {
          subAgentResult = {}
        }
        subAgentSucceeded = true
      } else {
        try {
          const errBody = (await res.json()) as Record<string, unknown>
          subAgentErrorMsg = (errBody.error as string) || `${res.status} ${res.statusText}`
        } catch {
          subAgentErrorMsg = `${res.status} ${res.statusText}`
        }
      }
    } catch (fetchErr) {
      subAgentErrorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    }

    // Lifecycle event for the sub-agent + record it on agent_runs
    if (!subAgentSucceeded) {
      await subAgent.fail(new Error(subAgentErrorMsg || 'Unknown sub-agent failure'))
      await handle.send({
        t: 'agent_error',
        agent: agentSlug,
        msg: subAgentErrorMsg || 'Unknown failure',
      })
      // Don't throw; close cleanly so the client sees a complete stream
      await handle.close({
        error: new Error(`${agentSlug} agent failed: ${subAgentErrorMsg}`),
      })
      return
    }

    const { durationMs: subDurationMs } = await subAgent.complete(subAgentResult)
    await handle.send({
      t: 'agent_done',
      agent: agentSlug,
      durationMs: subDurationMs,
      // Cost will be in subAgentResult.cost if the sub-agent reports it
      cost: typeof subAgentResult.cost === 'number' ? subAgentResult.cost : undefined,
    })

    // ─── Discover what the sub-agent produced ────────────────────────────
    // Sub-agents save artifacts + create pending approvals as a side effect.
    // We discover them via DB query rather than relying on the response
    // shape (which varies across agent routes). The freshest artifact in
    // this workspace created after we started the call is ours.
    await handle.send({
      t: 'agent_log',
      agent: 'cmo',
      level: 'info',
      msg: 'Saving artifact + opening approval for your review',
    })

    const produced = await findLatestArtifactAndApproval(workspaceId, beforeISO)
    if (produced.artifactId) {
      await handle.send({
        t: 'artifact_created',
        artifactId: produced.artifactId,
        type: produced.artifactType || 'unknown',
        title: produced.artifactTitle,
      })
      if (produced.approvalId) {
        await handle.send({
          t: 'approval_pending',
          approvalId: produced.approvalId,
          artifactId: produced.artifactId,
          publishDestination: produced.publishDestination,
        })
      }
    }

    await handle.send({
      t: 'agent_done',
      agent: 'cmo',
      durationMs: Date.now() - overallStartedAt,
    })

    await handle.close({
      output: {
        agent: agentSlug,
        artifactId: produced.artifactId,
        approvalId: produced.approvalId,
        publishDestination: produced.publishDestination,
        subAgentResponse: subAgentResult,
      },
      cost: typeof subAgentResult.cost === 'number' ? subAgentResult.cost : undefined,
    })
  } catch (err) {
    await handle.send({
      t: 'agent_error',
      agent: 'cmo',
      msg: err instanceof Error ? err.message : String(err),
    })
    await handle.close({ error: err instanceof Error ? err : new Error(String(err)) })
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Legacy (non-streaming) execute helper — mirrors the streaming path's
// sub-agent call so behavior stays consistent across both modes.
// ═════════════════════════════════════════════════════════════════════════

async function executeFirstAgent(
  workspaceId: string,
  agentSlug: string,
): Promise<{ projectId?: string; error?: string }> {
  const routePath = AGENT_ROUTE_MAP[agentSlug] || '/api/agents/strategy'
  // Sprint 19Y: see streaming path comment.
  const baseUrl = getBaseUrl()

  try {
    const res = await fetch(`${baseUrl}${routePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
      },
      body: JSON.stringify({ workspaceId }),
    })
    if (!res.ok) {
      try {
        const errBody = (await res.json()) as Record<string, unknown>
        return { error: (errBody.error as string) || `Agent returned ${res.status}` }
      } catch {
        return { error: `Agent returned ${res.status}` }
      }
    }
    const data = (await res.json()) as Record<string, unknown>
    return { projectId: (data.runId as string) || (data.artifactId as string) || undefined }
  } catch (err) {
    return { error: String(err) }
  }
}
