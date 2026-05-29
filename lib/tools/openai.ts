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
  if (!key) return null
  try {
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
    if (!res.ok) return null
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) return null
    return {
      url: item.url,
      revisedPrompt: item.revised_prompt ?? prompt,
    }
  } catch {
    return null
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
