import { sql } from '@vercel/postgres'

export { sql }

export async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      industry VARCHAR(255),
      website VARCHAR(500),
      owner_email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS brand_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      business_name VARCHAR(255),
      tagline TEXT,
      offer TEXT,
      unique_value TEXT,
      target_audience TEXT,
      tone VARCHAR(255),
      competitors TEXT,
      channels TEXT[],
      goals TEXT,
      monthly_budget VARCHAR(100),
      prohibited_claims TEXT,
      approval_email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_name VARCHAR(100) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      input_json JSONB,
      output_json JSONB,
      cost_estimate DECIMAL(10,4),
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_run_id UUID REFERENCES agent_runs(id),
      type VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      content_json JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'pending',
      approver_email VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS learning_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      source_type VARCHAR(100),
      source_id UUID,
      note TEXT NOT NULL,
      confidence DECIMAL(3,2) DEFAULT 0.8,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}
