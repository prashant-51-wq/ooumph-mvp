/**
 * Form Builder Worker
 * Returns Tally form suggestions, existing forms, and embed instructions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { getTallyForms } from '@/lib/tools/tally'
import { assertWorkspaceOwnership } from '@/lib/guards'
import type { BrandProfile } from '@/types'

type FormType = 'lead_capture' | 'survey' | 'registration' | 'feedback' | 'quiz'

interface SuggestedForm {
  title: string
  description: string
  fields: { type: string; label: string; required: boolean; placeholder?: string }[]
  thankYouMessage: string
  followUpEmail: { subject: string; body: string }
}

const FORM_TYPE_DESCRIPTIONS: Record<FormType, string> = {
  lead_capture: 'Collect prospect information (name, email, company) in exchange for a lead magnet or free resource',
  survey: 'Gather customer feedback or market research with multiple-choice and rating questions',
  registration: 'Event or webinar registration form with attendee details and preferences',
  feedback: 'Post-purchase or post-service feedback form to collect testimonials and improvement ideas',
  quiz: 'Interactive quiz to qualify leads or provide personalized recommendations',
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, formType = 'lead_capture', fields, context } = await req.json() as {
      workspaceId: string
      formType?: FormType
      fields?: string[]
      context?: string
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load workspace settings and brand profile
    const [wsResult, brandResult] = await Promise.all([
      sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
      sql`SELECT * FROM brand_profiles WHERE workspace_id = ${workspaceId} LIMIT 1`,
    ])

    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ms = typeof ws.model_settings === 'string' ? JSON.parse(ws.model_settings || '{}') : (ws.model_settings || {})
    const tallyApiKey: string = ms.tallyApiKey || process.env.TALLY_API_KEY || ''
    const brand = brandResult.rows[0] as unknown as BrandProfile | undefined
    const configured = !!tallyApiKey

    // Fetch existing Tally forms if connected
    let existingForms: Awaited<ReturnType<typeof getTallyForms>> = []
    if (tallyApiKey) {
      existingForms = await getTallyForms(tallyApiKey)
    }

    // Use AI to generate suggested form structure
    const businessContext = brand
      ? `Business: ${brand.business_name}. Offer: ${brand.offer}. Audience: ${brand.target_audience}. Tone: ${brand.tone}.`
      : 'A marketing-focused business.'

    let suggested: SuggestedForm
    try {
      suggested = await runAgent<SuggestedForm>(
        `You are a conversion-optimized form designer. Design forms that maximize completion rates and lead quality.`,
        `Design a ${formType} form for the following business:
${businessContext}
Form purpose: ${FORM_TYPE_DESCRIPTIONS[formType] || formType}
${context ? `Additional context: ${context}` : ''}
${fields ? `Suggested fields to include: ${fields.join(', ')}` : ''}

Respond with JSON:
{
  "title": "Form title",
  "description": "Short form description",
  "fields": [{ "type": "text|email|phone|select|radio|checkbox|textarea|number|rating", "label": "Field label", "required": true|false, "placeholder": "..." }],
  "thankYouMessage": "Thank you message after submission",
  "followUpEmail": { "subject": "Email subject", "body": "Follow-up email body (2-3 paragraphs)" }
}
Keep it concise: 3-6 fields for best conversion. Make all copy match the brand tone.`,
        '{ "title": "string", "description": "string", "fields": [], "thankYouMessage": "string", "followUpEmail": { "subject": "string", "body": "string" } }'
      )
    } catch {
      // Fallback if AI fails
      suggested = {
        title: `${brand?.business_name || 'Our'} ${formType.replace('_', ' ')} Form`,
        description: `${FORM_TYPE_DESCRIPTIONS[formType]}`,
        fields: [
          { type: 'text', label: 'Full Name', required: true, placeholder: 'Your full name' },
          { type: 'email', label: 'Email Address', required: true, placeholder: 'your@email.com' },
          { type: 'phone', label: 'Phone Number', required: false, placeholder: '+1 234 567 8900' },
        ],
        thankYouMessage: 'Thank you! We will be in touch shortly.',
        followUpEmail: {
          subject: `Thanks for your interest in ${brand?.business_name || 'us'}!`,
          body: `Hi {{name}},\n\nThank you for reaching out! We have received your submission and will get back to you within 24 hours.\n\nBest regards,\nThe ${brand?.business_name || ''} Team`,
        },
      }
    }

    const createInTallyUrl = 'https://tally.so/forms/new'
    const embedInstructions = `To embed this form on your website after creating it in Tally:
1. Create the form at ${createInTallyUrl}
2. Go to Share → Embed
3. Copy the embed code and paste it into your HTML
4. Or use the Tally popup widget for non-intrusive lead capture

Example embed code:
<iframe src="https://tally.so/embed/[FORM_ID]?alignLeft=1" width="100%" height="500" frameborder="0"></iframe>`

    return NextResponse.json({
      existingForms,
      suggested,
      createInTallyUrl,
      embedInstructions,
      configured,
      ...(!configured ? {
        notice: 'Connect your Tally account in Settings → API Keys → CRM & Booking to see your existing forms.',
      } : {}),
    })
  } catch (e) {
    console.error('Form builder error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
