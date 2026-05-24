import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      businessName, industry, website, tagline, offer, uniqueValue,
      targetAudience, tone, competitors, channels, goals,
      monthlyBudget, prohibitedClaims, approvalEmail,
    } = body

    const ownerEmail = approvalEmail || 'owner@example.com'

    const workspaceResult = await sql`
      INSERT INTO workspaces (name, industry, website, owner_email)
      VALUES (${businessName}, ${industry}, ${website}, ${ownerEmail})
      RETURNING id
    `
    const workspaceId = workspaceResult.rows[0].id

    await sql`
      INSERT INTO brand_profiles (
        workspace_id, business_name, tagline, offer, unique_value,
        target_audience, tone, competitors, channels, goals,
        monthly_budget, prohibited_claims, approval_email
      ) VALUES (
        ${workspaceId}, ${businessName}, ${tagline}, ${offer}, ${uniqueValue},
        ${targetAudience}, ${tone}, ${competitors}, ${channels},
        ${goals}, ${monthlyBudget}, ${prohibitedClaims}, ${approvalEmail}
      )
    `

    return NextResponse.json({ workspaceId, success: true })
  } catch (error) {
    console.error('Workspace creation error:', error)
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('id')

    if (workspaceId) {
      const result = await sql`
        SELECT w.*, bp.*
        FROM workspaces w
        LEFT JOIN brand_profiles bp ON bp.workspace_id = w.id
        WHERE w.id = ${workspaceId}
      `
      return NextResponse.json(result.rows[0] || null)
    }

    const result = await sql`
      SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 20
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Workspace fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
  }
}
