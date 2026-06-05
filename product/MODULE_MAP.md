# MODULE_MAP.md — Product Module Breakdown
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** No implementation task can start unless it belongs to a defined module.

---

## Module 01: Auth
**Purpose:** User signup, login, session management, password management  
**Owner Agent:** Security Agent  
**Status:** ✅ Built (Sprint 1)

| Item | Detail |
|------|--------|
| Screens | /login, /signup |
| Tables | users, sessions, login_events |
| API Endpoints | POST /api/auth/signup, /login, /logout, GET /api/auth/me |
| Permissions | Public (no auth required) |
| Events Emitted | user.created, session.created, login.failed |
| Test Strategy | bcrypt verification, HMAC session validation, brute-force rate limiting |

---

## Module 02: Workspace
**Purpose:** Multi-tenant isolation, workspace configuration, team management  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 1)

| Item | Detail |
|------|--------|
| Screens | /dashboard/settings (Workspace, Team sections), /dashboard/onboarding |
| Tables | workspaces, workspace_secrets, workspace_projects |
| API Endpoints | GET/POST/PATCH /api/workspaces, POST /api/workspaces/invite |
| Permissions | Owner, Admin |
| Events Emitted | workspace.created, workspace.updated |
| Test Strategy | workspace_id scoping on ALL queries, IDOR prevention tests |

**Critical Rule:** Every single table that stores workspace data MUST have `workspace_id` as a foreign key. `assertWorkspaceOwnership()` must be called on every API route that accepts `workspaceId`.

---

## Module 03: AI Agent Registry
**Purpose:** 17-agent management, status, quota, cost tracking  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 2)

| Item | Detail |
|------|--------|
| Screens | /dashboard/agents |
| Tables | agents, agent_runs |
| API Endpoints | GET /api/agents/registry, PATCH /api/agents/[id], GET /api/agent-runs |
| Permissions | Owner, Admin, Manager (read), Manager (pause/resume) |
| Events Emitted | agent.started, agent.completed, agent.failed |
| Agents | cmo, content-sup, growth-sup, engagement-sup, intelligence-sup, brand-sup, blog, social-agent, email, ads, seo, lead-scorer, outreach, crm, brand-monitor, reputation, analytics |

---

## Module 04: CMO Chat Interface
**Purpose:** Central AI interface — user talks to CMO, CMO coordinates agents  
**Owner Agent:** Frontend Agent + Backend Agent  
**Status:** ✅ Built (Sprint 1–3) — Needs compliance review

| Item | Detail |
|------|--------|
| Screens | /dashboard (main) |
| Tables | agent_runs, artifacts, approvals, workspace_projects |
| API Endpoints | POST /api/agents/cmo (SSE), GET /api/stats, GET /api/agent-runs |
| Permissions | Owner, Admin, Manager |
| Events Emitted | token, agent_start, agent_done, artifact_created, approval_pending, done |
| Test Strategy | SSE stream test, proposal detection test, artifact creation test |

**Known Issue:** Messages stored in localStorage (raw). Needs migration to structured memory items.

---

## Module 05: Approval Engine
**Purpose:** Human-in-the-loop gate for ALL AI-generated outputs  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 2) — Needs sales approval types added

| Item | Detail |
|------|--------|
| Screens | /dashboard/approvals |
| Tables | approvals, artifacts |
| API Endpoints | GET/POST/PATCH /api/approvals |
| Permissions | Owner, Admin, Manager |
| Events Emitted | approval.created, approval.approved, approval.rejected |
| Approval Types | strategy, content_calendar, carousel, reel_script, ad_copy, email_draft, linkedin_post, funnel_plan, lead_gen_plan, video_brief, landing_page, thumbnail, visual_post, story, ad, sales_outreach, nurture_sequence, sales_handoff, meeting_booking |
| Test Strategy | Unauthorized user cannot approve, approval creates scheduled_content when publishDestination set |

---

## Module 06: CRM
**Purpose:** Contact, lead, deal, pipeline, activity management with consent tracking  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 3) — Missing consent fields and do-not-contact flag

| Item | Detail |
|------|--------|
| Screens | /dashboard/leads-crm (5 tabs) |
| Tables | contacts, deals, lead_activities, segments, leads_captured |
| API Endpoints | CRUD /api/crm, /api/sales-deals, /api/lead-activities, /api/segments, /api/leads-captured |
| Permissions | Owner, Admin, Manager (full CRUD), Analyst (read), Viewer (read) |
| Events Emitted | contact.created, deal.stage_changed, lead.scored |
| Missing | consent_status field, do_not_contact flag, unsubscribe tracking |

**CRITICAL MISSING:** contacts table needs:
- `consent_status` ENUM ('opted_in', 'opted_out', 'not_set')
- `do_not_contact` BOOLEAN DEFAULT FALSE
- `consent_channel` TEXT (email, sms, phone)
- `consent_date` TIMESTAMPTZ
- `unsubscribed_at` TIMESTAMPTZ
- `lead_source` TEXT
- `rfm_tier` TEXT

---

## Module 07: Sales Agent System
**Purpose:** AI-powered sales development and lead nurturing with human handoff  
**Owner Agent:** Backend Agent  
**Status:** ❌ NOT BUILT — Critical missing module

| Item | Detail |
|------|--------|
| Screens | /dashboard/leads-crm (sales tab needed), /dashboard/sales-handoff (NEW) |
| Tables | sales_handoffs, sales_tasks, objection_log (ALL MISSING) |
| API Endpoints | POST /api/sales/qualify, /api/sales/research, /api/sales/handoff, /api/sales/outreach-draft |
| Agents Needed | lead-scorer, lead-research (NEW), lead-qualifier (NEW), sales-handoff (NEW), objection-handler (NEW), meeting-booker (NEW) |
| Events Emitted | lead.qualified, lead.handed_off, meeting.booking_drafted |

**Sales Agent Roles to Build:**
1. Lead Research Agent — company/industry research, pain points, personalization
2. Lead Qualification Agent — ICP match, fit score, intent score, next step
3. Sales Outreach Agent — draft personalized email/LinkedIn sequences
4. Meeting Booking Agent — suggest times, draft booking message, update CRM
5. Sales Handoff Agent — full context packet for human sales rep
6. Objection Handling Agent — collect objections, suggest responses
7. Sales Manager Agent — pipeline health, missed follow-ups, revenue forecast

---

## Module 08: Email Marketing
**Purpose:** List management, subscriber management, campaign performance  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 3) — Missing compliance fields

| Item | Detail |
|------|--------|
| Screens | /dashboard/email-marketing |
| Tables | email_lists, email_subscribers, email_campaigns |
| API Endpoints | CRUD /api/email-lists, /api/email-subscribers, /api/email-campaigns |
| Missing | Unsubscribe webhook handler, bounce handling, compliance check before send |

---

## Module 09: Publishing Hub
**Purpose:** Multi-channel content scheduler for 6 social platforms  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 2) — Publishing requires connected OAuth

| Item | Detail |
|------|--------|
| Screens | /dashboard/publishing |
| Tables | scheduled_content |
| API Endpoints | CRUD /api/scheduled-content, POST /api/publishing/publish |
| Platforms | Instagram, Facebook, Twitter/X, LinkedIn, TikTok, YouTube |

---

## Module 10: Analytics & Reporting
**Purpose:** KPI dashboards, report builder, agent performance  
**Owner Agent:** Analytics Agent  
**Status:** ✅ Built (Sprint 4) — Data only populated when integrations connected

| Item | Detail |
|------|--------|
| Screens | /dashboard/analytics |
| Tables | daily_stats |
| API Endpoints | GET /api/stats, /api/analytics/reports, /api/analytics/recommendations |

---

## Module 11: Memory System
**Purpose:** Structured, labeled, reviewed learning — NOT raw chat storage  
**Owner Agent:** Memory Agent  
**Status:** ❌ PARTIALLY BUILT — Raw localStorage used, no structured memory table

| Item | Detail |
|------|--------|
| Screens | /dashboard/memory |
| Tables | memory_items (EXISTS but not used for structured learning) |
| Missing | Memory write on approval/rejection, memory retrieval in agent prompts |

**Memory Types Required:**
- `winning_hook` — content pattern with evidence
- `failed_pattern` — what to avoid and why
- `brand_rule` — brand voice / tone guidelines
- `sales_pattern` — closed-won/closed-lost patterns
- `audience_insight` — ICP behaviors that worked
- `compliance_note` — regulatory issues encountered
- `performance_benchmark` — baseline metrics for comparison

---

## Module 12: Compliance & Safety
**Purpose:** Consent, unsubscribe, claim review, audit trail for all outbound  
**Owner Agent:** Security Agent  
**Status:** ❌ NOT BUILT — Critical gap

| Item | Detail |
|------|--------|
| Screens | Embedded in approval flow, CRM contact view |
| Tables | compliance_checks (MISSING), consent_events (MISSING) |
| API Endpoints | POST /api/compliance/check (MISSING) |
| Missing | Compliance Review Agent, consent field on contacts, unsubscribe handler |

---

## Module 13: Brand Intelligence
**Purpose:** Brand monitoring, competitor tracking, market research  
**Owner Agent:** Intelligence Supervisor  
**Status:** ✅ Built (Sprint 3)

| Item | Detail |
|------|--------|
| Screens | /dashboard/brand-monitor, /dashboard/memory, /dashboard/research |
| Tables | agent_runs (stores brand scan results) |

---

## Module 14: Creative Generation
**Purpose:** AI image, video, voiceover generation  
**Owner Agent:** Content Supervisor  
**Status:** ✅ Built (Sprint 4)

| Item | Detail |
|------|--------|
| Screens | /dashboard/creative-studio, /dashboard/image-gen, /dashboard/video-gen, /dashboard/voiceover |
| Tables | creative_generation_jobs |

---

## Module 15: Automation & Workflows
**Purpose:** No-code trigger-action automation builder  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 3)

| Item | Detail |
|------|--------|
| Screens | /dashboard/workflows |
| Tables | workflows |
| API Endpoints | CRUD /api/workflows, POST /api/workflows/trigger |

---

## Module 16: Billing & Subscription
**Purpose:** Plan management, usage metering, Stripe integration  
**Owner Agent:** Backend Agent  
**Status:** ✅ UI Built — Stripe webhooks need testing

| Item | Detail |
|------|--------|
| Screens | /dashboard/billing |
| Tables | workspaces.plan_tier |
| API Endpoints | Stripe webhooks at /api/webhooks/stripe |

---

## Module 17: Admin Portal
**Purpose:** Super-admin management of all workspaces and users  
**Owner Agent:** Backend Agent  
**Status:** ✅ Built (Sprint 4)

| Item | Detail |
|------|--------|
| Screens | /dashboard/super-admin |
| API Endpoints | /api/admin/* (all require assertSuperAdmin) |
