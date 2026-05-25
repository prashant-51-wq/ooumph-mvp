// Brand Voice Memory using Postgres full-text search (no pgvector needed)
import { sql, newId } from '@/lib/db'

export type MemoryContentType =
  | 'approved_post'
  | 'approved_email'
  | 'brand_voice_example'
  | 'learning_note'
  | 'rejected_example'
  | 'strategy_note'
  | 'top_performing'

export interface MemoryEntry {
  id: string
  workspace_id: string
  content: string
  content_type: MemoryContentType
  platform?: string
  performance_score?: number
  metadata_json: string
  created_at: string
}

export async function saveMemory(
  workspaceId: string,
  content: string,
  contentType: MemoryContentType,
  options?: {
    platform?: string
    performanceScore?: number
    metadata?: Record<string, unknown>
  }
): Promise<string> {
  const id = newId()
  const metadataJson = JSON.stringify(options?.metadata || {})
  try {
    await sql`
      INSERT INTO brand_memory (id, workspace_id, content, content_type, platform, performance_score, metadata_json, created_at)
      VALUES (
        ${id},
        ${workspaceId},
        ${content},
        ${contentType},
        ${options?.platform ?? null},
        ${options?.performanceScore ?? null},
        ${metadataJson},
        ${new Date().toISOString()}
      )
    `
  } catch {
    // Silently fail — memory is non-critical
  }
  return id
}

export async function searchMemory(
  workspaceId: string,
  query: string,
  limit = 5,
  contentType?: MemoryContentType
): Promise<MemoryEntry[]> {
  try {
    // Try Postgres full-text search first
    try {
      const rows = await sql<MemoryEntry[]>`
        SELECT * FROM brand_memory
        WHERE workspace_id = ${workspaceId}
          AND (content_type = ${contentType ?? null}::text OR ${contentType ?? null} IS NULL)
          AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
        ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) DESC
        LIMIT ${limit}
      `
      return Array.isArray(rows) ? rows : []
    } catch {
      // Fallback to LIKE search (SQLite)
      const rows = await sql<MemoryEntry[]>`
        SELECT * FROM brand_memory
        WHERE workspace_id = ${workspaceId}
          AND (content_type = ${contentType ?? null} OR ${contentType ?? null} IS NULL)
          AND content LIKE ${'%' + query + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
      return Array.isArray(rows) ? rows : []
    }
  } catch {
    return []
  }
}

export async function getTopPerforming(
  workspaceId: string,
  platform?: string,
  limit = 5
): Promise<MemoryEntry[]> {
  try {
    const rows = await sql<MemoryEntry[]>`
      SELECT * FROM brand_memory
      WHERE workspace_id = ${workspaceId}
        AND content_type = 'top_performing'
        AND (platform = ${platform ?? null} OR ${platform ?? null} IS NULL)
      ORDER BY performance_score DESC
      LIMIT ${limit}
    `
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export async function getRecentMemory(
  workspaceId: string,
  contentType?: MemoryContentType,
  limit = 10
): Promise<MemoryEntry[]> {
  try {
    const rows = await sql<MemoryEntry[]>`
      SELECT * FROM brand_memory
      WHERE workspace_id = ${workspaceId}
        AND (content_type = ${contentType ?? null} OR ${contentType ?? null} IS NULL)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export async function getMemoryContext(
  workspaceId: string,
  query: string
): Promise<string> {
  try {
    const results = await searchMemory(workspaceId, query)
    if (!results.length) return ''
    const lines = results.map((entry, i) => `[${i + 1}] ${entry.content}`)
    return `BRAND VOICE MEMORY (approved examples):\n${lines.join('\n')}`
  } catch {
    return ''
  }
}
