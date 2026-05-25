/**
 * Retargeting Worker: Lookalike Audience Creator
 * POST { workspaceId, sourceType, sourceSize? }
 * GET  ?workspaceId=xxx
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'
import { buildLookalikeAudience } from '@/lib/agents/retargeting'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workspaceId: string
      sourceType: 'customers' | 'top_leads' | 'converters' | 'video_viewers'
      sourceSize?: number
    }
    const { workspaceId, sourceType } = body
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!sourceType) return NextResponse.json({ error: 'sourceType required: customers|top_leads|converters|video_viewers' }, { status: 400 })

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    // ── Load source audience data from DB ────────────────────────────────────
    let sourceSize = body.sourceSize
    let sourceQualityData: Record<string, unknown> = {}

    if (!sourceSize || sourceSize === 0) {
      if (sourceType === 'customers') {
        const res = await sql`
          SELECT COUNT(*) as cnt, AVG(score) as avg_score
          FROM leads_captured
          WHERE workspace_id = ${workspaceId} AND status = 'customer'
        `
        sourceSize = Number(res.rows[0]?.cnt || 0)
        sourceQualityData = { avgScore: Math.round(Number(res.rows[0]?.avg_score || 0)), status: 'customer' }
      } else if (sourceType === 'top_leads') {
        const res = await sql`
          SELECT COUNT(*) as cnt, AVG(score) as avg_score, MAX(score) as max_score
          FROM leads_captured
          WHERE workspace_id = ${workspaceId} AND score >= 70
        `
        sourceSize = Number(res.rows[0]?.cnt || 0)
        sourceQualityData = {
          avgScore: Math.round(Number(res.rows[0]?.avg_score || 0)),
          maxScore: Number(res.rows[0]?.max_score || 0),
          scoreThreshold: 70,
        }
      } else if (sourceType === 'converters') {
        // Converters = anyone who took a conversion action (customer, qualified, proposal, or completed booking)
        const [leadsRes, bookingsRes] = await Promise.all([
          sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId} AND status IN ('customer', 'qualified', 'proposal')`,
          sql`SELECT COUNT(*) as cnt FROM bookings WHERE workspace_id = ${workspaceId} AND status = 'confirmed'`,
        ])
        const leadsCount = Number(leadsRes.rows[0]?.cnt || 0)
        const bookingsCount = Number(bookingsRes.rows[0]?.cnt || 0)
        sourceSize = leadsCount + bookingsCount
        sourceQualityData = { leadsConverted: leadsCount, bookingsCompleted: bookingsCount }
      } else if (sourceType === 'video_viewers') {
        // Estimate from published content engagement — use 30% of total leads as proxy
        const res = await sql`SELECT COUNT(*) as cnt FROM leads_captured WHERE workspace_id = ${workspaceId}`
        const totalLeads = Number(res.rows[0]?.cnt || 0)
        // Also check published content for video platforms
        const videoRes = await sql`
          SELECT COUNT(*) as cnt FROM published_content
          WHERE workspace_id = ${workspaceId} AND platform IN ('instagram', 'tiktok', 'youtube', 'facebook')
        `
        const videoPostCount = Number(videoRes.rows[0]?.cnt || 0)
        // Estimate: each video post reaches ~500-2000 viewers on average
        sourceSize = Math.max(totalLeads, videoPostCount * 750)
        sourceQualityData = { estimatedVideoViewers: sourceSize, videoPostCount, basedOn: 'published video content estimates' }
      }
    }

    // Ensure minimum viable source size (platforms require minimums)
    const effectiveSize = Math.max(sourceSize || 0, 0)
    const sizeWarning = effectiveSize < 100
      ? `Source audience is below the recommended minimum (100 for Meta, 300 for Google). Results may be limited. Upload your customer list manually to the ad platforms for best results.`
      : null

    // ── Build the lookalike strategy ────────────────────────────────────────
    const lookalike = await buildLookalikeAudience(brand, sourceType, effectiveSize)

    // ── Build platform-specific creation steps ────────────────────────────────
    const creationGuide = {
      meta: {
        steps: [
          'Go to Meta Business Manager → Audiences',
          'Click "Create Audience" → "Lookalike Audience"',
          `Select your source: "${lookalike.sourceName}" custom audience`,
          `Choose audience location and lookalike percentage: ${lookalike.lookalikePercentage}%`,
          'Click "Create Audience" — takes 1-6 hours to populate',
          'Use in your retargeting campaign ad sets',
        ],
        requirements: `Minimum 100 people in source audience. Your source: ${effectiveSize} people.`,
        estimatedSize: lookalike.estimatedReach,
      },
      google: {
        steps: [
          'Go to Google Ads → Tools & Settings → Audience Manager',
          'Click "+" → "Custom list" or "Customer Match"',
          `Upload your ${sourceType} list as a CSV (email, phone, or address data)`,
          'Wait for matching (24-48 hours for Customer Match)',
          'Enable "Similar Audiences" in your campaign settings',
          'Google automatically creates similar audiences from matched lists',
        ],
        requirements: `Minimum 1,000 matched users for Similar Audiences. Upload at least ${Math.max(effectiveSize * 3, 1000)} raw records.`,
        estimatedSize: `Google Similar Audiences typically 10-50x your seed size`,
      },
      linkedin: {
        steps: [
          'Go to LinkedIn Campaign Manager → Plan → Audiences',
          'Click "Create Audience" → "Matched Audiences" → "List Upload"',
          `Upload ${sourceType} list as CSV (work email addresses work best)`,
          'Wait for audience matching (24-48 hours)',
          'Click "Lookalike" next to your matched audience to enable',
          `LinkedIn generates 15x expanded audience from your ${effectiveSize}-person seed`,
        ],
        requirements: `Minimum 300 matched members. Upload ${Math.max(effectiveSize * 2, 300)} contacts for best results.`,
        estimatedSize: `15x expansion expected: ~${Math.round(effectiveSize * 15).toLocaleString()} potential reach`,
      },
    }

    const result = {
      lookalike,
      sourceType,
      sourceSize: effectiveSize,
      sourceQualityData,
      sizeWarning,
      creationGuide,
      generatedAt: new Date().toISOString(),
    }

    // ── Save artifact ─────────────────────────────────────────────────────────
    const runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'retargeting_lookalike', 'completed')`

    const artifactId = newId()
    const title = `Lookalike Audience (${sourceType}) — ${brand.business_name}`
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'lookalike_audiences', ${title}, ${JSON.stringify(result)})`

    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'lookalike_audiences',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ ok: true, artifactId, ...result })
  } catch (error) {
    console.error('Lookalike audience error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'lookalike_audiences'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
