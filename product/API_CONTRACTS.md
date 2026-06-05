# API_CONTRACTS.md — API Endpoint Contracts
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** No API endpoint may be implemented that is not listed in this document.  
**Rule:** Frontend may not call endpoints not registered here.  
**Rule:** Any new endpoint must be added here BEFORE implementation begins.

---

## Authentication

All routes except `/api/auth/*`, `/api/form-submissions`, and `/api/cron/*` require:
- Valid `ooumph-session` cookie (HMAC-SHA256 signed)
- Workspace routes additionally require `assertWorkspaceOwnership(req, workspaceId)`

---

## AUTH ROUTES

### POST /api/auth/signup
**Auth:** None  
**Body:** `{ email: string, password: string, fullName: string }`  
**Response:** `{ user: User, workspaceId: string }`  
**Side effects:** Creates user, creates workspace "My Workspace", seeds 17 agents, creates session cookie  
**Errors:** 400 (invalid input), 409 (email exists)

### POST /api/auth/login
**Auth:** None  
**Body:** `{ email: string, password: string }`  
**Response:** `{ user: User, workspaceId: string }`  
**Side effects:** Creates session, logs to login_events  
**Errors:** 400 (invalid), 401 (wrong password), 429 (rate limited)

### POST /api/auth/logout
**Auth:** Required  
**Response:** `{ ok: true }`  
**Side effects:** Deletes session from DB, clears cookie

### GET /api/auth/me
**Auth:** Required  
**Response:** `{ user: User }` or 401

---

## WORKSPACE ROUTES

### GET /api/workspaces?id={workspaceId}
**Auth:** Required + workspace owner  
**Response:** Workspace object with `secrets: { anthropic: bool, openai: bool, ... }` — NO actual key values  
**Rule:** model_settings must have API key fields stripped before returning

### POST /api/workspaces
**Auth:** Required  
**Body:** `{ name: string }`  
**Response:** `{ workspace: Workspace }`  
**Side effects:** Creates workspace, seeds 17 agents

### PATCH /api/workspaces
**Auth:** Required + workspace owner  
**Body:** `{ id: string, ...workspaceFields }`  
**Response:** `{ workspace: Workspace }`  
**Side effects:** If model_settings contains API keys, calls extractAndStoreModelKeys() first  
**Rule:** Never save raw API keys to workspaces table

---

## AGENT ROUTES

### GET /api/agents/registry?workspaceId={id}
**Auth:** Required + workspace owner  
**Response:** `{ agents: Agent[] }` with status, quota, today's run count

### PATCH /api/agents/[agentId]
**Auth:** Required + workspace owner  
**Body:** `{ status?: string, daily_quota?: number, cost_cap_per_run?: number }`  
**Response:** `{ agent: Agent }`

### GET /api/agent-runs?workspaceId={id}&limit={n}
**Auth:** Required + workspace owner  
**Response:** `{ runs: AgentRun[] }` ordered by created_at DESC

### POST /api/agents/cmo — SSE STREAM
**Auth:** Required + workspace owner + quota check  
**Body:** `{ workspaceId: string, message: string, action?: string, firstAction?: string }`  
**Response:** `Content-Type: text/event-stream` — ReadableStream of SSE events  
**Events:** token, agent_start, agent_done, artifact_created, approval_pending, done, error  
**Side effects:** Creates agent_run, creates artifact if proposal detected, creates approval

### POST /api/agents/strategy — SSE STREAM
**Auth:** Required + workspace owner + quota check  
**Body:** `{ workspaceId: string, message: string, includeResearch?: boolean }`  
**Response:** SSE stream  
**Side effects:** Creates artifact (type: strategy), creates approval

### POST /api/agents/blog — SSE STREAM
**Auth:** Required + workspace owner + quota check  
**Body:** `{ workspaceId: string, prompt: string, title?: string }`  
**Response:** SSE stream  
**Side effects:** Creates artifact (type: blog_post), creates approval

### POST /api/agents/social — SSE STREAM
**Auth:** Required + workspace owner + quota check  
**Body:** `{ workspaceId: string, prompt: string, platforms: string[] }`  
**Response:** SSE stream  
**Side effects:** Creates artifact (type: social_post), creates approval

---

## ARTIFACT & APPROVAL ROUTES

### GET /api/artifacts?workspaceId={id}&type={optional}&status={optional}
**Auth:** Required + workspace owner  
**Response:** `{ artifacts: Artifact[] }`

### POST /api/artifacts
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, type: string, title: string, content_json: object }`  
**Response:** `{ artifact: Artifact }`

### PATCH /api/artifacts
**Auth:** Required + workspace owner  
**Body:** `{ id: string, status?: string, content_json?: object }`  
**Response:** `{ artifact: Artifact }`

### GET /api/approvals?workspaceId={id}&status={optional}
**Auth:** Required + workspace owner  
**Response:** `{ approvals: Approval[] }` with artifact content

### POST /api/approvals
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, artifact_id: string, artifact_type: string, artifact_title: string, content_json: object }`  
**Response:** `{ approval: Approval }`  
**Side effects:** Creates notification

### PATCH /api/approvals
**Auth:** Required + workspace owner  
**Body:** `{ id: string, status: 'approved'|'rejected', notes?: string, publishDestination?: string }`  
**Response:** `{ approval: Approval }`  
**Side effects:** If approved + publishDestination: creates scheduled_content. Updates artifact.status. Creates notification.  
**Compliance Rule:** If artifact_type requires compliance check, must pass compliance_check first

---

## CRM ROUTES

### GET /api/crm?workspaceId={id}&stage={optional}&search={optional}
**Auth:** Required + workspace owner  
**Response:** `{ contacts: Contact[] }`

### POST /api/crm
**Auth:** Required + workspace owner  
**Body:** Contact fields  
**Response:** `{ contact: Contact }`  
**Validation:** email required if contacting lead; consent_status required for outbound

### PATCH /api/crm
**Auth:** Required + workspace owner  
**Body:** `{ id: string, ...contactFields }`  
**Response:** `{ contact: Contact }`

### DELETE /api/crm?id={id}
**Auth:** Required + workspace owner  
**Response:** `{ ok: true }`  
**Compliance Rule:** Must log deletion in audit trail

### GET /api/sales-deals?workspaceId={id}
### POST /api/sales-deals
### PATCH /api/sales-deals

### GET /api/lead-activities?workspaceId={id}&contactId={optional}
### POST /api/lead-activities

### GET/POST /api/segments
### GET/POST /api/leads-captured

### POST /api/form-submissions — PUBLIC (no auth)
**Auth:** None  
**Body:** `{ workspaceId: string, funnel_id?: string, data: object }`  
**Response:** `{ ok: true }`  
**Side effects:** Creates form_submission, creates/upserts contact, creates notification  
**Compliance Rule:** Records consent from form field if present

---

## SALES AGENT ROUTES (TO BUILD)

### POST /api/sales/qualify
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, contactId: string }`  
**Response:** `{ qualification_status: string, lead_score: number, fit_score: number, intent_score: number, recommended_next_step: string }`

### POST /api/sales/research
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, contactId: string }`  
**Response:** `{ lead_summary: string, company_summary: string, pain_points: string[], personalization_notes: string, risk_flags: string[], recommended_outreach_angle: string }`

### POST /api/sales/handoff
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, contactId: string, assigned_rep?: string }`  
**Response:** `{ handoff_packet: object, approval_id: string }`  
**Side effects:** Creates sales_handoffs record, creates approval (type: sales_handoff), creates notification

### POST /api/sales/outreach-draft
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, contactId: string, channel: 'email'|'linkedin' }`  
**Response:** `{ draft: string, subject?: string, approval_id: string }`  
**Side effects:** Creates approval (type: sales_outreach)  
**Compliance Rule:** Checks do_not_contact flag before generating draft

---

## ANALYTICS ROUTES

### GET /api/stats?workspaceId={id}
**Auth:** Required + workspace owner  
**Response:** `{ artifacts: number, pendingApprovals: number, learningNotes: number, completedTypes: string[] }`

### GET /api/analytics/reports?workspaceId={id}&range={7d|30d|90d|12mo}
**Auth:** Required + workspace owner  
**Response:** `{ dailySeries: [], topPosts: [], channelBreakdown: {}, kpis: {} }`

### GET /api/analytics/recommendations?workspaceId={id}&range={range}
**Auth:** Required + workspace owner  
**Response:** `{ recommendations: Recommendation[], dataAvailable: boolean }`

---

## PUBLISHING ROUTES

### GET /api/scheduled-content?workspaceId={id}&platform={optional}&status={optional}
### POST /api/scheduled-content
### PATCH /api/scheduled-content
### DELETE /api/scheduled-content?id={id}

---

## EMAIL MARKETING ROUTES

### GET/POST/PATCH/DELETE /api/email-lists
### GET/POST/DELETE /api/email-subscribers
### GET/POST/PATCH /api/email-campaigns

**Compliance Rule:** Before campaign can be approved-to-send:
1. email_list must have from_name and from_email set
2. All subscribers in list must have consent = true
3. Campaign body must include unsubscribe mechanism

---

## MEMORY ROUTES (TO BUILD)

### GET /api/memory?workspaceId={id}&type={optional}
**Response:** `{ items: MemoryItem[] }`

### POST /api/memory
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId, type, content, applies_to, confidence, source_artifact_id? }`  
**Rule:** type must be one of: winning_hook/failed_pattern/brand_rule/sales_pattern/audience_insight/compliance_note/performance_benchmark  
**Rule:** content must be structured description, NOT raw chat text

---

## NOTIFICATION ROUTES

### GET /api/notifications?workspaceId={id}&limit={n}
### PATCH /api/notifications (mark read)

---

## COMPLIANCE ROUTES (TO BUILD)

### POST /api/compliance/check
**Auth:** Required + workspace owner  
**Body:** `{ workspaceId: string, artifact_id: string, check_type: string }`  
**Response:** `{ passed: boolean, issues: string[] }`  
**Rule:** Called automatically before email campaigns can enter approval flow

---

## CRON ROUTES (Internal — Protected by CRON_SECRET header)

### POST /api/cron/publish-scheduled
### POST /api/cron/brand-monitoring
### POST /api/cron/analytics-aggregation
### POST /api/cron/lead-scoring
### POST /api/cron/token-refresh
### POST /api/cron/notifications-cleanup

---

## ADMIN ROUTES (Protected by assertSuperAdmin)

### GET /api/admin/users
### GET /api/admin/workspaces
### GET /api/admin/system-health
### GET /api/admin/audit-log

---

## WEBHOOK ROUTES (Incoming — No auth, verify signature)

### POST /api/webhooks/stripe — Verify Stripe-Signature header
### POST /api/webhooks/meta — Verify X-Hub-Signature-256 header
### POST /api/webhooks/resend — Track email events (open, click, bounce)
