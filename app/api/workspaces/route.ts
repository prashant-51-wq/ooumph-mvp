import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { seedWorkspace } from '@/lib/seed-workspace'
import { seedDefaultAgents } from '@/lib/agents'
import { assertWorkspaceOwnership, assertSuperAdmin } from '@/lib/guards'
import { setWorkspaceSecret, getWorkspaceSecret } from '@/lib/secrets'

/**
 * Sprint 18B (BYOK P0): customer-provided LLM API keys must never be
 * persisted in `workspaces.model_settings` JSON. This helper extracts
 * known key fields from a model_settings payload, writes them through
 * the AES-GCM encryption layer (`workspace_secrets`), and returns a
 * sanitised copy with the raw keys stripped. Never logs the values.
 */
async function extractAndStoreModelKeys(
  workspaceId: string,
  modelSettings: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!modelSettings) return modelSettings
  const sanitized: Record<string, unknown> = { ...modelSettings }

  const keyFields: Array<[string, 'anthropic' | 'openai']> = [
    ['anthropicApiKey', 'anthropic'],
    ['openaiApiKey', 'openai'],
  ]

  for (const [field, provider] of keyFields) {
    const raw = sanitized[field]
    if (typeof raw === 'string' && raw.trim().length > 0) {
      try {
        await setWorkspaceSecret(workspaceId, provider, raw.trim())
      } catch (err) {
        // Surface as a generic error — never include the key value.
        console.error(`[/api/workspaces] failed to persist ${provider} BYOK secret:`, (err as Error).message)
      }
    }
    // Strip from JSON regardless — even an empty string shouldn't land in model_settings.
    delete sanitized[field]
  }

  return sanitized
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      businessName, industry, website, tagline, offer, uniqueValue,
      targetAudience, tone, competitors, channels, goals,
      monthlyBudget, prohibitedClaims, approvalEmail, userId,
      primaryGoal, skipSeed,
    } = body

    const workspaceId = newId()
    const brandId = newId()
    const ownerEmail = approvalEmail || 'owner@ooumph.com'

    await sql`
      INSERT INTO workspaces (id, name, industry, website, owner_email, user_id)
      VALUES (${workspaceId}, ${businessName}, ${industry}, ${website}, ${ownerEmail}, ${userId || null})
    `

    await sql`
      INSERT INTO brand_profiles (
        id, workspace_id, business_name, tagline, offer, unique_value,
        target_audience, tone, competitors, channels, goals,
        monthly_budget, prohibited_claims, approval_email
      ) VALUES (
        ${brandId}, ${workspaceId}, ${businessName}, ${tagline}, ${offer}, ${uniqueValue},
        ${targetAudience}, ${tone}, ${competitors}, ${channels},
        ${goals}, ${monthlyBudget}, ${prohibitedClaims}, ${approvalEmail}
      )
    `

    // Seed sample data so the user's first dashboard view isn't empty.
    // Skipped only on explicit caller request (e.g. test environments).
    let seedResult: { seeded: { type: string; count: number }[] } | undefined
    if (!skipSeed) {
      try {
        seedResult = await seedWorkspace({
          workspaceId,
          businessName: businessName || 'Your Business',
          industry,
          primaryGoal,
        })
      } catch (err) {
        // Seeding failure must not block workspace creation
        console.error('[workspaces POST] seed failed (non-fatal):', err)
      }
    }

    // Sprint 2 Commit 2: populate the agents registry with the canonical
    // agent slugs so the Agents page renders immediately and the cron
    // worker has rows to filter on. Runs regardless of `skipSeed` because
    // the registry isn't "sample data" — it's structural state every
    // workspace needs to function. Failure is non-fatal: an empty
    // registry just means `isAgentActive` falls back to its active default
    // (see lib/agents.ts → fail open behavior), so workspaces still work.
    let agentsSeeded = 0
    try {
      const r = await seedDefaultAgents(workspaceId)
      agentsSeeded = r.inserted
    } catch (err) {
      console.error('[workspaces POST] agent seed failed (non-fatal):', err)
    }

    return NextResponse.json({
      workspaceId,
      success: true,
      seeded: seedResult?.seeded || [],
      agentsSeeded,
    })
  } catch (error) {
    console.error('Workspace creation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId?: string; businessName?: string; industry?: string; website?: string;
      tagline?: string; offer?: string; uniqueValue?: string; targetAudience?: string;
      tone?: string; competitors?: string; channels?: string; goals?: string;
      monthlyBudget?: string; prohibitedClaims?: string; approvalEmail?: string;
      modelSettings?: Record<string, unknown>; extraSettings?: Record<string, unknown>;
      // Sprint 15F (P0 #8): onboarding completion fields.
      onboardingCompletedAt?: string; onboardingStep?: number;
      // Sprint 16H (P1 #15, #21): logo + structured ICP persistence.
      logoUrl?: string; icpJson?: Record<string, unknown>;
    }
    const { workspaceId } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    // Sprint 8A: ownership before mutating brand profile + workspace row.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Onboarding-only patches don't include brand_profile fields — short
    // circuit so the wizard's completion ping doesn't blank out the row.
    const isOnboardingOnly =
      body.businessName === undefined &&
      (body.onboardingCompletedAt !== undefined || body.onboardingStep !== undefined)

    if (isOnboardingOnly) {
      if (body.onboardingCompletedAt !== undefined) {
        await sql`UPDATE workspaces SET onboarding_completed_at = ${body.onboardingCompletedAt} WHERE id = ${workspaceId}`
      }
      if (body.onboardingStep !== undefined) {
        await sql`UPDATE workspaces SET onboarding_step = ${body.onboardingStep} WHERE id = ${workspaceId}`
      }
      return NextResponse.json({ ok: true, onboardingPatch: true })
    }

    // Sprint 16H (P1 #15, #21): include logo_url + icp_json in the update.
    // icp_json column is TEXT (Sprint 16A) — store as serialised JSON.
    // Sprint 17G (audit pass #3 P2 #27): cap logo_url length. The data:
    // URL fallback path (when Cloudinary isn't configured) was unbounded —
    // a 5MB logo would blow the brand_profiles row. Reject anything > 8KB
    // (large enough for any reasonable SVG/PNG, small enough to keep rows
    // healthy). Cloudinary URLs are always short, so the cap only kicks
    // in for data: URLs that should have been uploaded.
    const MAX_LOGO_URL_BYTES = 8 * 1024
    let safeLogoUrl: string | null = body.logoUrl ?? null
    if (safeLogoUrl && safeLogoUrl.length > MAX_LOGO_URL_BYTES) {
      console.warn(`[/api/workspaces PATCH] logoUrl too large (${safeLogoUrl.length} bytes) — clearing. Configure Cloudinary for proper hosting.`)
      safeLogoUrl = null
    }
    const icpJsonSerialized = body.icpJson !== undefined
      ? JSON.stringify(body.icpJson)
      : '{}'
    await sql`
      UPDATE brand_profiles SET
        business_name = ${body.businessName}, tagline = ${body.tagline}, offer = ${body.offer},
        unique_value = ${body.uniqueValue}, target_audience = ${body.targetAudience},
        tone = ${body.tone}, competitors = ${body.competitors}, channels = ${body.channels},
        goals = ${body.goals}, monthly_budget = ${body.monthlyBudget},
        prohibited_claims = ${body.prohibitedClaims}, approval_email = ${body.approvalEmail},
        logo_url = ${safeLogoUrl},
        icp_json = ${icpJsonSerialized},
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${workspaceId}
    `
    // Sprint 18B (BYOK P0): pull anthropicApiKey / openaiApiKey out of
    // model_settings and persist them encrypted in workspace_secrets
    // before the JSON hits the workspaces row.
    const safeModelSettings = await extractAndStoreModelKeys(workspaceId, body.modelSettings)
    await sql`
      UPDATE workspaces SET name = ${body.businessName}, industry = ${body.industry}, website = ${body.website},
        model_settings = ${safeModelSettings ? JSON.stringify(safeModelSettings) : '{}'},
        extra_settings = ${body.extraSettings ? JSON.stringify(body.extraSettings) : '{}'}
      WHERE id = ${workspaceId}
    `
    // Combined patches can still include the onboarding flag.
    if (body.onboardingCompletedAt !== undefined) {
      await sql`UPDATE workspaces SET onboarding_completed_at = ${body.onboardingCompletedAt} WHERE id = ${workspaceId}`
    }
    if (body.onboardingStep !== undefined) {
      await sql`UPDATE workspaces SET onboarding_step = ${body.onboardingStep} WHERE id = ${workspaceId}`
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('id')

    if (workspaceId) {
      // Sprint 8A: session must own this workspace. Without this, any
      // authenticated user could read another tenant's brand profile +
      // model_settings (which holds plaintext API keys) by URL-tampering.
      const denied = assertWorkspaceOwnership(req, workspaceId)
      if (denied) return denied
      const result = await sql`
        SELECT w.id, w.name, w.industry, w.website, w.owner_email, w.status, w.created_at,
               w.model_settings, w.extra_settings,
               bp.business_name, bp.tagline, bp.offer, bp.unique_value, bp.target_audience,
               bp.tone, bp.competitors, bp.channels, bp.goals, bp.monthly_budget,
               bp.prohibited_claims, bp.approval_email,
               bp.logo_url, bp.icp_json
        FROM workspaces w
        LEFT JOIN brand_profiles bp ON bp.workspace_id = w.id
        WHERE w.id = ${workspaceId}
      `
      const row = result.rows[0] as Record<string, unknown> | undefined
      if (!row) return NextResponse.json(null)

      // Sprint 18B (BYOK P0): never echo BYOK material on the wire. Strip
      // any legacy plaintext key fields out of `model_settings` and replace
      // them with boolean presence flags sourced from `workspace_secrets`.
      let modelSettings = row.model_settings as Record<string, unknown> | string | null | undefined
      if (typeof modelSettings === 'string') {
        try { modelSettings = JSON.parse(modelSettings) as Record<string, unknown> } catch { modelSettings = {} }
      }
      if (modelSettings && typeof modelSettings === 'object') {
        delete (modelSettings as Record<string, unknown>).anthropicApiKey
        delete (modelSettings as Record<string, unknown>).openaiApiKey
      }
      const [anthropicKey, openaiKey] = await Promise.all([
        getWorkspaceSecret(workspaceId, 'anthropic'),
        getWorkspaceSecret(workspaceId, 'openai'),
      ])
      return NextResponse.json({
        ...row,
        model_settings: modelSettings ?? {},
        hasAnthropicKey: Boolean(anthropicKey),
        hasOpenaiKey: Boolean(openaiKey),
      })
    }

    // Sprint 18Z (audit pass #8 P0 #1): bare GET /api/workspaces — no
    // ?id — previously returned the first 20 workspaces unauthenticated.
    // One-curl tenant enumeration leak. Now super-admin only.
    const sadminDenied = await assertSuperAdmin(req)
    if (sadminDenied) return sadminDenied
    const result = await sql`SELECT id, name, industry, website, owner_email, status, created_at FROM workspaces ORDER BY created_at DESC LIMIT 20`
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Workspace fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
