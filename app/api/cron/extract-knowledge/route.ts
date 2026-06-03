/**
 * Cron: /api/cron/extract-knowledge
 *
 * Sprint 6D — fixes the "5 documents uploaded / 0 knowledge nodes
 * extracted" mismatch the user saw in their walkthrough (Bug #8).
 *
 * For each document-shaped artifact (artifact.type = 'document' or
 * 'upload' or 'transcript') that has NO matching learning_notes row
 * yet, run Claude over the content_json and extract 3-5 atomic
 * knowledge notes. Persist each as a learning_notes row with
 *   source_type = artifact.type
 *   source_id   = artifact.id
 *   note        = extracted insight (1-3 sentences each)
 *   confidence  = 0.8 default (Claude doesn't self-score yet)
 *
 * The /dashboard/learning page (Sprint 6B) reads from learning_notes
 * via /api/learning GET — so once a node is written here, it shows up
 * in the Knowledge Base tab automatically, and the per-source
 * node_count on the Sources tab recomputes client-side.
 *
 * Batch limit: 10 documents per cron tick. Larger backlogs drain over
 * subsequent ticks. Prevents one cron run from blowing AI budget.
 *
 * Per-workspace pause respected: if the `intelligence-sup` agent (the
 * supervisor that owns knowledge extraction per lib/agents.ts) is
 * paused, that workspace's docs are skipped this tick.
 *
 * Auth: bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { isAgentActive } from '@/lib/agents'
import { runAgent } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_LIMIT = 10
const NOTES_PER_DOCUMENT = 5

const EXTRACTION_PROMPT = `You are an analyst extracting reusable brand-marketing knowledge from a source document.

Given the document below, identify ${NOTES_PER_DOCUMENT} atomic, actionable insights that future content creation can reference. Each insight should be one or two sentences. Focus on:
- Brand voice patterns
- Target audience characteristics
- Competitive positioning
- Performance benchmarks
- Strategic priorities

Respond ONLY with a JSON array of strings, no markdown wrapping. Example:
["Insight 1...", "Insight 2...", ...]

Document content:
---
`

interface ArtifactRow {
  id: string
  workspace_id: string
  type: string
  title: string | null
  content_json: string | Record<string, unknown> | null
  created_at: string
}

interface CronResult {
  artifactId: string
  workspaceId: string
  status: 'extracted' | 'skipped_paused' | 'skipped_already_done' | 'skipped_empty' | 'failed'
  noteCount?: number
  error?: string
}

function authCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/** Extract plain-text body from an artifact's content_json (which may be
 *  string, object, or wrapped). Returns null if nothing extractable. */
function extractText(content: string | Record<string, unknown> | null): string | null {
  if (!content) return null
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown
      return extractText(parsed as Record<string, unknown>)
    } catch {
      return content.trim() || null
    }
  }
  // Common shape: { text: "..." } or { body: "..." } or { content: "..." }
  const o = content as Record<string, unknown>
  for (const key of ['text', 'body', 'content', 'raw', 'transcript', 'description']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  // Fallback — stringify and truncate
  const s = JSON.stringify(o)
  return s.length > 50 ? s : null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  if (!authCron(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  // Find document-shape artifacts that don't yet have any learning_notes
  // pointing at them.
  const candidates = await sql`
    SELECT a.id, a.workspace_id, a.type, a.title, a.content_json, a.created_at
    FROM artifacts a
    WHERE a.type IN ('document', 'upload', 'transcript', 'ingest')
      AND NOT EXISTS (
        SELECT 1 FROM learning_notes ln WHERE ln.source_id = a.id LIMIT 1
      )
    ORDER BY a.created_at DESC LIMIT ${BATCH_LIMIT}
  `
  const docs = candidates.rows as unknown as ArtifactRow[]

  const results: CronResult[] = []

  // Per-workspace pause cache so we don't hit isAgentActive() per artifact
  // when several share a workspace.
  const pauseCache = new Map<string, boolean>()

  for (const doc of docs) {
    try {
      // Pause check (intelligence-sup owns knowledge work per
      // lib/agents.ts DEFAULT_AGENTS).
      let active = pauseCache.get(doc.workspace_id)
      if (active === undefined) {
        active = await isAgentActive(doc.workspace_id, 'intelligence-sup')
        pauseCache.set(doc.workspace_id, active)
      }
      if (!active) {
        results.push({ artifactId: doc.id, workspaceId: doc.workspace_id, status: 'skipped_paused' })
        continue
      }

      // Defensive: re-check this artifact wasn't extracted in a parallel
      // tick (race-safety for the rare double-fire).
      const already = await sql`
        SELECT 1 FROM learning_notes WHERE source_id = ${doc.id} LIMIT 1
      `
      if (already.rows[0]) {
        results.push({ artifactId: doc.id, workspaceId: doc.workspace_id, status: 'skipped_already_done' })
        continue
      }

      const text = extractText(doc.content_json)
      if (!text || text.length < 100) {
        // Mark as "processed" with zero notes so we don't keep retrying
        // empty docs every tick. Write a single placeholder note.
        await sql`
          INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
          VALUES (${newId()}, ${doc.workspace_id}, ${doc.type}, ${doc.id},
                  ${`Document "${doc.title || doc.id.slice(0,8)}" had no extractable text content.`},
                  0.1, ${new Date().toISOString()})
        `
        results.push({ artifactId: doc.id, workspaceId: doc.workspace_id, status: 'skipped_empty' })
        continue
      }

      // Truncate to ~8k chars to keep token cost predictable.
      const trimmed = text.slice(0, 8000)
      const fullPrompt = EXTRACTION_PROMPT + trimmed + '\n---'

      // runAgent in lib/claude.ts returns the PARSED JSON directly (it
      // unwraps ```json fences and JSON.parses for us). It throws if the
      // response isn't valid JSON. We declare the expected shape via the
      // generic. Failure falls through to the catch block below.
      let notes: string[] = []
      try {
        const parsed = await runAgent<unknown>(
          'You are a marketing analyst. Respond only with a valid JSON array of insight strings.',
          fullPrompt,
          doc.workspace_id as string,
        )
        if (Array.isArray(parsed)) {
          notes = (parsed as unknown[])
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .slice(0, NOTES_PER_DOCUMENT)
        }
      } catch (parseErr) {
        // runAgent threw because the model returned non-JSON. Skip this
        // doc with an error result so the next tick can re-try it later.
        results.push({
          artifactId: doc.id, workspaceId: doc.workspace_id,
          status: 'failed',
          error: `claude_returned_invalid_json: ${parseErr instanceof Error ? parseErr.message.slice(0, 150) : 'unknown'}`,
        })
        continue
      }

      if (notes.length === 0) {
        results.push({ artifactId: doc.id, workspaceId: doc.workspace_id, status: 'failed', error: 'no_insights_parsed' })
        continue
      }

      const now = new Date().toISOString()
      for (const note of notes) {
        await sql`
          INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
          VALUES (${newId()}, ${doc.workspace_id}, ${doc.type}, ${doc.id},
                  ${note.slice(0, 1000)}, 0.8, ${now})
        `
      }

      results.push({ artifactId: doc.id, workspaceId: doc.workspace_id, status: 'extracted', noteCount: notes.length })
    } catch (err) {
      results.push({
        artifactId: doc.id, workspaceId: doc.workspace_id,
        status: 'failed', error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    candidatesScanned: docs.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
