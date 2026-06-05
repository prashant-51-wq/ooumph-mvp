/**
 * Influencer Mapper Worker — Growth Engine Supervisor
 * Identifies, profiles, and creates outreach strategies for
 * relevant influencers and brand collaboration partners.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Influencer Mapper Agent for Ooumph AI Marketing OS.
You identify the ideal influencer profiles, collaboration frameworks, and outreach scripts
for a brand's specific audience and budget level.
Focus on authentic fit over vanity metrics. Micro-influencers often outperform mega-influencers.
Always respond with valid JSON.`

interface InfluencerProfile {
  tier: 'nano' | 'micro' | 'mid' | 'macro' | 'mega'
  followerRange: string          // e.g. "10K-50K"
  niche: string                  // specific content niche
  platforms: string[]
  audienceMatch: string          // why their audience matches the brand
  engagementExpectation: string  // expected engagement rate
  budgetRange: string            // e.g. "₹5K-₹20K per post"
  whatToOffer: string[]          // collab types: gifting, paid, affiliate, ambassador
  redFlags: string[]             // what to watch out for
  sampleAccounts: string[]       // types of accounts (not real handles)
}

interface CollaborationTemplate {
  type: 'product_review' | 'sponsored_post' | 'takeover' | 'affiliate' | 'ambassador' | 'ugc'
  brief: string
  deliverables: string[]
  timeline: string
  compensationModel: string
  contractPoints: string[]       // key legal/business points to include
}

interface OutreachScript {
  channel: 'dm' | 'email'
  subject?: string               // for email outreach
  message: string
  followUpDay: number
  followUpMessage: string
}

interface InfluencerMapReport {
  summary: string
  idealInfluencerPersona: string  // 2-3 sentence description of the perfect fit
  priorityTier: string            // which tier to focus on and why
  influencerProfiles: InfluencerProfile[]
  searchKeywords: string[]        // hashtags/keywords to find influencers
  collaborationTemplates: CollaborationTemplate[]
  outreachScripts: OutreachScript[]
  vettingChecklist: string[]      // 7 questions to ask before partnering
  kpis: string[]                  // how to measure influencer campaign success
  budgetAllocation: string        // how to split budget across tiers
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, budget, platform } = await req.json() as {
      workspaceId: string
      budget?: string
      platform?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const [brandResult, strategyResult] = await Promise.all([
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
      sql`SELECT content_json FROM artifacts WHERE workspace_id = ${workspaceId} AND type = 'strategy' ORDER BY created_at DESC LIMIT 1`,
    ])

    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'influencer_mapper', 'running')`

    const strategy = strategyResult.rows[0]?.content_json as Record<string, unknown> | undefined
    const icp = (strategy as { icp?: Record<string, unknown> })?.icp

    const prompt = `Create an influencer partnership strategy for:

Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
${icp ? `ICP Demographics: ${JSON.stringify(icp)}` : ''}
Monthly Budget: ${budget || brand.monthly_budget || 'Not specified'}
Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Instagram'}
${platform ? `Primary Platform: ${platform}` : ''}
Prohibited Claims: ${brand.prohibited_claims || 'None'}

Strategy context:
- Map influencer tiers from nano (1K-10K) to mega (1M+)
- Focus on authentic audience match over follower count
- Include both paid and non-paid collaboration models
- Outreach scripts must not sound copy-pasted

Return JSON:
{
  "summary": "Overview of influencer strategy for this brand",
  "idealInfluencerPersona": "Description of the perfect influencer partner",
  "priorityTier": "Which tier to focus on and why",
  "influencerProfiles": [
    {
      "tier": "nano|micro|mid|macro|mega",
      "followerRange": "10K-50K",
      "niche": "specific niche",
      "platforms": ["instagram"],
      "audienceMatch": "why their audience aligns",
      "engagementExpectation": "3-6% engagement rate",
      "budgetRange": "₹5,000-₹20,000 per post",
      "whatToOffer": ["gifting", "paid post"],
      "redFlags": ["fake engagement patterns"],
      "sampleAccounts": ["accounts like: fitness coaches who share transformation stories"]
    }
  ],
  "searchKeywords": ["#keyword to find influencers"],
  "collaborationTemplates": [
    {
      "type": "product_review",
      "brief": "What to brief the influencer",
      "deliverables": ["1 reel", "3 stories", "1 static post"],
      "timeline": "2 weeks from brief to posting",
      "compensationModel": "₹15,000 flat fee",
      "contractPoints": ["usage rights", "exclusivity clause"]
    }
  ],
  "outreachScripts": [
    {
      "channel": "dm",
      "message": "Full DM message (under 300 chars for Instagram)",
      "followUpDay": 3,
      "followUpMessage": "Follow-up message"
    },
    {
      "channel": "email",
      "subject": "Collaboration opportunity with ${brand.business_name}",
      "message": "Full email body",
      "followUpDay": 5,
      "followUpMessage": "Email follow-up"
    }
  ],
  "vettingChecklist": ["Question/criterion 1", "Question/criterion 2"],
  "kpis": ["CPE (cost per engagement)", "Reach", "Conversions"],
  "budgetAllocation": "How to split influencer budget across tiers"
}`

    const report = await runAgent<InfluencerMapReport>(SYSTEM, prompt, workspaceId)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(report)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Influencer Map — ${brand.business_name}`
    const contentJson = { ...report, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'influencer_map', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'influencer_mapper', ${artifactId},
                      ${`Influencer strategy: focus on ${report.priorityTier} tier. ${report.influencerProfiles?.length || 0} profiles mapped.`}, 0.8)`

    return NextResponse.json({
      artifactId,
      report: contentJson,
      profileCount: report.influencerProfiles?.length || 0,
      message: `Influencer map created: ${report.influencerProfiles?.length || 0} influencer profiles across ${new Set(report.influencerProfiles?.map(p => p.tier)).size} tiers.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Influencer mapper error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'influencer_map'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
