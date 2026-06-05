/**
 * lib/observability.ts
 *
 * Centralised error-capture and telemetry pipeline.
 *
 * `captureException(error, context)` is the single call-site for every
 * unhandled runtime crash in API routes and background jobs. It:
 *
 *   1. Normalises any thrown value into a structured Error record
 *   2. Scrubs secrets (Postgres DSN, bearer tokens, API keys, AES ciphers)
 *      from both the message and the context before emitting anything
 *   3. Logs a safe, structured JSON telemetry line via lib/logger
 *   4. Invokes any registered telemetry hook (Sentry, PostHog, etc.) in a
 *      try/catch so the hook NEVER propagates back to the caller
 *   5. Returns a safe NextResponse-compatible error body with NO raw DB or
 *      token strings — suitable to send directly to the client
 *
 * Hook integration example (in instrumentation.ts or app/layout.tsx):
 *
 *   import { registerExceptionHook } from '@/lib/observability'
 *   import * as Sentry from '@sentry/nextjs'
 *
 *   registerExceptionHook((record) => {
 *     Sentry.withScope((scope) => {
 *       scope.setTag('workspace', record.workspaceId ?? 'unknown')
 *       scope.setContext('ctx', record.safeContext)
 *       Sentry.captureException(new Error(record.message))
 *     })
 *   })
 */

import { log } from '@/lib/logger'

// ── Secret scrubbing ────────────────────────────────────────────────────────

/**
 * Patterns that must never appear in emitted telemetry.
 * Each entry is replaced by a safe placeholder string.
 */
const SCRUB_PATTERNS: [RegExp, string][] = [
  // Postgres DSN — postgresql://user:pass@host/db or postgres://...
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DSN]'],
  // Bearer tokens and Authorization headers
  [/bearer\s+[A-Za-z0-9._\-/+=]{8,}/gi, 'Bearer [REDACTED_TOKEN]'],
  // Anthropic API keys sk-ant-...
  [/sk-ant-[A-Za-z0-9_\-]{10,}/g, '[REDACTED_API_KEY]'],
  // OpenAI sk-...
  [/sk-[A-Za-z0-9]{32,}/g, '[REDACTED_API_KEY]'],
  // AES-GCM ciphertext blobs (base64 64+ chars) — workspace_secrets payloads
  [/[A-Za-z0-9+/]{64,}={0,2}/g, '[REDACTED_CIPHER]'],
  // Generic bearer-style token in env var values
  [/(?:secret|token|password|key)\s*[:=]\s*[^\s,;"'{}\[\]]{8,}/gi, '[REDACTED_SECRET]'],
]

function scrub(value: string): string {
  let out = value
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function scrubContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string') {
      safe[key] = scrub(value)
    } else if (value instanceof Error) {
      safe[key] = {
        name: value.name,
        message: scrub(value.message),
        stack: value.stack ? scrub(value.stack) : undefined,
      }
    } else if (typeof value === 'object' && value !== null) {
      // Shallow scrub of nested objects — avoids deep recursion on large payloads
      safe[key] = '[object]'
    } else {
      safe[key] = value
    }
  }
  return safe
}

// ── Exception record ────────────────────────────────────────────────────────

export interface ExceptionRecord {
  /** Short scrubbed error message */
  message: string
  /** Stack trace (scrubbed, may be absent in minified builds) */
  stack: string | undefined
  /** Original error name (TypeError, DatabaseError, etc.) */
  errorName: string
  /** Workspace the request was executing in, if available */
  workspaceId: string | undefined
  /** Calling scope / route identifier */
  scope: string
  /** Scrubbed copy of the context passed in */
  safeContext: Record<string, unknown>
  /** ISO timestamp */
  timestamp: string
}

// ── Hook registry ───────────────────────────────────────────────────────────

type ExceptionHook = (record: ExceptionRecord) => void | Promise<void>

const hooks: ExceptionHook[] = []

/**
 * Register a telemetry sink (Sentry, PostHog, Datadog, etc.).
 * Call this once at app startup (instrumentation.ts or similar).
 * The hook is invoked after the structured log line is emitted.
 * Hook errors are swallowed and do not propagate.
 */
export function registerExceptionHook(hook: ExceptionHook): void {
  hooks.push(hook)
}

// ── Core capture function ───────────────────────────────────────────────────

/**
 * Capture a runtime exception with structured context.
 *
 * @param error   Any thrown value — string, Error subclass, unknown.
 * @param context Diagnostic key/value pairs. Secrets are scrubbed automatically.
 *                Include `workspaceId` and `scope` whenever available.
 *
 * @returns A safe, client-suitable error envelope. The `message` field
 *          contains a generic fallback — never raw DB or token strings.
 *
 * Example:
 *   try {
 *     await sql`...`
 *   } catch (err) {
 *     return captureException(err, { scope: 'api/artifacts', workspaceId })
 *       .toResponse(500)
 *   }
 */
export function captureException(
  error: unknown,
  context: Record<string, unknown> & { scope?: string; workspaceId?: string } = {},
): ExceptionCapture {
  const scope = String(context.scope || 'unknown')
  const workspaceId = context.workspaceId ? String(context.workspaceId) : undefined

  // Normalise the error value.
  let errorName = 'UnknownError'
  let rawMessage = 'An unexpected error occurred'
  let rawStack: string | undefined

  if (error instanceof Error) {
    errorName = error.name || 'Error'
    rawMessage = error.message || rawMessage
    rawStack = error.stack
  } else if (typeof error === 'string') {
    rawMessage = error
  } else if (error !== null && error !== undefined) {
    try { rawMessage = JSON.stringify(error) } catch { /* ignore */ }
  }

  // Scrub before any emission.
  const safeMessage = scrub(rawMessage)
  const safeStack = rawStack ? scrub(rawStack) : undefined
  const safeContext = scrubContext(context)

  const record: ExceptionRecord = {
    message: safeMessage,
    stack: safeStack,
    errorName,
    workspaceId,
    scope,
    safeContext,
    timestamp: new Date().toISOString(),
  }

  // Emit structured log line.
  log.error(scope, safeMessage, {
    errorName,
    workspaceId,
    stack: safeStack,
    ...safeContext,
  })

  // Fire registered hooks (non-fatal — hook failures never affect the caller).
  for (const hook of hooks) {
    try {
      const result = hook(record)
      if (result instanceof Promise) {
        result.catch((hookErr: unknown) => {
          log.warn('observability', 'exception hook failed', {
            hookErr: hookErr instanceof Error ? hookErr.message : String(hookErr),
          })
        })
      }
    } catch (hookErr) {
      log.warn('observability', 'exception hook threw synchronously', {
        hookErr: hookErr instanceof Error ? (hookErr as Error).message : String(hookErr),
      })
    }
  }

  return new ExceptionCapture(record)
}

// ── Fluent result wrapper ───────────────────────────────────────────────────

/**
 * Returned by `captureException()`. Provides a convenience method to build
 * a safe NextResponse from the captured record without importing next/server
 * at every call site.
 */
export class ExceptionCapture {
  constructor(public readonly record: ExceptionRecord) {}

  /**
   * Build a safe JSON error response suitable for sending to the client.
   * The body never exposes DB URLs, tokens, or stack traces in production.
   */
  toClientError(
    statusCode = 500,
    opts?: { expose?: boolean },
  ): { body: { error: string; scope: string; timestamp: string }; status: number } {
    const isDev = process.env.NODE_ENV !== 'production'
    const exposeDetail = opts?.expose ?? isDev

    return {
      body: {
        error: exposeDetail
          ? this.record.message
          : 'An internal server error occurred. Our team has been notified.',
        scope: this.record.scope,
        timestamp: this.record.timestamp,
      },
      status: statusCode,
    }
  }
}

// ── Convenience: safe error message for client responses ───────────────────

/**
 * Returns a safe, one-line error string for inline use in NextResponse.json().
 * Never leaks database or token details.
 *
 * Usage: NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 })
 */
export function safeErrorMessage(error: unknown): string {
  const isDev = process.env.NODE_ENV !== 'production'
  if (!isDev) return 'An internal server error occurred.'

  if (error instanceof Error) return scrub(error.message)
  if (typeof error === 'string') return scrub(error)
  return 'An unexpected error occurred.'
}
