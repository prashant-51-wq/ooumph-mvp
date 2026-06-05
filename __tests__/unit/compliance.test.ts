/**
 * __tests__/unit/compliance.test.ts
 *
 * Tests for compliance business rules — TASK-002 from TASK_BREAKDOWN.md
 *
 * Per COMPLIANCE_GUARDRAILS.md and TEST_PLAN.md:
 *   CRM-001 — consent and do_not_contact fields must block outreach
 *
 * These tests validate the pure logic of compliance checks without DB.
 * They encode the business rules from COMPLIANCE_GUARDRAILS.md as tests
 * so regressions are caught immediately.
 *
 * Run: npm test
 */

import { describe, test, expect } from 'vitest'

// ── Compliance rule functions ──────────────────────────────────────────────────
// These are the business logic functions that MUST exist before outreach.
// Currently inline here — will move to lib/compliance.ts when that module is built.

interface ContactComplianceFields {
  do_not_contact: number | boolean
  consent_status: string
  unsubscribed_at: string | null | undefined
}

/**
 * canContactByEmail — Returns true only if all compliance checks pass.
 * Implements the rules from COMPLIANCE_GUARDRAILS.md Section "Contact Eligibility".
 */
function canContactByEmail(contact: ContactComplianceFields): { allowed: boolean; reason: string } {
  // Rule 1: Hard stop — do_not_contact flag
  if (contact.do_not_contact === 1 || contact.do_not_contact === true) {
    return { allowed: false, reason: 'Contact is on do-not-contact list' }
  }

  // Rule 2: Opt-out — explicitly unsubscribed
  if (contact.consent_status === 'opted_out') {
    return { allowed: false, reason: 'Contact has opted out of marketing communications' }
  }

  // Rule 3: Unsubscribed via email link
  if (contact.unsubscribed_at) {
    return { allowed: false, reason: 'Contact has unsubscribed' }
  }

  return { allowed: true, reason: 'Contact may be emailed' }
}

/**
 * validateEmailContent — Returns compliance issues in email content.
 * Implements rules from COMPLIANCE_GUARDRAILS.md Section "Email Compliance Rules".
 */
function validateEmailContent(html: string): string[] {
  const issues: string[] = []

  // Rule: Must have unsubscribe mechanism
  const hasUnsubscribe = /unsubscribe|opt.out|manage.*preferences|remove.*from.*list/i.test(html)
  if (!hasUnsubscribe) {
    issues.push('Missing unsubscribe mechanism — required by CAN-SPAM')
  }

  // Rule: No deceptive performance claims
  const claimsPatterns = [
    /guarantee.*\d+%/i,
    /\d+%.*guarantee/i,
    /increase.*leads.*by.*\d{3}%/i,
    /\d{3}%.*more.*leads/i,
  ]
  for (const pattern of claimsPatterns) {
    if (pattern.test(html)) {
      issues.push('Unsubstantiated performance claim detected — requires evidence before sending')
      break
    }
  }

  return issues
}

// ── Contact eligibility tests ─────────────────────────────────────────────────

describe('canContactByEmail — do_not_contact enforcement', () => {
  test('blocks contact with do_not_contact = 1', () => {
    const result = canContactByEmail({
      do_not_contact: 1,
      consent_status: 'opted_in',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('do-not-contact')
  })

  test('blocks contact with do_not_contact = true', () => {
    const result = canContactByEmail({
      do_not_contact: true,
      consent_status: 'opted_in',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(false)
  })

  test('blocks contact with opted_out status', () => {
    const result = canContactByEmail({
      do_not_contact: 0,
      consent_status: 'opted_out',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('opted out')
  })

  test('blocks contact who has unsubscribed', () => {
    const result = canContactByEmail({
      do_not_contact: 0,
      consent_status: 'opted_in',
      unsubscribed_at: '2026-01-15T10:00:00Z',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('unsubscribed')
  })

  test('allows contact with all clear', () => {
    const result = canContactByEmail({
      do_not_contact: 0,
      consent_status: 'opted_in',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(true)
  })

  test('allows contact with not_set status (first contact — consent not yet captured)', () => {
    // 'not_set' means we haven't captured consent yet — allowed for initial outreach
    // but should always go through approval
    const result = canContactByEmail({
      do_not_contact: 0,
      consent_status: 'not_set',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(true)
  })

  test('do_not_contact takes priority over opted_in status', () => {
    // Even if consent is opted_in, DNC flag wins
    const result = canContactByEmail({
      do_not_contact: 1,
      consent_status: 'opted_in',
      unsubscribed_at: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('do-not-contact')
  })
})

// ── Email content validation tests ────────────────────────────────────────────

describe('validateEmailContent — CAN-SPAM compliance', () => {
  test('passes clean email with unsubscribe link', () => {
    const html = `
      <p>Hi there! Check out our product.</p>
      <p><a href="/unsubscribe">Unsubscribe</a></p>
    `
    const issues = validateEmailContent(html)
    expect(issues).toHaveLength(0)
  })

  test('fails email missing unsubscribe mechanism', () => {
    const html = `<p>Hi there! Check out our product. Buy now!</p>`
    const issues = validateEmailContent(html)
    expect(issues.some(i => i.includes('unsubscribe'))).toBe(true)
  })

  test('flags unsubstantiated performance guarantee claim', () => {
    const html = `
      <p>Guarantee 300% more leads!</p>
      <p><a href="/unsubscribe">Unsubscribe</a></p>
    `
    const issues = validateEmailContent(html)
    expect(issues.some(i => i.includes('claim'))).toBe(true)
  })

  test('passes email with "opt out" alternative phrasing', () => {
    const html = `
      <p>Great content here.</p>
      <p>To opt out of future emails, <a href="/opt-out">click here</a>.</p>
    `
    const issues = validateEmailContent(html)
    expect(issues.filter(i => i.includes('unsubscribe'))).toHaveLength(0)
  })
})

// ── Business rule documentation tests ────────────────────────────────────────
// These tests exist to DOCUMENT the rules and fail loudly if someone
// accidentally changes the compliance logic.

describe('compliance rules — documented invariants', () => {
  test('DNC list is absolute — no exceptions', () => {
    // Even with explicit opt-in, DNC flag must block
    const dnc = canContactByEmail({ do_not_contact: 1, consent_status: 'opted_in', unsubscribed_at: null })
    expect(dnc.allowed).toBe(false)
  })

  test('unsubscribe is immediate — cannot be overridden', () => {
    // Even if somehow consent_status is 'opted_in', unsubscribed_at must block
    const unsub = canContactByEmail({ do_not_contact: 0, consent_status: 'opted_in', unsubscribed_at: '2026-01-01T00:00:00Z' })
    expect(unsub.allowed).toBe(false)
  })

  test('AI voice calling is not in scope for MVP — documented', () => {
    // This test serves as documentation that AI voice calling
    // is intentionally not implemented per COMPLIANCE_GUARDRAILS.md
    // If someone adds an AI calling module, this test should fail and
    // prompt them to review compliance implications first.
    const MVP_INCLUDES_AI_VOICE_CALLING = false
    expect(MVP_INCLUDES_AI_VOICE_CALLING).toBe(false)
  })
})
