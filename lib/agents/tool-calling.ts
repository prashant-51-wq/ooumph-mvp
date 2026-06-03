/**
 * Native Anthropic tool-use infrastructure (Sprint 2).
 *
 * Defines the shared tool catalog (search, scrape, query_brand_memory,
 * persist_artifact) and a runAgentWithTools() loop that drives multi-turn
 * tool execution against the workspace BYOK client.
 */
import Anthropic from '@anthropic-ai/sdk'
import { sql, newId } from '@/lib/db'
import { getClaudeClient, AgentSetupError } from '@/lib/claude'
import { DEFAULT_MODEL } from '@/lib/models'

// ─── Tool definitions ────────────────────────────────────────────────────────

export const TOOL_SEARCH: Anthropic.Tool = {
  name: 'search',
  description: 'Search the web for real-time information. Use this to research competitors, trends, SEO keywords, audience insights, or any topic where fresh data improves the output.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query (be specific for better results)' },
      count: { type: 'number', description: 'Number of results to return (default 6, max 10)' },
    },
    required: ['query'],
  },
}

export const TOOL_SCRAPE: Anthropic.Tool = {
  name: 'scrape',
  description: 'Scrape the full text content of a URL. Use to extract brand information, competitor copy, landing page messaging, or any web page content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'Full URL to scrape (must start with https://)' },
    },
    required: ['url'],
  },
}

export const TOOL_QUERY_BRAND_MEMORY: Anthropic.Tool = {
  name: 'query_brand_memory',
  description: 'Query the workspace brand memory for approved content examples, voice guidelines, top-performing posts, and brand notes. Always call this at the start of content generation to ensure brand consistency.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Topic or keyword to search in brand memory' },
      max_results: { type: 'number', description: 'Max memory entries to return (default 5)' },
    },
    required: ['query'],
  },
}

export const TOOL_PERSIST_ARTIFACT: Anthropic.Tool = {
  name: 'persist_artifact',
  description: 'Save a completed artifact (email, blog post, ad copy, strategy) to the workspace for review and approval. Call this once the final content is ready.',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['emailDraft', 'blog_post', 'ad_copy', 'content_calendar', 'strategy', 'social_post'],
        description: 'Artifact type',
      },
      title: { type: 'string', description: 'Human-readable title for the artifact' },
      content: { type: 'object', description: 'The full artifact content as a JSON object' },
    },
    required: ['type', 'title', 'content'],
  },
}

/** The standard 4-tool catalog every core agent gets. */
export const STANDARD_TOOLS: Anthropic.Tool[] = [
  TOOL_SEARCH,
  TOOL_SCRAPE,
  TOOL_QUERY_BRAND_MEMORY,
  TOOL_PERSIST_ARTIFACT,
]

// ─── Tool executor ────────────────────────────────────────────────────────────

interface ToolExecutorContext {
  workspaceId: string
  agentRunId?: string
}

interface PersistArtifactResult {
  artifactId: string
  type: string
  title: string
}

type ToolResult = string | Record<string, unknown> | PersistArtifactResult

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutorContext
): Promise<ToolResult> {
  switch (name) {
    case 'search': {
      const { braveSearch, formatSearchResults } = await import('@/lib/tools/brave-search')
      const query = String(input.query || '')
      const count = Math.min(Number(input.count || 6), 10)
      const results = await braveSearch(query, count)
      return formatSearchResults(results) || 'No search results available.'
    }

    case 'scrape': {
      const { scrapeUrl } = await import('@/lib/tools/firecrawl')
      const url = String(input.url || '')
      const result = await scrapeUrl(url)
      if (!result) return `Unable to scrape ${url} — page may be blocked or Firecrawl not configured.`
      return `# ${result.title}\nURL: ${result.url}\n\n${result.markdown.slice(0, 8000)}`
    }

    case 'query_brand_memory': {
      const { searchMemory, getRecentMemory } = await import('@/lib/tools/memory')
      const query = String(input.query || '')
      const max = Math.min(Number(input.max_results || 5), 10)
      const results = query
        ? await searchMemory(ctx.workspaceId, query, max)
        : await getRecentMemory(ctx.workspaceId, undefined, max)
      if (!results.length) return 'No brand memory entries found for this workspace yet.'
      return results
        .map((e, i) => `[${i + 1}] (${e.content_type}) ${e.content}`)
        .join('\n\n')
    }

    case 'persist_artifact': {
      const type = String(input.type || 'social_post')
      const title = String(input.title || 'Untitled')
      const content = (input.content as Record<string, unknown>) || {}
      const artifactId = newId()
      await sql`
        INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
        VALUES (
          ${artifactId}, ${ctx.workspaceId}, ${ctx.agentRunId ?? null},
          ${type}, ${title}, ${JSON.stringify(content)}, 'pending'
        )
      `
      await sql`
        INSERT INTO approvals (id, workspace_id, artifact_id, status)
        VALUES (${newId()}, ${ctx.workspaceId}, ${artifactId}, 'pending')
      `
      return { artifactId, type, title }
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ─── Multi-turn tool-use loop ─────────────────────────────────────────────────

export interface AgentWithToolsOptions {
  model?: string
  maxIterations?: number
  /** Extra tools beyond the standard 4 */
  extraTools?: Anthropic.Tool[]
}

/**
 * Run a multi-turn agent with native Anthropic tool-use.
 *
 * The model may call any of the standard tools (search, scrape,
 * query_brand_memory, persist_artifact) before producing its final
 * answer. The loop runs until end_turn or maxIterations.
 *
 * Returns the parsed JSON from the final text response.
 */
export async function runAgentWithTools<T>(
  systemPrompt: string,
  userPrompt: string,
  workspaceId: string,
  options?: AgentWithToolsOptions
): Promise<T> {
  const model = options?.model || process.env.OOUMPH_AI_MODEL || DEFAULT_MODEL
  const maxIterations = options?.maxIterations ?? 6
  const tools = [...STANDARD_TOOLS, ...(options?.extraTools ?? [])]

  let client: Anthropic
  try {
    client = await getClaudeClient(workspaceId)
  } catch (e) {
    if (e instanceof AgentSetupError) throw e
    throw e
  }

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ]

  const ctx: ToolExecutorContext = { workspaceId }

  for (let iter = 0; iter < maxIterations; iter++) {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      messages,
    })

    // Append assistant response to history
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      // Extract text block and parse JSON
      const textBlock = response.content.find(b => b.type === 'text')
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})|(\[[\s\S]*\])/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
      try {
        return JSON.parse(jsonStr) as T
      } catch {
        throw new Error(`Agent returned invalid JSON after tool loop. Raw: ${text.slice(0, 500)}`)
      }
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      // Execute all requested tools in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const input = block.input as Record<string, unknown>
          let result: ToolResult
          try {
            result = await executeTool(block.name, input, ctx)
          } catch (e) {
            result = `Tool error: ${String(e)}`
          }
          const content = typeof result === 'string' ? result : JSON.stringify(result)
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content,
          }
        })
      )

      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // Unexpected stop reason — break out
    break
  }

  throw new Error(`Agent tool loop exceeded ${maxIterations} iterations without end_turn.`)
}
