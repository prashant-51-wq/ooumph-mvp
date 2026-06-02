/**
 * /api/agents/video/sora — Sprint 12E
 *
 * OpenAI Sora video generation. Reuses the workspace's existing
 * openaiApiKey BYOK — no separate "Sora key" since OpenAI auths
 * everything against the same key. The differentiating factor is
 * org access: even with a valid key, Sora's `videos.generate`
 * capability has to be enabled on the account.
 *
 * Actions: text_to_video, status (no image_to_video on Sora 2).
 *
 * Error model mirrors lib/tools/sora.ts:
 *   - { error: 'no_key' }    → 503 requiresSetup
 *   - { error: 'no_access' } → 403 requiresProviderAccess
 *   - { error: 'failed' }    → 500
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { withCredentials } from '@/lib/credential-context'
import { getWorkspaceSecret } from '@/lib/secrets'
import {
  generateSoraFromText,
  getSoraTaskStatus,
  isSoraConfigured,
  type SoraGenOptions,
} from '@/lib/tools/sora'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      action: 'text_to_video' | 'status'
      prompt?: string
      model?: SoraGenOptions['model']
      aspectRatio?: SoraGenOptions['aspectRatio']
      durationSeconds?: SoraGenOptions['durationSeconds']
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
    // Sprint 19G: resolve from workspace_secrets first.
    const openaiKey = (await getWorkspaceSecret(workspaceId, 'openai'))
      || settings.openaiApiKey
      || process.env.OPENAI_API_KEY
      || ''

    return await withCredentials({ OPENAI_API_KEY: openaiKey }, async () => {
    if (!isSoraConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'OpenAI API key not configured (Sora uses the same key). Add it in Settings → API Keys → AI text.',
        requiresSetup: true,
        provider: 'sora',
      }, { status: 503 })
    }

    if (action === 'text_to_video') {
      if (!body.prompt) {
        return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
      }
      const result = await generateSoraFromText(body.prompt, {
        model: body.model,
        aspectRatio: body.aspectRatio,
        durationSeconds: body.durationSeconds,
      })
      if ('error' in result) {
        if (result.error === 'no_key') {
          return NextResponse.json({
            ok: false,
            error: 'OpenAI API key not configured.',
            requiresSetup: true,
            provider: 'sora',
          }, { status: 503 })
        }
        if (result.error === 'no_access') {
          return NextResponse.json({
            ok: false,
            error: 'Sora is not enabled on your OpenAI organization yet. Apply for access at platform.openai.com — your key works but the videos.generate capability is gated.',
            requiresProviderAccess: true,
            provider: 'sora',
            detail: result.detail,
          }, { status: 403 })
        }
        return NextResponse.json({
          ok: false,
          error: `Sora generation failed: ${result.detail || 'unknown error'}`,
          provider: 'sora',
        }, { status: 500 })
      }
      const artifactId = newId()
      const content = JSON.stringify({
        taskId: result.id,
        prompt: body.prompt,
        provider: 'sora',
        type: 'text_to_video',
        status: 'processing',
      })
      await sql`
        INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
        VALUES (
          ${artifactId}, ${workspaceId}, 'video_task',
          ${('Sora Video: ' + body.prompt.slice(0, 100)).trim()},
          ${content}, 'pending_approval', NOW()
        )
      `
      return NextResponse.json({ ok: true, taskId: result.id, artifactId, provider: 'sora' })
    }

    if (action === 'status') {
      if (!body.taskId) {
        return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
      }
      const task = await getSoraTaskStatus(body.taskId)
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Task not found or status check failed.' }, { status: 404 })
      }
      if (task.status === 'completed' && task.videoUrl) {
        await sql`
          UPDATE artifacts
          SET status = 'approved',
              content_json = ${JSON.stringify({ taskId: task.id, status: 'completed', videoUrl: task.videoUrl, provider: 'sora' })}
          WHERE workspace_id = ${workspaceId}
            AND content_json LIKE ${'%' + task.id + '%'}
        `
        // Sprint 15D (P0 #4): media_assets dual-write (idempotent by taskId).
        const { recordMediaAsset } = await import('@/lib/media-assets')
        const dupe = await sql`SELECT id FROM media_assets WHERE workspace_id = ${workspaceId} AND metadata_json LIKE ${'%"taskId":"' + task.id + '"%'} LIMIT 1`
        if (!dupe.rows[0]) {
          await recordMediaAsset({
            workspaceId, url: task.videoUrl, filename: 'sora-' + task.id + '.mp4',
            assetType: 'video', mimeType: 'video/mp4', sourceProvider: 'sora',
            metadata: { taskId: task.id },
          })
        }
      }
      return NextResponse.json({
        ok: true,
        task: { id: task.id, status: task.status, progress: task.progress, videoUrl: task.videoUrl, failureReason: task.failureReason },
        provider: 'sora',
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    })
  } catch (error) {
    console.error('Sora agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
