import { fetchTextWithTimeout } from "../../utils/request.js";
import {
  createSearchIntentText,
  selectRankedResults,
  toText,
} from "./live-search-utils.js";

const listUrl = "https://www.gojobs.go.kr/apmList.do?menuNo=401&mngrMenuYn=N&selMenuNo=400&upperMenuNo=";
const rowPattern =
  /<tr[\s\S]*?fn_apmView\('([^']+)',\s*'([^']+)'\)[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td align="center">\s*([\s\S]*?)\s*<\/td>[\s\S]*?<td align="center">[\s\S]*?(\d{4}-\d{2}-\d{2})[\s\S]*?<td align="center">[\s\S]*?(\d{4}-\d{2}-\d{2})/giu;

const createParsedPosting = ({ jobCode, announcementId, title, organizationName, publishedAt, applyEndAt, queryText }) => {
  const normalizedTitle = toText(title);
  const normalizedOrganization = toText(organizationName);
  const pageUrl = `${listUrl}#${jobCode}-${announcementId}`;

  return {
    sourceItemKey: `${jobCode}-${announcementId}`,
    pageUrl,
    canonicalUrl: pageUrl,
    sourceTitle: normalizedTitle,
    bodyText: [
      normalizedOrganization,
      normalizedTitle,
      `게시일 ${publishedAt}`,
      `접수마감 ${applyEndAt}`,
      createSearchIntentText(queryText),
    ].join(". "),
    organizationHints: [normalizedOrganization],
    publishedAt: publishedAt ? `${publishedAt}T00:00:00+09:00` : null,
    assets: [],
    matchText: [normalizedOrganization, normalizedTitle].join(" "),
  };
};

const extractRows = (html, queryText) => {
  const items = [];

  for (const match of html.matchAll(rowPattern)) {
    items.push(
      createParsedPosting({
        jobCode: match[1],
        announcementId: match[2],
        title: match[3],
        organizationName: match[4],
        publishedAt: match[5],
        applyEndAt: match[6],
        queryText,
      }),
    );
  }

  return items;
};

export class GojobsLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false } = {}) {
    const html = await fetchTextWithTimeout(listUrl, this.timeoutMs);
    const items = extractRows(html, queryText);
    return selectRankedResults(items, queryText, { limit, requireQueryMatch: true });
  }
}
