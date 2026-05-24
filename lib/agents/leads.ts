import { runAgent } from '@/lib/claude'
import type { BrandProfile, Strategy, LeadGenPlan } from '@/types'

const SYSTEM_PROMPT = `You are the Lead Generation Planner Agent for Ooumph, an AI Marketing Agency OS.
You create actionable inbound and outbound lead generation plans.
Be specific — write actual email copy, LinkedIn messages, and qualification scripts.
Always respond with valid JSON.`

export async function generateLeadGenPlan(
  brand: BrandProfile,
  strategy: Strategy
): Promise<LeadGenPlan> {
  const userPrompt = `Create a lead generation plan for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Target Audience: ${brand.target_audience}
ICP Roles: (derived from audience description)
ICP Pain Points: ${strategy.icp?.painPoints?.join(', ')}
ICP Buying Triggers: ${strategy.icp?.buyingTriggers?.join(', ')}
ICP Objections: ${strategy.icp?.objections?.join(', ')}
Tone: ${brand.tone}

Create:
1. ICP Filters (industries, company size, job titles, buying signals)
2. Inbound Strategy (channels, CTAs, lead magnets)
3. Outbound Strategy (cold email + LinkedIn sequence — write ACTUAL copy)
4. Qualification Rules (5 questions to qualify a lead)

Return JSON:
{
  "icpFilters": {
    "industries": ["string"],
    "companySize": "string",
    "roles": ["string"],
    "signals": ["string (buying signals to look for)"]
  },
  "inboundStrategy": {
    "primaryChannels": ["string"],
    "contentCTA": "string",
    "leadMagnets": ["string"]
  },
  "outboundStrategy": {
    "targetList": "string (where to find them)",
    "coldEmailSubject": "string",
    "coldEmailPreview": "string (full preview text)",
    "linkedInSequence": [
      { "step": 1, "type": "Connection Request|Message", "message": "string (full message)" }
    ]
  },
  "qualificationRules": ["string (qualifying question or criterion)"]
}`

  return runAgent<LeadGenPlan>(SYSTEM_PROMPT, userPrompt)
}
