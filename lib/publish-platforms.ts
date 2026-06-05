/**
 * lib/publish-platforms.ts — Sprint 20N
 *
 * Single source of truth for which channels the publishing cron can
 * actually deliver to. The audit (Sprint 1→2 gate) flagged that the
 * UI lets users schedule to Instagram / Facebook / Telegram / TikTok /
 * YouTube, but `app/api/cron/publish-scheduled/route.ts:155-161`
 * `dispatcherFor()` returns null for everything except LinkedIn,
 * Twitter/X, and WordPress. Those scheduled rows sat in `pending`
 * forever — no dispatch, no failure notification, no UI signal.
 *
 * This module gives every API route (the schedule endpoints AND the
 * cron itself) one place to ask "is this channel supported?" so the
 * gating story is consistent across the codebase. When a new
 * dispatcher ships, adding the channel here unblocks every caller in
 * one edit.
 */

/**
 * Channels whose dispatcher exists in `publish-scheduled/route.ts`.
 * Lowercase canonical names. Aliases (e.g. 'x' → 'twitter') are
 * preserved separately in CHANNEL_ALIASES.
 */
export const SUPPORTED_PUBLISH_CHANNELS = ['linkedin', 'twitter', 'wordpress'] as const

/**
 * Aliases that resolve to a canonical supported channel. Keep this
 * exhaustive — `isSupportedPublishChannel('blog')` should still pass
 * because the cron treats `blog` as wordpress.
 */
const CHANNEL_ALIASES: Record<string, (typeof SUPPORTED_PUBLISH_CHANNELS)[number]> = {
  x: 'twitter',
  blog: 'wordpress',
}

/**
 * Channels that the UI surfaces but the cron CANNOT deliver yet.
 * Used to build the helpful error message so the user knows exactly
 * which platform to pick instead.
 */
export const PLANNED_BUT_UNSUPPORTED_CHANNELS = [
  'instagram',
  'facebook',
  'telegram',
  'tiktok',
  'youtube',
] as const

export type SupportedPublishChannel = (typeof SUPPORTED_PUBLISH_CHANNELS)[number]

export function normalizeChannel(channel: string): string {
  const k = channel.toLowerCase().trim()
  return CHANNEL_ALIASES[k] ?? k
}

export function isSupportedPublishChannel(channel: string): boolean {
  if (!channel) return false
  const normalized = normalizeChannel(channel)
  return (SUPPORTED_PUBLISH_CHANNELS as readonly string[]).includes(normalized)
}

/**
 * Build the standard 400-shape rejection payload used by every API
 * route that gates an unsupported channel. Keeps the error UX
 * identical no matter which endpoint the client hit.
 */
export function unsupportedChannelError(channel: string) {
  return {
    error: `Publishing to "${channel}" is not yet supported. Supported channels: ${SUPPORTED_PUBLISH_CHANNELS.join(', ')}.`,
    code: 'unsupported_channel',
    channel,
    supportedChannels: [...SUPPORTED_PUBLISH_CHANNELS],
    plannedChannels: [...PLANNED_BUT_UNSUPPORTED_CHANNELS],
  }
}
