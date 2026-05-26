import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { runAgent } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface KnowledgeNode {
  type: string
  content: string
  confidence: number
  tags: string[]
}

interface ExtractionResult {
  nodes: KnowledgeNode[]
  summary: string
  docType: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, type, content, filename } = body as {
      workspaceId: string
      type: 'pdf' | 'docx' | 'url' | 'text'
      content: string
      filename?: string
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const systemPrompt = `You are a knowledge extraction AI. Extract key marketing insights, brand guidelines, strategies, and facts from this content.
Return JSON with exactly this shape:
{
  "nodes": [
    {
      "type": "brand_voice|strategy|market_intel|competitor|performance",
      "content": "the extracted knowledge as a clear, actionable statement",
      "confidence": 0.0-1.0,
      "tags": ["tag1", "tag2"]
    }
  ],
  "summary": "2-3 sentence summary of the document",
  "docType": "brand_guidelines|strategy_doc|market_research|competitive_analysis|performance_report|general"
}
Rules:
- Extract 3-10 nodes depending on content length and richness
- confidence reflects how clearly the knowledge is stated (0.9+ = explicit, 0.7 = inferred, below 0.7 = speculative)
- type must be one of the 5 values listed
- tags should be 2-5 lowercase hyphenated keywords`

    const userPrompt = `Document type: ${type}${filename ? `\nFilename: ${filename}` : ''}

Content:
${content.slice(0, 8000)}`

    const result = await runAgent<ExtractionResult>(systemPrompt, userPrompt)

    const nodes = Array.isArray(result.nodes) ? result.nodes : []
    const summary = result.summary || ''
    const sourceType = filename ? `ingest_${type}` : `ingest_${type}`
    const sourceId = newId()

    for (const node of nodes) {
      const id = newId()
      const confidence = typeof node.confidence === 'number'
        ? Math.min(1, Math.max(0, node.confidence))
        : 0.8
      const noteText = node.content || ''
      const tags = Array.isArray(node.tags) ? node.tags.join(',') : ''
      const nodeType = node.type || 'strategy'

      await sql`
        INSERT INTO learning_notes (id, workspace_id, source_type, source_id, note, confidence, created_at)
        VALUES (
          ${id},
          ${workspaceId},
          ${`${sourceType}:${nodeType}:${tags}`},
          ${sourceId},
          ${noteText},
          ${confidence},
          ${new Date().toISOString()}
        )
      `
    }

    return NextResponse.json({
      success: true,
      nodesCreated: nodes.length,
      summary,
      docType: result.docType || 'general',
      sourceId,
    })
  } catch (err) {
    console.error('[/api/learning/ingest]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
