import * as cheerio from "cheerio";

export const name = "lewd-search"
export const type = "NSFW"
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

const PER_SOURCE = 7

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
]

const _pickUa = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

const _origin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin
  } catch {
    return baseUrl.replace(/\/$/, "")
  }
}

const _jsonHeaders = (baseUrl: string) => {
  const o = _origin(baseUrl)
  return {
    "User-Agent": _pickUa(),
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${o}/`,
    Origin: o,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  }
}

const _htmlHeaders = (baseUrl: string) => {
  const o = _origin(baseUrl)
  return {
    "User-Agent": _pickUa(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${o}/`,
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
  }
}

const _stripHtml = (s: unknown): string => {
  if (typeof s !== "string") return ""
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

const _slugToTitle = (slug: string) =>
  slug.replace(/-+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()

const _iwara = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  try {
    const params = new URLSearchParams({
      query: query.trim(),
      type: "video",
      page: String(Math.max(0, Number(page) - 1)),
      limit: String(PER_SOURCE),
    })
    const res = await fetchFn(`https://api.iwara.tv/search?${params}`, {
      headers: {
        ..._jsonHeaders("https://www.iwara.tv"),
        Referer: "https://www.iwara.tv/",
        Origin: "https://www.iwara.tv",
      },
    })
    if (!res.ok) {
      console.error(`[lewd/Iwara] HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    const results = (data?.results ?? []).slice(0, PER_SOURCE).map((v: any) => {
      const meta = [
        v.numViews ? `${Number(v.numViews).toLocaleString()} views` : null,
        v.numLikes ? `${Number(v.numLikes).toLocaleString()} likes` : null,
      ].filter(Boolean).join(" · ")
      const fileId = v.file?.id
      const thumbnail = fileId ? `https://i.iwara.tv/image/thumbnail/${fileId}/thumbnail-00.jpg` : undefined
      return {
        title: v.title || "",
        url: `https://www.iwara.tv/video/${v.id}/${v.slug || ""}`,
        snippet: meta,
        source: "Iwara",
        thumbnail,
      }
    })
    console.log(`[lewd/Iwara] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Iwara] Failed:", err)
    return []
  }
}

const _r34video = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://rule34video.com"
  try {
    const url = `${base}/video/?search=${encodeURIComponent(query.trim())}&submit=Search&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) {
      console.error(`[lewd/Rule34Video] HTTP ${res.status}`)
      return []
    }
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("a[href*='/video/']").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      let href = $(el).attr("href") || ""
      if (!href || !/\/video\/\d+/i.test(href)) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      else if (!href.startsWith("http")) return
      if (!href.includes("rule34video.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const row = $(el).closest("div").parent().closest("div")
      let thumbEl = row.find("img[data-src], img[data-original], img[data-lazy-src]").first()
      if (!thumbEl.length) thumbEl = $(el).closest("div").find("img").first()
      const thumb = thumbEl.attr("data-src") || thumbEl.attr("data-original") || thumbEl.attr("data-lazy-src") || thumbEl.attr("src") || undefined
      let title = (thumbEl.attr("alt") || $(el).attr("title") || $(el).text() || "").trim()
      if (!title || title.length < 2) {
        const slug = href.split("/").filter(Boolean).pop() || ""
        title = _slugToTitle(slug.replace(/\.[^.]+$/, ""))
      }
      if (title) results.push({ title, url: href, snippet: "", source: "Rule34Video", thumbnail: thumb })
      return undefined
    })

    console.log(`[lewd/Rule34Video] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Rule34Video] Failed:", err)
    return []
  }
}

const _eporner = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  try {
    const perPage = PER_SOURCE
    const url = `https://www.eporner.com/api/v2/video/search/?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&thumbsize=big&format=json&lq=1`
    const response = await fetchFn(url, {
      headers: { Accept: "application/json", "User-Agent": _pickUa() }
    })
    if (!response.ok) return []
    const data = await response.json() as { videos?: any[] }
    const results = (data.videos || []).slice(0, PER_SOURCE).map((v) => ({
      title: `${v.title || ""} [${v.length_min || ""}]`,
      url: v.url || "",
      snippet: `${(v.keywords || "").slice(0, 150)} | Views: ${Number(v.views || 0).toLocaleString()} | Rating: ${v.rate || "0"}/5`,
      source: "Eporner",
      thumbnail: v.default_thumb?.src || undefined,
    }))
    console.log(`[lewd/Eporner] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Eporner] Failed:", err)
    return []
  }
}

const _xvideos = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.xvideos.com"
  try {
    const url = `${base}/?k=${encodeURIComponent(query.trim())}&p=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.thumb-under").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("src") || img.attr("data-src") || undefined
      let title = img.attr("alt") || a.attr("title") || $(el).find("p.title a").text() || ""
      if (!title) {
        const parts = href.split("/").filter(Boolean)
        title = parts.length > 0 ? _slugToTitle(parts[parts.length - 1]) : ""
      }
      const duration = $(el).find("span.duration").text().trim() || ""
      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href.startsWith("http") ? href : `${base}${href}`,
        snippet: "",
        source: "XVideos",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/XVideos] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/XVideos] Failed:", err)
    return []
  }
}

const _pornhub = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.pornhub.com"
  try {
    const url = `${base}/video/search?search=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a.video-link").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("pornhub.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.text() || ""
      const duration = $(el).find("span.duration").text().trim() || ""
      const views = $(el).find("span.views").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: views,
        source: "Pornhub",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/Pornhub] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Pornhub] Failed:", err)
    return []
  }
}

const _xhamster = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://xhamster.com"
  try {
    const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("xhamster.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "xHamster",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/xHamster] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/xHamster] Failed:", err)
    return []
  }
}

const _xnxx = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.xnxx.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `-${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("xnxx.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("src") || img.attr("data-src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "XNXX",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/XNXX] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/XNXX] Failed:", err)
    return []
  }
}

const _tgtube = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.tgtube.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("tgtube.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || img.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "Transgender",
        source: "TGTube",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/TGTube] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/TGTube] Failed:", err)
    return []
  }
}

const _shemale = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.shemale.com"
  try {
    const url = `${base}/?search=${encodeURIComponent(query.trim())}${page > 1 ? `&page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb-block").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a[href*='/video/']").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("shemale.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration, i.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "Shemale/TS",
        source: "Shemale.com",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/Shemale.com] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Shemale.com] Failed:", err)
    return []
  }
}

const _tranny = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.tranny.com"
  try {
    const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("tranny.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "Tranny/Trans",
        source: "Tranny.com",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/Tranny] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Tranny] Failed:", err)
    return []
  }
}

const _youporn = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://youporn.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.video-block").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a[href*='/watch/']").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("youporn.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "YouPorn",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/YouPorn] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/YouPorn] Failed:", err)
    return []
  }
}

const _redtube = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.redtube.com"
  try {
    const url = `${base}/search?search=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.video_block").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("redtube.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "RedTube",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/RedTube] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/RedTube] Failed:", err)
    return []
  }
}

const _eporner2 = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.eporner.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `/${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.mgb1").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("eporner.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "HD Porn",
        source: "Eporner",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/Eporner-direct] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/Eporner-direct] Failed:", err)
    return []
  }
}

const _tnaflix = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.tnaflix.com"
  try {
    const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.video-thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("tnaflix.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "TNAFlix",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/TNAFlix] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/TNAFlix] Failed:", err)
    return []
  }
}

const _empornium = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.empornium.me"
  try {
    const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.thumb, div.video-item").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("empornium.me")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("src") || img.attr("data-src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""

      if (title) results.push({
        title,
        url: href,
        snippet: "EmPornium",
        source: "EmPornium",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/EmPornium] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/EmPornium] Failed:", err)
    return []
  }
}

const _porneq = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.porneq.com"
  try {
    const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("porneq.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "PornEQ",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/PornEQ] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/PornEQ] Failed:", err)
    return []
  }
}

const _hqporner = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.hqporner.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.mgb1").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("hqporner.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "HQ Porn",
        source: "HQPorner",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/HQPorner] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/HQPorner] Failed:", err)
    return []
  }
}

const _javwhores = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://www.javwhores.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("javwhores.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "JAV",
        source: "JAVWhores",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/JAVWhores] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/JAVWhores] Failed:", err)
    return []
  }
}

const _anybunny = async (
  query: string,
  page: number,
  fetchFn: typeof fetch
): Promise<SearchResult[]> => {
  const base = "https://anybunny.com"
  try {
    const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`
    const res = await fetchFn(url, { headers: _htmlHeaders(base) })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const results: SearchResult[] = []
    const seen = new Set<string>()

    $("div.video-item, div.thumb-block").each((_, el) => {
      if (results.length >= PER_SOURCE) return false
      const a = $(el).find("a").first()
      let href = a.attr("href") || ""
      if (!href) return
      if (href.startsWith("//")) href = `https:${href}`
      else if (href.startsWith("/")) href = `${base}${href}`
      if (!href.includes("anybunny.com")) return
      if (seen.has(href)) return
      seen.add(href)

      const img = $(el).find("img").first()
      const thumb = img.attr("data-src") || img.attr("src") || undefined
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const duration = $(el).find("span.duration").text().trim() || ""

      if (title) results.push({
        title: `${title}${duration ? ` [${duration}]` : ""}`,
        url: href,
        snippet: "",
        source: "AnyBunny",
        thumbnail: thumb
      })
      return undefined
    })

    console.log(`[lewd/AnyBunny] ${results.length} results`)
    return results
  } catch (err) {
    console.error("[lewd/AnyBunny] Failed:", err)
    return []
  }
}

const _interleave = (...arrays: SearchResult[][]): SearchResult[] => {
  const result: SearchResult[] = []
  const max = Math.max(0, ...arrays.map((a) => a.length))
  for (let i = 0; i < max; i++) {
    for (const arr of arrays) {
      if (i < arr.length) result.push(arr[i])
    }
  }
  return result
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
    sentinel?: (response: { ok: boolean; status: number }, engineName?: string) => void
    engineError?: (status: string, message: string, opts?: { httpStatus?: number; engine?: string }) => Error
  }
): Promise<SearchResult[]> => {
  try {
    const doFetch = context?.fetch ?? fetch
    const p = Number(page) || 1

    const [eporner, iwara, r34v, xvideos, pornhub, xhamster, xnxx, tgtube, shemale, tranny, youporn, redtube, eporner2, tnaflix, empornium, porneq, hqporner, javwhores, anybunny] =
      await Promise.allSettled([
        _eporner(query, p, doFetch),
        _iwara(query, p, doFetch),
        _r34video(query, p, doFetch),
        _xvideos(query, p, doFetch),
        _pornhub(query, p, doFetch),
        _xhamster(query, p, doFetch),
        _xnxx(query, p, doFetch),
        _tgtube(query, p, doFetch),
        _shemale(query, p, doFetch),
        _tranny(query, p, doFetch),
        _youporn(query, p, doFetch),
        _redtube(query, p, doFetch),
        _eporner2(query, p, doFetch),
        _tnaflix(query, p, doFetch),
        _empornium(query, p, doFetch),
        _porneq(query, p, doFetch),
        _hqporner(query, p, doFetch),
        _javwhores(query, p, doFetch),
        _anybunny(query, p, doFetch),
      ])

    const results = _interleave(
      eporner.status === "fulfilled" ? eporner.value : [],
      iwara.status === "fulfilled" ? iwara.value : [],
      r34v.status === "fulfilled" ? r34v.value : [],
      xvideos.status === "fulfilled" ? xvideos.value : [],
      pornhub.status === "fulfilled" ? pornhub.value : [],
      xhamster.status === "fulfilled" ? xhamster.value : [],
      xnxx.status === "fulfilled" ? xnxx.value : [],
      tgtube.status === "fulfilled" ? tgtube.value : [],
      shemale.status === "fulfilled" ? shemale.value : [],
      tranny.status === "fulfilled" ? tranny.value : [],
      youporn.status === "fulfilled" ? youporn.value : [],
      redtube.status === "fulfilled" ? redtube.value : [],
      eporner2.status === "fulfilled" ? eporner2.value : [],
      tnaflix.status === "fulfilled" ? tnaflix.value : [],
      empornium.status === "fulfilled" ? empornium.value : [],
      porneq.status === "fulfilled" ? porneq.value : [],
      hqporner.status === "fulfilled" ? hqporner.value : [],
      javwhores.status === "fulfilled" ? javwhores.value : [],
      anybunny.status === "fulfilled" ? anybunny.value : [],
    )

    context?.sentinel?.({ ok: true, status: 200 }, name)
    return results
  } catch (e: any) {
    if (e?.name === "SentinelBreach") throw e
    console.error("lewd-search error:", e)
    return []
  }
}