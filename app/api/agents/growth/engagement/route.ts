/**
 * Engagement Worker — Growth Engine Supervisor
 * Generates reply templates, comment strategies, DM sequences,
 * and community management scripts to drive engagement loops.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

const SYSTEM = `You are the Engagement Strategy Agent for Ooumph AI Marketing OS.
You create authentic, brand-aligned engagement playbooks: reply templates, comment strategies,
DM sequences, and community management scripts that build genuine relationships.
Never sound robotic or spammy. Match the brand's exact tone.
Always respond with valid JSON.`

interface ReplyTemplate {
  scenario: string        // e.g. "positive comment on product", "question about pricing"
  platform: string
  template: string        // the actual reply with [PERSONALISE] placeholders
  toneTip: string         // how to adapt this template
  avoidPhrases: string[]  // phrases that sound fake for this brand
}

interface DMSequence {
  trigger: string         // e.g. "new follower", "post engagement", "story reply"
  step: number
  delayHours: number
  message: string
  goal: string
}

interface EngagementPlaybook {
  brandVoiceReminder: string       // 1-line tone summary for community managers
  replyTemplates: ReplyTemplate[]  // 10-15 scenario-specific templates
  commentStrategy: {
    outboundCommentTargets: string[]  // types of accounts to comment on
    commentTemplates: string[]        // 5 authentic comment templates
    avoidAccounts: string[]           // competitor accounts / spam risk
    dailyCommentGoal: number
  }
  dmSequences: DMSequence[]        // 3-4 trigger-based DM flows
  engagementHours: string          // best times to actively engage
  weeklyEngagementRitual: string[] // 5-step weekly community management checklist
  crisisResponseScript: string     // how to handle negative comments
  ugcStrategy: string              // how to encourage and repost user content
}

export async function POST(req: NextRequest) {
  let runId: string | null = null
  try {
    const { workspaceId, platform } = await req.json() as {
      workspaceId: string
      platform?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const brandResult = await sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`
    const brand = brandResult.rows[0] as unknown as BrandProfile
    if (!brand) return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })

    runId = newId()
    await sql`INSERT INTO agent_runs (id, workspace_id, agent_name, status)
              VALUES (${runId}, ${workspaceId}, 'engagement_agent', 'running')`

    const prompt = `Create an engagement playbook for:

Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Offer: ${brand.offer}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || 'Instagram, LinkedIn'}
${platform ? `Focus Platform: ${platform}` : ''}
Prohibited Claims: ${brand.prohibited_claims || 'None specified'}

Rules:
- All templates must sound like a real person, not a bot
- Reply templates must have [PERSONALISE] markers for human customisation
- DM sequences must respect platform policies (no unsolicited promotions in first message)
- Comment strategy must target complementary brands, not direct competitors
- Crisis response must de-escalate, not argue

Return JSON:
{
  "brandVoiceReminder": "1-line tone reminder for anyone managing comments",
  "replyTemplates": [
    {
      "scenario": "positive product comment",
      "platform": "instagram",
      "template": "Actual reply template with [NAME] placeholders",
      "toneTip": "How to make this feel personal",
      "avoidPhrases": ["phrase to avoid"]
    }
  ],
  "commentStrategy": {
    "outboundCommentTargets": ["type of account to comment on"],
    "commentTemplates": ["authentic comment 1", "authentic comment 2"],
    "avoidAccounts": ["competitor accounts", "spam accounts"],
    "dailyCommentGoal": 10
  },
  "dmSequences": [
    {
      "trigger": "new follower who engaged with a post",
      "step": 1,
      "delayHours": 2,
      "message": "Full DM message",
      "goal": "Build relationship"
    }
  ],
  "engagementHours": "Tue-Thu 9-11am and 7-9pm IST",
  "weeklyEngagementRitual": ["Step 1: ...", "Step 2: ..."],
  "crisisResponseScript": "Step-by-step guide for handling negative comments or PR issues",
  "ugcStrategy": "How to encourage, collect, and reshare user-generated content"
}`

    const playbook = await runAgent<EngagementPlaybook>(SYSTEM, prompt, workspaceId)

    await sql`UPDATE agent_runs SET status = 'completed', output_json = ${JSON.stringify(playbook)}, completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`

    const artifactId = newId()
    const title = `Engagement Playbook — ${brand.business_name}`
    const contentJson = { ...playbook, businessName: brand.business_name }
    await sql`INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json)
              VALUES (${artifactId}, ${workspaceId}, ${runId}, 'engagement_playbook', ${title}, ${JSON.stringify(contentJson)})`
    await sql`INSERT INTO approvals (id, workspace_id, artifact_id) VALUES (${newId()}, ${workspaceId}, ${artifactId})`

    await sql`INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence)
              VALUES (${newId()}, ${workspaceId}, 'engagement_agent', ${artifactId},
                      ${`Engagement playbook created for ${brand.business_name}. Daily comment goal: ${playbook.commentStrategy?.dailyCommentGoal || 10}`}, 0.8)`

    return NextResponse.json({
      artifactId,
      playbook: contentJson,
      templateCount: playbook.replyTemplates?.length || 0,
      message: `Engagement playbook created: ${playbook.replyTemplates?.length || 0} reply templates, ${playbook.dmSequences?.length || 0} DM sequences.`,
    })
  } catch (error) {
    if (runId) await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
    console.error('Engagement agent error:', error)
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
    WHERE a.workspace_id = ${workspaceId} AND a.type = 'engagement_playbook'
    ORDER BY a.created_at DESC LIMIT 5
  `
  return NextResponse.json(result.rows)
}
