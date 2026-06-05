# TASK_BREAKDOWN.md — Implementation Task List
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** No task can start without: module, acceptance criteria, test requirements, and allowed files.  
**Rule:** Tasks must be small enough to complete in one focused session.

---

## How to Read This File

Each task has:
- **ID** — Unique identifier
- **Module** — Which module it belongs to
- **Priority** — P0 (critical/broken) / P1 (important) / P2 (nice to have)
- **Status** — todo / in_progress / done / blocked
- **Allowed Files** — Only these files may be changed
- **Acceptance Criteria** — How we know it's done
- **Tests Required** — What must be tested

---

## PHASE 0: Fix Critical Issues in Existing Code

### TASK-001: Add Missing Compliance Fields to contacts Table
**Module:** CRM  
**Priority:** P0  
**Status:** todo

**Problem:** contacts table missing consent_status, do_not_contact, consent_channel, consent_date, unsubscribed_at, lead_source

**Allowed Files:**
- lib/db.ts (add columns to CREATE TABLE IF NOT EXISTS)
- app/api/crm/route.ts (include new fields in SELECT/INSERT/PATCH)
- app/dashboard/leads-crm/page.tsx (show consent status on contact card)

**Acceptance Criteria:**
- [ ] contacts table has all 6 missing fields
- [ ] POST /api/crm accepts and stores consent fields
- [ ] GET /api/crm returns consent fields
- [ ] CRM contact card shows consent status and do_not_contact flag
- [ ] do_not_contact=true contact shows warning indicator in UI

**Tests Required:**
- Contact created with consent_status stored correctly
- Contact with do_not_contact=true cannot receive outreach draft

---

### TASK-002: Build Compliance Review Agent
**Module:** Compliance & Safety  
**Priority:** P0  
**Status:** todo

**Problem:** No compliance check before email/outreach enters approval queue

**Allowed Files:**
- lib/agents/compliance.ts (NEW — create this file)
- app/api/compliance/check/route.ts (NEW — create this route)
- lib/db.ts (add compliance_checks table)

**Acceptance Criteria:**
- [ ] POST /api/compliance/check runs checklist
- [ ] Returns { passed: boolean, issues: string[] }
- [ ] Checks: do_not_contact, consent_status, unsubscribe in email, factual claims
- [ ] compliance_checks record created for audit trail

**Tests Required:**
- Email without unsubscribe → passed=false
- Contact with do_not_contact → passed=false
- Clean email → passed=true

---

### TASK-003: Add Structured Memory Write on Approval/Rejection
**Module:** Memory System  
**Priority:** P0  
**Status:** todo

**Problem:** Approvals/rejections don't create memory items. Memory system is not wired.

**Allowed Files:**
- app/api/approvals/route.ts (add memory write after approve/reject)
- app/api/memory/route.ts (NEW — create CRUD routes)

**Acceptance Criteria:**
- [ ] PATCH /api/approvals with status='rejected' → creates memory_item type='failed_pattern'
- [ ] PATCH /api/approvals with status='approved' → creates memory_item type='approved_template'
- [ ] Memory items have workspace_id, type, content, applies_to
- [ ] POST /api/memory validates type is in allowed list
- [ ] GET /api/memory returns workspace-scoped items

**Tests Required:**
- Rejection creates failed_pattern memory item
- Approval creates approved_template memory item
- Memory item type validation rejects invalid types

---

### TASK-004: Wire Memory Into CMO Agent System Prompt
**Module:** CMO Chat  
**Priority:** P1  
**Status:** todo

**Problem:** CMO agent ignores past learnings. Generates same mistakes repeatedly.

**Allowed Files:**
- app/api/agents/cmo/route.ts
- lib/agents/memory-retrieval.ts (NEW)

**Acceptance Criteria:**
- [ ] Before CMO generates response, retrieves top 10 memory items for workspace
- [ ] Memory items included in system prompt under labeled sections
- [ ] Brand rules applied, failed patterns avoided, winning hooks referenced
- [ ] Memory retrieval adds < 500ms to response time

---

### TASK-005: Add do_not_contact Check to Outreach Draft
**Module:** Sales Agent System  
**Priority:** P0  
**Status:** todo

**Problem:** Sales outreach can be drafted for contacts who opted out or are on DNC list

**Allowed Files:**
- app/api/sales/outreach-draft/route.ts (NEW — or existing outreach agent)
- lib/agents/sales.ts

**Acceptance Criteria:**
- [ ] Before generating outreach draft: check do_not_contact = false
- [ ] Before generating outreach draft: check consent_status != 'opted_out'
- [ ] If either check fails: return 400 with clear error message
- [ ] Error shown to user: "This contact has opted out of marketing communications"

---

## PHASE 1: Build Missing Sales Agent System

### TASK-006: Create sales_handoffs and objection_log Tables
**Module:** Sales Agent System  
**Priority:** P1  
**Status:** todo

**Allowed Files:**
- lib/db.ts (add tables)

**Acceptance Criteria:**
- [ ] sales_handoffs table created with all columns from DATABASE_SCHEMA.md
- [ ] objection_log table created

---

### TASK-007: Build Lead Research Agent
**Module:** Sales Agent System  
**Priority:** P1  
**Status:** todo

**Allowed Files:**
- lib/agents/lead-research.ts (NEW)
- app/api/sales/research/route.ts (NEW)

**Acceptance Criteria:**
- [ ] POST /api/sales/research accepts { workspaceId, contactId }
- [ ] Calls Brave Search with company name + industry
- [ ] Returns structured research: lead_summary, company_summary, pain_points[], personalization_notes, risk_flags[]
- [ ] Updates contact record with research data
- [ ] Requires BYOK brave_search key

---

### TASK-008: Build Lead Qualification Agent
**Module:** Sales Agent System  
**Priority:** P1  
**Status:** todo

**Allowed Files:**
- lib/agents/lead-qualifier.ts (NEW)
- app/api/sales/qualify/route.ts (NEW)

**Acceptance Criteria:**
- [ ] POST /api/sales/qualify returns fit_score, intent_score, lead_score, qualification_status, recommended_next_step
- [ ] Score calculation matches SALES_AGENT_WORKFLOWS.md algorithm
- [ ] Updates contact.lead_score, contact.fit_score, contact.intent_score

---

### TASK-009: Build Sales Handoff Agent and Packet Generator
**Module:** Sales Agent System  
**Priority:** P1  
**Status:** todo

**Allowed Files:**
- lib/agents/sales-handoff.ts (NEW)
- app/api/sales/handoff/route.ts (NEW)

**Acceptance Criteria:**
- [ ] Generates full handoff packet from CRM data
- [ ] Creates sales_handoffs record
- [ ] Creates approval record (type: sales_handoff)
- [ ] Notifies assigned sales rep

---

### TASK-010: Build Meeting Booking Message Agent
**Module:** Sales Agent System  
**Priority:** P1  
**Status:** todo

**Allowed Files:**
- lib/agents/meeting-booker.ts (NEW)
- Part of TASK-009 route

**Acceptance Criteria:**
- [ ] Drafts personalized meeting booking message
- [ ] Suggests 2–3 time slots (based on simple availability logic)
- [ ] Creates approval record (type: meeting_booking)
- [ ] Draft only — human must send

---

## PHASE 2: Complete Missing Features

### TASK-011: Unsubscribe Webhook Handler
**Module:** Email Marketing  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- app/api/webhooks/resend/route.ts
- app/api/webhooks/klaviyo/route.ts (NEW)

**Acceptance Criteria:**
- [ ] Resend bounce/unsubscribe event updates email_subscribers.status
- [ ] Updates contacts.consent_status = 'opted_out'
- [ ] Sets contacts.unsubscribed_at = NOW()

---

### TASK-012: Compliance Check Before Email Approval
**Module:** Email Marketing + Compliance  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- app/api/approvals/route.ts (add compliance check before creating approval for email type)

**Acceptance Criteria:**
- [ ] POST /api/approvals with artifact_type='email_draft' triggers compliance check
- [ ] If compliance fails: returns 400 with issues list (does not create approval record)
- [ ] If compliance passes: creates approval record normally

---

### TASK-013: Write Unit Tests for auth.ts
**Module:** Auth  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- __tests__/unit/auth.test.ts (NEW)

**Tests to write:**
- hashPassword returns bcrypt hash
- verifyPassword returns true for correct password
- verifyPassword returns false for wrong password
- createSession generates token and stores in DB
- verifySession returns null for expired session
- verifySession returns null for tampered token
- verifySession returns userId for valid session

---

### TASK-014: Write Security Tests for Workspace Isolation
**Module:** Workspace  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- __tests__/security/workspace-isolation.test.ts (NEW)

**Tests to write:**
- User A cannot GET User B's workspace
- User A cannot PATCH User B's contacts
- User A cannot GET User B's agent runs
- Workspace_id injection via body is rejected

---

### TASK-015: Write Integration Tests for Approval Flow
**Module:** Approval Engine  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- __tests__/integration/approvals.test.ts (NEW)

**Tests to write:**
- Artifact in pending state cannot publish
- Approval creates scheduled_content when publishDestination set
- Rejection creates failed_pattern memory item
- Unauthorized user cannot approve

---

## PHASE 3: Polish and Complete

### TASK-016: Remove All Hardcoded Demo Data from UI
**Module:** All  
**Priority:** P1  
**Status:** PARTIALLY DONE (commits 7d97851, c92c8ea)

**Remaining:**
- [ ] Check if any pages still show loading skeleton demos
- [ ] Verify all empty states are honest (no fake first-time content)

---

### TASK-017: Add Test Infrastructure Setup
**Module:** All  
**Priority:** P0  
**Status:** todo

**Allowed Files:**
- jest.config.ts (NEW)
- jest.setup.ts (NEW)
- package.json (add jest dependencies)
- __tests__/ directory structure

**Acceptance Criteria:**
- [ ] `npm test` runs without errors on clean repo
- [ ] Test DB uses SQLite (no Neon connection needed for tests)
- [ ] Test utilities for creating test users/workspaces

---

## Task Priority Summary

| Priority | Count | Status |
|----------|-------|--------|
| P0 (Critical) | 8 | All todo |
| P1 (Important) | 7 | All todo |
| P2 (Nice to have) | 0 | — |

**The P0 tasks represent the gaps between what we have and what a production-safe system needs.**  
Complete TASK-001 through TASK-005 and TASK-013 through TASK-017 before any new features are added.
