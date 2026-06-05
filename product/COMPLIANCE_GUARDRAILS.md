# COMPLIANCE_GUARDRAILS.md — Compliance & Safety Rules
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** These guardrails apply to every agent, every API route, and every outbound action.

---

## Why Compliance Matters Here

This product handles:
- Email marketing (CAN-SPAM, GDPR, CASL)
- Lead outreach (TCPA for SMS/calls)
- Advertising claims (FTC rules)
- AI-generated content with performance claims
- Personal data (GDPR/CCPA)
- Customer testimonials (FTC endorsement rules)
- Potential AI voice calls (TCPA, FCC)

**Violations can result in:** Fines up to $50,000 per violation (CAN-SPAM), $500–$1,500 per SMS (TCPA), significant GDPR penalties.

---

## Email Compliance Rules

### Required on Every Marketing Email
1. **Unsubscribe mechanism** — visible, one-click, functional
2. **Physical mailing address** — required by CAN-SPAM
3. **Clear sender identification** — from_name and from_email that identify the business
4. **No deceptive subject lines** — subject must reflect email content
5. **Opt-out processed within 10 business days** — CAN-SPAM requirement

### Contact Eligibility for Email
Before ANY email can be drafted or sent:

```
MANDATORY CHECKS (in order):
1. contact.do_not_contact = FALSE → BLOCK if true
2. contact.consent_status = 'opted_in' → BLOCK if opted_out
   Exception: transactional emails (order confirmation, password reset) can send to opted_out
3. contact.unsubscribed_at IS NULL → BLOCK if they unsubscribed
4. email_subscriber.status = 'subscribed' → BLOCK if unsubscribed/bounced
```

### Unsubscribe Handling
- Unsubscribe webhook from ESP must update:
  - `email_subscribers.status = 'unsubscribed'`
  - `contacts.consent_status = 'opted_out'`
  - `contacts.unsubscribed_at = NOW()`
- Never remove from database — mark as opted_out
- Can never email an opted_out contact (system must block)

---

## SMS/WhatsApp Compliance Rules

### Before Any SMS Draft
1. `contact.consent_status = 'opted_in'` AND `consent_channel` includes 'sms'
2. TCPA compliance: explicit prior written consent required for automated SMS
3. Must include opt-out instructions in every SMS
4. No SMS between 9pm–8am recipient's local time

**MVP Rule:** SMS sending is NOT implemented. SMS drafts only.

---

## AI Voice Call Compliance Rules

**MVP Rule:** AI autonomous voice calls are NOT implemented in MVP. Zero exceptions.

Why:
- TCPA requires prior express written consent for automated calls
- FCC rules on AI-generated voice
- Multiple state-level restrictions

What IS allowed in MVP:
- AI-generated call scripts (for human use)
- AI call summaries (after human call)
- AI pre-call briefing
- AI post-call follow-up drafts

**This feature may be added in V2 only after legal review for each target market.**

---

## Advertising Claims Compliance

### FTC Requirements
Before any ad copy or content with claims can be approved:

1. **Performance claims** — Must have substantiation (real data, real results)
   - "Our AI increases leads by 300%" → BLOCKED unless substantiated
   - "Clients see results in 30 days" → BLOCKED unless substantiated
2. **Testimonials and reviews** — Must comply with FTC endorsement guides
   - "As seen on [publication]" → Must be true
   - Customer quotes → Must be real, with permission
   - Typical results → Must reflect typical outcomes
3. **Competitor comparisons** — Must be accurate and fair
4. **"Free" offers** — Must disclose all conditions

### Compliance Review Agent Check for Ads
- [ ] Does this ad make a performance claim?
- [ ] Is there substantiation on file?
- [ ] Does this use a testimonial?
- [ ] Is the testimonial real and does it reflect typical results?
- [ ] Is this a comparison to a competitor?
- [ ] Are all comparisons accurate and can we prove them?

If ANY answer triggers a concern → approval is blocked with issues listed.

---

## Personal Data (GDPR/CCPA) Rules

### Data Minimization
- Only collect fields you actually use
- Do not store information that serves no product purpose

### Lead Data Provenance
Every contact record must have `lead_source` set:
- form / organic / ad_campaign / referral / manual_import / outreach

### Data Export (GDPR Right to Access)
- Workspace Settings → Data & Privacy → Export Data
- Exports all data for the logged-in user and their workspace

### Data Deletion (GDPR Right to Erasure)
- Contact deletion must:
  1. Delete contact record
  2. Anonymize (not delete) related activity for audit purposes
  3. Log deletion in audit trail with timestamp and user

### Data Retention
- Active contacts: retained while workspace active
- Deleted contacts: anonymized, audit logs kept for 7 years
- Session data: expires after 30 days
- Agent run logs: retained 90 days, then archived

---

## Audit Trail Requirements

Every high-risk action must create an audit log entry:

| Action | Logged Fields |
|--------|--------------|
| Email approved for sending | user_id, artifact_id, contact_list, timestamp |
| Contact deleted | user_id, contact_id (anonymized), timestamp |
| API key saved | user_id, workspace_id, key_name (not value), timestamp |
| Ad campaign approved | user_id, campaign_id, budget_amount, timestamp |
| Lead outreach approved | user_id, contact_id, outreach_type, timestamp |
| Integration connected | user_id, provider, scopes, timestamp |
| Integration disconnected | user_id, provider, timestamp |
| Workspace settings changed | user_id, fields_changed, timestamp |
| Super admin action | admin_id, action, affected_workspace_id, timestamp |

---

## What the Compliance Review Agent Checks (Checklist)

For every email, ad, or outreach before it enters approval:

```
1. CONTACT CHECK
   □ do_not_contact = false
   □ consent_status appropriate for channel
   □ Not unsubscribed

2. CONTENT CHECK
   □ No unsubstantiated performance claims
   □ No misleading subject lines
   □ Testimonials are real and disclosed
   □ Competitor comparisons are accurate

3. CHANNEL CHECK
   □ Email: unsubscribe mechanism present
   □ Email: sender clearly identified
   □ SMS: consent includes SMS channel
   □ AI Call: BLOCKED in MVP

4. COMPLIANCE HISTORY CHECK
   □ Has this type of claim been flagged before? (check memory)
   □ Are there workspace-specific prohibited claims?
```

**Output:**
- `passed: true` → content enters approval queue
- `passed: false` → content blocked, issues listed for user to fix

---

## Prohibited Claims List

Workspace owners must maintain a list of claims the AI must never make.
Stored in `workspaces.prohibited_claims`.

Examples of what goes here:
- "Guaranteed results"
- "Best in the world"
- Claims about competitor weaknesses not substantiated
- Medical/health claims (if not a health product)
- Any claim that needs regulatory approval
- Specific revenue figures not approved by legal

The CMO agent system prompt includes this list verbatim.

---

## Privacy Page & Consent Infrastructure

The product itself must have:
- Privacy Policy page at /privacy
- Terms of Service at /terms
- Cookie consent (when cookies used beyond session)
- Clear data collection disclosure in onboarding
