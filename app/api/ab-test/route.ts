/**
 * /api/ab-test
 *
 * Workspace-scoped A/B test management.
 *
 * GET  ?workspaceId=xxx                → list tests + stats
 * GET  ?workspaceId=xxx&type=insights  → list AI-extracted insights
 * POST { workspaceId, name, ... }      → create a new test
 * PATCH ?id=xxx { ... }                → update test (status, stats, etc.)
 *
 * Persists to ab_tests + ab_test_insights tables.
 * Replaces the previous in-memory array (which lost data on every cold start).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface ABTestVariant {
  label: string
  content: string
  conversionRate: number
  impressions: number
  clicks: number
  isWinner?: boolean
}

interface ABTestRow {
  id: string
  workspace_id: string
  name: string
  hypothesis: string | null
  content_type: string | null
  goal_metric: string | null
  duration: number
  status: string
  variant_a: string
  variant_b: string
  variant_a_stats: string
  variant_b_stats: string
  winner: string | null
  confidence: number
  ai_insight: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface ABTest {
  id: string
  name: string
  hypothesis: string
  status: 'Running' | 'Completed' | 'Paused'
  contentType: string
  goalMetric: string
  duration: number
  startDate: string
  confidence: number
  variants: ABTestVariant[]
  aiInsight?: string
  createdAt: string
}

function rowToTest(row: ABTestRow): ABTest {
  const parseStats = (s: string): { impressions: number; clicks: number; conversionRate: number } => {
    try { return JSON.parse(s || '{}') } catch { return { impressions: 0, clicks: 0, conversionRate: 0 } }
  }
  const a = parseStats(row.variant_a_stats)
  const b = parseStats(row.variant_b_stats)
  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis || '',
    status: (row.status as ABTest['status']) || 'Running',
    contentType: row.content_type || '',
    goalMetric: row.goal_metric || '',
    duration: row.duration,
    startDate: row.started_at || row.created_at,
    confidence: row.confidence,
    variants: [
      { label: 'A', content: row.variant_a, ...a, isWinner: row.winner === 'A' },
      { label: 'B', content: row.variant_b, ...b, isWinner: row.winner === 'B' },
    ],
    aiInsight: row.ai_insight || undefined,
    createdAt: row.created_at,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  const denied = assertWorkspaceOwnership(req, workspaceId)
  if (denied) return denied

  const type = searchParams.get('type')

  try {
    if (type === 'insights') {
      const result = await sql`
        SELECT id, source_test_id, text, lift, deployed, created_at
        FROM ab_test_insights
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
      `
      return NextResponse.json(result.rows)
    }

    const testsRes = await sql`
      SELECT * FROM ab_tests
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `
    const rows = testsRes.rows as unknown as ABTestRow[]
    const tests = rows.map(rowToTest)

    const completed = tests.filter(t => t.status === 'Completed')
    const avgLift = completed.length > 0
      ? Math.round(completed.reduce((sum, t) => {
          const winner = t.variants.find(v => v.isWinner)
          const loser = t.variants.find(v => !v.isWinner)
          if (!winner || !loser || loser.conversionRate === 0) return sum
          return sum + ((winner.conversionRate - loser.conversionRate) / loser.conversionRate) * 100
        }, 0) / completed.length)
      : 0
    const bestVariant = completed.flatMap(t => t.variants.filter(v => v.isWinner)).sort((a, b) => b.conversionRate - a.conversionRate)[0]

    return NextResponse.json({
      tests,
      stats: {
        active: tests.filter(t => t.status === 'Running').length,
        completed: completed.length,
        total: tests.length,
        avgLift,
        bestConversionRate: bestVariant?.conversionRate || 0,
      },
    })
  } catch (err) {
    console.error('[/api/ab-test GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, name, hypothesis, variantA, variantB, contentType, goalMetric, duration } = body as {
      workspaceId: string
      name?: string
      hypothesis?: string
      variantA?: string
      variantB?: string
      contentType?: string
      goalMetric?: string
      duration?: number
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const id = newId()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO ab_tests (id, workspace_id, name, hypothesis, content_type, goal_metric, duration, status, variant_a, variant_b, variant_a_stats, variant_b_stats, confidence, started_at, created_at)
      VALUES (
        ${id},
        ${workspaceId},
        ${name || 'New Test'},
        ${hypothesis || ''},
        ${contentType || 'Email Subject'},
        ${goalMetric || 'Conversion Rate'},
        ${Number(duration) || 7},
        ${'Running'},
        ${variantA || ''},
        ${variantB || ''},
        ${'{"impressions":0,"clicks":0,"conversionRate":0}'},
        ${'{"impressions":0,"clicks":0,"conversionRate":0}'},
        ${0},
        ${now},
        ${now}
      )
    `
    const inserted = await sql`SELECT * FROM ab_tests WHERE id = ${id}`
    const row = inserted.rows[0] as unknown as ABTestRow
    return NextResponse.json({ test: rowToTest(row) }, { status: 201 })
  } catch (err) {
    console.error('[/api/ab-test POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const body = await req.json()
    const { workspaceId, status, confidence, winner, aiInsight, variantA, variantB, variantAStats, variantBStats } = body as {
      workspaceId: string
      status?: string
      confidence?: number
      winner?: 'A' | 'B' | null
      aiInsight?: string
      variantA?: string
      variantB?: string
      variantAStats?: { impressions?: number; clicks?: number; conversionRate?: number }
      variantBStats?: { impressions?: number; clicks?: number; conversionRate?: number }
    }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Verify the test belongs to the workspace before updating
    const check = await sql`SELECT id FROM ab_tests WHERE id = ${id} AND workspace_id = ${workspaceId} LIMIT 1`
    if (!(check.rows[0] as { id?: string } | undefined)?.id) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const completedAt = status === 'Completed' ? now : null

    await sql`
      UPDATE ab_tests SET
        status = COALESCE(${status ?? null}, status),
        confidence = COALESCE(${confidence ?? null}, confidence),
        winner = COALESCE(${winner ?? null}, winner),
        ai_insight = COALESCE(${aiInsight ?? null}, ai_insight),
        variant_a = COALESCE(${variantA ?? null}, variant_a),
        variant_b = COALESCE(${variantB ?? null}, variant_b),
        variant_a_stats = COALESCE(${variantAStats ? JSON.stringify(variantAStats) : null}, variant_a_stats),
        variant_b_stats = COALESCE(${variantBStats ? JSON.stringify(variantBStats) : null}, variant_b_stats),
        completed_at = COALESCE(${completedAt}, completed_at)
      WHERE id = ${id}
    `

    const result = await sql`SELECT * FROM ab_tests WHERE id = ${id}`
    const row = result.rows[0] as unknown as ABTestRow
    return NextResponse.json({ test: rowToTest(row) })
  } catch (err) {
    console.error('[/api/ab-test PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
