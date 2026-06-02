/**
 * AI Ad Copy Generator — Paid Ads Supervisor
 * POST /api/agents/ads/generate — generate ad variations with Claude
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { getWorkspaceSecret } from '@/lib/secrets'

interface AdGenerateRequest {
  workspaceId: string
  platform: 'meta' | 'google' | 'linkedin' | 'all'
  product: string       // What you're advertising
  audience: string      // Target audience description
  goal: string          // e.g., "drive signups", "increase brand awareness", "generate leads"
  budget?: string       // e.g., "$50/day"
  tone?: string         // professional | friendly | urgent | inspirational
  count?: number        // variations to generate, default 3, max 5
}

async function getSettings(workspaceId: string) {
  const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const workspace = wsResult.rows[0]
  if (!workspace) return null
  try {
    return typeof workspace.model_settings === 'string'
      ? JSON.parse(workspace.model_settings || '{}')
      : (workspace.model_settings as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AdGenerateRequest
    const {
      workspaceId,
      platform,
      product,
      audience,
      goal,
      budget,
      tone,
      count: rawCount,
    } = body

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!product) return NextResponse.json({ error: 'Missing product' }, { status: 400 })
    if (!audience) return NextResponse.json({ error: 'Missing audience' }, { status: 400 })
    if (!goal) return NextResponse.json({ error: 'Missing goal' }, { status: 400 })

    const count = Math.min(Math.max(rawCount || 3, 1), 5)

    const settings = await getSettings(workspaceId)
    if (!settings) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    // Sprint 19G: read from workspace_secrets (encrypted, Sprint 18B) with
    // fallback to legacy model_settings field and env var.
    const anthropicKey = (await getWorkspaceSecret(workspaceId, 'anthropic'))
      || (settings.anthropicApiKey as string | undefined)
      || process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({
        ok: false,
        error: 'Anthropic API key not configured. Add it in Settings → API Keys.',
        requiresSetup: true,
      })
    }

    const modelId = (settings.claudeModel as string | undefined) || 'claude-sonnet-4-6'

    const client = new Anthropic({ apiKey: anthropicKey })

    const prompt = `You are a world-class performance marketer. Generate ${count} distinct ad variations for ${platform} advertising.

PRODUCT: ${product}
TARGET AUDIENCE: ${audience}
CAMPAIGN GOAL: ${goal}
BUDGET: ${budget || 'Not specified'}
TONE: ${tone || 'professional'}

For each variation, generate platform-optimized copy. Return ONLY valid JSON:
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
- psychologyPrinciple: one of social proof, scarcity, curiosity gap, authority, reciprocity, fear of missing out, etc.`

    const message = await client.messages.create({
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    // Extract JSON — strip any markdown code fences if present
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: 'Claude did not return valid JSON' }, { status: 500 })
    }

    let result: {
      variations: unknown[]
      campaignStrategy?: string
      budgetAllocation?: string
      keywordSuggestions?: string[]
    }

    try {
      result = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ ok: false, error: 'Failed to parse Claude response as JSON' }, { status: 500 })
    }

    // Save as artifact
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${null},
        ${'ad_copy'},
        ${'Ad Copy: ' + product.slice(0, 60) + ' (' + platform + ')'},
        ${JSON.stringify({
          platform,
          product,
          audience,
          goal,
          variations: result.variations,
        })},
        ${'pending_approval'}
      )
    `.catch(() => { /* ignore if artifacts table structure differs */ })

    return NextResponse.json({
      ok: true,
      artifactId,
      variations: result.variations,
      campaignStrategy: result.campaignStrategy || '',
      budgetAllocation: result.budgetAllocation || '',
      keywordSuggestions: result.keywordSuggestions || [],
    })
  } catch (error) {
    console.error('Ad Generate route error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
