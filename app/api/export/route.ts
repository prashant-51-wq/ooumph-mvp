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
      sql`SELECT type, content_json FROM artifacts WHERE workspace_id = ${workspaceId} ORDER BY created_at ASC`,
    ])

    const brand = brandResult.rows[0]
    const artifacts = artifactsResult.rows

    const data = {
      brand,
      strategy: artifacts.find((a) => a.type === 'strategy')?.content_json,
      calendar: artifacts.find((a) => a.type === 'content_calendar')?.content_json,
      assets: {
        carousel: artifacts.find((a) => a.type === 'carousel')?.content_json,
        reelScript: artifacts.find((a) => a.type === 'reelScript')?.content_json,
        adCopy: artifacts.find((a) => a.type === 'adCopy')?.content_json,
        emailDraft: artifacts.find((a) => a.type === 'emailDraft')?.content_json,
        linkedInPost: artifacts.find((a) => a.type === 'linkedInPost')?.content_json,
      },
      funnel: artifacts.find((a) => a.type === 'funnel_plan')?.content_json,
      leads: artifacts.find((a) => a.type === 'lead_gen_plan')?.content_json,
    }

    if (format === 'docx') {
      const buffer = await generateDocx(data)
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
