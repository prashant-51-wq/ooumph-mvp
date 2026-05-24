export interface Workspace {
  id: string
  name: string
  industry: string
  website: string
  owner_email: string
  status: string
  created_at: string
}

export interface BrandProfile {
  id: string
  workspace_id: string
  business_name: string
  tagline: string
  offer: string
  unique_value: string
  unique_value_prop?: string
  target_audience: string
  tone: string
  competitors: string
  channels: string[]
  goals: string
  monthly_budget: string
  prohibited_claims: string
  approval_email: string
  industry?: string
  products_services?: string
  mission?: string
}

export interface OnboardingData {
  businessName: string
  industry: string
  website: string
  tagline: string
  offer: string
  uniqueValue: string
  targetAudience: string
  tone: string
  competitors: string
  channels: string[]
  goals: string
  monthlyBudget: string
  prohibitedClaims: string
  approvalEmail: string
}

export interface Strategy {
  positioning: string
  uniqueValueProposition: string
  icp: {
    demographics: string
    psychographics: string
    painPoints: string[]
    buyingTriggers: string[]
    objections: string[]
  }
  contentPillars: Array<{
    name: string
    description: string
    topics: string[]
  }>
  thirtyDayObjective: string
  kpis: Array<{
    metric: string
    target: string
    timeframe: string
  }>
  channelStrategy: Array<{
    channel: string
    frequency: string
    contentType: string
  }>
}

export interface ContentCalendarItem {
  day: number
  date: string
  platform: string
  postType: string
  pillar: string
  hook: string
  topic: string
  cta: string
  format: string
}

export interface Artifact {
  id: string
  workspace_id: string
  type: string
  title: string
  content_json: Record<string, unknown>
  status: 'draft' | 'approved' | 'rejected' | 'regenerating'
  created_at: string
}

export interface Approval {
  id: string
  workspace_id: string
  artifact_id: string
  artifact?: Artifact
  status: 'pending' | 'approved' | 'rejected'
  approver_email: string
  notes: string
  created_at: string
}

export interface FunnelPlan {
  leadMagnet: {
    title: string
    format: string
    topic: string
    deliverable: string
  }
  landingPage: {
    headline: string
    subheadline: string
    bulletPoints: string[]
    cta: string
    formFields: string[]
  }
  emailNurture: Array<{
    day: number
    subject: string
    goal: string
    cta: string
  }>
  crmStages: string[]
  leadScoring: Array<{
    action: string
    points: number
  }>
}

export interface LeadGenPlan {
  icpFilters: {
    industries: string[]
    companySize: string
    roles: string[]
    signals: string[]
  }
  inboundStrategy: {
    primaryChannels: string[]
    contentCTA: string
    leadMagnets: string[]
  }
  outboundStrategy: {
    targetList: string
    coldEmailSubject: string
    coldEmailPreview: string
    linkedInSequence: Array<{
      step: number
      type: string
      message: string
    }>
  }
  qualificationRules: string[]
}
