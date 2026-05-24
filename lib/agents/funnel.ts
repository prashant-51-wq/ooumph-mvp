import { runAgent } from '@/lib/claude'
import type { BrandProfile, Strategy, FunnelPlan } from '@/types'

const SYSTEM_PROMPT = `You are the Funnel Planner Agent for Ooumph, an AI Marketing Agency OS.
You create complete TOFU-MOFU-BOFU funnel blueprints with lead magnets, landing pages, and nurture sequences.
Be specific and actionable. Always respond with valid JSON.`

export async function generateFunnelPlan(
  brand: BrandProfile,
  strategy: Strategy
): Promise<FunnelPlan> {
  const userPrompt = `Design a complete marketing funnel for:

Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
ICP Pain Points: ${strategy.icp?.painPoints?.join(', ')}
ICP Buying Triggers: ${strategy.icp?.buyingTriggers?.join(', ')}
30-Day Objective: ${strategy.thirtyDayObjective}

Create:
1. Lead Magnet (format, title, topic, what they get)
2. Landing Page Structure (headline, bullet points, CTA, form fields)
3. 7-email nurture sequence (day, subject, goal, CTA)
4. CRM pipeline stages
5. Lead scoring model (actions + points)

Return JSON:
{
  "leadMagnet": {
    "title": "string",
    "format": "PDF|Video|Template|Checklist|Webinar|Calculator",
    "topic": "string",
    "deliverable": "string (what they get)"
  },
  "landingPage": {
    "headline": "string",
    "subheadline": "string",
    "bulletPoints": ["string x5"],
    "cta": "string",
    "formFields": ["First Name", "Email", ...]
  },
  "emailNurture": [
    { "day": 0, "subject": "string", "goal": "string", "cta": "string" }
  ],
  "crmStages": ["Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"],
  "leadScoring": [
    { "action": "string", "points": 10 }
  ]
}`

  return runAgent<FunnelPlan>(SYSTEM_PROMPT, userPrompt)
}


