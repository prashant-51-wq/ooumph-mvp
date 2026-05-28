/**
 * POST /api/campaign/publish
 * Publishes an approved campaign brief to one or more DSPs.
 * HITL gate: campaign approval_status must be 'approved' before publishing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { publishCampaignToPlatform, type AdPlatform } from '@/lib/ad-platforms'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, campaignArtifactId, platforms } = await req.json() as {
      workspaceId: string
      campaignArtifactId: string
      platforms: AdPlatform[]
    }

    if (!workspaceId || !campaignArtifactId || !platforms?.length) {
      return NextResponse.json({ error: 'Missing workspaceId, campaignArtifactId, or platforms' }, { status: 400 })
    }
    // Sprint 9A: ownership before firing external campaign creation
    // on another tenant's connected ad accounts.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // ── HITL gate: must be approved ────────────────────────────────────────────
    const approvalResult = await sql`
      SELECT ap.status FROM approvals ap
      JOIN artifacts a ON a.id = ap.artifact_id
      WHERE a.id = ${campaignArtifactId} AND ap.workspace_id = ${workspaceId}
      LIMIT 1
    `
    const approval = approvalResult.rows[0]
    if (!approval || approval.status !== 'approved') {
      return NextResponse.json({
        error: 'Campaign brief must be approved in the Approvals page before publishing to ad platforms.',
        approvalStatus: approval?.status || 'not_found',
      }, { status: 403 })
    }

    // ── Load the campaign brief ────────────────────────────────────────────────
    const artifactResult = await sql`
      SELECT content_json FROM artifacts WHERE id = ${campaignArtifactId} AND workspace_id = ${workspaceId}
    `
    const artifact = artifactResult.rows[0]
    if (!artifact) return NextResponse.json({ error: 'Campaign artifact not found' }, { status: 404 })
    const brief = typeof artifact.content_json === 'string'
      ? JSON.parse(artifact.content_json)
      : artifact.content_json

    // ── Publish to each requested platform ────────────────────────────────────
    const results = await Promise.allSettled(
      platforms.map(platform => publishCampaignToPlatform(workspaceId, campaignArtifactId, brief, platform))
    )

    const publishResults = []
    for (let i = 0; i < results.length; i++) {
      const platform = platforms[i]
      const result = results[i]
      if (result.status === 'fulfilled') {
        const r = result.value
        publishResults.push(r)

        if (r.status !== 'failed' && r.platformCampaignId) {
          // Save to campaign_platform_links
          await sql`
            INSERT INTO campaign_platform_links
              (id, workspace_id, campaign_artifact_id, platform, platform_campaign_id,
               platform_adset_ids, platform_ad_ids, status, created_at)
            VALUES
              (${newId()}, ${workspaceId}, ${campaignArtifactId}, ${platform},
               ${r.platformCampaignId},
               ${JSON.stringify(r.platformAdSetIds)},
               ${JSON.stringify(r.platformAdIds)},
               'active', CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING
          `.catch(async () => {
            // SQLite fallback
            await sql`
              INSERT OR IGNORE INTO campaign_platform_links
                (id, workspace_id, campaign_artifact_id, platform, platform_campaign_id,
                 platform_adset_ids, platform_ad_ids, status)
              VALUES
                (${newId()}, ${workspaceId}, ${campaignArtifactId}, ${platform},
                 ${r.platformCampaignId},
                 ${JSON.stringify(r.platformAdSetIds)},
                 ${JSON.stringify(r.platformAdIds)},
                 'active')
            `
          })
        }
      } else {
        publishResults.push({
          platform,
          platformCampaignId: '',
          platformAdSetIds: [],
          platformAdIds: [],
          status: 'failed',
          error: result.reason?.message || String(result.reason),
          details: {},
        })
      }
    }

    const successCount = publishResults.filter(r => r.status !== 'failed').length
    const failCount = publishResults.length - successCount

    return NextResponse.json({
      ok: true,
      successCount,
      failCount,
      results: publishResults,
      message: successCount > 0
        ? `Campaign published to ${successCount} platform(s) in PAUSED state. Review and activate from each platform's dashboard.`
        : 'Publishing failed for all platforms. Check error details.',
    })
  } catch (error) {
    console.error('Campaign publish error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
