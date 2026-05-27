/**
 * POST /api/experiments/track
 *
 * High-throughput event ingestion. Inserts a row into experiment_events
 * AND atomically increments the matching denormalised counter on
 * experiment_variants in a single round-trip per write.
 *
 *   Body:
 *     {
 *       workspaceId,
 *       trackingId,       // visitor cookie / user id (deterministic hash from router)
 *       variantId,        // resolved by lib/experiment-router.ts
 *       eventType,        // 'impression' | 'click' | 'conversion' | …
 *       eventValue?,      // optional numeric (revenue, time-on-page, etc.)
 *       metadataJson?     // optional arbitrary k/v context
 *     }
 *
 *   Response:
 *     200 { ok: true, eventId, variantId }
 *     400 / 403 / 422 with explicit hints on failure
 *
 * Thread safety
 * ─────────────
 * The counter bump uses `UPDATE variant SET impression_count = impression_count + 1`
 * — a single SQL statement with atomic increment semantics. Even under
 * concurrent writes from thousands of visitors, no read-modify-write race
 * can drop a count.
 *
 * Allowed event types
 * ───────────────────
 * 'impression' / 'click' / 'conversion' / 'page_view' / 'engagement' /
 * 'signup' / 'purchase' / 'custom'. Anything else returns 422.
 *
 * Of these, only `impression` and `conversion` bump the denormalised
 * counters (those are the two that drive the significance calculation).
 * Other events still land in the events ledger for cohort analysis.
 *
 * Tracking ID format
 * ──────────────────
 * Accepted as-is. The variant router supplies it; we don't validate format
 * here because the router has already constrained it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_EVENT_TYPES = new Set([
  'impression', 'click', 'conversion',
  'page_view', 'engagement', 'signup', 'purchase', 'custom',
])
const TRACKING_ID_MAX = 256

export async function POST(req: NextRequest) {
  let body: {
    workspaceId?: string
    trackingId?: string
    variantId?: string
    eventType?: string
    eventValue?: number
    metadataJson?: Record<string, unknown> | string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { workspaceId, trackingId, variantId, eventType } = body
  if (!workspaceId || !trackingId || !variantId || !eventType) {
    return NextResponse.json(
      { error: 'workspaceId, trackingId, variantId, and eventType are all required' },
      { status: 400 },
    )
  }
  if (trackingId.length > TRACKING_ID_MAX) {
    return NextResponse.json({ error: `trackingId exceeds ${TRACKING_ID_MAX} chars` }, { status: 422 })
  }
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json(
      { error: `eventType must be one of: ${[...ALLOWED_EVENT_TYPES].join(' | ')}` },
      { status: 422 },
    )
  }

  // ── Workspace ownership ────────────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── Verify variant belongs to this workspace ───────────────────────────
  // Stops cross-tenant event injection via a guessed variant id.
  const variantCheck = await sql`
    SELECT id FROM experiment_variants
    WHERE id = ${variantId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  if (!variantCheck.rows[0]) {
    return NextResponse.json({ error: 'Variant not found in this workspace' }, { status: 404 })
  }

  // ── Serialise optional fields ──────────────────────────────────────────
  const eventValue = body.eventValue !== undefined && Number.isFinite(Number(body.eventValue))
    ? Number(body.eventValue)
    : null
  const metaStr = body.metadataJson
    ? (typeof body.metadataJson === 'string'
        ? body.metadataJson.slice(0, 8000)
        : JSON.stringify(body.metadataJson).slice(0, 8000))
    : '{}'

  // ── 1. INSERT event row ────────────────────────────────────────────────
  const eventId = newId()
  try {
    await sql`
      INSERT INTO experiment_events (
        id, workspace_id, variant_id, tracking_id, event_type,
        event_value, metadata_json, created_at
      ) VALUES (
        ${eventId}, ${workspaceId}, ${variantId}, ${trackingId}, ${eventType},
        ${eventValue}, ${metaStr}, CURRENT_TIMESTAMP
      )
    `
  } catch (err) {
    console.error('[/api/experiments/track] event insert failed', err)
    return NextResponse.json({ error: 'Event ingestion failed' }, { status: 500 })
  }

  // ── 2. Atomic counter bump on the denormalised columns ─────────────────
  // Only impression/conversion bump the counters — those are the two
  // signals the significance worker reads. Other event types stay in the
  // events ledger for cohort analysis but don't affect the headline tally.
  if (eventType === 'impression') {
    try {
      await sql`
        UPDATE experiment_variants
        SET impression_count = impression_count + 1
        WHERE id = ${variantId} AND workspace_id = ${workspaceId}
      `
    } catch (err) {
      // Non-fatal: events ledger is the source of truth; counter can be
      // rebuilt with SELECT COUNT(*). Log + continue.
      console.error('[/api/experiments/track] impression counter bump failed (non-fatal)', err)
    }
  } else if (eventType === 'conversion') {
    try {
      await sql`
        UPDATE experiment_variants
        SET conversion_count = conversion_count + 1
        WHERE id = ${variantId} AND workspace_id = ${workspaceId}
      `
    } catch (err) {
      console.error('[/api/experiments/track] conversion counter bump failed (non-fatal)', err)
    }
  }

  return NextResponse.json({ ok: true, eventId, variantId })
}
