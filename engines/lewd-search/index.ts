export const name = "lewd-search"
export const type = "web"
export const bangShortcut = "lewd"

export const settingsSchema = [
  { key: "epornerApiKey", label: "Eporner API Key (optional)", type: "password", required: false },
]

let epornerApiKey: string | null = null

export const configure = (settings: { epornerApiKey?: string }) => {
  epornerApiKey = settings.epornerApiKey || null
}

interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
  thumbnail?: string
}

const EPORNER_BASE = "https://www.eporner.com/api/v2"
const GELBOORU_BASE = "https://gelbooru.com"

const fetchEporner = async (query: string, page: number, doFetch: typeof fetch): Promise<SearchResult[]> => {
  const results: SearchResult[] = []
  try {
    const perPage = 20
    const url = `${EPORNER_BASE}/video/search/?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&thumbsize=big&format=json&lq=1`

    const response = await doFetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "lewd-search/1.0"
      }
    })

    if (!response.ok) return []

    const data = await response.json() as {
      videos?: Array<{
        id: string
        title: string
        keywords: string
        views: number
        rate: string
        url: string
        length_min: string
        default_thumb?: { src: string }
      }>
    }

    const videos = data.videos || []

    for (const video of videos.slice(0, 15)) {
      const id = video.id || ""
      const title = video.title || ""
      const keywords = video.keywords || ""
      const views = video.views?.toLocaleString() || "0"
      const rate = video.rate || "0"
      const videoUrl = video.url || ""
      const duration = video.length_min || ""
      const thumb = video.default_thumb?.src || ""

      results.push({
        title: `${title} [${duration}]`,
        url: videoUrl,
        snippet: `${keywords.slice(0, 150)} | Views: ${views} | Rating: ${rate}/5`,
        source: "Eporner",
        thumbnail: thumb || undefined,
      })
    }
  } catch (e) {
    console.error("Eporner search failed:", e)
  }
  return results
}

const fetchGelbooru = async (query: string, page: number, doFetch: typeof fetch): Promise<SearchResult[]> => {
  const results: SearchResult[] = []
  try {
    const limit = 20
    const pid = page - 1
    const url = `${GELBOORU_BASE}/index.php?page=dapi&s=post&q=index&limit=${limit}&pid=${pid}&tags=${encodeURIComponent(query)}&json=1`

    const response = await doFetch(url)

    if (!response.ok) return []

    const posts = await response.json() as Array<{
      id: number
      file_url: string
      preview_url: string
      tags: string
      rating: string
    }>

    for (const post of posts.slice(0, 10)) {
      const id = post.id?.toString() || ""
      const fileUrl = post.file_url || ""
      const previewUrl = post.preview_url || ""
      const tags = post.tags || ""
      const rating = post.rating || "s"

      if (fileUrl && rating !== "s") {
        results.push({
          title: `Gelbooru #${id}`,
          url: `${GELBOORU_BASE}/index.php?page=post&s=view&id=${id}`,
          snippet: tags.slice(0, 200),
          source: "Gelbooru",
          thumbnail: previewUrl || undefined,
        })
      }
    }
  } catch (e) {
    console.error("Gelbooru search failed:", e)
  }
  return results
}

const rankResults = (results: SearchResult[]): SearchResult[] => {
  const seen = new Set<string>()
  return results.filter(r => {
    const key = r.url
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const executeSearch = async (
  query: string,
  page = 1,
  timeFilter: string,
  context: {
    lang: string
    fetch: typeof fetch
    signProxyUrl: (url: string) => string
    buildAcceptLanguage: () => string
    dateFrom?: string
    dateTo?: string
    sentinel?: (
      response: { ok: boolean; status: number },
      engineName?: string
    ) => void
    engineError?: (
      status: string,
      message: string,
      opts?: { httpStatus?: number; engine?: string }
    ) => Error
  }
): Promise<SearchResult[]> => {
  try {
    const doFetch = context?.fetch ?? fetch

    const [eporner, gelbooru] = await Promise.all([
      fetchEporner(query, page, doFetch),
      fetchGelbooru(query, page, doFetch),
    ])

    const allResults = [...eporner, ...gelbooru]
    const ranked = rankResults(allResults)

    context?.sentinel?.({ ok: true, status: 200 }, name)

    return ranked
  } catch (e: any) {
    if (e?.name === "SentinelBreach") throw e
    console.error("lewd-search error:", e)
    return []
  }
}