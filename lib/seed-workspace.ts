/**
 * lib/seed-workspace.ts
 *
 * Seeds a brand-new workspace with sample data so the user
 * doesn't land on an empty dashboard. Everything seeded is
 * clearly tagged so the user can identify it as demo data.
 *
 * Called from POST /api/workspaces after a fresh signup.
 */

import { sql, newId } from '@/lib/db'

interface SeedOptions {
  workspaceId: string
  businessName: string
  industry?: string
  primaryGoal?: string
}

export async function seedWorkspace(opts: SeedOptions): Promise<{ seeded: { type: string; count: number }[] }> {
  const { workspaceId, businessName, industry, primaryGoal } = opts
  const seeded: { type: string; count: number }[] = []

  const safeBusinessName = businessName || 'Your Business'
  const safeIndustry = industry || 'your industry'
  const safeGoal = primaryGoal || 'grow your business'

  // ─── 1. Welcome notification ─────────────────────────────────────────────
  try {
    await sql`
      INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
      VALUES (
        ${newId()},
        ${workspaceId},
        ${'welcome'},
        ${'Welcome to Ooumph! 🎉'},
        ${`Your workspace "${safeBusinessName}" is ready. Start by chatting with your CMO Agent, or browse the System Health page to see what's wired and ready.`},
        ${'/dashboard'},
        ${'success'},
        ${new Date().toISOString()}
      )
    `
    await sql`
      INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
      VALUES (
        ${newId()},
        ${workspaceId},
        ${'tip'},
        ${'Tip: Connect your AI keys for full control'},
        ${'Add your OpenAI / Anthropic / ElevenLabs keys in Settings → API Keys (BYOK) to use your own quotas instead of shared keys.'},
        ${'/dashboard/settings'},
        ${'info'},
        ${new Date(Date.now() - 60000).toISOString()}
      )
    `
    await sql`
      INSERT INTO notifications (id, workspace_id, type, title, body, link, severity, created_at)
      VALUES (
        ${newId()},
        ${workspaceId},
        ${'tip'},
        ${'Tip: Try generating your first strategy'},
        ${'Head to Strategy → Generate Daily Strategy. Your CMO Agent will use your brand profile to draft a real plan.'},
        ${'/dashboard/strategy'},
        ${'info'},
        ${new Date(Date.now() - 120000).toISOString()}
      )
    `
    seeded.push({ type: 'notifications', count: 3 })
  } catch (err) {
    console.error('[seed] notifications failed:', err)
  }

  // ─── 2. Sample contacts (3 demo leads to populate the CRM) ──────────────
  const sampleContacts = [
    {
      name: 'Sarah Chen',
      email: 'sarah.chen@example.com',
      phone: '+1-555-0100',
      source: 'demo',
      status: 'qualified',
      score: 85,
      notes: 'Demo contact — interested in your premium plan. Replace or delete via CRM.',
    },
    {
      name: 'Marcus Johnson',
      email: 'marcus.j@example.com',
      phone: '+1-555-0101',
      source: 'demo',
      status: 'new',
      score: 60,
      notes: `Demo contact — downloaded your ${safeIndustry} guide. Replace or delete via CRM.`,
    },
    {
      name: 'Priya Patel',
      email: 'priya.p@example.com',
      phone: '+1-555-0102',
      source: 'demo',
      status: 'contacted',
      score: 45,
      notes: 'Demo contact — opened your last 3 emails. Replace or delete via CRM.',
    },
  ]
  try {
    for (const c of sampleContacts) {
      await sql`
        INSERT INTO leads_captured (id, workspace_id, name, email, phone, source, status, score, notes, custom_fields, created_at)
        VALUES (
          ${newId()},
          ${workspaceId},
          ${c.name},
          ${c.email},
          ${c.phone},
          ${c.source},
          ${c.status},
          ${c.score},
          ${c.notes},
          ${JSON.stringify({ is_demo: true })},
          ${new Date(Date.now() - Math.random() * 7 * 86400000).toISOString()}
        )
      `
    }
    seeded.push({ type: 'contacts', count: sampleContacts.length })
  } catch (err) {
    console.error('[seed] contacts failed:', err)
  }

  // ─── 3. Sample strategy artifact (so /dashboard/strategy isn't empty) ───
  try {
    const artifactId = newId()
    const strategyContent = {
      positioning: `${safeBusinessName} helps ${safeIndustry} businesses ${safeGoal} with AI-powered marketing automation.`,
      objective: `Generate 50 qualified leads in the next 30 days through targeted content and outreach.`,
      uvp: `The only AI marketing platform that combines strategy, content creation, and approval workflows in a single command center.`,
      icp: `Decision-makers at small-to-mid-sized ${safeIndustry} companies (10-200 employees) looking to scale their marketing without hiring more people.`,
      kpis: [
        { name: 'Qualified Leads', target: '50', actual: '0', timeframe: '30 days' },
        { name: 'Cost per Lead', target: '$25', actual: '$0', timeframe: '30 days' },
        { name: 'Email Open Rate', target: '28%', actual: '0%', timeframe: '30 days' },
        { name: 'Pipeline Value', target: '$25,000', actual: '$0', timeframe: '30 days' },
      ],
      pillars: ['Educational content', 'Customer success stories', 'Product demos', 'Industry insights'],
      channels: [
        { name: 'LinkedIn', frequency: '3x/week', purpose: 'Thought leadership' },
        { name: 'Email', frequency: 'Weekly', purpose: 'Nurture leads' },
        { name: 'Blog', frequency: '2x/week', purpose: 'SEO + education' },
      ],
      is_demo: true,
    }
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${'strategy'},
        ${'Demo: 30-Day Strategy'},
        ${JSON.stringify(strategyContent)},
        ${'approved'},
        ${new Date().toISOString()}
      )
    `
    seeded.push({ type: 'strategy', count: 1 })
  } catch (err) {
    console.error('[seed] strategy failed:', err)
  }

  // ─── 4. One pending approval (so the bell + approvals page have content) ─
  try {
    const draftId = newId()
    const approvalId = newId()
    const sampleContent = {
      copy: `🎯 Stop chasing leads. Start nurturing them.\n\nIf you're running a ${safeIndustry} business, you know the grind: cold outreach, manual follow-ups, leads slipping through the cracks. There's a better way.\n\nOur AI marketing OS handles strategy, content, and outreach — so you can focus on closing.\n\nReady to see what 30 days of automation can do?\n\n[Book a Demo →]`,
      platform: 'linkedin',
      type: 'social_post',
      is_demo: true,
    }
    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (
        ${draftId},
        ${workspaceId},
        ${'social_post'},
        ${'Demo: LinkedIn lead-gen post'},
        ${JSON.stringify(sampleContent)},
        ${'draft'},
        ${new Date().toISOString()}
      )
    `
    await sql`
      INSERT INTO approvals (id, workspace_id, artifact_id, status, created_at, updated_at)
      VALUES (
        ${approvalId},
        ${workspaceId},
        ${draftId},
        ${'pending'},
        ${new Date().toISOString()},
        ${new Date().toISOString()}
      )
    `
    seeded.push({ type: 'pending_approvals', count: 1 })
  } catch (err) {
    console.error('[seed] pending approval failed:', err)
  }

  // ─── 5. Sample agent runs (so activity feed + agents dashboard show life) ─
  try {
    const sampleRuns = [
      { agent: 'cmo', status: 'completed', cost: 0.0042, ago_ms: 5 * 60000 },
      { agent: 'strategy', status: 'completed', cost: 0.0085, ago_ms: 8 * 60000 },
      { agent: 'content', status: 'completed', cost: 0.0031, ago_ms: 15 * 60000 },
    ]
    for (const r of sampleRuns) {
      const runId = newId()
      const ts = new Date(Date.now() - r.ago_ms).toISOString()
      await sql`
        INSERT INTO agent_runs (id, workspace_id, agent_name, status, input_json, output_json, cost_estimate, created_at, completed_at)
        VALUES (
          ${runId},
          ${workspaceId},
          ${r.agent},
          ${r.status},
          ${JSON.stringify({ is_demo: true, prompt: 'Sample seed run' })},
          ${JSON.stringify({ is_demo: true, result: 'Sample output' })},
          ${r.cost},
          ${ts},
          ${ts}
        )
      `
    }
    seeded.push({ type: 'agent_runs', count: sampleRuns.length })
  } catch (err) {
    console.error('[seed] agent runs failed:', err)
  }

  // ─── 6. Brand memory seed (1 learning note from "onboarding") ────────────
  try {
    await sql`
      INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
      VALUES (
        ${newId()},
        ${workspaceId},
        ${'onboarding:brand_voice:tone'},
        ${'onboarding-seed'},
        ${`Brand voice for ${safeBusinessName}: configured during onboarding. Update tone, audience, and goals in Settings → Workspace.`},
        ${0.85},
        ${new Date().toISOString()}
      )
    `
    seeded.push({ type: 'learning_notes', count: 1 })
  } catch (err) {
    console.error('[seed] learning note failed:', err)
  }

  return { seeded }
}
