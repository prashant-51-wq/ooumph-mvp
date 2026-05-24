import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL as _DEFAULT_MODEL, SUPPORTED_MODELS as _SUPPORTED_MODELS } from './models'

export { SUPPORTED_MODELS, DEFAULT_MODEL } from './models'

export function getModel(modelSettings?: Record<string, unknown> | null): string {
  if (modelSettings?.defaultModel && typeof modelSettings.defaultModel === 'string') {
    return modelSettings.defaultModel
  }
  return process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
}

export const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const MODEL = _DEFAULT_MODEL

export async function runAgent<T>(
  systemPrompt: string,
  userPrompt: string,
  schema?: string,
  options?: { model?: string }
): Promise<T> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const response = await claude.messages.create({
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
  options?: { model?: string }
): Promise<string> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || _DEFAULT_MODEL
  const stream = await claude.messages.stream({
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
