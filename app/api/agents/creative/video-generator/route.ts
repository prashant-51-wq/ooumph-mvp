import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a video director and content strategist. You create detailed, scene-by-scene
video briefs that a creator or AI video tool can execute immediately. Each scene has clear visual
direction, spoken script, shot type, and duration. Respond ONLY with valid JSON.`

const SHOT_TYPES = ['close-up', 'medium shot', 'wide shot', 'over the shoulder', 'b-roll cutaway', 'talking head', 'screen recording', 'product demo', 'testimonial', 'text overlay']

interface VideoScene {
  sceneNum: number
  shotType: string           // e.g. "talking head", "b-roll cutaway"
  visual: string             // what the camera shows
  script: string             // spoken words or caption text
  duration: string           // e.g. "3s", "5s"
  musicMood?: string         // for this scene
  transition?: string        // cut, fade, zoom
}

interface VideoBrief {
  title: string
  format: 'reel' | 'story' | 'short' | 'youtube' | 'square' | 'ad'
  totalDuration: string       // e.g. "60s", "3m"
  hook: string                // first 3 seconds hook line
  musicStyle: string          // overall music direction
  colorGrading: string        // visual style
  scenes: VideoScene[]
  postCaption: string         // Instagram/YouTube caption
  hashtags: string[]
  sourceReelScriptId?: string // if built from existing reel script
}

// Supported formats and their specs
const FORMAT_SPECS = {
  reel:    { aspect: '9:16', maxDuration: '90s', platform: 'Instagram Reels' },
  story:   { aspect: '9:16', maxDuration: '60s', platform: 'Instagram Stories' },
  short:   { aspect: '9:16', maxDuration: '60s', platform: 'YouTube Shorts' },
  youtube: { aspect: '16:9', maxDuration: '15m', platform: 'YouTube Long-form' },
  square:  { aspect: '1:1',  maxDuration: '60s', platform: 'Instagram Feed Video' },
  ad:      { aspect: '1:1',  maxDuration: '30s', platform: 'Meta/Google Video Ad' },
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, format = 'reel', topic } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Pull from multiple supervisors in parallel
    const [brandResult, strategyResult, reelScriptResult, contentCalResult, learningResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      // Strategy supervisor — messaging, audience, positioning
      sql`SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'strategy'
          ORDER BY created_at DESC LIMIT 1`,
      // Content supervisor — existing reel scripts to build from
      sql`SELECT id, content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'reelScript'
          ORDER BY created_at DESC LIMIT 1`,
      // Content supervisor — content calendar themes
      sql`SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type = 'content_calendar'
          ORDER BY created_at DESC LIMIT 1`,
      // Learning notes — past feedback
      sql`SELECT note FROM learning_notes
          WHERE workspace_id = ${workspaceId}
          ORDER BY created_at DESC LIMIT 5`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const reelScript = reelScriptResult.rows[0]
    const contentCal = contentCalResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const learningNotes = learningResult.rows.map(r => r.note as string)

    const spec = FORMAT_SPECS[format as keyof typeof FORMAT_SPECS] || FORMAT_SPECS.reel
    const sceneCount = format === 'youtube' ? 8 : format === 'ad' ? 4 : 6

    // Build the cross-supervisor context for Claude
    const strategyContext = strategy ? `
STRATEGY (from Strategy Supervisor):
- Positioning: ${JSON.stringify((strategy as { positioning?: unknown }).positioning || '')}
- Key messages: ${JSON.stringify((strategy as { keyMessages?: unknown }).keyMessages || (strategy as { key_messages?: unknown }).key_messages || '')}
- Content themes: ${JSON.stringify((strategy as { contentThemes?: unknown }).contentThemes || (strategy as { content_themes?: unknown }).content_themes || '')}` : ''

    const reelScriptContext = reelScript ? `
EXISTING REEL SCRIPT (from Content Supervisor, use as primary script source):
${JSON.stringify(reelScript.content_json)}` : ''

    const calContext = contentCal ? `
CONTENT CALENDAR THEME (from Content Supervisor):
Current focus: ${JSON.stringify((contentCal as { weeklyThemes?: unknown }).weeklyThemes || '')}` : ''

    const learningContext = learningNotes.length ? `
PAST FEEDBACK (apply these learnings):
${learningNotes.map(n => `- ${n}`).join('\n')}` : ''

    const prompt = `Create a ${spec.platform} video brief for:

Business: ${brand.business_name}
Industry: ${brand.industry}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Format: ${format} (${spec.aspect}, max ${spec.maxDuration})
${topic ? `Topic/Request: ${topic}` : ''}
${strategyContext}
${reelScriptContext}
${calContext}
${learningContext}

Rules:
- title: punchy video title (5-8 words)
- format: "${format}"
- totalDuration: realistic for ${sceneCount} scenes
- hook: the first 3-second line that stops scrolling (critical — make it irresistible)
- scenes: exactly ${sceneCount} scenes, each with:
  - sceneNum: 1 to ${sceneCount}
  - shotType: one of ${JSON.stringify(SHOT_TYPES)}
  - visual: specific visual description (what the camera sees, 10-20 words)
  - script: spoken words or on-screen caption (max 25 words)
  - duration: "Xs" (3-10 seconds per scene)
  - transition: "cut" | "fade" | "zoom-in" | "slide"
- musicStyle: specific genre + BPM vibe (e.g. "upbeat lo-fi hip-hop 95bpm")
- colorGrading: visual style (e.g. "warm golden hour", "clean bright white", "dark moody cinematic")
- postCaption: full social media caption using the hook + key points + CTA (use the reel script copy if provided)
- hashtags: 8-10 relevant hashtags (without #)
${reelScript ? `- sourceReelScriptId: "${reelScript.id}"` : ''}

Return JSON only — no markdown.`

    const brief = await runAgent<VideoBrief>(SYSTEM, prompt)

    const contentJson = {
      ...brief,
      businessName: brand.business_name,
      tone: brand.tone,
      format,
      formatSpec: spec,
      // Cross-supervisor references
      pulledFrom: {
        strategy: !!strategy,
        reelScript: !!reelScript,
        contentCalendar: !!contentCal,
      },
    }

    const artifactId = newId()
    const title = `Video Brief — ${brief.title || topic || format}`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'video_brief', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'video_brief',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, brief: contentJson })
  } catch (error) {
    console.error('Video generator error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id, ap.notes as approval_notes
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'video_brief'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
