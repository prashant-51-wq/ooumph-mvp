/**
 * /dashboard/payments — Sprint 7B redirect stub
 *
 * The previous content of this file was an entirely fake "Payments"
 * surface. Top-level constants TRANSACTIONS, SUBSCRIPTIONS, PAYOUTS
 * were hardcoded mock arrays ("ch_1 · Acme Corp · 29900", "Sarah Chen",
 * "Bright Media"); every dollar figure, MRR number, and refund rate
 * rendered was fabricated. Zero fetch() calls.
 *
 * Real revenue / subscription state for an Ooumph workspace lives at
 * /dashboard/billing (subscribe + portal, backed by /api/billing/*).
 * Agency-side payouts live at /dashboard/super-admin under the
 * Commissions tab. There is no separate "Payments" surface in the MVP.
 *
 * Removed from nav and hard-redirect any direct visit (old bookmarks,
 * copy-pasted URLs) to the real Billing page. Server-side redirect so
 * there's no UI flash.
 *
 * Do not restore mock content here. If a real "payments v2" page is
 * ever desired, build it under a new path or replace this redirect
 * with a real implementation backed by /api/billing.
 */
import { redirect } from 'next/navigation'

export default function PaymentsRedirect(): never {
  redirect('/dashboard/billing')
}
