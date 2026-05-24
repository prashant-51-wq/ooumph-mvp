import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      businessName, industry, website, tagline, offer, uniqueValue,
      targetAudience, tone, competitors, channels, goals,
      monthlyBudget, prohibitedClaims, approvalEmail, userId,
    } = body

    const workspaceId = newId()
    const brandId = newId()
    const ownerEmail = approvalEmail || 'owner@ooumph.com'

    await sql`
      INSERT INTO workspaces (id, name, industry, website, owner_email, user_id)
      VALUES (${workspaceId}, ${businessName}, ${industry}, ${website}, ${ownerEmail}, ${userId || null})
    `

    await sql`
      INSERT INTO brand_profiles (
        id, workspace_id, business_name, tagline, offer, unique_value,
        target_audience, tone, competitors, channels, goals,
        monthly_budget, prohibited_claims, approval_email
      ) VALUES (
        ${brandId}, ${workspaceId}, ${businessName}, ${tagline}, ${offer}, ${uniqueValue},
        ${targetAudience}, ${tone}, ${competitors}, ${channels},
        ${goals}, ${monthlyBudget}, ${prohibitedClaims}, ${approvalEmail}
      )
    `

    return NextResponse.json({ workspaceId, success: true })
  } catch (error) {
    console.error('Workspace creation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const {
      workspaceId, businessName, industry, website, tagline, offer, uniqueValue,
      targetAudience, tone, competitors, channels, goals,
      monthlyBudget, prohibitedClaims, approvalEmail, modelSettings,
    } = await req.json()

    await sql`
      UPDATE brand_profiles SET
        business_name = ${businessName}, tagline = ${tagline}, offer = ${offer},
        unique_value = ${uniqueValue}, target_audience = ${targetAudience},
        tone = ${tone}, competitors = ${competitors}, channels = ${channels},
        goals = ${goals}, monthly_budget = ${monthlyBudget},
        prohibited_claims = ${prohibitedClaims}, approval_email = ${approvalEmail},
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${workspaceId}
    `
    await sql`
      UPDATE workspaces SET name = ${businessName}, industry = ${industry}, website = ${website},
        model_settings = ${modelSettings ? JSON.stringify(modelSettings) : '{}'}
      WHERE id = ${workspaceId}
    `
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('id')

    if (workspaceId) {
      const result = await sql`
        SELECT w.id, w.name, w.industry, w.website, w.owner_email, w.status, w.created_at, w.model_settings,
               bp.business_name, bp.tagline, bp.offer, bp.unique_value, bp.target_audience,
               bp.tone, bp.competitors, bp.channels, bp.goals, bp.monthly_budget,
               bp.prohibited_claims, bp.approval_email
        FROM workspaces w
        LEFT JOIN brand_profiles bp ON bp.workspace_id = w.id
        WHERE w.id = ${workspaceId}
      `
      return NextResponse.json(result.rows[0] || null)
    }

    const result = await sql`SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 20`
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Workspace fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
