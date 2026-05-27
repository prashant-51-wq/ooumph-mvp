/**
 * lib/webhook-dispatcher.ts
 *
 * Global, non-blocking event-fan-out engine. Any worker — the
 * experiment-significance cron, the lead-capture endpoint, the call_logs
 * webhook — calls `dispatchWebhookEvent()` exactly once per domain event:
 *
 *   await dispatchWebhookEvent(workspaceId, 'lead.captured', leadPayload)
 *
 * What happens under the hood:
 *
 *   1. We INDEX-scan webhook_subscriptions on the composite
 *      (workspace_id, event_type, status='active'). Misses return fast.
 *
 *   2. For each subscription, we register an `after()` task so the caller's
 *      response returns immediately — fan-out runs after the HTTP handler
 *      releases. This keeps user-facing latency unchanged when zero, one,
 *      or twenty subscribers are attached to the same event.
 *
 *   3. Each task runs a **3x Retry Circuit**: 1st try, then 2 retries with
 *      300ms / 900ms back-off. We treat 5xx and network errors as retryable;
 *      4xx (except 408/429) is permanent — the subscriber's request is
 *      malformed and retrying won't fix it.
 *
 *   4. On final failure we run **Forensic Analysis**: turn the exhausted
 *      signature (status code, error class, timing) into a human-readable
 *      diagnosis string ("Target returned 429 — receiver is rate-limiting
 *      us. Lower your delivery frequency or contact their support."). This
 *      string is JSON-encoded with the full attempt log and written to
 *      `webhook_subscriptions.last_error_log` for the developer console.
 *
 *   5. We also emit a `notifications` row (severity='warning',
 *      type='webhook_dead_target') so the workspace's bell pops the moment a
 *      receiver stops accepting events. The notification body carries the
 *      diagnosis verbatim, and the `link` field carries a data: URL with
 *      the diagnosis JSON base64-encoded — the UI uses it as the href of
 *      a one-click "Download forensic report" button that engineering can
 *      drop straight into their ticket tracker. No extra endpoint needed.
 *
 *   6. Every body is signed with HMAC-SHA256 using the subscription's own
 *      `secret_signature` and attached as `X-Ooumph-Signature: sha256=…`.
 *      Receivers can constant-time-compare against the same secret to
 *      authenticate the request came from us.
 *
 * Concurrency posture: each subscription's attempt chain runs sequentially
 * inside its own `after()` task, but subscriptions for the same event run
 * in parallel. The dispatcher itself does NOT serialise per workspace —
 * that's a queue concern, not a fan-out concern.
 */

import crypto from 'crypto'
import { after } from 'next/server'
import { sql, newId } from '@/lib/db'

// ─── Tunables ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 15_000
/** Exponential back-off in ms, indexed by attempt count (0-based) */
const BACKOFF_SCHEDULE_MS = [0, 300, 900]
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024  // 2 MB hard cap on outbound body
const SIGNATURE_HEADER = 'X-Ooumph-Signature'

// ─── Types ────────────────────────────────────────────────────────────────

interface SubscriptionRow {
  id: string
  workspace_id: string
  target_url: string
  event_type: string
  secret_signature: string
  status: string
}

interface AttemptOutcome {
  attempt: number
  startedAt: string
  finishedAt: string
  ok: boolean
  /** HTTP status if we got a response, else null */
  status: number | null
  /** 'http' | 'network' | 'timeout' | 'aborted' */
  errorClass: 'http' | 'network' | 'timeout' | 'aborted' | null
  errorMessage: string | null
  /** Response body (truncated) when status >= 400 — useful in the forensic blob */
  responseBodySnippet: string | null
}

interface ForensicDiagnosis {
  /** Human-readable single-sentence summary engineering can paste into JIRA */
  diagnosis: string
  /** Programmatic category for filtering */
  category:
    | 'rate_limit'
    | 'upstream_5xx'
    | 'auth_rejected'
    | 'client_error'
    | 'network_unreachable'
    | 'timeout'
    | 'invalid_url'
    | 'unknown'
  /** Suggested remediation in plain English */
  recommendation: string
  /** Sample of HTTP / network signatures captured across attempts */
  fingerprint: {
    finalStatus: number | null
    finalErrorClass: AttemptOutcome['errorClass']
    finalErrorMessage: string | null
    attemptCount: number
  }
  /** Full attempt-by-attempt log so the developer console can show the timeline */
  attempts: AttemptOutcome[]
  /** Echoes the original event so the engineer doesn't need to cross-reference */
  context: {
    subscriptionId: string
    workspaceId: string
    eventType: string
    targetUrl: string
    deliveredAt: string
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Fan out a domain event to every active subscription for this workspace.
 *
 * NON-BLOCKING: returns the moment the candidate subscriptions are queued.
 * The actual HTTP work happens after the caller's response is flushed,
 * via `after()`. Callers therefore pay only one indexed query of cost.
 */
export async function dispatchWebhookEvent(
  workspaceId: string,
  eventType: string,
  payload: unknown,
): Promise<{ matched: number }> {
  if (!workspaceId || !eventType) return { matched: 0 }

  const result = await sql`
    SELECT id, workspace_id, target_url, event_type, secret_signature, status
    FROM webhook_subscriptions
    WHERE workspace_id = ${workspaceId}
      AND event_type = ${eventType}
      AND status = 'active'
    LIMIT 100
  `
  const subscriptions = result.rows as unknown as SubscriptionRow[]
  if (subscriptions.length === 0) return { matched: 0 }

  // Pre-serialise once per dispatch — cheaper than per-subscription, and lets
  // us reject anything that ballooned past MAX_PAYLOAD_BYTES before scheduling.
  let bodyString: string
  try {
    bodyString = JSON.stringify({
      event: eventType,
      workspaceId,
      occurredAt: new Date().toISOString(),
      payload,
    })
  } catch (err) {
    console.error('[webhook-dispatcher] payload not JSON-serialisable', err)
    return { matched: 0 }
  }
  if (Buffer.byteLength(bodyString, 'utf8') > MAX_PAYLOAD_BYTES) {
    console.warn('[webhook-dispatcher] payload exceeded 2MB cap — dropping', { eventType, workspaceId })
    return { matched: 0 }
  }

  for (const sub of subscriptions) {
    after(async () => {
      await deliverWithRetries(sub, bodyString, eventType)
    })
  }
  return { matched: subscriptions.length }
}

// ─── Delivery + retry circuit ─────────────────────────────────────────────

async function deliverWithRetries(
  sub: SubscriptionRow,
  body: string,
  eventType: string,
): Promise<void> {
  const signature = computeHmacSignature(sub.secret_signature, body)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Ooumph-Webhook/1.0',
    [SIGNATURE_HEADER]: `sha256=${signature}`,
    'X-Ooumph-Event': eventType,
    'X-Ooumph-Subscription-Id': sub.id,
  }

  const attempts: AttemptOutcome[] = []

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (BACKOFF_SCHEDULE_MS[i] > 0) {
      await sleep(BACKOFF_SCHEDULE_MS[i])
    }
    const outcome = await singleAttempt(sub.target_url, body, headers, i)
    attempts.push(outcome)

    if (outcome.ok) {
      // Success on this attempt — clear any stale error log and stamp success.
      await stampSuccess(sub.id, outcome.status)
      return
    }

    // 4xx (except 408/429) is permanent — retrying wastes attempts.
    if (outcome.status !== null && outcome.status >= 400 && outcome.status < 500
        && outcome.status !== 408 && outcome.status !== 429) {
      break
    }
  }

  // All attempts exhausted (or terminated early on permanent 4xx).
  const diagnosis = analyseForensics(sub, eventType, attempts)
  await recordFailure(sub, diagnosis)
}

async function singleAttempt(
  url: string,
  body: string,
  headers: Record<string, string>,
  attemptIndex: number,
): Promise<AttemptOutcome> {
  const startedAt = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    const ok = res.ok  // 2xx
    let snippet: string | null = null
    if (!ok) {
      try {
        const text = await res.text()
        snippet = text.slice(0, 800)
      } catch { /* ignore body read errors on error responses */ }
    }
    return {
      attempt: attemptIndex + 1,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok,
      status: res.status,
      errorClass: ok ? null : 'http',
      errorMessage: ok ? null : `HTTP ${res.status} ${res.statusText}`.trim(),
      responseBodySnippet: snippet,
    }
  } catch (err) {
    clearTimeout(timer)
    const e = err as { name?: string; message?: string; code?: string }
    const aborted = e?.name === 'AbortError'
    const message = e?.message || String(err)
    return {
      attempt: attemptIndex + 1,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      status: null,
      errorClass: aborted ? 'timeout' : 'network',
      errorMessage: message,
      responseBodySnippet: null,
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── HMAC signing ─────────────────────────────────────────────────────────

function computeHmacSignature(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

// ─── Forensic Analysis ────────────────────────────────────────────────────

function analyseForensics(
  sub: SubscriptionRow,
  eventType: string,
  attempts: AttemptOutcome[],
): ForensicDiagnosis {
  const last = attempts[attempts.length - 1] || null
  const finalStatus = last?.status ?? null
  const finalErrorClass = last?.errorClass ?? null
  const finalErrorMessage = last?.errorMessage ?? null

  // Diagnosis decision tree — purposely flat, no surprises for the on-call.
  let category: ForensicDiagnosis['category'] = 'unknown'
  let diagnosis = 'Webhook delivery failed and no clear pattern emerged from the attempts. See the per-attempt log below.'
  let recommendation = 'Check the receiver\'s server logs at the timestamps in the attempt log for the root cause.'

  // Invalid URL pre-check — covers DNS / scheme errors before they hit a
  // network class. The runtime fetch can throw before the controller fires.
  if (!/^https?:\/\//i.test(sub.target_url)) {
    category = 'invalid_url'
    diagnosis = `Target URL '${sub.target_url}' is not a valid http(s) URL — every attempt failed before any network call could be made.`
    recommendation = 'Edit the subscription in /dashboard/settings/connections and supply a valid https:// URL.'
  } else if (finalErrorClass === 'timeout') {
    category = 'timeout'
    diagnosis = `Network timeout: every attempt waited the full ${ATTEMPT_TIMEOUT_MS}ms and the receiver never finished responding. The receiver is alive but slow, or held the request open without writing back.`
    recommendation = 'Check the receiver\'s p99 response time. If they sit behind a long-running handler, return 202 immediately and process async.'
  } else if (finalErrorClass === 'network') {
    category = 'network_unreachable'
    diagnosis = `Network error reaching ${sub.target_url} on every attempt: ${finalErrorMessage}. Common causes: DNS failure, TLS handshake failure, host firewalled, target domain expired.`
    recommendation = 'Confirm the hostname resolves, the TLS certificate is valid, and your firewall isn\'t blocking outbound from Ooumph\'s egress IPs.'
  } else if (finalStatus === 429) {
    category = 'rate_limit'
    diagnosis = 'Receiver returned 429 Too Many Requests on every attempt — they are actively throttling us. Retries hit the same wall because back-off was shorter than their window.'
    recommendation = 'Coordinate with the receiver to raise the rate cap, or aggregate Ooumph events into batches before forwarding from a proxy.'
  } else if (finalStatus !== null && finalStatus >= 500 && finalStatus < 600) {
    category = 'upstream_5xx'
    diagnosis = `Receiver crashed with ${finalStatus} on the final attempt. Earlier attempts likely returned the same family of error — the upstream service is genuinely down or broken.`
    recommendation = 'Page the receiver\'s on-call with the X-Ooumph-Subscription-Id and a timestamp from the attempt log. They have the corresponding server-side trace.'
  } else if (finalStatus === 401 || finalStatus === 403) {
    category = 'auth_rejected'
    diagnosis = `Receiver returned ${finalStatus} — the request was signed correctly by us but the receiver refused it. Most likely the workspace\'s shared secret on their side no longer matches what we hold, or the IP allow-list excluded our egress.`
    recommendation = 'Rotate the subscription\'s secret_signature in /dashboard/developer-api → Webhooks, then update the receiver to use the new value.'
  } else if (finalStatus !== null && finalStatus >= 400 && finalStatus < 500) {
    category = 'client_error'
    diagnosis = `Receiver returned ${finalStatus} indicating they consider our request malformed. We did not retry beyond the first attempt because 4xx (other than 408/429) is treated as permanent.`
    recommendation = 'Inspect the response body snippet captured below — the receiver usually explains what they rejected (missing header, wrong content type, schema mismatch).'
  }

  return {
    diagnosis,
    category,
    recommendation,
    fingerprint: {
      finalStatus,
      finalErrorClass,
      finalErrorMessage,
      attemptCount: attempts.length,
    },
    attempts,
    context: {
      subscriptionId: sub.id,
      workspaceId: sub.workspace_id,
      eventType,
      targetUrl: sub.target_url,
      deliveredAt: new Date().toISOString(),
    },
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────

async function stampSuccess(subscriptionId: string, status: number | null): Promise<void> {
  try {
    await sql`
      UPDATE webhook_subscriptions SET
        last_attempt_at = CURRENT_TIMESTAMP,
        last_attempt_status = ${status !== null ? String(status) : 'ok'},
        last_error_log = NULL
      WHERE id = ${subscriptionId}
    `
  } catch (err) {
    console.error('[webhook-dispatcher] stampSuccess failed', err)
  }
}

async function recordFailure(sub: SubscriptionRow, diagnosis: ForensicDiagnosis): Promise<void> {
  const diagnosisJson = JSON.stringify(diagnosis)

  // 1. Persist the diagnosis blob on the subscription row.
  try {
    await sql`
      UPDATE webhook_subscriptions SET
        last_attempt_at = CURRENT_TIMESTAMP,
        last_attempt_status = ${diagnosis.fingerprint.finalStatus !== null
          ? String(diagnosis.fingerprint.finalStatus)
          : diagnosis.fingerprint.finalErrorClass || 'unknown'},
        last_error_log = ${diagnosisJson}
      WHERE id = ${sub.id}
    `
  } catch (err) {
    console.error('[webhook-dispatcher] persist diagnosis failed', err)
  }

  // 2. Fire a silent in-app notification carrying a download link.
  //    The link is a data: URL that lets the engineer download the diagnosis
  //    JSON in one click straight from the bell — no extra endpoint to build.
  try {
    const downloadHref = forensicDownloadHref(diagnosisJson)
    await sql`
      INSERT INTO notifications (
        id, workspace_id, user_id, type, title, body, link, severity, created_at
      ) VALUES (
        ${newId()}, ${sub.workspace_id}, NULL,
        'webhook_dead_target',
        ${`Webhook delivery failed: ${truncate(diagnosis.context.eventType, 60)}`},
        ${composeNotificationBody(sub, diagnosis)},
        ${downloadHref},
        'warning', CURRENT_TIMESTAMP
      )
    `
  } catch (err) {
    console.error('[webhook-dispatcher] notification insert failed', err)
  }
}

/**
 * Encode the diagnosis JSON as a data: URL the UI can attach to an <a download>
 * tag. We don't add any sensitive context to the body — payloads were already
 * filtered through the public dispatchWebhookEvent contract — so this is safe
 * to render directly from the notifications bell.
 */
function forensicDownloadHref(diagnosisJson: string): string {
  const b64 = Buffer.from(diagnosisJson, 'utf8').toString('base64')
  return `data:application/json;name=ooumph-webhook-forensic.json;base64,${b64}`
}

function composeNotificationBody(sub: SubscriptionRow, diagnosis: ForensicDiagnosis): string {
  const lines = [
    `Target: ${sub.target_url}`,
    `Diagnosis: ${diagnosis.diagnosis}`,
    `Recommendation: ${diagnosis.recommendation}`,
    `Attempts: ${diagnosis.fingerprint.attemptCount} · Final status: ${
      diagnosis.fingerprint.finalStatus ?? diagnosis.fingerprint.finalErrorClass ?? 'unknown'
    }`,
    '',
    'Click the attached link to download the full forensic report for engineering.',
  ]
  return lines.join('\n').slice(0, 4000)
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// ─── Exposed types (consumed by future routes / tests) ────────────────────

export type { ForensicDiagnosis, AttemptOutcome }
