# PRD.md — Product Requirements Document
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Status:** Active  
**Last Updated:** 2026-06-06

---

## 1. Product Summary

Ooumph is an AI Marketing & Sales Agency Operating System. It is not a chatbot. It is not a content generator. It is a full marketing and sales operating system where:

- The **AI CMO** is the central interface — the user talks to one agent
- The **17 specialist agents** execute marketing, content, CRM, and sales tasks
- The **CRM** is the source of truth for all lead and customer data
- The **Approval Engine** is the safety layer — no outbound action goes live without human sign-off
- The **Memory System** learns from approved/rejected outputs, campaign performance, and sales outcomes
- The **Human Sales Team** closes deals — the AI prepares, qualifies, and hands off

---

## 2. Target Users

### Primary
- **Marketing agencies** managing multiple client accounts (5–50 client workspaces)
- **SMB marketing teams** who need a full marketing team's output without the headcount
- **Solo founders** who need strategy, content, CRM, and lead gen in one place

### Best Early Customer
A founder or agency already using LLM tools (ChatGPT, Claude, Jasper) but struggling with:
- Outputs that don't align with their brand
- No CRM connection to marketing activity
- No approval workflow before publishing
- No memory of what worked before

---

## 3. Core Value Proposition

> Run your entire marketing and sales operation through one AI CMO that coordinates specialist agents, CRM, campaigns, lead nurturing, meeting booking, and human sales team handoff.

**What the user gets:**
- Strategy director → AI CMO
- Content writers → Content Supervisor + Blog/Social/Email agents
- Social media manager → Publishing Hub
- Email marketer → Email Marketing module
- CRM manager → Full CRM with RFM segmentation
- Ads manager → Paid Ads module with Meta + Google
- Brand monitor → Brand Snapshot agent
- Analytics team → Analytics + Report Builder

---

## 4. MVP Definition

The MVP proves one question:

> Can a central AI CMO coordinate strategy, CRM, lead nurturing, human approval, and sales handoff using structured memory and workflows?

### MVP Must Include (Real, not fake)
- [ ] Auth — signup, login, session management
- [ ] Workspace — multi-tenant isolation, workspace settings
- [ ] AI CMO Chat — streaming, proposal cards, team deployment
- [ ] Brand Profile — voice, ICP, offers, competitors, prohibited claims
- [ ] CRM — contacts, leads, pipeline stages, consent fields, do-not-contact flag
- [ ] Lead Scoring v1 — rule-based + AI scoring
- [ ] Approval Inbox — all AI output requires human sign-off before execution
- [ ] Task Board — agent tasks and human tasks tracked together
- [ ] Content/Campaign Planner — AI-generated, approval-gated
- [ ] Email Draft Generator — drafts only, approval required before sending
- [ ] Sales Outreach Draft Generator — drafts only, no autonomous sending
- [ ] Sales Handoff Packet — full lead context for human sales reps
- [ ] Meeting Booking Message Draft — human must send, AI drafts only
- [ ] Human Sales Task Creation — creates follow-up tasks for sales team
- [ ] Basic Memory System — structured, labeled, reviewed (not raw chat)
- [ ] Research Tool — with source citations
- [ ] Basic Analytics — funnel metrics, agent performance
- [ ] Agent Run Audit Log — every agent action logged

### MVP Must NOT Include Yet
- Autonomous AI voice calling
- Automatic cold email sending
- Automatic ad launch or spend
- Real-time social publishing (drafts only)
- Full visual workflow builder
- Landing page builder
- Template marketplace
- Custom model training
- Multi-device draft sync

---

## 5. What Must Be Real From Day One

These cannot be fake or simulated:

1. **Workspace/tenant data model** — every row workspace-scoped
2. **CRM contacts and leads** — real DB records, not demo arrays
3. **Lead source tracking** — where every lead came from
4. **Consent and do-not-contact fields** — on every contact record
5. **Approval system** — every AI output enters approval queue before execution
6. **Task board** — tracks both AI agent tasks and human follow-up tasks
7. **Memory item structure** — typed, labeled, reviewed entries
8. **Agent run logs** — every agent run recorded with cost and status
9. **Human sales handoff packet** — generated from real CRM data
10. **Audit logs for outbound actions** — who approved what and when

---

## 6. What Can Be Simulated in MVP

These are acceptable to mock in MVP:

- Ad platform execution (create draft plans, not live ad accounts)
- Full social publishing (show queue, require manual publish)
- Email sending (generate HTML, require user to copy or connect ESP)
- Calendar booking (draft message, user books manually)
- AI voice calls (NOT in MVP at all)
- Landing page publishing (generate copy, no hosting)

**Rule:** Fake means "creates drafts, plans, previews, mock outputs, and manual exports — but does not pretend live execution exists."

---

## 7. User Roles

| Role | Access |
|------|--------|
| Owner | Full access including billing, team management, workspace deletion |
| Admin | All features except billing |
| Manager | Create/edit/approve content, view analytics |
| Analyst | View-only analytics and reports |
| Viewer | Read-only dashboard access |
| Super Admin | Platform-wide: all workspaces, billing, audit logs |

---

## 8. Non-Functional Requirements

- **Multi-tenancy:** Every DB query must include `workspace_id` scope. IDOR prevention on all routes.
- **Security:** AES-256-GCM encrypted API key storage. HMAC-SHA256 session cookies. Rate limiting on auth routes.
- **Performance:** CMO response streaming must begin within 2 seconds. Dashboard initial load under 3 seconds.
- **Reliability:** No agent action is considered complete until DB record confirms. No "LLM said it's done" acceptance.
- **Compliance:** Unsubscribe field on every contact. Consent status tracked. Approval log for all outbound.

---

## 9. Success Metrics for MVP

| Metric | Target |
|--------|--------|
| User can complete onboarding | < 5 minutes |
| AI CMO generates strategy | Without hallucinating fake data |
| Lead enters CRM and gets scored | < 30 seconds |
| Approval workflow works end-to-end | Artifact → Queue → Approve → Published |
| Sales handoff packet is useful | Human sales rep confirms it has real context |
| Memory stores structured items | Not raw chat logs |
| Zero autonomous outbound actions | Nothing sends without approval |
