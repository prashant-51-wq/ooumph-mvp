/**
 * Stock Asset Discovery — Creative Supervisor
 * Searches Unsplash and/or Pexels for stock images matching a query.
 */
import { NextRequest, NextResponse } from 'next/server'
import { searchUnsplash, searchPexels, searchStockImages } from '@/lib/tools/stock-images'
import { assertWorkspaceOwnership } from '@/lib/guards'

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, query, source, count } = await req.json() as {
      workspaceId: string
      query: string
      source?: 'unsplash' | 'pexels' | 'any'
      count?: number
    }

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    if (!query?.trim()) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

    let images
    if (source === 'unsplash') {
      images = await searchUnsplash(query.trim(), count || 12)
    } else if (source === 'pexels') {
      images = await searchPexels(query.trim(), count || 12)
    } else {
      images = await searchStockImages(query.trim(), count || 12)
    }

    return NextResponse.json({ images, query })
  } catch (error) {
    console.error('Stock search error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
