'use client'

/**
 * ProviderConnectBanner — Sprint 19D
 *
 * Reusable "Connect <Provider> to enable this feature" banner with an
 * inline paste-and-test form. Designed to live at the point of use
 * (above the editor / generator that the missing key blocks) so users
 * never leave the page to attach credentials.
 *
 * Two test modes:
 *  - 'workspace-secrets' — single-key providers (openai, elevenlabs,
 *    stability, resend, runway, etc.). Routes to `/api/workspace-secrets`
 *    with `action: 'test'` then save. Persisted encrypted at rest.
 *  - 'cloudinary-dedicated' — Cloudinary's 3-key shape. Routes to
 *    `/api/integrations/cloudinary/test` which verifies via Cloudinary's
 *    `/usage` endpoint and persists to workspaces.model_settings.
 *
 * The parent owns the "is configured?" check via the `ready` prop, and
 * the component calls `onConnected()` so the parent can refetch state +
 * unlock its own UI.
 */
import { useState } from 'react'

export interface ProviderFieldDef {
  /** Display label, e.g. 'API Key', 'Cloud Name'. */
  label: string
  /** Placeholder text shown inside the input. */
  placeholder?: string
  /** Render as masked password input (default: false unless label
   *  contains Key/Secret/Token/Password). */
  password?: boolean
  /** Key name passed to the test endpoint. For Cloudinary this is one of
   *  `cloudName`/`apiKey`/`apiSecret`. For workspace-secrets mode the
   *  first field is the only one used (sent as `key`). */
  payloadKey: string
}

interface Props {
  /** Render only when this is true (parent gates). Banner shows when
   *  `ready === false`. While `null` we render nothing (loading). */
  ready: boolean | null
  workspaceId: string | null
  providerId: string                // e.g. 'cloudinary', 'elevenlabs'
  providerName: string              // 'Cloudinary', 'ElevenLabs'
  icon?: string                     // emoji
  /** Short pitch — what unlocking this provider gives the user. */
  description: string
  signupUrl: string
  keysHelpUrl: string
  freeTierNote: string
  fields: ProviderFieldDef[]
  testMode: 'workspace-secrets' | 'cloudinary-dedicated'
  /** Called after a successful Test → save round-trip. Parent refetches
   *  its own state to unlock the UI. */
  onConnected?: () => void
}

interface TestResponse { ok: boolean; message?: string; error?: string; plan?: string }

function isPassword(f: ProviderFieldDef): boolean {
  if (f.password !== undefined) return f.password
  return /Key|Secret|Token|Password/i.test(f.label)
}

export function ProviderConnectBanner(props: Props) {
  const {
    ready, workspaceId, providerId, providerName,
    icon, description, signupUrl, keysHelpUrl, freeTierNote,
    fields, testMode, onConnected,
  } = props

  const [formOpen, setFormOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [resultOk, setResultOk] = useState<boolean | null>(null)

  if (ready === null) return null
  if (ready === true) return null   // configured — banner hides

  const setField = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }))

  async function runTest() {
    if (!workspaceId) { setResultOk(false); setResultMsg('Workspace not loaded yet.'); return }
    // Validate all fields present
    for (const f of fields) {
      if (!values[f.payloadKey]?.trim()) {
        setResultOk(false); setResultMsg(`${f.label} is required.`); return
      }
    }
    setTesting(true); setResultMsg(null); setResultOk(null)
    try {
      let res: Response
      if (testMode === 'cloudinary-dedicated') {
        res = await fetch('/api/integrations/cloudinary/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workspaceId,
            cloudName: values.cloudName,
            apiKey: values.apiKey,
            apiSecret: values.apiSecret,
          }),
        })
      } else {
        // workspace-secrets mode: test, then save on success.
        const key = values[fields[0].payloadKey].trim()
        const testRes = await fetch('/api/workspace-secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ workspaceId, provider: providerId, action: 'test', key }),
        })
        const testData = await testRes.json() as TestResponse
        if (!testData.ok) {
          setResultOk(false); setResultMsg(testData.message || testData.error || 'Connection failed')
          setTesting(false); return
        }
        // Persist on success.
        await fetch('/api/workspace-secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ workspaceId, provider: providerId, key }),
        })
        setResultOk(true)
        setResultMsg(testData.message || 'Connected and saved.')
        setTimeout(() => { setFormOpen(false); onConnected?.() }, 1200)
        setTesting(false); return
      }

      const data = await res.json() as TestResponse
      if (data.ok) {
        setResultOk(true)
        setResultMsg((data.message || 'Connected.') + (data.plan ? ` (plan: ${data.plan})` : ''))
        setTimeout(() => { setFormOpen(false); onConnected?.() }, 1200)
      } else {
        setResultOk(false)
        setResultMsg(data.message || data.error || 'Connection failed')
      }
    } catch (err) {
      setResultOk(false)
      setResultMsg(err instanceof Error ? err.message : 'Network error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mb-3 bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium mb-1">
            Connect {providerName} to enable this
          </p>
          <p className="text-gray-400 text-xs leading-relaxed">
            {description}{' '}
            <span className="text-emerald-300 font-medium">{freeTierNote}</span>
          </p>

          {!formOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5">
                <span>Sign up free at {providerName}</span>
                <span aria-hidden>↗</span>
              </a>
              <button
                onClick={() => setFormOpen(true)}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">
                Already have keys? Paste here →
              </button>
            </div>
          )}

          {formOpen && (
            <div className="mt-3 bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-300 text-[11px] font-medium">
                  Paste your {providerName} key{fields.length > 1 ? 's' : ''}
                </span>
                <a
                  href={keysHelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 text-[10px]">
                  Where do I find {fields.length > 1 ? 'these' : 'this'}? ↗
                </a>
              </div>
              {fields.map(f => (
                <input
                  key={f.payloadKey}
                  type={isPassword(f) ? 'password' : 'text'}
                  value={values[f.payloadKey] || ''}
                  onChange={e => setField(f.payloadKey, e.target.value)}
                  placeholder={f.placeholder || f.label}
                  autoComplete={isPassword(f) ? 'new-password' : 'off'}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-800 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              ))}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => void runTest()}
                  disabled={testing}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium">
                  {testing ? 'Testing…' : 'Test & Connect'}
                </button>
                <button
                  onClick={() => { setFormOpen(false); setResultMsg(null); setResultOk(null) }}
                  className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs">
                  Cancel
                </button>
                {resultMsg && (
                  <span className={`text-[11px] ${resultOk ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {resultOk ? '✓ ' : '✕ '}{resultMsg}
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-[10px] pt-1">
                On a successful test we save the key{fields.length > 1 ? 's' : ''} to your
                workspace settings (encrypted at rest in production).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
