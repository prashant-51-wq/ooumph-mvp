# Sprint 18+ — Large Items From Audit Pass #3 (deferred from P2 sweep)

The audit pass #3 (post-Sprint-16) surfaced three items that are genuinely
architectural — too large to land cleanly inside a polish sweep. Sprint 17
closed every P0 / P1 / P2 except these three; this doc decomposes them
into actionable Sprint 18 / 19 tickets so they aren't silently buried.

---

## P2 #29 — Unify creative generation surfaces

**Current state:** Creative generation lives across four routes:
- `/dashboard/creative-studio` — unified async queue (DALL-E, Runway,
  Stability) using `creative_generation_jobs` table.
- `/dashboard/image-gen` — DALL-E specifically, writes `artifacts` only
  (Sprint 15D dual-writes to `media_assets` too).
- `/dashboard/video-gen` — Runway/Luma/Kling/Sora/Pika.
- `/dashboard/voiceover` — ElevenLabs.
- `/dashboard/voice-ai` — Vapi (live voice agents — different concern).

**Decomposed tickets:**

1. **Sprint 18A — Studio-level navigation overlay.** Add a "Studio" tab
   bar at the top of `/dashboard/creative-studio` with sub-tabs for
   "Image / Video / Audio / Voice AI" that shallow-redirect to the
   existing per-modality pages. Cheap, gives a single mental entry
   point without breaking deep links.
2. **Sprint 18B — Composer-mode unification.** Move the
   modality-specific composer state into a shared `<CreativeComposer>`
   shell that branches the prompt UI by modality but unifies History +
   Gallery + Approval chrome. ~3-4 days work.
3. **Sprint 19A — Backend route consolidation.** Move
   `/api/agents/creative/image-gen` and `/api/agents/video/*` behind a
   single `/api/agents/creative/generate` polymorphic dispatcher that
   takes `{modality, model, prompt, …}`. The provider adapters stay
   exactly where they are — only the entry point changes. Required if
   we want a CMO "creative" slug to fan out cleanly.

---

## P2 #39 — CMO sub-agent fan-out (~55% of routes orphaned)

**Current state:** Auditing `app/api/agents/**` shows ~94 route files,
of which only ~35-40 are reachable from the dashboard or CMO dispatch.
The remaining ~55% (growth/engagement, growth/influencer, retargeting/*,
sales/* sub-agents, branding/* sub-agents, creative leaf agents,
scheduling/* sub-agents, …) are callable only with curl.

CMO's `AGENT_ROUTE_MAP` deliberately routes to umbrella supervisors
(`growth`, `sales`, `branding`, `creative`) rather than leaves. Those
supervisors are supposed to fan out — but most of them don't, by file
count.

**Decomposed tickets:**

1. **Sprint 18C — Audit & rank orphan routes.** Build a static
   reachability report: for each `app/api/agents/**/route.ts`, list its
   callers (other routes, cron, UI buttons). Emit a CSV. Triage which
   leaves are worth wiring vs deletable. ~1 day.
2. **Sprint 18D — Promote 10 high-value leaves to direct CMO slugs.**
   `engagement`, `influencer`, `hashtag-seo`, `trend-scout` (growth);
   `outreach`, `objections`, `demo-script` (sales); `logo`, `colors`,
   `taglines` (branding). Each gets:
     - An entry in `AGENT_ROUTE_MAP` in `app/api/agents/cmo/route.ts`.
     - A one-line description in `CMO_SYSTEM_PROMPT` so Claude knows
       when to dispatch it.
     - At least one dashboard button that POSTs to it directly.
3. **Sprint 19B — Real sub-agent fan-out from umbrellas.** The umbrella
   supervisor routes (`/api/agents/growth/route.ts`, `/api/agents/sales/
   route.ts`, `/api/agents/branding/route.ts`) should LLM-route to their
   leaf children. Pattern: each umbrella reads the user's request,
   selects 1-3 leaves, calls them in parallel via `Promise.allSettled`,
   merges results. Mirrors the CMO pattern at one level down. ~4 days.
4. **Sprint 19C — Delete genuinely-dead leaves.** Anything from the
   18C audit that ranks "no caller, no UI, no plan" gets nuked. Keeps
   the codebase honest about surface area.

---

## P2 #41 — Unified campaign create wizard

**Current state:** Four disconnected campaign-creation surfaces:
- `/dashboard/ads` — paid only (NewCampaignModal).
- CMO chat — multi-channel narrative, AI-driven.
- `/dashboard/email-marketing` — broadcast emails.
- `/dashboard/pr` — press releases.

Each writes to a different table (`ad_campaigns`, `email_campaigns`,
`pr_campaigns`); the "campaign" concept across them is ad-hoc.

**Decomposed tickets:**

1. **Sprint 18E — Campaign supergroup schema.** New `campaigns` parent
   table with `id, workspace_id, name, objective, status, started_at,
   ended_at, budget_cents, target_channels[]`. Add `campaign_id` FK to
   `ad_campaigns`, `email_campaigns`, `pr_campaigns`. Backfill is
   optional — new rows always link.
2. **Sprint 18F — `/dashboard/campaign/new` wizard.** 4-step wizard:
   (1) objective + name, (2) target channels (multi-select drives which
   child rows get created), (3) budget allocation, (4) review + launch.
   Final step POSTs to `/api/campaigns` which creates the parent +
   per-channel children. Existing per-channel modals stay as
   quick-create paths.
3. **Sprint 19D — `/dashboard/campaign/[id]` consolidated view.**
   Single page rolling up the parent + every child's metrics (ad spend,
   email opens, PR pickups) with timeline overlay. Replaces the
   read-only `/dashboard/campaign` index page.
4. **Sprint 19E — Pause-cascades.** When a parent campaign is paused,
   cascade `paused` to every child. When unpaused, optional cascade.
   Needs the Sprint 17A platform-status-sync work to honour each
   child's connector (already shipped for `ad_campaigns`).

---

## How to use this doc

When picking up Sprint 18: each of the lettered tickets above can be a
single ~1-week assignment. They're independent — Sprint 18A through
18F can land in any order. Sprint 19A-E depend on the 18x foundation
landing first.
