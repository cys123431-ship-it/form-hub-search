import { fetchTextWithTimeout } from "../../utils/request.js";
import { normalizeUrl } from "../../utils/normalize.js";
import { resolveNamedRegion } from "../search/search-region.js";
import { selectRankedResults, toAbsoluteUrl, toText } from "./live-search-utils.js";

const baseUrl = "https://newsearch.seoul.go.kr";
const searchUrl = `${baseUrl}/ksearch/search.do`;
const linkPattern = /<a[^>]*href="([^"]*tr_code=[^"]*)"[^>]*>([\s\S]*?)<\/a>/giu;
const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gu;
const allowedHosts = [
  "www.seoul.go.kr",
  "seoul.go.kr",
  "news.seoul.go.kr",
  "mediahub.seoul.go.kr",
  "tv.seoul.go.kr",
  "idea.seoul.go.kr",
  "org.seoul.go.kr",
  "eungdapso.seoul.go.kr",
  "opengov.seoul.go.kr",
  "lib.seoul.go.kr",
  "love.seoul.go.kr",
  "audio4blind.seoul.go.kr",
  "sema.seoul.go.kr",
];
const blockedCodePrefixes = ["gnb", "top_menu", "helper"];
const blockedExactTitles = new Set(["서울소식", "시민참여", "분야별정보", "서울소개", "부서안내", "정보공개", "응답소", "로그인"]);

const unique = (values) => [...new Set(values.filter(Boolean))];

const buildQueryText = (queryText, region) => {
  const trimmedQuery = String(queryText ?? "").trim();
  if (!trimmedQuery) {
    return "";
  }

  const resolvedRegion = resolveNamedRegion(region);
  if (!resolvedRegion) {
    return trimmedQuery;
  }

  if (resolvedRegion.canonical !== "서울특별시") {
    return "";
  }

  if (resolvedRegion.matchedType === "district" && !trimmedQuery.includes(resolvedRegion.matchedLabel)) {
    return unique([trimmedQuery, resolvedRegion.matchedLabel]).join(" ");
  }

  return trimmedQuery;
};

const isAllowedSeoulHost = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const buildLocationHints = (title, region) => {
  const resolvedRegion = resolveNamedRegion(region);
  if (!resolvedRegion || resolvedRegion.canonical !== "서울특별시") {
    return ["서울특별시"];
  }

  const titleText = toText(title);
  if (resolvedRegion.matchedType === "district" && titleText.includes(resolvedRegion.matchedLabel)) {
    return ["서울특별시", resolvedRegion.matchedLabel];
  }

  return ["서울특별시"];
};

const extractItems = (html, queryText, region) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(linkPattern)) {
    const pageUrl = normalizeUrl(toAbsoluteUrl(baseUrl, match[1]));
    const title = toText(match[2]);
    const trCode = pageUrl.match(/tr_code=([^&]+)/u)?.[1] ?? "";

    if (!pageUrl || !title || seen.has(pageUrl) || title.length < 4 || blockedCodePrefixes.some((prefix) => trCode.startsWith(prefix))) {
      continue;
    }
    if (!isAllowedSeoulHost(pageUrl)) {
      continue;
    }
    if (/^\d+:\d+\s+-->$/u.test(title)) {
      continue;
    }

    seen.add(pageUrl);
    const locationHints = buildLocationHints(title, region);

    items.push({
      sourceItemKey: pageUrl,
      pageUrl,
      canonicalUrl: pageUrl,
      sourceTitle: title,
      bodyText: [
        title,
        "서울특별시 통합검색 공식 결과",
        "서울시와 서울시 산하 공식 사이트 결과만 선별한 문서입니다.",
        pageUrl,
      ].join(". "),
      organizationHints: [locationHints.at(-1) ?? "서울특별시"],
      locationHints,
      publishedAt: null,
      assets: [],
      matchText: [title, pageUrl, ...locationHints].join(" "),
    });
  }

  return items;
};

const extractMarkdownItems = (markdown, queryText, region) => {
  const items = [];
  const seen = new Set();

  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const title = toText(match[1]).replace(/^!\s*/u, "");
    const pageUrl = normalizeUrl(match[2]);
    if (!pageUrl || !title || seen.has(pageUrl) || blockedExactTitles.has(title)) {
      continue;
    }
    if (!isAllowedSeoulHost(pageUrl)) {
      continue;
    }
    if (title.startsWith("Image ") || title.startsWith("![Image")) {
      continue;
    }

    seen.add(pageUrl);
    const locationHints = buildLocationHints(title, region);
    items.push({
      sourceItemKey: pageUrl,
      pageUrl,
      canonicalUrl: pageUrl,
      sourceTitle: title,
      bodyText: [
        title,
        "서울특별시 통합검색 공식 결과",
        "서울시와 서울시 산하 공식 사이트 결과만 선별한 문서입니다.",
        pageUrl,
      ].join(". "),
      organizationHints: [locationHints.at(-1) ?? "서울특별시"],
      locationHints,
      publishedAt: null,
      assets: [],
      matchText: [title, pageUrl, ...locationHints].join(" "),
    });
  }

  return items;
};

export class SeoulSiteLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, region = "" } = {}) {
    const searchQuery = buildQueryText(queryText, region);
    if (!searchQuery) {
      return [];
    }

    let items = [];
    try {
      const proxyUrl = `https://r.jina.ai/http://newsearch.seoul.go.kr/ksearch/search.do?kwd=${encodeURIComponent(searchQuery)}`;
      const markdown = await fetchTextWithTimeout(proxyUrl, this.timeoutMs);
      items = extractMarkdownItems(markdown, searchQuery, region);
    } catch {
      // Fall through to the direct HTML fetch.
    }

    if (items.length === 0) {
      const html = await fetchTextWithTimeout(`${searchUrl}?kwd=${encodeURIComponent(searchQuery)}`, this.timeoutMs);
      items = extractItems(html, searchQuery, region);
    }

    return selectRankedResults(items, queryText, { limit, requireQueryMatch });
  }
}
