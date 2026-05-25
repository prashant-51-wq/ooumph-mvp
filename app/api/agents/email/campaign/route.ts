/**
 * Email Campaign Agent
 * Creates and manages email campaigns via Mailchimp or Brevo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { claude, getModel } from '@/lib/claude'
import {
  getLists as getMCLists,
  addSubscriber,
  createCampaign as createMCCampaign,
  getCampaigns as getMCCampaigns,
  getCampaignReport,
  isMailchimpAvailable,
} from '@/lib/tools/mailchimp'
import {
  getBrevoLists,
  createEmailCampaign as createBrevoCampaign,
  getContacts,
  createContact,
  sendTransactionalEmail,
  isBrevoAvailable,
} from '@/lib/tools/brevo'

type Action = 'generate' | 'create' | 'list' | 'report' | 'lists'
type Provider = 'mailchimp' | 'brevo' | 'auto'

interface RequestBody {
  workspaceId: string
  action: Action
  // generate
  topic?: string
  audience?: string
  tone?: string
  provider?: Provider
  // create
  subject?: string
  htmlContent?: string
  listId?: string
  campaignName?: string
  // report
  campaignId?: string
}

function loadSettings(ws: Record<string, unknown>): Record<string, string> {
  const raw = ws.model_settings
  return (typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {})) as Record<string, string>
}

function injectMailchimpEnv(settings: Record<string, string>) {
  if (settings.mailchimpApiKey) process.env.MAILCHIMP_API_KEY = settings.mailchimpApiKey
  if (settings.mailchimpServer) process.env.MAILCHIMP_SERVER = settings.mailchimpServer
}

function injectBrevoEnv(settings: Record<string, string>) {
  if (settings.brevoApiKey) process.env.BREVO_API_KEY = settings.brevoApiKey
}

function detectProvider(settings: Record<string, string>, preferred: Provider = 'auto'): 'mailchimp' | 'brevo' | null {
  const hasMC = !!settings.mailchimpApiKey
  const hasBrevo = !!settings.brevoApiKey

  if (preferred === 'mailchimp' && hasMC) return 'mailchimp'
  if (preferred === 'brevo' && hasBrevo) return 'brevo'
  if (preferred === 'auto') {
    if (hasMC) return 'mailchimp'
    if (hasBrevo) return 'brevo'
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody
    const { workspaceId, action } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

    // Load workspace + settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const settings = loadSettings(ws)

    // ── Generate ─────────────────────────────────────────────────────────────
    if (action === 'generate') {
      const { topic = '', audience = 'our subscribers', tone = 'professional' } = body
      if (!topic.trim()) return NextResponse.json({ error: 'topic is required for generate action' }, { status: 400 })

      const runId = newId()
      await sql`
        INSERT INTO agent_runs (id, workspace_id, agent_name, status)
        VALUES (${runId}, ${workspaceId}, 'email_campaign_writer', 'running')
      `

      const model = getModel(settings as Record<string, unknown>)
      let subject = ''
      let htmlContent = ''

      try {
        const systemPrompt = `You are an expert email marketer. Generate professional, conversion-focused HTML email campaigns with compelling subject lines. Always write clean, inline-styled HTML that renders well across email clients.`

        const userPrompt = `Generate a complete email campaign for the following brief:

Topic: ${topic}
Target Audience: ${audience}
Tone: ${tone}

Return a JSON object with exactly these fields:
{
  "subject": "...(compelling subject line, under 60 chars)",
  "htmlContent": "...(full HTML email body with inline styles, <p> tags, structure, and a clear CTA)"
}

Respond with ONLY the JSON object, no markdown fences.`

        const response = await claude.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })

        const raw = response.content[0].type === 'text' ? response.content[0].text : ''
        const jsonMatch = raw.match(/```json\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/)
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : raw
        const parsed = JSON.parse(jsonStr) as { subject: string; htmlContent: string }
        subject = parsed.subject || ''
        htmlContent = parsed.htmlContent || ''
      } catch (agentError) {
        await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
        throw agentError
      }

      // Strip HTML tags for preview
      const preview = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)

      await sql`
        UPDATE agent_runs
        SET status = 'completed', output_json = ${JSON.stringify({ subject, topic, audience })}, completed_at = CURRENT_TIMESTAMP
        WHERE id = ${runId}
      `

      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
        VALUES (${artifactId}, ${workspaceId}, ${runId}, 'email_campaign',
          ${subject || topic},
          ${JSON.stringify({ subject, topic, audience, htmlContent: htmlContent.slice(0, 500) })},
          'pending_approval')
      `

      return NextResponse.json({ ok: true, subject, htmlContent, preview, artifactId })
    }

    // ── Create ────────────────────────────────────────────────────────────────
    if (action === 'create') {
      const { subject = '', htmlContent = '', listId = '', campaignName = 'Ooumph Campaign', provider: preferredProvider = 'auto' } = body
      if (!subject.trim()) return NextResponse.json({ error: 'subject is required' }, { status: 400 })
      if (!htmlContent.trim()) return NextResponse.json({ error: 'htmlContent is required' }, { status: 400 })
      if (!listId.trim()) return NextResponse.json({ error: 'listId is required' }, { status: 400 })

      const provider = detectProvider(settings, preferredProvider)
      if (!provider) {
        return NextResponse.json({
          error: 'No email provider configured. Add Mailchimp or Brevo API key in Settings.',
          configured: false,
        }, { status: 400 })
      }

      let campaignId: string | null = null

      if (provider === 'mailchimp') {
        injectMailchimpEnv(settings)
        campaignId = await createMCCampaign(listId, subject, htmlContent)
      } else {
        injectBrevoEnv(settings)
        const result = await createBrevoCampaign(campaignName, subject, htmlContent, [parseInt(listId, 10)])
        if (result) campaignId = String(result.id)
      }

      if (!campaignId) {
        return NextResponse.json({ error: `Failed to create campaign in ${provider}. Check API credentials.` }, { status: 500 })
      }

      return NextResponse.json({ ok: true, campaignId, provider, message: 'Campaign created successfully' })
    }

    // ── List ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const provider = detectProvider(settings, body.provider ?? 'auto')
      if (!provider) {
        return NextResponse.json({ ok: true, campaigns: [], provider: null, configured: false })
      }

      let campaigns: unknown[] = []
      if (provider === 'mailchimp') {
        injectMailchimpEnv(settings)
        campaigns = await getMCCampaigns(20)
      }
      // Brevo does not expose a simple campaign-list endpoint in the current tool wrapper

      return NextResponse.json({ ok: true, campaigns, provider })
    }

    // ── Lists (audiences) ─────────────────────────────────────────────────────
    if (action === 'lists') {
      const provider = detectProvider(settings, body.provider ?? 'auto')
      if (!provider) {
        return NextResponse.json({ ok: true, lists: [], provider: null, configured: false })
      }

      let lists: unknown[] = []
      if (provider === 'mailchimp') {
        injectMailchimpEnv(settings)
        lists = await getMCLists()
      } else {
        injectBrevoEnv(settings)
        lists = await getBrevoLists()
      }

      return NextResponse.json({ ok: true, lists, provider })
    }

    // ── Report ────────────────────────────────────────────────────────────────
    if (action === 'report') {
      const { campaignId } = body
      if (!campaignId) return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })

      const provider = detectProvider(settings, body.provider ?? 'auto')
      if (provider === 'mailchimp') {
        injectMailchimpEnv(settings)
        const report = await getCampaignReport(campaignId)
        if (!report) return NextResponse.json({ error: 'Report not found or API error' }, { status: 404 })
        return NextResponse.json({ ok: true, report, provider })
      }

      return NextResponse.json({ error: 'Report only available for Mailchimp at this time' }, { status: 400 })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Email campaign agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
