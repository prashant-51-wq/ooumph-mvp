/**
 * lib/twitter-oauth.ts
 * Twitter OAuth 1.0a HMAC-SHA1 signing helper for Node.js runtime.
 *
 * Twitter v2 API supports two auth methods for tweet creation:
 *   1. OAuth 2.0 User Context — `Authorization: Bearer {user-access-token}` (PKCE flow)
 *   2. OAuth 1.0a User Context — complex signed header with HMAC-SHA1
 *
 * App-only Bearer tokens (from developer portal → "Bearer Token") are READ-ONLY
 * and CANNOT create tweets. This helper generates OAuth 1.0a headers for write ops.
 *
 * Usage:
 *   const authHeader = buildOAuth1Header('POST', url, params, credentials)
 *   fetch(url, { headers: { Authorization: authHeader } })
 */

import crypto from 'crypto'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export interface OAuth1Credentials {
  consumerKey: string        // Twitter API Key
  consumerSecret: string     // Twitter API Secret
  accessToken: string        // User Access Token
  accessTokenSecret: string  // User Access Token Secret
}

/**
 * Percent-encodes a string per RFC 3986 (for OAuth signature computation).
 */
function encode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

/**
 * Builds the OAuth 1.0a Authorization header string.
 *
 * @param method  HTTP method (GET, POST, etc.)
 * @param url     Full request URL (without query string)
 * @param body    Request body params (for application/x-www-form-urlencoded)
 *                Pass empty object for JSON bodies.
 * @param creds   OAuth credentials
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  body: Record<string, string>,
  creds: OAuth1Credentials,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  }

  // Combine oauth params + body params, sort by key
  const allParams: Record<string, string> = { ...oauthParams, ...body }
  const sortedKeys = Object.keys(allParams).sort()
  const paramString = sortedKeys.map(k => `${encode(k)}=${encode(allParams[k])}`).join('&')

  // Build the signature base string
  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(paramString),
  ].join('&')

  // Build the signing key
  const signingKey = `${encode(creds.consumerSecret)}&${encode(creds.accessTokenSecret)}`

  // Compute HMAC-SHA1 signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  // Build Authorization header
  const oauthHeader = [
    ...Object.entries(oauthParams).map(([k, v]) => `${encode(k)}="${encode(v)}"`),
    `oauth_signature="${encode(signature)}"`,
  ].join(', ')

  return `OAuth ${oauthHeader}`
}

/**
 * Posts a tweet using OAuth 1.0a credentials.
 * Twitter v2 API endpoint: POST https://api.twitter.com/2/tweets
 *
 * Returns { tweetId, url } on success, throws on failure.
 */
export async function postTweetOAuth1(text: string, creds: OAuth1Credentials): Promise<{ tweetId: string; url: string }> {
  const endpoint = 'https://api.twitter.com/2/tweets'
  const authHeader = buildOAuth1Header('POST', endpoint, {}, creds)

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Twitter OAuth1 error ${res.status}: ${errBody.slice(0, 300)}`)
  }

  const data = await res.json() as { data?: { id?: string }; errors?: Array<{ message?: string }> }
  if (data.errors?.length) {
    throw new Error(`Twitter API error: ${data.errors[0]?.message || 'Unknown'}`)
  }

  const tweetId = data.data?.id || ''
  return {
    tweetId,
    url: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : 'https://twitter.com',
  }
}

/**
 * Posts a tweet using OAuth 2.0 User Access Token (Bearer, PKCE flow).
 * Only works if the token was obtained via the OAuth 2.0 PKCE flow with tweet.write scope.
 * Does NOT work with App-Only Bearer tokens.
 */
export async function postTweetOAuth2(text: string, userAccessToken: string): Promise<{ tweetId: string; url: string }> {
  const res = await fetchWithTimeout('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 280) }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Twitter OAuth2 error ${res.status}: ${errBody.slice(0, 300)}`)
  }

  const data = await res.json() as { data?: { id?: string }; errors?: Array<{ message?: string }> }
  if (data.errors?.length) {
    throw new Error(`Twitter API error: ${data.errors[0]?.message || 'Unknown'}`)
  }

  const tweetId = data.data?.id || ''
  return {
    tweetId,
    url: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : 'https://twitter.com',
  }
}

/**
 * Smart Twitter publisher — tries OAuth 1.0a if credentials are in metadata,
 * falls back to OAuth 2.0 Bearer (user token) if only access_token is available.
 *
 * @param text         Tweet text (truncated to 280 chars automatically)
 * @param accessToken  User access token (OAuth 1.0a token or OAuth 2.0 user token)
 * @param metadata     Integration metadata, may contain oauth1 credentials
 */
export async function publishTweet(
  text: string,
  accessToken: string,
  metadata?: Record<string, unknown> | null,
): Promise<{ tweetId: string; url: string }> {
  // Prefer OAuth 1.0a if all 4 credentials are present in metadata
  if (
    metadata?.consumer_key &&
    metadata?.consumer_secret &&
    metadata?.access_token_secret
  ) {
    return postTweetOAuth1(text, {
      consumerKey: String(metadata.consumer_key),
      consumerSecret: String(metadata.consumer_secret),
      accessToken,
      accessTokenSecret: String(metadata.access_token_secret),
    })
  }

  // Fall back to OAuth 2.0 Bearer (user access token, PKCE flow)
  return postTweetOAuth2(text, accessToken)
}
