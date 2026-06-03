/**
 * instrumentation.ts
 *
 * Next.js startup hook — called once per serverless warm instance before
 * any request is processed. We use it to run the Tier-0 environment check
 * so missing or invalid critical vars crash fast at boot rather than at
 * the first DB query or AI call.
 *
 * Next.js docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server runtime, not in the Edge runtime or browser.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnvReady } = await import('@/lib/env-check')
    assertEnvReady()
  }
}
