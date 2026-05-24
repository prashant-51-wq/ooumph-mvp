import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { generateDocx } from '@/lib/export/docx'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const format = searchParams.get('format') || 'docx'

    const [brandResult, artifactsResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT type, content_json, status FROM artifacts WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC`,
    ])

    const brand = brandResult.rows[0]
    const artifacts = artifactsResult.rows

    // Prefer approved artifacts; fall back to latest for each type
    const byType: Record<string, unknown> = {}
    const byTypeApproved: Record<string, unknown> = {}
    for (const a of artifacts) {
      const t = a.type as string
      if (!byType[t]) byType[t] = a.content_json
      if (!byTypeApproved[t] && a.status === 'approved') byTypeApproved[t] = a.content_json
    }
    const pick = (type: string) => byTypeApproved[type] ?? byType[type]

    const data = {
      brand,
      strategy: pick('strategy'),
      calendar: pick('content_calendar'),
      assets: {
        carousel: pick('carousel'),
        reelScript: pick('reelScript'),
        adCopy: pick('adCopy'),
        emailDraft: pick('emailDraft'),
        linkedInPost: pick('linkedInPost'),
      },
      funnel: pick('funnel_plan'),
      leads: pick('lead_gen_plan'),
      analyticsReport: pick('analytics_report'),
      emailSequence: pick('email_sequence'),
      landingPage: pick('landing_page'),
      leadScoringModel: pick('lead_scoring_model'),
    }

    if (format === 'docx') {
      const buffer = await generateDocx(data as Parameters<typeof generateDocx>[0])
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="ooumph-marketing-plan-${Date.now()}.docx"`,
        },
      })
    }

    if (format === 'json') {
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
