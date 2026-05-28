/**
 * /lp/[id] — Sprint 11B
 *
 * Public hosted landing page renderer. Closes the post-Sprint-10 audit's
 * P0 finding: the funnel landing-page agent (api/agents/funnel/landing-page)
 * generated a structured `landing_page` artifact AND returned a publicUrl
 * pointing at `/lp/${artifactId}` — but no page existed to serve it.
 * Result: the entire lead-gen flow had no live URL.
 *
 * This Server Component:
 *   1. Looks up the artifact by id, requiring type='landing_page' AND
 *      approval status='approved' (HITL gate — unpublished LPs 404).
 *   2. Renders the structured sections (hero, pain_points, solution,
 *      features, social_proof, offer, faq, final_cta) into accessible
 *      HTML with the form pointing at /api/lp-submit?lid={id}, which
 *      writes to leads_captured + fires workflow triggers.
 *   3. Uses inline CSS (no Tailwind dependency on the public page) so
 *      the LP renders without any client-side hydration — fastest TTI,
 *      no JS required for form submit.
 *
 * Why not use the agent's htmlTemplate field directly:
 *   - Untrusted HTML in a public page is an XSS vector. The structured
 *     data is safe because React escapes by default.
 *   - The structured data is what the approvals UI shows / the user
 *     edits, so this renderer stays in sync with what they reviewed.
 *
 * Errors → 404. Form submit → /lp/thanks (existing page from Sprint 4).
 */

import { sql } from '@/lib/db'
import { notFound } from 'next/navigation'

interface LPSection {
  sectionType: 'hero' | 'pain_points' | 'solution' | 'features' | 'social_proof' | 'offer' | 'faq' | 'final_cta'
  headline: string
  subtext: string
  bullets?: string[]
  cta?: string
  designNote?: string
}

interface LandingPageContent {
  metaTitle?: string
  metaDescription?: string
  headline: string
  subheadline?: string
  sections?: LPSection[]
  socialProofItems?: string[]
  urgencyElement?: string
  formFields?: string[]
  thankYouMessage?: string
  businessName?: string
}

interface LPRow {
  id: string
  title: string | null
  content_json: string | LandingPageContent | null
  approval_status: string | null
}

async function loadLandingPage(id: string): Promise<LandingPageContent | null> {
  // Must be approved — never expose drafts on a public URL.
  const result = await sql`
    SELECT a.id, a.title, a.content_json, ap.status as approval_status
    FROM artifacts a
    LEFT JOIN approvals ap ON ap.artifact_id = a.id
    WHERE a.id = ${id} AND a.type = 'landing_page'
    ORDER BY ap.created_at DESC
    LIMIT 1
  `
  const row = result.rows[0] as unknown as LPRow | undefined
  if (!row) return null
  if ((row.approval_status || '').toLowerCase() !== 'approved') return null

  // content_json may be string or already parsed depending on the DB layer.
  let parsed: LandingPageContent | null = null
  if (typeof row.content_json === 'string') {
    try { parsed = JSON.parse(row.content_json) as LandingPageContent } catch { parsed = null }
  } else if (row.content_json && typeof row.content_json === 'object') {
    parsed = row.content_json as LandingPageContent
  }
  return parsed
}

/**
 * Build a normalized list of form fields. Backwards-compatible: the
 * agent emits formFields as ['First Name', 'Email', 'Company'] strings.
 * We map common labels → known field names that lp-submit reads.
 */
function formFieldDescriptors(fields: string[] | undefined) {
  const defaults: Array<{ name: string; label: string; type: string; required: boolean }> = [
    { name: 'name', label: 'Your name', type: 'text', required: true },
    { name: 'email', label: 'Email address', type: 'email', required: true },
  ]
  if (!fields || fields.length === 0) return defaults
  return fields.map(label => {
    const norm = label.toLowerCase().trim()
    if (norm.includes('email')) return { name: 'email', label, type: 'email', required: true }
    if (norm.includes('phone') || norm.includes('mobile')) return { name: 'phone', label, type: 'tel', required: false }
    if (norm.includes('company') || norm.includes('business') || norm.includes('organization')) {
      return { name: 'company', label, type: 'text', required: false }
    }
    if (norm.includes('message') || norm.includes('comment')) return { name: 'message', label, type: 'textarea', required: false }
    // first/full name fallback
    return { name: 'name', label, type: 'text', required: true }
  })
}

// ─── Metadata (Next.js generateMetadata) ─────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const page = await loadLandingPage(id)
  if (!page) {
    return { title: 'Page not found' }
  }
  return {
    title: page.metaTitle || page.headline || 'Landing page',
    description: page.metaDescription || page.subheadline || undefined,
    // Open Graph defaults — most platforms expect them.
    openGraph: {
      title: page.metaTitle || page.headline,
      description: page.metaDescription || page.subheadline,
      type: 'website',
    },
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function LandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const page = await loadLandingPage(id)
  if (!page) notFound()

  const fields = formFieldDescriptors(page.formFields)
  const sections = page.sections || []

  return (
    <div className="lp-root">
      {/* Inline styles — keeps the public page zero-JS and minimal-CSS. */}
      <style>{`
        .lp-root {
          --bg: #0a0b10;
          --surface: #11131a;
          --surface-2: #181b25;
          --text: #f1f5f9;
          --text-dim: #94a3b8;
          --border: #1f2937;
          --accent: #6366f1;
          --accent-hover: #4f46e5;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.6;
          margin: 0;
        }
        .lp-root * { box-sizing: border-box; }
        .lp-container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
        .lp-hero { padding: 64px 0 48px; text-align: center; }
        .lp-h1 { font-size: clamp(32px, 5vw, 56px); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 16px; }
        .lp-sub { font-size: clamp(16px, 2vw, 20px); color: var(--text-dim); margin: 0 0 32px; max-width: 720px; margin-left: auto; margin-right: auto; }
        .lp-urgency { display: inline-block; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: #c7d2fe; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
        .lp-section { padding: 48px 0; border-top: 1px solid var(--border); }
        .lp-section h2 { font-size: clamp(24px, 3vw, 36px); font-weight: 700; margin: 0 0 12px; }
        .lp-section p { color: var(--text-dim); font-size: 17px; margin: 0 0 16px; }
        .lp-bullets { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 12px; }
        .lp-bullets li { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
        .lp-bullets li::before { content: '✓'; color: var(--accent); font-weight: 700; flex-shrink: 0; }
        .lp-proof { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .lp-proof-card { padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; color: var(--text); font-size: 15px; font-style: italic; }
        .lp-form { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; margin: 32px 0; }
        .lp-form label { display: block; font-size: 13px; color: var(--text-dim); margin-bottom: 6px; font-weight: 500; }
        .lp-form input, .lp-form textarea {
          width: 100%; padding: 12px 14px; background: var(--surface-2);
          border: 1px solid var(--border); border-radius: 8px;
          color: var(--text); font-size: 15px; font-family: inherit;
          margin-bottom: 14px; resize: vertical;
        }
        .lp-form input:focus, .lp-form textarea:focus { outline: none; border-color: var(--accent); }
        .lp-form button { width: 100%; padding: 14px 24px; background: var(--accent); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .lp-form button:hover { background: var(--accent-hover); }
        .lp-footer { text-align: center; padding: 48px 0 32px; color: var(--text-dim); font-size: 13px; border-top: 1px solid var(--border); }
        .lp-footer a { color: var(--accent); text-decoration: none; }
      `}</style>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-container">
          {page.urgencyElement && (
            <div className="lp-urgency">{page.urgencyElement}</div>
          )}
          <h1 className="lp-h1">{page.headline}</h1>
          {page.subheadline && <p className="lp-sub">{page.subheadline}</p>}
        </div>
      </section>

      {/* Body sections */}
      {sections.filter(s => s.sectionType !== 'final_cta' && s.sectionType !== 'social_proof').map((section, idx) => (
        <section key={idx} className="lp-section">
          <div className="lp-container">
            <h2>{section.headline}</h2>
            {section.subtext && <p>{section.subtext}</p>}
            {section.bullets && section.bullets.length > 0 && (
              <ul className="lp-bullets">
                {section.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
        </section>
      ))}

      {/* Social proof */}
      {(page.socialProofItems && page.socialProofItems.length > 0) && (
        <section className="lp-section">
          <div className="lp-container">
            <h2>What people are saying</h2>
            <div className="lp-proof">
              {page.socialProofItems.map((item, i) => (
                <div key={i} className="lp-proof-card">&ldquo;{item}&rdquo;</div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Lead capture form — posts to /api/lp-submit?lid={artifactId} which
          writes to leads_captured, auto-scores via /api/agents/funnel/qualify,
          fires lead_captured workflow triggers, then 303-redirects to /lp/thanks. */}
      <section className="lp-section">
        <div className="lp-container">
          {sections.filter(s => s.sectionType === 'final_cta').map((section, idx) => (
            <div key={idx}>
              <h2>{section.headline}</h2>
              {section.subtext && <p>{section.subtext}</p>}
            </div>
          ))}
          <form className="lp-form" method="POST" action={`/api/lp-submit?lid=${encodeURIComponent(id)}`}>
            {fields.map(f => (
              <div key={f.name + f.label}>
                <label htmlFor={`lp-${f.name}`}>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea id={`lp-${f.name}`} name={f.name} rows={3} required={f.required} />
                ) : (
                  <input id={`lp-${f.name}`} name={f.name} type={f.type} required={f.required} autoComplete={f.type === 'email' ? 'email' : f.name === 'name' ? 'name' : 'off'} />
                )}
              </div>
            ))}
            <button type="submit">
              {sections.find(s => s.sectionType === 'final_cta')?.cta || sections[0]?.cta || 'Get started'}
            </button>
          </form>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">
          <p>{page.businessName ? `Powered by ${page.businessName}` : 'Powered by Ooumph'}</p>
        </div>
      </footer>
    </div>
  )
}
