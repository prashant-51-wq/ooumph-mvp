/**
 * lib/segment-trigger.ts — Sprint 17C (audit P1 #7)
 *
 * Helper invoked by lead-capture endpoints (/api/lp-submit, /api/f/submit,
 * /api/leads-captured POST) to fire `lead_added_to_segment` workflow
 * triggers when a newly captured lead matches any persisted segment.
 *
 * Loads all segments for a workspace, runs the same rule-evaluation logic
 * as /api/workflows/trigger leadMatchesSegment, and posts to
 * /api/workflows/trigger once per matched segment. All work is
 * fire-and-forget — caller awaits if it cares about completion but lead
 * capture should never block on this.
 *
 * Avoid double-trigger on lead edits: this helper is only intended to be
 * called from the *capture* path (new row insert), never from PATCH. The
 * audit note explicitly called this out.
 */
import { sql } from '@/lib/db'

interface SegmentRule {
  statuses?: string[]
  sources?: string[]
  minScore?: number
  maxScore?: number
  createdSince?: string
  campaignLike?: string
  rfm?: { tier?: string[] }
}

/**
 * Heuristic RFM-tier derivation for a freshly-captured lead. Mirrors the
 * computation in app/dashboard/leads-crm/page.tsx (`leadToContact`) so the
 * trigger fires the same set of segments the dashboard renders. A fresh
 * lead has no activity → frequency = 1, no closed deal value → monetary = 1,
 * created today → recency = 5. That deterministically lands in 'New Customer'
 * for almost every brand-new lead, which is the only tier the trigger can
 * honestly assign at capture time.
 */
function deriveRfmTier(lead: { score?: number; created_at?: string }): string {
  const lastActivity = lead.created_at || new Date().toISOString()
  const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 86400000
  const recency = daysSinceActivity < 7 ? 5 : daysSinceActivity < 30 ? 4 : daysSinceActivity < 60 ? 3 : daysSinceActivity < 90 ? 2 : 1
  const frequency = 1 // a brand-new lead has no recorded activity yet
  const monetary = 1 // no deal value at capture
  if (recency >= 4 && frequency >= 4 && monetary >= 4) return 'Champion'
  if (recency >= 4 && frequency >= 3) return 'Loyal'
  if (recency >= 3 && frequency >= 2) return 'Potential Loyalist'
  if (recency <= 2 && frequency >= 3) return 'At Risk'
  if (recency <= 2) return 'Lost'
  return 'New Customer'
}

function leadMatches(
  lead: { status?: string; source?: string; campaign?: string; score?: number; created_at?: string },
  rule: SegmentRule,
): boolean {
  if (rule.statuses?.length && !rule.statuses.includes(String(lead.status || ''))) return false
  if (rule.sources?.length && !rule.sources.includes(String(lead.source || ''))) return false
  if (typeof rule.minScore === 'number' && Number(lead.score || 0) < rule.minScore) return false
  if (typeof rule.maxScore === 'number' && Number(lead.score || 0) > rule.maxScore) return false
  if (rule.campaignLike && !String(lead.campaign || '').toLowerCase().includes(rule.campaignLike.toLowerCase())) return false
  if (rule.createdSince) {
    const since = new Date(rule.createdSince).getTime()
    const created = new Date(String(lead.created_at || '')).getTime()
    if (!Number.isFinite(created) || created < since) return false
  }
  // Sprint 18C: previously the rule.rfm.tier branch was skipped entirely, so
  // segments scoped by RFM tier never fired at capture time. We now derive
  // a heuristic tier from the lead's score + recency and match against the
  // rule's allowed tiers. This keeps behavior consistent with the dashboard.
  if (rule.rfm?.tier?.length) {
    const tier = deriveRfmTier(lead)
    if (!rule.rfm.tier.includes(tier)) return false
  }
  return true
}

/**
 * Find all segments the lead belongs to and fire one
 * `lead_added_to_segment` workflow trigger event per match.
 *
 * Errors are swallowed — lead capture must never break because of a
 * segment misconfiguration.
 */
export async function fireSegmentTriggersForNewLead(opts: {
  workspaceId: string
  leadId: string
  contactEmail?: string | null
}): Promise<void> {
  const { workspaceId, leadId, contactEmail } = opts
  if (!workspaceId || !leadId) return
  try {
    const segRes = await sql`
      SELECT id, rule_json FROM lead_segments WHERE workspace_id = ${workspaceId}
    `
    if (segRes.rows.length === 0) return

    const lr = await sql`
      SELECT status, source, campaign, score, created_at
      FROM leads_captured WHERE id = ${leadId} LIMIT 1
    `
    const lead = lr.rows[0] as
      | { status?: string; source?: string; campaign?: string; score?: number; created_at?: string }
      | undefined
    if (!lead) return

    const matchedSegmentIds: string[] = []
    for (const row of segRes.rows) {
      const r = row as { id?: string; rule_json?: string }
      let rule: SegmentRule = {}
      try { rule = JSON.parse(String(r.rule_json || '{}')) as SegmentRule } catch {}
      if (leadMatches(lead, rule) && r.id) matchedSegmentIds.push(String(r.id))
    }
    if (matchedSegmentIds.length === 0) return

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
    if (!baseUrl) return
    const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || ''

    for (const segmentId of matchedSegmentIds) {
      // Fire-and-forget per matched segment.
      void fetch(`${baseUrl}/api/workflows/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
        },
        body: JSON.stringify({
          workspaceId,
          triggerType: 'lead_added_to_segment',
          leadId,
          contactEmail: contactEmail ?? null,
          data: { segmentId },
        }),
      }).catch(() => undefined)
    }
  } catch {
    // Non-fatal — lead capture must succeed regardless.
  }
}
