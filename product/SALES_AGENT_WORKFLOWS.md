# SALES_AGENT_WORKFLOWS.md — Sales Agent System Design
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Status:** NOT YET BUILT — This is the most critical missing module

---

## Overview

The Sales Agent system is the layer that connects marketing activity to real revenue. It qualifies leads, nurtures them, prepares call briefs, books meetings, and hands off hot prospects to human sales reps with full context.

**Core principle:** The AI prepares, qualifies, and hands off. The human closes.

---

## Sales Agent Roster

### Agent 1: Lead Research Agent
**Slug:** `lead-research`  
**Purpose:** Research the lead, their company, industry, pain points, and personalization angles BEFORE any outreach

**Inputs:**
- contact_id (reads from CRM)
- company name
- industry
- job title
- website URL (if available)

**Process:**
1. Search web for company info (Brave Search API)
2. Search for person's LinkedIn/professional info
3. Identify industry pain points
4. Find recent company news or triggers (funding, hiring, product launch)
5. Match against workspace ICP

**Outputs (stored in contact record + sales_handoffs):**
- `lead_summary` — 2-3 sentence overview of the lead
- `company_summary` — company context
- `pain_points[]` — likely pain points based on role + industry
- `personalization_notes` — specific hooks for outreach
- `risk_flags[]` — reasons to be cautious
- `recommended_outreach_angle` — recommended approach

**Approval required:** No (internal research)

---

### Agent 2: Lead Qualification Agent
**Slug:** `lead-qualifier`  
**Purpose:** Determine if this lead matches the ICP and what to do next

**Inputs:**
- contact record (all fields)
- workspace ICP definition
- lead research output
- engagement data (emails opened, pages visited, form answers)

**Scoring:**
- `fit_score` (0–100): How well does this lead match ICP?
  - Industry match: +30
  - Company size match: +20
  - Job title/seniority match: +25
  - Budget signals: +25
- `intent_score` (0–100): How ready to buy?
  - Visited pricing page: +40
  - Opened 3+ emails: +20
  - Downloaded lead magnet: +20
  - Responded to outreach: +20
- `lead_score` = (fit_score * 0.4) + (intent_score * 0.6)

**Output:**
- `qualification_status`: qualified / not_qualified / needs_more_info
- `lead_score`, `fit_score`, `intent_score`
- `recommended_next_step`: outreach / nurture / disqualify / immediate_handoff

**Approval required:** No (internal scoring)

---

### Agent 3: Sales Outreach Agent
**Slug:** `outreach`  
**Purpose:** Draft personalized outreach sequences

**Inputs:**
- Lead research output
- Workspace brand voice, offer, ICP
- Memory: past outreach patterns (winning + failed)

**Channels (draft only — human sends or approves):**
- Email (primary)
- LinkedIn message task
- SMS task (where consent exists)

**Output (DRAFT ONLY — approval required before sending):**
- Subject line (email)
- Email body (personalized, pain-point focused)
- LinkedIn message variant
- Sequence: Day 1, Day 4, Day 8, Day 14 follow-ups

**Compliance check runs BEFORE approval:**
- do_not_contact = false?
- consent_status appropriate?
- No unsubstantiated claims?

**Approval type:** `sales_outreach` — HIGH RISK — always requires human approval

---

### Agent 4: Meeting Booking Agent
**Slug:** `meeting-booker`  
**Purpose:** Book qualified leads with the human sales team

**Inputs:**
- Qualified lead context
- Workspace calendar availability (future: Cal.com integration)
- Meeting booking message templates from memory

**Process:**
1. Draft meeting booking message (personalized to lead)
2. Suggest 2–3 time slots
3. Create approval request
4. WAIT FOR HUMAN APPROVAL
5. Human sends booking message manually (MVP)
6. [Future V1]: Send via Cal.com integration after approval

**Outputs:**
- `meeting_booking_draft` — personalized booking message
- `suggested_times[]` — 2–3 time slot suggestions
- Approval record (type: `meeting_booking`)

**After booking confirmed:**
- Update CRM stage: qualified → proposal
- Create pre-call briefing
- Notify assigned sales rep
- Attach call script

---

### Agent 5: Sales Handoff Agent
**Slug:** `sales-handoff`  
**Purpose:** Prepare a complete context packet for human sales reps

**Triggers:**
- lead_score >= 75 (hot lead threshold)
- Manual trigger by workspace owner
- Qualification agent recommends immediate_handoff

**Handoff Packet Contents:**

```
LEAD PROFILE
- Name, company, title, industry
- Contact info, LinkedIn

LEAD INTELLIGENCE
- Company overview
- Pain points identified
- Recent triggers (news, funding, hiring)
- Personalization angles

ENGAGEMENT HISTORY
- Lead source + date
- Emails sent/opened/clicked
- Pages visited
- Content downloaded
- Form answers
- Previous outreach attempts

QUALIFICATION DATA
- Lead score, fit score, intent score
- Qualification status

SALES STRATEGY
- Recommended opening line
- 3 suggested discovery questions
- Key pain point to address first
- Objections to anticipate
- Recommended offer/package
- Pricing context

MEETING PREP
- Pre-call briefing (2-minute read)
- Call script (full)
- Objection responses

RISK FLAGS
- Any concerns about this lead
- Compliance notes

CRM TIMELINE
- All activities in chronological order
```

**Approval type:** `sales_handoff` — Medium risk — requires workspace owner/admin approval

---

### Agent 6: Objection Handling Agent
**Slug:** `objection-handler`  
**Purpose:** Collect objections encountered and suggest responses

**Triggered by:** Sales rep logs objection in CRM

**Input:** Objection text, lead context, deal stage

**Output:**
- Suggested response (2–3 options)
- Counter-argument approach
- When to escalate vs. let go

**Memory update:** Every objection + outcome → memory (sales_pattern type)

---

### Agent 7: Sales Manager Agent
**Slug:** `sales-manager`  
**Purpose:** Monitor pipeline health, flag issues, suggest actions

**Runs:** On-demand or daily cron

**Output:**
- Stale deals (no activity in 7+ days)
- Hot leads not yet assigned
- Missed follow-up tasks
- Revenue forecast (pipeline value × probability)
- Pipeline bottlenecks
- Campaign-to-sales conversion rates

---

## Sales Stage Flow

```
New Lead Captured
  ↓
Lead Research (auto — no approval)
  ↓
Lead Qualification (auto — no approval)
  ↓
If score < 40: → Cold pool → Re-score in 7 days
If score 40–74: → Nurture sequence (APPROVAL required)
If score >= 75: → Sales Handoff (APPROVAL required)
  ↓
Human Approves Handoff
  ↓
Sales Rep Notified
  ↓
Meeting Booking Message Drafted (APPROVAL required)
  ↓
Human Sends Booking Message
  ↓
Call Scheduled → CRM updated
  ↓
Pre-Call Briefing Generated (auto)
  ↓
Call Happens (HUMAN)
  ↓
Outcome Logged in CRM
  ↓
Won: memory updated (closed-won pattern)
Lost: memory updated (closed-lost pattern + reason)
Follow-up: task created, re-enter at appropriate stage
```

---

## Human Sales Team Rules

1. Humans close deals — AI never claims to close
2. AI never sends messages autonomously — only drafts
3. AI never books meetings without approval
4. AI never accesses email inbox or sends from user's account
5. Sales rep is always notified before AI takes any action involving their leads
6. Sales rep can reject any handoff, draft, or booking message
7. All sales rep feedback is stored as memory

---

## Tables Required (Currently Missing)

```sql
CREATE TABLE sales_handoffs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id),
  contact_id TEXT REFERENCES contacts(id),
  assigned_rep TEXT DEFAULT '',
  handoff_packet JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  meeting_booking_draft TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE objection_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id),
  contact_id TEXT REFERENCES contacts(id),
  objection TEXT NOT NULL,
  suggested_response TEXT DEFAULT '',
  outcome TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
