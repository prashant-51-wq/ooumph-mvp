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

async function postgresQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const { neon } = await import('@neondatabase/serverless')
  const pgSql = neon(process.env.POSTGRES_URL!)
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
  `)
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
  console.log('✅ Neon Postgres DB initialized')
}
