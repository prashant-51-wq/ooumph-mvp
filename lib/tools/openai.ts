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
  // Sprint 19L: account-level model availability varies — some accounts
  // have dall-e-3, some have gpt-image-1, some only dall-e-2 (free tier),
  // brand-new accounts may have none until they add prepaid balance.
  // Try each in order, only falling through on "model not found" — any
  // other error (billing, invalid key, content policy) terminates early
  // because the next model would fail the same way.
  // Sprint 19I/J/K: also strip params to bare minimum (model + prompt +
  // n + size) so we don't trip "Unknown parameter" on any of these.
  const candidates = ['gpt-image-1', 'dall-e-3', 'dall-e-2']
  let lastError = ''
  for (const model of candidates) {
    const r = await fetch(`${OPENAI_BASE}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: options?.size ?? '1024x1024',
      }),
    })
    if (r.ok) {
      const json = await r.json()
      const item = json.data?.[0]
      if (!item) throw new Error('OpenAI returned empty data array')
      // gpt-image-1 returns b64_json by default; dall-e-3/2 return url.
      let imageUrl: string | undefined = item.url
      if (!imageUrl && item.b64_json) {
        imageUrl = `data:image/png;base64,${item.b64_json}`
      }
      if (!imageUrl) throw new Error('OpenAI item had neither url nor b64_json')
      return {
        url: imageUrl,
        revisedPrompt: item.revised_prompt ?? prompt,
      }
    }
    let bodyText = ''
    try { bodyText = await r.text() } catch { /* ignore */ }
    let parsed: { error?: { message?: string; code?: string; type?: string } } = {}
    try { parsed = JSON.parse(bodyText) } catch { /* ignore */ }
    const msg = parsed.error?.message
      || parsed.error?.code
      || bodyText.slice(0, 300)
      || `HTTP ${r.status}`
    lastError = msg
    // Only fall through to next candidate on model-availability errors.
    const isModelError = /does not exist|model.*not found|model.*not available|model_not_found/i.test(msg)
    if (!isModelError) {
      throw new Error(`OpenAI: ${msg}`)
    }
  }
  throw new Error(
    `OpenAI: no compatible image model on this account (tried ${candidates.join(', ')}). `
    + `Last error: ${lastError}. `
    + `Add a prepaid balance at platform.openai.com/account/billing to unlock image models, `
    + `OR use Stability AI from /dashboard/settings instead.`,
  )
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
