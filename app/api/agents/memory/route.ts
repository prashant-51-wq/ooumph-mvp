/**
 * Brand Voice Memory API
 * Saves, searches, and retrieves brand memory entries.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  saveMemory,
  searchMemory,
  getMemoryContext,
  getRecentMemory,
  type MemoryContentType,
} from '@/lib/tools/memory'

export async function POST(req: NextRequest) {
  try {
    const {
      workspaceId,
      action,
      content,
      contentType,
      query,
      metadata,
    } = await req.json() as {
      workspaceId: string
      action: 'save' | 'search' | 'get_context'
      content?: string
      contentType?: MemoryContentType
      query?: string
      metadata?: Record<string, unknown>
    }

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

    if (action === 'save') {
      if (!content) return NextResponse.json({ error: 'content required for save' }, { status: 400 })
      const id = await saveMemory(
        workspaceId,
        content,
        contentType || 'learning_note',
        { metadata }
      )
      return NextResponse.json({ saved: true, id })
    }

    if (action === 'search') {
      if (!query) return NextResponse.json({ error: 'query required for search' }, { status: 400 })
      const results = await searchMemory(workspaceId, query, 10)
      return NextResponse.json({ results })
    }

    if (action === 'get_context') {
      if (!query) return NextResponse.json({ error: 'query required for get_context' }, { status: 400 })
      const context = await getMemoryContext(workspaceId, query)
      return NextResponse.json({ context })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    console.error('Memory API error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const type = searchParams.get('type') as MemoryContentType | null
    const query = searchParams.get('query')

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    if (query) {
      const results = await searchMemory(workspaceId, query, 20, type || undefined)
      return NextResponse.json({ results })
    }

    const results = await getRecentMemory(workspaceId, type || undefined, 20)
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
