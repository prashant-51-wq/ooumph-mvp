/**
 * Unified DB adapter — zero-config SQLite locally, Postgres in production.
 * Auto-initializes SQLite on first use. Swap to Postgres by setting POSTGRES_URL.
 */

import path from 'path'
import crypto from 'crypto'

export function newId(): string {
  return crypto.randomUUID()
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function parseJsonFields(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('[') || val.startsWith('"'))) {
      try { result[key] = JSON.parse(val) } catch { result[key] = val }
    } else {
      result[key] = val
    }
  }
  return result
}

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return JSON.stringify(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

// ─── SQLite adapter ───────────────────────────────────────────────────────────

let _sqliteDb: import('better-sqlite3').Database | null = null
let _initialized = false

function getDb() {
  if (!_sqliteDb) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    _sqliteDb = new Database(path.join(process.cwd(), 'ooumph.db')) as import('better-sqlite3').Database
    _sqliteDb.pragma('journal_mode = WAL')
    _sqliteDb.pragma('foreign_keys = ON')
  }
  if (!_initialized) {
    _initialized = true
    initSQLiteSync(_sqliteDb!)
  }
  return _sqliteDb!
}

function pgToSqlite(query: string): string {
  let i = 0
  return query.replace(/\$\d+/g, () => { i++; return '?' })
}

async function sqliteQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const db = getDb()
  const raw = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '')
  const query = pgToSqlite(raw.trim())
  const flat = values.map(serializeValue)

  if (/^\s*(SELECT|WITH)/i.test(query) || /RETURNING/i.test(query)) {
    const rows = (db.prepare(query).all(...flat) as Record<string, unknown>[]).map(parseJsonFields)
    return { rows }
  }
  db.prepare(query).run(...flat)
  return { rows: [] }
}

// ─── Neon/Postgres adapter ────────────────────────────────────────────────────

let _pgInitialized = false
// Reset on module reload in development so schema changes apply immediately
if (process.env.NODE_ENV === 'development') _pgInitialized = false

async function postgresQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const { neon } = await import('@neondatabase/serverless')
  const pgSql = neon(process.env.POSTGRES_URL!)

  if (!_pgInitialized) {
    _pgInitialized = true
    await pgSql`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name VARCHAR(255) NOT NULL, industry VARCHAR(255), website VARCHAR(500), owner_email VARCHAR(255) NOT NULL, status VARCHAR(50) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS brand_profiles (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), business_name VARCHAR(255), tagline TEXT, offer TEXT, unique_value TEXT, target_audience TEXT, tone VARCHAR(255), competitors TEXT, channels TEXT, goals TEXT, monthly_budget VARCHAR(100), prohibited_claims TEXT, approval_email VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), agent_name VARCHAR(100) NOT NULL, status VARCHAR(50) DEFAULT 'pending', input_json TEXT, output_json TEXT, cost_estimate DECIMAL(10,4), error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
    await pgSql`CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), agent_run_id TEXT REFERENCES agent_runs(id), type VARCHAR(100) NOT NULL, title VARCHAR(500) NOT NULL, content_json TEXT NOT NULL, status VARCHAR(50) DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), artifact_id TEXT REFERENCES artifacts(id), status VARCHAR(50) DEFAULT 'pending', approver_email VARCHAR(255), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS learning_notes (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), source_type VARCHAR(100), source_id TEXT, note TEXT NOT NULL, confidence DECIMAL(3,2) DEFAULT 0.8, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, access_token TEXT, account_id TEXT, status VARCHAR(50) DEFAULT 'active', connected_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS publish_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, platform VARCHAR(50) NOT NULL, post_id TEXT, post_url TEXT, status VARCHAR(50) DEFAULT 'published', published_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS creative_requests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, requesting_agent VARCHAR(100) NOT NULL, creative_type VARCHAR(100) NOT NULL, context_json TEXT, priority VARCHAR(20) DEFAULT 'normal', status VARCHAR(50) DEFAULT 'pending', artifact_id TEXT, publish_platforms TEXT, error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
    await pgSql`CREATE TABLE IF NOT EXISTS campaign_platform_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, platform_campaign_id TEXT NOT NULL, platform_adset_ids TEXT DEFAULT '[]', platform_ad_ids TEXT DEFAULT '[]', status VARCHAR(50) DEFAULT 'active', error_message TEXT, last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS campaign_performance (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, platform_campaign_id TEXT, date TEXT NOT NULL, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, spend DECIMAL(12,4) DEFAULT 0, conversions INTEGER DEFAULT 0, revenue DECIMAL(12,4) DEFAULT 0, ctr DECIMAL(8,6) DEFAULT 0, cpc DECIMAL(10,4) DEFAULT 0, cpa DECIMAL(10,4) DEFAULT 0, roas DECIMAL(8,4) DEFAULT 0, additional_metrics TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS campaign_optimizations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, report_json TEXT NOT NULL, health_score INTEGER DEFAULT 0, overall_health VARCHAR(30), created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS scheduled_posts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, content_json TEXT NOT NULL, artifact_id TEXT, scheduled_time TIMESTAMPTZ NOT NULL, status VARCHAR(50) DEFAULT 'queued', error TEXT, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS kpi_targets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, targets_json TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS leads_captured (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, email VARCHAR(255), phone VARCHAR(50), source VARCHAR(100) DEFAULT 'manual', campaign TEXT, status VARCHAR(50) DEFAULT 'new', score INTEGER DEFAULT 0, notes TEXT, custom_fields TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS email_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name VARCHAR(255) NOT NULL, subject TEXT, status VARCHAR(50) DEFAULT 'draft', recipient_count INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, open_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0, content_json TEXT DEFAULT '{}', sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS email_subscribers (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email VARCHAR(255) NOT NULL, name TEXT, status VARCHAR(50) DEFAULT 'subscribed', tags TEXT DEFAULT '[]', subscribed_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata TEXT`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id TEXT`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS model_settings TEXT DEFAULT '{}'`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS extra_settings TEXT DEFAULT '{}'`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS hubspot_id TEXT`
    await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS brand_voice_score INTEGER`
    await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS brand_voice_reasoning TEXT`
    // Audit pass #6 P1: composite index for paginated approvals UI fetch and
    // hourly auto-approve cron. Both filter (workspace_id, status) and order
    // by created_at DESC.
    await pgSql`CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status_created ON approvals(workspace_id, status, created_at DESC)`
    await pgSql`CREATE TABLE IF NOT EXISTS brand_memory (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'learning_note', platform TEXT, performance_score INTEGER DEFAULT 0, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_memory_workspace ON brand_memory(workspace_id)`
    await pgSql`CREATE TABLE IF NOT EXISTS scheduled_content (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform TEXT NOT NULL, content TEXT NOT NULL, media_urls TEXT DEFAULT '[]', artifact_id TEXT, scheduled_for TEXT, buffer_update_id TEXT, status TEXT NOT NULL DEFAULT 'pending', error_message TEXT, published_at TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS published_content (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, platform TEXT NOT NULL, post_id TEXT, post_url TEXT, title TEXT, published_at TIMESTAMPTZ DEFAULT NOW(), metadata_json TEXT DEFAULT '{}')`
    await pgSql`CREATE TABLE IF NOT EXISTS inbox_conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_email TEXT, contact_name TEXT, contact_phone TEXT, channel TEXT NOT NULL DEFAULT 'email', subject TEXT, status TEXT DEFAULT 'open', tags TEXT DEFAULT '[]', assigned_to TEXT, last_message_at TIMESTAMPTZ, unread_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS inbox_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, workspace_id TEXT NOT NULL, direction TEXT NOT NULL, from_address TEXT, to_address TEXT, subject TEXT, body TEXT NOT NULL, html_body TEXT, channel TEXT DEFAULT 'email', status TEXT DEFAULT 'sent', external_id TEXT, ai_generated INTEGER DEFAULT 0, sent_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT, title TEXT NOT NULL, description TEXT, start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, timezone TEXT DEFAULT 'UTC', status TEXT DEFAULT 'confirmed', meeting_url TEXT, calendar_event_id TEXT, reminder_sent INTEGER DEFAULT 0, notes TEXT, source TEXT DEFAULT 'manual', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS calendar_availability (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, days_of_week TEXT DEFAULT '[1,2,3,4,5]', start_hour INTEGER DEFAULT 9, end_hour INTEGER DEFAULT 17, slot_minutes INTEGER DEFAULT 30, timezone TEXT DEFAULT 'UTC', buffer_minutes INTEGER DEFAULT 10, advance_days INTEGER DEFAULT 14, updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS lead_activities (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC)`
    // Audit pass #6 P1: dedicated indexed column to replace metadata_json LIKE
    // scans on the GHL webhook hot path. Lookup is (workspace_id, ghl_contact_id).
    await pgSql`ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_ghl_contact ON lead_activities(workspace_id, ghl_contact_id)`
    await pgSql`CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, trigger_type TEXT NOT NULL, trigger_config TEXT DEFAULT '{}', nodes TEXT NOT NULL DEFAULT '[]', status TEXT DEFAULT 'draft', run_count INTEGER DEFAULT 0, last_run_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_id TEXT, contact_email TEXT, trigger_data TEXT DEFAULT '{}', status TEXT DEFAULT 'running', current_node INTEGER DEFAULT 0, nodes_completed TEXT DEFAULT '[]', error_message TEXT, started_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
    await pgSql`CREATE TABLE IF NOT EXISTS workflow_pending_steps (id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, node_index INTEGER NOT NULL, node_data TEXT NOT NULL, lead_id TEXT, contact_email TEXT, scheduled_for TIMESTAMPTZ NOT NULL, status TEXT DEFAULT 'pending', error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_pending_steps_scheduled ON workflow_pending_steps(scheduled_for, status)`
    await pgSql`CREATE TABLE IF NOT EXISTS reputation_reviews (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, source TEXT NOT NULL DEFAULT 'manual', rating INTEGER, title TEXT, body TEXT, sentiment TEXT DEFAULT 'neutral', status TEXT DEFAULT 'new', response_text TEXT, response_sent_at TIMESTAMPTZ, external_id TEXT, external_url TEXT, booking_id TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS reputation_requests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT NOT NULL, booking_id TEXT, status TEXT DEFAULT 'pending', sent_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ, review_platform TEXT DEFAULT 'google', review_link TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_reputation_reviews_workspace ON reputation_reviews(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_reputation_requests_workspace ON reputation_requests(workspace_id, created_at DESC)`
    await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id TEXT`
    await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended INTEGER DEFAULT 0`
    // /dashboard/admin panel — append-only audit trail for every super-admin action
    await pgSql`CREATE TABLE IF NOT EXISTS admin_audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_email TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, details_json TEXT, ip_address TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC)`
    await pgSql`CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, price_monthly INTEGER NOT NULL, price_yearly INTEGER, stripe_price_id TEXT, stripe_price_id_yearly TEXT, commission_rate REAL DEFAULT 0.15, max_sub_accounts INTEGER DEFAULT 0, max_ai_runs_monthly INTEGER DEFAULT 500, features TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT 'trialing', current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ, cancel_at_period_end INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS vendor_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, stripe_connect_account_id TEXT, stripe_connect_status TEXT DEFAULT 'not_connected', commission_rate_override REAL, white_label_name TEXT, white_label_logo_url TEXT, white_label_primary_color TEXT DEFAULT '#4F46E5', white_label_domain TEXT, is_approved INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS client_accounts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_workspace_id TEXT, client_name TEXT NOT NULL, client_email TEXT NOT NULL, price_monthly INTEGER NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT 'trial', trial_ends_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS commission_ledger (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_account_id TEXT, gross_amount INTEGER NOT NULL, commission_rate REAL NOT NULL, commission_amount INTEGER NOT NULL, net_amount INTEGER NOT NULL, stripe_payment_intent_id TEXT, stripe_transfer_id TEXT, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_commission_ledger_vendor ON commission_ledger(vendor_workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_client_accounts_vendor ON client_accounts(vendor_workspace_id)`
    await pgSql`CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role VARCHAR(50) DEFAULT 'member', invited_by TEXT, joined_at TIMESTAMPTZ DEFAULT NOW(), status VARCHAR(50) DEFAULT 'active')`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_unique ON workspace_members(workspace_id, user_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`
    await pgSql`CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'member', token TEXT NOT NULL UNIQUE, status VARCHAR(50) DEFAULT 'pending', invited_by TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id)`
    await pgSql`CREATE TABLE IF NOT EXISTS sales_deals (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT, contact_name TEXT NOT NULL, contact_email TEXT, company TEXT, title TEXT NOT NULL, value REAL DEFAULT 0, currency VARCHAR(10) DEFAULT 'USD', stage VARCHAR(50) DEFAULT 'prospect', probability INTEGER DEFAULT 10, expected_close TEXT, actual_close TEXT, notes TEXT, source TEXT, custom_fields TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_sales_deals_workspace ON sales_deals(workspace_id, stage)`
    // Sprint 6E: Lost-reason capture for sales_deals (analytics + retro).
    // Lets the CRM Kanban prompt for "why did we lose this?" when a deal
    // moves to Closed Lost — feeds future win/loss analysis.
    await pgSql`ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS lost_reason TEXT`
    await pgSql`ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ`
    // Sprint 6G: per-post organic engagement. Populated by future platform
    // sync workers (LinkedIn Insights, Twitter Analytics, etc.). The
    // /api/analytics/posts endpoint joins this with publish_log + artifacts
    // so Top Performing Content can sort by real engagement, not recency.
    await pgSql`CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, post_id TEXT, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, video_views INTEGER DEFAULT 0, last_synced_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_unique ON post_metrics(artifact_id, platform)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_post_metrics_workspace ON post_metrics(workspace_id, last_synced_at DESC)`
    // Sprint 7C: real session tracking + login event history. Replaces the
    // hardcoded session/login arrays on /dashboard/settings/security. Each
    // successful login inserts a user_sessions row (token_hash = sha256(JWT))
    // and a login_events row. Revoke = set revoked_at. Login history table
    // also records failed attempts so the operator can spot abuse.
    await pgSql`CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, token_hash TEXT NOT NULL UNIQUE, user_agent TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), last_seen_at TIMESTAMPTZ DEFAULT NOW(), revoked_at TIMESTAMPTZ)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)`
    await pgSql`CREATE TABLE IF NOT EXISTS login_events (id TEXT PRIMARY KEY, user_id TEXT, email_attempted TEXT, ip TEXT, user_agent TEXT, success INTEGER DEFAULT 0, failure_reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC)`
    // Sprint 7D: manual + Stripe payout ledger. Until Stripe Connect
    // payouts are wired, super-admin "Mark Paid" inserts a row here with
    // payment_method='manual'. commission balance on /super-admin =
    // SUM(commission_ledger.commission_amount) - SUM(commission_payouts.amount_cents)
    // for each vendor. stripe_transfer_id populated only when the real
    // Stripe path lands.
    await pgSql`CREATE TABLE IF NOT EXISTS commission_payouts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, paid_at TIMESTAMPTZ DEFAULT NOW(), notes TEXT, paid_by_user_id TEXT, payment_method VARCHAR(20) DEFAULT 'manual', stripe_transfer_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_commission_payouts_vendor ON commission_payouts(vendor_workspace_id, paid_at DESC)`
    // Sprint 9B: encrypt-at-rest for integration access tokens. AES-256-GCM
    // via lib/secrets.ts. New writes go into encrypted_access_token;
    // legacy rows continue to use access_token (plaintext) until they're
    // re-saved. The shared lib/integrations.ts:readAccessToken() helper
    // hides the difference from readers.
    await pgSql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT`
    // Sprint 13A: human-readable slugs for hosted landing pages. Allows
    // /lp/acme-launch instead of /lp/<uuid>. NULL on artifacts that
    // aren't landing pages or haven't had a slug set. Unique enforced
    // at the column level so two LPs can't claim the same URL.
    await pgSql`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS lp_slug VARCHAR(128)`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_lp_slug ON artifacts(lp_slug) WHERE lp_slug IS NOT NULL`
    // === Phase Remediation tables (Postgres first-call init) ===
    await pgSql`CREATE TABLE IF NOT EXISTS workspace_secrets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider VARCHAR(50) NOT NULL, encrypted_value TEXT NOT NULL, label TEXT, status TEXT DEFAULT 'active', last_tested_at TIMESTAMPTZ, test_result TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_secrets_unique ON workspace_secrets(workspace_id, provider)`
    await pgSql`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT, type VARCHAR(50) NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, severity TEXT DEFAULT 'info', read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, read_at, created_at DESC)`
    await pgSql`CREATE TABLE IF NOT EXISTS agent_configs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, agent_slug VARCHAR(100) NOT NULL, model TEXT, instructions TEXT, tone TEXT, max_tasks_per_day INTEGER DEFAULT 100, priority TEXT DEFAULT 'normal', allowed_tools TEXT DEFAULT '[]', use_byok INTEGER DEFAULT 1, schedule TEXT DEFAULT 'always', daily_cost_cap DECIMAL(10,2) DEFAULT 50, escalate_to TEXT, status TEXT DEFAULT 'active', updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_unique ON agent_configs(workspace_id, agent_slug)`
    await pgSql`CREATE TABLE IF NOT EXISTS ab_tests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, content_type TEXT, goal_metric TEXT, duration INTEGER DEFAULT 7, status TEXT DEFAULT 'Running', variant_a TEXT NOT NULL, variant_b TEXT NOT NULL, variant_a_stats TEXT DEFAULT '{}', variant_b_stats TEXT DEFAULT '{}', winner TEXT, confidence INTEGER DEFAULT 0, ai_insight TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_ab_tests_workspace ON ab_tests(workspace_id, status)`
    await pgSql`CREATE TABLE IF NOT EXISTS ab_test_insights (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_test_id TEXT, text TEXT NOT NULL, lift REAL DEFAULT 0, deployed INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_ab_test_insights_workspace ON ab_test_insights(workspace_id, created_at DESC)`
    // === Streaming agent runs (Step 1 of Agent Console redesign) ===
    await pgSql`CREATE TABLE IF NOT EXISTS agent_run_events (id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL, workspace_id TEXT NOT NULL, event_type VARCHAR(50) NOT NULL, payload TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(agent_run_id, created_at ASC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_agent_run_events_workspace ON agent_run_events(workspace_id, created_at DESC)`
    await pgSql`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS parent_run_id TEXT`
    // === Strategy decomposition tasks ===
    await pgSql`CREATE TABLE IF NOT EXISTS project_tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, initiative_run_id TEXT NOT NULL, parent_artifact_id TEXT NOT NULL, task_index INTEGER NOT NULL DEFAULT 0, agent VARCHAR(100) NOT NULL, task_type VARCHAR(100) NOT NULL, task_brief TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', agent_run_id TEXT, produced_artifact_id TEXT, error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_initiative ON project_tasks(initiative_run_id, task_index ASC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace ON project_tasks(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status, created_at ASC)`
    // === Sprint 2 Commit 1: Agent Lifecycle + Workspace Projects (Postgres inline init) ===
    //
    //   agents — per-workspace agent registry. One row per (workspace_id, name).
    //   This is the table the operator's Pause/Resume UI mutates and the table
    //   the cron worker filters on (`WHERE status = 'active'`). Architecture
    //   recommendation: status column gating, not external process teardown —
    //   matches the Vercel serverless deployment model (no daemons to SIGTERM).
    //
    //   The CHECK constraint enforces the four states the worker recognizes:
    //     active   — runnable, default for new rows
    //     paused   — operator-paused; cron skips on next tick
    //     error    — system-flagged after repeated failures (set by runner, not UI)
    //     disabled — soft-deleted by an admin; never returns to runnable without
    //                explicit re-enable
    //
    //   paused_at / paused_by are captured at the moment of pause so the timeline
    //   can attribute the action (audit log feeder for Sprint 2D).
    //
    //   Note: there was no prior `agents` table in this codebase — only
    //   `agent_runs` (per-invocation log) and `voice_agents` (telephony). This
    //   creates the registry table with the three Sprint 2 tracking columns
    //   built-in. CREATE TABLE IF NOT EXISTS keeps it safe to re-run.
    await pgSql`CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error','disabled')),
      paused_at TIMESTAMPTZ,
      paused_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
    // Forward-compat: if a future version's CREATE TABLE was applied without
    // the tracking columns, top them up. ADD COLUMN IF NOT EXISTS is a no-op
    // when the column already exists.
    await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`
    await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS paused_by TEXT`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_workspace_name ON agents(workspace_id, name)`
    // Composite (workspace_id, status) is the index the cron filter hits every
    // tick — `WHERE workspace_id = ? AND status = 'active'`. Keep it first.
    await pgSql`CREATE INDEX IF NOT EXISTS idx_agents_workspace_status ON agents(workspace_id, status)`
    //
    //   workspace_projects — persistent project registry. Replaces the
    //   `ooumph_projects_v1` localStorage stash on the CMO dashboard, which
    //   trapped projects on a single browser. After Sprint 2A wires the UI to
    //   /api/projects, the same project list is available across devices and
    //   survives a localStorage clear.
    //
    //   Schema kept intentionally minimal per the Sprint 2 spec — id + name +
    //   status + standard timestamps. No CHECK constraint on status so workflow
    //   evolution doesn't require a migration: callers can use whatever vocab
    //   the product needs (active / archived / completed / etc.). If a fixed
    //   vocabulary becomes needed, add CHECK in a follow-up migration.
    await pgSql`CREATE TABLE IF NOT EXISTS workspace_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace ON workspace_projects(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_projects_status ON workspace_projects(workspace_id, status)`
    // === Sprint 1: Email Department schema (Postgres inline init) ===
    // Bridges email_campaigns into the artifact safety gate (artifact_id) and
    // adds scheduling + provider tracking columns. Adds list management tables
    // (email_lists, email_list_members) and per-recipient send tracking
    // (email_campaign_sends).
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS artifact_id TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS list_id TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_name TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_email TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS reply_to TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS preview_text TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'resend'`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS unsubscribe_count INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS error_message TEXT`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
    await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_by TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_artifact ON email_campaigns(artifact_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_schedule ON email_campaigns(status, scheduled_for)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_workspace ON email_campaigns(workspace_id, created_at DESC)`

    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS first_name TEXT`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS last_name TEXT`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS source VARCHAR(100)`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}'`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS consent_source VARCHAR(100)`
    await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscribers_workspace_email ON email_subscribers(workspace_id, email)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(workspace_id, status)`

    await pgSql`CREATE TABLE IF NOT EXISTS email_lists (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, status VARCHAR(50) DEFAULT 'active', subscriber_count INTEGER DEFAULT 0, default_from_name TEXT, default_from_email TEXT, double_opt_in INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_lists_workspace ON email_lists(workspace_id, status)`

    await pgSql`CREATE TABLE IF NOT EXISTS email_list_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, list_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, status VARCHAR(50) DEFAULT 'subscribed', added_at TIMESTAMPTZ DEFAULT NOW(), unsubscribed_at TIMESTAMPTZ)`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_members_unique ON email_list_members(list_id, subscriber_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_list_members_subscriber ON email_list_members(subscriber_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_list_members_workspace ON email_list_members(workspace_id, status)`

    await pgSql`CREATE TABLE IF NOT EXISTS email_campaign_sends (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_id TEXT NOT NULL, subscriber_id TEXT, email_address VARCHAR(255) NOT NULL, status VARCHAR(50) DEFAULT 'queued', external_message_id TEXT, error_message TEXT, sent_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ, bounced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_campaign ON email_campaign_sends(campaign_id, status)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_subscriber ON email_campaign_sends(subscriber_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_workspace ON email_campaign_sends(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_external ON email_campaign_sends(external_message_id)`
    // === Sprint 2: Publishing & Social schema (Postgres inline init) ===
    // Augments the existing scheduled_content / published_content tables with
    // Sprint-2 canonical column names (channel, content_body, scheduled_at,
    // retry_count, scheduled_content_id, native_post_id, permalink). Older
    // column names (platform / content / scheduled_for / post_id / post_url)
    // are preserved for backward compat — Sprint-2 routes use the new ones.
    await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS channel TEXT`
    await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS content_body TEXT`
    await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`
    await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
    // Calendar uses (workspace_id, scheduled_at) for the timeline view, and
    // the worker loop scans (status, scheduled_at) for items due to publish.
    await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_workspace_schedule ON scheduled_content(workspace_id, scheduled_at)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_status_schedule ON scheduled_content(status, scheduled_at)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_artifact ON scheduled_content(artifact_id)`

    await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS scheduled_content_id TEXT`
    await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS channel TEXT`
    await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS native_post_id TEXT`
    await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS permalink TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_workspace ON published_content(workspace_id, published_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_scheduled ON published_content(scheduled_content_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_channel ON published_content(workspace_id, channel)`

    // OAuth tokens — per-workspace, per-platform encrypted credentials for
    // LinkedIn / X / WordPress / etc. Encrypted-at-rest via lib/secrets.ts
    // (AES-256-GCM). The UNIQUE (workspace_id, platform) constraint enforces
    // one connection per platform per workspace.
    await pgSql`CREATE TABLE IF NOT EXISTS oauth_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, encrypted_access_token TEXT NOT NULL, encrypted_refresh_token TEXT, expires_at TIMESTAMPTZ, scope TEXT, account_id TEXT, account_label TEXT, status VARCHAR(30) DEFAULT 'active', last_refreshed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_unique ON oauth_tokens(workspace_id, platform)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_status ON oauth_tokens(status, expires_at)`

    // Tracked links — 6-char slug → original URL mapping with denormalised
    // click_count for hot-path stat cards. Per-click event rows live in
    // link_clicks (below) for daily-series chart rollups.
    await pgSql`CREATE TABLE IF NOT EXISTS tracked_links (id TEXT PRIMARY KEY, slug VARCHAR(16) NOT NULL UNIQUE, workspace_id TEXT NOT NULL, original_url TEXT NOT NULL, scheduled_content_id TEXT, published_content_id TEXT, channel VARCHAR(50), campaign_id TEXT, click_count INTEGER DEFAULT 0, last_clicked_at TIMESTAMPTZ, status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_workspace ON tracked_links(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_scheduled ON tracked_links(scheduled_content_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_channel ON tracked_links(workspace_id, channel)`
    await pgSql`CREATE TABLE IF NOT EXISTS link_clicks (id TEXT PRIMARY KEY, slug VARCHAR(16) NOT NULL, workspace_id TEXT NOT NULL, channel VARCHAR(50), referrer TEXT, user_agent TEXT, country VARCHAR(8), clicked_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_link_clicks_slug ON link_clicks(slug, clicked_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_link_clicks_workspace ON link_clicks(workspace_id, clicked_at DESC)`

    // === Sprint 3: Paid Acquisition Department (Postgres inline init) ===
    // ad_campaigns — canonical paid campaign row. native_campaign_id is the
    // provider's id (Meta campaign id, Google customer ID + campaign id, etc.)
    // once we've launched the campaign upstream. `error_log` captures the
    // most recent failure surface from the provider's API.
    await pgSql`CREATE TABLE IF NOT EXISTS ad_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, native_campaign_id TEXT, name TEXT NOT NULL, daily_budget INTEGER NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'draft', error_log TEXT, utm_override TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    // Upgrade path — adds utm_override to any environment that ran the
    // pre-amendment Sprint-3 Commit 1 (CREATE IF NOT EXISTS is a no-op once
    // the table exists, so the column would otherwise be missing).
    await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS utm_override TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_workspace_status ON ad_campaigns(workspace_id, status)`

    // ad_creatives — individual ad units inside a campaign. artifact_id is
    // the safety-gate link: if present, the dispatcher refuses to push the
    // creative live until the underlying artifact is human-approved.
    await pgSql`CREATE TABLE IF NOT EXISTS ad_creatives (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, ad_campaign_id TEXT NOT NULL, artifact_id TEXT, headline TEXT NOT NULL, body_copy TEXT NOT NULL, media_url TEXT, destination_url TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_creatives_artifact ON ad_creatives(artifact_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives(ad_campaign_id)`

    // funnel_steps — public landing/thank-you pages served at /lp/[slug].
    // Slug is workspace-scoped-unique (we enforce that at the route layer)
    // but DB-globally unique because the public URL is /lp/:slug with no
    // workspace prefix.
    await pgSql`CREATE TABLE IF NOT EXISTS funnel_steps (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, html_content TEXT NOT NULL, view_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_funnel_steps_workspace ON funnel_steps(workspace_id, created_at DESC)`

    // form_submissions — leads captured from a funnel step. submitted_data
    // stores arbitrary key/value pairs as JSON text. The (funnel_step_id,
    // email) index supports both "all submissions for this step" and
    // "has this email already submitted?" lookups for de-dup logic.
    await pgSql`CREATE TABLE IF NOT EXISTS form_submissions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, funnel_step_id TEXT NOT NULL, email TEXT, submitted_data TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_form_submissions_step_email ON form_submissions(funnel_step_id, email)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace ON form_submissions(workspace_id, created_at DESC)`

    // === Sprint 4: Lead Gen & CRM Department (Postgres inline init) ===
    // Extend leads_captured with B2B enrichment fields. `enrichment_status`
    // tracks the multi-source synthesis lifecycle:
    //   pending → enriching → completed | failed
    // The other columns hold the merged output of the parallel enrichment
    // sources (Brave Search + Apollo/Clearbit-style providers run in parallel).
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(30) DEFAULT 'pending'`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS company_name TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS company_size TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS estimated_revenue TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS industry TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS linkedin_url TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS twitter_url TEXT`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS tech_stack TEXT DEFAULT '[]'`
    await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS enrichment_summary TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_leads_captured_workspace_enrichment ON leads_captured(workspace_id, enrichment_status)`

    // lead_activities — Sprint-4 canonical column `activity_type` is added
    // alongside the legacy `type` column for backward-compat. Existing
    // (lead_id, created_at DESC) timeline index already exists from prior init.
    await pgSql`ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS activity_type TEXT`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_workspace_type ON lead_activities(workspace_id, activity_type)`

    // enrichment_logs — per-provider raw response capture for replay/audit.
    // provider_used: 'brave_search' | 'apollo' | 'clearbit' | 'hunter' | …
    // execution_time_ms tracks the slowest provider in a parallel race so we
    // can A/B different combinations and prune the slow ones.
    await pgSql`CREATE TABLE IF NOT EXISTS enrichment_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, provider_used VARCHAR(50) NOT NULL, execution_time_ms INTEGER, raw_response TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead ON enrichment_logs(lead_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_provider ON enrichment_logs(workspace_id, provider_used, created_at DESC)`

    // === Sprint 5: PR & Reputation Desk (Postgres inline init) ===
    // PR Circuit Breaker — workspaces row carries a single canonical flag so
    // every customer-facing dispatch route (publishing, ads, email-marketing)
    // can short-circuit when a crisis is active. crisis_tripped_at stamps
    // when it flipped, so the UI can surface "Crisis declared 4h ago".
    //   clear → tripped → recovering → clear
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS crisis_status VARCHAR(30) DEFAULT 'clear'`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS crisis_tripped_at TIMESTAMPTZ`

    // brand_mentions — public scraped references. sentiment_score is 0.00
    // (most negative) to 1.00 (most positive); severity_level is the
    // human-readable bucket the scanner sets when it ingests the row
    // (low / medium / high / critical). The composite index supports the
    // "show all unread crisis-grade mentions" hot path.
    await pgSql`CREATE TABLE IF NOT EXISTS brand_mentions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_platform VARCHAR(50) NOT NULL, source_url TEXT, author_handle TEXT, content_text TEXT NOT NULL, sentiment_score NUMERIC(4, 2) DEFAULT 1.00, severity_level VARCHAR(20) DEFAULT 'low', status VARCHAR(30) DEFAULT 'unread', detected_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_severity_status ON brand_mentions(workspace_id, severity_level, status)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_recent ON brand_mentions(workspace_id, created_at DESC)`

    // pr_campaigns — press release drafts that flow through the standard
    // artifact-approval HITL gate. artifact_id links to the source artifact
    // so assertArtifactApproved() can block journalist outreach until a
    // human has signed off on the press copy.
    await pgSql`CREATE TABLE IF NOT EXISTS pr_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, title TEXT NOT NULL, body_content TEXT NOT NULL, status VARCHAR(30) DEFAULT 'draft', error_log TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_pr_campaigns_workspace_status ON pr_campaigns(workspace_id, status)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_pr_campaigns_artifact ON pr_campaigns(artifact_id)`

    // media_contacts — journalist + outlet CRM. UNIQUE (workspace_id, email)
    // prevents duplicate cards inside a single client account; we surface
    // this as a clean 409 in the route layer rather than a raw DB error.
    await pgSql`CREATE TABLE IF NOT EXISTS media_contacts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, journalist_name TEXT NOT NULL, email VARCHAR(255), outlet_name TEXT, beat_focus TEXT, linkedin_url TEXT, twitter_url TEXT, notes TEXT, last_contacted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_contacts_unique ON media_contacts(workspace_id, email)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_media_contacts_workspace_beat ON media_contacts(workspace_id, beat_focus)`

    // === Sprint 6: Creative Studio & Media Unification (Postgres inline init) ===
    // media_assets — single source of truth for every generated / uploaded
    // creative file. parent_asset_id makes this a tree: a 4:5 crop of a
    // 1:1 master, an MP4 transcode of a WebM source, an audio clip extracted
    // from a video — all reference the original via parent_asset_id.
    // dimensions stores "WxH" for images (e.g. "1024x1024"); duration_seconds
    // lives on audio/video rows. mime_type is the canonical web/* identifier.
    await pgSql`CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, filename TEXT NOT NULL, url TEXT NOT NULL, asset_type VARCHAR(30) NOT NULL, mime_type VARCHAR(120), file_size INTEGER, dimensions VARCHAR(50), duration_seconds NUMERIC(10, 3), source_provider VARCHAR(50), metadata_json TEXT DEFAULT '{}', status VARCHAR(30) DEFAULT 'ready', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_type ON media_assets(workspace_id, asset_type)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_parent ON media_assets(parent_asset_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_recent ON media_assets(workspace_id, created_at DESC)`

    // creative_generation_jobs — async generation queue. artifact_id links
    // the job to an artifact row so the HITL Review modal can gate publish.
    // Lifecycle: pending → running → completed | failed | cancelled
    // result_asset_id back-references the media_assets row produced on success.
    await pgSql`CREATE TABLE IF NOT EXISTS creative_generation_jobs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, provider VARCHAR(50) NOT NULL, model_name TEXT, prompt_text TEXT NOT NULL, negative_prompt TEXT, status VARCHAR(30) DEFAULT 'pending', result_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, cost_estimate NUMERIC(10, 4) DEFAULT 0, duration_ms INTEGER, error_message TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_status ON creative_generation_jobs(workspace_id, status)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_artifact ON creative_generation_jobs(artifact_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_recent ON creative_generation_jobs(workspace_id, created_at DESC)`

    // voice_profiles — workspace's library of cloned/curated ElevenLabs / VAPI
    // voices. UNIQUE (workspace_id, native_provider_voice_id) prevents the
    // same provider voice from being registered twice in a workspace.
    await pgSql`CREATE TABLE IF NOT EXISTS voice_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_name TEXT NOT NULL, native_provider_voice_id TEXT NOT NULL, provider VARCHAR(50) DEFAULT 'elevenlabs', gender VARCHAR(20), accent_label TEXT, sample_url TEXT, status VARCHAR(30) DEFAULT 'active', is_default INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_unique ON voice_profiles(workspace_id, native_provider_voice_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_voice_profiles_workspace_status ON voice_profiles(workspace_id, status)`

    // === Sprint 7: Growth & Experiments (Postgres inline init) ===
    // marketing_experiments — the test definition. target_type/target_reference_id
    // is a polymorphic pointer ('email_campaign' / 'ad_campaign' / 'funnel_step' /
    // 'pr_campaign' / 'creative_job') so a single experiment row can A/B-test any
    // entity in the system. statistical_significance_threshold is the Bayesian
    // posterior probability we require before auto-declaring a winner (default 0.95).
    await pgSql`CREATE TABLE IF NOT EXISTS marketing_experiments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, target_type VARCHAR(50) NOT NULL, target_reference_id TEXT NOT NULL, status VARCHAR(30) DEFAULT 'draft', statistical_significance_threshold NUMERIC(4, 3) DEFAULT 0.95, winner_variant_id TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_marketing_experiments_workspace_status ON marketing_experiments(workspace_id, status)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_marketing_experiments_target ON marketing_experiments(workspace_id, target_type, target_reference_id)`

    // experiment_variants — the test arms. configuration_override_json carries
    // the per-variant patch that gets merged into the target's base config at
    // dispatch time (e.g. a different subject line for an email_campaign, or a
    // different headline for an ad_creative). The composite index supports the
    // hot path of the variant router: "give me variant X of experiment Y".
    await pgSql`CREATE TABLE IF NOT EXISTS experiment_variants (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, experiment_id TEXT NOT NULL REFERENCES marketing_experiments(id) ON DELETE CASCADE, variant_label VARCHAR(50) NOT NULL, configuration_override_json TEXT NOT NULL DEFAULT '{}', traffic_allocation_weight INTEGER NOT NULL DEFAULT 50, impression_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_variants_lookup ON experiment_variants(experiment_id, variant_label)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_variants_workspace ON experiment_variants(workspace_id, experiment_id)`

    // experiment_events — append-only event ledger. tracking_id is the
    // deterministic hash assigned by the variant router (visitor cookie or
    // user_id), so we can reconstruct the entire funnel per visitor without
    // PII leakage. event_type: 'impression' | 'conversion' | 'click' | …
    await pgSql`CREATE TABLE IF NOT EXISTS experiment_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, variant_id TEXT NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE, tracking_id TEXT NOT NULL, event_type VARCHAR(50) NOT NULL, event_value NUMERIC(12, 4), metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_variant_type ON experiment_events(variant_id, event_type, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_tracking ON experiment_events(tracking_id)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_workspace_recent ON experiment_events(workspace_id, created_at DESC)`

    // === Sprint 8: Voice AI & Inbound Call Center (Postgres inline init) ===
    // voice_agents — one row per configured AI voice agent. The composite
    // UNIQUE (workspace_id, phone_number) prevents two agents from claiming
    // the same trunk number inside a workspace, which is exactly the kind of
    // double-routing bug that silently swallows inbound calls. We allow
    // multiple agents with NULL phone_number (web/SDK-only agents) because
    // Postgres treats NULLs as distinct in unique indexes by default.
    await pgSql`CREATE TABLE IF NOT EXISTS voice_agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_profile_id TEXT REFERENCES voice_profiles(id) ON DELETE SET NULL, provider VARCHAR(50) DEFAULT 'vapi', agent_name TEXT NOT NULL, phone_number TEXT, system_prompt TEXT, temperature NUMERIC(3, 2) DEFAULT 0.70, llm_model VARCHAR(60) DEFAULT 'gpt-4o', status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_agents_workspace_phone ON voice_agents(workspace_id, phone_number)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_voice_agents_workspace_status ON voice_agents(workspace_id, status)`

    // call_logs — append-only ledger of every inbound/outbound call. lead_id
    // is nullable because the webhook may arrive before CRM enrichment links
    // a phone number to a captured lead (back-fill happens in the worker).
    // sentiment_score is numeric NULL until the post-call analysis pass writes it.
    await pgSql`CREATE TABLE IF NOT EXISTS call_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_agent_id TEXT REFERENCES voice_agents(id) ON DELETE SET NULL, lead_id TEXT REFERENCES leads_captured(id) ON DELETE SET NULL, provider VARCHAR(50), direction VARCHAR(20), from_number TEXT, to_number TEXT, duration_seconds INTEGER DEFAULT 0, recording_url TEXT, transcript TEXT, summary TEXT, sentiment_score NUMERIC(4, 2), call_status VARCHAR(30) DEFAULT 'completed', action_taken TEXT, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_recent ON call_logs(workspace_id, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id)`

    // Hot-path CRM lookup: when the inbound webhook fires we need to resolve
    // the caller's phone → lead_id in single-digit milliseconds so the agent
    // can greet by name. A B-tree index on leads_captured(phone) makes the
    // equality lookup index-only.
    await pgSql`CREATE INDEX IF NOT EXISTS idx_leads_captured_phone ON leads_captured(phone)`

    // === Sprint 9: Agency Ops & Third-Party Connections (Postgres inline init) ===
    // developer_tokens — Personal Access Tokens for the public Ooumph API.
    // We store only a hash of the token (sha256 of the plaintext that we
    // showed once at create time). The (token_hash) index is the single
    // hot lookup the API gateway runs on every authenticated request, so
    // it must be a plain B-tree on the hash column alone — no compound
    // workspace filter, because the request hasn't been attributed yet.
    // scopes_json is a serialised array of scope strings ('read:leads',
    // 'write:campaigns', etc.); enforcing the grammar is the route's job.
    await pgSql`CREATE TABLE IF NOT EXISTS developer_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token_name TEXT NOT NULL, token_hash TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT '[]', last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_developer_tokens_hash ON developer_tokens(token_hash)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_developer_tokens_workspace ON developer_tokens(workspace_id)`

    // webhook_subscriptions — outbound webhook fan-out registry. The event
    // router fires whenever a domain event happens ('lead.captured',
    // 'experiment.winner_declared', 'call.completed'…) and walks every
    // matching row to POST the payload. The composite index makes that
    // walk index-only: filter by (workspace_id, event_type, status='active')
    // is the only access pattern. secret_signature is the HMAC key we sign
    // the body with so receivers can verify authenticity.
    await pgSql`CREATE TABLE IF NOT EXISTS webhook_subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, target_url TEXT NOT NULL, event_type TEXT NOT NULL, secret_signature TEXT NOT NULL, status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_webhook_subs_router ON webhook_subscriptions(workspace_id, event_type, status)`
    // Forensic columns for the dispatcher's 3x retry circuit. last_error_log
    // holds the diagnosis blob (JSON-encoded), last_attempt_at the wall-clock
    // moment we last tried delivery, last_attempt_status the HTTP code or
    // 'network_error'/'timeout'. Additive so re-running this block is safe.
    await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_error_log TEXT`
    await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_attempt_status VARCHAR(30)`

    // integration_connections — one row per third-party integration card
    // (Stripe, HubSpot, Slack, Notion, Salesforce…) the workspace has
    // connected. credentials_encrypted is the AES-256-GCM blob produced by
    // lib/secrets.ts — we never store plaintext keys. The composite UNIQUE
    // (workspace_id, provider_slug) makes the "Connect Stripe" button
    // idempotent: re-clicking it updates the existing row rather than
    // creating a duplicate card on the dashboard.
    await pgSql`CREATE TABLE IF NOT EXISTS integration_connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider_slug TEXT NOT NULL, credentials_encrypted TEXT, status VARCHAR(30) DEFAULT 'connected', updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_unique ON integration_connections(workspace_id, provider_slug)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_status ON integration_connections(workspace_id, status)`

    // === Sprint 10: System Polish & Performance Hardening (Postgres inline init) ===
    // system_performance_audits — append-only telemetry. Every meaningful
    // server operation (cron run, agent invocation, external API call) writes
    // one row carrying its wall-clock duration_ms, terminal status
    // ('ok' / 'error' / 'timeout' / 'rate_limited'), and an optional
    // error_captured snippet. The composite index covers the only access
    // pattern: scoped to a workspace, grouped by operation_name, ordered by
    // recency — exactly what the /dashboard/system-health graphs scan.
    await pgSql`CREATE TABLE IF NOT EXISTS system_performance_audits (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, operation_name TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'ok', error_captured TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_perf_audits_workspace_op_recent ON system_performance_audits(workspace_id, operation_name, created_at DESC)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_perf_audits_status ON system_performance_audits(workspace_id, status, created_at DESC)`

    // workspace_retention_policies — per-tenant log-rotation rules. One row
    // per (workspace_id, stream_target) such as 'call_logs', 'agent_runs',
    // 'experiment_events', 'notifications'. The retention cron walks this
    // table and either purges (DELETE) or archives (move to cold storage)
    // based on action_disposition. The composite UNIQUE makes the upsert
    // semantics clean: editing a policy never duplicates a stream.
    await pgSql`CREATE TABLE IF NOT EXISTS workspace_retention_policies (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, stream_target TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 90, action_disposition VARCHAR(30) NOT NULL DEFAULT 'purge', updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
    await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_unique ON workspace_retention_policies(workspace_id, stream_target)`
    await pgSql`CREATE INDEX IF NOT EXISTS idx_retention_policies_workspace ON workspace_retention_policies(workspace_id)`

    // Dual-Key Budget Lock — per-workspace spend caps. Stored on workspaces
    // table so every ad-spend check can pull the lock value with the same
    // row that already holds workspace identity (avoids a second JOIN).
    // Values are in lowest currency denomination (cents). Defaults: $500/day
    // hard cap, $250/day alert threshold. The dispatcher must verify
    // *today's accumulated spend + this campaign's daily_budget*
    // ≤ hard_max_daily_spend before activating any campaign.
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS hard_max_daily_spend INTEGER NOT NULL DEFAULT 50000`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS alert_threshold_budget INTEGER NOT NULL DEFAULT 25000`
    // Workspace-level UTM template (resolved at dispatch time with reserved
    // tokens like {platform}, {campaign_slug}, {creative_id}). Per-campaign
    // override lives in ad_campaigns.utm_override.
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS utm_template TEXT`

    // Sprint 15A: onboarding-complete marker so mid-wizard refresh resumes
    // correctly (previously the wizard had no persisted completion state).
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0`

    // Audit pass #6 P1: per-workspace inbound webhook token. Compared against
    // the x-zapier-token header on /api/webhooks/zapier so Zaps configured for
    // workspace A can't post to workspace B.
    await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS webhook_secret TEXT`

    // Sprint 15A: persisted CRM segments. Previously segments were UI-only —
    // computed each render over leads_captured rows. Persisting the rule
    // lets users share/save segments and lets workflows trigger on them.
    await pgSql`
      CREATE TABLE IF NOT EXISTS lead_segments (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_json TEXT NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await pgSql`CREATE INDEX IF NOT EXISTS lead_segments_ws ON lead_segments(workspace_id)`

    // Sprint 16A: multi-stage funnels.
    //   - funnels parent table groups multiple landing pages/forms.
    //   - funnel_steps gets funnel_id + stage + sequence + is_active so the
    //     awareness→retention narrative (audit Promise D) is finally modeled.
    //   - The implicit-always-live behaviour where every saved funnel_steps
    //     row was publicly resolvable from /api/f/[slug] is closed by adding
    //     is_active=false default. The publish flow flips it true.
    await pgSql`
      CREATE TABLE IF NOT EXISTS funnels (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name VARCHAR(255) NOT NULL,
        goal VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await pgSql`CREATE INDEX IF NOT EXISTS funnels_ws ON funnels(workspace_id)`
    await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS funnel_id TEXT`
    await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS stage VARCHAR(40) NOT NULL DEFAULT 'awareness'`
    await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 0`
    await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`
    await pgSql`CREATE INDEX IF NOT EXISTS funnel_steps_funnel ON funnel_steps(funnel_id, sequence)`

    // Sprint 16A: ad campaigns gain an objective enum so the deploy route can
    // map to Meta's PAGE_LIKES / awareness / conversions etc instead of the
    // hardcoded 'leads' that the audit found in deploy/route.ts:119.
    await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS objective VARCHAR(40) NOT NULL DEFAULT 'leads'`
    await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS targeting_json TEXT DEFAULT '{}'`

    // Sprint 16A: follower-growth tracking. The audit found post_metrics had
    // no follower column, so J4 step 8 (track follower growth) was impossible.
    await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS followers_delta INTEGER NOT NULL DEFAULT 0`
    await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS total_followers INTEGER`
    // Sprint 17H (audit pass #3 P2 #40): attribution metadata (ad campaign,
    // etc.) — gives follower-sync rows a place to record which ad campaign
    // most likely drove the delta. Free-form JSON to avoid more migrations.
    await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS metadata_json TEXT DEFAULT '{}'`

    // Sprint 16A: approval audit trail. approvals table previously overwrote
    // status/notes in place on PATCH — no record of WHO approved WHEN. We add
    // approved_by + approved_at + an append-only approval_events log.
    await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approved_by TEXT`
    await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`
    await pgSql`
      CREATE TABLE IF NOT EXISTS approval_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        artifact_id TEXT,
        actor_id TEXT,
        actor_email VARCHAR(255),
        action VARCHAR(40) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await pgSql`CREATE INDEX IF NOT EXISTS approval_events_approval ON approval_events(approval_id, created_at DESC)`

    // Sprint 16A: brand_profiles gains structured ICP + logo_url so the
    // strategy/research agents stop hallucinating these from prose.
    await pgSql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS icp_json TEXT DEFAULT '{}'`
    await pgSql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url TEXT`

    // Sprint 16A: lead_magnet artifact lineage table — gives downloads a
    // resolvable hosted URL + tracks fulfilment counts independently of
    // form submissions.
    await pgSql`
      CREATE TABLE IF NOT EXISTS lead_magnets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        asset_url TEXT NOT NULL,
        funnel_id TEXT,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await pgSql`CREATE INDEX IF NOT EXISTS lead_magnets_ws ON lead_magnets(workspace_id)`
  }

  const rows = await pgSql(strings, ...values) as Record<string, unknown>[]
  return { rows: rows.map(parseJsonFields) }
}

// ─── Unified sql tag ──────────────────────────────────────────────────────────

export const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
  if (process.env.POSTGRES_URL) {
    return postgresQuery(strings, ...values)
  }
  return sqliteQuery(strings, ...values)
}

// ─── SQLite schema ────────────────────────────────────────────────────────────

function initSQLiteSync(db: import('better-sqlite3').Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      owner_email TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brand_profiles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id),
      business_name TEXT, tagline TEXT, offer TEXT, unique_value TEXT,
      target_audience TEXT, tone TEXT, competitors TEXT, channels TEXT,
      goals TEXT, monthly_budget TEXT, prohibited_claims TEXT, approval_email TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id),
      agent_name TEXT NOT NULL, status TEXT DEFAULT 'pending',
      input_json TEXT, output_json TEXT, cost_estimate REAL,
      error_message TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id),
      agent_run_id TEXT REFERENCES agent_runs(id),
      type TEXT NOT NULL, title TEXT NOT NULL, content_json TEXT NOT NULL,
      status TEXT DEFAULT 'draft', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id),
      artifact_id TEXT REFERENCES artifacts(id),
      status TEXT DEFAULT 'pending', approver_email TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS learning_notes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id),
      source_type TEXT, source_id TEXT, note TEXT NOT NULL,
      confidence REAL DEFAULT 0.8, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      access_token TEXT, account_id TEXT,
      status TEXT DEFAULT 'active',
      connected_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS publish_log (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      artifact_id TEXT, platform TEXT NOT NULL,
      post_id TEXT, post_url TEXT,
      status TEXT DEFAULT 'published',
      published_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS creative_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      requesting_agent TEXT NOT NULL,
      creative_type TEXT NOT NULL,
      context_json TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      artifact_id TEXT,
      publish_platforms TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_platform_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      campaign_artifact_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_campaign_id TEXT NOT NULL,
      platform_adset_ids TEXT DEFAULT '[]',
      platform_ad_ids TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      error_message TEXT,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS campaign_performance (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      campaign_artifact_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_campaign_id TEXT,
      date TEXT NOT NULL,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cpa REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      additional_metrics TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS campaign_optimizations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      campaign_artifact_id TEXT NOT NULL,
      report_json TEXT NOT NULL,
      health_score INTEGER DEFAULT 0,
      overall_health TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      content_json TEXT NOT NULL,
      artifact_id TEXT,
      scheduled_time TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      error TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kpi_targets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      targets_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads_captured (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT DEFAULT 'manual',
      campaign TEXT,
      status TEXT DEFAULT 'new',
      score INTEGER DEFAULT 0,
      notes TEXT,
      custom_fields TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT,
      status TEXT DEFAULT 'draft',
      recipient_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      content_json TEXT DEFAULT '{}',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_subscribers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'subscribed',
      tags TEXT DEFAULT '[]',
      subscribed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brand_memory (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'learning_note',
      platform TEXT,
      performance_score INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scheduled_content (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      media_urls TEXT DEFAULT '[]',
      artifact_id TEXT,
      scheduled_for TEXT,
      buffer_update_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS published_content (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      artifact_id TEXT,
      platform TEXT NOT NULL,
      post_id TEXT,
      post_url TEXT,
      title TEXT,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS inbox_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contact_id TEXT,
      contact_email TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      channel TEXT NOT NULL DEFAULT 'email',
      subject TEXT,
      status TEXT DEFAULT 'open',
      tags TEXT DEFAULT '[]',
      assigned_to TEXT,
      last_message_at TEXT,
      unread_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      html_body TEXT,
      channel TEXT DEFAULT 'email',
      status TEXT DEFAULT 'sent',
      external_id TEXT,
      ai_generated INTEGER DEFAULT 0,
      sent_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contact_id TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      timezone TEXT DEFAULT 'UTC',
      status TEXT DEFAULT 'confirmed',
      meeting_url TEXT,
      calendar_event_id TEXT,
      reminder_sent INTEGER DEFAULT 0,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS calendar_availability (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      days_of_week TEXT DEFAULT '[1,2,3,4,5]',
      start_hour INTEGER DEFAULT 9,
      end_hour INTEGER DEFAULT 17,
      slot_minutes INTEGER DEFAULT 30,
      timezone TEXT DEFAULT 'UTC',
      buffer_minutes INTEGER DEFAULT 10,
      advance_days INTEGER DEFAULT 14,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lead_activities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT DEFAULT '{}',
      nodes TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      run_count INTEGER DEFAULT 0,
      last_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      contact_email TEXT,
      trigger_data TEXT DEFAULT '{}',
      status TEXT DEFAULT 'running',
      current_node INTEGER DEFAULT 0,
      nodes_completed TEXT DEFAULT '[]',
      error_message TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_pending_steps (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      node_index INTEGER NOT NULL,
      node_data TEXT NOT NULL,
      lead_id TEXT,
      contact_email TEXT,
      scheduled_for TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_pending_steps_scheduled ON workflow_pending_steps(scheduled_for, status);
    CREATE TABLE IF NOT EXISTS reputation_reviews (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contact_id TEXT,
      contact_name TEXT,
      contact_email TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      rating INTEGER,
      title TEXT,
      body TEXT,
      sentiment TEXT DEFAULT 'neutral',
      status TEXT DEFAULT 'new',
      response_text TEXT,
      response_sent_at TEXT,
      external_id TEXT,
      external_url TEXT,
      booking_id TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reputation_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contact_id TEXT,
      contact_name TEXT,
      contact_email TEXT NOT NULL,
      booking_id TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      clicked_at TEXT,
      review_platform TEXT DEFAULT 'google',
      review_link TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reputation_reviews_workspace ON reputation_reviews(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reputation_requests_workspace ON reputation_requests(workspace_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price_monthly INTEGER NOT NULL,
      price_yearly INTEGER,
      stripe_price_id TEXT,
      stripe_price_id_yearly TEXT,
      commission_rate REAL DEFAULT 0.15,
      max_sub_accounts INTEGER DEFAULT 0,
      max_ai_runs_monthly INTEGER DEFAULT 500,
      features TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT DEFAULT 'trialing',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vendor_profiles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      stripe_connect_account_id TEXT,
      stripe_connect_status TEXT DEFAULT 'not_connected',
      commission_rate_override REAL,
      white_label_name TEXT,
      white_label_logo_url TEXT,
      white_label_primary_color TEXT DEFAULT '#4F46E5',
      white_label_domain TEXT,
      is_approved INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS client_accounts (
      id TEXT PRIMARY KEY,
      vendor_workspace_id TEXT NOT NULL,
      client_workspace_id TEXT,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      price_monthly INTEGER NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT DEFAULT 'trial',
      trial_ends_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS commission_ledger (
      id TEXT PRIMARY KEY,
      vendor_workspace_id TEXT NOT NULL,
      client_account_id TEXT,
      gross_amount INTEGER NOT NULL,
      commission_rate REAL NOT NULL,
      commission_amount INTEGER NOT NULL,
      net_amount INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_commission_ledger_vendor ON commission_ledger(vendor_workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_accounts_vendor ON client_accounts(vendor_workspace_id);
    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      invited_by TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_unique ON workspace_members(workspace_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      token TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'pending',
      invited_by TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
    CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
    CREATE TABLE IF NOT EXISTS sales_deals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      contact_name TEXT NOT NULL,
      contact_email TEXT,
      company TEXT,
      title TEXT NOT NULL,
      value REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      stage TEXT DEFAULT 'prospect',
      probability INTEGER DEFAULT 10,
      expected_close TEXT,
      actual_close TEXT,
      notes TEXT,
      source TEXT,
      custom_fields TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sales_deals_workspace ON sales_deals(workspace_id, stage);
  `)
  // Safely add columns to existing tables (ignore "already exists" errors)
  const migrations = [
    'ALTER TABLE workspaces ADD COLUMN user_id TEXT',
    'ALTER TABLE workspaces ADD COLUMN model_settings TEXT DEFAULT \'{}\'',
    'ALTER TABLE integrations ADD COLUMN metadata TEXT',
    'ALTER TABLE workspaces ADD COLUMN extra_settings TEXT DEFAULT \'{}\'',
    'ALTER TABLE leads_captured ADD COLUMN hubspot_id TEXT',
    'ALTER TABLE approvals ADD COLUMN brand_voice_score INTEGER',
    'ALTER TABLE approvals ADD COLUMN brand_voice_reasoning TEXT',
    'CREATE TABLE IF NOT EXISTS inbox_conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_email TEXT, contact_name TEXT, contact_phone TEXT, channel TEXT NOT NULL DEFAULT \'email\', subject TEXT, status TEXT DEFAULT \'open\', tags TEXT DEFAULT \'[]\', assigned_to TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS inbox_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, workspace_id TEXT NOT NULL, direction TEXT NOT NULL, from_address TEXT, to_address TEXT, subject TEXT, body TEXT NOT NULL, html_body TEXT, channel TEXT DEFAULT \'email\', status TEXT DEFAULT \'sent\', external_id TEXT, ai_generated INTEGER DEFAULT 0, sent_at TEXT DEFAULT (datetime(\'now\')), created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT, title TEXT NOT NULL, description TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, timezone TEXT DEFAULT \'UTC\', status TEXT DEFAULT \'confirmed\', meeting_url TEXT, calendar_event_id TEXT, reminder_sent INTEGER DEFAULT 0, notes TEXT, source TEXT DEFAULT \'manual\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS calendar_availability (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, days_of_week TEXT DEFAULT \'[1,2,3,4,5]\', start_hour INTEGER DEFAULT 9, end_hour INTEGER DEFAULT 17, slot_minutes INTEGER DEFAULT 30, timezone TEXT DEFAULT \'UTC\', buffer_minutes INTEGER DEFAULT 10, advance_days INTEGER DEFAULT 14, updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS lead_activities (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, metadata_json TEXT DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC)',
    'CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, trigger_type TEXT NOT NULL, trigger_config TEXT DEFAULT \'{}\', nodes TEXT NOT NULL DEFAULT \'[]\', status TEXT DEFAULT \'draft\', run_count INTEGER DEFAULT 0, last_run_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_id TEXT, contact_email TEXT, trigger_data TEXT DEFAULT \'{}\', status TEXT DEFAULT \'running\', current_node INTEGER DEFAULT 0, nodes_completed TEXT DEFAULT \'[]\', error_message TEXT, started_at TEXT DEFAULT (datetime(\'now\')), completed_at TEXT)',
    'CREATE TABLE IF NOT EXISTS workflow_pending_steps (id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, node_index INTEGER NOT NULL, node_data TEXT NOT NULL, lead_id TEXT, contact_email TEXT, scheduled_for TEXT NOT NULL, status TEXT DEFAULT \'pending\', error_message TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)',
    'CREATE INDEX IF NOT EXISTS idx_pending_steps_scheduled ON workflow_pending_steps(scheduled_for, status)',
    'CREATE TABLE IF NOT EXISTS reputation_reviews (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, source TEXT NOT NULL DEFAULT \'manual\', rating INTEGER, title TEXT, body TEXT, sentiment TEXT DEFAULT \'neutral\', status TEXT DEFAULT \'new\', response_text TEXT, response_sent_at TEXT, external_id TEXT, external_url TEXT, booking_id TEXT, reviewed_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS reputation_requests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT NOT NULL, booking_id TEXT, status TEXT DEFAULT \'pending\', sent_at TEXT, clicked_at TEXT, review_platform TEXT DEFAULT \'google\', review_link TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_reputation_reviews_workspace ON reputation_reviews(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_reputation_requests_workspace ON reputation_requests(workspace_id, created_at DESC)',
    'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN workspace_id TEXT',
    'ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0',
    'CREATE TABLE IF NOT EXISTS admin_audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_email TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, details_json TEXT, ip_address TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC)',
    'CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, price_monthly INTEGER NOT NULL, price_yearly INTEGER, stripe_price_id TEXT, stripe_price_id_yearly TEXT, commission_rate REAL DEFAULT 0.15, max_sub_accounts INTEGER DEFAULT 0, max_ai_runs_monthly INTEGER DEFAULT 500, features TEXT DEFAULT \'[]\', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT \'trialing\', current_period_start TEXT, current_period_end TEXT, cancel_at_period_end INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS vendor_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, stripe_connect_account_id TEXT, stripe_connect_status TEXT DEFAULT \'not_connected\', commission_rate_override REAL, white_label_name TEXT, white_label_logo_url TEXT, white_label_primary_color TEXT DEFAULT \'#4F46E5\', white_label_domain TEXT, is_approved INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS client_accounts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_workspace_id TEXT, client_name TEXT NOT NULL, client_email TEXT NOT NULL, price_monthly INTEGER NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT \'trial\', trial_ends_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS commission_ledger (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_account_id TEXT, gross_amount INTEGER NOT NULL, commission_rate REAL NOT NULL, commission_amount INTEGER NOT NULL, net_amount INTEGER NOT NULL, stripe_payment_intent_id TEXT, stripe_transfer_id TEXT, description TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id)',
    'CREATE INDEX IF NOT EXISTS idx_commission_ledger_vendor ON commission_ledger(vendor_workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_client_accounts_vendor ON client_accounts(vendor_workspace_id)',
    'CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT \'member\', invited_by TEXT, joined_at TEXT DEFAULT (datetime(\'now\')), status TEXT DEFAULT \'active\')',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_unique ON workspace_members(workspace_id, user_id)',
    'CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)',
    'CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT DEFAULT \'member\', token TEXT NOT NULL UNIQUE, status TEXT DEFAULT \'pending\', invited_by TEXT, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token)',
    'CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id)',
    'CREATE TABLE IF NOT EXISTS sales_deals (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT, contact_name TEXT NOT NULL, contact_email TEXT, company TEXT, title TEXT NOT NULL, value REAL DEFAULT 0, currency TEXT DEFAULT \'USD\', stage TEXT DEFAULT \'prospect\', probability INTEGER DEFAULT 10, expected_close TEXT, actual_close TEXT, notes TEXT, source TEXT, custom_fields TEXT DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_sales_deals_workspace ON sales_deals(workspace_id, stage)',
    // Sprint 6E: Lost-reason capture (try/catch swallows duplicate-column on re-run).
    'ALTER TABLE sales_deals ADD COLUMN lost_reason TEXT',
    'ALTER TABLE sales_deals ADD COLUMN lost_at TEXT',
    // Sprint 6G: per-post organic engagement.
    'CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT NOT NULL, platform TEXT NOT NULL, post_id TEXT, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, video_views INTEGER DEFAULT 0, last_synced_at TEXT DEFAULT (datetime(\'now\')), created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_unique ON post_metrics(artifact_id, platform)',
    'CREATE INDEX IF NOT EXISTS idx_post_metrics_workspace ON post_metrics(workspace_id, last_synced_at DESC)',
    // Sprint 7C: real session + login event tracking.
    'CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, token_hash TEXT NOT NULL UNIQUE, user_agent TEXT, ip TEXT, created_at TEXT DEFAULT (datetime(\'now\')), last_seen_at TEXT DEFAULT (datetime(\'now\')), revoked_at TEXT)',
    'CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)',
    'CREATE TABLE IF NOT EXISTS login_events (id TEXT PRIMARY KEY, user_id TEXT, email_attempted TEXT, ip TEXT, user_agent TEXT, success INTEGER DEFAULT 0, failure_reason TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC)',
    // Sprint 7D: manual + Stripe payout ledger.
    'CREATE TABLE IF NOT EXISTS commission_payouts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, paid_at TEXT DEFAULT (datetime(\'now\')), notes TEXT, paid_by_user_id TEXT, payment_method TEXT DEFAULT \'manual\', stripe_transfer_id TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_commission_payouts_vendor ON commission_payouts(vendor_workspace_id, paid_at DESC)',
    // Sprint 9B: encrypted_access_token column on integrations (SQLite — try/catch swallows duplicate).
    'ALTER TABLE integrations ADD COLUMN encrypted_access_token TEXT',
    // Sprint 13A: lp_slug on artifacts.
    'ALTER TABLE artifacts ADD COLUMN lp_slug TEXT',
    // SQLite needs a separate CREATE UNIQUE INDEX (no partial-index syntax with WHERE in older SQLite,
    // but modern SQLite supports WHERE — better-sqlite3 ships ≥ 3.40 where this works fine).
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_lp_slug ON artifacts(lp_slug) WHERE lp_slug IS NOT NULL',
    // Sprint 15A: onboarding-complete marker + persisted CRM segments.
    'ALTER TABLE workspaces ADD COLUMN onboarding_completed_at TEXT',
    'ALTER TABLE workspaces ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0',
    // Audit pass #6 P1: per-workspace inbound webhook token (Zapier auth).
    'ALTER TABLE workspaces ADD COLUMN webhook_secret TEXT',
    'CREATE TABLE IF NOT EXISTS lead_segments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, rule_json TEXT NOT NULL, member_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS lead_segments_ws ON lead_segments(workspace_id)',
    // Sprint 16A: multi-stage funnels + ad objective + follower metrics + approval audit + ICP/logo + lead magnets.
    'CREATE TABLE IF NOT EXISTS funnels (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, goal TEXT, is_active INTEGER NOT NULL DEFAULT 0, archived_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS funnels_ws ON funnels(workspace_id)',
    'ALTER TABLE funnel_steps ADD COLUMN funnel_id TEXT',
    'ALTER TABLE funnel_steps ADD COLUMN stage TEXT NOT NULL DEFAULT \'awareness\'',
    'ALTER TABLE funnel_steps ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE funnel_steps ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1',
    'CREATE INDEX IF NOT EXISTS funnel_steps_funnel ON funnel_steps(funnel_id, sequence)',
    'ALTER TABLE ad_campaigns ADD COLUMN objective TEXT NOT NULL DEFAULT \'leads\'',
    'ALTER TABLE ad_campaigns ADD COLUMN targeting_json TEXT DEFAULT \'{}\'',
    'ALTER TABLE post_metrics ADD COLUMN followers_delta INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE post_metrics ADD COLUMN total_followers INTEGER',
    // Sprint 17H (audit pass #3 P2 #40): attribution metadata column.
    'ALTER TABLE post_metrics ADD COLUMN metadata_json TEXT DEFAULT \'{}\'',
    'ALTER TABLE approvals ADD COLUMN approved_by TEXT',
    'ALTER TABLE approvals ADD COLUMN approved_at TEXT',
    'CREATE TABLE IF NOT EXISTS approval_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, approval_id TEXT NOT NULL, artifact_id TEXT, actor_id TEXT, actor_email TEXT, action TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS approval_events_approval ON approval_events(approval_id, created_at DESC)',
    'ALTER TABLE brand_profiles ADD COLUMN icp_json TEXT DEFAULT \'{}\'',
    'ALTER TABLE brand_profiles ADD COLUMN logo_url TEXT',
    'CREATE TABLE IF NOT EXISTS lead_magnets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, asset_url TEXT NOT NULL, funnel_id TEXT, download_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS lead_magnets_ws ON lead_magnets(workspace_id)',
    // === Phase Remediation: BYOK secrets + notifications + agent configs ===
    'CREATE TABLE IF NOT EXISTS workspace_secrets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, encrypted_value TEXT NOT NULL, label TEXT, status TEXT DEFAULT \'active\', last_tested_at TEXT, test_result TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_secrets_unique ON workspace_secrets(workspace_id, provider)',
    'CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, severity TEXT DEFAULT \'info\', read_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, read_at, created_at DESC)',
    'CREATE TABLE IF NOT EXISTS agent_configs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, agent_slug TEXT NOT NULL, model TEXT, instructions TEXT, tone TEXT, max_tasks_per_day INTEGER DEFAULT 100, priority TEXT DEFAULT \'normal\', allowed_tools TEXT DEFAULT \'[]\', use_byok INTEGER DEFAULT 1, schedule TEXT DEFAULT \'always\', daily_cost_cap REAL DEFAULT 50, escalate_to TEXT, status TEXT DEFAULT \'active\', updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_unique ON agent_configs(workspace_id, agent_slug)',
    'CREATE TABLE IF NOT EXISTS ab_tests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, content_type TEXT, goal_metric TEXT, duration INTEGER DEFAULT 7, status TEXT DEFAULT \'Running\', variant_a TEXT NOT NULL, variant_b TEXT NOT NULL, variant_a_stats TEXT DEFAULT \'{}\', variant_b_stats TEXT DEFAULT \'{}\', winner TEXT, confidence INTEGER DEFAULT 0, ai_insight TEXT, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_ab_tests_workspace ON ab_tests(workspace_id, status)',
    'CREATE TABLE IF NOT EXISTS ab_test_insights (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_test_id TEXT, text TEXT NOT NULL, lift REAL DEFAULT 0, deployed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_ab_test_insights_workspace ON ab_test_insights(workspace_id, created_at DESC)',
    // === Streaming agent runs (Step 1 of Agent Console redesign) ===
    // Persists meaningful lifecycle events emitted by lib/agent-stream.ts for
    // audit + replay. "token" delta events are intentionally NOT persisted (too noisy).
    'CREATE TABLE IF NOT EXISTS agent_run_events (id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL, workspace_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(agent_run_id, created_at ASC)',
    'CREATE INDEX IF NOT EXISTS idx_agent_run_events_workspace ON agent_run_events(workspace_id, created_at DESC)',
    // Sub-agent runs (e.g. CMO spawning research+brand_voice+strategy) reference their orchestrator.
    'ALTER TABLE agent_runs ADD COLUMN parent_run_id TEXT',
    // === Strategy decomposition tasks ===
    // When a Strategy artifact is approved, the CMO decomposes it into concrete
    // execution tasks for sub-agents. Each task lifecycle: pending → queued
    // → running → completed | failed. The produced_artifact_id links back to
    // the artifact that the dispatched sub-agent produced.
    'CREATE TABLE IF NOT EXISTS project_tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, initiative_run_id TEXT NOT NULL, parent_artifact_id TEXT NOT NULL, task_index INTEGER NOT NULL DEFAULT 0, agent TEXT NOT NULL, task_type TEXT NOT NULL, task_brief TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', agent_run_id TEXT, produced_artifact_id TEXT, error_message TEXT, created_at TEXT DEFAULT (datetime(\'now\')), started_at TEXT, completed_at TEXT)',
    'CREATE INDEX IF NOT EXISTS idx_project_tasks_initiative ON project_tasks(initiative_run_id, task_index ASC)',
    'CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace ON project_tasks(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status, created_at ASC)',
    // === Sprint 2 Commit 1: Agent Lifecycle + Workspace Projects (SQLite track) ===
    //
    //   `agents` — per-workspace agent registry. This is the table the
    //   operator's Pause/Resume UI mutates and the cron worker filters on
    //   (`WHERE status = 'active'`). SQLite honours CHECK constraints in
    //   CREATE TABLE, so the four-state vocabulary is enforced at write time.
    //
    //   The status check matches the Postgres definition above:
    //   active / paused / error / disabled. paused_at / paused_by capture
    //   the moment of pause for audit attribution.
    //
    //   The runner loop at the bottom of this array wraps every statement
    //   in try/catch — so the follow-up ALTER TABLE ADD COLUMN entries below
    //   are safe on re-run (SQLite throws "duplicate column name", we swallow).
    //   Timestamps use SQLite's `datetime(\'now\')` default (TEXT-encoded ISO)
    //   instead of TIMESTAMPTZ so the same row shape works on both engines.
    'CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'active\' CHECK (status IN (\'active\', \'paused\', \'error\', \'disabled\')), paused_at TEXT, paused_by TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    // Forward-compat ALTERs for installs where `agents` predates this commit.
    // The migration runner's try/catch makes "duplicate column" a no-op.
    'ALTER TABLE agents ADD COLUMN status TEXT NOT NULL DEFAULT \'active\'',
    'ALTER TABLE agents ADD COLUMN paused_at TEXT',
    'ALTER TABLE agents ADD COLUMN paused_by TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_workspace_name ON agents(workspace_id, name)',
    'CREATE INDEX IF NOT EXISTS idx_agents_workspace_status ON agents(workspace_id, status)',
    //
    //   `workspace_projects` — persistent project registry replacing the
    //   `ooumph_projects_v1` localStorage stash on the CMO dashboard. Minimal
    //   shape (id / name / status / timestamps) per Sprint 2 spec — no CHECK
    //   so callers can evolve the status vocabulary without a migration.
    'CREATE TABLE IF NOT EXISTS workspace_projects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'active\', created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace ON workspace_projects(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_workspace_projects_status ON workspace_projects(workspace_id, status)',
    // === Sprint 1: Email Department schema ===
    // ALTER additions to email_campaigns: artifact_id links to the AI-generated
    // source artifact (powering the assertArtifactApproved safety gate),
    // scheduled_for + provider tracking + counters for bounce/unsubscribe/fail.
    // The try/catch wrapper around db.exec() makes each ALTER idempotent
    // (SQLite throws "duplicate column name" if it already exists — we swallow).
    'ALTER TABLE email_campaigns ADD COLUMN artifact_id TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN list_id TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN scheduled_for TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN from_name TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN from_email TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN reply_to TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN preview_text TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN provider TEXT DEFAULT \'resend\'',
    'ALTER TABLE email_campaigns ADD COLUMN provider_campaign_id TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN bounce_count INTEGER DEFAULT 0',
    'ALTER TABLE email_campaigns ADD COLUMN unsubscribe_count INTEGER DEFAULT 0',
    'ALTER TABLE email_campaigns ADD COLUMN failed_count INTEGER DEFAULT 0',
    'ALTER TABLE email_campaigns ADD COLUMN error_message TEXT',
    'ALTER TABLE email_campaigns ADD COLUMN updated_at TEXT DEFAULT (datetime(\'now\'))',
    'ALTER TABLE email_campaigns ADD COLUMN created_by TEXT',
    'CREATE INDEX IF NOT EXISTS idx_email_campaigns_artifact ON email_campaigns(artifact_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_schedule ON email_campaigns(status, scheduled_for)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaigns_workspace ON email_campaigns(workspace_id, created_at DESC)',
    // email_subscribers extensibility — Klaviyo-level segmentation needs first/
    // last name split, phone, consent tracking (GDPR/CAN-SPAM), bounce
    // accounting, engagement recency, custom_fields for arbitrary attributes.
    'ALTER TABLE email_subscribers ADD COLUMN phone TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN first_name TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN last_name TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN unsubscribed_at TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN bounce_count INTEGER DEFAULT 0',
    'ALTER TABLE email_subscribers ADD COLUMN last_engaged_at TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN source TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN custom_fields TEXT DEFAULT \'{}\'',
    'ALTER TABLE email_subscribers ADD COLUMN consent_given_at TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN consent_source TEXT',
    'ALTER TABLE email_subscribers ADD COLUMN updated_at TEXT DEFAULT (datetime(\'now\'))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscribers_workspace_email ON email_subscribers(workspace_id, email)',
    'CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(workspace_id, status)',
    // Contact lists — addressable audience segments. A subscriber may belong
    // to multiple lists via the email_list_members junction table.
    'CREATE TABLE IF NOT EXISTS email_lists (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT DEFAULT \'active\', subscriber_count INTEGER DEFAULT 0, default_from_name TEXT, default_from_email TEXT, double_opt_in INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_email_lists_workspace ON email_lists(workspace_id, status)',
    'CREATE TABLE IF NOT EXISTS email_list_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, list_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, status TEXT DEFAULT \'subscribed\', added_at TEXT DEFAULT (datetime(\'now\')), unsubscribed_at TEXT)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_members_unique ON email_list_members(list_id, subscriber_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_list_members_subscriber ON email_list_members(subscriber_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_list_members_workspace ON email_list_members(workspace_id, status)',
    // Per-recipient delivery ledger — gives us granular open/click/bounce
    // tracking and is the only place a real provider message_id is persisted
    // (so webhook callbacks from Resend/Postmark can correlate back).
    'CREATE TABLE IF NOT EXISTS email_campaign_sends (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_id TEXT NOT NULL, subscriber_id TEXT, email_address TEXT NOT NULL, status TEXT DEFAULT \'queued\', external_message_id TEXT, error_message TEXT, sent_at TEXT, opened_at TEXT, clicked_at TEXT, bounced_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_campaign ON email_campaign_sends(campaign_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_subscriber ON email_campaign_sends(subscriber_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_workspace ON email_campaign_sends(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_external ON email_campaign_sends(external_message_id)',
    // === Sprint 2: Publishing & Social schema ===
    // scheduled_content gets Sprint-2 canonical columns; existing (platform /
    // content / scheduled_for) stay for back-compat. The wrapping try/catch
    // around db.exec() in this migration loop makes each ALTER idempotent —
    // SQLite throws "duplicate column name" if it already exists and we swallow.
    'ALTER TABLE scheduled_content ADD COLUMN channel TEXT',
    'ALTER TABLE scheduled_content ADD COLUMN content_body TEXT',
    'ALTER TABLE scheduled_content ADD COLUMN scheduled_at TEXT',
    'ALTER TABLE scheduled_content ADD COLUMN retry_count INTEGER DEFAULT 0',
    'ALTER TABLE scheduled_content ADD COLUMN updated_at TEXT DEFAULT (datetime(\'now\'))',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_content_workspace_schedule ON scheduled_content(workspace_id, scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_content_status_schedule ON scheduled_content(status, scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_scheduled_content_artifact ON scheduled_content(artifact_id)',
    // published_content — link back to the scheduled_content row, plus
    // Sprint-2 canonical fields (channel, native_post_id, permalink).
    'ALTER TABLE published_content ADD COLUMN scheduled_content_id TEXT',
    'ALTER TABLE published_content ADD COLUMN channel TEXT',
    'ALTER TABLE published_content ADD COLUMN native_post_id TEXT',
    'ALTER TABLE published_content ADD COLUMN permalink TEXT',
    'CREATE INDEX IF NOT EXISTS idx_published_content_workspace ON published_content(workspace_id, published_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_published_content_scheduled ON published_content(scheduled_content_id)',
    'CREATE INDEX IF NOT EXISTS idx_published_content_channel ON published_content(workspace_id, channel)',
    // OAuth tokens — encrypted credentials per (workspace, platform). Access
    // and refresh tokens are encrypted via lib/secrets.ts before storage.
    'CREATE TABLE IF NOT EXISTS oauth_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform TEXT NOT NULL, encrypted_access_token TEXT NOT NULL, encrypted_refresh_token TEXT, expires_at TEXT, scope TEXT, account_id TEXT, account_label TEXT, status TEXT DEFAULT \'active\', last_refreshed_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_unique ON oauth_tokens(workspace_id, platform)',
    'CREATE INDEX IF NOT EXISTS idx_oauth_tokens_status ON oauth_tokens(status, expires_at)',
    // Tracked links — for the URL shortener / analytics redirector (/api/l/:slug)
    'CREATE TABLE IF NOT EXISTS tracked_links (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL, original_url TEXT NOT NULL, scheduled_content_id TEXT, published_content_id TEXT, channel TEXT, campaign_id TEXT, click_count INTEGER DEFAULT 0, last_clicked_at TEXT, status TEXT DEFAULT \'active\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_tracked_links_workspace ON tracked_links(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_tracked_links_scheduled ON tracked_links(scheduled_content_id)',
    'CREATE INDEX IF NOT EXISTS idx_tracked_links_channel ON tracked_links(workspace_id, channel)',
    'CREATE TABLE IF NOT EXISTS link_clicks (id TEXT PRIMARY KEY, slug TEXT NOT NULL, workspace_id TEXT NOT NULL, channel TEXT, referrer TEXT, user_agent TEXT, country TEXT, clicked_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_link_clicks_slug ON link_clicks(slug, clicked_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_link_clicks_workspace ON link_clicks(workspace_id, clicked_at DESC)',
    // === Sprint 3: Paid Acquisition Department ===
    // ad_campaigns — canonical paid campaign rows
    'CREATE TABLE IF NOT EXISTS ad_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform TEXT NOT NULL, native_campaign_id TEXT, name TEXT NOT NULL, daily_budget INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'draft\', error_log TEXT, utm_override TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    // Upgrade path for installs that ran the pre-amendment Sprint-3 Commit 1.
    // try/catch wrapper around db.exec() swallows the "duplicate column" error
    // on fresh installs where the CREATE above already included the column.
    'ALTER TABLE ad_campaigns ADD COLUMN utm_override TEXT',
    'CREATE INDEX IF NOT EXISTS idx_ad_campaigns_workspace_status ON ad_campaigns(workspace_id, status)',
    // ad_creatives — individual creatives in a campaign (artifact_id is the HITL safety gate)
    'CREATE TABLE IF NOT EXISTS ad_creatives (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, ad_campaign_id TEXT NOT NULL, artifact_id TEXT, headline TEXT NOT NULL, body_copy TEXT NOT NULL, media_url TEXT, destination_url TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_ad_creatives_artifact ON ad_creatives(artifact_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives(ad_campaign_id)',
    // funnel_steps — landing / thank-you pages served at /lp/[slug]
    'CREATE TABLE IF NOT EXISTS funnel_steps (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, html_content TEXT NOT NULL, view_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_funnel_steps_workspace ON funnel_steps(workspace_id, created_at DESC)',
    // form_submissions — leads captured from a funnel_step
    'CREATE TABLE IF NOT EXISTS form_submissions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, funnel_step_id TEXT NOT NULL, email TEXT, submitted_data TEXT NOT NULL DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_form_submissions_step_email ON form_submissions(funnel_step_id, email)',
    'CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace ON form_submissions(workspace_id, created_at DESC)',
    // === Sprint 4: Lead Gen & CRM Department ===
    // Each ALTER is wrapped in the migration loop's try/catch — "duplicate
    // column name" errors are swallowed so re-running these is safe.
    'ALTER TABLE leads_captured ADD COLUMN enrichment_status TEXT DEFAULT \'pending\'',
    'ALTER TABLE leads_captured ADD COLUMN company_name TEXT',
    'ALTER TABLE leads_captured ADD COLUMN company_size TEXT',
    'ALTER TABLE leads_captured ADD COLUMN estimated_revenue TEXT',
    'ALTER TABLE leads_captured ADD COLUMN industry TEXT',
    'ALTER TABLE leads_captured ADD COLUMN linkedin_url TEXT',
    'ALTER TABLE leads_captured ADD COLUMN twitter_url TEXT',
    'ALTER TABLE leads_captured ADD COLUMN tech_stack TEXT DEFAULT \'[]\'',
    'ALTER TABLE leads_captured ADD COLUMN enrichment_summary TEXT',
    'CREATE INDEX IF NOT EXISTS idx_leads_captured_workspace_enrichment ON leads_captured(workspace_id, enrichment_status)',
    // Sprint-4 canonical activity_type alongside legacy type column
    'ALTER TABLE lead_activities ADD COLUMN activity_type TEXT',
    'CREATE INDEX IF NOT EXISTS idx_lead_activities_workspace_type ON lead_activities(workspace_id, activity_type)',
    // enrichment_logs — per-provider raw response capture for replay/audit
    'CREATE TABLE IF NOT EXISTS enrichment_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, provider_used TEXT NOT NULL, execution_time_ms INTEGER, raw_response TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead ON enrichment_logs(lead_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_enrichment_logs_provider ON enrichment_logs(workspace_id, provider_used, created_at DESC)',
    // === Sprint 5: PR & Reputation Desk ===
    // PR Circuit Breaker — single workspace-level kill switch
    'ALTER TABLE workspaces ADD COLUMN crisis_status TEXT DEFAULT \'clear\'',
    'ALTER TABLE workspaces ADD COLUMN crisis_tripped_at TEXT',
    // brand_mentions — public scraped references with severity + status routing
    'CREATE TABLE IF NOT EXISTS brand_mentions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_platform TEXT NOT NULL, source_url TEXT, author_handle TEXT, content_text TEXT NOT NULL, sentiment_score REAL DEFAULT 1.00, severity_level TEXT DEFAULT \'low\', status TEXT DEFAULT \'unread\', detected_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_severity_status ON brand_mentions(workspace_id, severity_level, status)',
    'CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_recent ON brand_mentions(workspace_id, created_at DESC)',
    // pr_campaigns — press release drafts gated by the standard artifact_id HITL hook
    'CREATE TABLE IF NOT EXISTS pr_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, title TEXT NOT NULL, body_content TEXT NOT NULL, status TEXT DEFAULT \'draft\', error_log TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_pr_campaigns_workspace_status ON pr_campaigns(workspace_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_pr_campaigns_artifact ON pr_campaigns(artifact_id)',
    // media_contacts — journalist CRM with workspace-scoped UNIQUE(email)
    'CREATE TABLE IF NOT EXISTS media_contacts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, journalist_name TEXT NOT NULL, email TEXT, outlet_name TEXT, beat_focus TEXT, linkedin_url TEXT, twitter_url TEXT, notes TEXT, last_contacted_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_media_contacts_unique ON media_contacts(workspace_id, email)',
    'CREATE INDEX IF NOT EXISTS idx_media_contacts_workspace_beat ON media_contacts(workspace_id, beat_focus)',
    // === Sprint 6: Creative Studio & Media Unification ===
    // SQLite doesn't enforce REFERENCES by default but accepts the syntax — kept for parity.
    // The parent_asset_id self-reference enables the asset variation tree.
    'CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, filename TEXT NOT NULL, url TEXT NOT NULL, asset_type TEXT NOT NULL, mime_type TEXT, file_size INTEGER, dimensions TEXT, duration_seconds REAL, source_provider TEXT, metadata_json TEXT DEFAULT \'{}\', status TEXT DEFAULT \'ready\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_type ON media_assets(workspace_id, asset_type)',
    'CREATE INDEX IF NOT EXISTS idx_media_assets_parent ON media_assets(parent_asset_id)',
    'CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_recent ON media_assets(workspace_id, created_at DESC)',
    // creative_generation_jobs — async generation queue gated by artifact HITL
    'CREATE TABLE IF NOT EXISTS creative_generation_jobs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, provider TEXT NOT NULL, model_name TEXT, prompt_text TEXT NOT NULL, negative_prompt TEXT, status TEXT DEFAULT \'pending\', result_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, cost_estimate REAL DEFAULT 0, duration_ms INTEGER, error_message TEXT, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_status ON creative_generation_jobs(workspace_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_creative_jobs_artifact ON creative_generation_jobs(artifact_id)',
    'CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_recent ON creative_generation_jobs(workspace_id, created_at DESC)',
    // voice_profiles — UNIQUE (workspace_id, native_provider_voice_id) blocks dup registration
    'CREATE TABLE IF NOT EXISTS voice_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_name TEXT NOT NULL, native_provider_voice_id TEXT NOT NULL, provider TEXT DEFAULT \'elevenlabs\', gender TEXT, accent_label TEXT, sample_url TEXT, status TEXT DEFAULT \'active\', is_default INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_unique ON voice_profiles(workspace_id, native_provider_voice_id)',
    'CREATE INDEX IF NOT EXISTS idx_voice_profiles_workspace_status ON voice_profiles(workspace_id, status)',
    // === Sprint 7: Growth & Experiments ===
    // marketing_experiments — polymorphic test definition (any target_type)
    'CREATE TABLE IF NOT EXISTS marketing_experiments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, target_type TEXT NOT NULL, target_reference_id TEXT NOT NULL, status TEXT DEFAULT \'draft\', statistical_significance_threshold REAL DEFAULT 0.95, winner_variant_id TEXT, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_marketing_experiments_workspace_status ON marketing_experiments(workspace_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_marketing_experiments_target ON marketing_experiments(workspace_id, target_type, target_reference_id)',
    // experiment_variants — test arms with override JSON + denormalised tally counters
    'CREATE TABLE IF NOT EXISTS experiment_variants (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, experiment_id TEXT NOT NULL REFERENCES marketing_experiments(id) ON DELETE CASCADE, variant_label TEXT NOT NULL, configuration_override_json TEXT NOT NULL DEFAULT \'{}\', traffic_allocation_weight INTEGER NOT NULL DEFAULT 50, impression_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_experiment_variants_lookup ON experiment_variants(experiment_id, variant_label)',
    'CREATE INDEX IF NOT EXISTS idx_experiment_variants_workspace ON experiment_variants(workspace_id, experiment_id)',
    // experiment_events — append-only ledger with deterministic tracking_id
    'CREATE TABLE IF NOT EXISTS experiment_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, variant_id TEXT NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE, tracking_id TEXT NOT NULL, event_type TEXT NOT NULL, event_value REAL, metadata_json TEXT DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_experiment_events_variant_type ON experiment_events(variant_id, event_type, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_experiment_events_tracking ON experiment_events(tracking_id)',
    'CREATE INDEX IF NOT EXISTS idx_experiment_events_workspace_recent ON experiment_events(workspace_id, created_at DESC)',
    // === Sprint 8: Voice AI & Inbound Call Center (SQLite local-dev path) ===
    // voice_agents — composite UNIQUE (workspace_id, phone_number) blocks
    // dual trunk assignment within a workspace. SQLite (unlike Postgres) treats
    // NULL as equal in unique indexes, so two NULL-phone agents would collide.
    // We don't enforce a phone in dev; relax the constraint by NOT marking
    // phone_number NOT NULL — and rely on the app layer to refuse duplicate
    // NON-NULL pairs the same way the Postgres UNIQUE does in prod.
    'CREATE TABLE IF NOT EXISTS voice_agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_profile_id TEXT REFERENCES voice_profiles(id) ON DELETE SET NULL, provider TEXT DEFAULT \'vapi\', agent_name TEXT NOT NULL, phone_number TEXT, system_prompt TEXT, temperature REAL DEFAULT 0.70, llm_model TEXT DEFAULT \'gpt-4o\', status TEXT DEFAULT \'active\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_agents_workspace_phone ON voice_agents(workspace_id, phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_voice_agents_workspace_status ON voice_agents(workspace_id, status)',
    // call_logs — append-only ledger. Hot path is the chronological feed
    // (workspace_id, created_at DESC); the per-lead history subview uses
    // lead_id. duration_seconds defaults to 0 so partial webhook payloads
    // (call started but never ended) still satisfy NOT NULL semantics.
    'CREATE TABLE IF NOT EXISTS call_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_agent_id TEXT REFERENCES voice_agents(id) ON DELETE SET NULL, lead_id TEXT REFERENCES leads_captured(id) ON DELETE SET NULL, provider TEXT, direction TEXT, from_number TEXT, to_number TEXT, duration_seconds INTEGER DEFAULT 0, recording_url TEXT, transcript TEXT, summary TEXT, sentiment_score REAL, call_status TEXT DEFAULT \'completed\', action_taken TEXT, metadata_json TEXT DEFAULT \'{}\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_recent ON call_logs(workspace_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id)',
    // CRM phone-lookup hot path (inbound webhook resolution → lead_id).
    'CREATE INDEX IF NOT EXISTS idx_leads_captured_phone ON leads_captured(phone)',
    // === Sprint 9: Agency Ops & Third-Party Connections (SQLite local-dev path) ===
    // developer_tokens — only the sha256 hash is stored; plaintext shown once.
    'CREATE TABLE IF NOT EXISTS developer_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token_name TEXT NOT NULL, token_hash TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT \'[]\', last_used_at TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_developer_tokens_hash ON developer_tokens(token_hash)',
    'CREATE INDEX IF NOT EXISTS idx_developer_tokens_workspace ON developer_tokens(workspace_id)',
    // webhook_subscriptions — outbound fan-out registry. The (workspace_id,
    // event_type, status) composite covers the dispatcher's only access pattern.
    'CREATE TABLE IF NOT EXISTS webhook_subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, target_url TEXT NOT NULL, event_type TEXT NOT NULL, secret_signature TEXT NOT NULL, status TEXT DEFAULT \'active\', created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_webhook_subs_router ON webhook_subscriptions(workspace_id, event_type, status)',
    // Forensic columns — additive so re-running the migration is idempotent.
    'ALTER TABLE webhook_subscriptions ADD COLUMN last_error_log TEXT',
    'ALTER TABLE webhook_subscriptions ADD COLUMN last_attempt_at TEXT',
    'ALTER TABLE webhook_subscriptions ADD COLUMN last_attempt_status TEXT',
    // integration_connections — UNIQUE (workspace_id, provider_slug) makes
    // the "Connect Stripe" button idempotent. credentials_encrypted is the
    // AES-256-GCM blob from lib/secrets.ts — never plaintext.
    'CREATE TABLE IF NOT EXISTS integration_connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider_slug TEXT NOT NULL, credentials_encrypted TEXT, status TEXT DEFAULT \'connected\', updated_at TEXT DEFAULT (datetime(\'now\')), created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_unique ON integration_connections(workspace_id, provider_slug)',
    'CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_status ON integration_connections(workspace_id, status)',
    // === Sprint 10: System Polish & Performance Hardening (SQLite local-dev path) ===
    // system_performance_audits — append-only telemetry for /dashboard/system-health.
    // (workspace_id, operation_name, created_at DESC) is the only access pattern.
    'CREATE TABLE IF NOT EXISTS system_performance_audits (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, operation_name TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'ok\', error_captured TEXT, created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE INDEX IF NOT EXISTS idx_perf_audits_workspace_op_recent ON system_performance_audits(workspace_id, operation_name, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_perf_audits_status ON system_performance_audits(workspace_id, status, created_at DESC)',
    // workspace_retention_policies — per-tenant log-rotation rules. UNIQUE
    // (workspace_id, stream_target) makes the upsert path collision-free
    // when the settings page edits a policy in place.
    'CREATE TABLE IF NOT EXISTS workspace_retention_policies (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, stream_target TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 90, action_disposition TEXT NOT NULL DEFAULT \'purge\', updated_at TEXT DEFAULT (datetime(\'now\')), created_at TEXT DEFAULT (datetime(\'now\')))',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_unique ON workspace_retention_policies(workspace_id, stream_target)',
    'CREATE INDEX IF NOT EXISTS idx_retention_policies_workspace ON workspace_retention_policies(workspace_id)',
    // Dual-Key Budget Lock — values stored as cents on the workspaces row
    'ALTER TABLE workspaces ADD COLUMN hard_max_daily_spend INTEGER NOT NULL DEFAULT 50000',
    'ALTER TABLE workspaces ADD COLUMN alert_threshold_budget INTEGER NOT NULL DEFAULT 25000',
    // Workspace-level UTM template (e.g. "utm_source={platform}&utm_medium=cpc&utm_campaign={campaign_slug}").
    // Wrapped in try/catch by the migration loop — safe to run twice.
    'ALTER TABLE workspaces ADD COLUMN utm_template TEXT',
    // Audit pass #6 P1: composite index for approvals UI + auto-approve cron.
    // SQLite gracefully ignores DESC in index columns.
    'CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status_created ON approvals(workspace_id, status, created_at DESC)',
    // Audit pass #6 P1: dedicated indexed column to replace metadata_json LIKE
    // scans on the GHL webhook hot path.
    'ALTER TABLE lead_activities ADD COLUMN ghl_contact_id TEXT',
    'CREATE INDEX IF NOT EXISTS idx_lead_activities_ghl_contact ON lead_activities(workspace_id, ghl_contact_id)',
  ]
  for (const m of migrations) {
    try { db.exec(m) } catch { /* column already exists */ }
  }
}

export async function initializeDatabase() {
  if (!process.env.POSTGRES_URL) {
    getDb() // triggers SQLite init
    console.log('✅ SQLite DB ready at ooumph.db')
    return
  }
  // Neon Postgres init
  const { neon } = await import('@neondatabase/serverless')
  const pgSql = neon(process.env.POSTGRES_URL)
  await pgSql`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name VARCHAR(255) NOT NULL, industry VARCHAR(255), website VARCHAR(500), owner_email VARCHAR(255) NOT NULL, status VARCHAR(50) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS brand_profiles (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), business_name VARCHAR(255), tagline TEXT, offer TEXT, unique_value TEXT, target_audience TEXT, tone VARCHAR(255), competitors TEXT, channels TEXT, goals TEXT, monthly_budget VARCHAR(100), prohibited_claims TEXT, approval_email VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), agent_name VARCHAR(100) NOT NULL, status VARCHAR(50) DEFAULT 'pending', input_json TEXT, output_json TEXT, cost_estimate DECIMAL(10,4), error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
  await pgSql`CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), agent_run_id TEXT REFERENCES agent_runs(id), type VARCHAR(100) NOT NULL, title VARCHAR(500) NOT NULL, content_json TEXT NOT NULL, status VARCHAR(50) DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), artifact_id TEXT REFERENCES artifacts(id), status VARCHAR(50) DEFAULT 'pending', approver_email VARCHAR(255), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS learning_notes (id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), source_type VARCHAR(100), source_id TEXT, note TEXT NOT NULL, confidence DECIMAL(3,2) DEFAULT 0.8, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, access_token TEXT, account_id TEXT, status VARCHAR(50) DEFAULT 'active', connected_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS publish_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, platform VARCHAR(50) NOT NULL, post_id TEXT, post_url TEXT, status VARCHAR(50) DEFAULT 'published', published_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS creative_requests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, requesting_agent VARCHAR(100) NOT NULL, creative_type VARCHAR(100) NOT NULL, context_json TEXT, priority VARCHAR(20) DEFAULT 'normal', status VARCHAR(50) DEFAULT 'pending', artifact_id TEXT, publish_platforms TEXT, error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
  await pgSql`CREATE TABLE IF NOT EXISTS campaign_platform_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, platform_campaign_id TEXT NOT NULL, platform_adset_ids TEXT DEFAULT '[]', platform_ad_ids TEXT DEFAULT '[]', status VARCHAR(50) DEFAULT 'active', error_message TEXT, last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS campaign_performance (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, platform_campaign_id TEXT, date TEXT NOT NULL, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, spend DECIMAL(12,4) DEFAULT 0, conversions INTEGER DEFAULT 0, revenue DECIMAL(12,4) DEFAULT 0, ctr DECIMAL(8,6) DEFAULT 0, cpc DECIMAL(10,4) DEFAULT 0, cpa DECIMAL(10,4) DEFAULT 0, roas DECIMAL(8,4) DEFAULT 0, additional_metrics TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS campaign_optimizations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_artifact_id TEXT NOT NULL, report_json TEXT NOT NULL, health_score INTEGER DEFAULT 0, overall_health VARCHAR(30), created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS scheduled_posts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, content_json TEXT NOT NULL, artifact_id TEXT, scheduled_time TIMESTAMPTZ NOT NULL, status VARCHAR(50) DEFAULT 'queued', error TEXT, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS kpi_targets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, targets_json TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS leads_captured (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, email VARCHAR(255), phone VARCHAR(50), source VARCHAR(100) DEFAULT 'manual', campaign TEXT, status VARCHAR(50) DEFAULT 'new', score INTEGER DEFAULT 0, notes TEXT, custom_fields TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS email_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name VARCHAR(255) NOT NULL, subject TEXT, status VARCHAR(50) DEFAULT 'draft', recipient_count INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, open_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0, content_json TEXT DEFAULT '{}', sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS email_subscribers (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email VARCHAR(255) NOT NULL, name TEXT, status VARCHAR(50) DEFAULT 'subscribed', tags TEXT DEFAULT '[]', subscribed_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata TEXT`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id TEXT`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS model_settings TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS extra_settings TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS hubspot_id TEXT`
  await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS brand_voice_score INTEGER`
  await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS brand_voice_reasoning TEXT`
  // Audit pass #6 P1: composite index for paginated approvals UI fetch and
  // hourly auto-approve cron.
  await pgSql`CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status_created ON approvals(workspace_id, status, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS brand_memory (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'learning_note', platform TEXT, performance_score INTEGER DEFAULT 0, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_memory_workspace ON brand_memory(workspace_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS scheduled_content (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform TEXT NOT NULL, content TEXT NOT NULL, media_urls TEXT DEFAULT '[]', artifact_id TEXT, scheduled_for TEXT, buffer_update_id TEXT, status TEXT NOT NULL DEFAULT 'pending', error_message TEXT, published_at TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS published_content (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, platform TEXT NOT NULL, post_id TEXT, post_url TEXT, title TEXT, published_at TIMESTAMPTZ DEFAULT NOW(), metadata_json TEXT DEFAULT '{}')`
  await pgSql`CREATE TABLE IF NOT EXISTS inbox_conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_email TEXT, contact_name TEXT, contact_phone TEXT, channel TEXT NOT NULL DEFAULT 'email', subject TEXT, status TEXT DEFAULT 'open', tags TEXT DEFAULT '[]', assigned_to TEXT, last_message_at TIMESTAMPTZ, unread_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS inbox_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, workspace_id TEXT NOT NULL, direction TEXT NOT NULL, from_address TEXT, to_address TEXT, subject TEXT, body TEXT NOT NULL, html_body TEXT, channel TEXT DEFAULT 'email', status TEXT DEFAULT 'sent', external_id TEXT, ai_generated INTEGER DEFAULT 0, sent_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, contact_phone TEXT, title TEXT NOT NULL, description TEXT, start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, timezone TEXT DEFAULT 'UTC', status TEXT DEFAULT 'confirmed', meeting_url TEXT, calendar_event_id TEXT, reminder_sent INTEGER DEFAULT 0, notes TEXT, source TEXT DEFAULT 'manual', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS calendar_availability (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, days_of_week TEXT DEFAULT '[1,2,3,4,5]', start_hour INTEGER DEFAULT 9, end_hour INTEGER DEFAULT 17, slot_minutes INTEGER DEFAULT 30, timezone TEXT DEFAULT 'UTC', buffer_minutes INTEGER DEFAULT 10, advance_days INTEGER DEFAULT 14, updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS lead_activities (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC)`
  // Audit pass #6 P1: dedicated indexed column to replace metadata_json LIKE scans.
  await pgSql`ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_ghl_contact ON lead_activities(workspace_id, ghl_contact_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, trigger_type TEXT NOT NULL, trigger_config TEXT DEFAULT '{}', nodes TEXT NOT NULL DEFAULT '[]', status TEXT DEFAULT 'draft', run_count INTEGER DEFAULT 0, last_run_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_id TEXT, contact_email TEXT, trigger_data TEXT DEFAULT '{}', status TEXT DEFAULT 'running', current_node INTEGER DEFAULT 0, nodes_completed TEXT DEFAULT '[]', error_message TEXT, started_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`
  await pgSql`CREATE TABLE IF NOT EXISTS workflow_pending_steps (id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL, workflow_id TEXT NOT NULL, workspace_id TEXT NOT NULL, node_index INTEGER NOT NULL, node_data TEXT NOT NULL, lead_id TEXT, contact_email TEXT, scheduled_for TIMESTAMPTZ NOT NULL, status TEXT DEFAULT 'pending', error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_pending_steps_scheduled ON workflow_pending_steps(scheduled_for, status)`
  await pgSql`CREATE TABLE IF NOT EXISTS reputation_reviews (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT, source TEXT NOT NULL DEFAULT 'manual', rating INTEGER, title TEXT, body TEXT, sentiment TEXT DEFAULT 'neutral', status TEXT DEFAULT 'new', response_text TEXT, response_sent_at TIMESTAMPTZ, external_id TEXT, external_url TEXT, booking_id TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS reputation_requests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact_id TEXT, contact_name TEXT, contact_email TEXT NOT NULL, booking_id TEXT, status TEXT DEFAULT 'pending', sent_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ, review_platform TEXT DEFAULT 'google', review_link TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_reputation_reviews_workspace ON reputation_reviews(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_reputation_requests_workspace ON reputation_requests(workspace_id, created_at DESC)`
  await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id TEXT`
  await pgSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended INTEGER DEFAULT 0`
  await pgSql`CREATE TABLE IF NOT EXISTS admin_audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_email TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, details_json TEXT, ip_address TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, price_monthly INTEGER NOT NULL, price_yearly INTEGER, stripe_price_id TEXT, stripe_price_id_yearly TEXT, commission_rate REAL DEFAULT 0.15, max_sub_accounts INTEGER DEFAULT 0, max_ai_runs_monthly INTEGER DEFAULT 500, features TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT 'trialing', current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ, cancel_at_period_end INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS vendor_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, stripe_connect_account_id TEXT, stripe_connect_status TEXT DEFAULT 'not_connected', commission_rate_override REAL, white_label_name TEXT, white_label_logo_url TEXT, white_label_primary_color TEXT DEFAULT '#4F46E5', white_label_domain TEXT, is_approved INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS client_accounts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_workspace_id TEXT, client_name TEXT NOT NULL, client_email TEXT NOT NULL, price_monthly INTEGER NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT DEFAULT 'trial', trial_ends_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS commission_ledger (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, client_account_id TEXT, gross_amount INTEGER NOT NULL, commission_rate REAL NOT NULL, commission_amount INTEGER NOT NULL, net_amount INTEGER NOT NULL, stripe_payment_intent_id TEXT, stripe_transfer_id TEXT, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_commission_ledger_vendor ON commission_ledger(vendor_workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_client_accounts_vendor ON client_accounts(vendor_workspace_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role VARCHAR(50) DEFAULT 'member', invited_by TEXT, joined_at TIMESTAMPTZ DEFAULT NOW(), status VARCHAR(50) DEFAULT 'active')`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_unique ON workspace_members(workspace_id, user_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS workspace_invites (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'member', token TEXT NOT NULL UNIQUE, status VARCHAR(50) DEFAULT 'pending', invited_by TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS sales_deals (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT, contact_name TEXT NOT NULL, contact_email TEXT, company TEXT, title TEXT NOT NULL, value REAL DEFAULT 0, currency VARCHAR(10) DEFAULT 'USD', stage VARCHAR(50) DEFAULT 'prospect', probability INTEGER DEFAULT 10, expected_close TEXT, actual_close TEXT, notes TEXT, source TEXT, custom_fields TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_sales_deals_workspace ON sales_deals(workspace_id, stage)`
  // Sprint 6E: Lost-reason capture for sales_deals.
  await pgSql`ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS lost_reason TEXT`
  await pgSql`ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ`
  // Sprint 6G: per-post organic engagement.
  await pgSql`CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, post_id TEXT, impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, video_views INTEGER DEFAULT 0, last_synced_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_unique ON post_metrics(artifact_id, platform)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_post_metrics_workspace ON post_metrics(workspace_id, last_synced_at DESC)`
  // Sprint 7C: real session + login event tracking.
  await pgSql`CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, token_hash TEXT NOT NULL UNIQUE, user_agent TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), last_seen_at TIMESTAMPTZ DEFAULT NOW(), revoked_at TIMESTAMPTZ)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash)`
  await pgSql`CREATE TABLE IF NOT EXISTS login_events (id TEXT PRIMARY KEY, user_id TEXT, email_attempted TEXT, ip TEXT, user_agent TEXT, success INTEGER DEFAULT 0, failure_reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC)`
  // Sprint 7D: manual + Stripe payout ledger.
  await pgSql`CREATE TABLE IF NOT EXISTS commission_payouts (id TEXT PRIMARY KEY, vendor_workspace_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, paid_at TIMESTAMPTZ DEFAULT NOW(), notes TEXT, paid_by_user_id TEXT, payment_method VARCHAR(20) DEFAULT 'manual', stripe_transfer_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_commission_payouts_vendor ON commission_payouts(vendor_workspace_id, paid_at DESC)`
  // Sprint 9B: encrypted_access_token column on integrations.
  await pgSql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT`
  // Sprint 13A: lp_slug on artifacts.
  await pgSql`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS lp_slug VARCHAR(128)`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_lp_slug ON artifacts(lp_slug) WHERE lp_slug IS NOT NULL`
  // === Phase Remediation tables ===
  await pgSql`CREATE TABLE IF NOT EXISTS workspace_secrets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider VARCHAR(50) NOT NULL, encrypted_value TEXT NOT NULL, label TEXT, status TEXT DEFAULT 'active', last_tested_at TIMESTAMPTZ, test_result TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_secrets_unique ON workspace_secrets(workspace_id, provider)`
  await pgSql`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT, type VARCHAR(50) NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, severity TEXT DEFAULT 'info', read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, read_at, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS agent_configs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, agent_slug VARCHAR(100) NOT NULL, model TEXT, instructions TEXT, tone TEXT, max_tasks_per_day INTEGER DEFAULT 100, priority TEXT DEFAULT 'normal', allowed_tools TEXT DEFAULT '[]', use_byok INTEGER DEFAULT 1, schedule TEXT DEFAULT 'always', daily_cost_cap DECIMAL(10,2) DEFAULT 50, escalate_to TEXT, status TEXT DEFAULT 'active', updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_unique ON agent_configs(workspace_id, agent_slug)`
  await pgSql`CREATE TABLE IF NOT EXISTS ab_tests (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, content_type TEXT, goal_metric TEXT, duration INTEGER DEFAULT 7, status TEXT DEFAULT 'Running', variant_a TEXT NOT NULL, variant_b TEXT NOT NULL, variant_a_stats TEXT DEFAULT '{}', variant_b_stats TEXT DEFAULT '{}', winner TEXT, confidence INTEGER DEFAULT 0, ai_insight TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_ab_tests_workspace ON ab_tests(workspace_id, status)`
  await pgSql`CREATE TABLE IF NOT EXISTS ab_test_insights (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_test_id TEXT, text TEXT NOT NULL, lift REAL DEFAULT 0, deployed INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_ab_test_insights_workspace ON ab_test_insights(workspace_id, created_at DESC)`
  // === Streaming agent runs ===
  await pgSql`CREATE TABLE IF NOT EXISTS agent_run_events (id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL, workspace_id TEXT NOT NULL, event_type VARCHAR(50) NOT NULL, payload TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(agent_run_id, created_at ASC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_agent_run_events_workspace ON agent_run_events(workspace_id, created_at DESC)`
  await pgSql`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS parent_run_id TEXT`
  // === Strategy decomposition tasks ===
  await pgSql`CREATE TABLE IF NOT EXISTS project_tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, initiative_run_id TEXT NOT NULL, parent_artifact_id TEXT NOT NULL, task_index INTEGER NOT NULL DEFAULT 0, agent VARCHAR(100) NOT NULL, task_type VARCHAR(100) NOT NULL, task_brief TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', agent_run_id TEXT, produced_artifact_id TEXT, error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_initiative ON project_tasks(initiative_run_id, task_index ASC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace ON project_tasks(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status, created_at ASC)`
  // === Sprint 2 Commit 1: Agent Lifecycle + Workspace Projects (Postgres standalone init) ===
  //
  //   Mirrors the inline-init definitions above. The standalone path is used
  //   when callers (cron workers, scripts, the health page) explicitly call
  //   `initializeDatabase()` instead of going through the lazy postgresQuery
  //   first-use init. Both paths must agree on schema or one consumer will
  //   see "column does not exist" errors after a deploy.
  //
  //   See the inline-init block above for the rationale on status vocabulary,
  //   the index strategy (UNIQUE workspace_name + composite workspace_status),
  //   and why CREATE TABLE IF NOT EXISTS + targeted ALTER COLUMN IF NOT EXISTS
  //   gives us forward-compatible idempotency.
  await pgSql`CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error','disabled')),
    paused_at TIMESTAMPTZ,
    paused_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`
  await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS paused_by TEXT`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_workspace_name ON agents(workspace_id, name)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_agents_workspace_status ON agents(workspace_id, status)`

  await pgSql`CREATE TABLE IF NOT EXISTS workspace_projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace ON workspace_projects(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_workspace_projects_status ON workspace_projects(workspace_id, status)`
  // === Sprint 1: Email Department schema (Postgres standalone init) ===
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS artifact_id TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS list_id TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_name TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_email TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS reply_to TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS preview_text TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'resend'`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS provider_campaign_id TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS unsubscribe_count INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS error_message TEXT`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  await pgSql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_by TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_artifact ON email_campaigns(artifact_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_schedule ON email_campaigns(status, scheduled_for)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_workspace ON email_campaigns(workspace_id, created_at DESC)`

  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS first_name TEXT`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS last_name TEXT`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS source VARCHAR(100)`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS consent_source VARCHAR(100)`
  await pgSql`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subscribers_workspace_email ON email_subscribers(workspace_id, email)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(workspace_id, status)`

  await pgSql`CREATE TABLE IF NOT EXISTS email_lists (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, status VARCHAR(50) DEFAULT 'active', subscriber_count INTEGER DEFAULT 0, default_from_name TEXT, default_from_email TEXT, double_opt_in INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_lists_workspace ON email_lists(workspace_id, status)`

  await pgSql`CREATE TABLE IF NOT EXISTS email_list_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, list_id TEXT NOT NULL, subscriber_id TEXT NOT NULL, status VARCHAR(50) DEFAULT 'subscribed', added_at TIMESTAMPTZ DEFAULT NOW(), unsubscribed_at TIMESTAMPTZ)`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_members_unique ON email_list_members(list_id, subscriber_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_list_members_subscriber ON email_list_members(subscriber_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_list_members_workspace ON email_list_members(workspace_id, status)`

  await pgSql`CREATE TABLE IF NOT EXISTS email_campaign_sends (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_id TEXT NOT NULL, subscriber_id TEXT, email_address VARCHAR(255) NOT NULL, status VARCHAR(50) DEFAULT 'queued', external_message_id TEXT, error_message TEXT, sent_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ, bounced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_campaign ON email_campaign_sends(campaign_id, status)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_subscriber ON email_campaign_sends(subscriber_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_workspace ON email_campaign_sends(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_external ON email_campaign_sends(external_message_id)`
  // === Sprint 2: Publishing & Social schema (Postgres standalone init) ===
  await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS channel TEXT`
  await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS content_body TEXT`
  await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`
  await pgSql`ALTER TABLE scheduled_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_workspace_schedule ON scheduled_content(workspace_id, scheduled_at)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_status_schedule ON scheduled_content(status, scheduled_at)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_scheduled_content_artifact ON scheduled_content(artifact_id)`

  await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS scheduled_content_id TEXT`
  await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS channel TEXT`
  await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS native_post_id TEXT`
  await pgSql`ALTER TABLE published_content ADD COLUMN IF NOT EXISTS permalink TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_workspace ON published_content(workspace_id, published_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_scheduled ON published_content(scheduled_content_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_published_content_channel ON published_content(workspace_id, channel)`

  await pgSql`CREATE TABLE IF NOT EXISTS oauth_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, encrypted_access_token TEXT NOT NULL, encrypted_refresh_token TEXT, expires_at TIMESTAMPTZ, scope TEXT, account_id TEXT, account_label TEXT, status VARCHAR(30) DEFAULT 'active', last_refreshed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_unique ON oauth_tokens(workspace_id, platform)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_status ON oauth_tokens(status, expires_at)`
  await pgSql`CREATE TABLE IF NOT EXISTS tracked_links (id TEXT PRIMARY KEY, slug VARCHAR(16) NOT NULL UNIQUE, workspace_id TEXT NOT NULL, original_url TEXT NOT NULL, scheduled_content_id TEXT, published_content_id TEXT, channel VARCHAR(50), campaign_id TEXT, click_count INTEGER DEFAULT 0, last_clicked_at TIMESTAMPTZ, status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_workspace ON tracked_links(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_scheduled ON tracked_links(scheduled_content_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_tracked_links_channel ON tracked_links(workspace_id, channel)`
  await pgSql`CREATE TABLE IF NOT EXISTS link_clicks (id TEXT PRIMARY KEY, slug VARCHAR(16) NOT NULL, workspace_id TEXT NOT NULL, channel VARCHAR(50), referrer TEXT, user_agent TEXT, country VARCHAR(8), clicked_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_link_clicks_slug ON link_clicks(slug, clicked_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_link_clicks_workspace ON link_clicks(workspace_id, clicked_at DESC)`
  // === Sprint 3: Paid Acquisition Department (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS ad_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform VARCHAR(50) NOT NULL, native_campaign_id TEXT, name TEXT NOT NULL, daily_budget INTEGER NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'draft', error_log TEXT, utm_override TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS utm_override TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_workspace_status ON ad_campaigns(workspace_id, status)`
  await pgSql`CREATE TABLE IF NOT EXISTS ad_creatives (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, ad_campaign_id TEXT NOT NULL, artifact_id TEXT, headline TEXT NOT NULL, body_copy TEXT NOT NULL, media_url TEXT, destination_url TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_creatives_artifact ON ad_creatives(artifact_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives(ad_campaign_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS funnel_steps (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, html_content TEXT NOT NULL, view_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_funnel_steps_workspace ON funnel_steps(workspace_id, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS form_submissions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, funnel_step_id TEXT NOT NULL, email TEXT, submitted_data TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_form_submissions_step_email ON form_submissions(funnel_step_id, email)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace ON form_submissions(workspace_id, created_at DESC)`
  // === Sprint 4: Lead Gen & CRM Department (Postgres standalone init) ===
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(30) DEFAULT 'pending'`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS company_name TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS company_size TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS estimated_revenue TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS industry TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS linkedin_url TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS twitter_url TEXT`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS tech_stack TEXT DEFAULT '[]'`
  await pgSql`ALTER TABLE leads_captured ADD COLUMN IF NOT EXISTS enrichment_summary TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_leads_captured_workspace_enrichment ON leads_captured(workspace_id, enrichment_status)`
  await pgSql`ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS activity_type TEXT`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_lead_activities_workspace_type ON lead_activities(workspace_id, activity_type)`
  await pgSql`CREATE TABLE IF NOT EXISTS enrichment_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, lead_id TEXT NOT NULL, provider_used VARCHAR(50) NOT NULL, execution_time_ms INTEGER, raw_response TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead ON enrichment_logs(lead_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_provider ON enrichment_logs(workspace_id, provider_used, created_at DESC)`
  // === Sprint 5: PR & Reputation Desk (Postgres standalone init) ===
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS crisis_status VARCHAR(30) DEFAULT 'clear'`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS crisis_tripped_at TIMESTAMPTZ`
  await pgSql`CREATE TABLE IF NOT EXISTS brand_mentions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_platform VARCHAR(50) NOT NULL, source_url TEXT, author_handle TEXT, content_text TEXT NOT NULL, sentiment_score NUMERIC(4, 2) DEFAULT 1.00, severity_level VARCHAR(20) DEFAULT 'low', status VARCHAR(30) DEFAULT 'unread', detected_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_severity_status ON brand_mentions(workspace_id, severity_level, status)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_brand_mentions_workspace_recent ON brand_mentions(workspace_id, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS pr_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, title TEXT NOT NULL, body_content TEXT NOT NULL, status VARCHAR(30) DEFAULT 'draft', error_log TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_pr_campaigns_workspace_status ON pr_campaigns(workspace_id, status)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_pr_campaigns_artifact ON pr_campaigns(artifact_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS media_contacts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, journalist_name TEXT NOT NULL, email VARCHAR(255), outlet_name TEXT, beat_focus TEXT, linkedin_url TEXT, twitter_url TEXT, notes TEXT, last_contacted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_contacts_unique ON media_contacts(workspace_id, email)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_media_contacts_workspace_beat ON media_contacts(workspace_id, beat_focus)`
  // === Sprint 6: Creative Studio & Media Unification (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, filename TEXT NOT NULL, url TEXT NOT NULL, asset_type VARCHAR(30) NOT NULL, mime_type VARCHAR(120), file_size INTEGER, dimensions VARCHAR(50), duration_seconds NUMERIC(10, 3), source_provider VARCHAR(50), metadata_json TEXT DEFAULT '{}', status VARCHAR(30) DEFAULT 'ready', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_type ON media_assets(workspace_id, asset_type)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_parent ON media_assets(parent_asset_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_recent ON media_assets(workspace_id, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS creative_generation_jobs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, artifact_id TEXT, provider VARCHAR(50) NOT NULL, model_name TEXT, prompt_text TEXT NOT NULL, negative_prompt TEXT, status VARCHAR(30) DEFAULT 'pending', result_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, cost_estimate NUMERIC(10, 4) DEFAULT 0, duration_ms INTEGER, error_message TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_status ON creative_generation_jobs(workspace_id, status)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_artifact ON creative_generation_jobs(artifact_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_creative_jobs_workspace_recent ON creative_generation_jobs(workspace_id, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS voice_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_name TEXT NOT NULL, native_provider_voice_id TEXT NOT NULL, provider VARCHAR(50) DEFAULT 'elevenlabs', gender VARCHAR(20), accent_label TEXT, sample_url TEXT, status VARCHAR(30) DEFAULT 'active', is_default INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_unique ON voice_profiles(workspace_id, native_provider_voice_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_voice_profiles_workspace_status ON voice_profiles(workspace_id, status)`
  // === Sprint 7: Growth & Experiments (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS marketing_experiments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, hypothesis TEXT, target_type VARCHAR(50) NOT NULL, target_reference_id TEXT NOT NULL, status VARCHAR(30) DEFAULT 'draft', statistical_significance_threshold NUMERIC(4, 3) DEFAULT 0.95, winner_variant_id TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_marketing_experiments_workspace_status ON marketing_experiments(workspace_id, status)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_marketing_experiments_target ON marketing_experiments(workspace_id, target_type, target_reference_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS experiment_variants (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, experiment_id TEXT NOT NULL REFERENCES marketing_experiments(id) ON DELETE CASCADE, variant_label VARCHAR(50) NOT NULL, configuration_override_json TEXT NOT NULL DEFAULT '{}', traffic_allocation_weight INTEGER NOT NULL DEFAULT 50, impression_count INTEGER NOT NULL DEFAULT 0, conversion_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_variants_lookup ON experiment_variants(experiment_id, variant_label)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_variants_workspace ON experiment_variants(workspace_id, experiment_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS experiment_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, variant_id TEXT NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE, tracking_id TEXT NOT NULL, event_type VARCHAR(50) NOT NULL, event_value NUMERIC(12, 4), metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_variant_type ON experiment_events(variant_id, event_type, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_tracking ON experiment_events(tracking_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_experiment_events_workspace_recent ON experiment_events(workspace_id, created_at DESC)`
  // === Sprint 8: Voice AI & Inbound Call Center (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS voice_agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_profile_id TEXT REFERENCES voice_profiles(id) ON DELETE SET NULL, provider VARCHAR(50) DEFAULT 'vapi', agent_name TEXT NOT NULL, phone_number TEXT, system_prompt TEXT, temperature NUMERIC(3, 2) DEFAULT 0.70, llm_model VARCHAR(60) DEFAULT 'gpt-4o', status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_agents_workspace_phone ON voice_agents(workspace_id, phone_number)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_voice_agents_workspace_status ON voice_agents(workspace_id, status)`
  await pgSql`CREATE TABLE IF NOT EXISTS call_logs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, voice_agent_id TEXT REFERENCES voice_agents(id) ON DELETE SET NULL, lead_id TEXT REFERENCES leads_captured(id) ON DELETE SET NULL, provider VARCHAR(50), direction VARCHAR(20), from_number TEXT, to_number TEXT, duration_seconds INTEGER DEFAULT 0, recording_url TEXT, transcript TEXT, summary TEXT, sentiment_score NUMERIC(4, 2), call_status VARCHAR(30) DEFAULT 'completed', action_taken TEXT, metadata_json TEXT DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_recent ON call_logs(workspace_id, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_leads_captured_phone ON leads_captured(phone)`
  // === Sprint 9: Agency Ops & Third-Party Connections (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS developer_tokens (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token_name TEXT NOT NULL, token_hash TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT '[]', last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_developer_tokens_hash ON developer_tokens(token_hash)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_developer_tokens_workspace ON developer_tokens(workspace_id)`
  await pgSql`CREATE TABLE IF NOT EXISTS webhook_subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, target_url TEXT NOT NULL, event_type TEXT NOT NULL, secret_signature TEXT NOT NULL, status VARCHAR(30) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_webhook_subs_router ON webhook_subscriptions(workspace_id, event_type, status)`
  await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_error_log TEXT`
  await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE webhook_subscriptions ADD COLUMN IF NOT EXISTS last_attempt_status VARCHAR(30)`
  await pgSql`CREATE TABLE IF NOT EXISTS integration_connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider_slug TEXT NOT NULL, credentials_encrypted TEXT, status VARCHAR(30) DEFAULT 'connected', updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_unique ON integration_connections(workspace_id, provider_slug)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace_status ON integration_connections(workspace_id, status)`
  // === Sprint 10: System Polish & Performance Hardening (Postgres standalone init) ===
  await pgSql`CREATE TABLE IF NOT EXISTS system_performance_audits (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, operation_name TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'ok', error_captured TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_perf_audits_workspace_op_recent ON system_performance_audits(workspace_id, operation_name, created_at DESC)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_perf_audits_status ON system_performance_audits(workspace_id, status, created_at DESC)`
  await pgSql`CREATE TABLE IF NOT EXISTS workspace_retention_policies (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, stream_target TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 90, action_disposition VARCHAR(30) NOT NULL DEFAULT 'purge', updated_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_unique ON workspace_retention_policies(workspace_id, stream_target)`
  await pgSql`CREATE INDEX IF NOT EXISTS idx_retention_policies_workspace ON workspace_retention_policies(workspace_id)`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS hard_max_daily_spend INTEGER NOT NULL DEFAULT 50000`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS alert_threshold_budget INTEGER NOT NULL DEFAULT 25000`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS utm_template TEXT`
  // Sprint 15A: onboarding marker + lead_segments table (standalone init path).
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0`
  // Audit pass #6 P1: per-workspace inbound webhook token (Zapier auth).
  await pgSql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS webhook_secret TEXT`
  await pgSql`CREATE TABLE IF NOT EXISTS lead_segments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name VARCHAR(255) NOT NULL, description TEXT, rule_json TEXT NOT NULL, member_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS lead_segments_ws ON lead_segments(workspace_id)`
  // Sprint 16A: multi-stage funnels + ad objective + follower metrics + approval audit + ICP/logo + lead magnets.
  await pgSql`CREATE TABLE IF NOT EXISTS funnels (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name VARCHAR(255) NOT NULL, goal VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT FALSE, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS funnels_ws ON funnels(workspace_id)`
  await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS funnel_id TEXT`
  await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS stage VARCHAR(40) NOT NULL DEFAULT 'awareness'`
  await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 0`
  await pgSql`ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`
  await pgSql`CREATE INDEX IF NOT EXISTS funnel_steps_funnel ON funnel_steps(funnel_id, sequence)`
  await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS objective VARCHAR(40) NOT NULL DEFAULT 'leads'`
  await pgSql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS targeting_json TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS followers_delta INTEGER NOT NULL DEFAULT 0`
  await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS total_followers INTEGER`
  // Sprint 17H (audit pass #3 P2 #40): attribution metadata column.
  await pgSql`ALTER TABLE post_metrics ADD COLUMN IF NOT EXISTS metadata_json TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approved_by TEXT`
  await pgSql`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`
  await pgSql`CREATE TABLE IF NOT EXISTS approval_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, approval_id TEXT NOT NULL, artifact_id TEXT, actor_id TEXT, actor_email VARCHAR(255), action VARCHAR(40) NOT NULL, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS approval_events_approval ON approval_events(approval_id, created_at DESC)`
  await pgSql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS icp_json TEXT DEFAULT '{}'`
  await pgSql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url TEXT`
  await pgSql`CREATE TABLE IF NOT EXISTS lead_magnets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title VARCHAR(255) NOT NULL, description TEXT, asset_url TEXT NOT NULL, funnel_id TEXT, download_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`
  await pgSql`CREATE INDEX IF NOT EXISTS lead_magnets_ws ON lead_magnets(workspace_id)`
  console.log('✅ Neon Postgres DB initialized')
}
