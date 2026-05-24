import { Resend } from 'resend'

const FROM = 'Ooumph AI <onboarding@resend.dev>'

function getResend() {
  const key = (process.env.RESEND_API_KEY || '').replace(/^﻿/, '').trim()
  return new Resend(key)
}

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
}

export async function sendApprovalRequestEmail({
  to,
  businessName,
  artifactType,
  artifactTitle,
}: {
  to: string
  businessName: string
  artifactType: string
  artifactTitle: string
}) {
  const label = ARTIFACT_LABELS[artifactType] || artifactTitle
  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: `[${businessName}] New content ready for review: ${label}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI</span>
          </div>
          <h2 style="color:#fff;margin:0 0 8px;">Your AI just finished a new piece of content</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">Ready for your review and approval:</p>
          <div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Content Type</p>
            <p style="margin:0;color:#fff;font-size:18px;font-weight:600;">${label}</p>
            <p style="margin:4px 0 0;color:#818cf8;font-size:13px;">${businessName}</p>
          </div>
          <a href="https://ooumph-mvp.vercel.app/dashboard/approvals"
            style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Review &amp; Approve →
          </a>
          <p style="color:#4b5563;font-size:12px;margin-top:32px;">
            Nothing is published or sent until you approve it. You're always in control.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Email send failed (non-fatal):', err)
  }
}

export async function sendApprovalConfirmationEmail({
  to,
  businessName,
  artifactType,
  action,
  notes,
}: {
  to: string
  businessName: string
  artifactType: string
  action: 'approved' | 'rejected'
  notes?: string
}) {
  const label = ARTIFACT_LABELS[artifactType] || artifactType
  const isApproved = action === 'approved'
  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: `[${businessName}] ${label} ${isApproved ? 'approved' : 'rejected'}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI</span>
          </div>
          <h2 style="color:#fff;margin:0 0 8px;">
            ${isApproved ? '✅ Content approved' : '❌ Content rejected — AI will learn'}
          </h2>
          <div style="background:#1f2937;border:1px solid ${isApproved ? '#166534' : '#7f1d1d'};border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;">Content</p>
            <p style="margin:0;color:#fff;font-weight:600;">${label}</p>
            ${notes ? `<p style="margin:12px 0 0;color:#9ca3af;font-size:13px;border-top:1px solid #374151;padding-top:12px;">Feedback: ${notes}</p>` : ''}
          </div>
          ${isApproved
            ? '<p style="color:#6b7280;">This content is locked in. Head to Export to download your full plan.</p>'
            : '<p style="color:#6b7280;">Your feedback has been saved. Use Regenerate in the Approvals queue to create an improved version.</p>'
          }
          <a href="https://ooumph-mvp.vercel.app/dashboard/approvals"
            style="display:inline-block;background:#1f2937;color:#e5e7eb;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;border:1px solid #374151;margin-top:8px;">
            Back to Approvals →
          </a>
        </div>
      `,
    })
  } catch (err) {
    console.error('Email send failed (non-fatal):', err)
  }
}
