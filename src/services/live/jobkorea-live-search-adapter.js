import { fetchTextWithTimeout } from "../../utils/request.js";
import { compactSearchText, normalizeUrl, normalizeWhitespace } from "../../utils/normalize.js";

const baseSearchUrl = "https://www.jobkorea.co.kr/Search/?stext=";
const resultUrlPattern = /https:\/\/www\.jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+(?:\?[^"]*)?/g;
const canonicalPattern = /<link rel="canonical" href="([^"]+)"/i;
const metaDescriptionPattern = /<meta name="description" content="([^"]+)"/i;
const titlePattern = /<title>(.*?)<\/title>/is;

const decodeHtml = (value) =>
  String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripJobKoreaBrand = (value) => decodeHtml(value).replace(/\s*\|\s*잡코리아\s*$/u, "").trim();

const extractDetailUrls = (html, limit) => {
  const uniqueUrls = new Set();
  for (const matched of html.match(resultUrlPattern) ?? []) {
    const normalized = normalizeUrl(decodeHtml(matched).split("?")[0]);
    if (!uniqueUrls.has(normalized)) {
      uniqueUrls.add(normalized);
    }
    if (uniqueUrls.size >= limit) {
      break;
    }
  }
  return [...uniqueUrls];
};

const extractValue = (pattern, html) => stripJobKoreaBrand(html.match(pattern)?.[1] ?? "");

const matchesQueryText = (posting, queryText) =>
  compactSearchText([posting.sourceTitle, posting.bodyText, ...posting.organizationHints].join(" ")).includes(
    compactSearchText(queryText),
  );

const createParsedPosting = (detailUrl, html) => {
  const canonicalUrl = extractValue(canonicalPattern, html) || detailUrl;
  const pageTitle = extractValue(titlePattern, html);
  const description = extractValue(metaDescriptionPattern, html);
  const [companyName = "잡코리아", titlePart = pageTitle] = pageTitle.split(" 채용 - ");
  const sourceTitle = normalizeWhitespace(pageTitle);
  const searchIntentKeywords = "채용 공고 입사지원 지원서 자기소개서 자소서";

  return {
    sourceItemKey: canonicalUrl.split("/").at(-1),
    pageUrl: canonicalUrl,
    canonicalUrl,
    sourceTitle,
    bodyText: normalizeWhitespace([companyName, titlePart, description, searchIntentKeywords].join(". ")),
    organizationHints: [companyName],
    publishedAt: null,
    assets: [],
  };
};

export class JobKoreaLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false } = {}) {
    const searchUrl = `${baseSearchUrl}${encodeURIComponent(queryText)}`;
    const searchHtml = await fetchTextWithTimeout(searchUrl, this.timeoutMs);
    const detailUrls = extractDetailUrls(searchHtml, limit);
    const results = [];

    for (const detailUrl of detailUrls) {
      try {
        const detailHtml = await fetchTextWithTimeout(detailUrl, this.timeoutMs);
        const posting = createParsedPosting(detailUrl, detailHtml);
        if (requireQueryMatch && !matchesQueryText(posting, queryText)) {
          continue;
        }
        results.push(posting);
      } catch {
        continue;
      }
    }

    return results;
  }
}
