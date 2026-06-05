/**
 * GET /api/agents/video/models — Sprint 12E
 *
 * Per-workspace availability status for every video generation provider
 * the platform supports. The /dashboard/video-gen page calls this on
 * mount to render the model picker with real "✓ Ready / ⚠ Needs key /
 * 🔒 Provider beta" badges instead of guessing.
 *
 * Response shape:
 *   {
 *     models: [
 *       { id, name, status: 'ready'|'needs_key'|'beta_access', setupHint, byokFields }
 *     ],
 *     defaultModel: <id of first 'ready' model, else 'runway'>
 *   }
 *
 * status meanings:
 *   - 'ready'        — workspace BYOK has every required key set. The
 *                      model will dispatch and (probably) succeed. We
 *                      don't ping the provider here — that'd add 5+
 *                      external calls per page mount.
 *   - 'needs_key'    — at least one required BYOK field is empty. UI
 *                      shows "Add key →" linking to the BYOK section.
 *   - 'beta_access'  — provider is marked invitation-only. Key MAY be
 *                      set but UI should warn that the request may 403
 *                      until the provider grants access (Sora/Pika).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface ModelSpec {
  id: string
  name: string
  whatFor: string
  /** BYOK fields that must all be non-empty for status='ready'. */
  byokFields: string[]
  /** Provider-side access caveats (e.g. Sora capability flag, Pika
   *  invitation-only). When true, status='beta_access' even if all
   *  byokFields are set. The UI uses this to set a softer expectation. */
  betaAccess?: boolean
  /** Where to send the user when they click "Add key →". Anchor inside
   *  /dashboard/settings → API Keys. */
  byokAnchor: string
}

const MODELS: ModelSpec[] = [
  {
    id: 'runway',
    name: 'Runway Gen-3',
    whatFor: 'Real Runway Gen-3 turbo. Highest general-purpose quality.',
    byokFields: ['runwayApiKey'],
    byokAnchor: '#uc-video-gen',
  },
  {
    id: 'kling',
    name: 'Kling 2.0',
    whatFor: 'Real Kling 2.0. Strong on character consistency.',
    byokFields: ['klingAccessKey', 'klingSecretKey'],
    byokAnchor: '#uc-video-gen',
  },
  {
    id: 'luma',
    name: 'Luma Dream Machine',
    whatFor: 'Real Luma. Photorealistic motion + cinematic shots.',
    byokFields: ['lumaApiKey'],
    byokAnchor: '#uc-video-gen',
  },
  {
    id: 'sora',
    name: 'OpenAI Sora',
    whatFor: 'Sora 2 via your OpenAI key. Requires videos.generate capability — apply at platform.openai.com.',
    byokFields: ['openaiApiKey'],
    betaAccess: true,
    byokAnchor: '#uc-ai-text',
  },
  {
    id: 'pika',
    name: 'Pika Labs',
    whatFor: 'Stylised / cartoon motion. Invitation-only API access.',
    byokFields: ['pikaApiKey'],
    betaAccess: true,
    byokAnchor: '#uc-video-gen',
  },
  {
    id: 'heygen',
    name: 'HeyGen (avatar)',
    whatFor: 'Avatar talking-head videos. For explainers + ads with a face.',
    byokFields: ['heygenApiKey'],
    byokAnchor: '#uc-video-gen',
  },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

  const models = MODELS.map(m => {
    const allFieldsFilled = m.byokFields.every(f => !!(settings[f] || '').trim())
    const status: 'ready' | 'needs_key' | 'beta_access' =
      !allFieldsFilled ? 'needs_key'
      : m.betaAccess ? 'beta_access'
      : 'ready'
    const missingFields = m.byokFields.filter(f => !(settings[f] || '').trim())
    const setupHint =
      status === 'needs_key'
        ? `Add ${missingFields.join(' + ')} in Settings → API Keys.`
        : status === 'beta_access'
          ? 'Key set — but this provider gates the videos API behind invitation-only access. The first request will tell you if you\'re approved.'
          : 'Ready to use.'
    return {
      id: m.id,
      name: m.name,
      whatFor: m.whatFor,
      status,
      setupHint,
      byokFields: m.byokFields,
      byokAnchor: m.byokAnchor,
      missingFields,
    }
  })

  // Pick a sensible default: first 'ready' model, else runway (lets the
  // UI render even on a fresh workspace where nothing is configured).
  const defaultModel = models.find(m => m.status === 'ready')?.id || 'runway'

  return NextResponse.json({
    models,
    defaultModel,
    summary: {
      ready: models.filter(m => m.status === 'ready').length,
      needsKey: models.filter(m => m.status === 'needs_key').length,
      betaAccess: models.filter(m => m.status === 'beta_access').length,
    },
  })
}
