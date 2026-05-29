/**
 * lib/logger.ts — Sprint 17H (audit pass #3 P2 #47)
 *
 * Lightweight structured logger. Replaces bare `console.error('[scope] msg', err)`
 * with `log.error('scope', 'msg', { err })` so production logs are JSON
 * lines instead of free-form strings — much easier to grep/dashboard/alert
 * on in a real ops setup.
 *
 * In dev (NODE_ENV !== 'production') we still pretty-print so the
 * developer experience matches `console.*`.
 *
 * Intentionally tiny: no transports, no async batching, no sampling. Just
 * a stable JSON-line shape that a production log aggregator (Datadog,
 * Logflare, Axiom, Vercel Drains) can ingest. The full structured-logger
 * stack is a Sprint 18 conversation.
 */
import { newId } from './db'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogPayload {
  level: LogLevel
  scope: string
  msg: string
  ts: string
  id?: string
  ctx?: Record<string, unknown>
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL]
}

function emit(payload: LogPayload): void {
  if (!shouldLog(payload.level)) return
  // In production: single JSON line per log → ingestable by any drain.
  // In dev: pretty multi-arg so the message + ctx are scannable.
  if (process.env.NODE_ENV === 'production') {
    // Serialise Error objects in ctx so they don't print as "[object Object]".
    const ctx = payload.ctx
      ? Object.fromEntries(
          Object.entries(payload.ctx).map(([k, v]) =>
            v instanceof Error ? [k, { name: v.name, message: v.message, stack: v.stack }] : [k, v]
          )
        )
      : undefined
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ...payload, ctx }))
    } catch {
      // Circular ref or BigInt — fall back to a defensive stringify.
      // eslint-disable-next-line no-console
      console.log(`{"level":"${payload.level}","scope":${JSON.stringify(payload.scope)},"msg":${JSON.stringify(payload.msg)},"ts":"${payload.ts}","ctxError":"serialisation_failed"}`)
    }
  } else {
    const fn = payload.level === 'error' ? console.error
      : payload.level === 'warn' ? console.warn
      : console.log
    if (payload.ctx) fn(`[${payload.scope}]`, payload.msg, payload.ctx)
    else fn(`[${payload.scope}]`, payload.msg)
  }
}

export const log = {
  debug(scope: string, msg: string, ctx?: Record<string, unknown>): void {
    emit({ level: 'debug', scope, msg, ts: new Date().toISOString(), id: newId(), ctx })
  },
  info(scope: string, msg: string, ctx?: Record<string, unknown>): void {
    emit({ level: 'info', scope, msg, ts: new Date().toISOString(), id: newId(), ctx })
  },
  warn(scope: string, msg: string, ctx?: Record<string, unknown>): void {
    emit({ level: 'warn', scope, msg, ts: new Date().toISOString(), id: newId(), ctx })
  },
  error(scope: string, msg: string, ctx?: Record<string, unknown>): void {
    emit({ level: 'error', scope, msg, ts: new Date().toISOString(), id: newId(), ctx })
  },
}
