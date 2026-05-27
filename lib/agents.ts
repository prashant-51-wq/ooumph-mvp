/**
 * lib/agents.ts — Agent registry helpers (Sprint 2 Commit 2)
 *
 * The `agents` table (created in Sprint 2 Commit 1) holds one row per
 * (workspace_id, name) tracking the agent's lifecycle status:
 *
 *   active   - default; cron workers pick up this agent's work
 *   paused   - operator paused; cron workers skip
 *   error    - flagged by the runner after repeated failures
 *   disabled - soft-deleted by an admin
 *
 * This module centralizes two concerns:
 *
 *   1. `seedDefaultAgents(workspaceId)` — populate the registry with the
 *      canonical agent slugs the UI knows about. Called on workspace
 *      creation so the Agents page has rows to render and operators can
 *      immediately pause/resume them.
 *
 *   2. `isAgentActive(workspaceId, name)` — the cron-worker gate. Every
 *      cron route that runs agent work should call this BEFORE doing
 *      work, so paused agents stop being invoked on the next tick.
 *
 * Architecture rationale (per the Sprint 2 plan):
 * We gate via a DB status column read by the cron tick, NOT external
 * process teardown — the Vercel serverless deployment model has no
 * daemons to SIGTERM. In-flight runs (already started by a prior tick)
 * complete normally; the next tick reads `status = 'active'` and skips.
 * This is the simplest primitive that maps cleanly to how this app
 * actually runs.
 */

import { sql, newId } from './db'

// ─── Canonical agent slugs ─────────────────────────────────────────────────────
//
// Matches the agent IDs in app/dashboard/agents/page.tsx so the UI's list and
// the DB registry stay in sync. Update both when adding a new agent.
//
// Supervisors orchestrate; workers execute. The cron gate works on both —
// pausing a supervisor effectively pauses all its workers because the
// supervisor stops dispatching tasks.

export const DEFAULT_AGENTS: Array<{ name: string; category: 'supervisor' | 'worker' }> = [
  // ── Supervisors ──
  { name: 'cmo',              category: 'supervisor' },
  { name: 'content-sup',      category: 'supervisor' },
  { name: 'growth-sup',       category: 'supervisor' },
  { name: 'engagement-sup',   category: 'supervisor' },
  { name: 'intelligence-sup', category: 'supervisor' },
  { name: 'brand-sup',        category: 'supervisor' },
  // ── Workers ──
  { name: 'blog-writer',     category: 'worker' },
  { name: 'social-agent',    category: 'worker' },   // ← gated by publish-scheduled cron
  { name: 'email-copy',      category: 'worker' },
  { name: 'ad-copy',         category: 'worker' },
  { name: 'seo-agent',       category: 'worker' },
  { name: 'lead-scorer',     category: 'worker' },
  { name: 'outreach-agent',  category: 'worker' },
  { name: 'crm-agent',       category: 'worker' },
  { name: 'brand-monitor',   category: 'worker' },
  { name: 'reputation',      category: 'worker' },
  { name: 'analytics',       category: 'worker' },
]

export type AgentStatus = 'active' | 'paused' | 'error' | 'disabled'

/** The four-state CHECK constraint on agents.status. Keep in sync with the
 *  migration in lib/db.ts. */
const VALID_STATUSES: AgentStatus[] = ['active', 'paused', 'error', 'disabled']

export function isValidAgentStatus(s: unknown): s is AgentStatus {
  return typeof s === 'string' && (VALID_STATUSES as string[]).includes(s)
}

// ─── Seeding ───────────────────────────────────────────────────────────────────

/**
 * Idempotently insert one row per canonical agent for the given workspace.
 * Called from workspace creation (`/api/workspaces` POST) so a brand-new
 * workspace's Agents page renders with real registry rows immediately.
 *
 * Uses the (workspace_id, name) UNIQUE index to avoid duplicates on re-seed.
 * Errors per-row are swallowed and counted so a single bad row can't break
 * the whole seed (Postgres ON CONFLICT would be cleaner but the SQLite path
 * doesn't honour ON CONFLICT DO NOTHING the same way, and we keep the
 * adapter layer simple).
 *
 * Returns the number of rows actually inserted (excluding duplicates).
 */
export async function seedDefaultAgents(workspaceId: string): Promise<{ inserted: number }> {
  let inserted = 0
  for (const a of DEFAULT_AGENTS) {
    try {
      // Probe first; INSERT only if absent. Avoids relying on engine-specific
      // ON CONFLICT semantics in the tagged-template sql layer.
      const existing = await sql`
        SELECT 1 FROM agents
        WHERE workspace_id = ${workspaceId} AND name = ${a.name}
        LIMIT 1
      `
      if (existing.rows.length > 0) continue
      await sql`
        INSERT INTO agents (id, workspace_id, name, status, created_at, updated_at)
        VALUES (${newId()}, ${workspaceId}, ${a.name}, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      inserted++
    } catch (err) {
      // Don't let one bad row block the rest — log and continue.
      console.error(`[seedDefaultAgents] failed to seed ${a.name} for ${workspaceId}:`, err)
    }
  }
  return { inserted }
}

// ─── Status lookups (cron workers call these) ─────────────────────────────────

/** Returns the current lifecycle status for an agent, or null if there's
 *  no registry row (treat as "unknown"). Cron workers should treat null
 *  as `active` to avoid silently bricking workspaces that haven't been
 *  seeded yet. */
export async function getAgentStatus(
  workspaceId: string,
  name: string,
): Promise<AgentStatus | null> {
  const r = await sql`
    SELECT status FROM agents
    WHERE workspace_id = ${workspaceId} AND name = ${name}
    LIMIT 1
  `
  const row = r.rows[0] as { status?: string } | undefined
  if (!row?.status) return null
  return isValidAgentStatus(row.status) ? row.status : null
}

/**
 * The cron-worker gate. Returns true if the cron should process work for
 * this agent on this workspace.
 *
 * Failure semantics:
 *   - No registry row exists → treat as active (don't brick fresh workspaces)
 *   - status === 'active'    → true
 *   - status === 'paused'    → false (operator paused — skip until resume)
 *   - status === 'error'     → false (system flagged — skip until cleared)
 *   - status === 'disabled'  → false (admin disabled — skip permanently)
 *   - DB query throws        → true (fail open; better to retry than lose work)
 *
 * Cron workers that batch by workspace should cache the result per
 * workspace within a single tick to avoid N+1 queries — see
 * `buildAgentActiveCache` below for the helper.
 */
export async function isAgentActive(
  workspaceId: string,
  name: string,
): Promise<boolean> {
  try {
    const status = await getAgentStatus(workspaceId, name)
    if (status === null) return true       // unseeded workspace → active default
    return status === 'active'
  } catch (err) {
    console.error(`[isAgentActive] DB read failed for ${name}/${workspaceId}:`, err)
    return true                            // fail open
  }
}

/**
 * Build a per-(workspaceId, agent) cache for one cron tick. Each entry is
 * resolved on first read, then memoized. Use this when a single cron tick
 * processes rows from many workspaces — it collapses the workspace-status
 * lookups from O(rows) to O(unique workspaces).
 */
export function buildAgentActiveCache(name: string): (workspaceId: string) => Promise<boolean> {
  const cache = new Map<string, boolean>()
  return async (workspaceId: string): Promise<boolean> => {
    const hit = cache.get(workspaceId)
    if (hit !== undefined) return hit
    const v = await isAgentActive(workspaceId, name)
    cache.set(workspaceId, v)
    return v
  }
}
