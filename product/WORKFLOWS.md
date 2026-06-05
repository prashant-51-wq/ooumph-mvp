# WORKFLOWS.md — Business Process & System Flow Maps
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Status:** Active

---

## Workflow 1: New Lead Capture → CRM → Nurture → Sales Handoff

```
Form submission received (landing page / Tally webhook)
  → form_submissions record created
  → Contact record created (or upserted if email exists)
  → lead_source recorded
  → consent_status set from form field
  → do_not_contact = false (default)
  → Lead Scorer agent triggered
      → Scores lead: fit_score + intent_score + lead_score
      → Updates contact record
  → Notification created: "New lead: {name}" (severity: info)
  → If lead_score >= 70 (hot lead):
      → Sales Outreach agent drafts personalized email
      → Approval record created (type: sales_outreach)
      → Notification: "Hot lead — approval required"
      → WAIT FOR HUMAN APPROVAL
          → Approved: Email queued for sending (NOT auto-sent)
          → Rejected: Draft saved, feedback recorded to memory
  → If lead_score 40–69 (warm lead):
      → Added to nurture sequence
      → Approval record created (type: nurture_sequence)
  → If lead_score < 40 (cold lead):
      → Tagged as cold
      → Scheduled for re-scoring in 7 days (cron)
  → CRM activity timeline updated
  → Memory updated: lead source performance
```

**Failure paths:**
- Form webhook fails → retry 3 times, then alert workspace owner
- Lead scorer fails → contact created without score, manual review flagged
- Duplicate email → upsert (update existing contact, don't create duplicate)

---

## Workflow 2: AI CMO Chat → Proposal → Agent Execution → Approval

```
User types message in CMO chat interface
  → POST /api/agents/cmo (SSE stream)
  → CMO agent loads workspace context:
      business_name, industry, goals, target_audience,
      tone, channels, competitors, brand_voice, offers
  → CMO streams response tokens to UI
  → Response parsed for <proposal> tag
  → If proposal detected:
      → artifact created (type: proposal)
      → approval record created (status: pending)
      → SSE event: artifact_created
      → SSE event: approval_pending
      → Notification: "New proposal needs your review"
  → User clicks "Deploy all agents" (approve proposal)
      → HUMAN APPROVES
      → Agent execution begins
      → Sub-agents run in sequence per team tier:
          Tier 1: CMO (strategy)
          Tier 2: Content Supervisor / Growth Supervisor
          Tier 3: Blog / Social / Email / Ad copy workers
      → Each agent creates artifacts
      → Each artifact → approval record
      → All artifacts land in Approvals queue
  → User reviews each artifact
      → Approve: artifact.status = 'approved'
          → If publishDestination set: → scheduled_content created
      → Reject: artifact.status = 'rejected', notes saved
          → Rejection reason saved to memory (failed_pattern)
```

---

## Workflow 3: Content Creation → Approval → Publishing

```
User or CMO agent requests content creation
  → Content Supervisor agent orchestrates:
      → Blog Writer agent: generates long-form post
      → Social Agent: generates platform-specific posts
      → Email Copy agent: generates campaign email
  → Each artifact enters approval queue
  → User reviews in Approvals page
  → User approves with optional publishDestination
      → scheduled_content record created:
          platform, content_body, media_urls, scheduled_at
  → Cron job: publish-scheduled (every 5 minutes)
      → Finds pending posts with scheduled_at <= NOW()
      → Calls platform API (Instagram/Facebook/Twitter/LinkedIn etc.)
      → On success: status = 'published', notification created
      → On failure: status = 'failed', error logged, notification created
```

---

## Workflow 4: Sales Lead → Qualification → Handoff to Human Rep

```
Lead enters CRM (any source)
  → Lead Research agent runs:
      → Searches web for company info (Brave Search)
      → Enriches contact with company size, industry, role
      → Updates contact record
  → Lead Qualification agent runs:
      → Checks ICP match (industry, company size, role, budget signals)
      → Scores: qualification_status, fit_score, intent_score
      → Recommends next step
  → If qualification_status = 'qualified' AND fit_score >= 75:
      → Sales Handoff Agent generates handoff packet:
          lead_profile, company_profile, source, campaign_history,
          emails_opened, pages_visited, objections, pain_points,
          recommended_sales_angle, suggested_opening_line,
          suggested_questions, recommended_offer, CRM_timeline, risk_flags
      → Approval record created (type: sales_handoff)
      → HUMAN APPROVES HANDOFF
          → Human sales rep assigned
          → Notification to sales rep: "Hot lead ready for call"
          → CRM stage updated: 'qualified' → 'proposal'
          → Meeting Booking Message drafted by agent
          → Human sends booking message (NOT auto-sent)
  → If reply detected (future webhook):
      → CRM activity logged
      → Outreach agent drafts follow-up
      → Human reviews before sending
```

---

## Workflow 5: Email Campaign → Approval → Send

```
User or CMO requests email campaign
  → Email Copy agent drafts:
      subject_line, body_html, preview_text, CTA
  → Compliance Review agent checks:
      → Unsubscribe handling present?
      → Consent required for this list?
      → Any claims that need substantiation?
      → Passes / Fails compliance check
  → If compliance check fails:
      → Approval blocked, compliance issues shown
      → User must fix before approval possible
  → If compliance check passes:
      → Approval record created (type: email_campaign)
      → HUMAN APPROVES
          → email_campaigns record created (status: approved)
          → If scheduled_at set: campaign queued
          → Cron: email-campaigns (every 15 minutes)
              → Sends via connected ESP (Klaviyo/Resend/Mailchimp)
              → Updates sent_count, tracks opens/clicks via webhooks
```

---

## Workflow 6: Brand Monitoring → Alert → Response

```
Cron: brand-monitoring (every hour)
  → For each workspace with brand-monitor agent active:
  → Calls Brave Search: "{businessName}" + "{competitors}"
  → Returns: mentions, sentiment signals, news
  → Claude analyzes sentiment: positive / neutral / negative
  → Claude assesses severity: low / medium / high / critical
  → If severity >= medium:
      → Notification created: "Brand alert: {summary}"
      → Crisis detail saved to agent_runs output
  → If severity = critical:
      → Urgent notification (severity: error)
      → Suggested response drafted
      → Approval required to publish any response
```

---

## Workflow 7: Strategy Generation → Version History

```
User requests marketing strategy (CMO chat or Strategy page)
  → assertAgentRunQuota checked
  → Strategy agent runs:
      → Loads workspace context + memory items
      → Optionally calls Brave Search (market research)
      → Optionally calls Firecrawl (competitor scraping)
      → Generates strategy document with:
          30-day objective, target audience, positioning,
          competitive analysis, channels, tactics, KPIs,
          content themes, budget allocation
  → Strategy saved as artifact (type: strategy)
  → Version history tracked (each generation = new version)
  → Approval required before strategy is "active"
  → Approved strategy → feeds CMO agent context on future requests
  → Memory updated: strategy decisions logged
```

---

## Workflow 8: Memory Learning Cycle

```
After any agent output is reviewed:
  → If APPROVED:
      → Memory item created:
          type: accepted_pattern / winning_hook / successful_template
          content: structured description
          applies_to: content type, audience, channel
          confidence: medium (starts medium, increases with evidence)
          source: artifact_id + approval_id
  → If REJECTED:
      → Memory item created:
          type: failed_pattern / rejected_hook / compliance_issue
          content: what was wrong
          applies_to: content type, audience, channel
          prevention: what to do differently
          source: artifact_id + approval_id
  → After campaign performance data arrives:
      → Memory item updated: add performance_evidence
      → Confidence level adjusted up/down
  → Memory is NEVER raw chat
  → Memory is ALWAYS structured, typed, labeled, reviewed
```

---

## Workflow 9: Human Sales Rep Notification Flow

```
When hot lead is ready for human handoff:
  → notification created (type: sales_handoff_ready)
  → In-app bell notification
  → [Future: email notification to sales rep's email]
  → Sales rep opens CRM → finds their assigned leads
  → Sales rep reviews handoff packet
  → Sales rep uses:
      → Pre-call briefing (generated)
      → Call script (generated, editable)
      → Suggested opening line
      → Objection responses
  → After call:
      → Sales rep logs outcome in CRM
      → Outcome → memory update:
          won: closed-won pattern saved
          lost: closed-lost pattern + reason saved
          follow-up: task created, date set
```

---

## Workflow 10: Analytics Aggregation

```
Cron: analytics-aggregation (every 6 hours)
  → For each workspace:
  → Count: content_published, leads_generated, engagement, reach
  → Upsert daily_stats record for yesterday
  → Calculate: funnel conversion rate, lead source breakdown
  → Update: workspace health score

Cron: lead-scoring (every hour)
  → Find contacts updated_at > last_scored_at
  → Re-score each with latest activity + engagement data
  → Update contact.lead_score
  → If score crosses hot threshold: trigger sales handoff workflow
```
