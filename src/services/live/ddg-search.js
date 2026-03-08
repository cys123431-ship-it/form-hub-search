import { normalizeUrl } from "../../utils/normalize.js";
import { fetchTextWithTimeout } from "../../utils/request.js";
import { decodeHtml, toText } from "./live-search-utils.js";

const searchProviders = [
  { kind: "html", baseUrl: "https://html.duckduckgo.com/html/" },
  { kind: "lite", baseUrl: "https://lite.duckduckgo.com/lite/" },
];

const htmlResultPattern =
  /<h2 class="result__title">\s*<a[^>]*class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?<a class="result__url" href="[^"]+">([\s\S]*?)<\/a>(?:[\s\S]*?<a class="result__snippet" href="[^"]+">([\s\S]*?)<\/a>)?/giu;
const liteResultPattern =
  /<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>(?:[\s\S]*?<td class='result-snippet'>\s*([\s\S]*?)\s*<\/td>)?[\s\S]*?<span class='link-text'>([\s\S]*?)<\/span>/giu;
const naverResultPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>([\s\S]*?)<\/a>/giu;
const providerCacheTtlMs = 10 * 60 * 1000;
const providerCacheLimit = 120;
const providerCache = new Map();

const unique = (values) => [...new Set(values.filter(Boolean))];
const createCacheKey = (provider, query) => `${provider}:${String(query ?? "").trim().toLowerCase()}`;
const getCachedProviderResults = (cacheKey) => {
  const cachedEntry = providerCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    providerCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.results.map((entry) => ({ ...entry }));
};

const setCachedProviderResults = (cacheKey, results) => {
  providerCache.set(cacheKey, {
    expiresAt: Date.now() + providerCacheTtlMs,
    results: results.map((entry) => ({ ...entry })),
  });

  if (providerCache.size > providerCacheLimit) {
    const oldestKey = providerCache.keys().next().value;
    if (oldestKey) {
      providerCache.delete(oldestKey);
    }
  }
};

export const decodeDdgUrl = (href) => {
  const decodedHref = decodeHtml(String(href ?? "").trim());
  if (!decodedHref) {
    return "";
  }

  try {
    const absoluteUrl = decodedHref.startsWith("//") ? `https:${decodedHref}` : decodedHref;
    const redirectUrl = new URL(absoluteUrl, searchProviders[0].baseUrl);
    const targetUrl = redirectUrl.searchParams.get("uddg");
    return normalizeUrl(targetUrl ? decodeURIComponent(targetUrl) : redirectUrl.toString());
  } catch {
    return normalizeUrl(decodedHref);
  }
};

export const normalizeHost = (value) => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const parseHtmlResults = (html, providerKind) => {
  const pattern = providerKind === "lite" ? liteResultPattern : htmlResultPattern;
  const entries = [];

  for (const match of html.matchAll(pattern)) {
    const url = decodeDdgUrl(match[1]);
    if (!url) {
      continue;
    }

    const title = toText(match[2]);
    const snippet = toText(providerKind === "lite" ? match[3] ?? "" : match[4] ?? "");
    const displayUrl = toText(providerKind === "lite" ? match[4] ?? "" : match[3] ?? "");
    entries.push({
      title,
      snippet,
      displayUrl,
      url,
      text: [title, snippet, displayUrl, url].filter(Boolean).join(" "),
    });
  }

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
};

export const fetchDuckDuckGoResults = async (searchQuery, timeoutMs = 8000) => {
  const trimmedQuery = String(searchQuery ?? "").trim();
  if (!trimmedQuery) {
    return [];
  }

  const cacheKey = createCacheKey("ddg", trimmedQuery);
  const cachedResults = getCachedProviderResults(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  for (const provider of searchProviders) {
    try {
      const requestUrl = `${provider.baseUrl}?q=${encodeURIComponent(trimmedQuery)}`;
      const html = await fetchTextWithTimeout(requestUrl, timeoutMs);
      const results = parseHtmlResults(html, provider.kind);
      if (results.length > 0) {
        setCachedProviderResults(cacheKey, results);
        return results;
      }
    } catch {
      // Try the next DuckDuckGo HTML endpoint.
    }
  }

  return [];
};

export const uniqueQueries = (values) => unique(values.map((value) => String(value ?? "").trim()).filter(Boolean));

const isUsefulNaverResult = (url, title) => {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  if (hostname === "search.naver.com" || hostname === "adcr.naver.com" || hostname === "m.search.naver.com") {
    return false;
  }

  const trimmedTitle = String(title ?? "").trim();
  return trimmedTitle.length >= 4;
};

export const fetchNaverResults = async (searchQuery, timeoutMs = 8000) => {
  const trimmedQuery = String(searchQuery ?? "").trim();
  if (!trimmedQuery) {
    return [];
  }

  const cacheKey = createCacheKey("naver", trimmedQuery);
  const cachedResults = getCachedProviderResults(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  try {
    const requestUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(trimmedQuery)}`;
    const html = await fetchTextWithTimeout(requestUrl, timeoutMs);
    const items = [];
    for (const match of html.matchAll(naverResultPattern)) {
      const url = normalizeUrl(match[1]);
      const title = toText(match[2]).slice(0, 220);
      if (!isUsefulNaverResult(url, title)) {
        continue;
      }

      items.push({
        title,
        snippet: "",
        displayUrl: normalizeHost(url),
        url,
        text: [title, url].filter(Boolean).join(" "),
      });
    }

    const dedupedItems = [...new Map(items.map((item) => [item.url, item])).values()];
    if (dedupedItems.length > 0) {
      setCachedProviderResults(cacheKey, dedupedItems);
    }
    return dedupedItems;
  } catch {
    return [];
  }
};

export const fetchPublicSearchResults = async (searchQuery, timeoutMs = 8000) => {
  const naverResults = await fetchNaverResults(searchQuery, timeoutMs);
  if (naverResults.length > 0) {
    return naverResults;
  }

  return fetchDuckDuckGoResults(searchQuery, timeoutMs);
};
