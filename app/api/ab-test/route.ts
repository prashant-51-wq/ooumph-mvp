import { NextRequest, NextResponse } from 'next/server'

interface ABTestVariant {
  label: string
  content: string
  conversionRate: number
  impressions: number
  clicks: number
  isWinner?: boolean
}

interface AIInsight {
  id: string
  text: string
  lift: number
  sourceTest: string
  deployed: boolean
}

interface ABTest {
  id: string
  name: string
  hypothesis: string
  status: 'Running' | 'Completed' | 'Paused'
  contentType: string
  goalMetric: string
  duration: number
  startDate: string
  confidence: number
  variants: ABTestVariant[]
  aiInsight?: string
  createdAt: string
}

const DEMO_TESTS: ABTest[] = [
  {
    id: 'abt_001',
    name: 'Q3 Email Subject Line Test',
    hypothesis: 'Question-based subject lines drive higher open rates than statement-based ones',
    status: 'Completed',
    contentType: 'Email Subject',
    goalMetric: 'Open Rate',
    duration: 14,
    startDate: '2026-05-01',
    confidence: 94,
    variants: [
      { label: 'A', content: 'Your marketing is costing you sales', conversionRate: 18.2, impressions: 4500, clicks: 819, isWinner: false },
      { label: 'B', content: 'Are you leaving sales on the table?', conversionRate: 24.7, impressions: 4500, clicks: 1112, isWinner: true },
    ],
    aiInsight: 'Question-format subject lines outperform statement formats by 35.7%. Curiosity-gap framing drives stronger open intent.',
    createdAt: '2026-05-01T09:00:00Z',
  },
  {
    id: 'abt_002',
    name: 'Hero CTA Button Copy',
    hypothesis: 'Action-oriented CTAs with urgency signals increase click-through vs generic "Learn More"',
    status: 'Running',
    contentType: 'CTA Button',
    goalMetric: 'Click Rate',
    duration: 7,
    startDate: '2026-05-20',
    confidence: 71,
    variants: [
      { label: 'A', content: 'Learn More', conversionRate: 3.1, impressions: 12000, clicks: 372, isWinner: false },
      { label: 'B', content: 'Start Growing Today →', conversionRate: 5.8, impressions: 12000, clicks: 696, isWinner: false },
    ],
    createdAt: '2026-05-20T10:00:00Z',
  },
  {
    id: 'abt_003',
    name: 'Ad Headline Emotional Angle',
    hypothesis: 'Pain-point headlines outperform aspiration headlines for B2B audiences',
    status: 'Paused',
    contentType: 'Ad Headline',
    goalMetric: 'Conversion Rate',
    duration: 10,
    startDate: '2026-04-15',
    confidence: 58,
    variants: [
      { label: 'A', content: 'Scale Your Business with AI Marketing', conversionRate: 2.4, impressions: 8200, clicks: 197, isWinner: false },
      { label: 'B', content: 'Stop Wasting Ad Budget — Let AI Optimize', conversionRate: 3.9, impressions: 8200, clicks: 320, isWinner: false },
    ],
    createdAt: '2026-04-15T08:00:00Z',
  },
]

const DEMO_INSIGHTS: AIInsight[] = [
  { id: 'ins_001', text: 'Subject lines with questions outperform statements by 23% on average across all tests', lift: 23, sourceTest: 'Q3 Email Subject Line Test', deployed: false },
  { id: 'ins_002', text: 'CTAs with directional arrows (→) increase click-through by 18% vs plain text', lift: 18, sourceTest: 'Hero CTA Button Copy', deployed: true },
  { id: 'ins_003', text: 'Pain-point framing resonates 60% more than aspiration framing for B2B SaaS audiences', lift: 60, sourceTest: 'Ad Headline Emotional Angle', deployed: false },
]

// In-memory store for demo (resets on cold start)
let tests: ABTest[] = [...DEMO_TESTS]
const insights: AIInsight[] = [...DEMO_INSIGHTS]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  if (type === 'insights') {
    return NextResponse.json(insights)
  }

  // Stats
  const active = tests.filter(t => t.status === 'Running').length
  const completed = tests.filter(t => t.status === 'Completed').length
  const completedTests = tests.filter(t => t.status === 'Completed')
  const avgLift = completedTests.length > 0
    ? Math.round(completedTests.reduce((sum, t) => {
        const winner = t.variants.find(v => v.isWinner)
        const loser = t.variants.find(v => !v.isWinner)
        if (!winner || !loser || loser.conversionRate === 0) return sum
        return sum + ((winner.conversionRate - loser.conversionRate) / loser.conversionRate) * 100
      }, 0) / completedTests.length)
    : 0

  const bestVariant = completedTests.flatMap(t => t.variants.filter(v => v.isWinner)).sort((a, b) => b.conversionRate - a.conversionRate)[0]

  return NextResponse.json({
    tests,
    stats: {
      active,
      completed,
      total: tests.length,
      avgLift,
      bestConversionRate: bestVariant?.conversionRate || 0,
    },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, hypothesis, variantA, variantB, contentType, goalMetric, duration } = body

  const newTest: ABTest = {
    id: `abt_${Date.now()}`,
    name: name || 'New Test',
    hypothesis: hypothesis || '',
    status: 'Running',
    contentType: contentType || 'Email Subject',
    goalMetric: goalMetric || 'Conversion Rate',
    duration: Number(duration) || 7,
    startDate: new Date().toISOString().split('T')[0],
    confidence: 0,
    variants: [
      { label: 'A', content: variantA || '', conversionRate: 0, impressions: 0, clicks: 0 },
      { label: 'B', content: variantB || '', conversionRate: 0, impressions: 0, clicks: 0 },
    ],
    createdAt: new Date().toISOString(),
  }

  tests = [newTest, ...tests]
  return NextResponse.json({ test: newTest }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const body = await req.json()

  const idx = tests.findIndex(t => t.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Test not found' }, { status: 404 })

  tests[idx] = { ...tests[idx], ...body }
  return NextResponse.json({ test: tests[idx] })
}
