import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL as _DEFAULT_MODEL, SUPPORTED_MODELS as _SUPPORTED_MODELS } from './models'
import { getWorkspaceSecret } from './secrets'

export { SUPPORTED_MODELS, DEFAULT_MODEL } from './models'

// Strip BOM (U+FEFF) that can appear when env vars are copy-pasted from some editors.
function sanitizeApiKey(key: string | undefined): string | undefined {
  return key?.replace(/^﻿/, '').trim() || undefined
}

export function getModel(modelSettings?: Record<string, unknown> | null): string {
  if (modelSettings?.defaultModel && typeof modelSettings.defaultModel === 'string') {
    return modelSettings.defaultModel
  }
  return process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
}

/**
 * Thrown when a workspace has no Anthropic API key configured.
 * Callers should catch this and return { requiresSetup: true } to the UI.
 */
export class AgentSetupError extends Error {
  readonly requiresSetup = true
  constructor(workspaceId: string) {
    super(`ANTHROPIC_API_KEY not configured for workspace ${workspaceId}. Add your API key in Settings → Integrations.`)
    this.name = 'AgentSetupError'
  }
}

// @deprecated — direct imports of `claude` bypass workspace BYOK.
// Only kept for legacy cron/script callers. Never use in agent routes.
export const claude = new Anthropic({ apiKey: sanitizeApiKey(process.env.ANTHROPIC_API_KEY) })

export const MODEL = _DEFAULT_MODEL

/**
 * Resolve the Anthropic client for a workspace.
 * workspaceId is now REQUIRED. Throws AgentSetupError if no key is found
 * — zero silent billing on the platform key from agent routes.
 *
 * Pass `allowEnvFallback: true` only for internal cron/script callers that
 * legitimately have no workspace context.
 */
export async function getClaudeClient(
  workspaceId: string,
  opts?: { allowEnvFallback?: boolean }
): Promise<Anthropic> {
  try {
    const byok = await getWorkspaceSecret(workspaceId, 'anthropic')
    const sanitized = sanitizeApiKey(byok ?? undefined)
    if (sanitized) return new Anthropic({ apiKey: sanitized })
  } catch {
    // lookup/decrypt failure — fall through
  }

  if (opts?.allowEnvFallback && process.env.ANTHROPIC_API_KEY) {
    const envKey = sanitizeApiKey(process.env.ANTHROPIC_API_KEY)
    if (envKey) return new Anthropic({ apiKey: envKey })
  }

  throw new AgentSetupError(workspaceId)
}

/**
 * Run a single-turn agent call and parse the JSON response.
 * workspaceId is REQUIRED — resolves BYOK key, never falls back to env.
 */
export async function runAgent<T>(
  systemPrompt: string,
  userPrompt: string,
  workspaceId: string,
  schema?: string,
  options?: { model?: string }
): Promise<T> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const client = await getClaudeClient(workspaceId)
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

/**
 * Run a streaming agent call, calling onChunk for each text delta.
 * workspaceId is REQUIRED — resolves BYOK key, never falls back to env.
 */
export async function streamAgent(
  systemPrompt: string,
  userPrompt: string,
  workspaceId: string,
  onChunk: (text: string) => void,
  options?: { model?: string }
): Promise<string> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const client = await getClaudeClient(workspaceId)
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
