/**
 * lib/use-agent-stream.ts
 *
 * Client-side React hook for consuming the SSE stream emitted by any route
 * built on `lib/agent-stream.ts`. Handles the messy realities of network
 * chunking, multi-byte UTF-8 splits, and React lifecycle correctly so
 * callers can just consume `events` and react to lifecycle callbacks.
 *
 * ─── Robustness guarantees ──────────────────────────────────────────────
 *
 *   1. Chunk-split safety: TextDecoder is used with `{ stream: true }` so
 *      a multi-byte character that lands across a chunk boundary is held
 *      until the next chunk arrives. JSON.parse is never called on a
 *      half-decoded string.
 *
 *   2. Event-split safety: SSE events are framed as `data: <json>\n\n`.
 *      Network chunks can split mid-event. We accumulate into a string
 *      buffer, split on `\n\n`, and treat the trailing fragment as
 *      "incomplete — wait for more bytes" until the next chunk arrives.
 *
 *   3. Final-flush safety: when the stream ends, we call decoder.decode()
 *      with no arg to flush any held bytes, then process the final buffer
 *      contents in case the server didn't terminate with `\n\n`.
 *
 *   4. Cancellation safety: AbortController is wired to the fetch + reader.
 *      Cancel during a chunk read is caught and surfaced as a clean
 *      cancellation, not as an error.
 *
 *   5. Strict-mode safety: React 18+ Strict Mode mounts effects twice in
 *      development. We use a ref-based guard so a manual start() call
 *      followed by a re-render doesn't spawn duplicate streams.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────
 *
 *   const stream = useAgentStream({
 *     endpoint: '/api/agents/cmo',
 *     body: { workspaceId, message, action: 'execute', firstAction: 'strategy' },
 *     onApprovalPending: ({ approvalId, artifactId, publishDestination }) => {
 *       setApprovalModal({ approvalId, artifactId, publishDestination })
 *     },
 *     onDone: ({ output }) => { ... },
 *   })
 *
 *   // Trigger when ready
 *   <button onClick={stream.start}>Generate</button>
 *
 *   // Pass live events to AgentConsole
 *   <AgentConsole events={stream.events} status={stream.status} />
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent } from './agent-stream'

// Re-export so callers don't need to dig into agent-stream.ts
export type { AgentEvent } from './agent-stream'

// ─── Public API ────────────────────────────────────────────────────────────

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'cancelled'

export interface UseAgentStreamOptions {
  /** API endpoint to POST to (must support `Accept: text/event-stream`). */
  endpoint: string
  /** Request body. Re-serialized on every start(). */
  body: unknown
  /** Extra headers (e.g. for forwarding session). */
  headers?: Record<string, string>
  /** Start immediately on mount (default: false — caller controls via start()). */
  autoStart?: boolean

  // ─── Per-event callbacks (fired in addition to events list updates) ────
  // These are useful for side effects (opening modals, scrolling, etc.)
  // that shouldn't trigger a full re-render of the events list.

  /** Fires for every event, in order received. */
  onEvent?: (event: AgentEvent) => void
  /** Concatenated text from `token` events. */
  onToken?: (text: string, agent?: string) => void
  /** A sub-agent has begun work. */
  onAgentStart?: (data: { agent: string; label?: string }) => void
  /** A sub-agent finished successfully. */
  onAgentDone?: (data: { agent: string; cost?: number; durationMs?: number }) => void
  /** A sub-agent failed (non-fatal — parent run may continue). */
  onAgentError?: (data: { agent: string; msg: string }) => void
  /** An artifact was just created in the DB. */
  onArtifactCreated?: (data: { artifactId: string; type: string; title?: string }) => void
  /** An approval is waiting — caller should open the Review Required modal. */
  onApprovalPending?: (data: {
    approvalId: string
    artifactId: string
    publishDestination?: string
  }) => void
  /** The whole run finished cleanly. */
  onDone?: (data: { output?: unknown; cost?: number }) => void
  /** Fatal error on the parent run. */
  onError?: (msg: string) => void
}

export interface UseAgentStreamResult {
  /** All events received so far (chronological). */
  events: AgentEvent[]
  /** High-level stream status. */
  status: StreamStatus
  /** Final `output` payload from the `done` event, if any. */
  output: unknown
  /** Total cost reported on the `done` event. */
  cost: number | null
  /** Orchestrator run id (auto-stamped on every event). */
  runId: string | null
  /** Latest error message. */
  error: string | null
  /** Aggregate of all `token` event texts. */
  streamingText: string
  /**
   * Start (or restart) the stream. Accepts optional per-call overrides for
   * body and endpoint — useful when the hook is used as a long-lived
   * orchestrator that fires multiple distinct streams (e.g. one per chat
   * message). The overrides take precedence over the hook's options.
   */
  start: (override?: { body?: unknown; endpoint?: string }) => Promise<void>
  /** Cancel an in-flight stream. Idempotent. */
  cancel: () => void
  /** Reset all state to idle/empty. */
  reset: () => void
}

// ─── Hook implementation ──────────────────────────────────────────────────

export function useAgentStream(opts: UseAgentStreamOptions): UseAgentStreamResult {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [output, setOutput] = useState<unknown>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')

  // Refs for things we don't want to trigger re-renders or get stale closures over.
  const abortRef = useRef<AbortController | null>(null)
  const activeRef = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  // ─── reset: clean slate ──────────────────────────────────────────────
  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    activeRef.current = false
    setEvents([])
    setStatus('idle')
    setOutput(null)
    setCost(null)
    setRunId(null)
    setError(null)
    setStreamingText('')
  }, [])

  // ─── cancel: stop a running stream but keep events received so far ───
  const cancel = useCallback(() => {
    if (!activeRef.current) return
    abortRef.current?.abort()
    abortRef.current = null
    activeRef.current = false
    setStatus('cancelled')
  }, [])

  // ─── start: open the stream + parse chunks ───────────────────────────
  const start = useCallback(async (override?: { body?: unknown; endpoint?: string }) => {
    // Guard: if we're already running, ignore re-entrant start() calls.
    // (Strict Mode fires effects twice in dev; this prevents duplicate streams.)
    if (activeRef.current) {
      return
    }
    activeRef.current = true

    // Reset state (but keep optsRef pointed at latest props)
    setEvents([])
    setOutput(null)
    setCost(null)
    setRunId(null)
    setError(null)
    setStreamingText('')
    setStatus('connecting')

    const controller = new AbortController()
    abortRef.current = controller

    const current = optsRef.current
    // Per-call overrides take precedence over hook props — useful when one
    // hook instance is shared across multiple distinct streams (e.g. CMO
    // chat firing a new request per message).
    const endpoint = override?.endpoint ?? current.endpoint
    const body = override?.body !== undefined ? override.body : current.body

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(current.headers || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Bypass any HTTP cache layer (some CDNs aggressively cache POST otherwise).
        cache: 'no-store',
      })
    } catch (err) {
      // AbortError fires when cancel() is called before connection completes.
      if ((err as Error).name === 'AbortError') {
        activeRef.current = false
        setStatus('cancelled')
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      activeRef.current = false
      setStatus('error')
      setError(msg)
      optsRef.current.onError?.(msg)
      return
    }

    if (!response.ok) {
      let msg = `Server returned ${response.status}`
      try {
        const text = await response.text()
        if (text) msg = text.slice(0, 500)
      } catch {
        /* ignore */
      }
      activeRef.current = false
      setStatus('error')
      setError(msg)
      optsRef.current.onError?.(msg)
      return
    }

    if (!response.body) {
      const msg = 'Response has no body — server may not support streaming'
      activeRef.current = false
      setStatus('error')
      setError(msg)
      optsRef.current.onError?.(msg)
      return
    }

    setStatus('streaming')

    // ─── Robust SSE parser ────────────────────────────────────────────
    // Reads Uint8Array chunks; decodes with stream:true to handle multi-byte
    // chars spanning boundaries; accumulates into a string buffer; splits on
    // the SSE event terminator `\n\n`; treats the last fragment as incomplete.

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let buffer = ''

    /** Pull one or more events out of the buffer. Leaves any incomplete tail. */
    const drainBuffer = () => {
      // Normalize bare LF \n into CRLF? No — SSE spec allows both \n and \r\n
      // but the standard event-terminator is *two* of whatever line ending
      // we're using. We standardise on \n\n which is what our server emits.
      const segments = buffer.split('\n\n')
      // Last segment is the incomplete tail — put it back.
      buffer = segments.pop() ?? ''

      for (const segment of segments) {
        // An SSE event is one or more `field: value` lines. We only use `data:`.
        // Multiple `data:` lines in one event would be concatenated with \n;
        // our server only emits a single data: line per event, so just take it.
        const trimmed = segment.trim()
        if (!trimmed) continue

        // Look for `data:` prefix (handle multiple lines and CRLF too)
        let jsonText = ''
        for (const line of trimmed.split(/\r?\n/)) {
          if (line.startsWith('data:')) {
            jsonText += line.slice(5).trimStart()
          }
          // Ignore other fields (event:, id:, retry:) — we don't use them.
        }
        if (!jsonText) continue

        let parsed: AgentEvent
        try {
          parsed = JSON.parse(jsonText) as AgentEvent
        } catch (e) {
          // Malformed event — log but don't kill the stream
          // (could happen if server logic emits invalid JSON for one event)
          console.warn('[useAgentStream] skipping malformed event:', jsonText, e)
          continue
        }

        // Update state in a single batched update per chunk read
        applyEvent(parsed)
      }
    }

    const applyEvent = (event: AgentEvent) => {
      // Always append to events list
      setEvents(prev => [...prev, event])

      // Track runId from first event that carries it
      if (event.runId) {
        setRunId(prev => prev ?? event.runId ?? null)
      }

      // Dispatch typed callbacks
      const cb = optsRef.current
      cb.onEvent?.(event)

      switch (event.t) {
        case 'token':
          setStreamingText(prev => prev + event.text)
          cb.onToken?.(event.text, event.agent)
          break
        case 'agent_start':
          cb.onAgentStart?.({ agent: event.agent, label: event.label })
          break
        case 'agent_done':
          cb.onAgentDone?.({
            agent: event.agent,
            cost: event.cost,
            durationMs: event.durationMs,
          })
          break
        case 'agent_error':
          cb.onAgentError?.({ agent: event.agent, msg: event.msg })
          break
        case 'artifact_created':
          cb.onArtifactCreated?.({
            artifactId: event.artifactId,
            type: event.type,
            title: event.title,
          })
          break
        case 'approval_pending':
          cb.onApprovalPending?.({
            approvalId: event.approvalId,
            artifactId: event.artifactId,
            publishDestination: event.publishDestination,
          })
          break
        case 'done':
          setOutput(event.output ?? null)
          setCost(event.cost ?? null)
          setStatus('done')
          cb.onDone?.({ output: event.output, cost: event.cost })
          break
        case 'error':
          setStatus('error')
          setError(event.msg)
          cb.onError?.(event.msg)
          break
      }
    }

    // ─── Read loop ────────────────────────────────────────────────────
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // stream:true keeps any partial multi-byte char held internally
        buffer += decoder.decode(value, { stream: true })
        drainBuffer()
      }

      // Final flush: drain anything still in the TextDecoder + buffer
      buffer += decoder.decode() // no arg = flush
      if (buffer.length > 0) {
        // Add a synthetic terminator so drainBuffer treats the tail as a
        // complete event (server may omit the final \n\n).
        buffer += '\n\n'
        drainBuffer()
      }

      activeRef.current = false
      // If we received a `done` or `error` event, status was already set.
      // If we just hit EOF without one (server closed early), mark done.
      setStatus(prev => (prev === 'streaming' ? 'done' : prev))
    } catch (err) {
      activeRef.current = false
      if ((err as Error).name === 'AbortError') {
        setStatus('cancelled')
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(msg)
      optsRef.current.onError?.(msg)
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* already released */
      }
    }
  }, [])

  // ─── Auto-start + cleanup ────────────────────────────────────────────
  useEffect(() => {
    if (opts.autoStart) {
      void start()
    }
    return () => {
      // Cancel any in-flight stream on unmount
      abortRef.current?.abort()
      abortRef.current = null
      activeRef.current = false
    }
    // Intentionally empty deps: we only want to honor autoStart on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    events,
    status,
    output,
    cost,
    runId,
    error,
    streamingText,
    start,
    cancel,
    reset,
  }
}
