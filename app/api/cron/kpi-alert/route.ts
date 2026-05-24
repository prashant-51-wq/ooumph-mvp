/**
 * Cron: /api/cron/kpi-alert — runs weekly Monday 08:00 UTC (Vercel cron)
 * Checks KPIs for all active workspaces, emails owner if any KPI is "behind".
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { aggregateAnalyticsData, trackKPIs, getKPITargets } from '@/lib/agents/analytics'
import { Resend } from 'resend'

export const runtime = 'nodejs'

function getResend() {
  const key = (process.env.RESEND_API_KEY || '').replace(/^﻿/, '').trim()
  return new Resend(key)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim()
  if (!resendKey) return NextResponse.json({ skipped: true, reason: 'RESEND_API_KEY not configured' })

  try {
    const workspacesResult = await sql`
      SELECT w.id, w.owner_email, bp.business_name, bp.goals, bp.approval_email
      FROM workspaces w
      JOIN brand_profiles bp ON bp.workspace_id = w.id
      WHERE w.status = 'active'
      LIMIT 50
    `

    const results: Array<{ workspaceId: string; alerted: boolean; behindKPIs: string[] }> = []

    for (const ws of workspacesResult.rows) {
      const workspaceId = String(ws.id)
      const alertEmail = String(ws.approval_email || ws.owner_email || '')
      if (!alertEmail) continue

      try {
        const [data, customTargets] = await Promise.all([
          aggregateAnalyticsData(workspaceId, 7),
          getKPITargets(workspaceId),
        ])
        const kpis = trackKPIs(data, String(ws.goals || ''), customTargets)
        const behindKPIs = kpis.filter(k => k.status === 'behind')

        if (behindKPIs.length === 0) {
          results.push({ workspaceId, alerted: false, behindKPIs: [] })
          continue
        }

        const kpiRows = behindKPIs.map(k =>
          `<tr style="border-bottom:1px solid #374151;">
            <td style="padding:8px 12px;color:#f9fafb;">${k.metric}</td>
            <td style="padding:8px 12px;color:#ef4444;font-weight:600;">${k.current}</td>
            <td style="padding:8px 12px;color:#6b7280;">${k.target}</td>
            <td style="padding:8px 12px;color:#9ca3af;font-size:12px;">${k.delta}</td>
          </tr>`
        ).join('')

        await getResend().emails.send({
          from: 'Ooumph AI <onboarding@resend.dev>',
          to: alertEmail,
          subject: `[${ws.business_name}] ⚠️ ${behindKPIs.length} KPI${behindKPIs.length > 1 ? 's' : ''} behind target this week`,
          html: `
            <div style="font-family:sans-serif;max-width:640px;margin:0 auto;background:#0f0f0f;color:#e5e7eb;padding:32px;border-radius:12px;">
              <div style="margin-bottom:20px;">
                <span style="background:#4f46e5;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">Ooumph AI · Weekly KPI Alert</span>
              </div>
              <h2 style="color:#fff;margin:0 0 8px;">KPI Alert — ${ws.business_name}</h2>
              <p style="color:#9ca3af;margin:0 0 24px;">The following KPIs are behind target for the last 7 days:</p>
              <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background:#374151;">
                    <th style="padding:10px 12px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;">KPI</th>
                    <th style="padding:10px 12px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;">Current</th>
                    <th style="padding:10px 12px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;">Target</th>
                    <th style="padding:10px 12px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;">Note</th>
                  </tr>
                </thead>
                <tbody>${kpiRows}</tbody>
              </table>
              <a href="https://ooumph-mvp.vercel.app/dashboard/analytics"
                style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                View Analytics Dashboard →
              </a>
              <p style="color:#4b5563;font-size:12px;margin-top:32px;">
                You can update your KPI targets in the Analytics dashboard. This report is sent every Monday.
              </p>
            </div>
          `,
        })

        results.push({ workspaceId, alerted: true, behindKPIs: behindKPIs.map(k => k.metric) })
      } catch (e) {
        console.error(`KPI alert failed for workspace ${workspaceId}:`, e)
        results.push({ workspaceId, alerted: false, behindKPIs: [] })
      }
    }

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      workspacesChecked: results.length,
      alertsSent: results.filter(r => r.alerted).length,
      results,
    })
  } catch (error) {
    console.error('KPI alert cron error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
