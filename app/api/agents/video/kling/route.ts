/**
 * /api/agents/video/kling — Sprint 12A
 *
 * Sibling to /api/agents/video/runway. Same action surface:
 *   - text_to_video   { prompt, model?, duration?, aspectRatio?, cameraMode? } → { taskId, artifactId }
 *   - image_to_video  { imageUrl, prompt, model?, duration?, aspectRatio? }    → { taskId, artifactId }
 *   - status          { taskId }                                                → polls Kling + updates artifact
 *
 * Reads workspace BYOK (klingAccessKey + klingSecretKey) and injects
 * into env so lib/tools/kling.ts mints a JWT signed with the user's
 * secret. Falls back to deployment env when not set per workspace.
 *
 * Default model: kling-v2 (highest quality). Callers can downgrade.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import {
  generateKlingFromText,
  generateKlingFromImage,
  getKlingTaskStatus,
  isKlingAvailable,
  type KlingGenOptions,
} from '@/lib/tools/kling'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'text_to_video' | 'image_to_video' | 'status'
      prompt?: string
      model?: KlingGenOptions['model']
      duration?: 5 | 10
      aspectRatio?: KlingGenOptions['aspectRatio']
      cameraMode?: KlingGenOptions['cameraMode']
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

    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    if (settings.klingAccessKey) process.env.KLING_ACCESS_KEY = settings.klingAccessKey
    if (settings.klingSecretKey) process.env.KLING_SECRET_KEY = settings.klingSecretKey

    if (!isKlingAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Kling AI credentials not configured. Add both access + secret keys in Settings → API Keys → Generate videos.',
        requiresSetup: true,
        provider: 'kling',
      }, { status: 503 })
    }

    const sharedOpts: KlingGenOptions = {
      model: body.model,
      duration: body.duration,
      aspectRatio: body.aspectRatio,
      cameraMode: body.cameraMode,
    }

    if (action === 'text_to_video') {
      if (!body.prompt) {
        return NextResponse.json({ error: 'prompt is required for text_to_video' }, { status: 400 })
      }
      const result = await generateKlingFromText(body.prompt, sharedOpts)
      if (!result) {
        return NextResponse.json({ ok: false, error: 'Kling video generation failed. Check your credentials + plan.' }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        prompt: body.prompt,
        provider: 'kling',
        model: body.model ?? 'kling-v2',
        type: 'text_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          ${('Kling Video: ' + body.prompt.slice(0, 100)).trim()},
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'kling' })
    }

    if (action === 'image_to_video') {
      if (!body.imageUrl) {
        return NextResponse.json({ error: 'imageUrl is required for image_to_video' }, { status: 400 })
      }
      const result = await generateKlingFromImage(body.imageUrl, body.prompt || '', sharedOpts)
      if (!result) {
        return NextResponse.json({ ok: false, error: 'Kling image-to-video failed. Check your credentials.' }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        imageUrl: body.imageUrl,
        prompt: body.prompt,
        provider: 'kling',
        type: 'image_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          'Kling Image-to-Video',
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'kling' })
    }

    if (action === 'status') {
      if (!body.taskId) {
        return NextResponse.json({ error: 'taskId is required for status' }, { status: 400 })
      }
      const task = await getKlingTaskStatus(body.taskId)
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Task not found or status check failed.' }, { status: 404 })
      }
      if (task.status === 'succeeded' && task.videoUrl) {
        await sql`
          UPDATE artifacts
          SET status = 'approved',
              content_json = ${JSON.stringify({ taskId: task.id, status: 'succeeded', videoUrl: task.videoUrl, provider: 'kling' })}
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
          failureReason: task.failureReason,
        },
        provider: 'kling',
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Kling agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
