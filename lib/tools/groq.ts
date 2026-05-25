// Groq API (OpenAI-compatible endpoint)

const GROQ_BASE = 'https://api.groq.com/openai/v1'

export const GROQ_MODELS = {
  fast: 'llama-3.1-8b-instant',
  balanced: 'llama-3.3-70b-versatile',
  large: 'llama-3.1-70b-versatile',
} as const

export async function groqChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || GROQ_MODELS.balanced,
        messages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
      }),
    })
    if (!res.ok) return ''
    const json = await res.json()
    return json.choices?.[0]?.message?.content || ''
  } catch {
    return ''
  }
}

export async function groqComplete(
  userPrompt: string,
  systemPrompt?: string,
  options?: { model?: string; fast?: boolean }
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return ''
  try {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: userPrompt })

    const model = options?.model || (options?.fast ? GROQ_MODELS.fast : GROQ_MODELS.fast)
    return await groqChat(messages, { model })
  } catch {
    return ''
  }
}

export async function groqBulkGenerate(
  prompts: { system?: string; user: string }[],
  options?: { model?: string }
): Promise<string[]> {
  const results = await Promise.allSettled(
    prompts.map((p) => groqComplete(p.user, p.system, { model: options?.model }))
  )
  return results.map((r) => (r.status === 'fulfilled' ? r.value : ''))
}

export function isGroqAvailable(): boolean {
  return !!process.env.GROQ_API_KEY
}
