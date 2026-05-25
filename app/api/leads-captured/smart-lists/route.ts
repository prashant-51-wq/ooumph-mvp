/**
 * GET /api/leads-captured/smart-lists?workspaceId=
 * Returns predefined smart list counts + lead IDs for each segment.
 * Smart lists are computed dynamically — no separate table needed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const listId = searchParams.get('list')   // if specified, return full leads for that list

  if (!workspaceId) return NextResponse.json([])

  // If a specific list is requested, return its leads
  if (listId) {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    let result
    switch (listId) {
      case 'hot':
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 80 ORDER BY score DESC LIMIT 100`
        break
      case 'warm':
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 50 AND score < 80 ORDER BY score DESC LIMIT 100`
        break
      case 'cold':
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND score < 50 ORDER BY score ASC LIMIT 100`
        break
      case 'new_this_week':
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sevenDaysAgo} ORDER BY created_at DESC LIMIT 100`
        break
      case 'high_value_untouched':
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 70 AND status = 'new' ORDER BY score DESC LIMIT 100`
        break
      case 'with_meetings':
        result = await sql`
          SELECT l.* FROM leads_captured l
          WHERE l.workspace_id = ${workspaceId}
            AND EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = l.id AND b.status = 'confirmed')
          ORDER BY l.created_at DESC LIMIT 100
        `
        break
      case 'no_shows':
        result = await sql`
          SELECT l.* FROM leads_captured l
          WHERE l.workspace_id = ${workspaceId}
            AND EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = l.id AND b.status = 'no_show')
          ORDER BY l.created_at DESC LIMIT 100
        `
        break
      case 'replied':
        result = await sql`
          SELECT l.* FROM leads_captured l
          WHERE l.workspace_id = ${workspaceId}
            AND EXISTS (
              SELECT 1 FROM inbox_messages m
              JOIN inbox_conversations c ON c.id = m.conversation_id
              WHERE c.contact_id = l.id AND m.direction = 'inbound'
            )
          ORDER BY l.created_at DESC LIMIT 100
        `
        break
      case 'inactive_30d':
        result = await sql`
          SELECT l.* FROM leads_captured l
          WHERE l.workspace_id = ${workspaceId}
            AND l.status NOT IN ('converted', 'lost')
            AND NOT EXISTS (
              SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id AND a.created_at >= ${thirtyDaysAgo}
            )
          ORDER BY l.score DESC LIMIT 100
        `
        break
      default:
        result = await sql`SELECT * FROM leads_captured WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 100`
    }
    return NextResponse.json(result.rows)
  }

  // Return all smart list counts
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [hot, warm, cold, newThisWeek, highValueUntouched, withMeetings, noShows, replied, inactive] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 80`,
    sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 50 AND score < 80`,
    sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId} AND score < 50`,
    sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId} AND created_at >= ${sevenDaysAgo}`,
    sql`SELECT COUNT(*) as c FROM leads_captured WHERE workspace_id = ${workspaceId} AND score >= 70 AND status = 'new'`,
    sql`SELECT COUNT(*) as c FROM leads_captured l WHERE workspace_id = ${workspaceId} AND EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = l.id AND b.status = 'confirmed')`,
    sql`SELECT COUNT(*) as c FROM leads_captured l WHERE workspace_id = ${workspaceId} AND EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = l.id AND b.status = 'no_show')`,
    sql`SELECT COUNT(*) as c FROM leads_captured l WHERE workspace_id = ${workspaceId} AND EXISTS (SELECT 1 FROM inbox_messages m JOIN inbox_conversations c ON c.id = m.conversation_id WHERE c.contact_id = l.id AND m.direction = 'inbound')`,
    sql`SELECT COUNT(*) as c FROM leads_captured l WHERE workspace_id = ${workspaceId} AND status NOT IN ('converted','lost') AND NOT EXISTS (SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id AND a.created_at >= ${thirtyDaysAgo})`,
  ])

  return NextResponse.json([
    { id: 'hot', label: '🔥 Hot Leads', count: Number(hot.rows[0]?.c ?? 0), color: '#ef4444', description: 'Score ≥ 80' },
    { id: 'warm', label: '🟡 Warm Leads', count: Number(warm.rows[0]?.c ?? 0), color: '#f59e0b', description: 'Score 50–79' },
    { id: 'cold', label: '🔵 Cold Leads', count: Number(cold.rows[0]?.c ?? 0), color: '#6b7280', description: 'Score < 50' },
    { id: 'new_this_week', label: '✨ New This Week', count: Number(newThisWeek.rows[0]?.c ?? 0), color: '#8b5cf6', description: 'Added in last 7 days' },
    { id: 'high_value_untouched', label: '⚡ High Value, Untouched', count: Number(highValueUntouched.rows[0]?.c ?? 0), color: '#f97316', description: 'Score ≥ 70, never contacted' },
    { id: 'with_meetings', label: '📅 Meeting Booked', count: Number(withMeetings.rows[0]?.c ?? 0), color: '#10b981', description: 'Has a confirmed booking' },
    { id: 'no_shows', label: '👻 No-shows', count: Number(noShows.rows[0]?.c ?? 0), color: '#fbbf24', description: 'Missed their meeting' },
    { id: 'replied', label: '💬 Replied to Email', count: Number(replied.rows[0]?.c ?? 0), color: '#60a5fa', description: 'Sent at least 1 reply' },
    { id: 'inactive_30d', label: '😴 Inactive 30d', count: Number(inactive.rows[0]?.c ?? 0), color: '#4b5563', description: 'No activity in 30 days' },
  ])
}
