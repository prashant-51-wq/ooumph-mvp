/**
 * A/B Test Generator Agent
 * Generates scientifically distinct content variations for A/B testing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the A/B Test Generator Agent for Ooumph AI Marketing OS.
You create scientifically distinct content variations for A/B testing.
Each variation must use a completely different angle, emotional hook, and persuasion technique — NOT just synonym swaps.
You understand what makes each variation psychologically different and testable.
Always respond with valid JSON.`

type ContentType = 'headline' | 'cta' | 'email_subject' | 'ad_copy' | 'social_post' | 'landing_page_copy'

interface ABVariation {
  id: string
  label: string
  content: string
  hypothesis: string
  expectedOutcome: string
  targetEmotion: string
}

interface ABTestResult {
  variations: ABVariation[]
  testingAdvice: string
  successMetric: string
}


export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, content, contentType, variations = 2, testGoal } = await req.json() as {
      workspaceId: string
      content: string
      contentType: ContentType
      variations?: number
      testGoal?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!content) return NextResponse.json({ error: 'Missing content to test' }, { status: 400 })
    if (!contentType) return NextResponse.json({ error: 'Missing contentType' }, { status: 400 })

    const clampedVariations = Math.min(5, Math.max(2, variations))

    const bpResult = await sql`SELECT bp.* FROM brand_profiles bp JOIN workspaces w ON bp.workspace_id = w.id WHERE w.id = ${workspaceId} LIMIT 1`
    const bp = bpResult.rows[0] as unknown as BrandProfile

    if (!bp) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'ab_test_generator', 'running')`

    const contentTypeLabels: Record<ContentType, string> = {
      headline: 'Headline',
      cta: 'Call-to-Action',
      email_subject: 'Email Subject Line',
      ad_copy: 'Ad Copy',
      social_post: 'Social Media Post',
      landing_page_copy: 'Landing Page Copy',
    }

    const prompt = `Generate ${clampedVariations} distinct A/B test variations for a ${contentTypeLabels[contentType]}.

Business: ${bp.business_name}
Industry: ${bp.industry || 'Not specified'}
Target Audience: ${bp.target_audience}
Brand Tone: ${bp.tone}
Offer: ${bp.offer}
${testGoal ? `Test Goal: ${testGoal}` : ''}

Original Content:
"${content}"

Create ${clampedVariations} variations that are COMPLETELY DIFFERENT from each other:
- Variation A: Use the EXACT original content
- Remaining variations: each must use a different persuasion angle:
  * Different emotional hook (curiosity vs urgency vs fear of missing out vs trust vs delight)
  * Different structure or format
  * Different benefit emphasis
  * Different POV or voice
  * NOT just synonym swaps

Return JSON:
{
  "variations": [
    {
      "id": "var_a",
      "label": "A",
      "content": "the variation content",
      "hypothesis": "Why this angle might outperform others (1 sentence)",
      "expectedOutcome": "What metric this is optimized for (1 sentence)",
      "targetEmotion": "Curiosity|Fear of missing out|Trust|Urgency|Delight|Authority|Relatability"
    }
  ],
  "testingAdvice": "Practical advice on how to run this specific A/B test, sample size needed, duration, etc. (2-3 sentences)",
  "successMetric": "The single most important metric to measure for this content type"
}`

    const result = await runAgent<ABTestResult>(SYSTEM, prompt, workspaceId)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(result)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `A/B Test — ${contentTypeLabels[contentType]} — ${bp.business_name} — ${new Date().toLocaleDateString()}`
    const contentJson = {
      ...result,
      businessName: bp.business_name,
      contentType,
      originalContent: content,
      testGoal: testGoal || '',
      variationCount: clampedVariations,
    }

    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'ab_test', ${title}, ${JSON.stringify(contentJson)})`

    return NextResponse.json({
      artifactId,
      variations: result.variations,
      testingAdvice: result.testingAdvice,
      successMetric: result.successMetric,
      message: `Generated ${result.variations?.length || 0} distinct variations for testing.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('A/B Test error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at
    FROM artifacts a
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'ab_test'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}

