import { resolveNamedRegion } from "../search/search-region.js";
import { fetchTextWithTimeout } from "../../utils/request.js";
import { createSearchIntentText, selectRankedResults, toAbsoluteUrl, toText } from "./live-search-utils.js";

const baseUrl = "https://www.daejeon.go.kr";
const listUrl = `${baseUrl}/drh/jobBlogList.do?boardId=jobblog01&menuSeq=7650`;
const itemPattern = /<li>\s*<a href="([^"]*jobBlogView[^"]+)">([\s\S]*?)<\/a>\s*<\/li>/giu;

const normalizeDate = (value) => {
  const matched = toText(value).match(/(\d{4}-\d{2}-\d{2})/u);
  return matched ? `${matched[1]}T00:00:00+09:00` : null;
};

const extractItems = (html, queryText) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(itemPattern)) {
    const pageUrl = toAbsoluteUrl(baseUrl, match[1]);
    if (!pageUrl || seen.has(pageUrl)) {
      continue;
    }

    const block = match[2];
    const title = toText(block.match(/<strong class="tit"><i>([\s\S]*?)<\/i><\/strong>/iu)?.[1] ?? "");
    const place = toText(block.match(/<dd><strong>행사장소<\/strong>\s*([\s\S]*?)<\/dd>/iu)?.[1] ?? "");
    const eventDate = toText(block.match(/<dd><strong>행사날짜<\/strong>\s*([\s\S]*?)<\/dd>/iu)?.[1] ?? "");

    seen.add(pageUrl);
    items.push({
      sourceItemKey: pageUrl.match(/ntatcSeq=(\d+)/u)?.[1] ?? pageUrl,
      pageUrl,
      canonicalUrl: pageUrl,
      sourceTitle: `대전광역시 채용행사 - ${title}`,
      bodyText: [
        title,
        place ? `행사장소 ${place}` : "",
        eventDate ? `행사날짜 ${eventDate}` : "",
        "대전광역시 공식 채용행사",
        createSearchIntentText(queryText),
      ]
        .filter(Boolean)
        .join(". "),
      organizationHints: ["대전광역시"],
      locationHints: ["대전광역시", place],
      publishedAt: normalizeDate(eventDate),
      assets: [],
      matchText: [title, place, eventDate].filter(Boolean).join(" "),
    });
  }

  return items;
};

export class DaejeonJobEventLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false, region = "" } = {}) {
    const resolvedRegion = resolveNamedRegion(region);
    if (resolvedRegion && resolvedRegion.canonical !== "대전광역시") {
      return [];
    }

    const html = await fetchTextWithTimeout(listUrl, this.timeoutMs);
    const items = extractItems(html, queryText);
    return selectRankedResults(items, queryText, { limit, requireQueryMatch });
  }
}

