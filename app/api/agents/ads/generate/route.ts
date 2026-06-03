/**
 * AI Ad Copy Generator — Paid Ads Supervisor
 * POST /api/agents/ads/generate — generate ad variations with Claude native tools
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { runAgentWithTools } from '@/lib/agents/tool-calling'
import { AgentSetupError } from '@/lib/claude'

interface AdGenerateRequest {
  workspaceId: string
  platform: 'meta' | 'google' | 'linkedin' | 'all'
  product: string
  audience: string
  goal: string
  budget?: string
  tone?: string
  count?: number
}

interface AdVariation {
  headline: string
  primaryText: string
  description: string
  callToAction: string
  hook: string
  targetingHint: string
  estimatedCtr: string
  psychologyPrinciple: string
}

interface AdGenerateResult {
  variations: AdVariation[]
  campaignStrategy: string
  budgetAllocation: string
  keywordSuggestions: string[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AdGenerateRequest
    const { workspaceId, platform, product, audience, goal, budget, tone, count: rawCount } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!product) return NextResponse.json({ error: 'Missing product' }, { status: 400 })
    if (!audience) return NextResponse.json({ error: 'Missing audience' }, { status: 400 })
    if (!goal) return NextResponse.json({ error: 'Missing goal' }, { status: 400 })

    const count = Math.min(Math.max(rawCount || 3, 1), 5)

    const systemPrompt = `You are a world-class performance marketer specialising in paid advertising.

You have tools available:
- query_brand_memory: fetch approved brand voice examples (call this first)
- search: research competitor ads, audience insights, platform best practices
- persist_artifact: save the finished ad copy as a workspace artifact

Always call query_brand_memory first to match brand tone. Then optionally search for platform trends. Then generate the ad variations and return JSON.`

    const userPrompt = `Generate ${count} distinct ad variations for ${platform} advertising.

PRODUCT: ${product}
TARGET AUDIENCE: ${audience}
CAMPAIGN GOAL: ${goal}
BUDGET: ${budget || 'Not specified'}
TONE: ${tone || 'professional'}

For each variation, generate platform-optimised copy. Return valid JSON:
{
  "variations": [
    {
      "headline": "...",
      "primaryText": "...",
      "description": "...",
      "callToAction": "...",
      "hook": "...",
      "targetingHint": "...",
      "estimatedCtr": "...",
      "psychologyPrinciple": "..."
    }
  ],
  "campaignStrategy": "...",
  "budgetAllocation": "...",
  "keywordSuggestions": ["..."]
}

Character limits to respect:
- headline: max 30 chars for Meta/Google; max 70 chars for LinkedIn
- primaryText: 125 chars for Meta; 300 chars for LinkedIn; omit for Google
- description: max 30 chars for Meta/Google; max 200 chars for LinkedIn
- callToAction: short phrase e.g. "Sign Up Free", "Learn More", "Get Started"
- estimatedCtr: range string e.g. "1.5-2.5%"
- psychologyPrinciple: one of social proof, scarcity, curiosity gap, authority, reciprocity, fear of missing out`

    let result: AdGenerateResult
    try {
      result = await runAgentWithTools<AdGenerateResult>(systemPrompt, userPrompt, workspaceId)
    } catch (e) {
      if (e instanceof AgentSetupError) {
        return NextResponse.json({
          ok: false,
          error: e.message,
          requiresSetup: true,
        }, { status: 402 })
      }
      throw e
    }

    // Save as artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
      VALUES (
        ${artifactId}, ${workspaceId}, ${null},
        ${'ad_copy'},
        ${'Ad Copy: ' + product.slice(0, 60) + ' (' + platform + ')'},
        ${JSON.stringify({ platform, product, audience, goal, variations: result.variations })},
        ${'pending_approval'}
      )
    `.catch(() => { /* non-fatal if artifacts table structure differs */ })

    return NextResponse.json({
      ok: true,
      artifactId,
      variations: result.variations ?? [],
      campaignStrategy: result.campaignStrategy ?? '',
      budgetAllocation: result.budgetAllocation ?? '',
      keywordSuggestions: result.keywordSuggestions ?? [],
    })
  } catch (error) {
    console.error('Ad Generate route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
