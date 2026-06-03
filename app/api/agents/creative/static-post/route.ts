import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a social media copywriter who writes scroll-stopping static post content.
High-impact hook + supporting body + clear CTA. Respond ONLY with valid JSON.`

interface StaticPostCopy {
  hook: string
  body: string
  cta: string
  hashtags: string[]
  platform: 'instagram' | 'linkedin'
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, topic, platform = 'instagram' } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!topic) return NextResponse.json({ error: 'Missing topic' }, { status: 400 })

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const isPlatformLinkedIn = platform === 'linkedin'

    const prompt = `Create a ${isPlatformLinkedIn ? 'LinkedIn' : 'Instagram'} static post for:
Topic: ${topic}
Business: ${brand.business_name}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Products/Services: ${brand.products_services || ''}

Rules:
- hook: max 8 words, bold statement that stops scrolling (fits on image headline)
- body: 15-25 words, expands on hook with value/curiosity (fits on image subtext)
- cta: 3-6 words, action-oriented button text (e.g. "Book a Free Call", "DM us NOW")
- hashtags: 5-8 relevant hashtags (without # prefix, just the words)
- platform: "${platform}"

${isPlatformLinkedIn ? 'LinkedIn: professional tone, insight-driven, authority positioning' : 'Instagram: punchy, emotional, visual storytelling'}

Return JSON only:
{
  "hook": "string",
  "body": "string",
  "cta": "string",
  "hashtags": ["string"],
  "platform": "${platform}"
}`

    const copy = await runAgent<StaticPostCopy>(SYSTEM, prompt, workspaceId)

    const contentJson = {
      topic,
      businessName: brand.business_name,
      tone: brand.tone,
      ...copy,
    }

    const artifactId = newId()
    const title = `Static Post — ${topic.slice(0, 60)} (${platform})`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'visual_post', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'visual_post',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, copy: contentJson })
  } catch (error) {
    console.error('Static post generation error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'visual_post'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
