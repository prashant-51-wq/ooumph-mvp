// OpenAI API

import { getCredential } from '@/lib/credential-context'

const OPENAI_BASE = 'https://api.openai.com/v1'

export interface ImageGenResult {
  url: string
  revisedPrompt: string
}

export interface ImageGenOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
}

export async function generateImage(
  prompt: string,
  options?: ImageGenOptions
): Promise<ImageGenResult | null> {
  const key = getCredential('OPENAI_API_KEY')
  if (!key) {
    throw new Error('OpenAI key not in credential context')
  }
  // Sprint 19I: throw the actual OpenAI error message instead of swallowing
  // to null. The image-gen route's catch block surfaces it to the user so
  // they can see e.g. "billing_hard_limit_reached", "invalid_api_key",
  // "model_not_found" etc — not just "image generation failed".
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      response_format: 'url',
      size: options?.size ?? '1024x1024',
      quality: options?.quality ?? 'standard',
      style: options?.style ?? 'vivid',
    }),
  })
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    let parsed: { error?: { message?: string; code?: string; type?: string } } = {}
    try { parsed = JSON.parse(body) } catch { /* ignore */ }
    const msg = parsed.error?.message
      || parsed.error?.code
      || body.slice(0, 300)
      || `HTTP ${res.status}`
    throw new Error(`OpenAI: ${msg}`)
  }
  const json = await res.json()
  const item = json.data?.[0]
  if (!item) throw new Error('OpenAI returned empty data array')
  return {
    url: item.url,
    revisedPrompt: item.revised_prompt ?? prompt,
  }
}

export async function openAIChat(
  messages: { role: string; content: string }[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const key = getCredential('OPENAI_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model ?? 'gpt-4o-mini',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

export async function createEmbedding(text: string): Promise<number[] | null> {
  const key = getCredential('OPENAI_API_KEY')
  if (!key) return null
  try {
    const res = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

export function isOpenAIAvailable(): boolean {
  return !!getCredential('OPENAI_API_KEY')
}
