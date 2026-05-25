import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'

interface ScriptSection {
  timestamp: string
  section: string
  script: string
  broll?: string
  onscreen?: string
}

interface ChapterTimestamp {
  time: string
  title: string
}

interface ContentScript {
  title: string
  platform: string
  estimatedDuration: string
  hook: string
  intro: string
  mainContent: ScriptSection[]
  cta: string
  outro: string
  description: string
  hashtags: string[]
  thumbnailIdeas: string[]
  chaptersTimestamps?: ChapterTimestamp[]
}

const SCRIPT_SCHEMA = `{
  "title": "string — content title",
  "platform": "string — target platform",
  "estimatedDuration": "string — e.g. '8 minutes 30 seconds'",
  "hook": "string — first 5-10 seconds script, must grab attention immediately",
  "intro": "string — speaker introduction (10-20 seconds)",
  "mainContent": [
    {
      "timestamp": "string — e.g. '0:15'",
      "section": "string — section title",
      "script": "string — word-for-word script for this section",
      "broll": "string — optional B-roll or visual direction",
      "onscreen": "string — optional text to display on screen"
    }
  ],
  "cta": "string — call to action section script",
  "outro": "string — closing script",
  "description": "string — YouTube/podcast/platform description with keywords",
  "hashtags": ["string"],
  "thumbnailIdeas": ["string — thumbnail concept description (3 ideas)"],
  "chaptersTimestamps": [
    { "time": "string", "title": "string" }
  ]
}`

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const body = await req.json()
    const {
      workspaceId,
      topic,
      platform,
      duration,
      style = '',
      hook = '',
    }: {
      workspaceId: string
      topic: string
      platform: 'youtube' | 'instagram_reel' | 'tiktok' | 'podcast' | 'webinar' | 'ad'
      duration: number
      style?: string
      hook?: string
    } = body

    if (!workspaceId || !topic || !platform || !duration) {
      return NextResponse.json(
        { error: 'workspaceId, topic, platform, and duration are required' },
        { status: 400 }
      )
    }

    // 1. Load brand profile
    const brandResult = await sql`
      SELECT bp.* FROM brand_profiles bp
      JOIN workspaces w ON bp.workspace_id = w.id
      WHERE w.id = ${workspaceId} LIMIT 1
    `
    const brand = brandResult.rows[0] as Record<string, unknown> | undefined
    if (!brand) {
      return NextResponse.json({ error: 'Brand profile not found. Complete onboarding first.' }, { status: 400 })
    }

    // 2. Try Brave Search for platform-specific tips
    let researchContext = ''
    try {
      const { braveSearch, formatSearchResults } = await import('@/lib/tools/brave-search')
      const results = await braveSearch(`${topic} ${platform} script tips best practices 2025`, 5)
      if (results.length) {
        researchContext = `\n\nPLATFORM RESEARCH:\n${formatSearchResults(results)}`
      }
    } catch {
      // Brave search unavailable — continue without it
    }

    // 3. Log agent run
    runId = newId()
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status)
      VALUES (${runId}, ${workspaceId}, 'script_writer', 'running')
    `

    // 4. Platform-specific guidance
    const platformGuide: Record<string, string> = {
      youtube: `YouTube video (${duration}s): Strong hook in first 30s, retention-optimized structure, clear chapter breaks, SEO-rich description`,
      instagram_reel: `Instagram Reel (${duration}s): Immediate hook (no intro), fast-paced, text on screen critical, trending audio cue notes`,
      tiktok: `TikTok (${duration}s): Native feel, trend-aware, casual tone, strong pattern interrupt hook, text overlays important`,
      podcast: `Podcast episode (${duration}s): Conversational tone, audio-first (no visual directions needed), engaging storytelling, clear takeaways`,
      webinar: `Webinar (${duration}s): Educational, slide-aware structure, interactive moments, professional delivery, clear agenda`,
      ad: `Video Ad (${duration}s): Problem-agitate-solve in tight format, brand mention early, single clear CTA, every second earns its place`,
    }

    const platformContext = platformGuide[platform] || `${platform} video (${duration}s)`

    const systemPrompt = `You are an expert scriptwriter for digital media, video content, and advertising. You write scripts that hold attention, deliver value, and drive action. You understand pacing, hooks, retention psychology, and platform-specific best practices. You write in the brand's voice while adapting to each platform's native format.`

    const userPrompt = `Write a complete, production-ready script for ${brand.business_name || 'the brand'}.

BRAND DETAILS:
- Business: ${brand.business_name || ''}
- Tone: ${brand.tone_of_voice || brand.tone || 'professional'}
- Target audience: ${brand.target_audience || 'general audience'}
- Industry: ${brand.industry || ''}

SCRIPT BRIEF:
- Topic / Title: ${topic}
- Platform: ${platformContext}
- Duration: ${duration} seconds (~${Math.round(duration / 60 * 130)} words at average speaking pace)
- Style: ${style || 'match brand tone'}
- Hook idea (optional): ${hook || 'generate the strongest possible hook for this topic and platform'}
${researchContext}

REQUIREMENTS:
- HOOK (first 5-10 seconds): Must be irresistible — a bold claim, surprising stat, relatable problem, or pattern interrupt
- Structure with timestamps matching the ${duration}s duration
- Word-for-word script (not bullet points) for every section
- B-roll / visual direction notes where relevant
- On-screen text suggestions for key moments
- Platform-optimized description with searchable keywords
- 3 distinct thumbnail ideas (for video platforms)
- Chapter timestamps (for YouTube/podcast over 3 minutes)
- 10-15 relevant hashtags

Respond with valid JSON only.`

    let script: ContentScript
    try {
      script = await runAgent<ContentScript>(systemPrompt, userPrompt, SCRIPT_SCHEMA)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    // 5. Update agent run + save artifact
    await sql`
      UPDATE agent_runs
      SET status = 'completed', output_json = ${JSON.stringify(script)}, completed_at = CURRENT_TIMESTAMP
      WHERE id = ${runId}
    `

    const artifactId = newId()
    const title = script.title || topic
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'content_script', ${title}, ${JSON.stringify(script)})
    `
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id)
      VALUES (${newId()}, ${workspaceId}, ${artifactId})
    `

    return NextResponse.json({ script, artifactId })
  } catch (error) {
    console.error('Script writer agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 400 })
  const result = await sql`
    SELECT id, title, content_json, created_at
    FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'content_script'
    ORDER BY created_at DESC
    LIMIT 10
  `
  return NextResponse.json(result.rows)
}
