/**
 * lib/agents/branding.ts
 * Core branding intelligence library — callable by any agent or route.
 * All functions call runAgent with expert-level system prompts and return
 * typed, structured results ready for artifact storage.
 */
import { runAgent } from '@/lib/claude'
import type { BrandProfile } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BrandIdentity {
  brandName: string
  tagline: string
  mission: string
  vision: string
  values: Array<{ name: string; description: string }>
  brandPersonality: string[]        // 5 adjectives
  brandArchetype: string            // e.g. "The Hero", "The Sage", "The Creator"
  voiceCharacteristics: string[]
  colorPalette: {
    primary:    { hex: string; name: string; psychology: string }
    secondary:  { hex: string; name: string; psychology: string }
    accent:     { hex: string; name: string; psychology: string }
    neutral:    { hex: string; name: string }
    background: { hex: string; name: string }
  }
  typography: {
    heading:  { font: string; weight: string; googleFontUrl: string }
    body:     { font: string; weight: string; googleFontUrl: string }
    accent:   { font: string; weight: string; googleFontUrl: string }
    pairingRationale: string
  }
  logoDirection: {
    style:        string  // 'wordmark' | 'lettermark' | 'combination' | 'icon'
    concept:      string
    dallEPrompt:  string  // ready to send to DALL-E 3
    colorUsage:   string
    symbolism:    string
  }
  brandSummary: string  // 1-paragraph brand overview
}

export interface BrandVoiceGuide {
  personality: string[]
  tone: Record<string, string>      // channel → tone description
  vocabulary: {
    useTheseWords:  string[]
    avoidTheseWords: string[]
    brandTerms:     Record<string, string>  // our term → what it means
  }
  writingPrinciples: string[]
  sentenceStructure: string
  examples: Array<{
    context:     string
    doThis:      string
    notThis:     string
    explanation: string
  }>
  signaturePhrase: string
  emojiPolicy:    string
}

export interface VisualGuide {
  logoUsage: {
    clearSpace:   string
    minimumSize:  string
    doUse:        string[]
    dontUse:      string[]
  }
  colorUsage: {
    primaryUse:   string
    combinations: Array<{ foreground: string; background: string; ratio: string; usage: string }>
    photoOverlay: string
    gradient?:    string
  }
  typographyUsage: {
    headingScale:  string
    bodyScale:     string
    lineHeight:    string
    letterSpacing: string
    doUse:         string[]
    dontUse:       string[]
  }
  imageStyle: {
    photoStyle:      string
    illustration:    string
    iconStyle:       string
    filterGuidance:  string
    dontUse:         string[]
  }
  layoutPrinciples: string[]
  socialTemplateSpec: {
    instagram:           string
    linkedin:            string
    twitter:             string
    storiesTemplateNote: string
  }
}

export interface BrandConsistencyReport {
  overallScore:    number  // 0-100
  passedChecks:    string[]
  failedChecks:    string[]
  warnings:        string[]
  recommendations: string[]
  platformNotes:   Record<string, string>
}

export interface BrandStory {
  origin:                 string
  foundersJourney:        string
  problemWeFound:         string
  ourSolution:            string
  transformationPromise:  string
  evidenceOfProgress:     string
  callToAction:           string
  elevatorPitch:          string
  pressParagraph:         string
  heroNarrative:          string
}

export interface TaglineOptions {
  primary: string
  alternatives: string[]
  taglineWithRationale: Array<{
    tagline:       string
    angle:         string
    targetEmotion: string
    whenToUse:     string
  }>
  seoVersion:  string
  shortForm:   string
}

// ─── System Prompts ────────────────────────────────────────────────────────────

const BRAND_STRATEGIST_SYSTEM = `You are a senior brand strategist and visual identity designer with 20 years of experience building category-defining brands for companies from funded startups to Fortune 500 enterprises. You have deep expertise in brand psychology, color theory, typography, visual communication, and market positioning. You understand how great brands create emotional resonance, drive loyalty, and command premium pricing. You always think in terms of differentiation — how does this brand stand apart in a crowded market? Your output is always production-ready, specific, and opinionated. Never use placeholder hex codes. Always use real, tested color combinations with genuine psychological reasoning. Always name real Google Fonts. Respond ONLY with valid JSON.`

const BRAND_COPYWRITER_SYSTEM = `You are an expert brand copywriter and content strategist who has written voice guides for companies ranging from early-stage startups to globally recognized consumer brands. You understand the difference between tone and voice, how language shapes perception, and how consistency in language builds trust over time. You write concrete, specific examples — not abstract frameworks. Your "Do This / Not This" comparisons are real, nuanced, and instantly instructive. You know that brand voice is not about adjectives, it's about verbs, sentence rhythm, vocabulary choices, and emotional posture. Respond ONLY with valid JSON.`

const ART_DIRECTOR_SYSTEM = `You are a senior art director and brand designer at a top-tier creative agency. You create comprehensive visual identity systems that are coherent, scalable, and platform-native. You understand WCAG accessibility standards, print-to-digital consistency, and the nuances of visual design across Instagram, LinkedIn, email, and web. You think in systems, not one-offs. Your visual guides are so specific that any contractor could pick them up and produce on-brand work without a briefing. Respond ONLY with valid JSON.`

const STORYTELLING_SYSTEM = `You are a master brand storyteller and narrative strategist. You have written origin stories, press narratives, elevator pitches, and hero stories for brands across every category. You understand the Hero's Journey, the power of conflict-resolution narrative arcs, and how to make a business story emotionally compelling without being manipulative. Your elevator pitches are actually 30 seconds — specific and speakable. Your press paragraphs read like they belong in TechCrunch or Fast Company. Respond ONLY with valid JSON.`

const COLOR_SYSTEM = `You are a color strategist and brand designer with deep expertise in color psychology, accessibility, and visual systems design. You always generate real, specific hex codes based on established color theory and industry knowledge. You understand that color choices must work in print, digital, dark mode, and at small sizes. You know WCAG contrast ratios and always recommend accessible combinations. You generate CSS custom properties and Tailwind config snippets that are copy-paste ready. Respond ONLY with valid JSON.`

const TYPOGRAPHY_SYSTEM = `You are a typography expert and brand designer who specializes in type systems for digital products and marketing. You know Google Fonts inside out, understand type pairing theory (contrast vs. harmony), and know which fonts communicate authority, warmth, innovation, or trustworthiness. Your CSS typography scales are mathematically sound (using modular scale or fluid type). Your Google Fonts URLs are real and correct. Respond ONLY with valid JSON.`

// ─── Helper ────────────────────────────────────────────────────────────────────

function brandContext(brand: BrandProfile): string {
  return `Business: ${brand.business_name}
Industry: ${brand.industry || 'Not specified'}
Offer: ${brand.offer || ''}
Unique Value: ${brand.unique_value || brand.unique_value_prop || ''}
Target Audience: ${brand.target_audience || ''}
Tone: ${brand.tone || ''}
Competitors: ${brand.competitors || ''}
Channels: ${Array.isArray(brand.channels) ? brand.channels.join(', ') : brand.channels || ''}
Goals: ${brand.goals || ''}
Products/Services: ${brand.products_services || ''}
Existing Tagline: ${brand.tagline || '(none yet)'}
Prohibited Claims: ${brand.prohibited_claims || 'none'}`
}

// ─── 1. generateFullBrandIdentity ─────────────────────────────────────────────

export async function generateFullBrandIdentity(
  brand: BrandProfile,
  style: 'corporate' | 'startup' | 'luxury' | 'playful' | 'minimal' | 'bold' = 'startup',
): Promise<BrandIdentity> {
  return runAgent<BrandIdentity>(
    BRAND_STRATEGIST_SYSTEM,
    `Build a complete brand identity system for the following business. Style preference: ${style}.

${brandContext(brand)}

Return a JSON object with EXACTLY this structure. All hex codes must be real, specific, and chosen based on the brand's industry, audience, and style preference. All font names must be real Google Fonts that exist. The DALL-E prompt must be detailed enough to generate a recognisable logo concept.

{
  "brandName": "the refined brand name (can equal business_name)",
  "tagline": "punchy tagline under 8 words",
  "mission": "one sentence: what we do and for whom",
  "vision": "one sentence: the world when we succeed",
  "values": [
    { "name": "value name", "description": "1-2 sentence description of what this means in practice" }
  ],
  "brandPersonality": ["adjective1", "adjective2", "adjective3", "adjective4", "adjective5"],
  "brandArchetype": "e.g. The Creator | The Hero | The Sage | The Explorer | The Rebel | The Caregiver | The Ruler",
  "voiceCharacteristics": ["characteristic1", "characteristic2", "characteristic3"],
  "colorPalette": {
    "primary":    { "hex": "#RRGGBB", "name": "color name", "psychology": "why this color for this brand" },
    "secondary":  { "hex": "#RRGGBB", "name": "color name", "psychology": "why this color for this brand" },
    "accent":     { "hex": "#RRGGBB", "name": "color name", "psychology": "why this color as accent" },
    "neutral":    { "hex": "#RRGGBB", "name": "color name" },
    "background": { "hex": "#RRGGBB", "name": "color name" }
  },
  "typography": {
    "heading": { "font": "Exact Google Font name", "weight": "700", "googleFontUrl": "https://fonts.googleapis.com/css2?family=..." },
    "body":    { "font": "Exact Google Font name", "weight": "400", "googleFontUrl": "https://fonts.googleapis.com/css2?family=..." },
    "accent":  { "font": "Exact Google Font name", "weight": "500", "googleFontUrl": "https://fonts.googleapis.com/css2?family=..." },
    "pairingRationale": "why these fonts work together for this brand"
  },
  "logoDirection": {
    "style": "wordmark | lettermark | combination | icon",
    "concept": "description of the logo concept and what it represents",
    "dallEPrompt": "Detailed DALL-E 3 prompt: 60-80 words, describing shape, color, style, symbolism, no text in image",
    "colorUsage": "how to use the brand colors in the logo",
    "symbolism": "what the logo symbolises and why it fits the brand"
  },
  "brandSummary": "One paragraph (4-6 sentences) describing the brand's identity, positioning, and essence"
}`,
  )
}

// ─── 2. generateBrandVoiceGuide ───────────────────────────────────────────────

export async function generateBrandVoiceGuide(brand: BrandProfile): Promise<BrandVoiceGuide> {
  return runAgent<BrandVoiceGuide>(
    BRAND_COPYWRITER_SYSTEM,
    `Create a comprehensive brand voice guide for this business. The guide must be specific enough for any copywriter to use without a briefing.

${brandContext(brand)}

Return JSON with EXACTLY this structure. The "examples" array must contain AT LEAST 6 real before/after pairs, each with concrete, full-sentence examples (not templates):

{
  "personality": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "tone": {
    "instagram": "specific tone description for Instagram content",
    "linkedin": "specific tone for LinkedIn — how it differs",
    "email": "specific tone for email sequences",
    "website": "specific tone for web copy",
    "ads": "specific tone for paid advertising",
    "customer_support": "specific tone for support communications"
  },
  "vocabulary": {
    "useTheseWords": ["word1", "word2", "...at least 15 words or short phrases this brand uses"],
    "avoidTheseWords": ["word1", "word2", "...at least 10 words this brand never uses"],
    "brandTerms": {
      "our term for customers": "what it signals",
      "our term for our product/service": "what it signals"
    }
  },
  "writingPrinciples": [
    "Principle 1 with brief explanation",
    "Principle 2 with brief explanation",
    "...at least 6 principles"
  ],
  "sentenceStructure": "describe the ideal sentence length, rhythm, and structure for this brand",
  "examples": [
    {
      "context": "Social media caption for a product launch",
      "doThis": "Full example sentence/paragraph written in brand voice",
      "notThis": "Full example sentence/paragraph of what to avoid",
      "explanation": "Why the first version works and the second does not"
    }
  ],
  "signaturePhrase": "a unique phrase, sign-off, or opener that is distinctly this brand",
  "emojiPolicy": "specific guidance: which emojis to use, how many per post, when to use them, when not to"
}`,
  )
}

// ─── 3. generateVisualGuide ───────────────────────────────────────────────────

export async function generateVisualGuide(
  brand: BrandProfile,
  identity?: BrandIdentity,
): Promise<VisualGuide> {
  const identityContext = identity
    ? `Established brand colors: Primary ${identity.colorPalette.primary.hex} (${identity.colorPalette.primary.name}), Secondary ${identity.colorPalette.secondary.hex}, Accent ${identity.colorPalette.accent.hex}. Typography: Heading font: ${identity.typography.heading.font}, Body: ${identity.typography.body.font}. Brand archetype: ${identity.brandArchetype}. Logo style: ${identity.logoDirection.style}.`
    : 'No brand identity established yet — infer visual direction from brand data.'

  return runAgent<VisualGuide>(
    ART_DIRECTOR_SYSTEM,
    `Create a comprehensive visual brand guidelines document.

${brandContext(brand)}
${identityContext}

Return JSON with EXACTLY this structure:

{
  "logoUsage": {
    "clearSpace": "specific clear space rule, e.g. 'Minimum clear space equals the cap-height of the logo mark on all sides'",
    "minimumSize": "minimum size for digital and print, e.g. '24px digital / 10mm print'",
    "doUse": ["approved usage 1", "approved usage 2", "approved usage 3", "approved usage 4"],
    "dontUse": ["forbidden usage 1", "forbidden usage 2", "forbidden usage 3", "forbidden usage 4", "forbidden usage 5"]
  },
  "colorUsage": {
    "primaryUse": "describe when and how to use the primary color",
    "combinations": [
      { "foreground": "#RRGGBB", "background": "#RRGGBB", "ratio": "4.5:1", "usage": "body text on light backgrounds" },
      { "foreground": "#RRGGBB", "background": "#RRGGBB", "ratio": "7.1:1", "usage": "headlines on brand backgrounds" },
      { "foreground": "#RRGGBB", "background": "#RRGGBB", "ratio": "3.2:1", "usage": "large display text only" }
    ],
    "photoOverlay": "guidance on using brand colors as photo overlays",
    "gradient": "CSS gradient string if applicable, e.g. linear-gradient(135deg, #hex 0%, #hex 100%)"
  },
  "typographyUsage": {
    "headingScale": "H1/H2/H3 sizes, e.g. H1: 48px/3rem, H2: 36px/2.25rem, H3: 24px/1.5rem",
    "bodyScale": "body/small/caption sizes",
    "lineHeight": "recommended line-height values",
    "letterSpacing": "letter-spacing guidance per usage",
    "doUse": ["correct usage rule 1", "correct usage rule 2", "correct usage rule 3"],
    "dontUse": ["forbidden usage 1", "forbidden usage 2", "forbidden usage 3"]
  },
  "imageStyle": {
    "photoStyle": "detailed description of the preferred photographic style for this brand",
    "illustration": "illustration style if applicable",
    "iconStyle": "icon style — line weight, fill/outline, corner radius",
    "filterGuidance": "specific photo filter/color grading guidance",
    "dontUse": ["what to avoid in imagery 1", "what to avoid 2", "what to avoid 3"]
  },
  "layoutPrinciples": [
    "Principle 1 — specific layout rule",
    "Principle 2 — grid and spacing system",
    "Principle 3 — white space philosophy",
    "Principle 4 — visual hierarchy rule",
    "Principle 5 — mobile-first consideration"
  ],
  "socialTemplateSpec": {
    "instagram": "1080×1080px feed spec: background, text zone, margins, font sizes, logo placement",
    "linkedin": "1200×628px spec: background, text zone, hierarchy rules",
    "twitter": "1600×900px spec: background, text zone, hierarchy rules",
    "storiesTemplateNote": "1080×1920px stories: safe zones, interactive element placement, text rules"
  }
}`,
  )
}

// ─── 4. checkBrandConsistency ─────────────────────────────────────────────────

export async function checkBrandConsistency(
  brand: BrandProfile,
  contentToCheck: string,
): Promise<BrandConsistencyReport> {
  return runAgent<BrandConsistencyReport>(
    BRAND_COPYWRITER_SYSTEM,
    `Audit the following content for brand consistency. Be a rigorous, expert brand guardian.

Brand Profile:
${brandContext(brand)}

Content to audit:
"""
${contentToCheck}
"""

Check for:
1. Tone match — does the writing match the brand's stated tone?
2. Vocabulary — are there words the brand should avoid? Are preferred words being used?
3. Message alignment — does the content align with the brand's offer and UVP?
4. Prohibited claims — does the content make any claims matching: ${brand.prohibited_claims || 'none specified'}
5. Clarity and directness — is the message clear and free of jargon?
6. CTA quality — is there a clear next step?
7. Audience relevance — is the content relevant to the target audience?

Return JSON:
{
  "overallScore": 0-100,
  "passedChecks": ["specific check that passed with brief note"],
  "failedChecks": ["specific issue found with exact quote from content"],
  "warnings": ["things that could be better but are not failures"],
  "recommendations": ["actionable improvement 1", "actionable improvement 2", "corrected version of the most important issue"],
  "platformNotes": {
    "instagram": "platform-specific note if relevant",
    "linkedin": "platform-specific note if relevant",
    "email": "platform-specific note if relevant"
  }
}`,
  )
}

// ─── 5. generateBrandStory ────────────────────────────────────────────────────

export async function generateBrandStory(brand: BrandProfile): Promise<BrandStory> {
  return runAgent<BrandStory>(
    STORYTELLING_SYSTEM,
    `Write all brand story formats for this business. Each format serves a different context — make each one feel native to its medium.

${brandContext(brand)}

Return JSON with ALL of these formats. The heroNarrative must be approximately 500 words. The elevatorPitch must be speakable in 30 seconds (about 75-80 words). The pressParagraph must be written in 3rd person as if for a press release or media profile.

{
  "origin": "The 'why we started' story — 2-3 sentences. What made the founders decide to build this?",
  "foundersJourney": "2-3 sentences about the personal experience or frustration that created this company",
  "problemWeFound": "1-2 sentences: the specific, vivid problem this company addresses",
  "ourSolution": "2-3 sentences: how the solution works and why it's different",
  "transformationPromise": "Complete sentence: 'We take [customer] from [before state] to [after state]'",
  "evidenceOfProgress": "2-3 sentences: early wins, traction, or proof points (infer credibly from brand data)",
  "callToAction": "One sentence inviting the reader to take the next step",
  "elevatorPitch": "75-80 words, speakable in 30 seconds, first person, energetic and clear",
  "pressParagraph": "3rd person, 3-4 sentences, as written for a media profile or press release",
  "heroNarrative": "Approximately 500-word brand story in brand voice — origin, problem, solution, transformation, invitation"
}`,
  )
}

// ─── 6. generateTaglines ──────────────────────────────────────────────────────

export async function generateTaglines(
  brand: BrandProfile,
  count: number = 10,
): Promise<TaglineOptions> {
  return runAgent<TaglineOptions>(
    BRAND_COPYWRITER_SYSTEM,
    `Generate ${count} tagline options for this brand. Cover multiple creative angles. Every tagline must be under 8 words and immediately memorable.

${brandContext(brand)}

Creative angles to cover across the ${count} taglines:
- Functional (what it does)
- Emotional (how it makes you feel)
- Aspirational (the future state)
- Contrarian (challenging a norm)
- Question-based (invites curiosity)
- Rhyme or alliteration
- Brevity (1-3 words only)
- Power verb opening
- Social proof angle

Return JSON:
{
  "primary": "the single best tagline",
  "alternatives": ["tagline2", "tagline3", "...remaining options"],
  "taglineWithRationale": [
    {
      "tagline": "the tagline text",
      "angle": "which angle this uses (functional/emotional/etc)",
      "targetEmotion": "what emotion this triggers in the audience",
      "whenToUse": "best context: e.g. homepage hero, paid ads, business card"
    }
  ],
  "seoVersion": "a slightly longer version optimised for SEO search intent",
  "shortForm": "1-3 words only — for app icon, sticker, badge"
}`,
  )
}

// ─── 7. generateMVV ───────────────────────────────────────────────────────────

export async function generateMVV(brand: BrandProfile): Promise<{
  mission:  string
  vision:   string
  values:   Array<{ name: string; description: string; behaviors: string[] }>
  purpose:  string
}> {
  return runAgent<{ mission: string; vision: string; values: Array<{ name: string; description: string; behaviors: string[] }>; purpose: string }>(
    BRAND_STRATEGIST_SYSTEM,
    `Define the Mission, Vision, Values, and Purpose for this brand. These must be authentic, specific, and non-generic.

${brandContext(brand)}

Requirements:
- Mission: Present tense. What we do, for whom, and why it matters. One sentence, under 20 words.
- Vision: Future tense. The world when we succeed. One sentence, ambitious but believable.
- Values: 3-5 core values. Each must have specific behavioral descriptions — what does living this value look like day-to-day?
- Purpose: The "why beyond profit" — Simon Sinek's WHY. One sentence.

Return JSON:
{
  "mission": "We [action] for [audience] so they can [outcome].",
  "vision": "A world where [future state].",
  "values": [
    {
      "name": "Value Name",
      "description": "2-3 sentence explanation of what this value means to this company",
      "behaviors": [
        "Observable behavior 1 that demonstrates this value",
        "Observable behavior 2 that demonstrates this value",
        "Observable behavior 3 that demonstrates this value"
      ]
    }
  ],
  "purpose": "One sentence: the deeper reason this company exists beyond making money"
}`,
  )
}

// ─── 8. generateColorPalette ──────────────────────────────────────────────────

export async function generateColorPalette(
  brand: BrandProfile,
  style?: string,
): Promise<{
  primary:    { hex: string; name: string; psychology: string }
  secondary:  { hex: string; name: string; psychology: string }
  accent:     { hex: string; name: string; psychology: string }
  neutrals:   Array<{ hex: string; name: string }>
  gradient:   string
  cssVariables: string
}> {
  return runAgent<{
    primary:    { hex: string; name: string; psychology: string }
    secondary:  { hex: string; name: string; psychology: string }
    accent:     { hex: string; name: string; psychology: string }
    neutrals:   Array<{ hex: string; name: string }>
    gradient:   string
    cssVariables: string
  }>(
    COLOR_SYSTEM,
    `Design a production-ready color palette for this brand.

${brandContext(brand)}
Style preference: ${style || 'not specified — infer from brand data'}

Requirements:
- All hex codes must be real, specific, and chosen with purpose
- Colors must work together harmoniously
- Must include WCAG AA contrast ratios for key combinations
- Must include CSS custom properties code block (copy-paste ready)
- Must include Tailwind config snippet

Return JSON:
{
  "primary":   { "hex": "#RRGGBB", "name": "descriptive color name", "psychology": "why this color for this brand/industry/audience" },
  "secondary": { "hex": "#RRGGBB", "name": "descriptive color name", "psychology": "why this secondary color" },
  "accent":    { "hex": "#RRGGBB", "name": "descriptive color name", "psychology": "why this accent color" },
  "neutrals": [
    { "hex": "#RRGGBB", "name": "Dark Text" },
    { "hex": "#RRGGBB", "name": "Medium Gray" },
    { "hex": "#RRGGBB", "name": "Light Gray" },
    { "hex": "#RRGGBB", "name": "Off White" }
  ],
  "gradient": "linear-gradient(135deg, #RRGGBB 0%, #RRGGBB 100%)",
  "cssVariables": ":root {\\n  --color-primary: #RRGGBB;\\n  --color-secondary: #RRGGBB;\\n  --color-accent: #RRGGBB;\\n  --color-neutral-900: #RRGGBB;\\n  --color-neutral-600: #RRGGBB;\\n  --color-neutral-200: #RRGGBB;\\n  --color-neutral-50: #RRGGBB;\\n}\\n\\n/* Tailwind config:\\nextend: {\\n  colors: {\\n    brand: {\\n      primary: '#RRGGBB',\\n      secondary: '#RRGGBB',\\n      accent: '#RRGGBB',\\n    }\\n  }\\n} */"
}`,
  )
}

// ─── 9. generateTypographySystem ──────────────────────────────────────────────

export async function generateTypographySystem(
  brand: BrandProfile,
  colorPalette?: { primary: { hex: string }; neutrals?: Array<{ hex: string; name: string }> },
): Promise<{
  heading:  { font: string; weight: string; size: string; googleUrl: string }
  body:     { font: string; weight: string; size: string; googleUrl: string }
  accent:   { font: string; weight: string; size: string; googleUrl: string }
  cssCode:  string
  rationale: string
}> {
  const colorContext = colorPalette
    ? `Brand primary color: ${colorPalette.primary.hex}. Text color: ${colorPalette.neutrals?.[0]?.hex || '#1a1a1a'}.`
    : ''

  return runAgent<{
    heading:  { font: string; weight: string; size: string; googleUrl: string }
    body:     { font: string; weight: string; size: string; googleUrl: string }
    accent:   { font: string; weight: string; size: string; googleUrl: string }
    cssCode:  string
    rationale: string
  }>(
    TYPOGRAPHY_SYSTEM,
    `Design a complete typography system for this brand.

${brandContext(brand)}
${colorContext}

Requirements:
- Choose real Google Fonts that match the brand personality
- Include a complete CSS typography scale (H1–H6, body, small, caption)
- Use fluid type (clamp()) for responsive sizes where appropriate
- Include the Google Fonts import URL
- Provide a complete <style> block that is copy-paste ready

Return JSON:
{
  "heading": {
    "font": "Exact Google Font Name",
    "weight": "700",
    "size": "clamp(2rem, 4vw, 3.5rem)",
    "googleUrl": "https://fonts.googleapis.com/css2?family=Font+Name:wght@400;700&display=swap"
  },
  "body": {
    "font": "Exact Google Font Name",
    "weight": "400",
    "size": "1rem",
    "googleUrl": "https://fonts.googleapis.com/css2?family=Font+Name:wght@400;500&display=swap"
  },
  "accent": {
    "font": "Exact Google Font Name",
    "weight": "500",
    "size": "0.875rem",
    "googleUrl": "https://fonts.googleapis.com/css2?family=Font+Name:wght@500&display=swap"
  },
  "cssCode": "/* Complete CSS typography system — copy paste ready */\\n@import url('...');\\n\\n:root {\\n  --font-heading: 'Font Name', sans-serif;\\n  --font-body: 'Font Name', sans-serif;\\n  --font-accent: 'Font Name', sans-serif;\\n}\\n\\nh1 { font-family: var(--font-heading); font-size: clamp(2rem, 4vw, 3.5rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.02em; }\\nh2 { ... }\\nh3 { ... }\\nh4 { ... }\\np { font-family: var(--font-body); font-size: 1rem; line-height: 1.7; }\\nsmall { font-size: 0.875rem; }\\n.caption { font-size: 0.75rem; letter-spacing: 0.04em; }",
  "rationale": "2-3 sentences explaining why these fonts work together for this brand and audience"
}`,
  )
}
