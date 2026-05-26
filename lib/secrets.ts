/**
 * lib/secrets.ts
 * BYOK secret storage with AES-256-GCM encryption.
 *
 * Secrets are encrypted at rest in `workspace_secrets` table.
 * The master key is derived from AUTH_SECRET (env-only).
 *
 * Usage:
 *   await setWorkspaceSecret(workspaceId, 'openai', 'sk-...')
 *   const key = await getWorkspaceSecret(workspaceId, 'openai')
 *   // key === 'sk-...' (or null if not set)
 */

import crypto from 'crypto'
import { sql, newId } from '@/lib/db'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const KEY_LENGTH = 32
const TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'ooumph-dev-secret-change-in-production'
  // Derive a 32-byte key from AUTH_SECRET
  return crypto.scryptSync(secret, 'ooumph-secret-salt', KEY_LENGTH)
}

export function encryptSecret(plaintext: string): string {
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(encrypted: string): string | null {
  try {
    const parts = encrypted.split(':')
    if (parts.length !== 3) return null
    const [ivB64, tagB64, ctB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const ct = Buffer.from(ctB64, 'base64')
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null
    const key = getMasterKey()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()])
    return plaintext.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Mask a secret value for display (show first 4 + last 4 only).
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length <= 8) return '••••••••'
  return `${secret.slice(0, 4)}${'•'.repeat(Math.min(secret.length - 8, 16))}${secret.slice(-4)}`
}

/**
 * Get a workspace BYOK secret. Returns null if not set.
 */
export async function getWorkspaceSecret(
  workspaceId: string,
  provider: string,
): Promise<string | null> {
  const result = await sql`
    SELECT encrypted_value FROM workspace_secrets
    WHERE workspace_id = ${workspaceId} AND provider = ${provider} AND status = 'active'
    LIMIT 1
  `
  const row = result.rows[0] as { encrypted_value?: string } | undefined
  if (!row?.encrypted_value) return null
  return decryptSecret(row.encrypted_value)
}

/**
 * Set or update a workspace BYOK secret.
 */
export async function setWorkspaceSecret(
  workspaceId: string,
  provider: string,
  plaintext: string,
  label?: string,
): Promise<void> {
  const encrypted = encryptSecret(plaintext)
  const existing = await sql`
    SELECT id FROM workspace_secrets
    WHERE workspace_id = ${workspaceId} AND provider = ${provider}
    LIMIT 1
  `
  if ((existing.rows[0] as { id?: string } | undefined)?.id) {
    await sql`
      UPDATE workspace_secrets
      SET encrypted_value = ${encrypted}, label = ${label || null}, status = 'active', updated_at = ${new Date().toISOString()}
      WHERE workspace_id = ${workspaceId} AND provider = ${provider}
    `
  } else {
    await sql`
      INSERT INTO workspace_secrets (id, workspace_id, provider, encrypted_value, label, status)
      VALUES (${newId()}, ${workspaceId}, ${provider}, ${encrypted}, ${label || null}, 'active')
    `
  }
}

/**
 * Delete a workspace BYOK secret.
 */
export async function deleteWorkspaceSecret(
  workspaceId: string,
  provider: string,
): Promise<void> {
  await sql`
    DELETE FROM workspace_secrets
    WHERE workspace_id = ${workspaceId} AND provider = ${provider}
  `
}

/**
 * Get all providers a workspace has secrets for (returns metadata only, NOT decrypted values).
 */
export async function listWorkspaceSecrets(workspaceId: string): Promise<
  Array<{ provider: string; label: string | null; status: string; last_tested_at: string | null; test_result: string | null; updated_at: string }>
> {
  const result = await sql`
    SELECT provider, label, status, last_tested_at, test_result, updated_at
    FROM workspace_secrets
    WHERE workspace_id = ${workspaceId}
    ORDER BY provider ASC
  `
  return result.rows as Array<{
    provider: string
    label: string | null
    status: string
    last_tested_at: string | null
    test_result: string | null
    updated_at: string
  }>
}

/**
 * Resolve provider key: workspace BYOK first, fallback to env.
 */
export async function resolveProviderKey(
  workspaceId: string,
  provider: 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'replicate' | 'gemini' | 'kling' | 'runway' | 'resend',
): Promise<string | null> {
  const byok = await getWorkspaceSecret(workspaceId, provider)
  if (byok) return byok
  // Fallback to env
  const envMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    stability: process.env.STABILITY_API_KEY,
    replicate: process.env.REPLICATE_API_TOKEN,
    gemini: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
    kling: process.env.KLING_API_KEY,
    runway: process.env.RUNWAY_API_KEY,
    resend: process.env.RESEND_API_KEY,
  }
  return envMap[provider] || null
}

/**
 * Update the test result for a provider key.
 */
export async function recordSecretTest(
  workspaceId: string,
  provider: string,
  success: boolean,
  message?: string,
): Promise<void> {
  await sql`
    UPDATE workspace_secrets
    SET last_tested_at = ${new Date().toISOString()},
        test_result = ${success ? 'success' : 'failed'},
        label = ${message || null}
    WHERE workspace_id = ${workspaceId} AND provider = ${provider}
  `
}
