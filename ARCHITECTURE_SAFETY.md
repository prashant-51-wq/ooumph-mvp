# Ooumph Safety Architecture — Human Governance Manifest

**Audience:** Engineers extending Ooumph with new agents, publish destinations, or
external integrations.

**Last reviewed:** Step 7 (Agent Console rollout) — safety audit pass.

---

## The Prime Invariant

> **No third-party customer-facing action (email send, social publish, SMS,
> outbound call, paid ad spend) may fire on AI-generated content without a
> human reviewer first committing `approval.status = 'approved'` for the
> underlying artifact.**

Everything in this document is a means to enforce this invariant, end-to-end,
across:
- the streaming AI pipeline (server → wire → client),
- the database schema (artifacts, approvals, agent_runs),
- the runtime gate (`ReviewRequiredModal` + `assertArtifactApproved`),
- and the developer workflow for adding new agents.

---

## The Lifecycle of an AI-Generated Artifact

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   1. USER PROMPT                                                         │
│      User asks the CMO chat or clicks Generate on Strategy page.         │
│      │                                                                   │
│      ▼                                                                   │
│   2. STREAMING AGENT RUN                                                 │
│      /api/agents/{cmo,strategy,...} opens a Server-Sent-Events stream    │
│      backed by `lib/agent-stream.ts`. Lifecycle events                   │
│      (agent_start / agent_log / agent_done) are emitted as work          │
│      progresses; token deltas stream into the assistant chat bubble.     │
│      │                                                                   │
│      ▼                                                                   │
│   3. ARTIFACT PERSIST (status='draft')                                   │
│      The agent INSERTs into `artifacts` with status='draft'. No external │
│      side-effects have fired. The work is purely server-internal.        │
│      │                                                                   │
│      ▼                                                                   │
│   4. APPROVAL OPENED (status='pending')                                  │
│      A row is inserted into `approvals` referencing the artifact, with   │
│      status='pending'. An `approval_pending` event is emitted on the     │
│      stream — this is the SIGNAL TO PAUSE THE PIPELINE.                  │
│      │                                                                   │
│      ▼                                                                   │
│   5. STREAM CLOSES (done event)                                          │
│      The orchestrator emits `done` and closes its ReadableStream.        │
│      No publish / send / outbound call has happened yet.                 │
│      │                                                                   │
│      ▼                                                                   │
│   6. REVIEW REQUIRED MODAL                                               │
│      The client (CMO page or Strategy page) catches the                  │
│      `approval_pending` event and opens `<ReviewRequiredModal>` over     │
│      the workspace. The human:                                           │
│        - reads the artifact preview,                                     │
│        - sees the Brand Voice Score from Claude scoring,                 │
│        - optionally inline-edits the content,                            │
│        - clicks Approve OR Reject (with reasoning).                      │
│      │                                                                   │
│      ▼                                                                   │
│   7. APPROVAL COMMIT (status='approved' OR 'rejected')                   │
│      `PATCH /api/approvals` flips both:                                  │
│        - approvals.status                                                │
│        - artifacts.status      (kept in lockstep — see route.ts)         │
│      A rejection ALSO writes a `learning_notes` row capturing the        │
│      reasoning, so the next generation improves.                         │
│      │                                                                   │
│      ▼                                                                   │
│   8. CONDITIONAL PUBLISH (pragmatic-c behavior)                          │
│      IF the artifact has a `publishDestination` (extracted from          │
│      content_json.platform OR carried on the approval_pending event):    │
│        → ReviewRequiredModal also POSTs `/api/publish/direct`            │
│        → that route runs `assertArtifactApproved()` as defense in depth  │
│        → ONLY THEN does the external API call (Twitter/LinkedIn/etc) run │
│      ELSE:                                                               │
│        → status flip is the whole transaction. Artifact sits in the      │
│          workspace; user can publish manually later from Publishing Hub. │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema — The Source of Truth

```sql
-- The unit of generated content. status starts at 'draft'.
CREATE TABLE artifacts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  agent_run_id  TEXT,              -- which run produced this
  type          TEXT NOT NULL,     -- 'strategy' | 'social_post' | 'email_campaign' | ...
  title         TEXT NOT NULL,
  content_json  TEXT NOT NULL,     -- the generated content + metadata + platform
  status        TEXT DEFAULT 'draft',  -- 'draft' | 'pending' | 'approved' | 'rejected'
  created_at    TEXT DEFAULT NOW()
);

-- The human-governance gate. One per artifact. Status moves draft → pending → approved/rejected.
CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  artifact_id     TEXT REFERENCES artifacts(id),
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approver_email  TEXT,
  notes           TEXT,                    -- rejection reason → fed back as learning_note
  brand_voice_score      INTEGER,          -- 0-100, cached from Claude scoring
  brand_voice_reasoning  TEXT,             -- JSON array of reasoning bullets
  created_at      TEXT,
  updated_at      TEXT
);

-- Audit trail. Every agent invocation gets a row regardless of outcome.
CREATE TABLE agent_runs (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  agent_name      TEXT NOT NULL,    -- 'cmo' | 'strategy' | 'content' | ...
  status          TEXT,             -- 'running' | 'completed' | 'failed'
  parent_run_id   TEXT,             -- CMO orchestrator → sub-agents
  input_json      TEXT,
  output_json     TEXT,
  cost_estimate   REAL,
  error_message   TEXT,
  created_at      TEXT,
  completed_at    TEXT
);

-- Per-event audit trail for streaming runs. Lets Audit page replay any run.
-- Token deltas are intentionally NOT persisted (too noisy — see lib/agent-stream.ts).
CREATE TABLE agent_run_events (
  id            TEXT PRIMARY KEY,
  agent_run_id  TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  event_type    TEXT NOT NULL,   -- 'agent_start' | 'agent_log' | 'artifact_created' | ...
  payload       TEXT NOT NULL,   -- full event JSON
  created_at    TEXT
);
```

**The status invariant:** `artifacts.status` and `approvals.status` are kept
in lockstep by `PATCH /api/approvals`. They MUST never drift. Any new code path
that updates one without the other is a bug.

---

## The Runtime Gate — `assertArtifactApproved()`

Single helper in `lib/guards.ts`. Use it in every route that fires a
third-party write on artifact content:

```ts
import { assertArtifactApproved } from '@/lib/guards'

export async function POST(req: NextRequest) {
  const { workspaceId, artifactId, ... } = await req.json()

  // Workspace auth (existing)
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  // Approval gate (the safety invariant)
  const gate = await assertArtifactApproved(workspaceId, artifactId)
  if (gate) return gate    // 403 Forbidden with "approval required" body

  // ...now safe to fire Twitter/LinkedIn/Resend/etc...
}
```

**Behavior:**
- `artifactId` falsy → returns `null` (caller's responsibility — raw-content paths).
- Artifact not found → 404.
- Approval not 'approved' (pending/rejected/missing) → 403 with a helpful body
  pointing the user to the Review Required modal.
- Approval committed → returns `null` (proceed).

This gate is **defense in depth** — the primary guarantee is that the
ReviewRequiredModal is the only UI path from an `approval_pending` event to an
external write. The server-side gate exists to catch bugs and to make the
invariant unbypassable even if some future code path forgets the rule.

---

## Per-Tool Audit Results (Step 7 pass)

Each external write surface was inspected for safety. Results:

### ✅ Safe — gated by approval or user-explicit

| Tool | Route(s) | How it's gated |
|---|---|---|
| **Resend (email)** — funnel sequences | `PUT /api/agents/funnel/email-sequence` | Explicit check at line 217: `if (approval.status !== 'approved') return 403`. |
| **Resend (email)** — approval notifications | `lib/email.ts` `sendApprovalRequestEmail`, used by Strategy + Content agents | Notifies the **workspace owner** that a review is needed. Administrative, not customer outreach. |
| **Resend (email)** — team invites | `/api/team/invite` | Explicit user action (Settings → Team → Invite). No artifact involved. |
| **Resend (email)** — calendar bookings | `/api/calendar/book`, `/api/cron/calendar-reminders` | Operates on `bookings` rows the contact already opted into. |
| **Resend (email)** — workflow nodes (`send_email`) | `lib/workflow-engine.ts` | Runs only when `workflows.status='active'`. The user explicitly activates a workflow — that activation IS the approval. |
| **Resend (email)** — scheduled publish cron | `/api/cron/publish-scheduled` | Operates on `scheduled_posts` already created from approved artifacts. |
| **Resend (email)** — KPI alerts | `/api/cron/kpi-alert` | Internal admin alerts to workspace owner. No customer outreach. |
| **Resend (email)** — inbox replies | `/api/inbox/[id]/reply` | Explicit user-typed reply via Inbox UI. |
| **Resend (email)** — notify agent | `/api/agents/notify` | Sends approval-request emails. Administrative. |
| **Resend (email)** — reputation agent | `/api/agents/reputation` | Sends review-request follow-ups to **already-booked customers**. The booking IS the consent. |
| **Twitter publish** | `/api/agents/publish/twitter`, `/api/publish/direct` | `/api/publish/direct` now runs `assertArtifactApproved()`. Direct calls to `/api/agents/publish/twitter` are user-initiated UI actions (Publishing Hub). |
| **LinkedIn publish** | `/api/agents/publish/linkedin`, `/api/publish/direct` | Same as Twitter. |
| **YouTube publish** | `/api/agents/publish/youtube` | User-initiated upload action. |
| **HubSpot writes** | `/api/agents/leads/hubspot`, `/api/agents/funnel/qualify` | Internal CRM mirroring of contacts the workspace already owns. Not customer outreach. User must explicitly click "Sync to HubSpot". |
| **VAPI outbound calls** | `/api/agents/voice/vapi` (`action='make_call'`) | Requires explicit user click in Voice AI UI with a specific assistantId + phoneNumber. Not part of any auto-generation pipeline. |
| **Mailchimp / Brevo / Klaviyo writes** | `/api/agents/email/campaign` (`action='create'`/`'send'`) | The `'create'` action only creates the campaign in the provider as a draft. The `'send'` action requires explicit user trigger. |
| **Stripe charges** | `/api/billing/subscribe`, `/api/billing/portal`, `/api/webhooks/stripe` | Driven by user clicks on Billing page (subscription checkout). Webhook is inbound-only. |
| **Slack notifications** | `/api/agents/notify/slack` | Sends internal team alerts, not customer outreach. |
| **Telegram notifications** | `/api/agents/notify/telegram` | Same — internal team alerts. |

### 🛠 Fixed during this audit

| Issue | Fix |
|---|---|
| **`POST /api/agents/email-marketing` (action='send')** previously fired Resend to `recipients[]` without verifying the campaign's underlying artifact had been approved. Anyone with workspace ownership could mass-mail without going through Review Required. | Added `assertArtifactApproved(workspaceId, campaign.artifact_id)` check. Campaigns without an `artifact_id` (manually-created via UI) still skip the check since they were user-authored, not agent-generated. |
| **`POST /api/publish/direct`** trusted its caller (the ReviewRequiredModal) to gate publishes. A bug or forged request could've fired publishes without approval. | Added `assertArtifactApproved(workspaceId, artifactId)` as defense in depth. If no `artifactId` is provided (raw-content path), check is skipped — caller takes responsibility. |

### 📋 Follow-up tasks (deferred — not blocking)

The following routes are currently safe **by convention** (only called from
authenticated UI paths) but lack server-side approval gating:

- `POST /api/agents/publish/twitter` (`action='tweet'`/`'thread'`)
- `POST /api/agents/publish/linkedin` (`action='post'`/`'article'`)
- `POST /api/agents/publish/social`
- `POST /api/agents/publish/youtube`

**Recommendation:** Add `assertArtifactApproved()` to each when `artifactId`
is present in the request body. Tracked as a P3 task.

---

## How `ReviewRequiredModal` Enforces the Gate (Client Side)

The modal is the **only** UI affordance that flips an approval from `pending`
to `approved`. There is no other "approve this artifact" button anywhere in
the dashboard.

When the user clicks **Approve**:

```ts
// 1. ALWAYS commit the approval first (the safety gate).
//    If this fails, NOTHING else happens.
const apvRes = await fetch('/api/approvals', {
  method: 'PATCH',
  body: JSON.stringify({ approvalId, action: 'approve', workspaceId }),
})
if (!apvRes.ok) throw new Error('Approval failed')

// 2. ONLY IF approval committed AND publishDestination set, queue for publish.
//    The /api/publish/direct route re-checks the approval as defense in depth.
if (effectivePublishDestination) {
  const pubRes = await fetch('/api/publish/direct', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId,
      platforms: [effectivePublishDestination],
      content: primaryText,
      artifactId,   // ← triggers server-side assertArtifactApproved()
    }),
  })
  // If publish fails, approval STAYS. User can re-publish manually later.
  if (!pubRes.ok) setWarning('Approved, but publish failed: ...')
}
```

The two writes are deliberately decoupled. If the publish step fails, the
approval is already committed in DB. The artifact is approved. The user just
needs to re-trigger publish from the Publishing Hub. The customer never
receives a half-baked send.

When the user clicks **Reject**:

```ts
await fetch('/api/approvals', {
  method: 'PATCH',
  body: JSON.stringify({
    approvalId,
    action: 'reject',
    notes: rejectReason,
    workspaceId,
  }),
})
// The approvals route ALSO writes `learning_notes` so future
// generations adjust based on this reasoning.
```

When the user closes the modal **without acting**: the approval stays
`pending` indefinitely. The artifact sits in the workspace as a draft. The
notification bell on the dashboard continues to surface it.

---

## How Streaming Preserves The Gate (Server Side)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  /api/agents/{cmo,strategy,...} streaming routes                        │
│                                                                          │
│  const handle = await createAgentEventStream(...)                       │
│                                                                          │
│  const workPromise = (async () => {                                     │
│    await handle.send({ t: 'agent_start', ... })                         │
│    // ... generate content via Claude ...                               │
│                                                                          │
│    // ▼▼ Safety boundary ▼▼                                             │
│    //     ALL persistence to `artifacts` uses status='draft'             │
│    //     ALL `approvals` inserts use status='pending'                   │
│    //     NO third-party writes happen here                             │
│                                                                          │
│    INSERT INTO artifacts (..., status) VALUES (..., 'draft')            │
│    INSERT INTO approvals (..., status) VALUES (..., 'pending')          │
│                                                                          │
│    await handle.send({ t: 'artifact_created', artifactId, type, title })│
│    await handle.send({ t: 'approval_pending', approvalId, artifactId })  │
│    await handle.close({ output: { artifactId, approvalId, ... } })      │
│  })()                                                                    │
│                                                                          │
│  // ▼▼ Vercel lifetime guarantee ▼▼                                     │
│  //     Even if the client disconnects, after() keeps the function      │
│  //     alive until workPromise resolves — but workPromise NEVER fires  │
│  //     external writes regardless. The approval is always pending.     │
│  after(async () => { await workPromise })                               │
│                                                                          │
│  return streamingResponse(handle.stream)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**The server-side guarantee is structural:** an agent's streaming code path
literally has no code that calls Twitter/LinkedIn/Resend/VAPI/HubSpot. The
external-write code lives in:
- `lib/twitter-oauth.ts`, `lib/tools/{linkedin,resend,hubspot,vapi,...}.ts`
- `/api/publish/{direct,...}`, `/api/agents/publish/{twitter,linkedin,...}`

…and **none of those is imported into any `/api/agents/{cmo,strategy,...}`
route**. The separation is enforced by import discipline, not by runtime
checks alone.

---

## Developer Checklist — Adding a New Agent Safely

Before merging a new agent route or feature, verify:

1. [ ] **Does it generate or mutate content that customers will eventually see?**
       If yes → it produces an `artifact` and creates a `pending` approval.
       Use `INSERT INTO artifacts (..., status) VALUES (..., 'draft')`.

2. [ ] **Does it use the streaming pattern?**
       If yes → import `createAgentEventStream` from `@/lib/agent-stream`,
       wrap the workPromise with `after()` for Vercel lifetime safety, emit
       `artifact_created` + `approval_pending` events when artifacts land.

3. [ ] **Does it call any external API that writes (publishes, sends, charges)?**
       If yes → that call must go in a SEPARATE route (NOT the agent route),
       AND that route must call `assertArtifactApproved(workspaceId, artifactId)`.

4. [ ] **Does it integrate with the ReviewRequiredModal flow?**
       If yes → make sure your artifact's `content_json` includes a
       `platform` / `publishDestination` field if it should auto-queue for
       publish on approval. Otherwise it'll just flip to approved and sit in
       the workspace (pragmatic-c default).

5. [ ] **Is workspace ownership enforced?**
       Every route MUST call `assertWorkspaceOwnership(req, workspaceId)`.
       This is enforced by lint via grep at PR review.

6. [ ] **Are you sending Resend/SMS/social writes from inside an agent route?**
       If yes → STOP. Move it to a publish-gated route. Then add
       `assertArtifactApproved` to that route.

7. [ ] **Does it support BYOK keys?**
       Use `resolveProviderKey(workspaceId, provider)` from `@/lib/secrets`
       to pull the workspace's encrypted key first, then fall back to env.

---

## Known Exceptions (And Why They're Safe)

These code paths fire third-party APIs without an approval gate. Each has a
specific justification — review carefully before adding similar exceptions.

| Path | API | Why it's safe |
|---|---|---|
| `sendApprovalRequestEmail()` in strategy / content agents | Resend | Sends to the **workspace owner's** approval_email asking them to review. Administrative notification, never to a customer. |
| `/api/cron/kpi-alert` | Resend | Internal alert to workspace owner when KPIs drift. No customer comms. |
| `/api/cron/calendar-reminders` | Resend | Operates on `bookings` rows the contact opted into. The booking IS the consent. |
| `/api/team/invite` | Resend | User-explicit Settings → Team action. Recipient is a future team member, not a customer. |
| `/api/inbox/[id]/reply` | Resend | User typed the reply themselves in the Inbox UI. Equivalent to clicking "Send" in any email client. |
| `lib/workflow-engine.ts` `send_email` node | Resend | Runs only when `workflows.status='active'`. User explicitly activated the workflow → that activation IS the approval. |
| `/api/cron/publish-scheduled` | Resend / social APIs | Operates on `scheduled_posts` whose source artifact is already approved (gated upstream at scheduling time). |
| `/api/webhooks/stripe`, `/webhooks/meta`, `/webhooks/hubspot` | (inbound) | Receive-only. Webhooks ingest data; they don't push to third parties. |
| `/api/agents/notify/slack`, `/api/agents/notify/telegram` | Slack / Telegram | Internal team channel alerts (e.g. "new lead captured"). Not customer outreach. |
| `/api/agents/voice/vapi` (`action='make_call'`) | VAPI | Requires explicit user click with specific phoneNumber + assistantId. Not part of any auto-generation pipeline. |

If you find yourself adding a new exception, please update this table with
the justification.

---

## Verification

To check the audit holds for your branch:

```bash
# 1. TypeScript must compile cleanly.
npx tsc --noEmit

# 2. No agent route should import a publish/send tool directly.
#    This grep should return ONLY publish routes + workflow engine + lib/email.ts:
grep -r "from '@/lib/tools/twitter\|from '@/lib/twitter-oauth\|from '@/lib/tools/linkedin\|new Resend\|from 'resend'" app/api/agents

# 3. Every publish route that accepts artifactId must call assertArtifactApproved.
grep -L "assertArtifactApproved" app/api/publish/**/*.ts app/api/agents/publish/**/*.ts
# (Files in this output need approval-gating added — currently the four
#  per-platform publish workers are tracked as P3 follow-ups.)

# 4. Health check should report all subsystems OK.
curl https://your-deployment.vercel.app/api/health
```

---

## Document History

| Date | Author | Change |
|---|---|---|
| Step 7 audit | Claude + Praveen | Initial document. Fixed `email-marketing/send` gap. Added `assertArtifactApproved()` helper. Added defense-in-depth to `/api/publish/direct`. |

If you're an AI agent (Claude, a future agent, etc.) reading this and
modifying the codebase: **read this entire file before adding any code that
fires external APIs.** The safety invariant is non-negotiable.
