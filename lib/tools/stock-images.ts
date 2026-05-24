// Unsplash + Pexels + Pixabay image search wrappers
export interface StockImage {
  id: string
  url: string          // full size
  thumb: string        // thumbnail
  small: string        // small size
  photographer: string
  photographer_url: string
  description: string
  source: 'unsplash' | 'pexels' | 'pixabay'
  download_url?: string
}

export async function searchUnsplash(query: string, count = 9): Promise<StockImage[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return []
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((p: {
      id?: string
      urls?: { full?: string; thumb?: string; small?: string }
      user?: { name?: string; links?: { html?: string } }
      description?: string
      alt_description?: string
      links?: { download_location?: string }
    }) => ({
      id: p.id || '',
      url: p.urls?.full || '',
      thumb: p.urls?.thumb || '',
      small: p.urls?.small || '',
      photographer: p.user?.name || '',
      photographer_url: p.user?.links?.html || '',
      description: p.description || p.alt_description || query,
      source: 'unsplash' as const,
      download_url: p.links?.download_location || '',
    }))
  } catch { return [] }
}

export async function searchPexels(query: string, count = 9): Promise<StockImage[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers: { Authorization: key } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos || []).map((p: {
      id?: number
      src?: { original?: string; tiny?: string; small?: string }
      photographer?: string
      photographer_url?: string
      alt?: string
    }) => ({
      id: String(p.id || ''),
      url: p.src?.original || '',
      thumb: p.src?.tiny || '',
      small: p.src?.small || '',
      photographer: p.photographer || '',
      photographer_url: p.photographer_url || '',
      description: p.alt || query,
      source: 'pexels' as const,
    }))
  } catch { return [] }
}

export async function searchStockImages(query: string, count = 9): Promise<StockImage[]> {
  // Try Unsplash first, fall back to Pexels
  const unsplash = await searchUnsplash(query, count)
  if (unsplash.length > 0) return unsplash
  return searchPexels(query, count)
}
