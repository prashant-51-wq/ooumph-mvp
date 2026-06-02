/**
 * Approval Notifier Agent
 * Sends email notifications for content approval workflow events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { Resend } from 'resend'
import { assertWorkspaceOwnership } from '@/lib/guards'

const FROM = 'Ooumph AI <onboarding@resend.dev>'

const ARTIFACT_LABELS: Record<string, string> = {
  strategy: 'Marketing Strategy',
  content_calendar: '30-Day Content Calendar',
  carousel: 'Carousel Post',
  reelScript: 'Reel Script',
  adCopy: 'Ad Copy Set',
  emailDraft: 'Email Draft',
  linkedInPost: 'LinkedIn Post',
  funnel_plan: 'Funnel Blueprint',
  lead_gen_plan: 'Lead Generation Plan',
  visual_carousel: 'Visual Carousel',
  visual_post: 'Static Post Design',
  visual_story: 'Story / Reel Cover',
  visual_ad: 'Ad Creative Pack',
  youtube_thumbnail: 'YouTube Thumbnail',
  video_brief: 'Video Brief & Storyboard',
  landing_visual_pack: 'Landing Page Visual Pack',
  campaign_brief: 'Campaign Brief',
  growth_plan: 'Growth Engine Plan',
  trend_report: 'Trend Scout Report',
  hashtag_seo_report: 'Hashtag & SEO Strategy',
  engagement_playbook: 'Engagement Playbook',
  influencer_map: 'Influencer Map',
  youtube_strategy: 'YouTube Growth Strategy',
  landing_page: 'Landing Page',
  email_sequence: 'Email Sequence',
  lead_scoring_model: 'Lead Scoring Model',
  whatsapp_broadcast: 'WhatsApp Broadcast',
  analytics_report: 'Analytics & Performance Report',
  ab_test: 'A/B Test Variations',
  brand_monitor: 'Brand Monitor Report',
}

type NotifyType = 'approval_needed' | 'approved' | 'rejected'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, type, artifactId, artifactType, message, recipientEmail } = await req.json() as {
      workspaceId: string
      type: NotifyType
      artifactId?: string
      artifactType?: string
      message?: string
      recipientEmail?: string
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!type) return NextResponse.json({ error: 'Missing notification type' }, { status: 400 })

    // Load workspace + brand profile to get approval email and business name
    const bpResult = await sql`SELECT bp.* FROM brand_profiles bp JOIN workspaces w ON bp.workspace_id = w.id WHERE w.id = ${workspaceId} LIMIT 1`
    const bp = bpResult.rows[0] as { business_name: string; approval_email: string } | undefined

    const businessName = bp?.business_name || 'Your Business'
    const to = recipientEmail || bp?.approval_email || ''

    if (!to) {
      return NextResponse.json({ sent: false, message: 'No recipient email configured. Set an approval email in Settings.' })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ sent: false, message: 'Resend not configured. Add RESEND_API_KEY to environment variables.' })
    }

    const resend = new Resend(resendKey)
    const artifactLabel = artifactType ? (ARTIFACT_LABELS[artifactType] || artifactType) : 'Content'
    const approvalsUrl = 'https://ooumph-mvp.vercel.app/dashboard/approvals'

    let subject = ''
    let html = ''

    if (type === 'approval_needed') {
      subject = `[${businessName}] New content ready for your review: ${artifactLabel}`
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI</span>
          </div>
          <h2 style="color:#fff;margin:0 0 8px;">Your AI just finished a new piece of content</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">Ready for your review and approval:</p>
          <div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Content Type</p>
            <p style="margin:0;color:#fff;font-size:18px;font-weight:600;">${artifactLabel}</p>
            <p style="margin:4px 0 0;color:#818cf8;font-size:13px;">${businessName}</p>
            ${message ? `<p style="margin:12px 0 0;color:#9ca3af;font-size:13px;border-top:1px solid #374151;padding-top:12px;">${message}</p>` : ''}
          </div>
          <a href="${approvalsUrl}"
            style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Review &amp; Approve →
          </a>
          <p style="color:#4b5563;font-size:12px;margin-top:32px;">
            Nothing is published or sent until you approve it. You're always in control.
          </p>
        </div>
      `
    } else if (type === 'approved') {
      subject = `[${businessName}] ${artifactLabel} approved and ready for publishing`
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI</span>
          </div>
          <h2 style="color:#fff;margin:0 0 8px;">✅ Content approved</h2>
          <div style="background:#1f2937;border:1px solid #166534;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;">Approved Content</p>
            <p style="margin:0;color:#fff;font-weight:600;">${artifactLabel}</p>
            <p style="margin:4px 0 0;color:#4ade80;font-size:13px;">${businessName}</p>
            ${message ? `<p style="margin:12px 0 0;color:#9ca3af;font-size:13px;border-top:1px solid #374151;padding-top:12px;">${message}</p>` : ''}
          </div>
          <p style="color:#6b7280;">This content is approved and ready for publishing. Head to Export to download your assets.</p>
          <a href="${approvalsUrl}"
            style="display:inline-block;background:#1f2937;color:#e5e7eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;border:1px solid #374151;margin-top:8px;">
            Back to Approvals →
          </a>
        </div>
      `
    } else if (type === 'rejected') {
      subject = `[${businessName}] ${artifactLabel} rejected — content will be regenerated`
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI</span>
          </div>
          <h2 style="color:#fff;margin:0 0 8px;">❌ Content rejected — AI will learn</h2>
          <div style="background:#1f2937;border:1px solid #7f1d1d;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;">Rejected Content</p>
            <p style="margin:0;color:#fff;font-weight:600;">${artifactLabel}</p>
            ${message ? `<p style="margin:12px 0 0;color:#9ca3af;font-size:13px;border-top:1px solid #374151;padding-top:12px;">Feedback: ${message}</p>` : ''}
          </div>
          <p style="color:#6b7280;">Your feedback has been saved. Use Regenerate in the Approvals queue to create an improved version incorporating your feedback.</p>
          <a href="${approvalsUrl}"
            style="display:inline-block;background:#1f2937;color:#e5e7eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;border:1px solid #374151;margin-top:8px;">
            Back to Approvals →
          </a>
        </div>
      `
    } else {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    }

    await resend.emails.send({ from: FROM, to, subject, html })

    return NextResponse.json({ sent: true, message: `Notification sent to ${to}` })
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
