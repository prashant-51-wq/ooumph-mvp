import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a YouTube growth expert. Generate punchy, high-CTR thumbnail copy.
Short headlines that stop scrolling. Respond ONLY with valid JSON.`

interface ThumbnailCopy {
  headline: string
  subtext: string
  accentNumber: string | null
  accentWord: string | null
  layout: 'stat' | 'hook'
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, topic } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!topic) return NextResponse.json({ error: 'Missing video topic' }, { status: 400 })

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const prompt = `Generate YouTube thumbnail copy for:
Video Topic: ${topic}
Business: ${brand.business_name}
Audience: ${brand.target_audience}
Tone: ${brand.tone}

Rules:
- headline: 3-5 WORDS MAX. Make it irresistible. Use numbers or power words if it fits.
- subtext: 5-8 words supporting line, creates curiosity or urgency
- accentNumber: extract a big number/stat if the topic has one (e.g. "10X", "47%", "₹5L") else null
- accentWord: if accentNumber set, short label (e.g. "FASTER", "ROI") else null
- layout: "stat" if accentNumber exists, else "hook"

Return JSON only:
{
  "headline": "string",
  "subtext": "string",
  "accentNumber": "string | null",
  "accentWord": "string | null",
  "layout": "stat" | "hook"
}`

    const copy = await runAgent<ThumbnailCopy>(SYSTEM, prompt)

    const contentJson = {
      topic,
      businessName: brand.business_name,
      tone: brand.tone,
      ...copy,
    }

    const artifactId = newId()
    const title = `YouTube Thumbnail — ${topic.slice(0, 60)}`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'youtube_thumbnail', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'youtube_thumbnail',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, copy: contentJson })
  } catch (error) {
    console.error('Thumbnail generation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 200 })

  const result = await sql`
    SELECT a.id, a.title, a.content_json, a.created_at,
           ap.status as approval_status, ap.id as approval_id, ap.notes as approval_notes
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'youtube_thumbnail'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
