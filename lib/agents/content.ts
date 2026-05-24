import { runAgent } from '@/lib/claude'
import type { BrandProfile, Strategy, ContentCalendarItem } from '@/types'

const SYSTEM_PROMPT = `You are the Content Calendar Agent for Ooumph, an AI Marketing Agency OS.
Create a 30-day content calendar that is strategic, varied, and platform-optimized.
Hooks must be attention-grabbing and specific to the business.
Always respond with valid JSON.`

export async function generateContentCalendar(
  brand: BrandProfile,
  strategy: Strategy
): Promise<ContentCalendarItem[]> {
  const userPrompt = `Create a 30-day content calendar for:

Business: ${brand.business_name}
Channels: ${brand.channels?.join(', ')}
Content Pillars: ${strategy.contentPillars.map((p) => p.name).join(', ')}
Tone: ${brand.tone}
Target Audience: ${brand.target_audience}
Offer: ${brand.offer}

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

  return runAgent<ContentCalendarItem[]>(SYSTEM_PROMPT, userPrompt)
}


