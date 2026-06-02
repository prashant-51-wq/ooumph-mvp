/**
 * /api/workspace-secrets
 *
 * BYOK API key management for a workspace.
 *
 * GET    ?workspaceId=xxx              → list providers with status (no decrypted values)
 * POST   { workspaceId, provider, key }→ save/update a provider key
 * DELETE ?workspaceId=xxx&provider=xxx → remove a provider key
 *
 * POST { workspaceId, provider, action: 'test' } → test a stored key
 *
 * Auth: assertWorkspaceOwnership on all operations.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertWorkspaceOwnership } from '@/lib/guards'
import {
  listWorkspaceSecrets,
  setWorkspaceSecret,
  deleteWorkspaceSecret,
  getWorkspaceSecret,
  recordSecretTest,
} from '@/lib/secrets'

const ALLOWED_PROVIDERS = [
  'openai',
  'anthropic',
  'elevenlabs',
  'stability',
  'replicate',
  'gemini',
  'kling',
  'runway',
  'resend',
  'klaviyo',
  'mailchimp',
] as const
type Provider = typeof ALLOWED_PROVIDERS[number]

function isValidProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p)
}

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  try {
    const secrets = await listWorkspaceSecrets(workspaceId)
    return NextResponse.json({ secrets })
  } catch (err) {
    console.error('[/api/workspace-secrets GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, provider, key, action, label } = body as {
      workspaceId: string
      provider: string
      key?: string
      action?: 'test' | 'save'
      label?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!provider || !isValidProvider(provider)) {
      return NextResponse.json({ error: `Invalid provider. Allowed: ${ALLOWED_PROVIDERS.join(', ')}` }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Test connection (uses stored key OR provided key)
    if (action === 'test') {
      const testKey = key || (await getWorkspaceSecret(workspaceId, provider))
      if (!testKey) return NextResponse.json({ error: 'No key to test', ok: false }, { status: 400 })
      const result = await testProviderKey(provider, testKey)
      if (await getWorkspaceSecret(workspaceId, provider)) {
        await recordSecretTest(workspaceId, provider, result.ok, result.message)
      }
      return NextResponse.json(result)
    }

    // Save / update key
    if (!key || !key.trim()) return NextResponse.json({ error: 'key required' }, { status: 400 })
    await setWorkspaceSecret(workspaceId, provider, key.trim(), label)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/workspace-secrets POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  const provider = req.nextUrl.searchParams.get('provider')
  if (!workspaceId || !provider) {
    return NextResponse.json({ error: 'workspaceId and provider required' }, { status: 400 })
  }
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  try {
    await deleteWorkspaceSecret(workspaceId, provider)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/workspace-secrets DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── Provider connection tests ────────────────────────────────────────────────

async function testProviderKey(
  provider: string,
  key: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) return { ok: true, message: 'Connected · OpenAI API' }
      const err = await res.text().catch(() => '')
      return { ok: false, message: `OpenAI rejected key: ${res.status} ${err.slice(0, 200)}` }
    }
    if (provider === 'anthropic') {
      // Sprint 19G: auth-only check via GET /v1/models. Previously we
      // POSTed a real messages call with a hardcoded model name, which
      // returned 404 for accounts that didn't have that model enabled —
      // even though the key itself was valid. /v1/models just returns
      // the list of models available to the key, no message generation.
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      })
      if (res.status === 200) return { ok: true, message: 'Connected · Anthropic API' }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'Invalid Anthropic API key' }
      }
      const err = await res.text().catch(() => '')
      return { ok: false, message: `Anthropic test: ${res.status} ${err.slice(0, 200)}` }
    }
    if (provider === 'elevenlabs') {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key },
      })
      if (res.ok) return { ok: true, message: 'Connected · ElevenLabs' }
      return { ok: false, message: `ElevenLabs rejected key: ${res.status}` }
    }
    if (provider === 'replicate') {
      const res = await fetch('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${key}` },
      })
      if (res.ok) return { ok: true, message: 'Connected · Replicate' }
      return { ok: false, message: `Replicate rejected key: ${res.status}` }
    }
    if (provider === 'stability') {
      const res = await fetch('https://api.stability.ai/v1/user/account', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) return { ok: true, message: 'Connected · Stability AI' }
      return { ok: false, message: `Stability rejected key: ${res.status}` }
    }
    // Providers without a cheap auth-check endpoint — accept format validation only
    if (provider === 'kling' || provider === 'runway' || provider === 'gemini') {
      if (key.length < 20) return { ok: false, message: 'Key too short' }
      return { ok: true, message: `Saved · ${provider} (no live test available)` }
    }
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) return { ok: true, message: 'Connected · Resend' }
      return { ok: false, message: `Resend rejected key: ${res.status}` }
    }
    if (provider === 'klaviyo') {
      const res = await fetch('https://a.klaviyo.com/api/accounts', {
        headers: {
          Authorization: `Klaviyo-API-Key ${key}`,
          revision: '2024-10-15',
        },
      })
      if (res.ok) return { ok: true, message: 'Connected · Klaviyo' }
      return { ok: false, message: `Klaviyo rejected key: ${res.status}` }
    }
    if (provider === 'mailchimp') {
      // Mailchimp keys include a datacenter suffix like '-us21'
      const dcMatch = key.match(/-([a-z]+\d+)$/)
      if (!dcMatch) return { ok: false, message: 'Mailchimp key must end with -dc (e.g. -us21)' }
      const dc = dcMatch[1]
      const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
        headers: { Authorization: `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}` },
      })
      if (res.ok) return { ok: true, message: 'Connected · Mailchimp' }
      return { ok: false, message: `Mailchimp rejected key: ${res.status}` }
    }
    return { ok: false, message: `Test not implemented for ${provider}` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Test failed' }
  }
}
