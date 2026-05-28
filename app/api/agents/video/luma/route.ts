/**
 * /api/agents/video/luma — Sprint 12A
 *
 * Sibling to /api/agents/video/runway. Same action surface:
 *   - text_to_video   { prompt, aspectRatio?, loop?, seed? } → { taskId, artifactId }
 *   - image_to_video  { imageUrl, prompt, aspectRatio? }     → { taskId, artifactId }
 *   - status          { taskId }                              → polls Luma + updates artifact
 *
 * Reads workspace BYOK (lumaApiKey) and injects into env so the
 * shared lib/tools/luma.ts client picks it up. Falls back to the
 * deployment env LUMA_API_KEY when not set on the workspace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import {
  generateLumaFromText,
  generateLumaFromImage,
  getLumaTaskStatus,
  isLumaAvailable,
  type LumaGenOptions,
} from '@/lib/tools/luma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'text_to_video' | 'image_to_video' | 'status'
      prompt?: string
      aspectRatio?: LumaGenOptions['aspectRatio']
      loop?: boolean
      seed?: number
      imageUrl?: string
      taskId?: string
    }
    const { workspaceId, action } = body
    if (!workspaceId || !action) {
      return NextResponse.json({ error: 'workspaceId and action are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (action === 'text_to_video' || action === 'image_to_video') {
      const overQuota = await assertAgentRunQuota(req, workspaceId)
      if (overQuota) return overQuota
    }

    // Workspace BYOK → env shim, matching the Runway handler.
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    if (settings.lumaApiKey) process.env.LUMA_API_KEY = settings.lumaApiKey

    if (!isLumaAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Luma API key not configured. Add it in Settings → API Keys → Generate videos.',
        requiresSetup: true,
        provider: 'luma',
      }, { status: 503 })
    }

    if (action === 'text_to_video') {
      if (!body.prompt) {
        return NextResponse.json({ error: 'prompt is required for text_to_video' }, { status: 400 })
      }
      const result = await generateLumaFromText(body.prompt, {
        aspectRatio: body.aspectRatio,
        loop: body.loop,
        seed: body.seed,
      })
      if (!result) {
        return NextResponse.json({ ok: false, error: 'Luma video generation failed. Check your API key + plan.' }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        prompt: body.prompt,
        provider: 'luma',
        type: 'text_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          ${('Luma Video: ' + body.prompt.slice(0, 100)).trim()},
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'luma' })
    }

    if (action === 'image_to_video') {
      if (!body.imageUrl) {
        return NextResponse.json({ error: 'imageUrl is required for image_to_video' }, { status: 400 })
      }
      const result = await generateLumaFromImage(body.imageUrl, body.prompt || '', {
        aspectRatio: body.aspectRatio,
        loop: body.loop,
      })
      if (!result) {
        return NextResponse.json({ ok: false, error: 'Luma image-to-video failed. Check your API key.' }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        imageUrl: body.imageUrl,
        prompt: body.prompt,
        provider: 'luma',
        type: 'image_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          'Luma Image-to-Video',
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'luma' })
    }

    if (action === 'status') {
      if (!body.taskId) {
        return NextResponse.json({ error: 'taskId is required for status' }, { status: 400 })
      }
      const task = await getLumaTaskStatus(body.taskId)
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Task not found or status check failed.' }, { status: 404 })
      }
      // When complete, promote the artifact to approved + persist URL.
      if (task.status === 'completed' && task.videoUrl) {
        await sql`
          UPDATE artifacts
          SET status = 'approved',
              content_json = ${JSON.stringify({ taskId: task.id, status: 'completed', videoUrl: task.videoUrl, provider: 'luma' })}
          WHERE workspace_id = ${workspaceId}
            AND content_json LIKE ${'%' + task.id + '%'}
        `
      }
      return NextResponse.json({
        ok: true,
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          videoUrl: task.videoUrl,
        },
        provider: 'luma',
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Luma agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
