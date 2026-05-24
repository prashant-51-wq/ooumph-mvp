import { runAgent } from '@/lib/claude'
import type { BrandProfile, Strategy } from '@/types'

const SYSTEM_PROMPT = `You are the AI Strategy Agent for Ooumph, an AI Marketing Agency OS.
Your job is to create a comprehensive, actionable one-page marketing strategy for a business.
Be specific, data-driven, and India-market aware where relevant.
Always respond with valid JSON.`

export async function generateStrategy(brand: BrandProfile): Promise<Strategy> {
  const userPrompt = `Create a complete marketing strategy for this business:

Business: ${brand.business_name}
Industry: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Channels: ${brand.channels?.join(', ')}
Goals: ${brand.goals}
Competitors: ${brand.competitors}
Tone: ${brand.tone}
Monthly Budget: ${brand.monthly_budget}

Generate a strategy with:
1. Sharp market positioning statement
2. Unique Value Proposition (1 sentence, memorable)
3. Ideal Customer Profile (ICP) with demographics, psychographics, 3 pain points, 3 buying triggers, 3 objections
4. 3 Content Pillars (each with name, description, 5 topic ideas)
5. 30-day primary objective (specific, measurable)
6. 5 KPIs with targets and timeframes
7. Channel strategy (one entry per channel they selected)

Return JSON matching this exact shape:
{
  "positioning": "string",
  "uniqueValueProposition": "string",
  "icp": {
    "demographics": "string",
    "psychographics": "string",
    "painPoints": ["string", "string", "string"],
    "buyingTriggers": ["string", "string", "string"],
    "objections": ["string", "string", "string"]
  },
  "contentPillars": [
    { "name": "string", "description": "string", "topics": ["string x5"] }
  ],
  "thirtyDayObjective": "string",
  "kpis": [
    { "metric": "string", "target": "string", "timeframe": "string" }
  ],
  "channelStrategy": [
    { "channel": "string", "frequency": "string", "contentType": "string" }
  ]
}`

  return runAgent<Strategy>(SYSTEM_PROMPT, userPrompt)
}
