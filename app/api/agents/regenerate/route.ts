import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile, Strategy } from '@/types'

const SYSTEM = `You are the Content Copy Agent for Ooumph, an AI Marketing Agency OS. Write high-converting, brand-aligned marketing copy. Respond ONLY with valid JSON.`

const ASSET_TITLES: Record<string, string> = {
  carousel: 'Carousel Post',
  reelScript: 'Reel Script',
  adCopy: 'Ad Copy Set',
  emailDraft: 'Email Draft',
  linkedInPost: 'LinkedIn Post',
}

function makePrompt(brand: BrandProfile, strategy: Strategy, notesCtx: string, type: string): string {
  const base = `Business: ${brand.business_name}
Offer: ${brand.offer}
Audience: ${brand.target_audience}
Tone: ${brand.tone}
Content Pillar: ${strategy.contentPillars?.[0]?.name || ''}
Pain Points: ${strategy.icp?.painPoints?.join(', ') || ''}${notesCtx}`

  const schemas: Record<string, string> = {
    linkedInPost: `${base}\n\nCreate a LinkedIn post (thought leadership, story-led, hook-first).\nReturn JSON: {"hook":"string","body":"string (\\n for breaks)","cta":"string","hashtags":["string"]}`,
    emailDraft: `${base}\n\nCreate a nurture/intro email (200-300 words).\nReturn JSON: {"subject":"string","previewText":"string","body":"string (\\n for breaks)","cta":"string","signature":"string"}`,
    adCopy: `${base}\n\nCreate a direct-response ad copy set.\nReturn JSON: {"headline":"string","primaryText":"string","description":"string","cta":"string","variations":[{"headline":"string","hook":"string"}]}`,
    carousel: `${base}\n\nCreate an 8-slide educational carousel post.\nReturn JSON: {"title":"string","coverText":"string","slides":[{"headline":"string","body":"string"}],"cta":"string"}`,
    reelScript: `${base}\n\nCreate a 30-60 second reel script (hook-first).\nReturn JSON: {"hook":"string (first 3 seconds)","scenes":[{"timecode":"0-5s","action":"string","voiceover":"string","broll":"string"}],"endScreen":"string","caption":"string","hashtags":["string"]}`,
  }

  return schemas[type] || base
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, artifactType, approvalId, feedbackText } = await req.json()
    if (!workspaceId || !artifactType) {
      return NextResponse.json({ error: 'Missing workspaceId or artifactType' }, { status: 400 })
    }
    if (!ASSET_TITLES[artifactType]) {
      return NextResponse.json({ error: 'Unsupported artifact type for regeneration' }, { status: 400 })
    }

    const [brandResult, strategyResult, notesResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT note FROM learning_notes WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 10`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    const strategy = strategyResult.rows[0]?.content_json as unknown as Strategy
    const learningNotes = notesResult.rows.map((r) => r.note as string)

    if (!brand || !strategy) {
      return NextResponse.json({ error: 'Complete strategy first' }, { status: 400 })
    }

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status) VALUES (${runId}, ${workspaceId}, ${'regenerate_' + artifactType}, 'running')`

    const notesCtx = [
      learningNotes.length ? `\n\nIMPORTANT — Apply these learnings from previous feedback:\n${learningNotes.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : '',
      feedbackText ? `\n\nSPECIFIC HUMAN FEEDBACK TO ADDRESS (highest priority):\n${feedbackText}` : '',
    ].join('')
    const userPrompt = makePrompt(brand, strategy, notesCtx, artifactType)

    let assetData: unknown
    try {
      assetData = await runAgent<unknown>(SYSTEM, userPrompt)
    } catch (agentError) {
      await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
      throw agentError
    }

    await sql`UPDATE agent_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = ASSET_TITLES[artifactType]
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json) VALUES (${artifactId}, ${workspaceId}, ${runId}, ${artifactType}, ${title}, ${JSON.stringify(assetData)})`
    const newApprovalId = newId()
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newApprovalId}, ${workspaceId}, ${artifactId})`

    if (approvalId) {
      await sql`UPDATE approvals SET status = 'superseded', notes = 'Superseded by regeneration' WHERE id = ${approvalId}`
    }

    if (brand.approval_email) {
      await sendApprovalRequestEmail({
        to: brand.approval_email,
        businessName: brand.business_name,
        artifactType,
        artifactTitle: title,
      })
    }

    return NextResponse.json({ artifactId, approvalId: newApprovalId, asset: assetData })
  } catch (error) {
    console.error('Regeneration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
