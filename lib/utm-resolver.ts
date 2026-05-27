/**
 * lib/utm-resolver.ts
 *
 * UTM token resolver. Composes the final tracking URL at dispatch time so
 * `ad_creatives.destination_url` stays clean in storage and the audit trail
 * is human-readable.
 *
 *   const trackedUrl = resolveCampaignUtms(
 *     'https://acme.com/spring-sale',
 *     workspace,    // → workspaces.utm_template (optional)
 *     campaign,     // → ad_campaigns.{id,name,utm_override}
 *     creative,     // → ad_creatives.id
 *     'meta',       // canonical platform key
 *   )
 *   // → "https://acme.com/spring-sale?utm_source=meta&utm_medium=cpc&utm_campaign=spring-sale-q1&utm_content=cr_abc123"
 *
 * Design contract
 * ───────────────
 * 1. Per-campaign `utm_override` wins over `workspaces.utm_template`
 *    (campaign-level intent always beats workspace default).
 * 2. Falls back to the system default template if neither is set.
 * 3. Preserves any UTMs already present on the destination URL (the
 *    advertiser may have authored their own — we never clobber them).
 * 4. Never overrides platform click-ids (gclid / fbclid / ttclid /
 *    li_fat_id) — those are injected by the provider AFTER our UTMs.
 * 5. Never throws. Malformed URLs short-circuit to the original string;
 *    callers can safely chain through `shortenAndTrackUrls()` afterwards.
 *
 * Reserved tokens (resolved at call time)
 * ──────────────────────────────────────
 *   {platform}      → 'meta' | 'google' | 'tiktok' | 'linkedin_ads' …
 *   {campaign_slug} → kebab-case slug of campaign.name
 *   {campaign_id}   → short form of campaign.id (last 12 chars)
 *   {creative_id}   → short form of creative.id (last 12 chars)
 *   {date}          → YYYY-MM-DD (UTC)
 *   {workspace_id}  → short form of workspace.id (last 12 chars)
 *
 * Click-ID parameters are excluded from substitution to avoid accidentally
 * pre-populating Google's `{gclid}` / Meta's `{fbclid}` macros — those are
 * provider-side and must arrive at click time.
 */

// Default template used when neither workspace nor campaign has set one.
// Mirrors what most agencies converge on for cross-platform attribution.
const SYSTEM_DEFAULT_TEMPLATE =
  'utm_source={platform}&utm_medium=cpc&utm_campaign={campaign_slug}&utm_content={creative_id}'

// Provider click-id parameter names we must NEVER overwrite if present.
// Listed lowercased; comparison is case-insensitive.
const CLICK_ID_PARAMS = new Set([
  'gclid', 'fbclid', 'ttclid', 'li_fat_id', 'msclkid', 'twclid', 'epik',
])

// Provider tokens like {gclid} / {keyword} that providers substitute at
// click time. We must leave any such tokens in the user-supplied template
// untouched so the provider can do its own substitution downstream.
const PROVIDER_PASSTHROUGH_TOKENS = new Set([
  'gclid', 'fbclid', 'ttclid', 'li_fat_id', 'msclkid', 'twclid', 'epik',
  'keyword', 'matchtype', 'network', 'device', 'placement', 'adgroup',
  'campaign', 'ad', 'creative', // various platform-specific macros
  'lpurl', // Google's "landing page URL" macro
])

// ─── Inputs (kept loose to avoid coupling to DB row types) ────────────────

export interface UtmWorkspaceInput {
  id?: string | null
  utm_template?: string | null
}

export interface UtmCampaignInput {
  id?: string | null
  name?: string | null
  utm_override?: string | null
}

export interface UtmCreativeInput {
  id?: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Slugify a string — lowercase, alphanumerics + hyphens only, trimmed of
 * leading/trailing hyphens. Empty input falls back to 'untitled'.
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return 'untitled'
  return input
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled'
}

/**
 * Shorten an id to its last 12 chars for UTM readability.
 * (Full UUIDs make awful UTM values.)
 */
function shortId(id: string | null | undefined, fallback: string): string {
  if (!id) return fallback
  return id.length <= 12 ? id : id.slice(-12)
}

/**
 * Substitute reserved {tokens} inside the template string.
 * Unknown tokens are LEFT INTACT so provider-side macros (e.g. {gclid}
 * for Google, {fbclid} for Meta) pass through unchanged.
 */
function substituteTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, name) => {
    const lower = String(name).toLowerCase()
    if (PROVIDER_PASSTHROUGH_TOKENS.has(lower)) return full // leave for provider
    if (tokens[lower] !== undefined) return tokens[lower]
    return full // unknown token — leave intact (defensive)
  })
}

/**
 * Parse a UTM template into a list of `[key, value]` pairs. Accepts both
 * `?utm_source=…&…` and bare `utm_source=…&…` forms. Tolerates whitespace
 * around keys/values. Discards empty fragments.
 */
function parseTemplatePairs(template: string): Array<[string, string]> {
  if (!template) return []
  const trimmed = template.trim().replace(/^\?+/, '')
  if (!trimmed) return []
  return trimmed.split('&').reduce<Array<[string, string]>>((acc, frag) => {
    if (!frag.trim()) return acc
    const eq = frag.indexOf('=')
    if (eq === -1) {
      acc.push([frag.trim(), ''])
    } else {
      acc.push([frag.slice(0, eq).trim(), frag.slice(eq + 1).trim()])
    }
    return acc
  }, [])
}

// ─── Public API ───────────────────────────────────────────────────────────

export function resolveCampaignUtms(
  destinationUrl: string | null | undefined,
  workspace: UtmWorkspaceInput | null | undefined,
  campaign: UtmCampaignInput | null | undefined,
  creative: UtmCreativeInput | null | undefined,
  platform: string,
): string {
  // No URL → nothing to do.
  if (!destinationUrl || typeof destinationUrl !== 'string') return ''
  const raw = destinationUrl.trim()
  if (!raw) return ''

  // Pick the active template — campaign override > workspace default > system default.
  const template =
    (campaign?.utm_override?.trim() || '') ||
    (workspace?.utm_template?.trim() || '') ||
    SYSTEM_DEFAULT_TEMPLATE

  // Build the resolved token map.
  const platformKey = (platform || '').toString().trim().toLowerCase() || 'unknown'
  const tokens: Record<string, string> = {
    platform: platformKey,
    campaign_slug: slugify(campaign?.name || campaign?.id || 'campaign'),
    campaign_id: shortId(campaign?.id, 'unknown'),
    creative_id: shortId(creative?.id, 'unknown'),
    workspace_id: shortId(workspace?.id, 'unknown'),
    date: new Date().toISOString().slice(0, 10),
  }

  // Resolve every {token} in the template, leaving provider macros intact.
  const resolved = substituteTokens(template, tokens)

  // Parse our resolved template into key/value pairs.
  const ourPairs = parseTemplatePairs(resolved)
  if (ourPairs.length === 0) return raw

  // Merge into the destination URL using the URL API (handles malformed
  // input gracefully — on failure we just return the original string).
  try {
    // The URL ctor needs an absolute URL. If the caller passed a path-only
    // string, prefix with a placeholder, build, then strip the placeholder.
    const isRelative = !/^https?:\/\//i.test(raw)
    const base = isRelative ? 'https://__placeholder.invalid' : undefined
    const u = new URL(raw, base)

    const existingKeysLower = new Set<string>()
    u.searchParams.forEach((_, key) => existingKeysLower.add(key.toLowerCase()))

    for (const [key, value] of ourPairs) {
      if (!key) continue
      const lower = key.toLowerCase()
      // Never overwrite an advertiser-authored UTM that's already on the URL.
      if (existingKeysLower.has(lower)) continue
      // Never inject a click-id ourselves — providers own those.
      if (CLICK_ID_PARAMS.has(lower)) continue
      u.searchParams.append(key, value)
    }

    let out = u.toString()
    if (isRelative) {
      out = out.replace(/^https:\/\/__placeholder\.invalid/, '')
    }
    return out
  } catch {
    // Malformed URL — return the original verbatim. Caller's responsibility.
    return raw
  }
}
