/**
 * Email Drip Sequence Agent
 * Generates complete multi-email drip sequences using Claude.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { claude, getModel } from '@/lib/claude'
import { assertWorkspaceOwnership } from '@/lib/guards'

interface EmailInSequence {
  day: number
  subject: string
  preview: string
  body: string
  purpose: string
}

interface RequestBody {
  workspaceId: string
  action: 'generate' | 'save'
  // generate
  goal?: string
  audience?: string
  numEmails?: number
  daysBetween?: number
  tone?: string
  // save
  sequence?: EmailInSequence[]
}

async function saveSequenceArtifacts(
  workspaceId: string,
  sequence: EmailInSequence[],
  goal: string,
  runId?: string
): Promise<number> {
  let saved = 0
  for (let i = 0; i < sequence.length; i++) {
    const email = sequence[i]
    const artifactId = newId()
    await sql`
      INSERT INTO artifacts (id, workspace_id, agent_run_id, type, title, content_json, status)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${runId ?? null},
        'email_sequence',
        ${email.subject || `Day ${email.day} — ${goal.slice(0, 50)}`},
        ${JSON.stringify({
          day: email.day,
          subject: email.subject,
          preview: email.preview,
          purpose: email.purpose,
          body: email.body,
          sequenceGoal: goal,
          emailIndex: i,
          totalEmails: sequence.length,
        })},
        'pending_approval'
      )
    `
    saved++
  }
  return saved
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody
    const { workspaceId, action } = body

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    // Load workspace + settings
    const wsResult = await sql`SELECT model_settings FROM workspaces WHERE id = ${workspaceId} LIMIT 1`
    const ws = wsResult.rows[0]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const settings = (typeof ws.model_settings === 'string'
      ? JSON.parse(ws.model_settings || '{}')
      : (ws.model_settings ?? {})) as Record<string, unknown>

    // ── Generate ─────────────────────────────────────────────────────────────
    if (action === 'generate') {
      const {
        goal = '',
        audience = 'our subscribers',
        numEmails = 5,
        daysBetween = 3,
        tone = 'professional',
      } = body

      if (!goal.trim()) return NextResponse.json({ error: 'goal is required for generate action' }, { status: 400 })

      const clampedCount = Math.min(Math.max(numEmails, 1), 10)
      const clampedDays = Math.min(Math.max(daysBetween, 1), 30)

      const runId = newId()
      await sql`
        INSERT INTO agent_runs (id, workspace_id, agent_name, status)
        VALUES (${runId}, ${workspaceId}, 'email_sequence_writer', 'running')
      `

      const model = getModel(settings)

      // Build day schedule string
      const daySchedule = Array.from({ length: clampedCount }, (_, i) => `Day ${i * clampedDays}`).join(', ')

      const systemPrompt = `You are an expert email marketing strategist specialising in high-converting drip sequences. You write emails that feel personal, deliver genuine value, and move subscribers through the customer journey. Always respond with pure JSON — no markdown fences, no extra text.`

      const userPrompt = `Generate a ${clampedCount}-email drip sequence.

Goal: ${goal}
Target audience: ${audience}
Send cadence: ${daySchedule} (${clampedDays} days between each email)
Tone: ${tone}

Return ONLY a valid JSON array with exactly ${clampedCount} objects:
[
  {
    "day": 0,
    "subject": "...(compelling subject line, under 60 chars)",
    "preview": "...(preview text shown in inbox, max 90 chars)",
    "purpose": "...(what this email achieves, e.g. 'Welcome & deliver core value')",
    "body": "...(full HTML email body with inline styles — use <p>, <ul>, <li>, <strong> tags; include a clear CTA button)"
  }
]

Each email must build on the last, moving the reader from awareness → interest → desire → action.`

      let sequence: EmailInSequence[] = []

      try {
        const response = await claude.messages.create({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })

        const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
        // Try to extract JSON array from response
        const arrayMatch = raw.match(/```json\n?([\s\S]*?)\n?```/) || raw.match(/(\[[\s\S]*\])/)
        const jsonStr = arrayMatch ? (arrayMatch[1] || arrayMatch[0]) : raw
        sequence = JSON.parse(jsonStr) as EmailInSequence[]

        if (!Array.isArray(sequence)) throw new Error('Expected JSON array from model')
      } catch (agentError) {
        await sql`UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ${runId}`
        throw agentError
      }

      await sql`
        UPDATE agent_runs
        SET status = 'completed',
            output_json = ${JSON.stringify({ goal, audience, numEmails: sequence.length, daysBetween: clampedDays })},
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ${runId}
      `

      // Save each email as an artifact
      await saveSequenceArtifacts(workspaceId, sequence, goal, runId)

      return NextResponse.json({
        ok: true,
        sequence,
        metadata: { goal, audience, numEmails: sequence.length, daysBetween: clampedDays },
      })
    }

    // ── Save ─────────────────────────────────────────────────────────────────
    if (action === 'save') {
      const { sequence = [], goal = 'Email sequence' } = body
      if (!sequence.length) return NextResponse.json({ error: 'sequence array is required and must not be empty' }, { status: 400 })

      const saved = await saveSequenceArtifacts(workspaceId, sequence, goal)
      return NextResponse.json({ ok: true, saved })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Email sequence agent error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
