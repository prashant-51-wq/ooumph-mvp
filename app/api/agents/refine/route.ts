/**
 * /api/agents/refine
 *
 * On-the-spot iteration endpoint for the Review Required UI. Takes a
 * `pending` artifact + the human's feedback and asks Claude to revise the
 * content, streaming the revised text back token-by-token so the user
 * sees the artifact update live inside the preview window.
 *
 *   POST  Accept: text/event-stream
 *   body: { workspaceId, artifactId, feedback }
 *
 *   Stream:
 *     data: {"t":"agent_start","agent":"refine","label":"Revising based on your feedback…"}
 *     data: {"t":"token","text":"Your"}
 *     data: {"t":"token","text":" brand"}
 *     ...
 *     data: {"t":"agent_done","agent":"refine","durationMs":4230,"cost":0.006}
 *     data: {"t":"artifact_created","artifactId":"…","type":"…","title":"…(revised)"}
 *       ↑ same artifactId, just signalling the client to refetch
 *     data: {"t":"done","output":{"artifactId":"…","newContent":"…"}}
 *
 * ─── Safety invariant preserved ──────────────────────────────────────────
 *   Refinement DOES NOT advance the approval state. The artifact stays in
 *   `status='pending'` and its approval row stays `status='pending'`. Only
 *   the primary content text changes. The user must STILL click Approve
 *   in the modal/canvas to commit the publish-side action. This way the
 *   iteration loop is fully contained inside the human-governance gate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql } from '@/lib/db'
import { streamAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import {
  createAgentEventStream,
  streamingResponse,
} from '@/lib/agent-stream'

export const runtime = 'nodejs'
export const maxDuration = 300

const PRIMARY_TEXT_KEYS = ['copy', 'body', 'content', 'text', 'description', 'message', 'headline', 'positioning'] as const

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* ignore */ }
  }
  return {}
}

function extractPrimary(content: Record<string, unknown>): { key: string; text: string } {
  for (const k of PRIMARY_TEXT_KEYS) {
    if (typeof content[k] === 'string' && (content[k] as string).trim()) {
      return { key: k, text: content[k] as string }
    }
  }
  // Fall back to a stringified view (rare path)
  return { key: '__json__', text: JSON.stringify(content, null, 2) }
}

const REFINE_SYSTEM_PROMPT = `You are an expert editor refining marketing content based on a human reviewer's feedback.

CRITICAL RULES:
- Output ONLY the revised content. No preamble, no explanation, no markdown fences around the result.
- Preserve the original content's structure, voice, and length unless the feedback explicitly asks otherwise.
- Apply the feedback faithfully — if the user asks for a stronger CTA, deliver a stronger CTA; if they ask for shorter, shorten.
- Maintain factual accuracy. Never invent claims or numbers not in the original.
- If the original is structured (sections, lists), keep the same shape in your revision.`

function buildUserPrompt(originalContent: string, feedback: string, artifactType: string, brandContext: string): string {
  return `You are revising a ${artifactType.replace(/_/g, ' ')} artifact.

${brandContext ? `Brand context:\n${brandContext}\n\n` : ''}─── ORIGINAL CONTENT ─────────────
${originalContent}
─── HUMAN FEEDBACK ──────────────
${feedback}
─── END ─────────────────────────

Now output the revised content. Output ONLY the revised text, nothing else.`
}

interface RefineRequest {
  workspaceId: string
  artifactId: string
  feedback: string
}

export async function POST(req: NextRequest) {
  let body: RefineRequest
  try {
    body = (await req.json()) as RefineRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId, artifactId, feedback } = body

  if (!workspaceId || !artifactId || !feedback?.trim()) {
    return NextResponse.json({ error: 'workspaceId, artifactId, and feedback are all required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Load artifact + brand context up front so we know the request is valid
  const [artRes, brandRes] = await Promise.all([
    sql`SELECT id, type, title, content_json, status FROM artifacts WHERE id = ${artifactId} AND workspace_id = ${workspaceId} LIMIT 1`,
    sql`SELECT business_name, tone, target_audience, offer FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
  ])
  const artifact = artRes.rows[0] as {
    id?: string
    type?: string
    title?: string
    content_json?: string | Record<string, unknown>
    status?: string
  } | undefined

  if (!artifact?.id) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  }
  // Refinement only makes sense on pending or draft artifacts — once approved,
  // any change should go through a fresh approval cycle.
  if (artifact.status === 'approved' || artifact.status === 'rejected') {
    return NextResponse.json(
      { error: `Cannot refine ${artifact.status} artifacts — they're locked. Reject and regenerate instead.` },
      { status: 409 },
    )
  }

  const content = asObject(artifact.content_json)
  const { key: primaryKey, text: originalText } = extractPrimary(content)
  if (primaryKey === '__json__') {
    // Refining a non-text artifact (e.g. raw JSON) is out of scope for v1.
    return NextResponse.json(
      { error: 'This artifact has no primary text field to refine.' },
      { status: 422 },
    )
  }

  const brand = brandRes.rows[0] as Record<string, unknown> | undefined
  const brandContext = brand
    ? [
        brand.business_name && `Business: ${brand.business_name}`,
        brand.tone && `Tone: ${brand.tone}`,
        brand.target_audience && `Target audience: ${String(brand.target_audience).slice(0, 200)}`,
        brand.offer && `Offer: ${String(brand.offer).slice(0, 200)}`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  // Streaming path — we always stream here; refinement is the whole point.
  const handle = await createAgentEventStream({
    workspaceId,
    agentName: 'refine',
    inputJson: { artifactId, feedback: feedback.slice(0, 1000) },
  })

  const workPromise = (async () => {
    const startedAt = Date.now()
    try {
      await handle.send({
        t: 'agent_start',
        agent: 'refine',
        label: 'Revising based on your feedback…',
      })

      await handle.send({
        t: 'agent_log',
        agent: 'refine',
        level: 'info',
        msg: `Editing ${primaryKey} field of "${artifact.title || 'artifact'}" with ${feedback.split(/\s+/).length} words of feedback`,
      })

      // Stream Claude's revision. Tokens flow straight to the wire so the
      // preview window updates live as the new content is generated.
      let revisedText = ''
      await streamAgent(
        REFINE_SYSTEM_PROMPT,
        buildUserPrompt(originalText, feedback, artifact.type || 'content', brandContext),
        (delta) => {
          revisedText += delta
          void handle.send({ t: 'token', text: delta, agent: 'refine' })
        },
      )

      // Strip any accidental wrapping markers Claude may have added.
      // Multi-line `s` flag would be ideal here but the tsconfig targets
      // ES2017; using `[\s\S]` instead to match across newlines.
      const cleaned = revisedText
        .trim()
        .replace(/^```(?:\w+)?\n?/, '')
        .replace(/\n?```\s*$/, '')
        .replace(/^"([\s\S]+)"$/, '$1')
        .trim()

      // Persist the refined content. Merge back into content_json preserving
      // every metadata field (platform, type, etc.) — only the primary text
      // is replaced.
      const updatedContent = { ...content, [primaryKey]: cleaned }
      await sql`
        UPDATE artifacts
        SET content_json = ${JSON.stringify(updatedContent)}
        WHERE id = ${artifactId} AND workspace_id = ${workspaceId}
      `

      // Invalidate any cached Brand Voice Score on the linked approval row
      // (the next preview will trigger a fresh scoring call).
      try {
        await sql`
          UPDATE approvals
          SET brand_voice_score = NULL, brand_voice_reasoning = NULL
          WHERE artifact_id = ${artifactId} AND status = 'pending'
        `
      } catch { /* column may not exist on legacy installs — ignore */ }

      await handle.send({
        t: 'agent_done',
        agent: 'refine',
        durationMs: Date.now() - startedAt,
        cost: Math.max(0.0015, cleaned.length * 0.0000015),
      })

      // Signal to the client that the underlying artifact's content has
      // changed. The client uses this to invalidate any cached preview.
      await handle.send({
        t: 'artifact_created',
        artifactId,
        type: artifact.type || 'unknown',
        title: artifact.title || 'Refined artifact',
      })

      await handle.close({
        output: {
          artifactId,
          primaryKey,
          newContent: cleaned,
          oldLength: originalText.length,
          newLength: cleaned.length,
        },
        cost: Math.max(0.0015, cleaned.length * 0.0000015),
      })
    } catch (err) {
      console.error('[/api/agents/refine] failed:', err)
      try {
        await handle.send({
          t: 'agent_error',
          agent: 'refine',
          msg: err instanceof Error ? err.message : String(err),
        })
        await handle.close({ error: err instanceof Error ? err : new Error(String(err)) })
      } catch { /* handle may already be closed */ }
    }
  })()

  // Vercel lifetime guarantee — refinement always completes even if the user
  // closes the tab mid-stream. The artifact lands in DB regardless.
  after(async () => {
    try { await workPromise } catch (err) { console.error('[refine after()]', err) }
  })

  return streamingResponse(handle.stream)
}
