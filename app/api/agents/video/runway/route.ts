import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import {
  generateVideoFromText,
  generateVideoFromImage,
  getRunwayTaskStatus,
  cancelRunwayTask,
  isRunwayAvailable,
} from '@/lib/tools/runway'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      action,
      prompt,
      duration,
      ratio,
      seed,
      imageUrl,
      taskId,
    }: {
      workspaceId: string
      action: 'text_to_video' | 'image_to_video' | 'status' | 'cancel'
      prompt?: string
      duration?: 5 | 10
      ratio?: string
      seed?: number
      imageUrl?: string
      taskId?: string
    } = body

    if (!workspaceId || !action) {
      return NextResponse.json({ error: 'workspaceId and action are required' }, { status: 400 })
    }

    // 1. Fetch workspace settings and inject API key
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    process.env.RUNWAY_API_KEY = settings.runwayApiKey || ''

    // 2. Check availability
    if (!isRunwayAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Runway API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // 3. Handle actions
    if (action === 'text_to_video') {
      if (!prompt) {
        return NextResponse.json({ error: 'prompt is required for text_to_video' }, { status: 400 })
      }

      const result = await generateVideoFromText(prompt, { duration, ratio, seed })

      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        prompt,
        duration,
        type: 'text_to_video',
        status: 'processing',
      })

      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId},
          ${workspaceId},
          ${'video_task'},
          ${('Runway Video: ' + prompt.slice(0, 100)).trim()},
          ${content},
          ${'pending_approval'},
          NOW()
        )
      `

      return NextResponse.json({
        ok: true,
        taskId: result.id,
        artifactId,
        message: 'Video generation started. Poll for status.',
      })
    }

    if (action === 'image_to_video') {
      if (!imageUrl) {
        return NextResponse.json({ error: 'imageUrl is required for image_to_video' }, { status: 400 })
      }

      const result = await generateVideoFromImage(imageUrl, prompt, { duration, ratio })

      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        imageUrl,
        prompt,
        duration,
        type: 'image_to_video',
        status: 'processing',
      })

      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId},
          ${workspaceId},
          ${'video_task'},
          ${'Runway Image-to-Video'},
          ${content},
          ${'pending_approval'},
          NOW()
        )
      `

      return NextResponse.json({ ok: true, taskId: result.id, artifactId })
    }

    if (action === 'status') {
      if (!taskId) {
        return NextResponse.json({ error: 'taskId is required for status' }, { status: 400 })
      }

      const task = await getRunwayTaskStatus(taskId)
      const videoUrl = task.output?.[0] || null

      if (task.status === 'SUCCEEDED' && videoUrl) {
        // Update artifact to approved
        await sql`
          UPDATE artifacts
          SET status = ${'approved'},
              content_json = ${JSON.stringify({ taskId, status: 'SUCCEEDED', videoUrl })}
          WHERE workspace_id = ${workspaceId}
            AND content_json LIKE ${'%' + taskId + '%'}
        `
      }

      return NextResponse.json({
        ok: true,
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          videoUrl,
        },
      })
    }

    if (action === 'cancel') {
      if (!taskId) {
        return NextResponse.json({ error: 'taskId is required for cancel' }, { status: 400 })
      }

      await cancelRunwayTask(taskId)
      return NextResponse.json({ ok: true, cancelled: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Runway agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
