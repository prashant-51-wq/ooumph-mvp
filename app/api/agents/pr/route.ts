/**
 * PR & Press Release Agent
 * Generates full press release packages with pitch emails and media strategy.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import { assertWorkspaceOwnership } from '@/lib/guards'

const SYSTEM = `You are an experienced PR strategist and journalist who has worked at top PR agencies.
You write press releases in strict AP style with punchy, newsworthy angles.
You craft journalist pitch emails that get opened and covered.
You know which media outlets cover which types of stories.
Respond ONLY with valid JSON.`

interface PressRelease {
  headline: string
  subheadline: string
  dateline: string
  body: string
  boilerplate: string
  contactInfo: string
}

interface PitchEmail {
  angle: string
  subject: string
  body: string
}

interface MediaTarget {
  tier: string
  outlets: string[]
}

interface PRResult {
  pressRelease: PressRelease
  pitchEmails: PitchEmail[]
  mediaTargets: MediaTarget[]
  sendAdvice: string
  followUpTimeline: string
}

const PR_TYPE_LABELS: Record<string, string> = {
  launch: 'Product Launch',
  funding: 'Funding Round',
  partnership: 'Partnership / Collaboration',
  award: 'Award or Recognition',
  update: 'Company Update / Milestone',
  custom: 'Custom Story',
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, prType, angle, keyFacts, targetMedia } = await req.json() as {
      workspaceId: string
      prType: 'launch' | 'funding' | 'partnership' | 'award' | 'update' | 'custom'
      angle: string
      keyFacts: string
      targetMedia?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!angle?.trim()) return NextResponse.json({ error: 'Missing story angle' }, { status: 400 })
    if (!keyFacts?.trim()) return NextResponse.json({ error: 'Missing key facts' }, { status: 400 })

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as Record<string, string> | undefined
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'pr_press_release', 'running')`

    // Parallel search for press release examples and news coverage
    const businessName = brand.business_name || ''
    const industry = (brand as Record<string, string>).industry || ''
    const [exampleResults, coverageResults] = await Promise.all([
      braveSearch(`${angle} press release examples AP style`, 6),
      braveSearch(`${businessName || industry} news coverage media`, 6),
    ])

    const searchContext = exampleResults.length || coverageResults.length
      ? `\nMarket & Coverage Research:\n${formatSearchResults([...exampleResults, ...coverageResults])}`
      : ''

    const prTypeLabel = PR_TYPE_LABELS[prType] || 'Press Release'
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const prompt = `Generate a complete PR package for:

Business: ${businessName}
Industry: ${industry}
Website: ${brand.website || ''}
PR Type: ${prTypeLabel}
Story Angle / Hook: ${angle}
Key Facts, Numbers & Quotes: ${keyFacts}
${targetMedia ? `Target Publications: ${targetMedia}` : ''}
Target Audience of this business: ${brand.target_audience || ''}
Brand Tone: ${brand.tone || 'professional'}
Today's Date: ${today}
${searchContext}

Generate a complete JSON object with:
{
  "pressRelease": {
    "headline": "AP-style headline in active voice, under 90 characters",
    "subheadline": "Supporting detail sentence, under 140 characters",
    "dateline": "CITY, ${today} --",
    "body": "Full press release body, 4-6 paragraphs, AP style. First paragraph covers who/what/when/where/why. Include a CEO/founder quote in paragraph 2. End with call to action. Use \\n\\n for paragraph breaks.",
    "boilerplate": "Standard About [Company] boilerplate, 2-3 sentences",
    "contactInfo": "Media Contact:\\n[Name], PR Manager\\n[Email]\\n[Website]"
  },
  "pitchEmails": [
    {
      "angle": "Industry disruption angle",
      "subject": "Email subject line under 50 chars",
      "body": "Short, punchy journalist pitch. First line hooks them. 3-4 sentences max. Personal, not corporate."
    },
    {
      "angle": "Human interest / founder story angle",
      "subject": "...",
      "body": "..."
    },
    {
      "angle": "Data / trend angle",
      "subject": "...",
      "body": "..."
    }
  ],
  "mediaTargets": [
    { "tier": "Tier 1 — National / International", "outlets": ["list", "5-7", "relevant", "outlets"] },
    { "tier": "Tier 2 — Industry / Trade Press", "outlets": ["list", "5-7", "relevant", "outlets"] },
    { "tier": "Niche / Regional", "outlets": ["list", "5-7", "relevant", "outlets"] }
  ],
  "sendAdvice": "Best day/time to send, and why. Include timezone. 2-3 sentences.",
  "followUpTimeline": "Step-by-step follow-up plan over 2 weeks, e.g. Day 1: Send release. Day 3: Follow up by email. Day 7: Phone call if no response."
}

Return valid JSON only.`

    const result = await runAgent<PRResult>(SYSTEM, prompt, workspaceId)

    // Save as artifact
    const artifactId = newId()
    const title = result.pressRelease?.headline || `PR: ${angle.slice(0, 60)}`
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'press_release', ${title}, ${JSON.stringify(result)}, 'draft')
    `
    await sql`
      UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `

    return NextResponse.json({ ...result, artifactId })
  } catch (error) {
    console.error('PR agent error:', error)
    if (runId) {
      await sql`UPDATE agent_runs SET status = 'failed', error_message = ${String(error)} WHERE id = ${runId}`
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const result = await sql`
      SELECT id, title, content_json, status, created_at
      FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'press_release'
      ORDER BY created_at DESC
      LIMIT 10
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
