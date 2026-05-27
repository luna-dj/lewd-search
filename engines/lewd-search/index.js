import * as cheerio from "cheerio";
export const type = "NSFW";
export const bangShortcut = "lewd";
const PER_SOURCE = 100;
const MAX_PAGES = 3;
const PAGE_TIMEOUT_MS = 8000;
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
];
const _pickUa = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const _origin = (baseUrl) => {
    try {
        return new URL(baseUrl).origin;
    }
    catch {
        return baseUrl.replace(/\/$/, "");
    }
};
const _headers = (baseUrl) => {
    const o = _origin(baseUrl);
    return {
        "User-Agent": _pickUa(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${o}/`,
    };
};
const _jsonHeaders = (baseUrl) => {
    const o = _origin(baseUrl);
    return {
        "User-Agent": _pickUa(),
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${o}/`,
        Origin: o,
    };
};
const _isAbort = (e) => {
    if (e instanceof Error)
        return e.name === "AbortError" || e.name === "TimeoutError";
    if (typeof e === "object" && e !== null) {
        const err = e;
        if (err.name === "AbortError" || err.name === "TimeoutError")
            return true;
        if (err.code === 20 || err.code === 23)
            return true;
        const msg = String(err.message || "");
        if (msg.includes("aborted") || msg.includes("abort"))
            return true;
    }
    return false;
};
const _err = (src, e) => {
    if (_isAbort(e))
        return;
    console.error(`[lewd/${src}]`, e);
};
const _fetchWithTimeout = async (url, fetchFn, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
        const response = await fetchFn(url, { ...options, signal: controller.signal });
        return response;
    }
    finally {
        clearTimeout(timeout);
    }
};
const _eporner = async (query, page, fetchFn) => {
    try {
        const params = new URLSearchParams({
            q: query.trim(),
            per_page: String(PER_SOURCE),
            page: String(page),
            thumbsize: "big",
            format: "json",
        });
        const res = await _fetchWithTimeout(`https://www.eporner.com/api/v2/video/search/?${params}`, fetchFn, {
            headers: { "User-Agent": _pickUa(), Accept: "application/json" },
        });
        if (!res.ok)
            return [];
        const data = await res.json();
        return (data?.videos ?? []).slice(0, PER_SOURCE).map((v) => ({
            title: `${v.title || ""} [${v.length_min || ""}]`,
            url: v.url || "",
            snippet: `${(v.keywords || "").slice(0, 80)} | ${Number(v.views || 0).toLocaleString()} views`,
            source: "Eporner",
            thumbnail: v.default_thumb?.src || undefined,
        }));
    }
    catch (e) {
        _err("Eporner", e);
        return [];
    }
};
const _iwara = async (query, page, fetchFn) => {
    try {
        const params = new URLSearchParams({
            query: query.trim(),
            type: "video",
            page: String(Math.max(0, page - 1)),
            limit: String(PER_SOURCE),
        });
        const res = await _fetchWithTimeout(`https://api.iwara.tv/search?${params}`, fetchFn, {
            headers: { ..._jsonHeaders("https://www.iwara.tv"), Referer: "https://www.iwara.tv/" },
        });
        if (!res.ok)
            return [];
        const data = await res.json();
        return (data?.results ?? []).slice(0, PER_SOURCE).map((v) => {
            const meta = [v.numViews ? `${Number(v.numViews).toLocaleString()} views` : null, v.numLikes ? `${Number(v.numLikes).toLocaleString()} likes` : null].filter(Boolean).join(" · ");
            return {
                title: v.title || "",
                url: `https://www.iwara.tv/video/${v.id}/${v.slug || ""}`,
                snippet: meta,
                source: "Iwara",
                thumbnail: v.file?.id ? `https://i.iwara.tv/image/thumbnail/${v.file.id}/thumbnail-00.jpg` : undefined,
            };
        });
    }
    catch (e) {
        _err("Iwara", e);
        return [];
    }
};
const _xvideos = async (query, page, fetchFn) => {
    const base = "https://www.xvideos.com";
    try {
        const url = `${base}/?k=${encodeURIComponent(query.trim())}&p=${page}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        const selectors = ["div.thumb-under", "div.thumb", "div.video-thumb-bg", "div.thumb-block"];
        for (const sel of selectors) {
            if (results.length >= PER_SOURCE)
                break;
            $(sel).each((_, el) => {
                if (results.length >= PER_SOURCE)
                    return false;
                const a = $(el).find("a").first();
                let href = a.attr("href") || "";
                if (!href || href.includes("/professor"))
                    return;
                if (href.startsWith("//"))
                    href = `https:${href}`;
                else if (href.startsWith("/"))
                    href = `${base}${href}`;
                if (seen.has(href))
                    return;
                if (!href.includes("xvideos.com"))
                    return;
                seen.add(href);
                const img = $(el).find("img").first();
                const thumb = img.attr("src") || img.attr("data-src") || undefined;
                const title = (img.attr("alt") || a.text().trim() || "").trim();
                const dur = $(el).find("span.duration").text().trim();
                if (title)
                    results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "XVideos", thumbnail: thumb });
                return undefined;
            });
        }
        return results;
    }
    catch (e) {
        _err("XVideos", e);
        return [];
    }
};
const _pornhub = async (query, page, fetchFn) => {
    const base = "https://www.pornhub.com";
    try {
        const url = `${base}/video/search?search=${encodeURIComponent(query.trim())}&page=${page}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        const selectors = ["div.video-item", "div.video-wrapper", "div thumbnail协同"];
        for (const sel of selectors) {
            if (results.length >= PER_SOURCE)
                break;
            $(sel).each((_, el) => {
                if (results.length >= PER_SOURCE)
                    return false;
                const a = $(el).find("a.video-link").first();
                if (!a.length)
                    return;
                let href = a.attr("href") || "";
                if (!href)
                    return;
                if (href.startsWith("//"))
                    href = `https:${href}`;
                else if (href.startsWith("/"))
                    href = `${base}${href}`;
                if (seen.has(href))
                    return;
                if (!href.includes("pornhub.com"))
                    return;
                seen.add(href);
                const img = $(el).find("img").first();
                const thumb = img.attr("data-src") || img.attr("src") || undefined;
                const title = (img.attr("alt") || a.text().trim() || "").trim();
                const dur = $(el).find("span.duration").text().trim();
                const views = $(el).find("span.views").text().trim();
                if (title)
                    results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: views, source: "Pornhub", thumbnail: thumb });
                return undefined;
            });
        }
        return results;
    }
    catch (e) {
        _err("Pornhub", e);
        return [];
    }
};
const _xhamster = async (query, page, fetchFn) => {
    const base = "https://xhamster.com";
    try {
        const url = `${base}/search?q=${encodeURIComponent(query.trim())}&page=${page}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        const selectors = ["div.video-thumb", "div.thumb-list__item", "div.video-thumb-new"];
        for (const sel of selectors) {
            if (results.length >= PER_SOURCE)
                break;
            $(sel).each((_, el) => {
                if (results.length >= PER_SOURCE)
                    return false;
                const a = $(el).find("a").first();
                let href = a.attr("href") || "";
                if (!href)
                    return;
                if (href.startsWith("//"))
                    href = `https:${href}`;
                else if (href.startsWith("/"))
                    href = `${base}${href}`;
                if (seen.has(href))
                    return;
                if (!href.includes("xhamster.com"))
                    return;
                seen.add(href);
                const img = $(el).find("img").first();
                const thumb = img.attr("data-src") || img.attr("src") || undefined;
                const title = (img.attr("alt") || a.attr("title") || a.text().trim() || "").trim();
                const dur = $(el).find("span.duration").text().trim();
                if (title)
                    results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "xHamster", thumbnail: thumb });
                return undefined;
            });
        }
        return results;
    }
    catch (e) {
        _err("xHamster", e);
        return [];
    }
};
const _xnxx = async (query, page, fetchFn) => {
    const base = "https://www.xnxx.com";
    try {
        const pageSuffix = page === 1 ? "" : `-${page}`;
        const url = `${base}/search/${encodeURIComponent(query.trim())}${pageSuffix}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        $("div.thumb, div.video-thumb, div.thumb-block").each((_, el) => {
            if (results.length >= PER_SOURCE)
                return false;
            const a = $(el).find("a").first();
            let href = a.attr("href") || "";
            if (!href)
                return;
            if (href.startsWith("//"))
                href = `https:${href}`;
            else if (href.startsWith("/"))
                href = `${base}${href}`;
            if (seen.has(href))
                return;
            if (!href.includes("xnxx.com"))
                return;
            seen.add(href);
            const img = $(el).find("img").first();
            const thumb = img.attr("src") || img.attr("data-src") || undefined;
            const title = (img.attr("alt") || a.text().trim() || "").trim();
            const dur = $(el).find("span.duration").text().trim();
            if (title)
                results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "XNXX", thumbnail: thumb });
            return undefined;
        });
        return results;
    }
    catch (e) {
        _err("XNXX", e);
        return [];
    }
};
const _youporn = async (query, page, fetchFn) => {
    const base = "https://youporn.com";
    try {
        const pageSuffix = page === 1 ? "" : `?page=${page}`;
        const url = `${base}/search/${encodeURIComponent(query.trim())}${pageSuffix}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        $("div.video-item, div.video-block").each((_, el) => {
            if (results.length >= PER_SOURCE)
                return false;
            const a = $(el).find("a[href*='/watch/']").first();
            let href = a.attr("href") || "";
            if (!href)
                return;
            if (href.startsWith("//"))
                href = `https:${href}`;
            else if (href.startsWith("/"))
                href = `${base}${href}`;
            if (seen.has(href))
                return;
            if (!href.includes("youporn.com"))
                return;
            seen.add(href);
            const img = $(el).find("img").first();
            const thumb = img.attr("data-src") || img.attr("src") || undefined;
            const title = (img.attr("alt") || a.text().trim() || "").trim();
            const dur = $(el).find("span.duration").text().trim();
            if (title)
                results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "YouPorn", thumbnail: thumb });
            return undefined;
        });
        return results;
    }
    catch (e) {
        _err("YouPorn", e);
        return [];
    }
};
const _redtube = async (query, page, fetchFn) => {
    const base = "https://www.redtube.com";
    try {
        const url = `${base}/search?search=${encodeURIComponent(query.trim())}&page=${page}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        $("div.video-item, div.video_block").each((_, el) => {
            if (results.length >= PER_SOURCE)
                return false;
            const a = $(el).find("a").first();
            let href = a.attr("href") || "";
            if (!href)
                return;
            if (href.startsWith("//"))
                href = `https:${href}`;
            else if (href.startsWith("/"))
                href = `${base}${href}`;
            if (seen.has(href))
                return;
            if (!href.includes("redtube.com"))
                return;
            seen.add(href);
            const img = $(el).find("img").first();
            const thumb = img.attr("data-src") || img.attr("src") || undefined;
            const title = (img.attr("alt") || a.text().trim() || "").trim();
            const dur = $(el).find("span.duration").text().trim();
            if (title)
                results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "", source: "RedTube", thumbnail: thumb });
            return undefined;
        });
        return results;
    }
    catch (e) {
        _err("RedTube", e);
        return [];
    }
};
const _tgtube = async (query, page, fetchFn) => {
    const base = "https://www.tgtube.com";
    try {
        const url = `${base}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ""}`;
        const res = await _fetchWithTimeout(url, fetchFn, { headers: _headers(base) });
        if (!res.ok)
            return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();
        $("div.video-item, div.thumb, div.video-thumb").each((_, el) => {
            if (results.length >= PER_SOURCE)
                return false;
            const a = $(el).find("a").first();
            let href = a.attr("href") || "";
            if (!href)
                return;
            if (href.startsWith("//"))
                href = `https:${href}`;
            else if (href.startsWith("/"))
                href = `${base}${href}`;
            if (seen.has(href))
                return;
            if (!href.includes("tgtube.com"))
                return;
            seen.add(href);
            const img = $(el).find("img").first();
            const thumb = img.attr("data-src") || img.attr("src") || undefined;
            const title = (img.attr("alt") || img.attr("title") || a.text().trim() || "").trim();
            const dur = $(el).find("span.duration").text().trim();
            if (title)
                results.push({ title: `${title}${dur ? ` [${dur}]` : ""}`, url: href, snippet: "Trans", source: "TGTube", thumbnail: thumb });
            return undefined;
        });
        return results;
    }
    catch (e) {
        _err("TGTube", e);
        return [];
    }
};
const _interleave = (...arrays) => {
    const result = [];
    const max = Math.max(0, ...arrays.map((a) => a.length));
    for (let i = 0; i < max; i++)
        for (const arr of arrays)
            if (i < arr.length)
                result.push(arr[i]);
    return result;
};
export default class LewdSearchEngine {
    constructor() {
        this.isClientExposed = false;
        this.name = "lewd-search";
        this.bangShortcut = "lewd";
        this.settingsSchema = [
            { key: "enabled", label: "Enable lewd-search", type: "toggle", default: true },
        ];
        this.enabled = true;
    }
    configure(settings) {
        if (typeof settings.enabled === "boolean")
            this.enabled = settings.enabled;
    }
    async executeSearch(query, page = 1, _timeFilter, context) {
        if (!this.enabled)
            return [];
        const doFetch = context?.fetch ?? fetch;
        const p = Math.max(1, Number(page) || 1);
        const pageRange = [p];
        const fetchAllPages = async (fn) => {
            try {
                const results = await Promise.allSettled(pageRange.map((pg) => fn(query, pg, doFetch)));
                return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
            }
            catch {
                return [];
            }
        };
        const sourceFns = [
            fetchAllPages(_eporner),
            fetchAllPages(_iwara),
            fetchAllPages(_xvideos),
            fetchAllPages(_pornhub),
            fetchAllPages(_xhamster),
            fetchAllPages(_xnxx),
            fetchAllPages(_youporn),
            fetchAllPages(_redtube),
            fetchAllPages(_tgtube),
        ];
        const settled = await Promise.allSettled(sourceFns);
        return _interleave(settled[0].status === "fulfilled" ? settled[0].value : [], settled[1].status === "fulfilled" ? settled[1].value : [], settled[2].status === "fulfilled" ? settled[2].value : [], settled[3].status === "fulfilled" ? settled[3].value : [], settled[4].status === "fulfilled" ? settled[4].value : [], settled[5].status === "fulfilled" ? settled[5].value : [], settled[6].status === "fulfilled" ? settled[6].value : [], settled[7].status === "fulfilled" ? settled[7].value : [], settled[8].status === "fulfilled" ? settled[8].value : []);
    }
}
