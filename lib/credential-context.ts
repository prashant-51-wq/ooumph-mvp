/**
 * lib/credential-context.ts
 *
 * Request-scoped credential context using AsyncLocalStorage. This replaces
 * the previous pattern where agent routes did
 *
 *   process.env.META_ACCESS_TOKEN = settings.metaAccessToken
 *   await someToolCall()
 *
 * which mutates the process-wide env and races across concurrent requests
 * from different tenants — workspace A's call could be charged to
 * workspace B's token if their requests overlapped.
 *
 * Now routes wrap the call in `withCredentials({ META_ACCESS_TOKEN: '…' }, fn)`
 * and tools read via `getCredential('META_ACCESS_TOKEN')`, which checks the
 * async-local store first and falls back to `process.env` for env-bound
 * shared infrastructure tokens.
 *
 * The store is per async chain (Node's AsyncLocalStorage), so concurrent
 * requests stay isolated without leaking credentials process-wide.
 */
import { AsyncLocalStorage } from 'async_hooks'

type CredentialMap = Record<string, string | undefined>

const credentialStore = new AsyncLocalStorage<CredentialMap>()

/**
 * Run `fn` with the given credentials available to any tool call inside.
 * Reads via `getCredential()` will see these values; outside this scope
 * they fall back to `process.env`.
 *
 * Empty/undefined values are dropped so they don't mask a real env fallback.
 */
export function withCredentials<T>(
  creds: CredentialMap,
  fn: () => Promise<T>,
): Promise<T> {
  const filtered: CredentialMap = {}
  for (const [k, v] of Object.entries(creds)) {
    if (v !== undefined && v !== null && v !== '') filtered[k] = v
  }
  // Merge with any outer scope so nested calls inherit.
  const outer = credentialStore.getStore() || {}
  return credentialStore.run({ ...outer, ...filtered }, fn)
}

/**
 * Read a credential. Checks the request-scoped store first, then
 * `process.env`. Use this everywhere a tool would have read
 * `process.env.X` for a BYOK-overrideable key.
 */
export function getCredential(name: string): string | undefined {
  const store = credentialStore.getStore()
  if (store && store[name]) return store[name]
  return process.env[name]
}
