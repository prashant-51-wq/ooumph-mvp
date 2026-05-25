import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  getVapiAssistants,
  createVapiAssistant,
  getVapiCalls,
  getVapiCall,
  getVapiPhoneNumbers,
  makeOutboundCall,
  isVapiAvailable,
} from '@/lib/tools/vapi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      action,
      name,
      systemPrompt,
      firstMessage,
      voiceProvider,
      voiceId,
      model,
      callId,
      phoneNumber,
      assistantId,
      phoneNumberId,
      limit,
    }: {
      workspaceId: string
      action: 'assistants' | 'create_assistant' | 'calls' | 'call_detail' | 'phone_numbers' | 'make_call'
      name?: string
      systemPrompt?: string
      firstMessage?: string
      voiceProvider?: string
      voiceId?: string
      model?: string
      callId?: string
      phoneNumber?: string
      assistantId?: string
      phoneNumberId?: string
      limit?: number
    } = body

    if (!workspaceId || !action) {
      return NextResponse.json({ error: 'workspaceId and action are required' }, { status: 400 })
    }

    // 1. Fetch workspace settings and inject API key
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    process.env.VAPI_API_KEY = settings.vapiApiKey || ''

    if (!isVapiAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Vapi API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // 2. Handle actions
    if (action === 'assistants') {
      const assistants = await getVapiAssistants()
      return NextResponse.json({ ok: true, assistants })
    }

    if (action === 'create_assistant') {
      if (!name) {
        return NextResponse.json({ error: 'name is required for create_assistant' }, { status: 400 })
      }

      const assistant = await createVapiAssistant({
        name,
        model: {
          provider: 'anthropic',
          model: model || 'claude-3-5-haiku-20241022',
          systemPrompt,
          temperature: 0.7,
        },
        voice: {
          provider: voiceProvider || '11labs',
          voiceId: voiceId || '21m00Tcm4TlvDq8ikWAM',
        },
        firstMessage,
        recordingEnabled: true,
      })

      return NextResponse.json({ ok: true, assistant })
    }

    if (action === 'calls') {
      const calls = await getVapiCalls(limit || 20)
      return NextResponse.json({ ok: true, calls })
    }

    if (action === 'call_detail') {
      if (!callId) {
        return NextResponse.json({ error: 'callId is required for call_detail' }, { status: 400 })
      }

      const call = await getVapiCall(callId)
      return NextResponse.json({ ok: true, call })
    }

    if (action === 'phone_numbers') {
      const phoneNumbers = await getVapiPhoneNumbers()
      return NextResponse.json({ ok: true, phoneNumbers })
    }

    if (action === 'make_call') {
      if (!phoneNumber || !assistantId) {
        return NextResponse.json({ error: 'phoneNumber and assistantId are required for make_call' }, { status: 400 })
      }

      if (!phoneNumber.startsWith('+')) {
        return NextResponse.json({
          error: 'Phone number must start with + (e.g. +12025551234)',
        }, { status: 400 })
      }

      const result = await makeOutboundCall(phoneNumber, assistantId, phoneNumberId)
      return NextResponse.json({ ok: true, callId: result.id, message: 'Call initiated' })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Vapi agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
