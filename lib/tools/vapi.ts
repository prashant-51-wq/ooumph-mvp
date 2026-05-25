// Vapi AI Voice API

const VAPI_BASE = 'https://api.vapi.ai'

export interface VapiAssistant {
  id: string
  name: string
  model?: { provider: string; model: string; systemPrompt?: string }
  voice?: { provider: string; voiceId?: string }
  firstMessage?: string
  createdAt?: string
}

export interface VapiCall {
  id: string
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended'
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall'
  assistantId?: string
  phoneNumberId?: string
  customer?: { number?: string; name?: string }
  startedAt?: string
  endedAt?: string
  endedReason?: string
  transcript?: string
  recordingUrl?: string
  summary?: string
  messages?: { role: string; message: string; time?: number }[]
  cost?: number
  durationSeconds?: number
}

export interface VapiPhoneNumber {
  id: string
  number: string
  name?: string
  assistantId?: string
  provider?: string
}

export interface VapiCreateAssistantOptions {
  name: string
  model?: {
    provider?: string
    model?: string
    systemPrompt?: string
    temperature?: number
  }
  voice?: { provider?: string; voiceId?: string }
  firstMessage?: string
  endCallMessage?: string
  recordingEnabled?: boolean
}

function vapiHeaders(): Record<string, string> {
  const key = process.env.VAPI_API_KEY || ''
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

export async function getVapiAssistants(): Promise<VapiAssistant[]> {
  const key = process.env.VAPI_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${VAPI_BASE}/assistant`, { headers: vapiHeaders() })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : []
  } catch {
    return []
  }
}

export async function createVapiAssistant(
  options: VapiCreateAssistantOptions
): Promise<VapiAssistant | null> {
  const key = process.env.VAPI_API_KEY
  if (!key) return null
  try {
    const body: Record<string, unknown> = {
      name: options.name,
      model: {
        provider: options.model?.provider ?? 'anthropic',
        model: options.model?.model ?? 'claude-3-5-haiku-20241022',
        ...(options.model?.systemPrompt
          ? { systemPrompt: options.model.systemPrompt }
          : {}),
        ...(options.model?.temperature !== undefined
          ? { temperature: options.model.temperature }
          : {}),
      },
      voice: {
        provider: options.voice?.provider ?? '11labs',
        voiceId: options.voice?.voiceId ?? '21m00Tcm4TlvDq8ikWAM',
      },
    }
    if (options.firstMessage) body.firstMessage = options.firstMessage
    if (options.endCallMessage) body.endCallMessage = options.endCallMessage
    if (options.recordingEnabled !== undefined) body.recordingEnabled = options.recordingEnabled

    const res = await fetch(`${VAPI_BASE}/assistant`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getVapiCalls(limit: number = 20): Promise<VapiCall[]> {
  const key = process.env.VAPI_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${VAPI_BASE}/call?limit=${limit}`, { headers: vapiHeaders() })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : []
  } catch {
    return []
  }
}

export async function getVapiCall(callId: string): Promise<VapiCall | null> {
  const key = process.env.VAPI_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${VAPI_BASE}/call/${callId}`, { headers: vapiHeaders() })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getVapiPhoneNumbers(): Promise<VapiPhoneNumber[]> {
  const key = process.env.VAPI_API_KEY
  if (!key) return []
  try {
    const res = await fetch(`${VAPI_BASE}/phone-number`, { headers: vapiHeaders() })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : []
  } catch {
    return []
  }
}

export async function makeOutboundCall(
  phoneNumber: string,
  assistantId: string,
  phoneNumberId?: string
): Promise<{ id: string } | null> {
  const key = process.env.VAPI_API_KEY
  if (!key) return null
  try {
    const body: Record<string, unknown> = {
      assistantId,
      customer: { number: phoneNumber },
    }
    if (phoneNumberId) body.phoneNumberId = phoneNumberId

    const res = await fetch(`${VAPI_BASE}/call/phone`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.id ? { id: json.id } : null
  } catch {
    return null
  }
}

export async function endVapiCall(callId: string): Promise<boolean> {
  const key = process.env.VAPI_API_KEY
  if (!key) return false
  try {
    const res = await fetch(`${VAPI_BASE}/call/${callId}`, {
      method: 'DELETE',
      headers: vapiHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export function isVapiAvailable(): boolean {
  return !!process.env.VAPI_API_KEY
}
