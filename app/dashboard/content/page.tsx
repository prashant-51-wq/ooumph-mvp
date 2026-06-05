/**
 * /dashboard/content — Sprint 11E redirect stub
 *
 * Post-Sprint-10 audit flagged this page as "Functional but Disconnected"
 * because it duplicates the Queue tab on /dashboard/publishing. Both
 * surfaces merged scheduled_content + published_content rows into one
 * searchable list with channel + status filters.
 *
 * Resolution per the audit's P0 recommendation:
 *   Pick one canonical page, redirect the others.
 *
 * /dashboard/publishing wins as the canonical action surface because it
 * also has the Composer tab (the actual "create a post" UX) plus the
 * Analytics tab. Visitors to /dashboard/content land on /publishing
 * with the queue view open.
 *
 * Matches the redirect pattern from /dashboard/payments and
 * /dashboard/privacy (Sprint 7B). The 433-line grid UI is preserved in
 * git history if a future "All Content library" tab is desired inside
 * /publishing — just lift it from before this commit and add a tab.
 *
 * Removed from the sidebar nav in the same commit.
 *
 * Do NOT restore client-side content here. Build the All-Content tab
 * inside /publishing instead.
 */
import { redirect } from 'next/navigation'

export default function ContentRedirect(): never {
  redirect('/dashboard/publishing')
}
