import { resolveNamedRegion } from "../search/search-region.js";
import { fetchTextWithTimeout } from "../../utils/request.js";
import { createSearchIntentText, selectRankedResults, toAbsoluteUrl, toText } from "./live-search-utils.js";

const baseUrl = "https://www.daejeon.go.kr";
const listUrl = `${baseUrl}/drh/drhGosiList.do`;
const rowPattern =
  /<tr>\s*<td class="num t_end">\s*([\s\S]*?)<\/td>\s*<td class="title al_left">\s*<a href="([^"]+)"[^>]*>\s*([\s\S]*?)<\/a>\s*<\/td>\s*<td class="date">\s*([\s\S]*?)\s*<\/td>\s*<td class="date">\s*([\d.]+)\s*<\/td>\s*<\/tr>/giu;

const normalizeDate = (value) => {
  const raw = toText(value);
  if (!/^\d{4}\.\d{2}\.\d{2}$/u.test(raw)) {
    return null;
  }
  return `${raw.replace(/\./g, "-")}T00:00:00+09:00`;
};

const buildSearchQuery = (queryText, region) => {
  const trimmedQuery = String(queryText ?? "").trim();
  if (trimmedQuery) {
    return trimmedQuery;
  }

  const resolvedRegion = resolveNamedRegion(region);
  if (resolvedRegion?.canonical === "대전광역시") {
    return "채용";
  }

  return "";
};

const extractItems = (html, queryText) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(rowPattern)) {
    const noticeNumber = toText(match[1]);
    const pageUrl = toAbsoluteUrl(baseUrl, match[2]);
    const title = toText(match[3]);
    const departmentName = toText(match[4]);
    const publishedAt = normalizeDate(match[5]);

    if (!pageUrl || seen.has(pageUrl)) {
      continue;
    }

    seen.add(pageUrl);
    items.push({
      sourceItemKey: pageUrl.match(/sno=(\d+)/u)?.[1] ?? noticeNumber ?? pageUrl,
      pageUrl,
      canonicalUrl: pageUrl,
      sourceTitle: `대전광역시 공고 - ${title}`,
      bodyText: [
        title,
        noticeNumber ? `공고번호 ${noticeNumber}` : "",
        departmentName ? `담당부서 ${departmentName}` : "",
        "대전광역시 공식 고시공고",
        createSearchIntentText(queryText),
      ]
        .filter(Boolean)
        .join(". "),
      organizationHints: ["대전광역시"],
      locationHints: ["대전광역시"],
      publishedAt,
      assets: [],
      matchText: [noticeNumber, title, departmentName].filter(Boolean).join(" "),
    });
  }

  return items;
};

export class DaejeonGosiLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false, region = "" } = {}) {
    const resolvedRegion = resolveNamedRegion(region);
    if (resolvedRegion && resolvedRegion.canonical !== "대전광역시") {
      return [];
    }

    const titleQuery = buildSearchQuery(queryText, region);
    if (!titleQuery) {
      return [];
    }

    const params = new URLSearchParams({
      menuSeq: "1908",
      gosigbn: "A",
      title: titleQuery,
    });
    const html = await fetchTextWithTimeout(`${listUrl}?${params.toString()}`, this.timeoutMs);
    const items = extractItems(html, queryText || titleQuery);
    return selectRankedResults(items, queryText || titleQuery, { limit, requireQueryMatch });
  }
}

