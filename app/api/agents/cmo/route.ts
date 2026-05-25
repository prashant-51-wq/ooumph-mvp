import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

// ─── System prompt for CMO chat ────────────────────────────────────────────────

const CMO_SYSTEM_PROMPT = `You are the AI CMO (Chief Marketing Officer) for Ooumph, an AI marketing platform.
Your role is to listen to what a business owner wants to achieve, then recommend the right team of AI agents to execute it.

You have access to these agents:
- strategy: Creates brand positioning, channel strategy, competitive analysis, and marketing roadmap
- content: Builds content calendars, editorial plans, topic clusters across all channels
- blog: Writes long-form blog posts, thought leadership articles, LinkedIn posts
- email: Creates email sequences, newsletters, drip campaigns
- leads: Designs lead generation funnels, lead magnets, qualifying systems
- funnel: Builds conversion funnels, landing page copy, nurture flows
- ads: Creates paid ad campaigns, ad copy variants, audience targeting plans
- creative: Designs visual content briefs, creative direction, brand assets
- research: Conducts market research, competitor analysis, audience insights
- growth: Identifies growth levers, partnership opportunities, viral loops
- pr: Drafts press releases, media pitches, thought leadership pieces
- analytics: Sets up tracking, defines KPIs, builds reporting frameworks

When a user describes their marketing goal, analyze it and respond with a JSON object containing:
1. A friendly, confident reply explaining what you'll do (2-3 sentences max)
2. A named project with a clear goal, estimated time (in minutes), and estimated cost (in USD, typically $0.05-$0.50)
3. A team of 2-4 agents best suited for the goal, with their roles and descriptions
4. The firstAction agent to kick things off (always 'strategy' unless strategy already exists)

Your tone: confident, direct, human. Like a real CMO who knows their stuff.
Always return valid JSON matching the schema exactly. No markdown, no prose outside the JSON.`

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CMORequest
    const { workspaceId, message, action, firstAction } = body

    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: 'workspaceId is required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── CHAT action: parse intent, propose team ─────────────────────────────
    if (action === 'chat') {
      if (!message?.trim()) {
        return NextResponse.json({ ok: false, error: 'message is required for chat action' }, { status: 400 })
      }

      // Load workspace for brand context
      const wsResult = await sql`SELECT * FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
      const workspace = wsResult.rows[0]
      if (!workspace) {
        return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
      }

      // Load brand profile for richer context
      const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
      const brand = brandResult.rows[0]

      // Build context summary for the AI
      const businessName = (workspace.name as string) || 'this business'
      const modelSettings = workspace.model_settings as Record<string, unknown> | null

      let brandContext = `Business: ${businessName}`
      if (brand) {
        if (brand.offer) brandContext += `\nOffer: ${brand.offer as string}`
        if (brand.target_audience) brandContext += `\nTarget audience: ${brand.target_audience as string}`
        if (brand.tone) brandContext += `\nBrand tone: ${brand.tone as string}`
        if (brand.goals) brandContext += `\nGoals: ${brand.goals as string}`
        if (brand.channels) brandContext += `\nPreferred channels: ${brand.channels as string}`
      }
      if (modelSettings?.defaultModel) {
        brandContext += `\nAI model: ${modelSettings.defaultModel as string}`
      }

      const userPrompt = `Brand context:\n${brandContext}\n\nUser request: "${message}"\n\nRespond with a JSON object like this:\n{\n  "reply": "string",\n  "project": { "name": "string", "goal": "string", "estimatedMinutes": number, "estimatedCostUsd": number },\n  "team": [{ "role": "string", "agent": "string", "description": "string" }],\n  "firstAction": "string"\n}`

      const proposal = await runAgent<CMOChatResponse>(CMO_SYSTEM_PROMPT, userPrompt)

      return NextResponse.json({
        ok: true,
        response: proposal.reply,
        project: proposal.project,
        team: proposal.team,
        firstAction: proposal.firstAction,
      })
    }

    // ── EXECUTE action: kick off the first agent ────────────────────────────
    if (action === 'execute') {
      const agentToRun = firstAction || 'strategy'

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

      // Map agent slug to API route
      const agentRouteMap: Record<string, string> = {
        strategy: '/api/agents/strategy',
        content: '/api/agents/content',
        blog: '/api/agents/assets',
        email: '/api/agents/email',
        leads: '/api/agents/leads',
        funnel: '/api/agents/funnel',
        ads: '/api/agents/ads',
        creative: '/api/agents/creative',
        research: '/api/agents/research',
        growth: '/api/agents/growth',
        pr: '/api/agents/pr',
        analytics: '/api/agents/analytics',
        sales: '/api/agents/sales',
        retargeting: '/api/agents/retargeting',
        scheduling: '/api/agents/scheduling',
        branding: '/api/agents/branding',
      }

      const route = agentRouteMap[agentToRun] || '/api/agents/strategy'

      let projectId: string | undefined
      let executeError: string | undefined

      try {
        const executeRes = await fetch(`${appUrl}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId }),
        })

        if (executeRes.ok) {
          const executeData = (await executeRes.json()) as Record<string, unknown>
          projectId = (executeData.runId as string) || (executeData.artifactId as string) || undefined
        } else {
          const errData = (await executeRes.json().catch(() => ({}))) as Record<string, unknown>
          executeError = (errData.error as string) || `Agent returned ${executeRes.status}`
        }
      } catch (fetchErr) {
        executeError = String(fetchErr)
      }

      if (executeError) {
        return NextResponse.json(
          { ok: false, error: `Failed to start ${agentToRun} agent: ${executeError}` },
          { status: 500 },
        )
      }

      return NextResponse.json({
        ok: true,
        response: `Your ${agentToRun} agent is now running. Check the activity feed for live updates.`,
        projectId,
      })
    }

    return NextResponse.json({ ok: false, error: 'Invalid action. Use "chat" or "execute".' }, { status: 400 })
  } catch (error) {
    console.error('CMO route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
