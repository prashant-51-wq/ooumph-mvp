// ElevenLabs Text-to-Speech API

import { getCredential } from '@/lib/credential-context'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel

export interface ElevenLabsVoice {
  voice_id: string
  name: string
  labels: Record<string, string>
  preview_url?: string
  category?: string
}

export interface TtsResult {
  audioBase64: string
  mimeType: 'audio/mpeg'
}

export interface TtsOptions {
  voiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
}

export async function textToSpeech(
  text: string,
  options?: TtsOptions
): Promise<TtsResult | null> {
  const key = getCredential('ELEVENLABS_API_KEY')
  if (!key) return null
  try {
    const voiceId =
      options?.voiceId ?? getCredential('ELEVENLABS_VOICE_ID') ?? DEFAULT_VOICE_ID
    const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: options?.modelId ?? 'eleven_turbo_v2',
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
          use_speaker_boost: true,
        },
      }),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      audioBase64: buf.toString('base64'),
      mimeType: 'audio/mpeg',
    }
  } catch {
    return null
  }
}

export async function getVoices(): Promise<ElevenLabsVoice[]> {
  const key = getCredential('ELEVENLABS_API_KEY')
  if (!key) return []
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
      headers: { 'xi-api-key': key },
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.voices ?? []) as ElevenLabsVoice[]
  } catch {
    return []
  }
}

export function isElevenLabsAvailable(): boolean {
  return !!getCredential('ELEVENLABS_API_KEY')
}
