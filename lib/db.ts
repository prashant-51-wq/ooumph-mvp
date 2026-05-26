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
  console.log('✅ Neon Postgres DB initialized')
}
