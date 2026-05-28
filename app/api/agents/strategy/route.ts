/**
 * /api/agents/strategy
 *
 * Generates a marketing strategy for a workspace and persists it as a
 * strategy artifact + pending approval.
 *
 * ─── Dual-mode response ─────────────────────────────────────────────────
 *   Accept: text/event-stream  → live stream of agent_start / agent_log /
 *                                 artifact_created / approval_pending / done
 *                                 events (the Agent Console)
 *   Accept: application/json   → legacy single-shot JSON response
 *                                 { strategy, artifactId, runId }
 *
 * ─── Serverless lifetime safety ─────────────────────────────────────────
 *   Same architecture as /api/agents/cmo:
 *     - runtime = 'nodejs' for full Node API surface (brave-search + firecrawl
 *       tools, native fetch via undici, etc.)
 *     - maxDuration = 300  (5 min — strategy generation can be slow with
 *       multiple parallel search + scrape calls + a final Claude turn)
 *     - after() registers the work promise with the Vercel runtime so the
 *       artifact + approval land in DB even if the user closes the tab
 *       mid-stream.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import {
  createAgentEventStream,
  streamingResponse,
  type AgentEvent,
} from '@/lib/agent-stream'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import { scrapeMultiple } from '@/lib/tools/firecrawl'
import type { BrandProfile, Strategy } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

// ─── System prompt + helpers (extracted from lib/agents/strategy.ts so we
//     can drive sub-step events from inside the route) ────────────────────

const STRATEGY_SYSTEM_PROMPT = `You are the AI Strategy Agent for Ooumph, an AI Marketing Agency OS.
Your job is to create a comprehensive, actionable one-page marketing strategy for a business.
Be specific, data-driven, and India-market aware where relevant.
Always respond with valid JSON.`

function normalizeChannels(channels: unknown): string[] {
  if (Array.isArray(channels)) return channels.map(String)
  if (typeof channels === 'string') {
    try {
      const parsed = JSON.parse(channels)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* not JSON */ }
    return channels.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

// ─── Streaming-aware strategy generator ──────────────────────────────────
//
// Same logic as lib/agents/strategy.ts but emits progress events at each
// substantive sub-step. Each stage's start + completion are visible in the
// Agent Console so the user knows what's happening during the 20–40s run.

interface ProgressSink {
  log: (msg: string, level?: 'info' | 'warn') => Promise<void>
}

async function generateStrategyStreaming(
  brand: BrandProfile,
  timeframe: string,
  sink: ProgressSink,
): Promise<Strategy> {
  const industry = brand.industry || brand.offer || ''
  const audience = brand.target_audience || ''
  const competitors = brand.competitors || ''
  const year = new Date().getFullYear()
  const channelsList = normalizeChannels(brand.channels)

  await sink.log(`Researching ${industry || 'your industry'} · ${audience ? 'audience: ' + audience.slice(0, 60) : ''}`)

  // ─── Parallel market research via Brave Search ───────────────────────
  await sink.log('Searching market trends, competitors, and buyer behavior in parallel')
  const [marketTrends, competitorInsights, buyerBehavior] = await Promise.all([
    braveSearch(`${industry} market trends ${year}`, 8).catch(() => []),
    competitors ? braveSearch(`${competitors} marketing strategy`, 8).catch(() => []) : Promise.resolve([]),
    braveSearch(`${audience} buying behavior ${industry}`, 8).catch(() => []),
  ])
  const totalResults = marketTrends.length + competitorInsights.length + buyerBehavior.length
  await sink.log(`Found ${totalResults} relevant sources across 3 search queries`)

  // ─── Optional: Firecrawl competitor scrape ───────────────────────────
  let competitorContent = ''
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (firecrawlKey && competitors && competitorInsights.length > 0) {
    const competitorUrls = competitorInsights
      .filter((r) => r.url && !r.url.includes('google.com') && !r.url.includes('bing.com'))
      .slice(0, 2)
      .map((r) => r.url)
    if (competitorUrls.length) {
      await sink.log(`Scraping ${competitorUrls.length} competitor site${competitorUrls.length === 1 ? '' : 's'} for deeper context`)
      try {
        const scraped = await scrapeMultiple(competitorUrls)
        if (scraped.length) {
          competitorContent = scraped
            .map((s) => `--- ${s.url} ---\n${(s.markdown || '').slice(0, 2000)}`)
            .join('\n\n')
          await sink.log(`Scraped ${scraped.length} site${scraped.length === 1 ? '' : 's'}`)
        }
      } catch (err) {
        await sink.log(`Scrape failed (continuing without competitor content): ${err instanceof Error ? err.message : 'unknown error'}`, 'warn')
      }
    }
  } else if (!firecrawlKey) {
    await sink.log('Firecrawl key not configured — skipping competitor scrape (using search results only)')
  }

  // ─── Build the Claude prompt ─────────────────────────────────────────
  await sink.log(`Composing ${timeframe} strategy prompt with ${formatSearchResults(marketTrends).length + formatSearchResults(competitorInsights).length} chars of research context`)

  const userPrompt = `Generate a comprehensive ${timeframe || 'monthly'} marketing strategy for this business.

Business: ${brand.business_name}
Offer: ${brand.offer || 'N/A'}
Target audience: ${audience || 'N/A'}
Brand tone: ${brand.tone || 'N/A'}
Goals: ${brand.goals || 'N/A'}
Competitors: ${competitors || 'N/A'}
Preferred channels: ${channelsList.join(', ') || 'all'}
Monthly budget: ${brand.monthly_budget || 'N/A'}

Recent market research:
${formatSearchResults(marketTrends).slice(0, 2500)}

Competitor intel:
${formatSearchResults(competitorInsights).slice(0, 2500)}

Buyer behavior insights:
${formatSearchResults(buyerBehavior).slice(0, 2500)}
${competitorContent ? `\n\nCompetitor website content:\n${competitorContent.slice(0, 3000)}` : ''}

Return JSON with this exact shape:
{
  "positioning": "string",
  "objective": "string",
  "uvp": "string",
  "icp": "string",
  "kpis": [{ "name": "string", "target": "string", "actual": "string", "timeframe": "string" }],
  "pillars": ["string", ...],
  "channels": [{ "name": "string", "frequency": "string", "purpose": "string" }],
  "tactics": ["string", ...]
}

Make every recommendation concrete and actionable. KPIs must have measurable targets.`

  await sink.log('Drafting strategy with Claude (this is the slow step — usually 8–15s)')
  const strategy = await runAgent<Strategy>(STRATEGY_SYSTEM_PROMPT, userPrompt)
  await sink.log('Strategy draft complete')

  return strategy
}

// ─── POST /api/agents/strategy ───────────────────────────────────────────

interface StrategyRequest {
  workspaceId: string
  timeframe?: 'daily' | 'weekly' | 'monthly'
  /** Optional project context forwarded from CMO orchestrator. */
  context?: { name?: string; goal?: string; team?: unknown[] }
}

export async function POST(req: NextRequest) {
  let body: StrategyRequest
  try {
    body = (await req.json()) as StrategyRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, timeframe } = body

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  // Sprint 12C: plan-tier quota.
  const overQuota = await assertAgentRunQuota(req, workspaceId)
  if (overQuota) return overQuota

  // Brand profile gate — same as before
  const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
  const brand = brandResult.rows[0] as unknown as BrandProfile
  if (!brand) {
    return NextResponse.json({ error: 'Complete onboarding first' }, { status: 404 })
  }

  const wantsStream = (req.headers.get('accept') || '').includes('text/event-stream')

  // ─────────────────────────────────────────────────────────────────────
  // STREAMING PATH
  // ─────────────────────────────────────────────────────────────────────
  if (wantsStream) {
    const handle = await createAgentEventStream({
      workspaceId,
      agentName: 'strategy',
      inputJson: { timeframe: timeframe || 'monthly' },
    })

    const workPromise = (async () => {
      const startedAt = Date.now()
      try {
        await handle.send({
          t: 'agent_start',
          agent: 'strategy',
          label: `Drafting your ${timeframe || 'monthly'} strategy + 30-day roadmap`,
        })

        // ProgressSink → forwards each .log() to an agent_log event
        const sink: ProgressSink = {
          log: async (msg, level = 'info') => {
            await handle.send({ t: 'agent_log', agent: 'strategy', level, msg })
          },
        }

        const strategy = await generateStrategyStreaming(brand, timeframe || 'monthly', sink)

        // ─── Persist artifact + approval (the safety gate) ──────────
        await handle.send({ t: 'agent_log', agent: 'strategy', level: 'info', msg: 'Saving strategy artifact + opening approval' })

        const artifactId = newId()
        const artifactTitle = `${(timeframe || 'monthly')[0].toUpperCase()}${(timeframe || 'monthly').slice(1)} Strategy`
        await sql`
          INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
          VALUES (
            ${artifactId},
            ${workspaceId},
            ${handle.runId},
            ${'strategy'},
            ${artifactTitle},
            ${JSON.stringify({ ...strategy, timeframe: timeframe || 'monthly' })},
            ${'draft'}
          )
        `

        const approvalId = newId()
        await sql`
          INSERT INTO approvals (id, workspace_id, artifact_id, status)
          VALUES (${approvalId}, ${workspaceId}, ${artifactId}, ${'pending'})
        `

        await handle.send({
          t: 'artifact_created',
          artifactId,
          type: 'strategy',
          title: artifactTitle,
        })
        await handle.send({
          t: 'approval_pending',
          approvalId,
          artifactId,
          // Strategy artifacts don't auto-publish — they're a planning doc.
          // The Review Required modal will show "Approve & Save" (no destination).
          publishDestination: undefined,
        })

        // ─── Optional email notification ─────────────────────────────
        // Best-effort — failure shouldn't break the stream
        if (brand.approval_email) {
          try {
            await sendApprovalRequestEmail({
              to: brand.approval_email,
              businessName: brand.business_name,
              artifactType: 'strategy',
              artifactTitle,
            })
          } catch (err) {
            console.warn('[strategy stream] approval email failed (non-fatal):', err)
          }
        }

        await handle.send({
          t: 'agent_done',
          agent: 'strategy',
          durationMs: Date.now() - startedAt,
          cost: 0.012, // rough estimate — strategy uses ~3-5k tokens
        })

        await handle.close({
          output: {
            strategy,
            artifactId,
            approvalId,
            runId: handle.runId,
            timeframe: timeframe || 'monthly',
          },
          cost: 0.012,
        })
      } catch (err) {
        console.error('[strategy stream] failed:', err)
        await handle.send({
          t: 'agent_error',
          agent: 'strategy',
          msg: err instanceof Error ? err.message : String(err),
        })
        await handle.close({ error: err instanceof Error ? err : new Error(String(err)) })
      }
    })().catch(async (err) => {
      console.error('[strategy stream] uncaught:', err)
      try { await handle.close({ error: err instanceof Error ? err : new Error(String(err)) }) } catch { /* already closed */ }
    })

    // ▼▼ Lifetime guarantee ▼▼
    // Tab close → after() keeps the function alive until strategy work
    // resolves. The artifact + pending approval always land in DB.
    after(async () => {
      try { await workPromise } catch (err) { console.error('[strategy after()]', err) }
    })

    return streamingResponse(handle.stream)
  }

  // ─────────────────────────────────────────────────────────────────────
  // LEGACY JSON PATH — preserves the existing contract for old callers
  // ─────────────────────────────────────────────────────────────────────
  let runId: string | null = null
  try {
    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, ${'strategy'}, ${'running'})`

    // Silent sink — JSON callers don't see progress
    const sink: ProgressSink = { log: async () => { /* discard */ } }

    let strategy: Strategy
    try {
      strategy = await generateStrategyStreaming(brand, timeframe || 'monthly', sink)
    } catch (agentErr) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentErr
    }

    await sql`UPDATE agent_runs SET status = ${'completed'}, output_json = ${JSON.stringify(strategy)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const artifactTitle = `${(timeframe || 'monthly')[0].toUpperCase()}${(timeframe || 'monthly').slice(1)} Strategy`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status) VALUES (${artifactId}, ${workspaceId}, ${runId}, ${'strategy'}, ${artifactTitle}, ${JSON.stringify({ ...strategy, timeframe: timeframe || 'monthly' })}, ${'draft'})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id, status) VALUES (${approvalId}, ${workspaceId}, ${artifactId}, ${'pending'})`

    if (brand.approval_email) {
      try {
        await sendApprovalRequestEmail({
          to: brand.approval_email,
          businessName: brand.business_name,
          artifactType: 'strategy',
          artifactTitle,
        })
      } catch (err) {
        console.warn('[strategy json] approval email failed (non-fatal):', err)
      }
    }

    return NextResponse.json({ strategy, artifactId, approvalId, runId })
  } catch (error) {
    console.error('Strategy error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─── GET /api/agents/strategy ────────────────────────────────────────────
// Returns the latest strategy artifact for the workspace (unchanged).

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const result = await sql`
    SELECT a.*, ap.status as approval_status, ap.id as approval_id
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'strategy'
    ORDER BY a.created_at DESC LIMIT 1
  `
  return NextResponse.json(result.rows[0] || null)
}

// `AgentEvent` is imported only for type clarity — keep ESLint happy
export type _AgentEvent = AgentEvent
