// TODO: Add platform-owner auth check — only super admin role can access

import { NextRequest, NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgencyPlan = 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
type AgencyStatus = 'Active' | 'Trial' | 'Suspended' | 'Churned'

interface OverviewStats {
  totalAgencies: number
  activeMrr: number
  platformRevenue: number
  activeSubscriptions: number
  trialSubscriptions: number
  churnRate: number
  avgRevenuePerAgency: number
  recentSignups: RecentSignup[]
  revenueByMonth: MonthRevenue[]
}

interface RecentSignup {
  id: string
  name: string
  ownerEmail: string
  plan: AgencyPlan
  mrr: number
  joinDate: string
  status: AgencyStatus
}

interface AgencyRecord {
  id: string
  name: string
  ownerEmail: string
  plan: AgencyPlan
  mrr: number
  seatsUsed: number
  seatsTotal: number
  status: AgencyStatus
  joinDate: string
}

interface AffiliateRecord {
  id: string
  name: string
  email: string
  referredAgencies: number
  totalReferralMrr: number
  commissionRate: number
  earnedThisMonth: number
  paidOut: number
  balance: number
}

interface CommissionsData {
  affiliates: AffiliateRecord[]
  totalOwed: number
  paidThisMonth: number
  topAffiliateName: string
}

interface MonthRevenue {
  month: string
  value: number
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const AGENCIES: AgencyRecord[] = [
  { id: 'ag-1', name: 'Pixel Peak Media', ownerEmail: 'lisa@pixelpeak.com', plan: 'Agency', mrr: 497, seatsUsed: 8, seatsTotal: 10, status: 'Active', joinDate: '2025-11-14' },
  { id: 'ag-2', name: 'GrowthStack Co.', ownerEmail: 'dev@growthstack.io', plan: 'Pro', mrr: 149, seatsUsed: 3, seatsTotal: 5, status: 'Active', joinDate: '2026-01-02' },
  { id: 'ag-3', name: 'BrightBrand HQ', ownerEmail: 'ops@brightbrandhq.com', plan: 'Enterprise', mrr: 997, seatsUsed: 22, seatsTotal: 50, status: 'Active', joinDate: '2025-09-30' },
  { id: 'ag-4', name: 'Funnel Craft Agency', ownerEmail: 'joe@funnelcraft.io', plan: 'Starter', mrr: 49, seatsUsed: 1, seatsTotal: 2, status: 'Trial', joinDate: '2026-05-20' },
  { id: 'ag-5', name: 'ScaleNow Partners', ownerEmail: 'team@scalenow.com', plan: 'Agency', mrr: 497, seatsUsed: 7, seatsTotal: 10, status: 'Active', joinDate: '2026-02-14' },
  { id: 'ag-6', name: 'Momentum Marketing', ownerEmail: 'hi@momentumktg.co', plan: 'Pro', mrr: 149, seatsUsed: 4, seatsTotal: 5, status: 'Active', joinDate: '2026-03-08' },
  { id: 'ag-7', name: 'DraftMark Agency', ownerEmail: 'admin@draftmark.xyz', plan: 'Starter', mrr: 49, seatsUsed: 2, seatsTotal: 2, status: 'Suspended', joinDate: '2025-12-01' },
  { id: 'ag-8', name: 'ViralVault Studio', ownerEmail: 'vv@viralvault.studio', plan: 'Pro', mrr: 0, seatsUsed: 0, seatsTotal: 5, status: 'Churned', joinDate: '2026-01-15' },
]

const AFFILIATES: AffiliateRecord[] = [
  { id: 'aff-1', name: 'Jordan Miles', email: 'jordan@affiliates.io', referredAgencies: 14, totalReferralMrr: 3820, commissionRate: 20, earnedThisMonth: 764, paidOut: 4200, balance: 764 },
  { id: 'aff-2', name: 'Priya Chandran', email: 'priya.c@resellers.net', referredAgencies: 8, totalReferralMrr: 1940, commissionRate: 20, earnedThisMonth: 388, paidOut: 1800, balance: 388 },
  { id: 'aff-3', name: 'Brett Farley', email: 'brett@brettfarley.com', referredAgencies: 5, totalReferralMrr: 1200, commissionRate: 15, earnedThisMonth: 180, paidOut: 820, balance: 180 },
  { id: 'aff-4', name: 'Nadia Osei', email: 'nadia@growthhq.africa', referredAgencies: 3, totalReferralMrr: 595, commissionRate: 15, earnedThisMonth: 89, paidOut: 300, balance: 89 },
]

const REVENUE_BY_MONTH: MonthRevenue[] = [
  { month: 'Dec', value: 8200 },
  { month: 'Jan', value: 10400 },
  { month: 'Feb', value: 12800 },
  { month: 'Mar', value: 15100 },
  { month: 'Apr', value: 17600 },
  { month: 'May', value: 21340 },
]

// ─── Handlers ─────────────────────────────────────────────────────────────────

function getOverview(): OverviewStats {
  const activeAgencies = AGENCIES.filter(a => a.status !== 'Churned')
  const totalMrr = activeAgencies.reduce((s, a) => s + a.mrr, 0)
  const churnedCount = AGENCIES.filter(a => a.status === 'Churned').length
  const churnRate = parseFloat(((churnedCount / AGENCIES.length) * 100).toFixed(1))
  const recentSignups: RecentSignup[] = [...AGENCIES]
    .sort((a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime())
    .slice(0, 5)
    .map(({ id, name, ownerEmail, plan, mrr, joinDate, status }) => ({
      id, name, ownerEmail, plan, mrr, joinDate, status,
    }))

  return {
    totalAgencies: AGENCIES.length,
    activeMrr: totalMrr,
    platformRevenue: Math.round(totalMrr * 0.2),
    activeSubscriptions: AGENCIES.filter(a => a.status === 'Active').length,
    trialSubscriptions: AGENCIES.filter(a => a.status === 'Trial').length,
    churnRate,
    avgRevenuePerAgency: Math.round(totalMrr / Math.max(activeAgencies.length, 1)),
    recentSignups,
    revenueByMonth: REVENUE_BY_MONTH,
  }
}

function getAgencies(): AgencyRecord[] {
  return AGENCIES
}

function getCommissions(): CommissionsData {
  const totalOwed = AFFILIATES.reduce((s, a) => s + a.balance, 0)
  const paidThisMonth = AFFILIATES.reduce((s, a) => s + a.earnedThisMonth, 0)
  const top = AFFILIATES.reduce((t, a) => a.balance > t.balance ? a : t, AFFILIATES[0])
  return {
    affiliates: AFFILIATES,
    totalOwed,
    paidThisMonth,
    topAffiliateName: top?.name ?? '',
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section')

  switch (section) {
    case 'overview':
      return NextResponse.json(getOverview())
    case 'agencies':
      return NextResponse.json(getAgencies())
    case 'commissions':
      return NextResponse.json(getCommissions())
    default:
      return NextResponse.json(
        { error: 'Invalid section. Use: overview | agencies | commissions' },
        { status: 400 }
      )
  }
}
