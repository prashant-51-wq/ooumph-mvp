/**
 * Shared creative generation functions — callable by any supervisor agent.
 * Each function is the same logic as the HTTP route but importable directly,
 * avoiding HTTP-to-self round-trips between agents.
 */
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { sendApprovalRequestEmail } from '@/lib/email'
import type { BrandProfile } from '@/types'

// ─── shared result type ───────────────────────────────────────────────────────

export interface CreativeResult {
  artifactId: string
  approvalId: string
  artifactType: string
  title: string
  contentJson: Record<string, unknown>
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getBrand(workspaceId: string): Promise<BrandProfile | null> {
  const r = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
  return (r.rows[0] as unknown as BrandProfile) || null
}

async function saveArtifact(
  workspaceId: string,
  type: string,
  title: string,
  contentJson: Record<string, unknown>,
  brand: BrandProfile | null
): Promise<{ artifactId: string; approvalId: string }> {
  const artifactId = newId()
  const approvalId = newId()
  await sql`INSERT INTO artifacts (id, workspace_id, type, title, content_json)
            VALUES (${artifactId}, ${workspaceId}, ${type}, ${title}, ${JSON.stringify(contentJson)})`
  await sql`INSERT INTO approvals (id, workspace_id, artifact_id)
            VALUES (${approvalId}, ${workspaceId}, ${artifactId})`
  if (brand?.approval_email) {
    await sendApprovalRequestEmail({
      to: brand.approval_email,
      businessName: brand.business_name,
      artifactType: type,
      artifactTitle: title,
    }).catch(() => {/* non-fatal */})
  }
  return { artifactId, approvalId }
}

// ─── W-C1: Static Post ────────────────────────────────────────────────────────

const STATIC_POST_SYSTEM = `You are a social media copywriter. Write scroll-stopping static post content.
Respond ONLY with valid JSON.`

export async function generateStaticPost(
  workspaceId: string,
  topic: string,
  platform: 'instagram' | 'linkedin' = 'instagram'
): Promise<CreativeResult> {
  const brand = await getBrand(workspaceId)
  if (!brand) throw new Error('Brand profile not found')

  const copy = await runAgent<{ hook: string; body: string; cta: string; hashtags: string[] }>(
    STATIC_POST_SYSTEM,
    `Create a ${platform} static post for:
Topic: ${topic}
Business: ${brand.business_name} | Audience: ${brand.target_audience} | Tone: ${brand.tone}
Return JSON: { "hook": "≤8 words", "body": "15-25 words", "cta": "3-6 words", "hashtags": ["5-8 words without #"] }`,
    workspaceId,
  )

  const contentJson = { topic, businessName: brand.business_name, tone: brand.tone, platform, ...copy }
  const title = `Static Post — ${topic.slice(0, 60)} (${platform})`
  const { artifactId, approvalId } = await saveArtifact(workspaceId, 'visual_post', title, contentJson, brand)
  return { artifactId, approvalId, artifactType: 'visual_post', title, contentJson }
}

// ─── W-C3: Story Cover ────────────────────────────────────────────────────────

const STORY_SYSTEM = `You are a vertical content strategist. Create Story/Reel cover copy that drives tap-throughs.
Respond ONLY with valid JSON.`

export async function generateStoryCover(
  workspaceId: string,
  topic: string,
  platform: 'instagram' | 'youtube_shorts' | 'facebook' = 'instagram'
): Promise<CreativeResult> {
  const brand = await getBrand(workspaceId)
  if (!brand) throw new Error('Brand profile not found')

  const copy = await runAgent<{ hook: string; subtext: string; cta: string; label: string }>(
    STORY_SYSTEM,
    `Create Story/Reel cover for:
Topic: ${topic}
Business: ${brand.business_name} | Tone: ${brand.tone}
Return JSON: { "hook": "≤6 bold words", "subtext": "8-15 supporting words", "cta": "3-6 words", "label": "1-2 word badge (NEW/TIPS/WATCH)" }`,
    workspaceId,
  )

  const contentJson = { topic, businessName: brand.business_name, tone: brand.tone, platform, ...copy }
  const title = `Story Cover — ${topic.slice(0, 60)}`
  const { artifactId, approvalId } = await saveArtifact(workspaceId, 'visual_story', title, contentJson, brand)
  return { artifactId, approvalId, artifactType: 'visual_story', title, contentJson }
}

// ─── W-C5: Ad Creative ────────────────────────────────────────────────────────

const AD_SYSTEM = `You are a performance marketing expert. Write high-converting ad copy. Respond ONLY with valid JSON.`

export async function generateAdCreative(
  workspaceId: string,
  topic: string,
  platform: string = 'facebook',
  sizes: string[] = ['square', 'landscape', 'story']
): Promise<CreativeResult> {
  const brand = await getBrand(workspaceId)
  if (!brand) throw new Error('Brand profile not found')

  const copy = await runAgent<{ headline: string; subtext: string; cta: string; offer: string }>(
    AD_SYSTEM,
    `Create a ${platform} ad for:
Offer/Topic: ${topic}
Business: ${brand.business_name} | Audience: ${brand.target_audience} | Tone: ${brand.tone}
Return JSON: { "headline": "≤7 words", "subtext": "10-18 words", "cta": "2-5 words", "offer": "3-8 word badge" }`,
    workspaceId,
  )

  const contentJson = { topic, businessName: brand.business_name, tone: brand.tone, platform, sizes, ...copy }
  const title = `Ad Creative — ${topic.slice(0, 60)} (${platform})`
  const { artifactId, approvalId } = await saveArtifact(workspaceId, 'visual_ad', title, contentJson, brand)
  return { artifactId, approvalId, artifactType: 'visual_ad', title, contentJson }
}

// ─── W-C4: Video Brief ────────────────────────────────────────────────────────

const VIDEO_SYSTEM = `You are a video director. Create scene-by-scene video briefs. Respond ONLY with valid JSON.`

export async function generateVideoBrief(
  workspaceId: string,
  topic: string,
  format: 'reel' | 'story' | 'short' | 'youtube' | 'square' | 'ad' = 'reel'
): Promise<CreativeResult> {
  const brand = await getBrand(workspaceId)
  if (!brand) throw new Error('Brand profile not found')

  // Pull reel script from content supervisor if available
  const scriptResult = await sql`SELECT content_json FROM artifacts
    WHERE workspace_id = ${workspaceId} AND type = 'reelScript'
    ORDER BY created_at DESC LIMIT 1`
  const reelScript = scriptResult.rows[0]?.content_json

  const sceneCount = format === 'youtube' ? 8 : format === 'ad' ? 4 : 6

  const copy = await runAgent<{
    title: string; hook: string; totalDuration: string; musicStyle: string; colorGrading: string;
    scenes: Array<{ sceneNum: number; shotType: string; visual: string; script: string; duration: string; transition: string }>;
    postCaption: string; hashtags: string[]
  }>(
    VIDEO_SYSTEM,
    `Create ${format} video brief (${sceneCount} scenes):
Topic: ${topic}
Business: ${brand.business_name} | Audience: ${brand.target_audience} | Tone: ${brand.tone}
${reelScript ? `Existing reel script to adapt: ${JSON.stringify(reelScript)}` : ''}
Return JSON with: title, hook, totalDuration, musicStyle, colorGrading, scenes[${sceneCount}], postCaption, hashtags`,
    workspaceId,
  )

  const contentJson = {
    topic, businessName: brand.business_name, tone: brand.tone, format,
    pulledFrom: { reelScript: !!reelScript },
    ...copy,
  }
  const title = `Video Brief — ${copy.title || topic.slice(0, 60)}`
  const { artifactId, approvalId } = await saveArtifact(workspaceId, 'video_brief', title, contentJson, brand)
  return { artifactId, approvalId, artifactType: 'video_brief', title, contentJson }
}

// ─── W-C6: Landing Page Visual Pack ──────────────────────────────────────────

const LANDING_SYSTEM = `You are a CRO expert and landing page copywriter. Write high-converting landing page content.
Respond ONLY with valid JSON.`

export async function generateLandingVisual(
  workspaceId: string,
  pageType: string = 'lead_capture'
): Promise<CreativeResult> {
  const brand = await getBrand(workspaceId)
  if (!brand) throw new Error('Brand profile not found')

  // Pull from multiple supervisors
  const [strategyResult, funnelResult, leadResult] = await Promise.all([
    sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'funnel_plan' ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'lead_gen_plan' ORDER BY created_at DESC LIMIT 1`,
  ])

  const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
  const funnel = funnelResult.rows[0]?.content_json as Record<string, unknown> | undefined
  const leadGen = leadResult.rows[0]?.content_json as Record<string, unknown> | undefined

  const copy = await runAgent<{
    pageName: string;
    hero: { tag: string; headline: string; sub: string; cta: string };
    features: { tag: string; headline: string; items: Array<{ title: string; desc: string }> };
    stats: { items: Array<{ num: string; label: string }> };
    cta: { tag: string; headline: string; sub: string; cta: string };
    seoTitle: string; seoDescription: string; ogHeadline: string;
  }>(
    LANDING_SYSTEM,
    `Create landing page visual pack for ${pageType} page:
Business: ${brand.business_name} | Audience: ${brand.target_audience} | Tone: ${brand.tone}
UVP: ${brand.unique_value_prop || ''}
${strategy ? `Strategy: ${JSON.stringify((strategy as Record<string, unknown>).keyMessages || '')}` : ''}
${funnel ? `Funnel offer: ${JSON.stringify((funnel as Record<string, unknown>).topOfFunnelOffer || '')}` : ''}
${leadGen ? `Lead magnet: ${JSON.stringify((leadGen as Record<string, unknown>).leadMagnet || '')}` : ''}
Return JSON: pageName, hero{tag,headline,sub,cta}, features{tag,headline,items[3]}, stats{items[3-4]}, cta{tag,headline,sub,cta}, seoTitle, seoDescription, ogHeadline`,
    workspaceId,
  )

  const contentJson = {
    ...copy, businessName: brand.business_name, tone: brand.tone, pageType,
    pulledFrom: { strategy: !!strategy, funnelPlan: !!funnel, leadGenPlan: !!leadGen },
  }
  const title = `Landing Page — ${copy.pageName || pageType}`
  const { artifactId, approvalId } = await saveArtifact(workspaceId, 'landing_visual_pack', title, contentJson, brand)
  return { artifactId, approvalId, artifactType: 'landing_visual_pack', title, contentJson }
}
