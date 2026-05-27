/**
 * lib/link-tracker.ts
 *
 * URL shortener + click-attribution utility. Used by the publishing worker
 * to pipe outbound copy through automatic link shortening so every external
 * URL becomes a tracked /api/l/:slug redirector.
 *
 *   const { transformedBody, slugs } = await shortenAndTrackUrls(
 *     'Read more at https://acme.com/blog/foo and https://acme.com/x',
 *     workspaceId, scheduledContentId, 'linkedin',
 *   )
 *
 *   // transformedBody now contains base URLs like
 *   // "Read more at https://ooumph.com/api/l/a7Z3xQ and https://ooumph.com/api/l/Bk9Lm2"
 *
 * Design notes
 * ─────────────
 * - Slug generation uses crypto.randomBytes for cryptographic uniqueness;
 *   collisions are statistically negligible at 6 chars (~57 billion options
 *   with the base62 alphabet), but we still re-roll on the rare INSERT clash.
 * - The function NEVER throws on per-URL failures; if a single insert fails
 *   the original URL stays in the body. The publish pipeline must keep going.
 * - URLs already pointing at our own redirector (or our base URL) are skipped
 *   so we don't recursively shorten our own shortlinks.
 * - The regex is intentionally permissive — anything that looks like an
 *   http(s):// URL up to whitespace / quote / closing punctuation.
 */

import crypto from 'crypto'
import { sql, newId } from '@/lib/db'

const SLUG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const SLUG_LENGTH = 6
const MAX_SLUG_ATTEMPTS = 6

// Pragmatic URL matcher. Matches http(s) URLs, optionally stripping the
// trailing punctuation we don't want included (., ,, !, ?, ), ], ;, :).
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g
const TRAILING_PUNCT = /[.,!?)\];:]+$/

interface ShortenResult {
  /** Transformed copy with original URLs swapped for /api/l/:slug links. */
  transformedBody: string
  /** Mapping of each original URL → slug we generated (or null if skipped). */
  slugs: Array<{ originalUrl: string; slug: string | null; reason?: string }>
  /** Convenience: how many URLs were actually shortened. */
  shortenedCount: number
}

/**
 * Generate a cryptographically random 6-char slug from the base57 alphabet
 * (digits 2-9 + letters minus I, O, l, 0, 1 for visual disambiguation).
 */
export function generateSlug(length = SLUG_LENGTH): string {
  const bytes = crypto.randomBytes(length)
  let slug = ''
  for (let i = 0; i < length; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  }
  return slug
}

/**
 * Resolve the canonical base URL for redirector links. Falls back through
 * NEXT_PUBLIC_BASE_URL → VERCEL_URL → localhost so this works in every env.
 */
function getRedirectorBase(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  if (explicit) return explicit
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  return 'http://localhost:3000'
}

/**
 * Return true if the URL points at our own redirector / base URL — we
 * don't want to recursively shorten our own shortlinks.
 */
function isOwnRedirectorUrl(url: string): boolean {
  const base = getRedirectorBase()
  try {
    const u = new URL(url)
    const b = new URL(base)
    if (u.host !== b.host) return false
    return u.pathname.startsWith('/api/l/')
  } catch {
    return false
  }
}

/**
 * Insert a tracked_links row, retrying on the (statistically improbable)
 * slug collision. Returns the slug on success, null on persistent failure.
 */
async function insertTrackedLink(opts: {
  workspaceId: string
  originalUrl: string
  scheduledContentId?: string | null
  publishedContentId?: string | null
  channel?: string | null
  campaignId?: string | null
}): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = generateSlug()
    try {
      await sql`
        INSERT INTO tracked_links (
          id, slug, workspace_id, original_url,
          scheduled_content_id, published_content_id, channel, campaign_id
        ) VALUES (
          ${newId()}, ${slug}, ${opts.workspaceId}, ${opts.originalUrl},
          ${opts.scheduledContentId || null}, ${opts.publishedContentId || null},
          ${opts.channel || null}, ${opts.campaignId || null}
        )
      `
      return slug
    } catch (err) {
      // Unique-violation likely on the slug — re-roll and try again. Any
      // other error (e.g. workspace constraint) is fatal for this URL.
      const msg = err instanceof Error ? err.message : String(err)
      if (!/unique|UNIQUE/i.test(msg)) {
        console.error('[link-tracker] non-collision insert error', msg)
        return null
      }
      // collision — loop
    }
  }
  console.error('[link-tracker] exhausted slug attempts for', opts.originalUrl)
  return null
}

/**
 * The core API. Replaces every http(s) URL in `contentBody` with a
 * tracked redirector and returns the transformed text plus the mapping.
 */
export async function shortenAndTrackUrls(
  contentBody: string,
  workspaceId: string,
  scheduledContentId: string | null = null,
  channel: string | null = null,
  opts: { campaignId?: string | null; publishedContentId?: string | null } = {},
): Promise<ShortenResult> {
  if (!contentBody || !workspaceId) {
    return { transformedBody: contentBody || '', slugs: [], shortenedCount: 0 }
  }

  const base = getRedirectorBase()
  const slugs: ShortenResult['slugs'] = []
  let shortenedCount = 0

  // Walk the input and stream into the output buffer; this preserves any
  // trailing punctuation that follows a URL (we strip it from the URL itself
  // before storing / shortening, then re-append it to the output).
  let result = ''
  let cursor = 0
  let match: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(contentBody)) !== null) {
    const fullMatch = match[0]
    const trailing = fullMatch.match(TRAILING_PUNCT)?.[0] || ''
    const cleanUrl = trailing ? fullMatch.slice(0, fullMatch.length - trailing.length) : fullMatch

    result += contentBody.slice(cursor, match.index)

    if (isOwnRedirectorUrl(cleanUrl)) {
      slugs.push({ originalUrl: cleanUrl, slug: null, reason: 'own_redirector' })
      result += fullMatch
    } else {
      const slug = await insertTrackedLink({
        workspaceId,
        originalUrl: cleanUrl,
        scheduledContentId,
        publishedContentId: opts.publishedContentId || null,
        channel,
        campaignId: opts.campaignId || null,
      })
      if (slug) {
        result += `${base}/api/l/${slug}${trailing}`
        slugs.push({ originalUrl: cleanUrl, slug })
        shortenedCount++
      } else {
        // Persistence failed — leave the original URL intact rather than
        // dropping it from the published copy.
        result += fullMatch
        slugs.push({ originalUrl: cleanUrl, slug: null, reason: 'insert_failed' })
      }
    }
    cursor = match.index + fullMatch.length
  }
  result += contentBody.slice(cursor)

  return { transformedBody: result, slugs, shortenedCount }
}

/**
 * Fetch the original URL for a slug. Returns null if not found / inactive.
 * Used by the /api/l/:slug redirector.
 */
export async function resolveSlug(slug: string): Promise<{
  workspace_id: string
  original_url: string
  channel: string | null
} | null> {
  if (!slug || !/^[A-Za-z0-9]+$/.test(slug)) return null
  const res = await sql`
    SELECT workspace_id, original_url, channel, status
    FROM tracked_links
    WHERE slug = ${slug}
    LIMIT 1
  `
  const row = res.rows[0] as { workspace_id?: string; original_url?: string; channel?: string | null; status?: string } | undefined
  if (!row || !row.original_url || row.status === 'disabled') return null
  return {
    workspace_id: String(row.workspace_id),
    original_url: row.original_url,
    channel: row.channel || null,
  }
}

/**
 * Record a single click event. Fire-and-forget — the redirector should call
 * this and immediately return the 302 without awaiting persistence.
 */
export async function recordClick(opts: {
  slug: string
  workspaceId: string
  channel?: string | null
  referrer?: string | null
  userAgent?: string | null
  country?: string | null
}): Promise<void> {
  try {
    const now = new Date().toISOString()
    // Two writes: append a click row + bump the denormalised counter.
    await Promise.all([
      sql`
        INSERT INTO link_clicks (id, slug, workspace_id, channel, referrer, user_agent, country, clicked_at)
        VALUES (
          ${newId()}, ${opts.slug}, ${opts.workspaceId}, ${opts.channel || null},
          ${(opts.referrer || '').slice(0, 500) || null},
          ${(opts.userAgent || '').slice(0, 500) || null},
          ${opts.country || null}, ${now}
        )
      `,
      sql`
        UPDATE tracked_links
        SET click_count = COALESCE(click_count, 0) + 1, last_clicked_at = ${now}
        WHERE slug = ${opts.slug}
      `,
    ])
  } catch (err) {
    // Click logging is non-fatal — never block a user redirect because we
    // couldn't persist analytics.
    console.error('[link-tracker] recordClick failed', err)
  }
}
