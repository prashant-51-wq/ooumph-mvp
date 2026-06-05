/**
 * /dashboard/privacy — Sprint 7B redirect stub
 *
 * The previous content of this file was an entirely fake "Privacy &
 * Trust" surface. Hardcoded CHECKLIST, CONSENT_RECORDS, LEGAL_DOCS
 * constants drove the UI. GDPR/CCPA compliance badges were fixed
 * strings; the consent log table showed fake emails (sarah@techco.io,
 * marcus@ventures.com etc.) as "real consents". Zero fetch() calls.
 *
 * Privacy controls that actually exist in the MVP — credential
 * rotation, session revocation, GDPR data export — live under
 * /dashboard/settings/security. There is no separate "Privacy" surface
 * in the MVP.
 *
 * Removed from nav and hard-redirect any direct visit (old bookmarks,
 * copy-pasted URLs) to the real Security settings tab. Server-side
 * redirect so there's no UI flash.
 *
 * Do not restore mock content here. If a real consent-management page
 * is ever desired (e.g. for an enterprise tier with formal compliance
 * needs), build it under a new path with a real backing table.
 */
import { redirect } from 'next/navigation'

export default function PrivacyRedirect(): never {
  redirect('/dashboard/settings/security')
}
