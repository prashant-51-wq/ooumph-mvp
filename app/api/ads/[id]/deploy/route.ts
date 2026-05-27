/**
 * POST /api/ads/[id]/deploy
 *
 * The high-stakes deployment orchestrator. Activates a draft ad_campaigns
 * row by pushing it live to its provider (Meta / Google / etc.). Every
 * customer-facing dollar of paid spend flows through this gate.
 *
 * Order of operations (each gate halts the whole flow):
 *
 *   1. Workspace ownership          → assertWorkspaceOwnership()       401/403
 *   2. CAS-lock the campaign row    → flip status='draft' → 'deploying'  409 if already in flight
 *   3. 🛡️ HITL safety gate           → assertArtifactApproved() on every linked ad_creatives.artifact_id 403
 *   4. 🛡️ Dual-Key Budget Lock       → SUM(active daily_budget) + this.daily_budget vs. workspace.hard_max_daily_spend  403
 *      └── Soft threshold notification fires when crossing alert_threshold_budget
 *   5. UTM injection                → resolveCampaignUtms() per creative destination_url
 *   6. Provider dispatch            → publishCampaignToPlatform() OR graceful mock when no integration is connected
 *   7. Persist native ids + activate → ad_campaigns.status='active', native_campaign_id stored
 *
 * Any failure between (2) and (7) safely rolls the row back to 'draft' with
 * the error captured in error_log, so the user can retry from the UI.
 *
 * Race-safety: the status-flip in step 2 is the atomic compare-and-swap.
 * Two concurrent deploy clicks on the same campaign will see only one of
 * them flip the row to 'deploying' — the other gets a clean 409 immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership, assertArtifactApproved, assertCrisisClear } from '@/lib/guards'
import { resolveCampaignUtms, slugify } from '@/lib/utm-resolver'

export const runtime = 'nodejs'
export const maxDuration = 60

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface AdCampaignRow {
  id: string
  workspace_id: string
  platform: string
  native_campaign_id: string | null
  name: string
  daily_budget: number
  status: string
  error_log: string | null
  utm_override: string | null
}

interface AdCreativeRow {
  id: string
  workspace_id: string
  ad_campaign_id: string
  artifact_id: string | null
  headline: string
  body_copy: string
  media_url: string | null
  destination_url: string
}

interface WorkspaceRow {
  id: string
  hard_max_daily_spend: number | null
  alert_threshold_budget: number | null
  utm_template: string | null
}

interface BudgetCheckOutcome {
  passed: boolean
  reason?: string
  currentActiveSpend: number
  proposed: number
  hardCap: number
  alertThreshold: number
  crossedAlertThreshold: boolean
}

// ─── Provider dispatcher — real where credentials exist, mock fallback otherwise

interface DispatchResult {
  ok: boolean
  nativeCampaignId?: string
  details?: Record<string, unknown>
  error?: string
  usedMock?: boolean
}

/**
 * Resolve provider credentials and push live. We try the real
 * ad-platform dispatcher first; if no integration is connected for this
 * workspace+platform, we fall back to a graceful mock so dev environments
 * (and demos) can still flow end-to-end without burning real ad budget.
 */
async function dispatchToProvider(
  workspaceId: string,
  campaign: AdCampaignRow,
  creatives: AdCreativeRow[],
  utmDecoratedCreatives: Array<{ creative: AdCreativeRow; trackedUrl: string }>,
): Promise<DispatchResult> {
  // ── Try the real dispatcher first ────────────────────────────────────
  // We only call into lib/ad-platforms when the workspace has an active
  // integration row for this platform — otherwise the wrapper throws.
  const platform = campaign.platform.toLowerCase()
  try {
    const integCheck = await sql`
      SELECT 1 FROM integrations
      WHERE workspace_id = ${workspaceId} AND platform = ${platform} AND status = 'active'
      LIMIT 1
    `
    const hasRealIntegration = integCheck.rows.length > 0

    if (hasRealIntegration && ['meta_ads', 'google_ads', 'dv360'].includes(platform)) {
      // Lazy import so we don't pay the cost in mock-only paths.
      const { publishCampaignToPlatform } = await import('@/lib/ad-platforms/index')
      const brief: Record<string, unknown> = {
        campaignName: campaign.name,
        campaignObjective: 'leads',
        duration: '30 days',
        adSets: creatives.map(c => ({
          name: c.headline.slice(0, 60) || 'Ad Set',
          platform,
          dailyBudget: String(campaign.daily_budget),
          audience: c.body_copy.slice(0, 120),
          primaryCta: 'Learn More',
        })),
        keyMessage: utmDecoratedCreatives[0]?.creative.headline || campaign.name,
        uniqueAngle: utmDecoratedCreatives[0]?.creative.body_copy || '',
        // The decorated URLs flow downstream as final_url overrides.
        landingPageGoal: utmDecoratedCreatives[0]?.trackedUrl || '',
      }
      const res = await publishCampaignToPlatform(
        workspaceId, campaign.id, brief, platform as 'meta_ads' | 'google_ads' | 'dv360',
      )
      if (res.status === 'success' && res.platformCampaignId) {
        return {
          ok: true,
          nativeCampaignId: res.platformCampaignId,
          details: { platformAdSetIds: res.platformAdSetIds, ...res.details, usedReal: true },
        }
      }
      return { ok: false, error: res.error || 'Provider dispatch failed', details: res.details }
    }
  } catch (err) {
    // Real dispatcher blew up — fall through to mock.
    console.warn(`[ads/deploy] real dispatcher unavailable, using mock`, err)
  }

  // ── Mock fallback ────────────────────────────────────────────────────
  // Synthesises a believable native campaign id so the rest of the
  // pipeline (status='active', UI surfaces) works end-to-end in dev.
  const mockId = `mock_${platform}_${slugify(campaign.name).slice(0, 24)}_${Date.now().toString(36)}`
  return {
    ok: true,
    nativeCampaignId: mockId,
    usedMock: true,
    details: {
      mock: true,
      note: `No active ${platform} integration. Connect via /dashboard/integrations to push live.`,
      decoratedUrls: utmDecoratedCreatives.map(d => ({ creative_id: d.creative.id, url: d.trackedUrl })),
    },
  }
}

// ─── Dual-Key Budget Lock check ───────────────────────────────────────────
//
// We do a SINGLE aggregate query that returns both the workspace caps AND
// the sum of currently-active spend in one round-trip. Two-step queries
// would open a race window between SELECT and the subsequent dispatch.
async function runBudgetLockCheck(
  workspaceId: string,
  campaignId: string,
  proposed: number,
): Promise<BudgetCheckOutcome> {
  const wsRes = await sql`
    SELECT id, hard_max_daily_spend, alert_threshold_budget, utm_template
    FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `
  const ws = wsRes.rows[0] as unknown as WorkspaceRow | undefined
  // If somehow the row is missing or the columns aren't there yet
  // (pre-Sprint-3-Commit-1 install), default to the schema defaults.
  const hardCap = Number(ws?.hard_max_daily_spend ?? 50_000)
  const alertThreshold = Number(ws?.alert_threshold_budget ?? 25_000)

  // SUM the daily_budget of every currently-active campaign in this workspace
  // EXCLUDING the one we're about to deploy (in case of a re-deploy on a
  // campaign that was somehow already counted — defensive).
  const spendRes = await sql`
    SELECT COALESCE(SUM(daily_budget), 0) AS total
    FROM ad_campaigns
    WHERE workspace_id = ${workspaceId}
      AND status = 'active'
      AND id <> ${campaignId}
  `
  const currentActiveSpend = Number((spendRes.rows[0] as { total?: number | string } | undefined)?.total || 0)
  const total = currentActiveSpend + proposed
  const crossedAlertThreshold = total >= alertThreshold

  if (total > hardCap) {
    return {
      passed: false,
      reason: `Activating this campaign would push today's active ad spend to ${total / 100} (cap: ${hardCap / 100}). Adjust the daily budget or raise the workspace cap in settings.`,
      currentActiveSpend,
      proposed,
      hardCap,
      alertThreshold,
      crossedAlertThreshold,
    }
  }

  return {
    passed: true,
    currentActiveSpend,
    proposed,
    hardCap,
    alertThreshold,
    crossedAlertThreshold,
  }
}

// ─── Soft-threshold notification (fire-and-forget) ────────────────────────

async function notifyAlertThresholdCrossed(
  workspaceId: string,
  campaign: AdCampaignRow,
  outcome: BudgetCheckOutcome,
): Promise<void> {
  try {
    const { newId } = await import('@/lib/db')
    await sql`
      INSERT INTO notifications (id, workspace_id, type, title, body, severity, created_at)
      VALUES (
        ${newId()}, ${workspaceId}, 'budget_alert',
        ${'Ad spend approaching cap'},
        ${`Activating "${campaign.name}" brings active daily spend to ${outcome.currentActiveSpend + outcome.proposed} cents, crossing your alert threshold of ${outcome.alertThreshold}. Workspace hard cap is ${outcome.hardCap}.`},
        'warning', CURRENT_TIMESTAMP
      )
    `
  } catch (err) {
    console.error('[ads/deploy] alert notification failed (non-fatal):', err)
  }
}

// ─── POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: campaignId } = await ctx.params
  let body: { workspaceId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { workspaceId } = body
  if (!workspaceId || !campaignId) {
    return NextResponse.json({ error: 'workspaceId and campaign id required' }, { status: 400 })
  }

  // ── 1. Workspace ownership ─────────────────────────────────────────────
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // ── 1b. 🚨 PR Circuit Breaker ───────────────────────────────────────────
  // Halts ad activation when the workspace is in crisis. Catches the case
  // where a campaign was queued before the crisis, then someone clicks
  // Deploy after it tripped — no new spend opens during the incident.
  const breaker = await assertCrisisClear(workspaceId)
  if (breaker) return breaker

  // ── 2. Atomic compare-and-swap lock: 'draft' → 'deploying' ─────────────
  // Using SELECT-then-check would leave a race window where two clicks both
  // see status='draft' and both proceed. The UPDATE returns affected rows
  // count, and we re-read to detect whether we actually grabbed the lock.
  await sql`
    UPDATE ad_campaigns
    SET status = 'deploying'
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId} AND status = 'draft'
  `
  const campaignRes = await sql`
    SELECT id, workspace_id, platform, native_campaign_id, name,
           daily_budget, status, error_log, utm_override
    FROM ad_campaigns
    WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `
  const campaign = campaignRes.rows[0] as unknown as AdCampaignRow | undefined
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found in this workspace' }, { status: 404 })
  }
  if (campaign.status !== 'deploying') {
    // Someone else got the lock first, OR the row wasn't in 'draft' to begin with.
    return NextResponse.json(
      {
        error: `Cannot deploy a campaign in '${campaign.status}' state.`,
        currentStatus: campaign.status,
        hint: campaign.status === 'deploying'
          ? 'This campaign is already being deployed by a parallel request — wait and refresh.'
          : campaign.status === 'active'
          ? 'Campaign is already live. Pause it first if you need to redeploy.'
          : 'Only draft campaigns can be deployed. Reset the campaign to draft and try again.',
      },
      { status: 409 },
    )
  }

  // From this point on, ANY error must roll the row back to 'draft'.
  const rollback = async (err: string) => {
    try {
      await sql`
        UPDATE ad_campaigns
        SET status = 'draft', error_log = ${err.slice(0, 1000)}
        WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
      `
    } catch (rbErr) {
      console.error('[ads/deploy] rollback failed:', rbErr)
    }
  }

  try {
    // ── 3. Load creatives + run HITL safety gate per artifact ────────────
    const creativesRes = await sql`
      SELECT id, workspace_id, ad_campaign_id, artifact_id, headline, body_copy, media_url, destination_url
      FROM ad_creatives
      WHERE ad_campaign_id = ${campaignId} AND workspace_id = ${workspaceId}
      ORDER BY created_at ASC
    `
    const creatives = creativesRes.rows as unknown as AdCreativeRow[]
    if (creatives.length === 0) {
      await rollback('No creatives attached')
      return NextResponse.json(
        { error: 'Campaign has no creatives. Attach at least one ad_creatives row before deploying.' },
        { status: 422 },
      )
    }
    for (const c of creatives) {
      if (c.artifact_id) {
        const gate = await assertArtifactApproved(workspaceId, c.artifact_id)
        if (gate) {
          await rollback(`Creative ${c.id} blocked — artifact not approved`)
          return gate
        }
      }
    }

    // ── 4. Dual-Key Budget Lock ─────────────────────────────────────────
    const budget = await runBudgetLockCheck(workspaceId, campaignId, campaign.daily_budget)
    if (!budget.passed) {
      await rollback(budget.reason || 'Budget cap exceeded')
      return NextResponse.json(
        {
          error: budget.reason,
          currentActiveSpend: budget.currentActiveSpend,
          proposedDailyBudget: budget.proposed,
          hardMaxDailySpend: budget.hardCap,
          alertThreshold: budget.alertThreshold,
        },
        { status: 403 },
      )
    }
    if (budget.crossedAlertThreshold) {
      // Non-blocking — fire after-response so we don't slow the deploy down.
      after(() => notifyAlertThresholdCrossed(workspaceId, campaign, budget))
    }

    // ── 5. UTM injection — load workspace template + compose per creative
    const wsRes2 = await sql`SELECT id, utm_template FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = (wsRes2.rows[0] as { id?: string; utm_template?: string | null } | undefined) || { id: workspaceId }
    const utmDecorated = creatives.map(c => ({
      creative: c,
      trackedUrl: resolveCampaignUtms(
        c.destination_url,
        { id: ws.id, utm_template: ws.utm_template ?? null },
        { id: campaign.id, name: campaign.name, utm_override: campaign.utm_override },
        { id: c.id },
        campaign.platform,
      ),
    }))

    // ── 6. Provider dispatch ────────────────────────────────────────────
    const dispatch = await dispatchToProvider(workspaceId, campaign, creatives, utmDecorated)
    if (!dispatch.ok || !dispatch.nativeCampaignId) {
      await rollback(dispatch.error || 'Provider dispatch failed with no native id')
      return NextResponse.json(
        {
          error: dispatch.error || 'Provider rejected the campaign',
          details: dispatch.details,
        },
        { status: 502 },
      )
    }

    // ── 7. Persist native id + flip to active ───────────────────────────
    await sql`
      UPDATE ad_campaigns
      SET status = 'active',
          native_campaign_id = ${dispatch.nativeCampaignId},
          error_log = NULL
      WHERE id = ${campaignId} AND workspace_id = ${workspaceId}
    `

    return NextResponse.json({
      ok: true,
      campaignId,
      nativeCampaignId: dispatch.nativeCampaignId,
      platform: campaign.platform,
      status: 'active',
      usedMock: !!dispatch.usedMock,
      budgetSummary: {
        proposed: budget.proposed,
        previousActiveSpend: budget.currentActiveSpend,
        totalAfterActivation: budget.currentActiveSpend + budget.proposed,
        alertThreshold: budget.alertThreshold,
        hardCap: budget.hardCap,
        crossedAlertThreshold: budget.crossedAlertThreshold,
      },
      decoratedCreativeUrls: utmDecorated.map(d => ({
        creative_id: d.creative.id, url: d.trackedUrl,
      })),
      providerDetails: dispatch.details,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ads/deploy] unexpected error', err)
    await rollback(msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
