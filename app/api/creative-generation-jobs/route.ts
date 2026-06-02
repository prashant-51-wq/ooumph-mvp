/**
 * /api/creative-generation-jobs
 *
 * Unified async generation queue across DALL-E 3, Runway ML, ElevenLabs,
 * and Stability (mock fallback when provider keys absent).
 *
 *   GET    ?workspaceId=…[&status=pending|running|completed|failed][&artifactId=…]
 *
 *   POST   { workspaceId, provider, prompt, options?, artifactId?, modelName?,
 *            negativePrompt? }
 *
 *          provider: 'openai_dalle' | 'runway_gen3' | 'elevenlabs' | 'stability'
 *
 *   POST flow:
 *     1. workspace ownership                                       401/403
 *     2. INSERT creative_generation_jobs (status='pending')        → jobId
 *     3. atomic CAS lock: pending → running + started_at = NOW()   409 if 0 rows
 *     4. dispatch to provider wrapper (real if key present, mock otherwise)
 *     5. on success: INSERT media_assets, capture duration_ms +
 *        cost_estimate, UPDATE job status='completed' + result_asset_id
 *     6. on failure: UPDATE status='failed' + error_message
 *
 * Returns the final job row + media asset (if produced) so the client
 * doesn't have to round-trip a follow-up GET.
 *
 * No third-party publish here — that's `/api/creative-generation-jobs/[id]/publish`
 * which adds the assertArtifactApproved() HITL gate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { generateImage as openaiGenerateImage } from '@/lib/tools/openai'
import { generateVideoFromText as runwayGenerateVideo, getRunwayTaskStatus } from '@/lib/tools/runway'
import { textToSpeech as elevenlabsTts } from '@/lib/tools/elevenlabs'
import { generateStabilityImage } from '@/lib/tools/stability'
import { withCredentials } from '@/lib/credential-context'

export const runtime = 'nodejs'
export const maxDuration = 300

type ProviderId = 'openai_dalle' | 'runway_gen3' | 'elevenlabs' | 'stability' | string

interface JobRow {
  id: string
  workspace_id: string
  artifact_id: string | null
  provider: string
  model_name: string | null
  prompt_text: string
  negative_prompt: string | null
  status: string
  result_asset_id: string | null
  cost_estimate: number | string | null
  duration_ms: number | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface ProviderResult {
  ok: boolean
  url?: string
  filename?: string
  mimeType?: string
  fileSize?: number
  dimensions?: string
  durationSeconds?: number
  assetType: 'image' | 'video' | 'audio'
  costEstimate: number
  metadata?: Record<string, unknown>
  error?: string
  usedMock?: boolean
}

// Per-provider cost estimates (used for the dashboard ROI panel + cap checks)
// These are coarse averages; tighten per-provider as needed.
const COST_ESTIMATE: Record<string, number> = {
  openai_dalle: 0.040,     // DALL-E 3 standard 1024x1024
  runway_gen3:  0.250,     // 5-second Gen-3 clip
  elevenlabs:   0.005,     // per 1000 chars approx
  stability:    0.020,     // SD3.5 large
}

// ─── GET ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const status = searchParams.get('status')
  const artifactId = searchParams.get('artifactId')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  let result
  if (artifactId) {
    result = await sql`
      SELECT * FROM creative_generation_jobs
      WHERE workspace_id = ${workspaceId} AND artifact_id = ${artifactId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else if (status) {
    result = await sql`
      SELECT * FROM creative_generation_jobs
      WHERE workspace_id = ${workspaceId} AND status = ${status}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  } else {
    result = await sql`
      SELECT * FROM creative_generation_jobs
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  }
  return NextResponse.json(result.rows as unknown as JobRow[])
}

// ─── POST (enqueue + dispatch) ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: {
    workspaceId?: string
    provider?: ProviderId
    prompt?: string
    modelName?: string
    negativePrompt?: string
    artifactId?: string | null
    options?: Record<string, unknown>
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { workspaceId, provider, prompt, modelName, negativePrompt, artifactId, options } = body
  if (!workspaceId || !provider || !prompt?.trim()) {
    return NextResponse.json({ error: 'workspaceId, provider, and prompt are required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Verify artifact ownership if linked (does NOT yet require approval — that's the publish gate)
  if (artifactId) {
    const check = await sql`SELECT id FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!check.rows[0]) return NextResponse.json({ error: 'Artifact not found in this workspace' }, { status: 404 })
  }

  // 1. INSERT job row (status='pending')
  const jobId = newId()
  await sql`
    INSERT INTO creative_generation_jobs (
      id, workspace_id, artifact_id, provider, model_name,
      prompt_text, negative_prompt, status, cost_estimate, created_at
    ) VALUES (
      ${jobId}, ${workspaceId}, ${artifactId || null}, ${provider}, ${modelName || null},
      ${prompt.trim()}, ${negativePrompt?.trim() || null}, 'pending',
      ${COST_ESTIMATE[provider] || 0}, CURRENT_TIMESTAMP
    )
  `

  // 2. Atomic CAS lock: pending → running
  await sql`
    UPDATE creative_generation_jobs
    SET status = 'running', started_at = CURRENT_TIMESTAMP
    WHERE id = ${jobId} AND workspace_id = ${workspaceId} AND status = 'pending'
  `
  const lockRes = await sql`
    SELECT id, workspace_id, artifact_id, provider, model_name, prompt_text,
           negative_prompt, status, started_at
    FROM creative_generation_jobs WHERE id = ${jobId} LIMIT 1
  `
  const locked = lockRes.rows[0] as unknown as JobRow | undefined
  if (!locked || locked.status !== 'running') {
    return NextResponse.json(
      { error: 'Could not acquire job lock', currentStatus: locked?.status },
      { status: 409 },
    )
  }

  // Sprint 18K: inject workspace BYOK keys into the request-scoped
  // credential store so tool wrappers (openai, stability, runway, ...)
  // pick them up via getCredential() instead of process.env. We don't
  // mutate process.env (would race across tenants).
  let wsKeys: Record<string, string | undefined> = {}
  try {
    const wsRes = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ms = wsRes.rows[0]?.model_settings
    const parsed: Record<string, unknown> = typeof ms === 'string'
      ? JSON.parse(ms)
      : (ms as Record<string, unknown> || {})
    wsKeys = {
      OPENAI_API_KEY: parsed.openaiApiKey as string | undefined,
      STABILITY_API_KEY: parsed.stabilityApiKey as string | undefined,
      RUNWAY_API_KEY: parsed.runwayApiKey as string | undefined,
      ELEVENLABS_API_KEY: parsed.elevenLabsApiKey as string | undefined,
    }
  } catch { /* fall back to process.env */ }

  // 3. Provider dispatch — wrapped in try/catch so failures land safely
  const startedAt = Date.now()
  let dispatch: ProviderResult
  try {
    dispatch = await withCredentials(wsKeys, () => dispatchProvider(provider, prompt, options || {}, negativePrompt))
  } catch (err) {
    dispatch = {
      ok: false,
      assetType: 'image',
      costEstimate: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const durationMs = Date.now() - startedAt

  // 4. Failure path — log + flip to 'failed'
  if (!dispatch.ok || !dispatch.url) {
    await sql`
      UPDATE creative_generation_jobs
      SET status = 'failed',
          duration_ms = ${durationMs},
          error_message = ${(dispatch.error || 'Unknown provider error').slice(0, 1000)},
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId} AND workspace_id = ${workspaceId}
    `
    return NextResponse.json(
      {
        ok: false,
        jobId,
        status: 'failed',
        error: dispatch.error,
        durationMs,
        usedMock: !!dispatch.usedMock,
      },
      { status: 502 },
    )
  }

  // 5. Success — INSERT media_assets row + link result_asset_id
  const assetId = newId()
  try {
    await sql`
      INSERT INTO media_assets (
        id, workspace_id, parent_asset_id, filename, url, asset_type,
        mime_type, file_size, dimensions, duration_seconds,
        source_provider, metadata_json, status, created_at
      ) VALUES (
        ${assetId}, ${workspaceId}, NULL,
        ${dispatch.filename || `${provider}-${jobId.slice(-8)}`},
        ${dispatch.url}, ${dispatch.assetType},
        ${dispatch.mimeType || null}, ${dispatch.fileSize || null},
        ${dispatch.dimensions || null}, ${dispatch.durationSeconds || null},
        ${provider}, ${JSON.stringify(dispatch.metadata || {}).slice(0, 8000)},
        'ready', CURRENT_TIMESTAMP
      )
    `
    await sql`
      UPDATE creative_generation_jobs
      SET status = 'completed',
          result_asset_id = ${assetId},
          duration_ms = ${durationMs},
          cost_estimate = ${dispatch.costEstimate},
          completed_at = CURRENT_TIMESTAMP,
          error_message = NULL
      WHERE id = ${jobId} AND workspace_id = ${workspaceId}
    `
  } catch (err) {
    // INSERT or final UPDATE failed — rollback the job to 'failed'
    const msg = err instanceof Error ? err.message : String(err)
    try {
      await sql`
        UPDATE creative_generation_jobs
        SET status = 'failed', error_message = ${msg.slice(0, 1000)},
            duration_ms = ${durationMs}, completed_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId} AND workspace_id = ${workspaceId}
      `
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: false, jobId, error: msg }, { status: 500 })
  }

  // Best-effort fire-and-forget workflow trigger (e.g. for "asset_generated" automations)
  after(async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
      if (baseUrl) {
        await fetch(`${baseUrl}/api/workflows/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.ADMIN_SECRET ? { 'x-internal-secret': process.env.ADMIN_SECRET } : {}),
          },
          body: JSON.stringify({
            workspaceId, triggerType: 'creative_generated',
            data: { jobId, assetId, provider, assetType: dispatch.assetType },
          }),
        }).catch(() => undefined)
      }
    } catch { /* best-effort */ }
  })

  return NextResponse.json({
    ok: true,
    jobId,
    status: 'completed',
    assetId,
    asset: {
      id: assetId,
      url: dispatch.url,
      filename: dispatch.filename || null,
      asset_type: dispatch.assetType,
      mime_type: dispatch.mimeType || null,
      dimensions: dispatch.dimensions || null,
      duration_seconds: dispatch.durationSeconds || null,
    },
    durationMs,
    costEstimate: dispatch.costEstimate,
    usedMock: !!dispatch.usedMock,
  })
}

// ─── Provider dispatch (real if key present, mock fallback otherwise) ─────

async function dispatchProvider(
  provider: ProviderId,
  prompt: string,
  options: Record<string, unknown>,
  _negativePrompt?: string,
): Promise<ProviderResult> {
  if (provider === 'openai_dalle') {
    if (!process.env.OPENAI_API_KEY) return mockImageResult(provider, prompt)
    const opts = options as { size?: 'square' | 'landscape' | 'portrait' | string }
    const sizeMap: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
      square: '1024x1024',
      landscape: '1792x1024',
      portrait: '1024x1792',
    }
    const result = await openaiGenerateImage(prompt, {
      size: sizeMap[opts.size as string] || '1024x1024',
      quality: 'standard',
    })
    if (!result?.url) return { ok: false, assetType: 'image', costEstimate: 0, error: 'OpenAI returned no URL' }
    const dims = (sizeMap[opts.size as string] || '1024x1024')
    return {
      ok: true,
      url: result.url,
      filename: `dalle-${Date.now().toString(36)}.png`,
      mimeType: 'image/png',
      dimensions: dims,
      assetType: 'image',
      costEstimate: COST_ESTIMATE.openai_dalle,
      metadata: { revisedPrompt: result.revisedPrompt },
    }
  }

  if (provider === 'runway_gen3') {
    if (!process.env.RUNWAY_API_KEY) return mockVideoResult(provider, prompt)
    const opts = options as { aspectRatio?: string; durationSeconds?: 5 | 10 }
    // Runway expects `ratio` (specific pixel pairs) + `duration` (5|10).
    // Map our friendly aspectRatio strings to Runway's pixel format.
    const ratioMap: Record<string, '1280:768' | '768:1280' | '960:960'> = {
      '16:9': '1280:768',
      '9:16': '768:1280',
      '1:1':  '960:960',
    }
    const ratio = ratioMap[opts.aspectRatio as string] || '1280:768'
    const duration: 5 | 10 = opts.durationSeconds === 10 ? 10 : 5
    const task = await runwayGenerateVideo(prompt, { ratio, duration })
    if (!task?.id) return { ok: false, assetType: 'video', costEstimate: 0, error: 'Runway task creation failed' }

    // Poll until ready (max ~5 min, every 4s) — kept tight to respect maxDuration
    const deadline = Date.now() + 270_000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 4_000))
      const status = await getRunwayTaskStatus(task.id)
      if (!status) continue
      if (status.status === 'SUCCEEDED' && status.output?.[0]) {
        return {
          ok: true,
          url: status.output[0],
          filename: `runway-${Date.now().toString(36)}.mp4`,
          mimeType: 'video/mp4',
          durationSeconds: duration,
          assetType: 'video',
          costEstimate: COST_ESTIMATE.runway_gen3,
          metadata: { taskId: task.id },
        }
      }
      if (status.status === 'FAILED') {
        return { ok: false, assetType: 'video', costEstimate: 0, error: status.failure || 'Runway generation failed' }
      }
    }
    return { ok: false, assetType: 'video', costEstimate: 0, error: 'Runway timeout (270s)' }
  }

  if (provider === 'elevenlabs') {
    if (!process.env.ELEVENLABS_API_KEY) return mockAudioResult(provider, prompt)
    const opts = options as { voiceId?: string; modelId?: string }
    const ttsResult = await elevenlabsTts(prompt, {
      voiceId: opts.voiceId || 'EXAVITQu4vr4xnSDxMaL',
      modelId: opts.modelId || 'eleven_multilingual_v2',
    })
    if (!ttsResult?.audioBase64) {
      return { ok: false, assetType: 'audio', costEstimate: 0, error: 'ElevenLabs returned no audio' }
    }
    // ElevenLabs returns base64 audio; in real production we'd upload it to
    // Cloudinary first. For now we wrap it as a data URL — the client can
    // re-upload via /presign if needed for a permanent URL.
    const dataUrl = `data:audio/mpeg;base64,${ttsResult.audioBase64}`
    return {
      ok: true,
      url: dataUrl,
      filename: `voiceover-${Date.now().toString(36)}.mp3`,
      mimeType: 'audio/mpeg',
      durationSeconds: undefined,
      assetType: 'audio',
      costEstimate: COST_ESTIMATE.elevenlabs * Math.max(1, Math.ceil(prompt.length / 1000)),
      metadata: { voiceId: opts.voiceId || 'EXAVITQu4vr4xnSDxMaL' },
    }
  }

  if (provider === 'stability') {
    // Real Stability v2beta SD3.5 Core. Wrapper resolves credentials via
    // getCredential('STABILITY_API_KEY') — that checks the request-scoped
    // store (workspace BYOK injected via withCredentials) before falling
    // back to process.env. If no key anywhere, fall through to mock so
    // the dev flow still works.
    const opts = options as { aspectRatio?: string; outputFormat?: 'png' | 'jpeg' | 'webp'; seed?: number }
    const aspectMap: Record<string, '1:1' | '16:9' | '9:16'> = {
      square: '1:1',
      landscape: '16:9',
      portrait: '9:16',
    }
    const aspect = (aspectMap[opts.aspectRatio as string] || (opts.aspectRatio as '1:1' | '16:9' | '9:16') || '1:1')
    const result = await generateStabilityImage(prompt, {
      aspectRatio: aspect,
      negativePrompt: _negativePrompt,
      outputFormat: opts.outputFormat || 'png',
      seed: typeof opts.seed === 'number' ? opts.seed : undefined,
    })
    if (!result?.url) {
      // Distinguish "no key configured" from real provider failure: wrapper
      // returns null when STABILITY_API_KEY is absent. Fall back to mock
      // for a smooth zero-config dev experience.
      if (!process.env.STABILITY_API_KEY) return mockImageResult(provider, prompt)
      return { ok: false, assetType: 'image', costEstimate: 0, error: 'Stability returned no image (check key, content filter, or quota)' }
    }
    return {
      ok: true,
      url: result.url,
      filename: `stability-${Date.now().toString(36)}.${(result.mimeType.split('/')[1] || 'png')}`,
      mimeType: result.mimeType,
      dimensions: aspect === '1:1' ? '1024x1024' : (aspect === '16:9' ? '1344x768' : '768x1344'),
      assetType: 'image',
      costEstimate: COST_ESTIMATE.stability,
      metadata: { aspect, finishReason: result.finishReason, seed: result.seed },
    }
  }

  return { ok: false, assetType: 'image', costEstimate: 0, error: `Unknown provider '${provider}'` }
}

// ─── Mock fallbacks (preserves end-to-end testing without provider keys) ──

function mockImageResult(provider: string, prompt: string): ProviderResult {
  // SVG-encoded placeholder so the asset URL renders something visible in the UI
  const safePrompt = prompt.slice(0, 60).replace(/[<>&]/g, ' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#1f2430"/><text x="50%" y="48%" font-family="sans-serif" font-size="28" fill="#9ca3af" text-anchor="middle">[mock ${provider}]</text><text x="50%" y="52%" font-family="sans-serif" font-size="18" fill="#6b7280" text-anchor="middle">${safePrompt}</text></svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return {
    ok: true,
    url: dataUrl,
    filename: `mock-${provider}-${Date.now().toString(36)}.svg`,
    mimeType: 'image/svg+xml',
    dimensions: '1024x1024',
    fileSize: svg.length,
    assetType: 'image',
    costEstimate: 0,
    usedMock: true,
    metadata: { note: 'Mock — configure provider key to generate real media.' },
  }
}

function mockVideoResult(provider: string, prompt: string): ProviderResult {
  return {
    ok: true,
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    filename: `mock-${provider}-${Date.now().toString(36)}.mp4`,
    mimeType: 'video/mp4',
    durationSeconds: 5,
    dimensions: '1280x720',
    assetType: 'video',
    costEstimate: 0,
    usedMock: true,
    metadata: { note: 'Mock — using public sample. Configure RUNWAY_API_KEY for real generation.', prompt: prompt.slice(0, 120) },
  }
}

function mockAudioResult(provider: string, prompt: string): ProviderResult {
  // Empty MP3 frame header — renders as a 0-second audio element
  const emptyMp3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA'
  return {
    ok: true,
    url: emptyMp3,
    filename: `mock-${provider}-${Date.now().toString(36)}.mp3`,
    mimeType: 'audio/mpeg',
    assetType: 'audio',
    costEstimate: 0,
    usedMock: true,
    metadata: { note: 'Mock — configure ELEVENLABS_API_KEY for real voice generation.', prompt: prompt.slice(0, 120) },
  }
}
