import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL as _DEFAULT_MODEL, SUPPORTED_MODELS as _SUPPORTED_MODELS } from './models'
import { getWorkspaceSecret } from './secrets'

export { SUPPORTED_MODELS, DEFAULT_MODEL } from './models'

// Strip BOM (U+FEFF) that can appear when env vars are copy-pasted from some editors.
// Without this, the Anthropic SDK throws "Cannot convert argument to a ByteString".
function sanitizeApiKey(key: string | undefined): string | undefined {
  return key?.replace(/^﻿/, '').trim() || undefined
}

export function getModel(modelSettings?: Record<string, unknown> | null): string {
  if (modelSettings?.defaultModel && typeof modelSettings.defaultModel === 'string') {
    return modelSettings.defaultModel
  }
  return process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
}

// Backward compatible singleton bound to the env key. Existing callers that
// import `claude` directly continue to work; new code should prefer
// `getClaudeClient(workspaceId)` so BYOK is honoured.
//
// @deprecated Sprint 18L (audit pass #6 P2): direct imports of `claude`
// silently bypass workspace BYOK keys. New call sites should call
// `await getClaudeClient(workspaceId)` instead. Migration of the remaining
// `from '@/lib/claude'` → `.messages.create` callers tracked separately.
export const claude = new Anthropic({ apiKey: sanitizeApiKey(process.env.ANTHROPIC_API_KEY) })

export const MODEL = _DEFAULT_MODEL

/**
 * Sprint 18B (BYOK): Resolve the Anthropic client for a given workspace.
 *
 * If the workspace has a stored `anthropic` secret in `workspace_secrets`,
 * we build a fresh client bound to that decrypted key. Otherwise we fall
 * back to the env-bound singleton. `workspaceId` is optional so callers
 * that don't have one (cron jobs, ad-hoc scripts) keep the old behavior.
 *
 * Never logs the key.
 */
export async function getClaudeClient(workspaceId?: string): Promise<Anthropic> {
  if (!workspaceId) return claude
  try {
    const byok = await getWorkspaceSecret(workspaceId, 'anthropic')
    const sanitized = sanitizeApiKey(byok ?? undefined)
    if (sanitized) {
      return new Anthropic({ apiKey: sanitized })
    }
  } catch {
    // Fall through to env client on lookup/decrypt failure — better to
    // serve the request on the platform key than to hard-fail.
  }
  return claude
}

export async function runAgent<T>(
  systemPrompt: string,
  userPrompt: string,
  schema?: string,
  options?: { model?: string; workspaceId?: string }
): Promise<T> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const client = await getClaudeClient(options?.workspaceId)
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt + (schema ? `\n\nRespond ONLY with valid JSON matching this schema:\n${schema}` : ''),
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/)
  const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text

  try {
    return JSON.parse(jsonStr) as T
  } catch {
    throw new Error(`Agent returned invalid JSON. Raw response: ${text.slice(0, 500)}`)
  }
}

export async function streamAgent(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  options?: { model?: string; workspaceId?: string }
): Promise<string> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const client = await getClaudeClient(options?.workspaceId)
  const stream = await client.messages.stream({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  let fullText = ''
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullText += chunk.delta.text
      onChunk(chunk.delta.text)
    }
  }
  return fullText
}
