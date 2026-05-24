import { runAgent } from '@/lib/claude'
import type { BrandProfile, Strategy } from '@/types'

const SYSTEM_PROMPT = `You are the Content Copy Agent for Ooumph, an AI Marketing Agency OS.
You write high-converting, brand-aligned marketing copy.
Be specific to the business â€” no generic templates.
Always respond with valid JSON.`

export interface AssetPackage {
  carousel: {
    title: string
    slides: Array<{ headline: string; body: string }>
    coverText: string
    cta: string
  }
  reelScript: {
    hook: string
    scenes: Array<{ timecode: string; action: string; voiceover: string; broll: string }>
    endScreen: string
    caption: string
    hashtags: string[]
  }
  adCopy: {
    headline: string
    primaryText: string
    description: string
    cta: string
    variations: Array<{ headline: string; hook: string }>
  }
  emailDraft: {
    subject: string
    previewText: string
    body: string
    cta: string
    signature: string
  }
  linkedInPost: {
    hook: string
    body: string
    cta: string
    hashtags: string[]
  }
}

export async function generateAssets(
  brand: BrandProfile,
  strategy: Strategy,
  learningNotes?: string[]
): Promise<AssetPackage> {
  const notesContext = learningNotes?.length
    ? `\n\nIMPORTANT - Apply these learnings from previous feedback:\n${learningNotes.join('\n')}`
    : ''

  const userPrompt = `Create a full marketing asset package for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}
Top Content Pillar: ${strategy.contentPillars[0]?.name}
ICP Pain Points: ${strategy.icp?.painPoints?.join(', ')}${notesContext}

Create ALL 5 assets:

1. CAROUSEL POST (8 slides) â€” Educational/value-driven
2. REEL SCRIPT (30-60 seconds) â€” Punchy, hook-first
3. AD COPY SET â€” Direct response, benefit-led
4. EMAIL DRAFT â€” Nurture/intro email, 200-300 words
5. LINKEDIN POST â€” Thought leadership, story-led

Return as JSON:
{
  "carousel": {
    "title": "string",
    "slides": [{"headline": "string", "body": "string"}],
    "coverText": "string",
    "cta": "string"
  },
  "reelScript": {
    "hook": "string (first 3 seconds)",
    "scenes": [{"timecode": "0-5s", "action": "string", "voiceover": "string", "broll": "string"}],
    "endScreen": "string",
    "caption": "string",
    "hashtags": ["string"]
  },
  "adCopy": {
    "headline": "string",
    "primaryText": "string",
    "description": "string",
    "cta": "string",
    "variations": [{"headline": "string", "hook": "string"}]
  },
  "emailDraft": {
    "subject": "string",
    "previewText": "string",
    "body": "string (with line breaks as \\n)",
    "cta": "string",
    "signature": "string"
  },
  "linkedInPost": {
    "hook": "string (first line)",
    "body": "string (with \\n for breaks)",
    "cta": "string",
    "hashtags": ["string"]
  }
}`

  return runAgent<AssetPackage>(SYSTEM_PROMPT, userPrompt)
}


