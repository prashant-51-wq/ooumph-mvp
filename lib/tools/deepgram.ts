// Deepgram Speech-to-Text API

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1'

const DEFAULT_PARAMS =
  'model=nova-2&smart_format=true&punctuate=true&paragraphs=true&summarize=v2'

export interface DeepgramTranscript {
  transcript: string
  confidence: number
  words?: { word: string; start: number; end: number; confidence: number }[]
  paragraphs?: string
  summary?: string
  duration?: number
}

function parseResponse(json: Record<string, unknown>): DeepgramTranscript | null {
  const results = json.results as Record<string, unknown> | undefined
  if (!results) return null
  const channels = results.channels as { alternatives: Record<string, unknown>[] }[] | undefined
  const alternative = channels?.[0]?.alternatives?.[0]
  if (!alternative) return null

  const paragraphsData = alternative.paragraphs as
    | { transcript?: string }
    | undefined

  const summaryData = results.summary as { short?: string } | undefined
  const metadata = json.metadata as { duration?: number } | undefined

  return {
    transcript: (alternative.transcript as string) ?? '',
    confidence: (alternative.confidence as number) ?? 0,
    words: alternative.words as DeepgramTranscript['words'],
    paragraphs: paragraphsData?.transcript,
    summary: summaryData?.short,
    duration: metadata?.duration,
  }
}

export async function transcribeUrl(
  audioUrl: string,
  options?: { language?: string; model?: string }
): Promise<DeepgramTranscript | null> {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return null
  try {
    let params = DEFAULT_PARAMS
    if (options?.model) params = params.replace('model=nova-2', `model=${options.model}`)
    if (options?.language) params += `&language=${options.language}`

    const res = await fetch(`${DEEPGRAM_BASE}/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return parseResponse(json)
  } catch {
    return null
  }
}

export async function transcribeBase64(
  audioBase64: string,
  mimeType: string,
  options?: { language?: string }
): Promise<DeepgramTranscript | null> {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return null
  try {
    let params = DEFAULT_PARAMS
    if (options?.language) params += `&language=${options.language}`

    const buffer = Buffer.from(audioBase64, 'base64')
    const res = await fetch(`${DEEPGRAM_BASE}/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': mimeType,
      },
      body: buffer,
    })
    if (!res.ok) return null
    const json = await res.json()
    return parseResponse(json)
  } catch {
    return null
  }
}

export function isDeepgramAvailable(): boolean {
  return !!process.env.DEEPGRAM_API_KEY
}
