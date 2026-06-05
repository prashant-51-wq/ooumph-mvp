import { getMemoryPromptBlock } from '@/lib/tools/memory'
import { runAgentWithTools } from '@/lib/agents/tool-calling'
import type { BrandProfile, Strategy, ContentCalendarItem } from '@/types'

const SYSTEM_PROMPT = `You are the Content Calendar Agent for Ooumph, an AI Marketing Agency OS.
Create a 30-day content calendar that is strategic, varied, and platform-optimized.
Hooks must be attention-grabbing and specific to the business.

You have tools available:
- query_brand_memory: fetch approved brand voice examples and content notes before generating
- search: research trending topics, platform best practices, or competitor content if needed
- persist_artifact: save the finished calendar as a workspace artifact

Always call query_brand_memory first to ensure brand consistency. Then return a JSON array.`

export async function generateContentCalendar(
  brand: BrandProfile,
  strategy: Strategy,
  memoryMatrixBlock?: string,
): Promise<ContentCalendarItem[]> {
  // Pre-fetch memory notes — still injected as static context so the
  // agent has them immediately without spending a tool-use turn.
  const memoryBlock = await getMemoryPromptBlock(brand.workspace_id, {
    maxNotes: 8, maxVoiceExamples: 3,
  })
  const userPrompt = `Create a 30-day content calendar for:

Business: ${brand.business_name}
Channels: ${brand.channels?.join(', ')}
Content Pillars: ${strategy.contentPillars.map((p) => p.name).join(', ')}
Tone: ${brand.tone}
Target Audience: ${brand.target_audience}
Offer: ${brand.offer}
${memoryBlock ? `\n${memoryBlock}\n` : ''}${memoryMatrixBlock ? `\n### SYSTEM MEMORY & PAST WORKSPACE LEARNINGS\n${memoryMatrixBlock}\n` : ''}
Rules:
- Distribute content across all selected channels
- Vary post types: educational, storytelling, promotional, engagement, behind-scenes
- Hooks must be platform-specific (LinkedIn hooks differ from Instagram)
- Include 3-5 posts per week (skip weekends optionally)
- Every post must have a clear CTA

Return a JSON array of exactly 30 items:
[
  {
    "day": 1,
    "date": "Day 1",
    "platform": "Instagram|LinkedIn|Twitter|YouTube|WhatsApp",
    "postType": "Educational|Carousel|Reel|Story|Poll|Thread|Newsletter",
    "pillar": "pillar name",
    "hook": "First line that stops the scroll",
    "topic": "Specific topic/angle",
    "cta": "What you want them to do",
    "format": "Single image|Carousel|Video|Text|Poll"
  }
]`

  return runAgentWithTools<ContentCalendarItem[]>(SYSTEM_PROMPT, userPrompt, brand.workspace_id)
}
