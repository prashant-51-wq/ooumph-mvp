/**
 * lib/email-sender.ts
 *
 * Multi-tenant email dispatch. Resolves the per-workspace BYOK key first
 * (via `workspace_secrets` + AES-256-GCM decrypt) and only falls back to the
 * platform-wide `RESEND_API_KEY` env var when no workspace-level key is set.
 *
 * Provider abstraction lives here so the route handlers stay clean — they
 * never touch the Resend SDK or env vars directly.
 *
 *   const result = await sendCampaignEmail(workspaceId, {
 *     to: 'jane@example.com',
 *     from: 'Acme <hi@acme.com>',
 *     subject: 'Spring sale',
 *     html: '<p>...</p>',
 *   })
 *
 *   if (!result.ok) {
 *     // log result.error and record failed_count++
 *   } else {
 *     // result.messageId is the provider's message id
 *   }
 *
 * The function never throws — callers always get a discriminated result back.
 */

import { Resend } from 'resend'
import { resolveProviderKey } from '@/lib/secrets'

export interface SendEmailInput {
  to: string
  from: string
  subject: string
  html?: string
  text?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}

export type SendEmailResult =
  | { ok: true; messageId: string; provider: 'resend'; usedByok: boolean }
  | { ok: false; error: string; code?: string; usedByok: boolean }

/**
 * Resolve the email-provider key for a workspace.
 *
 * Priority:
 *   1. `workspace_secrets[provider='resend']` (BYOK, AES-256-GCM decrypted)
 *   2. `process.env.RESEND_API_KEY`             (platform fallback)
 *
 * Returns `{ key, usedByok }` so the caller can log/audit which path fired.
 */
export async function resolveEmailProviderKey(
  workspaceId: string,
): Promise<{ key: string | null; usedByok: boolean }> {
  // Try workspace BYOK first. `resolveProviderKey()` already implements the
  // BYOK-first-then-env priority, so we call the lower-level lookup directly
  // to distinguish which path actually fired (for telemetry).
  const { getWorkspaceSecret } = await import('@/lib/secrets')
  const byok = await getWorkspaceSecret(workspaceId, 'resend')
  if (byok) {
    return { key: byok.replace(/^﻿/, '').trim(), usedByok: true }
  }
  // Fallback to platform key — only used when the workspace hasn't supplied
  // their own. Some plans may forbid this; that's enforced at the route layer.
  const fallback = (process.env.RESEND_API_KEY || '').replace(/^﻿/, '').trim()
  return { key: fallback || null, usedByok: false }
}

/**
 * Dispatch a single transactional / campaign email through the resolved
 * provider. Never throws — surface errors via the result discriminant.
 */
export async function sendCampaignEmail(
  workspaceId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const { key, usedByok } = await resolveEmailProviderKey(workspaceId)
  if (!key) {
    return {
      ok: false,
      error: 'No email provider key configured (workspace BYOK missing and platform RESEND_API_KEY unset)',
      code: 'no_provider_key',
      usedByok: false,
    }
  }

  // The Resend SDK's CreateEmailOptions union requires exactly one of
  // { html | text | react | template }. We assemble the payload with one of
  // those guaranteed to be a string at call-site so TS narrows correctly.
  if (!input.html && !input.text) {
    return { ok: false, error: 'Either html or text content is required', code: 'no_content', usedByok }
  }
  const basePayload = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    headers: input.headers,
    tags: input.tags,
  }
  const payload = input.html
    ? { ...basePayload, html: input.html }
    : { ...basePayload, text: input.text as string }

  try {
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send(payload)

    if (error) {
      return {
        ok: false,
        error: error.message || 'Provider rejected message',
        code: error.name || 'provider_error',
        usedByok,
      }
    }

    return {
      ok: true,
      messageId: data?.id || '',
      provider: 'resend',
      usedByok,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'sdk_throw',
      usedByok,
    }
  }
}

/**
 * Quick health-check helper — verifies the resolved key actually authenticates
 * with the provider. Used by the BYOK settings page "Test connection" button.
 */
export async function testEmailProviderKey(
  workspaceId: string,
): Promise<{ ok: boolean; usedByok: boolean; error?: string }> {
  const { key, usedByok } = await resolveEmailProviderKey(workspaceId)
  if (!key) return { ok: false, usedByok: false, error: 'No key resolved' }
  try {
    const resend = new Resend(key)
    // Domains list is the cheapest authenticated call Resend exposes.
    await resend.domains.list()
    return { ok: true, usedByok }
  } catch (err) {
    return { ok: false, usedByok, error: err instanceof Error ? err.message : String(err) }
  }
}
