/**
 * lib/env-check.ts
 *
 * Deterministic environment checkpoint. Validates critical runtime variables
 * at startup so the app fails loud and fast — before any user request hits a
 * confusing mid-session error — instead of crashing silently at query time.
 *
 * Variable tiers:
 *
 *   Tier 0 — Required to boot. Missing or structurally invalid → hard error.
 *     • POSTGRES_URL     must be a valid postgres(ql):// DSN
 *     • AUTH_SECRET      must be ≥ 32 characters
 *
 *   Tier 1 — Core AI agent processing. Missing → warning (BYOK path still
 *   works per-workspace, so a missing platform key is not a boot blocker).
 *     • ANTHROPIC_API_KEY  should start with "sk-ant-"
 *
 *   Tier 2 — Operational helpers. Missing → info-level advisory.
 *     • NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL
 *     • CRON_SECRET / ADMIN_SECRET
 *     • RESEND_API_KEY / SENDGRID_API_KEY
 *
 * Usage — call once at server startup (e.g. in instrumentation.ts, or lazily
 * on first request via getEnvStatus()):
 *
 *   import { assertEnvReady } from '@/lib/env-check'
 *   assertEnvReady()   // throws EnvCheckError on Tier-0 violations
 *
 * Or for non-throwing, structured diagnostics:
 *
 *   import { checkEnv } from '@/lib/env-check'
 *   const { ok, errors, warnings } = checkEnv()
 */

// ── Validation helpers ──────────────────────────────────────────────────────

const DSN_RE = /^postgres(?:ql)?:\/\/.{3}/i
const ANT_KEY_RE = /^sk-ant-[A-Za-z0-9_\-]{10}/

function present(name: string): string | undefined {
  return process.env[name] || undefined
}

// ── Result types ────────────────────────────────────────────────────────────

export interface EnvIssue {
  tier: 0 | 1 | 2
  variable: string
  message: string
}

export interface EnvCheckResult {
  ok: boolean               // true only if zero Tier-0 errors
  errors: EnvIssue[]        // Tier-0 violations — must fix before running
  warnings: EnvIssue[]      // Tier-1 advisories — degraded functionality
  advisories: EnvIssue[]    // Tier-2 info — nice-to-have, non-blocking
}

// ── Core check ──────────────────────────────────────────────────────────────

/**
 * Run all environment checks and return a structured result.
 * Never throws — safe to call anywhere.
 */
export function checkEnv(): EnvCheckResult {
  const errors: EnvIssue[] = []
  const warnings: EnvIssue[] = []
  const advisories: EnvIssue[] = []

  // ── Tier 0: Required to boot ──────────────────────────────────────────────

  const postgresUrl = present('POSTGRES_URL')
  if (!postgresUrl) {
    errors.push({
      tier: 0,
      variable: 'POSTGRES_URL',
      message: 'Missing. Application cannot connect to the database without this.',
    })
  } else if (!DSN_RE.test(postgresUrl)) {
    errors.push({
      tier: 0,
      variable: 'POSTGRES_URL',
      message:
        'Structurally invalid. Expected a "postgres://" or "postgresql://" DSN. ' +
        'Check for accidental whitespace or a truncated copy-paste.',
    })
  }

  const authSecret = present('AUTH_SECRET')
  if (!authSecret) {
    errors.push({
      tier: 0,
      variable: 'AUTH_SECRET',
      message:
        'Missing. Session tokens and BYOK encryption ciphers require this secret. ' +
        'Generate with: openssl rand -hex 32',
    })
  } else if (authSecret.length < 32) {
    errors.push({
      tier: 0,
      variable: 'AUTH_SECRET',
      message:
        `Too short (${authSecret.length} chars). Must be ≥ 32 characters. ` +
        'Short secrets allow session forgery and BYOK decryption failures.',
    })
  } else if (
    authSecret === 'changeme' ||
    authSecret === 'secret' ||
    authSecret === 'development' ||
    authSecret === 'your-secret-here'
  ) {
    errors.push({
      tier: 0,
      variable: 'AUTH_SECRET',
      message:
        'Looks like a placeholder value. Replace with a real random secret before deploying.',
    })
  }

  // ── Tier 1: Core AI processing ────────────────────────────────────────────

  const anthropicKey = present('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    warnings.push({
      tier: 1,
      variable: 'ANTHROPIC_API_KEY',
      message:
        'Missing. Agent runs will fall back to per-workspace BYOK keys. ' +
        'No platform-level AI features will work until a workspace configures its own key.',
    })
  } else if (!ANT_KEY_RE.test(anthropicKey)) {
    warnings.push({
      tier: 1,
      variable: 'ANTHROPIC_API_KEY',
      message:
        'Unexpected format. Expected a key beginning with "sk-ant-". ' +
        'Confirm this is a valid Anthropic API key.',
    })
  }

  // ── Tier 2: Operational helpers ───────────────────────────────────────────

  const baseUrl = present('NEXT_PUBLIC_BASE_URL') || present('NEXT_PUBLIC_APP_URL')
  if (!baseUrl) {
    advisories.push({
      tier: 2,
      variable: 'NEXT_PUBLIC_BASE_URL',
      message:
        'Missing. Internal service-to-service calls (enrich-lead, workflow triggers) ' +
        'will fall back to localhost:3000 outside of Vercel.',
    })
  }

  if (!present('CRON_SECRET') && !present('ADMIN_SECRET')) {
    advisories.push({
      tier: 2,
      variable: 'CRON_SECRET / ADMIN_SECRET',
      message:
        'Neither secret is set. Cron endpoints are publicly accessible. ' +
        'Set at least one to protect background jobs from external invocation.',
    })
  }

  const hasEmailProvider = present('RESEND_API_KEY') || present('SENDGRID_API_KEY')
  if (!hasEmailProvider) {
    advisories.push({
      tier: 2,
      variable: 'RESEND_API_KEY / SENDGRID_API_KEY',
      message: 'No email provider configured. Transactional emails will silently no-op.',
    })
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    advisories,
  }
}

// ── Hard-fail assertion ─────────────────────────────────────────────────────

export class EnvCheckError extends Error {
  readonly issues: EnvIssue[]
  constructor(issues: EnvIssue[]) {
    const lines = issues.map(i => `  [Tier-${i.tier}] ${i.variable}: ${i.message}`)
    super(
      `Environment check failed — ${issues.length} critical issue(s) must be resolved before booting:\n` +
      lines.join('\n'),
    )
    this.name = 'EnvCheckError'
    this.issues = issues
  }
}

/**
 * Assert that all Tier-0 environment variables are valid. Throws
 * `EnvCheckError` on the first call if any Tier-0 checks fail, so the
 * process crashes immediately rather than serving broken requests.
 *
 * In production: call once in instrumentation.ts.
 * In development: warnings and advisories are logged; errors still throw.
 */
export function assertEnvReady(): void {
  const result = checkEnv()
  const isDev = process.env.NODE_ENV !== 'production'

  // Always surface warnings and advisories so devs see what's missing.
  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.warn(`[env-check] WARNING [Tier-${w.tier}] ${w.variable}: ${w.message}`)
    }
  }
  if (result.advisories.length > 0 && isDev) {
    for (const a of result.advisories) {
      console.info(`[env-check] ADVISORY [Tier-${a.tier}] ${a.variable}: ${a.message}`)
    }
  }

  if (!result.ok) {
    // Throw in production AND development so broken deployments are caught
    // immediately at startup rather than at the first DB query.
    throw new EnvCheckError(result.errors)
  }
}

// ── Lazy singleton for route-level use ─────────────────────────────────────

let _checked = false
let _result: EnvCheckResult | null = null

/**
 * Returns the env check result, running the check at most once per
 * serverless warm instance. Safe to call at the top of any route handler.
 *
 * Does NOT throw — callers decide how to handle the result.
 */
export function getEnvStatus(): EnvCheckResult {
  if (!_checked) {
    _result = checkEnv()
    _checked = true

    if (!_result.ok) {
      // Log at error level but don't throw — routes can degrade gracefully.
      for (const e of _result.errors) {
        console.error(`[env-check] CRITICAL [Tier-${e.tier}] ${e.variable}: ${e.message}`)
      }
    }
  }
  return _result!
}
