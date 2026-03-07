import { fetchTextWithTimeout } from "../../utils/request.js";
import {
  createSearchIntentText,
  decodeHtml,
  selectRankedResults,
  toAbsoluteUrl,
  toText,
} from "./live-search-utils.js";

const baseUrl = "https://www.saramin.co.kr";
const baseSearchUrl = `${baseUrl}/zf_user/search?searchword=`;
const listItemPattern = /<li>[\s\S]*?<span class="corp_name">[\s\S]*?title="([^"]+)"[\s\S]*?<h2 class="job_tit">[\s\S]*?<a[^>]*title="([^"]+)"[\s\S]*?href="([^"]*rec_idx=\d+[^"]*)"[\s\S]*?<\/li>/giu;

const buildItemKey = (pageUrl) => {
  const matched = pageUrl.match(/rec_idx=(\d+)/u);
  return matched?.[1] ?? pageUrl.split("rec_idx=").at(-1) ?? pageUrl;
};

const buildCanonicalPageUrl = (href) => {
  const absoluteUrl = toAbsoluteUrl(baseUrl, href);
  const itemKey = buildItemKey(absoluteUrl);
  return itemKey ? `${baseUrl}/zf_user/jobs/relay/view?rec_idx=${itemKey}` : absoluteUrl;
};

const createParsedPosting = ({ pageUrl, companyName, title, queryText }) => {
  const normalizedCompany = toText(companyName);
  const normalizedTitle = toText(title);

  return {
    sourceItemKey: buildItemKey(pageUrl),
    pageUrl,
    canonicalUrl: pageUrl,
    sourceTitle: `${normalizedCompany} 채용 - ${normalizedTitle}`,
    bodyText: [normalizedCompany, normalizedTitle, createSearchIntentText(queryText)].join(". "),
    organizationHints: [normalizedCompany],
    publishedAt: null,
    assets: [],
    matchText: [normalizedCompany, normalizedTitle].join(" "),
  };
};

const extractCards = (html, queryText) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(listItemPattern)) {
    const companyName = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    const pageUrl = buildCanonicalPageUrl(match[3]);
    if (!pageUrl || seen.has(pageUrl)) {
      continue;
    }

    seen.add(pageUrl);
    items.push(createParsedPosting({ pageUrl, companyName, title, queryText }));
  }

  return items;
};

export class SaraminLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false } = {}) {
    const searchUrl = `${baseSearchUrl}${encodeURIComponent(queryText)}`;
    const searchHtml = await fetchTextWithTimeout(searchUrl, this.timeoutMs);
    const cards = extractCards(searchHtml, queryText);
    return selectRankedResults(cards, queryText, { limit, requireQueryMatch });
  }
}
