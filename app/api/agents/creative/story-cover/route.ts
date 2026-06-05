import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are a social media strategist specializing in Stories and Reels content.
High-impact vertical content that drives swipe-ups and engagement. Respond ONLY with valid JSON.`

interface StoryCopy {
  hook: string
  subtext: string
  cta: string
  label: string
  platform: 'instagram' | 'youtube_shorts' | 'facebook'
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

    const prompt = `Create Story/Reel cover copy for:
Topic: ${topic}
Business: ${brand.business_name}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Platform: ${platform}

Rules:
- hook: max 6 words, BIG bold statement — the main message (fits as large headline on 9:16)
- subtext: 8-15 words, supports the hook with context or benefit
- cta: 3-6 words for swipe-up / tap button (e.g. "Swipe Up ↑", "Watch Now", "Tap to Learn")
- label: 1-2 words for the badge chip in top-right (e.g. "NEW", "TIPS", "WATCH", "FREE", "LIVE")
- platform: "${platform}"

Story copy must be punchy, visual-first, urgent. Think ad creative, not blog post.

Return JSON only:
{
  "hook": "string",
  "subtext": "string",
  "cta": "string",
  "label": "string",
  "platform": "${platform}"
}`

    const copy = await runAgent<StoryCopy>(SYSTEM, prompt, workspaceId)

    const contentJson = {
      topic,
      businessName: brand.business_name,
      tone: brand.tone,
      ...copy,
    }

    const artifactId = newId()
    const title = `Story Cover — ${topic.slice(0, 60)} (${platform})`
    await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, 'visual_story', ${title}, ${JSON.stringify(contentJson)})`

    const approvalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
              VALUES (${approvalId}, ${workspaceId}, ${artifactId})`

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType: 'visual_story',
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId, copy: contentJson })
  } catch (error) {
    console.error('Story cover generation error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'visual_story'
    ORDER BY a.created_at DESC LIMIT 10
  `
  return NextResponse.json(result.rows)
}
