/**
 * /dashboard/connections — Sprint 1E redirect stub
 *
 * The previous content of this file was an entirely fake "connections" surface
 * (33 hardcoded integrations with `status: 'connected'`, MOCK_SYNC_LOGS,
 * MOCK_WEBHOOKS, zero fetch() calls). It duplicated /dashboard/integrations,
 * which is the real source of truth backed by `social_connections` and the
 * OAuth flow at /api/integrations/oauth/[platform]/connect.
 *
 * Per the Sprint 0 / Sprint 1E plan we remove it from navigation AND hard-
 * redirect any direct visit (old bookmarks, copy-pasted URLs, internal links
 * we haven't migrated yet) to the real Integrations page. This is a server
 * redirect so it happens before any UI flash.
 *
 * Do not restore mock content here. If a real "connection management v2"
 * page is ever desired, build it under a new path or replace this redirect
 * with a real implementation backed by /api/integrations.
 */
import { redirect } from 'next/navigation'

export default function ConnectionsRedirect(): never {
  redirect('/dashboard/integrations')
}
