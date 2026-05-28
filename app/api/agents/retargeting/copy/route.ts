/**
 * Retargeting Worker: Ad Copy Writer
 * POST { workspaceId, segment, platform, previousMessaging?, tone? }
 * GET  ?workspaceId=xxx&segment=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { writeRetargetingCopy } from '@/lib/agents/retargeting'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      segment: string
      platform: 'meta' | 'google' | 'linkedin' | 'tiktok'
      previousMessaging?: string
      tone?: string
    }
    const { workspaceId, segment, platform } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!segment) return NextResponse.json({ error: 'segment required' }, { status: 400 })
    if (!platform) return NextResponse.json({ error: 'platform required: meta|google|linkedin|tiktok' }, { status: 400 })

    const validPlatforms = ['meta', 'google', 'linkedin', 'tiktok']
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: `platform must be one of: ${validPlatforms.join(', ')}` }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    // Sprint 13B: plan-tier quota.
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Load previous messaging to avoid repetition ──────────────────────────
    let previousMessaging = body.previousMessaging

    if (!previousMessaging) {
      // Pull any existing retargeting copy for this segment/platform to avoid repeating
      const existingCopyRes = await sql`
        SELECT content_json FROM artifacts
        WHERE workspace_id = ${workspaceId} AND type = 'retargeting_copy'
        ORDER BY created_at DESC LIMIT 3
      `
      const previousCopies: string[] = []
      for (const row of existingCopyRes.rows) {
        const content = row.content_json as Record<string, unknown>
        const copyData = content?.copy as Record<string, unknown> | undefined
        if (copyData?.segment === segment && copyData?.platform === platform) {
          const variations = copyData?.variations as Array<{ headline: string; primaryText: string }> | undefined
          if (variations) {
            previousCopies.push(...variations.slice(0, 2).map(v => `"${v.headline}" — ${v.primaryText?.slice(0, 80)}`))
          }
        }
      }
      if (previousCopies.length > 0) {
        previousMessaging = previousCopies.join('\n')
      }

      // Also pull any existing campaign copy from artifacts
      if (!previousMessaging) {
        const campaignRes = await sql`
          SELECT content_json FROM artifacts
          WHERE workspace_id = ${workspaceId} AND type IN ('campaign_brief', 'retargeting_campaign')
          ORDER BY created_at DESC LIMIT 1
        `
        if (campaignRes.rows[0]) {
          const content = campaignRes.rows[0].content_json as Record<string, unknown>
          const campaign = content?.campaign as Record<string, unknown> | undefined
          const directions = campaign?.creativeDirections as Array<{ headline: string; bodyCopy: string }> | undefined
          if (directions && directions.length > 0) {
            previousMessaging = directions.slice(0, 2).map(d => `"${d.headline}" — ${d.bodyCopy?.slice(0, 80)}`).join('\n')
          }
        }
      }
    }

    // ── Generate copy with tone override if provided ──────────────────────────
    const brandWithTone: BrandProfile = body.tone
      ? { ...brand, tone: body.tone }
      : brand

    const copy = await writeRetargetingCopy(brandWithTone, segment, platform, previousMessaging)

    // ── Platform-specific character count validation ───────────────────────────
    const platformLimits: Record<string, { headline: number; primaryText: number; description: number }> = {
      meta: { headline: 40, primaryText: 500, description: 30 },
      google: { headline: 30, primaryText: 90, description: 90 },
      linkedin: { headline: 70, primaryText: 600, description: 100 },
      tiktok: { headline: 100, primaryText: 100, description: 60 },
    }

    const limits = platformLimits[platform]
    const validationNotes: string[] = []
    for (const variation of copy.variations || []) {
      if (variation.headline && variation.headline.length > limits.headline) {
        validationNotes.push(`Headline over ${limits.headline} chars: "${variation.headline.slice(0, 30)}..." — trim for ${platform}`)
      }
      if (variation.primaryText && variation.primaryText.length > limits.primaryText) {
        validationNotes.push(`Primary text over ${limits.primaryText} chars for angle "${variation.angle}" — trim before publishing`)
      }
    }

    // ── Load segment details for context enrichment ───────────────────────────
    let segmentDetails: Record<string, unknown> | null = null
    const segmentRes = await sql`
      SELECT content_json FROM artifacts
      WHERE workspace_id = ${workspaceId} AND type = 'retargeting_audiences'
      ORDER BY created_at DESC LIMIT 1
    `
    if (segmentRes.rows[0]) {
      const content = segmentRes.rows[0].content_json as Record<string, unknown>
      const segments = content?.segments as Array<{ name: string }> | undefined
      if (segments) {
        const found = segments.find((s) => s.name.toLowerCase().includes(segment.toLowerCase()) || segment.toLowerCase().includes(s.name.toLowerCase()))
        if (found) segmentDetails = found as Record<string, unknown>
      }
    }

    const result = {
      copy,
      segment,
      platform,
      segmentDetails,
      platformLimits: limits,
      validationNotes,
      variationsCount: copy.variations?.length || 0,
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_copy', 'completed')`

    const artifactId = newId()
    const title = `Retargeting Copy — ${segment} × ${platform} — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'retargeting_copy', ${title}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'retargeting_copy',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, artifactId, ...result })
  } catch (error) {
    console.error('Retargeting copy error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const segment = searchParams.get('segment')

  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = segment
    ? await sql`
        SELECT a.id, a.title, a.content_json, a.created_at, ap.status as approval_status
        FROM artifacts a
        LEFT JOIN approvals ap ON ap.artifact_id = a.id
        WHERE a.workspace_id = ${workspaceId} AND a.type = 'retargeting_copy'
          AND a.title LIKE ${'%' + segment + '%'}
        ORDER BY a.created_at DESC LIMIT 10
      `
    : await sql`
        SELECT a.id, a.title, a.content_json, a.created_at, ap.status as approval_status
        FROM artifacts a
        LEFT JOIN approvals ap ON ap.artifact_id = a.id
        WHERE a.workspace_id = ${workspaceId} AND a.type = 'retargeting_copy'
        ORDER BY a.created_at DESC LIMIT 20
      `

  return NextResponse.json(result.rows)
}
