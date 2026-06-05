# APPROVAL_RULES.md — Human-in-the-Loop Approval Rules
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Core Principle:** No AI-generated action that affects external parties goes live without explicit human approval.

---

## Risk Classification

### HIGH RISK — Requires Explicit Human Approval (ALWAYS)

These actions can NEVER be auto-approved, regardless of any setting:

| Action | Why |
|--------|-----|
| Sending cold emails to leads | Legal risk (CAN-SPAM, GDPR), reputation risk |
| Launching ad campaigns | Budget spend, brand reputation |
| Spending ad budget | Financial risk |
| Publishing content with factual claims | Accuracy, legal liability |
| Publishing content with performance claims | FTC compliance |
| Using customer testimonials | FTC endorsement rules |
| Contacting leads via email | GDPR consent, CAN-SPAM |
| Sending SMS/WhatsApp to leads | TCPA compliance |
| AI voice calls to leads | TCPA, FCC regulations |
| Sending calendar invites | Calendar spam risk |
| Changing live landing page copy | A/B test integrity |
| Changing brand assets | Brand consistency |
| Connecting/disconnecting integrations | Security risk |
| Modifying CRM pipeline rules | Data integrity |
| Deleting leads or campaign data | Irreversible |

### MEDIUM RISK — Requires Approval (Configurable)

Default: approval required. Workspace owner can enable auto-approval with timer.

| Action | Default | Configurable? |
|--------|---------|---------------|
| Sending warm follow-up emails | Approval required | Yes — allow after 24h timer if no action |
| Publishing low-risk social posts | Approval required | Yes — allow after 2h timer if no action |
| Updating CRM lead stage | Approval required | Yes — allow for stage advances only |
| Creating sales tasks | Approval required | Yes — auto-create for assigned reps |
| Adding lead to nurture sequence | Approval required | Yes |
| Sending internal reports | Auto | N/A |

### LOW RISK — Auto-Approved (No human needed)

| Action | Notes |
|--------|-------|
| Generating draft content (internal) | Never sent without review |
| Research summaries (internal) | Internal only |
| Campaign planning documents | Internal strategy |
| Content ideation | Internal |
| Lead scoring recommendations | Suggestions only |
| CRM note generation | Internal |
| Call script drafting | For human rep review |
| Performance analysis | Internal |
| Strategy documents (first draft) | Must be explicitly approved to become "active" |

---

## Approval Types in System

Every approval record has a type. Here are all valid types:

| Type | Description | Risk Level |
|------|-------------|------------|
| `strategy` | Full marketing strategy document | Medium |
| `content_calendar` | Weekly/monthly content plan | Medium |
| `carousel` | Multi-slide social carousel | Medium |
| `reel_script` | Short-form video script | Medium |
| `ad_copy` | Paid advertisement copy | High |
| `email_draft` | Email campaign with claims | High |
| `email_warm_followup` | Warm follow-up to existing lead | Medium |
| `linkedin_post` | LinkedIn content | Medium |
| `social_post` | Instagram/Twitter/TikTok content | Medium |
| `funnel_plan` | Conversion funnel blueprint | Low |
| `lead_gen_plan` | Lead generation strategy | Low |
| `video_brief` | Video production brief | Low |
| `landing_page` | Landing page copy | Medium |
| `thumbnail` | Video thumbnail design | Low |
| `sales_outreach` | Cold/warm outreach email draft | High |
| `nurture_sequence` | Email nurture series | High |
| `sales_handoff` | Hot lead handoff to human rep | Medium |
| `meeting_booking` | Booking message draft | Medium |
| `ad_campaign_launch` | Launching a live ad campaign | High |
| `budget_spend` | Approving ad budget | High |
| `compliance_review` | Content with claims/testimonials | High |

---

## Approval Workflow Rules

### Rule 1: No Skipping
An approval may not be bypassed by any agent, automation, or API call.
The `assertArtifactApproved()` guard must be called before any content is published.

### Rule 2: Compliance Before Approval
For email campaigns:
1. Compliance check runs BEFORE approval is created
2. If compliance check fails → approval is blocked with issues listed
3. User must fix issues before approval is possible

### Rule 3: Do-Not-Contact Check
Before any outreach draft is generated:
1. Check `contact.do_not_contact = FALSE`
2. Check `contact.consent_status` is appropriate for the channel
3. If either fails → block generation, show error to user

### Rule 4: Approval Audit Trail
Every approval action creates an audit record:
- who approved (user_id)
- when approved (approved_at timestamp)
- what was the artifact (artifact_id)
- what notes were added
- whether compliance was checked

### Rule 5: Rejection Memory
When an artifact is rejected:
- The rejection reason (notes) is saved
- A memory item is created: type = `failed_pattern`
- Future generations of the same type reference this memory

### Rule 6: Approval Expiry (Future)
For time-sensitive approvals:
- Content approved for a specific date/time expires if not published within 48 hours
- Expired approvals return to `pending` status and require re-approval

---

## Compliance Review Agent Checklist

Before any email or outreach content can enter the approval queue, the Compliance Review Agent checks:

- [ ] Does this email include an unsubscribe link or mechanism?
- [ ] Is this contact allowed to be contacted? (do_not_contact = false)
- [ ] Is there appropriate consent for this channel? (consent_status = opted_in)
- [ ] Does this content make factual performance claims? (if yes: requires substantiation)
- [ ] Does this content use testimonials or reviews? (if yes: requires disclosure)
- [ ] Does this content mention competitor products? (if yes: requires accuracy check)
- [ ] Is this an AI voice call action? (if yes: BLOCKED in MVP)
- [ ] Is this a cold outreach? (if yes: requires explicit HIGH RISK approval)

If any check fails → `compliance_check.passed = false` → approval blocked → issues listed for user to fix.

---

## Auto-Approval Timer Rules (Configurable by workspace owner)

If workspace owner enables auto-approval for medium-risk items:

```
warm_followup_email:
  auto_approve_after: 24 hours
  condition: no user action taken
  notification: "Your warm follow-up will send in 24h — review now to cancel"

low_risk_social_post:
  auto_approve_after: 2 hours
  condition: no user action taken
  notification: "Your social post will publish in 2h — review now to cancel"
```

**Rule:** Auto-approval is NEVER available for HIGH RISK items regardless of this setting.

---

## What Happens When Approval is Granted

| Type | After Approval |
|------|----------------|
| Content with publishDestination | Creates scheduled_content record |
| Email campaign | Updates email_campaigns.status = 'approved' |
| Sales outreach | Creates outreach task for sales rep |
| Sales handoff | Notifies assigned sales rep, updates deal stage |
| Strategy | Becomes "active" strategy, feeds CMO agent context |
| Ad campaign | Creates ad_campaigns record (still requires manual launch) |
