// Twitter / X API v2

import { getCredential } from '@/lib/credential-context'

const TWITTER_BASE = 'https://api.twitter.com/2'

export interface Tweet {
  id: string
  text: string
  created_at?: string
  author_id?: string
}

export async function postTweet(
  text: string,
  accessToken: string
): Promise<Tweet | null> {
  if (!accessToken) return null
  try {
    const res = await fetch(`${TWITTER_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.data as Tweet) ?? null
  } catch {
    return null
  }
}

export async function postThread(
  tweets: string[],
  accessToken: string
): Promise<Tweet[] | null> {
  if (!accessToken || !tweets.length) return null
  try {
    const posted: Tweet[] = []
    let previousId: string | undefined

    for (const text of tweets) {
      const body: Record<string, unknown> = { text }
      if (previousId) {
        body.reply = { in_reply_to_tweet_id: previousId }
      }

      const res = await fetch(`${TWITTER_BASE}/tweets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) return posted.length > 0 ? posted : null
      const json = await res.json()
      const tweet = json.data as Tweet
      if (!tweet) return posted.length > 0 ? posted : null
      posted.push(tweet)
      previousId = tweet.id
    }

    return posted
  } catch {
    return null
  }
}

export async function searchTweets(
  query: string,
  maxResults = 10
): Promise<Tweet[]> {
  const bearerToken = getCredential('TWITTER_BEARER_TOKEN')
  if (!bearerToken) return []
  try {
    const params = new URLSearchParams({
      query: query,
      max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    })
    const res = await fetch(
      `${TWITTER_BASE}/tweets/search/recent?${params}`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.data as Tweet[]) ?? []
  } catch {
    return []
  }
}

export async function getUserTimeline(
  userId: string,
  accessToken: string,
  maxResults = 10
): Promise<Tweet[]> {
  if (!accessToken) return []
  try {
    const params = new URLSearchParams({
      max_results: String(Math.min(Math.max(maxResults, 5), 100)),
    })
    const res = await fetch(
      `${TWITTER_BASE}/users/${userId}/tweets?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.data as Tweet[]) ?? []
  } catch {
    return []
  }
}

export function isTwitterAvailable(): boolean {
  return !!getCredential('TWITTER_BEARER_TOKEN')
}
