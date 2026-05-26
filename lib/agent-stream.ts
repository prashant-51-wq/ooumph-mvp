/**
 * lib/agent-stream.ts
 *
 * The Agent Console streaming primitive.
 *
 * Solves the "Invisible Agent" UX problem: turns a 5-30s blocking AI call
 * into a live progressive feed of events the user can watch in real time.
 *
 * ─── Wire protocol ──────────────────────────────────────────────────────
 * Server emits Server-Sent-Events-formatted lines over a ReadableStream:
 *
 *   data: {"t":"agent_start","agent":"research","label":"…","runId":"…","ts":…}\n\n
 *   data: {"t":"token","text":"Your"}\n\n
 *   data: {"t":"token","text":" brand"}\n\n
 *   data: {"t":"agent_done","agent":"research","cost":0.008,"durationMs":4230}\n\n
 *   data: {"t":"artifact_created","artifactId":"…","type":"strategy","title":"…"}\n\n
 *   data: {"t":"approval_pending","approvalId":"…","artifactId":"…"}\n\n
 *   data: {"t":"done"}\n\n
 *
 * Compatible with both EventSource and plain `fetch().body.getReader()` clients.
 *
 * ─── Usage in an API route ──────────────────────────────────────────────
 *
 *   const handle = await createAgentEventStream({
 *     workspaceId,
 *     agentName: 'cmo',
 *     inputJson: { message },
 *   })
 *
 *   // Kick off work in the background — DON'T await here, return the
 *   // Response first so the client starts reading immediately.
 *   void (async () => {
 *     try {
 *       await handle.send({ t: 'agent_start', agent: 'cmo', label: 'Planning…' })
 *       // … do work, emit events …
 *       await handle.send({ t: 'token', text: '...' })
 *       await handle.close({ output: { … }, cost: 0.012 })
 *     } catch (err) {
 *       await handle.close({ error: err as Error })
 *     }
 *   })()
 *
 *   return new Response(handle.stream, {
 *     headers: {
 *       'Content-Type': 'text/event-stream',
 *       'Cache-Control': 'no-cache, no-transform',
 *       'Connection': 'keep-alive',
 *       'X-Accel-Buffering': 'no',  // disable proxy buffering on Nginx
 *     },
 *   })
 *
 * ─── Safety invariants ──────────────────────────────────────────────────
 *   1. If the client disconnects, work continues. We swallow enqueue errors
 *      and keep persisting events to the DB. The artifact / approval still
 *      lands; the user just doesn't see the live feed.
 *   2. The helper NEVER triggers third-party side-effects. It only emits
 *      events and records audit trail. Callers are responsible for the
 *      "create artifact → create approval → wait for human" gating.
 *   3. Token-delta events are not persisted to `agent_run_events` (too
 *      noisy — a single Claude response can produce 1000+ tokens). Only
 *      lifecycle events are recorded.
 */

import { sql, newId } from '@/lib/db'

// ─── Event taxonomy (discriminated union for type safety at call sites) ────

export type AgentEvent =
  /** A sub-agent has begun work. */
  | { t: 'agent_start'; agent: string; label?: string; runId?: string; ts?: number }

  /** A sub-agent reports a status update (non-token). */
  | { t: 'agent_log'; agent?: string; level?: 'info' | 'warn' | 'error'; msg: string; runId?: string; ts?: number }

  /** A sub-agent finished successfully. */
  | { t: 'agent_done'; agent: string; cost?: number; durationMs?: number; tokensIn?: number; tokensOut?: number; runId?: string; ts?: number }

  /** A sub-agent failed (non-fatal for the parent run). */
  | { t: 'agent_error'; agent: string; msg: string; runId?: string; ts?: number }

  /** A token delta from a streaming Claude/OpenAI response. NOT persisted. */
  | { t: 'token'; text: string; agent?: string; runId?: string; ts?: number }

  /** A new artifact was created — clients can fetch it for preview. */
  | { t: 'artifact_created'; artifactId: string; type: string; title?: string; runId?: string; ts?: number }

  /** An approval is waiting on the user — clients should pop the modal. */
  | { t: 'approval_pending'; approvalId: string; artifactId: string; publishDestination?: string; runId?: string; ts?: number }

  /** Generic progress beacon, useful for percentage UI. */
  | { t: 'progress'; step?: number; total?: number; msg?: string; runId?: string; ts?: number }

  /** The orchestrator finished cleanly. Stream closes after this.
   *  `output` carries any final structured payload (e.g. a CMO proposal
   *  for chat, or { artifactId, approvalId } for execute). */
  | { t: 'done'; output?: unknown; cost?: number; runId?: string; ts?: number }

  /** Fatal error on the parent run. Stream closes after this. */
  | { t: 'error'; msg: string; runId?: string; ts?: number }

// Event types that are too high-volume to persist (e.g. one row per token would
// flood the DB during a typical 1000-token Claude response).
const TRANSIENT_EVENT_TYPES = new Set<AgentEvent['t']>(['token', 'progress'])

// ─── Public API ────────────────────────────────────────────────────────────

export interface CreateStreamOptions {
  workspaceId: string
  /** Slug of the orchestrator agent (e.g. 'cmo', 'strategy'). */
  agentName: string
  /** If this run is itself a sub-agent, the parent's runId. */
  parentRunId?: string
  /** Input snapshot — saved as agent_runs.input_json for audit. */
  inputJson?: unknown
}

export interface AgentStreamHandle {
  /** The ReadableStream to hand back as a Response body. */
  stream: ReadableStream<Uint8Array>
  /** The orchestrator run's id — also auto-stamped on every event. */
  runId: string
  /** Push an event to the wire + (for lifecycle events) the DB audit trail. */
  send: (event: AgentEvent) => Promise<void>
  /**
   * Finalize the run.
   *   close({ output, cost }) → success: writes done event + completes agent_runs row.
   *   close({ error })        → failure: writes error event + marks agent_runs.failed.
   *   close()                 → success with no output.
   */
  close: (final?: { error?: Error; output?: unknown; cost?: number }) => Promise<void>
}

const ENCODER = new TextEncoder()

export async function createAgentEventStream(opts: CreateStreamOptions): Promise<AgentStreamHandle> {
  const runId = newId()
  const startedAt = new Date().toISOString()

  // Create the parent agent_runs row up-front so other queries can reference it.
  // We do NOT block stream creation on this — but it's so cheap (single INSERT)
  // that awaiting is fine and gives us a sane ordering guarantee.
  try {
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status, input_json, parent_run_id, created_at)
      VALUES (
        ${runId},
        ${opts.workspaceId},
        ${opts.agentName},
        ${'running'},
        ${opts.inputJson ? JSON.stringify(opts.inputJson) : null},
        ${opts.parentRunId || null},
        ${startedAt}
      )
    `
  } catch (err) {
    // Don't fail stream creation if the audit row insert fails — log and continue.
    // Worst case the run isn't audited; the user still gets their stream.
    console.error('[agent-stream] failed to insert agent_runs row:', err)
  }

  // Track liveness of the client connection.
  // When the client disconnects (closes the tab, navigates away), enqueue
  // throws; we set this flag and stop attempting to write, but keep persisting.
  let clientConnected = true

  // The controller is captured during the start() callback (synchronous in
  // practice, but we resolve through a Promise to keep type-safety honest).
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  let resolveController: ((c: ReadableStreamDefaultController<Uint8Array>) => void) | null = null
  const controllerReady = new Promise<ReadableStreamDefaultController<Uint8Array>>(r => {
    resolveController = r
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      resolveController?.(controller)
    },
    cancel() {
      // Client disconnected (tab closed, navigation away, etc.)
      clientConnected = false
    },
  })

  // Wait for the controller to be available before returning. In practice
  // start() runs synchronously, so this resolves immediately.
  await controllerReady

  // ─── send: write to wire + audit trail ─────────────────────────────────
  const send = async (event: AgentEvent): Promise<void> => {
    // Auto-stamp every event with timestamp + runId so clients can correlate.
    const enriched = { ...event, ts: event.ts ?? Date.now(), runId } as AgentEvent

    // 1. Write to wire (best-effort: ignore if client gone)
    if (clientConnected && controllerRef) {
      try {
        // SSE format: each event is one or more "data:" lines terminated by "\n\n"
        const line = `data: ${JSON.stringify(enriched)}\n\n`
        controllerRef.enqueue(ENCODER.encode(line))
      } catch {
        // Most likely TypeError: Invalid state — controller closed because
        // the client disconnected. Switch off wire writes, keep persisting.
        clientConnected = false
      }
    }

    // 2. Persist lifecycle events to DB for audit + replay
    if (!TRANSIENT_EVENT_TYPES.has(event.t)) {
      try {
        await sql`
          INSERT INTO agent_run_events (id, agent_run_id, workspace_id, event_type, payload, created_at)
          VALUES (
            ${newId()},
            ${runId},
            ${opts.workspaceId},
            ${event.t},
            ${JSON.stringify(enriched)},
            ${new Date(enriched.ts!).toISOString()}
          )
        `
      } catch (err) {
        // Audit failures must not crash the stream. Log and continue.
        console.error('[agent-stream] DB persist failed:', err)
      }
    }
  }

  // ─── close: write terminal event + finalize run ────────────────────────
  const close = async (final?: { error?: Error; output?: unknown; cost?: number }): Promise<void> => {
    const completedAt = new Date().toISOString()

    if (final?.error) {
      // Emit error event before tearing down so the client sees why.
      await send({ t: 'error', msg: final.error.message })
      try {
        await sql`
          UPDATE agent_runs
          SET status = ${'failed'},
              error_message = ${final.error.message},
              completed_at = ${completedAt}
          WHERE id = ${runId}
        `
      } catch (err) {
        console.error('[agent-stream] failed to update agent_runs on error:', err)
      }
    } else {
      // Successful completion — carry final output + cost on the wire so the
      // client doesn't need a separate fetch to pick up the result.
      await send({ t: 'done', output: final?.output, cost: final?.cost })
      try {
        await sql`
          UPDATE agent_runs
          SET status = ${'completed'},
              output_json = ${final?.output ? JSON.stringify(final.output) : null},
              cost_estimate = ${final?.cost ?? null},
              completed_at = ${completedAt}
          WHERE id = ${runId}
        `
      } catch (err) {
        console.error('[agent-stream] failed to update agent_runs on completion:', err)
      }
    }

    // Tear down the stream. Guard against double-close.
    if (clientConnected && controllerRef) {
      try {
        controllerRef.close()
      } catch {
        // Already closed — ignore.
      }
    }
  }

  return { stream, runId, send, close }
}

// ─── Sub-agent helper ─────────────────────────────────────────────────────
// Convenience for an orchestrator (e.g. CMO) to track and audit a sub-agent
// call without spawning a full sub-stream. The orchestrator continues to use
// its own stream handle for client-facing events.

export interface SubAgentRun {
  runId: string
  /** Mark sub-agent done. Returns durationMs for convenience. */
  complete: (output?: unknown, cost?: number) => Promise<{ durationMs: number }>
  /** Mark sub-agent failed. */
  fail: (error: Error) => Promise<{ durationMs: number }>
}

export async function recordSubAgentRun(opts: {
  workspaceId: string
  agentName: string
  parentRunId: string
  inputJson?: unknown
}): Promise<SubAgentRun> {
  const runId = newId()
  const startedAt = Date.now()
  const startedAtIso = new Date(startedAt).toISOString()

  try {
    await sql`
      INSERT INTO agent_runs (id, workspace_id, agent_name, status, input_json, parent_run_id, created_at)
      VALUES (
        ${runId},
        ${opts.workspaceId},
        ${opts.agentName},
        ${'running'},
        ${opts.inputJson ? JSON.stringify(opts.inputJson) : null},
        ${opts.parentRunId},
        ${startedAtIso}
      )
    `
  } catch (err) {
    console.error('[agent-stream] recordSubAgentRun INSERT failed:', err)
  }

  return {
    runId,
    complete: async (output?: unknown, cost?: number) => {
      const completedAt = Date.now()
      const durationMs = completedAt - startedAt
      try {
        await sql`
          UPDATE agent_runs
          SET status = ${'completed'},
              output_json = ${output ? JSON.stringify(output) : null},
              cost_estimate = ${cost ?? null},
              completed_at = ${new Date(completedAt).toISOString()}
          WHERE id = ${runId}
        `
      } catch (err) {
        console.error('[agent-stream] recordSubAgentRun.complete UPDATE failed:', err)
      }
      return { durationMs }
    },
    fail: async (error: Error) => {
      const completedAt = Date.now()
      const durationMs = completedAt - startedAt
      try {
        await sql`
          UPDATE agent_runs
          SET status = ${'failed'},
              error_message = ${error.message},
              completed_at = ${new Date(completedAt).toISOString()}
          WHERE id = ${runId}
        `
      } catch (err) {
        console.error('[agent-stream] recordSubAgentRun.fail UPDATE failed:', err)
      }
      return { durationMs }
    },
  }
}

// ─── Replay helper ────────────────────────────────────────────────────────
// Lets a future client (e.g. user reloads tab) re-fetch the event history
// of a run. Returns events ordered chronologically.

export async function getAgentRunHistory(runId: string): Promise<AgentEvent[]> {
  const res = await sql`
    SELECT payload
    FROM agent_run_events
    WHERE agent_run_id = ${runId}
    ORDER BY created_at ASC
  `
  const events: AgentEvent[] = []
  for (const row of res.rows as Array<{ payload: string }>) {
    try {
      events.push(JSON.parse(row.payload) as AgentEvent)
    } catch {
      // Skip malformed rows.
    }
  }
  return events
}

// ─── Response helper ──────────────────────────────────────────────────────
// One-liner for routes that just want to return the stream with the
// canonical SSE headers.

export function streamingResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable buffering on nginx/Vercel proxies so each chunk reaches the
      // client immediately rather than being held until the buffer fills.
      'X-Accel-Buffering': 'no',
    },
  })
}
