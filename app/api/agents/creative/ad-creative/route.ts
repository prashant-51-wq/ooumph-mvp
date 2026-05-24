import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a performance marketing expert who writes high-converting ad creatives.
Direct response copy: attention-grabbing headline, clear benefit, irresistible offer, urgent CTA.
Respond ONLY with valid JSON.`

interface AdCreativeCopy {
  headline: string
  subtext: string
  cta: string
  offer: string
  sizes: Array<'square' | 'landscape' | 'story' | 'leaderboard'>
  platform: string
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, topic, platform = 'facebook', sizes } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    if (!topic) return NextResponse.json({ error: 'Missing topic/offer' }, { status: 400 })

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    const requestedSizes = sizes || ['square', 'landscape', 'story']

    const prompt = `Create a ${platform} ad creative for:
Offer/Topic: ${topic}
Business: ${brand.business_name}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Products/Services: ${brand.products_services || ''}

Rules:
- headline: max 7 words, the SINGLE most compelling benefit/hook (shown large on ad)
- subtext: 10-18 words, supports headline with proof/detail/specifics
- cta: 2-5 words, urgent action button (e.g. "Get 50% Off", "Book Free Demo", "Download Now")
- offer: 3-8 words, the deal/proposition shown as a badge (e.g. "50% OFF TODAY", "FREE 14-DAY TRIAL", "LIMITED SPOTS")
- sizes: ${JSON.stringify(requestedSizes)} (these are the ad formats needed)
- platform: "${platform}"

Performance ad rules: specific > vague, numbers beat adjectives, create FOMO, solve a pain point.

Return JSON only:
{
  "headline": "string",
  "subtext": "string",
  "cta": "string",
  "offer": "string",
  "sizes": ${JSON.stringify(requestedSizes)},
  "platform": "${platform}"
}`

    const copy = await runAgent<AdCreativeCopy>(SYSTEM, prompt)

    const contentJson = {
      topic,
      businessName: brand.business_name,
      tone: brand.tone,
      ...copy,
    }

    const artifactId = newId()
    const title = `Ad Creative — ${topic.slice(0, 60)} (${platform})`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'visual_ad', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'visual_ad',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, copy: contentJson })
  } catch (error) {
    console.error('Ad creative generation error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'visual_ad'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
