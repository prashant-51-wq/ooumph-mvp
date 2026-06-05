# Ooumph — AI Marketing Agency SaaS

Multi-tenant AI-powered marketing automation platform. 17-agent registry orchestrated by a CMO supervisor, with HITL approvals, multi-channel publishing, CRM, funnels, ads, and a full super-admin portal.

**Repo:** https://github.com/prashant-51-wq/ooumph-mvp
**Active branch:** `sprint-1-honest-mvp`
**Live:** https://ooumph-mvp.vercel.app
**Open PR:** https://github.com/prashant-51-wq/ooumph-mvp/pull/1

---

## TL;DR for the next assistant

If you're picking this up in a new chat:

1. Pull the repo: `git clone https://github.com/prashant-51-wq/ooumph-mvp.git && cd ooumph-mvp && git checkout sprint-1-honest-mvp`
2. The codebase is Next.js 16 (App Router, Turbopack), TypeScript strict, deployed on Vercel.
3. DB is dual-track: SQLite locally (zero-config), Postgres (Neon) in prod. Same `sql` template tag works for both.
4. **86 sprints** are already landed and stable. The platform is feature-complete for an MVP — bugs you find will mostly be in the long tail of the 54 user dashboard pages or the 11 admin portal pages. Use the audit-pass playbook below.
5. **Vercel CLI is logged in** as `prashantmishra-8836` and the project is linked. `npx vercel --prod --yes` deploys from local.
6. **Postgres is live** at Neon. `npx vercel env pull .env.production.local --environment=production --yes` gets you the connection string for ad-hoc queries (`@neondatabase/serverless` is the driver — see "Postgres ad-hoc access" below).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 App Router, React, Tailwind, lucide-react |
| Server | Next.js API routes + Edge proxy (`proxy.ts`) |
| DB (prod) | Neon Postgres via `@neondatabase/serverless` |
| DB (local) | `better-sqlite3` (auto-created at `ooumph.db`) |
| LLM | Anthropic Claude via `@anthropic-ai/sdk` |
| Auth | HMAC-signed session cookies + AsyncLocalStorage credential isolation |
| Deploy | Vercel Hobby tier (daily crons only) |
| Cron | `vercel.json` schedules 12 jobs |

---

## Critical files (read these first)

| File | What it is |
|---|---|
| `lib/db.ts` | Unified `sql` template tag. Branches Postgres vs SQLite. All schema migrations live inline in here — 3 sections (PG inline, PG standalone, SQLite migrations array). Add new tables to ALL THREE. |
| `lib/auth.ts` | HMAC-SHA256 session token mint + verify. **AUTH_SECRET must be >=32 chars in production — boots fail loudly without it (Sprint 18A).** |
| `lib/guards.ts` | `assertWorkspaceOwnership`, `assertAgentRunQuota`, `assertArtifactApproved`, `assertSuperAdmin`, `requireRole` (hierarchical owner > admin > manager > analyst > viewer), `getSessionUserId`, `getSessionWorkspaceId`, `isSessionSuperAdmin`. **Defense-in-depth pattern: proxy checks cookie is signed; route checks the user is allowed.** |
| `lib/claude.ts` | `getClaudeClient(workspaceId?)` factory. Reads workspace-specific Anthropic key from encrypted `workspace_secrets` table; falls back to env. The default export `claude` is `@deprecated` — new callers must use the factory. |
| `lib/credential-context.ts` | AsyncLocalStorage-based request-scoped credential store. **Never mutate `process.env` from a route handler — use `withCredentials({ X: value }, () => fn())` instead.** Sprint 18I refactored 18 routes + 22 tools to this pattern to eliminate cross-tenant token races. |
| `lib/secrets.ts` | AES-256-GCM encryption-at-rest for BYOK keys. Use `setWorkspaceSecret(workspaceId, provider, plaintext)` and `getWorkspaceSecret(workspaceId, provider)`. |
| `lib/notifications.ts` | `notify*` helpers that honour `workspaces.extra_settings.notifications.inApp[key]` opt-out toggles. Helpers: `notifyLeadCaptured`, `notifyPublishSuccess`, `notifyPublishFailed`, `notifyNurtureReplyReceived`, `notifyOAuthExpiring`, `notifyAgentRunFailed`, `notifyBudgetAlert`. |
| `proxy.ts` | Next.js 16 edge middleware. Gates `/dashboard/*`, `/admin/*`, `/api/agents/**`, `/api/admin/**`, and ~15 other protected API prefixes. Forwards `x-session-user-id` and `x-session-workspace-id` headers to route handlers. |
| `vercel.json` | 12 daily cron schedules. **Hobby-tier compatible only.** When upgrading to Pro, restore from commit `e7211c7^` to get the original sub-daily schedules. |

---

## Routing map

```
app/
├── (public)
│   ├── page.tsx                  ← landing page
│   ├── login/                    ← signup + login
│   ├── lp/[id]/                  ← hosted landing pages
│   ├── f/[id]/                   ← public funnel forms
│   └── book/[workspaceId]/       ← booking widget
│
├── dashboard/                    ← user portal (54 pages)
│   ├── layout.tsx                ← sidebar + top nav + bell + activity feed
│   ├── page.tsx                  ← CMO console (home)
│   ├── inbox/                    ← unified inbox
│   ├── approvals/                ← HITL approval queue
│   ├── calendar/                 ← content calendar + scheduled posts
│   ├── agents/                   ← 17-agent registry view
│   ├── leads-crm/                ← CRM
│   ├── analytics/                ← reports + KPIs
│   ├── ads/                      ← paid ad campaign manager
│   ├── strategy/, research/, brand-monitor/, memory/, learning/    ← brand intelligence
│   ├── creative-studio/, blog/, image-gen/, video-gen/, voiceover/, repurpose/, media-library/   ← creative
│   ├── publishing/, email-marketing/, voice-ai/, pr/, reputation/  ← publishing + marketing
│   ├── leads/, funnel/, lead-magnets/, campaign/                   ← growth
│   ├── workflows/, ab-test/, experiments/, assets/                 ← automation
│   ├── billing/, integrations/, onboarding/                        ← account
│   ├── workspace/, health/, activity/                              ← system
│   ├── settings/, settings/security/, settings/connections/        ← settings
│   └── super-admin/              ← legacy admin (agencies/commissions/settings)
│
├── admin/                        ← super-admin portal (separate top-level route)
│   ├── layout.tsx                ← own sidebar, no user-dashboard chrome
│   ├── page.tsx                  ← Overview (stat cards + sparkline)
│   ├── users/                    ← user mgmt: search/paginate, toggle admin, suspend, bulk delete
│   ├── workspaces/               ← workspace mgmt: suspend, force re-onboard
│   ├── billing/                  ← MRR/ARR, plan breakdown, failed payments
│   ├── revenue/                  ← commission ledger (legacy, integrated)
│   ├── vendors/                  ← vendor list + impersonation (legacy, integrated)
│   ├── agents/                   ← cross-tenant agent run monitoring
│   ├── approvals/                ← cross-workspace pending queue + aging buckets
│   ├── system/                   ← cron table, DB row counts, env presence, error log
│   ├── audit/                    ← admin_audit_log viewer with filters
│   └── settings/                 ← maintenance mode + feature flags + env presence
│
└── api/                          ← ~140 route handlers
    ├── auth/{login,logout,me,signup}/
    ├── agents/                   ← 17-agent endpoints + supervisors
    ├── workspaces/, brand/, integrations/                          ← workspace config
    ├── approvals/, artifacts/, scheduled-content/                  ← content + HITL pipeline
    ├── publish/, publish/direct/                                   ← publishing
    ├── leads-captured/, segments/, workflows/                      ← CRM + automation
    ├── ad-campaigns/, ads/[id]/deploy/, ad-budget/                 ← paid ads
    ├── cron/                     ← 12 scheduled jobs (publish-scheduled, follower-sync, etc.)
    ├── webhooks/{stripe,meta,ghl,zapier,resend,twilio}/
    ├── admin/                    ← 9 new + 5 legacy admin endpoints
    └── ...
```

---

## Auth model (defense in depth)

1. **Edge proxy** (`proxy.ts`) — verifies session cookie HMAC at the edge for every `/dashboard/*`, `/admin/*`, and protected `/api/*` request. Forged cookie → 401. No cookie → redirect to `/login`.
2. **Route handlers** — call `assertWorkspaceOwnership(req, workspaceId)` or `assertSuperAdmin(req)` or `assertArtifactApproved(workspaceId, artifactId)` to enforce per-resource permissions.
3. **Quota gate** — `assertAgentRunQuota(req, workspaceId)` enforces plan-tier limits on agent runs.
4. **BYOK key isolation** — `withCredentials({...}, fn)` runs `fn` inside an AsyncLocalStorage scope so tools that call `getCredential('X')` read the request-scoped value instead of `process.env`. **No route handler ever mutates `process.env`.**

Super-admin is granted via:
- `users.is_admin = 1` in Postgres (column is INTEGER, but checks use `Number(v) === 1` for Neon driver tolerance — see Sprint 18R), OR
- `SUPER_ADMIN_EMAILS` env var (comma-separated allowlist), OR
- `x-admin-secret` header matching `ADMIN_SECRET` env var (for CI/cron only — never use in browser code)

---

## Local dev

```bash
# Clone + install
git clone https://github.com/prashant-51-wq/ooumph-mvp.git
cd ooumph-mvp
git checkout sprint-1-honest-mvp
npm install

# Minimum env for boot
echo 'AUTH_SECRET=any-32-char-or-longer-random-string-here-pad' > .env.local
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env.local
# POSTGRES_URL is optional locally — SQLite auto-init at ./ooumph.db

# Dev server
npm run dev      # http://localhost:3000

# Type-check
npx tsc --noEmit
```

To pull the actual production env into your local checkout (NOT for committing):
```bash
npx vercel env pull .env.production.local --environment=production --yes
# delete the file when done — it contains live secrets
```

---

## Deploy

```bash
npx vercel --prod --yes
```

The Vercel project is already linked (`.vercel/project.json` is gitignored). Deploys from local working tree, not GitHub — so push your commits separately:

```bash
git push origin sprint-1-honest-mvp
```

GitHub PR #1 auto-updates with each push.

---

## Postgres ad-hoc access

Use this script pattern when you need to query/mutate production data directly. The codebase uses `@neondatabase/serverless`.

```js
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.production.local', 'utf8');
const pgUrl = env.match(/^POSTGRES_URL=\"?([^\"\n]+)\"?/m)?.[1];
const { neon } = require('@neondatabase/serverless');
const sql = neon(pgUrl);
(async () => {
  const rows = await sql\`SELECT id, email, is_admin FROM users LIMIT 10\`;
  console.table(rows);
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

After: `rm .env.production.local` (it contains live secrets — never commit).

---

## Vercel env vars currently set (production)

| Category | Vars | Status |
|---|---|---|
| Core | `AUTH_SECRET`, `POSTGRES_URL` (+ Neon's full set), `ADMIN_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL` | real values |
| AI | `ANTHROPIC_API_KEY` | real |
| Email | `RESEND_API_KEY` | real |
| Super-admin allowlist | `SUPER_ADMIN_EMAILS` | set to 5 known admins |
| Integration keys | `ELEVENLABS_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `BRAVE_SEARCH_API_KEY`, `FIRECRAWL_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `CLOUDINARY_*`, `APOLLO_API_KEY`, `HUNTER_API_KEY`, `META_APP_SECRET`, `GHL_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `BUFFER_ACCESS_TOKEN`, `CALCOM_API_KEY`, `TALLY_API_KEY`, `GA4_*`, `HUBSPOT_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN` | all set to `demo_placeholder_not_active` — UI shows them as "configured" but real API calls 401 |

To activate any integration for real, replace its dummy value in Vercel project settings.

---

## Patterns you must follow

### Adding a new route handler

```ts
// app/api/your/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'   // if it's an agent
import { withCredentials } from '@/lib/credential-context'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { workspaceId, ...body } = await req.json()
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied
  const overQuota = await assertAgentRunQuota(req, workspaceId)
  if (overQuota) return overQuota

  // If you need a workspace-scoped credential:
  const ws = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
  const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

  return withCredentials(
    { SOME_PROVIDER_API_KEY: settings.someProviderKey },
    async () => {
      // tool calls inside read via getCredential('SOME_PROVIDER_API_KEY')
      // ...
      return NextResponse.json({ ok: true })
    }
  )
}
```

### Adding a new schema column / table

In `lib/db.ts`, add the migration to ALL THREE sections:
1. The inline PG init block (~line 137 area — uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
2. The SQLite migrations array (~line 1279 — uses bare `ALTER TABLE ... ADD COLUMN`; the loop swallows duplicate-column errors)
3. The standalone `initializeDatabase()` PG block (~line 1714)

### Adding a new admin page

Create at `app/admin/<section>/page.tsx`. Add nav entry to `app/admin/layout.tsx`'s `ADMIN_NAV` array. Backing API route at `app/api/admin/<section>/route.ts` must call `await assertSuperAdmin(req)` first.

---

## Hobby-tier limitations

`vercel.json` cron schedules are downgraded to daily because Hobby tier rejects sub-daily crons. **Affected**:

| Cron | Was | Now |
|---|---|---|
| `/api/cron/publish-scheduled` | every 15 min | daily at 06:00 UTC |
| `/api/cron/workflow-steps` | every 15 min | daily at 07:00 UTC |
| `/api/cron/auto-approve` | hourly | daily at 09:00 UTC |
| `/api/cron/agent-run-watchdog` | every 15 min | daily at 10:00 UTC |
| `/api/cron/follower-sync` | every 6 hr | daily at 00:00 UTC |
| `/api/cron/oauth-health-check` | every 6 hr | daily at 05:00 UTC |

When upgrading to Pro, `git show e7211c7^:vercel.json` has the original sub-daily schedules.

---

## Sprint history (key milestones)

| Sprint | What |
|---|---|
| 1–14 | Initial MVP build, OAuth integrations, audits 1–3 |
| 15 | Approval/creative handoffs, notification producers, segment CRUD |
| 16 | Schema bumps (funnels, ad objective, ICP, audit trail), HITL gate, requireRole |
| 17 | Form builder, lead magnets, workflow enrolment, multi-platform sync, P2 sweep |
| **18A** | 7 P0 quick wins (ownership gates, AUTH_SECRET boot-fail, health gate, bell icons, deep links, race fixes) |
| **18B** | BYOK encryption — `getClaudeClient(workspaceId)` factory, keys routed through AES-GCM `workspace_secrets` |
| **18C** | CRM pagination + bulk actions + segments full-rule |
| **18D** | CMO funnel decomposition + Meta v18 OUTCOME enums + agents real registry |
| **18E** | Stripe idempotency, notification opt-outs, workflow dedup, media dual-write |
| **18F** | Approvals pagination + onboarding follower-growth goal |
| **18G** | Calendar fan-out workspace timezone |
| **18H** | `notifyAgentRunFailed` + `notifyBudgetAlert` helpers wired |
| **18I** | **`process.env` mutation refactor** — 18 routes + 22 tools moved to `withCredentials` (eliminated cross-tenant token race) |
| **18J** | Auth + HITL gates on ad agents + `/api/publish` + Meta webhook HMAC + GHL bypass closed + Zapier auth + admin URL-secret removal |
| **18K** | SQL composition bugs, approvals index, `lead_activities.ghl_contact_id` indexed column, requireRole logging |
| **18L** | P2 sweep (ILIKE, auto-publish notifications, claude.ts deprecation) |
| **18M** | Deploy fixes (middleware.ts removal, duplicate /lp route, Suspense wrap, Hobby cron) |
| **18N+** | Onboarding loop fix + `/api/auth/me` auto-heal for pre-bug timestamps |
| **18O** | Responsive grid breakpoints across 8 main pages |
| **18P** | 30 dummy integration keys set in Vercel env |
| **18Q** | **Admin panel** — 10 pages + 9 API routes + `admin_audit_log` table |
| **18R** | Coercion-tolerant `is_admin` check (Neon may return string `'1'`) |
| **18S** | Proxy admin gate now accepts session cookies (was header-only) |
| **18T** | Admin moved to separate `/admin/*` portal (own layout, not nested in `/dashboard`) |

Audit passes #1–6 are all closed. Codebase is at the end of no-keys-needed work.

---

## What's left / open items

These are below the line of "needs another audit pass to find" but known:

1. **OAuth connect flows for Instagram + Facebook**. LinkedIn / Twitter / WordPress have OAuth buttons; Instagram / Facebook are paste-token only because Meta Business Login requires per-app dev portal setup (one-time on the platform side). When you do that setup, add `META_APP_ID`, `META_APP_SECRET` (real), `META_REDIRECT_URI` to Vercel env and wire up `/api/integrations/oauth/meta/connect`.
2. **Stripe + ad-platform integrations are stubbed.** Keys set to `demo_placeholder_not_active`. Real API calls return 401. Replace with real keys to activate.
3. **Hobby-tier cron schedule**. Upgrade to Pro + restore sub-daily schedules from git history (see "Hobby-tier limitations" above).
4. **`media_assets` archive sink** — `log-sweeper` has `archiveSink: null` for every stream. When you grow into archive-before-delete, populate the sink table names.
5. **`stripe_webhook_events` TTL** — no cleanup yet. Won't matter until ~1M events.
6. **Audit pass #7** — last one was pass #6 (closed in Sprint 18I–L). Each pass historically finds ~20 issues the previous one missed. If you've made non-trivial changes, run another pass.

---

## Audit-pass playbook

If you're asked to find bugs, follow this pattern (proved out across 6 passes):

1. **Read these first**: `lib/db.ts`, `lib/guards.ts`, `proxy.ts`, `lib/claude.ts`, `lib/credential-context.ts`, `lib/notifications.ts`.
2. **Hunt for**:
   - Routes missing `assertWorkspaceOwnership` / `assertSuperAdmin` / `assertArtifactApproved` / `assertAgentRunQuota`
   - `process.env.X = settings.X` mutations (banned — use `withCredentials`)
   - Cross-workspace data leaks (queries without `workspace_id =` filter)
   - Schema mismatches (INSERT columns that don't exist in `lib/db.ts`)
   - `runtime = 'edge'` on routes that use Node-only APIs
   - `useSearchParams` without `<Suspense>` wrapper
   - INTEGER columns checked with `=== 1` (use `Number(v) === 1` — Neon driver)
   - Webhook routes without signature verification
   - SQL composition with nested `sql\`\`` tags (broken — branch into two statements)
   - JSON `metadata_json LIKE '%...%'` scans (replace with indexed columns)
   - Pagination missing on list endpoints
3. **Severity**: P0 = ship-blocker (cross-tenant leak, auth bypass, data loss), P1 = important (schema bugs, missing indexes), P2 = cleanup (cosmetic, perf, doc).
4. **Report format**: bullet list grouped by severity, each item: `[path:line] one-sentence description (fix: ...)`.

---

## Test accounts (demo mode)

All 5 existing users have `is_admin = 1` and are in `SUPER_ADMIN_EMAILS`:

- `prashant.mishra@ooumph.com`
- `judgeprashant@gmail.com`
- `praveen@ooumph.com`
- `praveen.agrawal@ooumph.com`
- `praveen.mishra@ooumph.com`

To take over the platform you'd sign up via the live site, then either (a) add yourself to `SUPER_ADMIN_EMAILS`, or (b) flip `users.is_admin = 1` for your row via the Postgres ad-hoc script above.

---

## Conventions

- Commit messages: `Sprint <ID>: <short description>` then a multi-line body. Co-author line: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Branch: keep work on `sprint-1-honest-mvp` (PR #1). Don't open a new branch unless explicitly told.
- File endings: LF in repo, Git converts to CRLF on Windows checkout (warnings during `git add` are normal).
- Dark theme only. Tailwind classes: `bg-gray-950` background, `bg-gray-900` cards, `border-gray-800` borders, `text-white` primary, `text-gray-400` muted, `indigo-600` accent.
- Use lucide-react icons. Emoji icons only in nav labels and notification toasts.
- Never create new markdown docs unless explicitly requested.

---

## Diagnostics cheat sheet

If something breaks in production and you can't reproduce it locally, the most useful diagnostics are:

1. `npx vercel inspect <deployment-url> --logs` — full build + runtime logs
2. `curl -i https://ooumph-mvp.vercel.app/api/<route>` — quick HTTP probe
3. Postgres ad-hoc script (see above) — direct DB state inspection
4. Browser DevTools → Network tab → find the failing fetch → check status + body

Most "weird" bugs trace back to either (a) the Neon driver returning a string where you expected a number, (b) the edge proxy gating a route before it reaches the handler, or (c) browser/CDN cache lag after a deploy.

Happy shipping.
