import { NextRequest, NextResponse } from 'next/server'
import { initializeDatabase } from '@/lib/db'

export const runtime = 'nodejs'

// Guard: only ADMIN_SECRET or dev mode can trigger DB init.
// Without this, a single unauthenticated GET floods the DB with ~100 queries.
function authorized(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET || ''
  const cronSecret = process.env.CRON_SECRET || ''
  const adminHdr = req.headers.get('x-admin-secret') || ''
  const authHdr = req.headers.get('authorization') || ''
  if (adminSecret && adminHdr === adminSecret) return true
  if (cronSecret && authHdr === `Bearer ${cronSecret}`) return true
  if (!adminSecret && !cronSecret && process.env.NODE_ENV !== 'production') return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await initializeDatabase()
    return NextResponse.json({ success: true, message: 'Database initialized' })
  } catch (error) {
    console.error('DB init error:', error)
    return NextResponse.json({ error: 'DB initialization failed' }, { status: 500 })
  }
}
