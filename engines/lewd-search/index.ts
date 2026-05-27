import * as cheerio from "cheerio";

export const name = "lewd-search"
export const type = "NSFW"

interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
  thumbnail?: string
}

const PER_SOURCE = 6

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36",
]

const _ua = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

const _headers = (base: string) => ({
  "User-Agent": _ua(),
  Accept: "text/html,application/xhtml+xml,*/*",
  Referer: base,
})

const _err = (src: string, e: unknown) => console.error(`[lewd/${src}]`, e)

const _sel = ($: cheerio.CheerioAPI, sel: string) =>
  $(sel).first().text().trim()

const _href = ($: cheerio.CheerioAPI, el: any, base: string): string => {
  let h = $(el).attr("href") || ""
  if (h.startsWith("//")) h = `https:${h}`
  else if (h.startsWith("/")) h = `${base}${h}`
  return h
}

const _thumb = ($: cheerio.CheerioAPI, el: any): string | undefined => {
  const img = $(el).find("img").first()
  return img.attr("data-src") || img.attr("src") || undefined
}

const _eporner = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  try {
    const url = `https://www.eporner.com/api/v2/video/search/?q=${encodeURIComponent(q)}&per_page=${PER_SOURCE}&page=${p}&thumbsize=big&format=json`
    const r = await f(url, { headers: { "User-Agent": _ua(), Accept: "application/json" } })
    if (!r.ok) return []
    const d = await r.json() as { videos?: any[] }
    return (d.videos || []).slice(0, PER_SOURCE).map(v => ({
      title: `${v.title || ""} [${v.length_min || ""}]`,
      url: v.url || "",
      snippet: `${(v.keywords || "").slice(0, 100)} | ${Number(v.views||0).toLocaleString()} views`,
      source: "Eporner",
      thumbnail: v.default_thumb?.src,
    }))
  } catch (e) { _err("Eporner", e); return [] }
}

const _iwara = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  try {
    const url = `https://api.iwara.tv/search?query=${encodeURIComponent(q)}&type=video&page=${Math.max(0,p-1)}&limit=${PER_SOURCE}`
    const r = await f(url, { headers: { "User-Agent": _ua(), Accept: "application/json", Referer: "https://www.iwara.tv/" } })
    if (!r.ok) return []
    const d = await r.json()
    return (d.results || []).slice(0, PER_SOURCE).map((v: any) => ({
      title: v.title || "",
      url: `https://www.iwara.tv/video/${v.id}/${v.slug || ""}`,
      snippet: `${Number(v.numViews||0).toLocaleString()} views · ${Number(v.numLikes||0).toLocaleString()} likes`,
      source: "Iwara",
      thumbnail: v.file?.id ? `https://i.iwara.tv/image/thumbnail/${v.file.id}/thumbnail-00.jpg` : undefined,
    }))
  } catch (e) { _err("Iwara", e); return [] }
}

const _xvideos = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://www.xvideos.com"
  try {
    const url = `${base}/?k=${encodeURIComponent(q)}&p=${p}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.thumb-under").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("xvideos.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "XVideos", thumbnail: img.attr("src") })
    })
    return r2
  } catch (e) { _err("XVideos", e); return [] }
}

const _pornhub = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://www.pornhub.com"
  try {
    const url = `${base}/video/search?search=${encodeURIComponent(q)}&page=${p}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.video-item").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a.video-link").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("pornhub.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      const views = $(el).find("span.views").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: views, source: "Pornhub", thumbnail: img.attr("data-src") || img.attr("src") })
    })
    return r2
  } catch (e) { _err("Pornhub", e); return [] }
}

const _xhamster = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://xhamster.com"
  try {
    const url = `${base}/search?q=${encodeURIComponent(q)}&page=${p}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.video-thumb").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("xhamster.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.attr("title") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "xHamster", thumbnail: img.attr("data-src") || img.attr("src") })
    })
    return r2
  } catch (e) { _err("xHamster", e); return [] }
}

const _xnxx = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://www.xnxx.com"
  try {
    const url = `${base}/search/${encodeURIComponent(q)}${p > 1 ? `-${p}` : ""}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.thumb").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("xnxx.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "XNXX", thumbnail: img.attr("src") || img.attr("data-src") })
    })
    return r2
  } catch (e) { _err("XNXX", e); return [] }
}

const _youporn = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://youporn.com"
  try {
    const url = `${base}/search/${encodeURIComponent(q)}${p > 1 ? `?page=${p}` : ""}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.video-item").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a[href*='/watch/']").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("youporn.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "YouPorn", thumbnail: img.attr("data-src") || img.attr("src") })
    })
    return r2
  } catch (e) { _err("YouPorn", e); return [] }
}

const _redtube = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://www.redtube.com"
  try {
    const url = `${base}/search?search=${encodeURIComponent(q)}&page=${p}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.video-item").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("redtube.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "RedTube", thumbnail: img.attr("data-src") || img.attr("src") })
    })
    return r2
  } catch (e) { _err("RedTube", e); return [] }
}

const _tgtube = async (q: string, p: number, f: typeof fetch): Promise<SearchResult[]> => {
  const base = "https://www.tgtube.com"
  try {
    const url = `${base}/search/${encodeURIComponent(q)}${p > 1 ? `?page=${p}` : ""}`
    const r = await f(url, { headers: _headers(base) })
    if (!r.ok) return []
    const $ = cheerio.load(await r.text())
    const r2: SearchResult[] = []
    const seen = new Set<string>()
    $("div.video-item, div.thumb").slice(0, PER_SOURCE).each((_, el) => {
      const a = $(el).find("a").first()
      const href = _href($, el, base)
      if (!href || seen.has(href)) return
      if (!href.includes("tgtube.com")) return
      seen.add(href)
      const img = $(el).find("img").first()
      const title = img.attr("alt") || img.attr("title") || a.text().trim() || ""
      const dur = $(el).find("span.duration").text().trim()
      if (title) r2.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "Trans", source: "TGTube", thumbnail: img.attr("data-src") || img.attr("src") })
    })
    return r2
  } catch (e) { _err("TGTube", e); return [] }
}

const _interleave = (...arrs: SearchResult[][]): SearchResult[] => {
  const out: SearchResult[] = []
  const max = Math.max(0, ...arrs.map(a => a.length))
  for (let i = 0; i < max; i++) for (const a of arrs) if (i < a.length) out.push(a[i])
  return out
}

export const executeSearch = async (
  query: string,
  page = 1,
  _timeFilter: string,
  context: {
    fetch?: typeof fetch
    sentinel?: (r: { ok: boolean; status: number }, n?: string) => void
  }
): Promise<SearchResult[]> => {
  try {
    const f = context?.fetch ?? fetch
    const p = Math.max(1, Number(page) || 1)

    const settled = await Promise.allSettled([
      _eporner(query, p, f),
      _iwara(query, p, f),
      _xvideos(query, p, f),
      _pornhub(query, p, f),
      _xhamster(query, p, f),
      _xnxx(query, p, f),
      _youporn(query, p, f),
      _redtube(query, p, f),
      _tgtube(query, p, f),
    ])

    const results = _interleave(
      settled[0]?.status === "fulfilled" ? settled[0].value : [],
      settled[1]?.status === "fulfilled" ? settled[1].value : [],
      settled[2]?.status === "fulfilled" ? settled[2].value : [],
      settled[3]?.status === "fulfilled" ? settled[3].value : [],
      settled[4]?.status === "fulfilled" ? settled[4].value : [],
      settled[5]?.status === "fulfilled" ? settled[5].value : [],
      settled[6]?.status === "fulfilled" ? settled[6].value : [],
      settled[7]?.status === "fulfilled" ? settled[7].value : [],
      settled[8]?.status === "fulfilled" ? settled[8].value : [],
    )

    context?.sentinel?.({ ok: true, status: 200 }, name)
    return results
  } catch (e: any) {
    if (e?.name === "SentinelBreach") throw e
    console.error("[lewd] error:", e)
    return []
  }
}