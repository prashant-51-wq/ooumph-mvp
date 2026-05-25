import { runAgent } from '@/lib/claude'
import { braveSearch, formatSearchResults } from '@/lib/tools/brave-search'
import type { BrandProfile } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SalesDeal {
  id: string
  workspace_id: string
  lead_id?: string
  contact_name: string
  contact_email?: string
  company?: string
  title: string
  value: number
  currency: string
  stage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
  probability: number  // 0-100
  expected_close: string  // ISO date
  notes?: string
  source?: string
  custom_fields?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SalesPipeline {
  totalValue: number
  weightedValue: number
  dealsByStage: Record<string, { count: number; value: number }>
  avgDealSize: number
  avgCycleDays: number
  winRate: number
  forecastThisMonth: number
  topDeals: Array<{ title: string; value: number; stage: string; probability: number }>
  recommendations: string[]
}

export interface SalesProposal {
  title: string
  prospectName: string
  businessName: string
  problem: string
  solution: string
  methodology: string[]
  deliverables: Array<{ item: string; description: string; timeline: string }>
  investment: Array<{ tier: string; price: string; includes: string[] }>
  roi: string
  socialProof: string[]
  nextSteps: string[]
  validUntil: string
  html: string  // full HTML proposal ready to render/PDF
}

export interface OutreachSequence {
  totalTouches: number
  duration: string
  touches: Array<{
    day: number
    channel: 'email' | 'linkedin' | 'phone' | 'sms' | 'video'
    subject?: string
    body: string
    cta: string
    notes: string
  }>
  abVariants: { a: string; b: string }
}

export interface DealAnalysis {
  dealScore: number  // 0-100
  health: 'hot' | 'warm' | 'cold' | 'at_risk' | 'dead'
  winProbability: number
  blockers: string[]
  strengths: string[]
  nextAction: string
  nextActionType: 'call' | 'email' | 'proposal' | 'meeting' | 'follow_up' | 'close' | 'disqualify'
  urgency: 'immediate' | 'today' | 'this_week' | 'next_week' | 'low'
  talkingPoints: string[]
  objectionHandlers: Array<{ objection: string; response: string }>
  estimatedCloseDate: string
  reasoning: string
}

export interface SalesForecast {
  period: string
  bestCase: number
  committed: number
  realistic: number
  worstCase: number
  pipelineSummary: string
  topRisks: string[]
  topOpportunities: string[]
  recommendedFocusDeals: string[]
  monthlyProjection: Array<{ month: string; value: number }>
}

export interface DemoScript {
  productName: string
  prospectContext: string
  openingHook: string
  discoveryQuestions: string[]
  demoFlow: Array<{ step: string; feature: string; talkingPoint: string; prospectBenefit: string }>
  objectionHandlers: Array<{ trigger: string; response: string }>
  closingStatement: string
  nextStepCTA: string
  talkingTime: string
}

// ── System Prompts ─────────────────────────────────────────────────────────────

const PIPELINE_SYSTEM = `You are a senior B2B sales director and revenue operations expert with 15+ years closing complex deals.
You analyze sales pipelines with ruthless precision — you know which deals will close, which are stuck, and exactly why.
You use MEDDIC, Challenger Sale, and SPIN frameworks instinctively.
You spot coaching moments and prescribe targeted actions that move revenue.
Always respond with valid JSON only. Never include commentary outside the JSON.`

const PROPOSAL_SYSTEM = `You are a world-class sales proposal writer who has closed $50M+ in enterprise and SMB deals.
Your proposals are famous for being concise, visually structured, and benefit-led — not feature dumps.
You write from the prospect's perspective: their pain, their world, their ROI.
Every word earns its place. You use social proof, risk reversal, and urgency naturally.
Always respond with valid JSON only. The html field must be a complete, self-contained HTML document with inline styles.`

const OUTREACH_SYSTEM = `You are a top-1% SDR/AE hybrid and outbound specialist who consistently books 3x more meetings than average.
You write outreach that prospects actually reply to — because it's relevant, concise, and human.
You understand the psychology of cold outreach, follow-up timing, multi-channel sequencing, and pattern interrupts.
You never use cliches like "I hope this finds you well" or "just checking in."
Always respond with valid JSON only.`

const DEAL_ANALYSIS_SYSTEM = `You are a sales coach and deal review specialist who has sat in on thousands of pipeline reviews.
You assess deal health from signals: activity recency, stakeholder engagement, stage velocity, competitive threats, budget confirmation, timeline pressure.
You diagnose with clinical precision and prescribe the single most impactful next action.
You know the difference between a champion who can't buy and a buyer who won't commit.
Always respond with valid JSON only.`

const FORECAST_SYSTEM = `You are a revenue forecast analyst and VP of Sales with deep expertise in pipeline math, sales cycle modeling, and commit vs. upside categorization.
You build forecasts from the bottom up using historical conversion rates, stage probabilities, and deal momentum signals.
You flag risk with specificity and surface opportunities that deserve immediate focus.
Always respond with valid JSON only.`

const DEMO_SYSTEM = `You are a top enterprise sales engineer and demo strategist who has delivered thousands of product demos.
You know that great demos are discovery-led, story-driven, and end with a clear next step.
You personalize every demo to the prospect's specific pain, industry context, and business goals.
You never do a feature tour — you show transformation.
Always respond with valid JSON only.`

const OBJECTION_SYSTEM = `You are a sales trainer and objection handling expert who coaches enterprise and mid-market AEs.
You know every objection is either a question in disguise, a symptom of a missing qualification step, or a real blocker that requires a specific response.
You write responses that acknowledge, reframe, and advance — never defensive, never dismissive.
Your playbooks are used in real sales calls, so the language must be natural and conversational.
Always respond with valid JSON only.`

const WIN_LOSS_SYSTEM = `You are a revenue intelligence analyst specializing in win/loss analysis and competitive strategy.
You mine deal data for patterns that most reps miss: which objections killed deals, which personas champion vs. stall, which deal sizes close fastest, which competitors win in which segments.
Your analysis is actionable: you surface the top 3 changes that would most improve win rate.
Always respond with valid JSON only.`

// ── Helper ─────────────────────────────────────────────────────────────────────

function computePipelineMetrics(deals: SalesDeal[]) {
  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0)
  const weightedValue = deals.reduce((s, d) => s + (d.value || 0) * ((d.probability || 0) / 100), 0)

  const dealsByStage: Record<string, { count: number; value: number }> = {}
  for (const d of deals) {
    const stage = d.stage || 'prospect'
    if (!dealsByStage[stage]) dealsByStage[stage] = { count: 0, value: 0 }
    dealsByStage[stage].count++
    dealsByStage[stage].value += d.value || 0
  }

  const wonDeals = deals.filter(d => d.stage === 'closed_won')
  const lostDeals = deals.filter(d => d.stage === 'closed_lost')
  const winRate = (wonDeals.length + lostDeals.length) > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0

  const avgDealSize = deals.length > 0 ? Math.round(totalValue / deals.length) : 0

  const now = new Date()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const forecastThisMonth = deals
    .filter(d => {
      if (!d.expected_close) return false
      const close = new Date(d.expected_close)
      return close >= now && close <= endOfMonth && d.stage !== 'closed_won' && d.stage !== 'closed_lost'
    })
    .reduce((s, d) => s + (d.value || 0) * ((d.probability || 0) / 100), 0)

  const topDeals = [...deals]
    .filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost')
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5)
    .map(d => ({ title: d.title, value: d.value, stage: d.stage, probability: d.probability }))

  return { totalValue, weightedValue, dealsByStage, winRate, avgDealSize, forecastThisMonth, topDeals }
}

// ── Core Functions ─────────────────────────────────────────────────────────────

export async function generateSalesPipeline(brand: BrandProfile, deals: SalesDeal[]): Promise<SalesPipeline> {
  const metrics = computePipelineMetrics(deals)
  const year = new Date().getFullYear()

  const [marketData] = await Promise.all([
    braveSearch(`${brand.industry || brand.offer} B2B sales pipeline best practices ${year}`, 5),
  ])

  const marketContext = marketData.length
    ? `MARKET CONTEXT:\n${formatSearchResults(marketData)}`
    : ''

  const userPrompt = `Analyze this sales pipeline for ${brand.business_name} (${brand.offer}) and produce strategic recommendations.

PIPELINE METRICS:
- Total Pipeline Value: ${metrics.totalValue}
- Weighted Value: ${Math.round(metrics.weightedValue)}
- Deals by Stage: ${JSON.stringify(metrics.dealsByStage)}
- Win Rate: ${metrics.winRate}%
- Avg Deal Size: ${metrics.avgDealSize}
- Forecast This Month: ${Math.round(metrics.forecastThisMonth)}
- Top Deals: ${JSON.stringify(metrics.topDeals)}

DEAL COUNT: ${deals.length} total deals
OPEN DEALS: ${deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length}

${marketContext}

Return JSON with these exact fields:
{
  "totalValue": ${metrics.totalValue},
  "weightedValue": ${Math.round(metrics.weightedValue)},
  "dealsByStage": ${JSON.stringify(metrics.dealsByStage)},
  "avgDealSize": ${metrics.avgDealSize},
  "avgCycleDays": <estimate based on typical ${brand.industry || 'B2B'} sales cycles>,
  "winRate": ${metrics.winRate},
  "forecastThisMonth": ${Math.round(metrics.forecastThisMonth)},
  "topDeals": ${JSON.stringify(metrics.topDeals)},
  "recommendations": ["5 specific, actionable recommendations to improve pipeline health and close rate for this business"]
}`

  return runAgent<SalesPipeline>(PIPELINE_SYSTEM, userPrompt)
}

export async function generateSalesProposal(
  brand: BrandProfile,
  prospectName: string,
  prospectCompany: string,
  need: string,
  budget: string,
): Promise<SalesProposal> {
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const userPrompt = `Create a complete sales proposal for this engagement:

SELLER:
Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Tone: ${brand.tone}

PROSPECT:
Name: ${prospectName}
Company: ${prospectCompany}
Need/Problem: ${need}
Budget: ${budget}

PROPOSAL REQUIREMENTS:
- Title: Compelling, specific to this prospect's pain
- Problem: Articulate their situation better than they could themselves (max 3 sentences)
- Solution: How this business solves it uniquely (2-3 sentences)
- Methodology: 4-5 steps of how the engagement works
- Deliverables: 4-6 specific deliverables with clear descriptions and realistic timelines
- Investment: 2-3 pricing tiers (Starter, Growth, Enterprise or similar names) — price the middle tier near ${budget}
- ROI: One specific, credible ROI statement with numbers
- Social Proof: 3 proof points (testimonial snippets, results, case study references — invent realistic ones)
- Next Steps: 3 clear next steps
- Valid Until: ${validUntil}

For the HTML field, generate a complete, self-contained HTML document with:
- DOCTYPE, html, head, body tags
- All inline CSS styles (no external stylesheets)
- A gradient header (deep navy #1e3a5f to indigo #4f46e5) with company name and proposal title
- A clean cover section with prospect name and date
- Executive summary section
- Problem/Opportunity section with subtle left border accent
- Solution section
- Methodology as a numbered timeline
- Deliverables as a 2-column grid
- Investment/Pricing table with the recommended tier highlighted
- ROI section with a large stat callout
- Social proof section with quote cards
- Next steps section with numbered action items
- Footer with validity date and contact info
- Professional font (system-ui, -apple-system, sans-serif)
- Color palette: navy #1e3a5f, indigo #4f46e5, white #ffffff, light gray #f8fafc, dark text #1a202c
- Print-ready (no fixed positioning, standard page widths)

Respond with valid JSON:
{
  "title": "...",
  "prospectName": "${prospectName}",
  "businessName": "${brand.business_name}",
  "problem": "...",
  "solution": "...",
  "methodology": ["step 1", "step 2", "step 3", "step 4"],
  "deliverables": [{ "item": "...", "description": "...", "timeline": "..." }],
  "investment": [{ "tier": "...", "price": "...", "includes": ["...", "..."] }],
  "roi": "...",
  "socialProof": ["quote or result 1", "quote or result 2", "quote or result 3"],
  "nextSteps": ["step 1", "step 2", "step 3"],
  "validUntil": "${validUntil}",
  "html": "<full HTML document as a single string with escaped quotes>"
}`

  return runAgent<SalesProposal>(PROPOSAL_SYSTEM, userPrompt)
}

export async function generateOutreachSequence(
  brand: BrandProfile,
  prospect: string,
  context: string,
  sequenceType: 'cold' | 'warm' | 'enterprise' | 'win_back',
): Promise<OutreachSequence> {
  const sequenceConfig = {
    cold: { touches: 7, duration: '21 days', channels: 'email + linkedin' },
    warm: { touches: 5, duration: '14 days', channels: 'email + phone' },
    enterprise: { touches: 9, duration: '35 days', channels: 'email + linkedin + phone + video' },
    win_back: { touches: 4, duration: '14 days', channels: 'email + phone' },
  }[sequenceType]

  const userPrompt = `Create a ${sequenceType} outreach sequence for this business:

SENDER:
Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Tone: ${brand.tone}
Target Audience: ${brand.target_audience}

PROSPECT: ${prospect}
CONTEXT: ${context || 'No additional context'}

SEQUENCE TYPE: ${sequenceType}
RECOMMENDED: ${sequenceConfig.touches} touches over ${sequenceConfig.duration} via ${sequenceConfig.channels}

For a ${sequenceType} sequence:
${sequenceType === 'cold' ? '- Day 1: Pattern-interrupt opener. Day 3: Value add (insight/resource). Day 7: Case study. Day 10: Different angle. Day 14: Break-up email. Day 17: Final outreach. Day 21: Goodbye email.' : ''}
${sequenceType === 'warm' ? '- Day 1: Personalized follow-up referencing prior interaction. Day 3: Value prop email. Day 5: Phone/voicemail. Day 8: Social proof. Day 12: Direct ask.' : ''}
${sequenceType === 'enterprise' ? '- Day 1: Research-led LinkedIn connect. Day 3: Email with specific insight. Day 7: Phone touch. Day 10: Video message. Day 14: Email with case study. Day 18: LinkedIn message. Day 21: Phone. Day 28: Email. Day 35: Final.' : ''}
${sequenceType === 'win_back' ? '- Day 1: "It has been a while" + what changed. Day 3: New result/proof point. Day 7: Honest conversation offer. Day 14: Final check-in.' : ''}

Rules:
- Never say "just following up", "circling back", "I know you are busy", "hope this finds you well"
- Each touch must add value or advance the conversation — no empty pings
- Email subject lines must be < 50 chars and curiosity-driven
- CTA must be specific and low-friction (not "let me know your thoughts")
- First email should be < 150 words
- LinkedIn messages should be < 100 words

Also generate 2 A/B subject line variants for the Day 1 email.

Return JSON:
{
  "totalTouches": ${sequenceConfig.touches},
  "duration": "${sequenceConfig.duration}",
  "touches": [
    {
      "day": 1,
      "channel": "email",
      "subject": "...",
      "body": "...",
      "cta": "...",
      "notes": "what signal to watch for"
    }
  ],
  "abVariants": { "a": "subject line variant A", "b": "subject line variant B" }
}`

  return runAgent<OutreachSequence>(OUTREACH_SYSTEM, userPrompt)
}

export async function analyzeDeal(
  brand: BrandProfile,
  deal: SalesDeal,
  activities: Array<{ type: string; title: string; created_at: string }>,
): Promise<DealAnalysis> {
  const activityLog = activities
    .map(a => `[${new Date(a.created_at).toLocaleDateString()}] ${a.type}: ${a.title}`)
    .join('\n') || 'No recorded activity'

  const daysSinceActivity = activities.length > 0
    ? Math.round((Date.now() - new Date(activities[0].created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999

  const daysToClose = deal.expected_close
    ? Math.round((new Date(deal.expected_close).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const userPrompt = `Analyze this deal for ${brand.business_name} and give a clinical assessment:

DEAL:
Title: ${deal.title}
Contact: ${deal.contact_name} ${deal.company ? `at ${deal.company}` : ''}
Value: ${deal.currency} ${deal.value}
Stage: ${deal.stage}
Current Probability: ${deal.probability}%
Expected Close: ${deal.expected_close || 'Not set'}
Days to Expected Close: ${daysToClose !== null ? daysToClose : 'Unknown'}
Source: ${deal.source || 'Unknown'}
Notes: ${deal.notes || 'None'}

ACTIVITY SIGNAL:
Days Since Last Activity: ${daysSinceActivity === 999 ? 'Never contacted' : daysSinceActivity}
Activity Log (most recent first):
${activityLog}

SELLER CONTEXT:
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}

Score this deal 0-100. Be harsh — a deal with no recent activity, no confirmed budget, and no next step is not a 70.

Return JSON:
{
  "dealScore": <0-100 integer>,
  "health": "hot|warm|cold|at_risk|dead",
  "winProbability": <0-100 integer, your honest assessment>,
  "blockers": ["specific blocker 1", "specific blocker 2"],
  "strengths": ["what is working in this deal's favor"],
  "nextAction": "One specific, concrete action with exact language if relevant",
  "nextActionType": "call|email|proposal|meeting|follow_up|close|disqualify",
  "urgency": "immediate|today|this_week|next_week|low",
  "talkingPoints": ["3-4 key points to raise in next interaction"],
  "objectionHandlers": [{ "objection": "...", "response": "..." }],
  "estimatedCloseDate": "ISO date string or 'unlikely'",
  "reasoning": "2-3 sentence executive summary of deal status"
}`

  return runAgent<DealAnalysis>(DEAL_ANALYSIS_SYSTEM, userPrompt)
}

export async function generateSalesForecast(
  brand: BrandProfile,
  deals: SalesDeal[],
  period: string,
): Promise<SalesForecast> {
  const openDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
  const wonDeals = deals.filter(d => d.stage === 'closed_won')
  const lostDeals = deals.filter(d => d.stage === 'closed_lost')
  const metrics = computePipelineMetrics(deals)

  const [economicData] = await Promise.all([
    braveSearch(`${brand.industry || 'B2B'} revenue forecast sales outlook ${new Date().getFullYear()}`, 4),
  ])

  const economicContext = economicData.length
    ? `MARKET CONTEXT:\n${formatSearchResults(economicData)}`
    : ''

  const stageConversions = {
    prospect: 5,
    qualified: 20,
    proposal: 40,
    negotiation: 70,
    closed_won: 100,
    closed_lost: 0,
  }

  const stageBreakdown = openDeals.map(d => ({
    title: d.title,
    value: d.value,
    stage: d.stage,
    probability: d.probability,
    expected_close: d.expected_close,
    typical_conversion: stageConversions[d.stage] || d.probability,
  }))

  const userPrompt = `Create a ${period} revenue forecast for ${brand.business_name}:

PIPELINE SUMMARY:
- Open Deals: ${openDeals.length} worth ${metrics.totalValue}
- Weighted Value: ${Math.round(metrics.weightedValue)}
- Won This Period: ${wonDeals.length} deals
- Lost This Period: ${lostDeals.length} deals
- Win Rate: ${metrics.winRate}%
- Avg Deal Size: ${metrics.avgDealSize}

DEAL BREAKDOWN:
${JSON.stringify(stageBreakdown, null, 2)}

FORECAST PERIOD: ${period}
${economicContext}

Build a conservative, realistic, and optimistic scenario. The "committed" number is what you'd bet your job on.
Monthly projections should cover the next 3 months (use current month + 1, + 2, + 3 as month labels).

Return JSON:
{
  "period": "${period}",
  "bestCase": <total if all likely deals close>,
  "committed": <high-confidence closes only>,
  "realistic": <most probable outcome>,
  "worstCase": <if only the safest deals close>,
  "pipelineSummary": "2-sentence summary of pipeline health",
  "topRisks": ["3 specific risks that could hurt the forecast"],
  "topOpportunities": ["2-3 deals or actions that could beat the forecast"],
  "recommendedFocusDeals": ["top 3 deal titles that deserve the most attention this ${period}"],
  "monthlyProjection": [
    { "month": "Month 1 name", "value": <number> },
    { "month": "Month 2 name", "value": <number> },
    { "month": "Month 3 name", "value": <number> }
  ]
}`

  return runAgent<SalesForecast>(FORECAST_SYSTEM, userPrompt)
}

export async function generateDemoScript(
  brand: BrandProfile,
  prospectName: string,
  prospectContext: string,
  focusFeatures: string[],
): Promise<DemoScript> {
  const userPrompt = `Create a personalized product demo script for this engagement:

PRODUCT/SERVICE:
Business: ${brand.business_name}
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Tone: ${brand.tone}

PROSPECT:
Name: ${prospectName}
Context: ${prospectContext || 'No specific context provided'}
Focus Areas: ${focusFeatures.length ? focusFeatures.join(', ') : 'All core capabilities'}

Create a 25-minute demo script that:
1. Opens with a hook tied to THEIR specific pain — not a company overview
2. Discovery questions that reveal pain before showing features
3. A demo flow that tells a before/after story
4. Objection handlers for the most likely resistance points
5. A closing statement that creates urgency
6. A clear next step with a specific CTA

Demo flow should have 4-6 steps, each tied to a specific benefit for this prospect.
Discovery questions should be open-ended and uncover budget, timeline, authority.
Objection handlers should be for price, timing, competitor, "we can do it in-house", and "need to think about it."

Return JSON:
{
  "productName": "${brand.business_name}",
  "prospectContext": "${prospectContext}",
  "openingHook": "exact words to say in the first 30 seconds — not a welcome speech",
  "discoveryQuestions": ["5-7 specific discovery questions"],
  "demoFlow": [
    {
      "step": "Step name",
      "feature": "what you are showing",
      "talkingPoint": "exact talking points for this step",
      "prospectBenefit": "the specific benefit for THIS prospect"
    }
  ],
  "objectionHandlers": [
    { "trigger": "the objection phrase", "response": "exact language to use" }
  ],
  "closingStatement": "the exact closing you deliver after the demo",
  "nextStepCTA": "the specific, low-friction ask at the end",
  "talkingTime": "25 minutes"
}`

  return runAgent<DemoScript>(DEMO_SYSTEM, userPrompt)
}

export async function generateObjectionPlaybook(
  brand: BrandProfile,
  objections: string[],
): Promise<Array<{ objection: string; response: string; tactic: string }>> {
  const hasObjections = objections.length > 0

  const userPrompt = `Create an objection handling playbook for ${brand.business_name}:

BUSINESS:
Offer: ${brand.offer}
Unique Value: ${brand.unique_value}
Target Audience: ${brand.target_audience}
Tone: ${brand.tone}

${hasObjections
    ? `SPECIFIC OBJECTIONS TO HANDLE:\n${objections.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
    : `Generate the top 10 most likely objections a ${brand.target_audience} prospect would raise when buying ${brand.offer}.
Include: price, timing, competitor comparison, internal build vs. buy, need to get approval, need to think about it, ROI proof, contract length, and 2 industry-specific objections.`
  }

For each objection:
- Response: Natural, conversational language a confident AE would actually say (not corporate jargon)
- Tactic: The psychological or sales technique being used (e.g. "Feel-Felt-Found", "Reframe + Proof", "Socratic Question", "Acknowledge + Advance")

Return JSON array:
[
  {
    "objection": "exact objection phrase",
    "response": "2-4 sentence conversational response with exact language",
    "tactic": "technique name and brief explanation"
  }
]`

  return runAgent<Array<{ objection: string; response: string; tactic: string }>>(OBJECTION_SYSTEM, userPrompt)
}

export async function generateWinLossAnalysis(
  brand: BrandProfile,
  wonDeals: SalesDeal[],
  lostDeals: SalesDeal[],
): Promise<{
  winRate: number
  avgWonDealSize: number
  avgLostDealSize: number
  winPatterns: string[]
  lossPatterns: string[]
  topLossReasons: string[]
  topWinFactors: string[]
  segmentInsights: string[]
  recommendations: string[]
  competitiveThreats: string[]
  forecastAccuracy: string
}> {
  const winRate = (wonDeals.length + lostDeals.length) > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0
  const avgWonDealSize = wonDeals.length > 0
    ? Math.round(wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length)
    : 0
  const avgLostDealSize = lostDeals.length > 0
    ? Math.round(lostDeals.reduce((s, d) => s + d.value, 0) / lostDeals.length)
    : 0

  const wonSummary = wonDeals.slice(0, 10).map(d => ({
    title: d.title,
    value: d.value,
    company: d.company,
    source: d.source,
    notes: d.notes?.slice(0, 100),
  }))
  const lostSummary = lostDeals.slice(0, 10).map(d => ({
    title: d.title,
    value: d.value,
    company: d.company,
    source: d.source,
    notes: d.notes?.slice(0, 100),
  }))

  const userPrompt = `Analyze win/loss data for ${brand.business_name} (${brand.offer}):

METRICS:
- Win Rate: ${winRate}%
- Won Deals: ${wonDeals.length} (avg size: ${avgWonDealSize})
- Lost Deals: ${lostDeals.length} (avg size: ${avgLostDealSize})

WON DEALS SAMPLE:
${JSON.stringify(wonSummary, null, 2)}

LOST DEALS SAMPLE:
${JSON.stringify(lostSummary, null, 2)}

TARGET AUDIENCE: ${brand.target_audience}

Find the real patterns. What separates won from lost? What company profiles win? What deal sizes are risky?
Top 3 changes that would most improve win rate should be specific and actionable.

Return JSON:
{
  "winRate": ${winRate},
  "avgWonDealSize": ${avgWonDealSize},
  "avgLostDealSize": ${avgLostDealSize},
  "winPatterns": ["3-4 patterns present in won deals"],
  "lossPatterns": ["3-4 patterns present in lost deals"],
  "topLossReasons": ["top 3 reasons deals are lost with evidence from the data"],
  "topWinFactors": ["top 3 factors correlated with wins"],
  "segmentInsights": ["which types of companies/deals win most, which lose most"],
  "recommendations": ["3 specific, ranked recommendations to improve win rate"],
  "competitiveThreats": ["competitors or alternatives appearing in lost deal notes"],
  "forecastAccuracy": "brief comment on whether pipeline probabilities appear calibrated"
}`

  return runAgent(WIN_LOSS_SYSTEM, userPrompt)
}
