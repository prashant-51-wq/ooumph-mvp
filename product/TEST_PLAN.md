# TEST_PLAN.md — How We Know the Product Works
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** A feature is NOT complete because an LLM said it is complete. It is complete only when required tests pass.

---

## Testing Philosophy

From the AI-Native SDLC document:
> A task should not be marked complete because an LLM says it is complete. It is complete only when required gates pass.

We have zero tests currently. This is a critical gap.

---

## Test Categories

### 1. Unit Tests
Test individual functions in isolation.  
**Framework:** Jest + ts-jest  
**Location:** `__tests__/unit/`

### 2. Integration Tests
Test API routes with real DB calls.  
**Framework:** Jest + supertest  
**Location:** `__tests__/integration/`

### 3. Manual QA Checklists
Critical workflows verified by a human clicking through the app.  
**Location:** This document (Section 4)

### 4. Security Tests
Verify auth, permissions, and tenant isolation.  
**Location:** `__tests__/security/`

---

## Priority 1: Critical Path Tests (Must Pass Before Any Release)

### AUTH-001: Signup and Login
**Type:** Integration  
```
✓ User can sign up with valid email + password
✓ User cannot sign up with email that already exists (409)
✓ Password is bcrypt hashed (never stored plaintext)
✓ Session cookie is set on signup
✓ User can log in with correct credentials
✓ User cannot log in with wrong password (401)
✓ Login rate-limited after 5 failed attempts (429)
✓ Logout clears session cookie
✓ GET /api/auth/me returns user when logged in
✓ GET /api/auth/me returns 401 when not logged in
```

### WORKSPACE-001: Tenant Isolation
**Type:** Security — CRITICAL
```
✓ User A cannot read User B's workspace data
✓ User A cannot modify User B's contacts
✓ User A cannot view User B's agent runs
✓ User A cannot approve User B's approvals
✓ All workspace-scoped routes return 403 for wrong workspace_id
✓ workspace_id cannot be injected via body to access other workspaces
```

### WORKSPACE-002: API Key Security
**Type:** Security — CRITICAL
```
✓ GET /api/workspaces never returns actual API key values
✓ GET /api/workspaces returns secrets: { anthropic: true/false } booleans only
✓ API keys are encrypted before storage (AES-256-GCM)
✓ Decrypted keys are never logged
✓ PATCH /api/workspaces strips API key fields before saving to workspaces table
```

### APPROVAL-001: No Content Publishes Without Approval
**Type:** Integration — CRITICAL
```
✓ Calling POST /api/publishing/publish without prior approval → 403
✓ Artifact with status='pending' cannot trigger publishing
✓ Only artifacts with status='approved' can create scheduled_content
✓ Approval records are created with correct user_id and timestamp
✓ Rejection notes are saved and create memory items
```

### CRM-001: Compliance Fields
**Type:** Integration — CRITICAL
```
✓ Contact with do_not_contact=true cannot be included in outreach drafts
✓ Contact with consent_status='opted_out' cannot receive email
✓ Unsubscribe webhook updates consent_status correctly
✓ Lead source is captured on every contact creation
✓ Consent fields are included in all contact create/read operations
```

---

## Priority 2: Core Feature Tests

### AGENT-001: CMO Agent Streaming
```
✓ POST /api/agents/cmo returns SSE stream (Content-Type: text/event-stream)
✓ Token events stream to client
✓ Agent run record created in DB
✓ Agent run status updates from pending → running → completed
✓ Cost estimate recorded on completion
✓ If quota exceeded: 429 response, no agent run created
✓ Proposal in response creates artifact + approval records
```

### AGENT-002: Quota Enforcement
```
✓ Workspace on starter plan (100 runs/month): 101st run returns 429
✓ Workspace on growth plan (500 runs/month): 501st run returns 429
✓ Quota is workspace-scoped (not global)
✓ Quota resets on 1st of each month
```

### CRM-002: Lead Capture Flow
```
✓ POST /api/form-submissions creates form_submission record
✓ POST /api/form-submissions creates/upserts contact record
✓ POST /api/form-submissions creates notification
✓ Duplicate email upserts (updates) existing contact
✓ lead_source is captured from form data
✓ consent_status is set if form includes consent field
```

### PUBLISHING-001: Scheduled Content Flow
```
✓ Approved artifact with publishDestination creates scheduled_content record
✓ scheduled_content with scheduled_at in past is picked up by cron
✓ Cron updates status to 'published' on success
✓ Cron updates status to 'failed' + logs error on platform API failure
✓ Failed publish creates notification
```

### EMAIL-001: Compliance Before Send
```
✓ Email campaign with subscriber who has consent=false → blocked
✓ Email campaign without unsubscribe mechanism → compliance check fails
✓ Email campaign with unsubstantiated claim → compliance check fails
✓ Email campaign that passes all checks → enters approval queue
✓ Unsubscribe event from ESP webhook updates contact correctly
```

---

## Priority 3: Memory System Tests

### MEMORY-001: Structured Memory Only
```
✓ POST /api/memory with type not in allowed list → 400
✓ POST /api/memory with empty content → 400
✓ Memory items are never raw chat messages
✓ Memory items have applies_to field set
✓ Memory items appear in CMO agent system prompt
✓ Rejected artifact creates failed_pattern memory item
```

---

## Manual QA Checklist — Critical Workflows

### QA-01: New Lead Capture to Sales Handoff
- [ ] Submit test form on landing page
- [ ] Verify contact created in CRM with lead_source set
- [ ] Verify consent_status captured from form
- [ ] Verify notification received in dashboard
- [ ] Verify lead_score calculated and shown on contact
- [ ] If score >= 75: verify sales handoff appears in approvals
- [ ] Approve handoff — verify sales rep notification created
- [ ] Verify CRM stage updated

### QA-02: CMO Chat to Published Content
- [ ] Type "Create a LinkedIn post about AI marketing" in CMO chat
- [ ] Verify streaming response appears token by token
- [ ] Verify artifact created and appears in Approvals queue
- [ ] Approve artifact with publishDestination = LinkedIn
- [ ] Verify scheduled_content record created
- [ ] Verify content appears in Publishing Hub queue

### QA-03: Email Campaign Compliance
- [ ] Create email list with subscribers
- [ ] Have CMO draft an email campaign
- [ ] Verify campaign enters approval queue
- [ ] Check that unsubscribe mechanism is present in HTML
- [ ] Approve campaign
- [ ] Verify email_campaigns.status = 'approved'

### QA-04: Workspace Isolation (Security)
- [ ] Create User A with Workspace A + 5 contacts
- [ ] Create User B with Workspace B
- [ ] Login as User B
- [ ] Try GET /api/crm?workspaceId={workspace_A_id}
- [ ] Verify: 403 Forbidden (not User B's workspace)

### QA-05: API Key Security
- [ ] Save Anthropic API key in Settings
- [ ] Navigate away and come back to Settings
- [ ] Verify: "✅ Key saved and encrypted" shown
- [ ] Verify: Actual key value NOT shown
- [ ] Check network tab: GET /api/workspaces response has secrets.anthropic = true, NOT the key
- [ ] Check DB: workspace_secrets has encrypted_value, NOT plaintext key
- [ ] Check DB: workspaces.model_settings has anthropicApiKey field removed

### QA-06: Approval Required (No Bypass)
- [ ] Generate content via CMO agent
- [ ] Without approving, attempt to post to social manually
- [ ] Verify: Blocked — content in pending state cannot publish
- [ ] Approve content
- [ ] Verify: Now appears in publishing queue

---

## Test Commands to Implement

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run security tests only
npm run test:security

# Run specific test file
npm test -- --testPathPattern=auth.test
```

---

## Test Coverage Targets

| Module | Target Coverage |
|--------|----------------|
| lib/auth.ts | 100% |
| lib/secrets.ts | 100% |
| lib/guards.ts | 100% |
| API routes (auth) | 100% |
| API routes (workspace) | 90% |
| API routes (crm) | 80% |
| API routes (approvals) | 100% |
| API routes (agents) | 70% |
| Components | 50% (critical paths) |

---

## Definition of Done

A feature is complete when:
1. ✅ The code compiles without errors
2. ✅ Unit tests pass for all functions
3. ✅ Integration tests pass for all API routes
4. ✅ Security tests pass (workspace isolation, auth)
5. ✅ Manual QA checklist completed for affected workflows
6. ✅ No existing tests broken (regression check)
7. ✅ No hardcoded fake data in production code
8. ✅ No TODO/FIXME comments in changed files (or they're tracked in KNOWN_ISSUES.md)
