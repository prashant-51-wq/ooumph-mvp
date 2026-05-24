import Anthropic from '@anthropic-ai/sdk'

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-6'

export async function runAgent<T>(
  systemPrompt: string,
  userPrompt: string,
  schema?: string
): Promise<T> {
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt + (schema ? `\n\nRespond ONLY with valid JSON matching this schema:\n${schema}` : ''),
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/)
  const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text

  return JSON.parse(jsonStr) as T
}

export async function streamAgent(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const stream = await claude.messages.stream({
    model: MODEL,
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
