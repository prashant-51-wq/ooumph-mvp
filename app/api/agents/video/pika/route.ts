/**
 * /api/agents/video/pika — Sprint 12E
 *
 * Pika Labs video generation. API access is invitation-only as of
 * writing — the route surfaces a clear "no_access" error so the UI
 * can distinguish "needs key" from "Pika hasn't enabled API for you".
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import {
  generatePikaFromText,
  getPikaTaskStatus,
  isPikaConfigured,
  type PikaGenOptions,
} from '@/lib/tools/pika'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'text_to_video' | 'status'
      prompt?: string
      aspectRatio?: PikaGenOptions['aspectRatio']
      motion?: PikaGenOptions['motion']
      style?: PikaGenOptions['style']
      taskId?: string
    }
    const { workspaceId, action } = body
    if (!workspaceId || !action) {
      return NextResponse.json({ error: 'workspaceId and action are required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (action === 'text_to_video') {
      const overQuota = await assertAgentRunQuota(req, workspaceId)
      if (overQuota) return overQuota
    }

    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    if (settings.pikaApiKey) process.env.PIKA_API_KEY = settings.pikaApiKey

    if (!isPikaConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Pika API key not set. Add it in Settings → API Keys → Generate videos. Note: Pika API access is invitation-only.',
        requiresSetup: true,
        provider: 'pika',
      }, { status: 503 })
    }

    if (action === 'text_to_video') {
      if (!body.prompt) {
        return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
      }
      const result = await generatePikaFromText(body.prompt, {
        aspectRatio: body.aspectRatio,
        motion: body.motion,
        style: body.style,
      })
      if ('error' in result) {
        if (result.error === 'no_key') {
          return NextResponse.json({
            ok: false,
            error: 'Pika API key not configured.',
            requiresSetup: true,
            provider: 'pika',
          }, { status: 503 })
        }
        if (result.error === 'no_access') {
          return NextResponse.json({
            ok: false,
            error: 'Your Pika key works but the API access isn\'t enabled yet. Request access at pika.art.',
            requiresProviderAccess: true,
            provider: 'pika',
            detail: result.detail,
          }, { status: 403 })
        }
        return NextResponse.json({
          ok: false,
          error: `Pika generation failed: ${result.detail || 'unknown error'}`,
          provider: 'pika',
        }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        prompt: body.prompt,
        provider: 'pika',
        type: 'text_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          ${('Pika Video: ' + body.prompt.slice(0, 100)).trim()},
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'pika' })
    }

    if (action === 'status') {
      if (!body.taskId) {
        return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
      }
      const task = await getPikaTaskStatus(body.taskId)
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Task not found or status check failed.' }, { status: 404 })
      }
      if (task.status === 'completed' && task.videoUrl) {
        await sql`
          UPDATE artifacts
          SET status = 'approved',
              content_json = ${JSON.stringify({ taskId: task.id, status: 'completed', videoUrl: task.videoUrl, provider: 'pika' })}
          WHERE workspace_id = ${workspaceId}
            AND content_json LIKE ${'%' + task.id + '%'}
        `
      }
      return NextResponse.json({
        ok: true,
        task: { id: task.id, status: task.status, videoUrl: task.videoUrl, failureReason: task.failureReason },
        provider: 'pika',
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Pika agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
