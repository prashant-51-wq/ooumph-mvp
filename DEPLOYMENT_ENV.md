# Production Environment Variables — Deployment Checklist

Run `npx vercel env add <NAME> production` for each. Re-deploy after adding so
the new values get baked into the runtime.

## 🚨 Critical (deployment is unsafe without these)

| Variable | Purpose | How to generate |
|---|---|---|
| `AUTH_SECRET` | Signing key for session cookies (HMAC SHA-256). The current dev default `'ooumph-dev-secret-change-in-production'` is **publicly known** and makes session tokens forgeable. | `openssl rand -hex 32` |
| `NEXT_PUBLIC_BASE_URL` | Self-referencing base URL used when CMO orchestrator dispatches sub-agents server-to-server, plus workflow + booking links. | Your production URL, e.g. `https://ooumph-mvp.vercel.app` |
| `POSTGRES_URL` | Neon connection string. Already configured ✅ | — |
| `ANTHROPIC_API_KEY` | Claude calls (CMO, Strategy, all agents). Already configured ✅ | — |

## 🛡 Strongly recommended (Step 7 safety + ops)

| Variable | Purpose | Notes |
|---|---|---|
| `ADMIN_SECRET` | Server-to-server bypass for CMO → sub-agent calls (`x-internal-secret` header); also unlocks `/api/admin/*` routes for ops scripts | `openssl rand -hex 32`. Different from AUTH_SECRET. |
| `CRON_SECRET` | Auth for all `/api/cron/*` routes (publish scheduler, workflow steps, calendar reminders, KPI alerts) | `openssl rand -hex 32`. Add to Vercel Cron header config. |
| `SUPER_ADMIN_EMAILS` | Comma-separated list of emails that get `/dashboard/super-admin` access | e.g. `prashant@ooumph.com,ops@ooumph.com` |
| `RESEND_FROM_EMAIL` | Default `From:` address for transactional + workflow emails | Default: `noreply@ooumph.ai` |

## 🎬 Feature flags (without these, the feature falls back to BYOK or fails)

| Variable | Feature | Without it |
|---|---|---|
| `OPENAI_API_KEY` | Image Studio (DALL-E 3), Whisper transcribe, image-gen tool | Image generation requires workspace BYOK |
| `RUNWAY_API_KEY` | Video Studio (text-to-video) | Video generation requires workspace BYOK |
| `ELEVENLABS_API_KEY` | Voiceover Studio | Voiceover requires workspace BYOK |
| `HEYGEN_API_KEY` | AI Avatar Video | HeyGen agent disabled |
| `VAPI_API_KEY` | Outbound AI voice calls | Voice AI disabled |
| `DEEPGRAM_API_KEY` | Transcription fallback | Transcribe agent disabled |
| `STABILITY_API_KEY` | Stable Diffusion image gen | Falls back to OpenAI |
| `REPLICATE_API_TOKEN` | Open-source models | Replicate agent disabled |
| `FIRECRAWL_API_KEY` | Strategy agent's competitor scrape | Strategy uses search results only |
| `BRAVE_SEARCH_API_KEY` | Research + Strategy market data | Agents fall back to Claude knowledge |
| `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Image hosting + CDN | Generated images stay as base64 / blob URLs |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Billing checkout + portal | Billing page upgrade buttons fail |
| `SLACK_WEBHOOK_URL` | Workflow `notify` node Slack channel | Falls back to in-app notification only |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot CRM sync | Lead sync disabled unless workspace BYOK |
| `LINKEDIN_ADS_ACCESS_TOKEN` + `LINKEDIN_ADS_ACCOUNT_ID` | LinkedIn Ads campaign sync | LinkedIn Ads disabled |
| `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` | Meta Ads campaign sync | Meta Ads disabled |
| `GOOGLE_ADS_DEVELOPER_TOKEN` + `GOOGLE_ADS_CUSTOMER_ID` | Google Ads campaign sync | Google Ads disabled |
| `YOUTUBE_API_KEY` | YouTube publishing | YouTube publish disabled |
| `TWITTER_BEARER_TOKEN` | Twitter read-only API | Twitter polling disabled (publishing still works via per-workspace OAuth) |
| `APOLLO_API_KEY`, `HUNTER_API_KEY` | Lead enrichment | Lead enrichment falls back to manual entry |
| `MAILCHIMP_API_KEY` + `MAILCHIMP_SERVER` | Mailchimp email | Falls back to Brevo if configured |
| `BREVO_API_KEY` + `BREVO_FROM_EMAIL` | Brevo email | Falls back to Mailchimp if configured |
| `GROQ_API_KEY` | Groq inference | Falls back to Claude |
| `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` | Gemini | Falls back to Claude |
| `KLING_API_KEY` | Kling video | Falls back to Runway |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` | Stock image search | Stock search disabled |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Razorpay (India payments) | Razorpay agent disabled |
| `R2_*` (Cloudflare R2) | Object storage | Falls back to Cloudinary if configured |

## 📋 Adding the criticals now

```bash
# Critical — security
openssl rand -hex 32 | npx vercel env add AUTH_SECRET production

# Critical — self-reference URL
npx vercel env add NEXT_PUBLIC_BASE_URL production
# → enter: https://ooumph-mvp.vercel.app

# Strongly recommended
openssl rand -hex 32 | npx vercel env add ADMIN_SECRET production
openssl rand -hex 32 | npx vercel env add CRON_SECRET production
npx vercel env add SUPER_ADMIN_EMAILS production
# → enter: your-email@example.com (comma-separated for multiple)

# Then redeploy:
npx vercel --prod
```

## DB Schema Sync

`lib/db.ts` runs the auto-migration block on first call to any route. New
tables and columns (`agent_run_events`, `agent_runs.parent_run_id`,
`workspace_secrets`, `notifications`, `agent_configs`, `ab_tests`,
`ab_test_insights`, `approvals.brand_voice_score`,
`approvals.brand_voice_reasoning`) all use `IF NOT EXISTS` clauses on Neon
Postgres, so first-touch will quietly add anything missing. No manual
migration step needed.

**Verification after deploy:**
```bash
# Visit the health page — it counts rows in every safety-relevant table.
# All "Database" checks should show OK with their row counts.
open https://ooumph-mvp.vercel.app/dashboard/health
```

## Vercel Plan Constraint

The streaming agent routes declare `export const maxDuration = 300` (5 min).
This is correct for **Vercel Pro** which allows up to 800s on Node functions.

On **Vercel Hobby** (free), the platform hard-caps Node functions at **60s
regardless of `maxDuration`**. Practical implications:

| Agent flow | Typical runtime | Hobby (60s cap) | Pro (300s cap) |
|---|---|---|---|
| CMO chat | 3-6s | ✅ Safe | ✅ Safe |
| CMO execute → strategy | 25-45s | ⚠️ Tight on cold start | ✅ Safe |
| Strategy with Firecrawl scrape | 35-70s | 🚨 May hit cap mid-run | ✅ Safe |
| Image generation (DALL-E 3) | 8-15s | ✅ Safe | ✅ Safe |
| Video generation (Runway polling) | 30-180s | 🚨 Will fail on long videos | ✅ Safe |
| Voiceover (ElevenLabs) | 3-8s | ✅ Safe | ✅ Safe |

**If you stay on Hobby:** the safety invariant still holds — Vercel kills
the function before `after()` finishes, so the artifact + approval may not
land in DB for runs that exceed 60s. The UI shows "stream cancelled" and the
user can re-trigger. No partial sends to customers — the approval gate
prevents that regardless.

**If you upgrade to Pro:** the `after()` lifetime guarantee fully holds.
Strategy + video runs that exceed 60s complete cleanly even with client
disconnects.

For risk mitigation on Hobby, consider:
1. Disabling Firecrawl scrape in Strategy (drop `FIRECRAWL_API_KEY` and the
   agent falls back to search-only).
2. Switching Video Studio default to "5s clips" (Runway is faster on short).
3. Watching `/dashboard/health` for `agent_runs` rows stuck in `running`.
