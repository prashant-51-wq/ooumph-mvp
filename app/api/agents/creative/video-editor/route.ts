import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

interface EditInstruction {
  action: string
  timecode: string
  instruction: string
  priority: 'required' | 'recommended' | 'optional'
}

interface VideoEdit {
  title: string
  totalDuration: string
  aspectRatio: string
  scenes: Array<{
    sceneNumber: number
    startTime: string
    endTime: string
    description: string
    editInstructions: string[]
    transition: string
    broll: string
    captionText: string
    captionStyle: string
  }>
  audioInstructions: { music: string; voiceoverNotes: string; sfx: string }
  captionStyle: { font: string; position: string; color: string; background: string }
  editInstructions: EditInstruction[]
  exportSettings: { resolution: string; format: string; frameRate: string; bitrate: string }
  platformVersions: Array<{ platform: string; duration: string; cropRatio: string; notes: string }>
  postProductionChecklist: string[]
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, videoBriefId, platform, style, targetDuration } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 400 })

    // Load video brief if provided
    let videoBrief = ''
    if (videoBriefId) {
      const briefRes = await sql`SELECT content_json FROM artifacts WHERE id = ${videoBriefId} AND workspace_id = ${workspaceId} LIMIT 1`
      if (briefRes.rows[0]) {
        videoBrief = `\n\nVIDEO BRIEF:\n${JSON.stringify(briefRes.rows[0].content_json, null, 2)}`
      }
    }

    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, 'video_editor', 'running')`

    const editPlan = await runAgent<VideoEdit>(
      'You are a professional video editor and post-production specialist. Create precise, actionable editing instructions that a video editor or AI video tool can follow. Respond ONLY with valid JSON.',
      `Business: ${brand.business_name}
Platform: ${platform || 'Instagram Reels'}
Style: ${style || 'dynamic, engaging, brand-aligned'}
Target Duration: ${targetDuration || '30-60 seconds'}${videoBrief}

Create a complete video editing plan. Return JSON:
{
  "title": "video title",
  "totalDuration": "target duration",
  "aspectRatio": "9:16 or 16:9 or 1:1",
  "scenes": [
    {
      "sceneNumber": 1,
      "startTime": "0:00",
      "endTime": "0:05",
      "description": "what happens in this scene",
      "editInstructions": ["specific edit instruction 1", "instruction 2"],
      "transition": "cut/fade/zoom/slide",
      "broll": "recommended b-roll footage description",
      "captionText": "on-screen text for this scene",
      "captionStyle": "bold/minimal/animated"
    }
  ],
  "audioInstructions": {
    "music": "music style and energy level",
    "voiceoverNotes": "tone, pace, emphasis points",
    "sfx": "sound effects to add"
  },
  "captionStyle": {
    "font": "recommended font style",
    "position": "bottom/center/top",
    "color": "text color",
    "background": "none/dark-bar/rounded-pill"
  },
  "editInstructions": [
    {"action": "hook", "timecode": "0:00-0:03", "instruction": "specific action", "priority": "required"}
  ],
  "exportSettings": {
    "resolution": "1080x1920",
    "format": "MP4 H.264",
    "frameRate": "30fps",
    "bitrate": "8 Mbps"
  },
  "platformVersions": [
    {"platform": "Instagram Reels", "duration": "30s", "cropRatio": "9:16", "notes": "add captions"}
  ],
  "postProductionChecklist": [
    "check hook grabs attention in first 2 seconds",
    "verify captions are readable on mobile"
  ]
}`
    )

    await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
      VALUES (${artifactId}, ${workspaceId}, ${runId}, 'video_edit_plan', ${editPlan.title || 'Video Edit Plan'}, ${JSON.stringify(editPlan)})
    `
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    return NextResponse.json({ ok: true, artifactId, editPlan })
  } catch (error) {
    console.error('Video editor error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
