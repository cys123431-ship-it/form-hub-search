import { compactSearchText } from "../../utils/normalize.js";
import { fetchPublicSearchResults, normalizeHost, uniqueQueries } from "./ddg-search.js";
import { buildLiveAssetsFromUrl, detectFileTypeFromUrl, selectRankedResults } from "./live-search-utils.js";

const excludedHosts = [
  "jobkorea.co.kr",
  "www.jobkorea.co.kr",
  "saramin.co.kr",
  "www.saramin.co.kr",
  "work24.go.kr",
  "www.work24.go.kr",
  "gojobs.go.kr",
  "www.gojobs.go.kr",
  "job.alio.go.kr",
  "www.job.alio.go.kr",
  "ader.naver.com",
  "shopping.naver.com",
  "m.shopping.naver.com",
  "smartstore.naver.com",
  "kin.naver.com",
  "blog.naver.com",
  "cafe.naver.com",
  "post.naver.com",
  "namu.wiki",
  "tistory.com",
  "brunch.co.kr",
  "velog.io",
  "youtube.com",
  "www.youtube.com",
];

const formKeywords = ["양식", "서식", "template", "템플릿", "샘플", "예시", "이력서", "자소서", "계약서", "제안서"];
const fileHintPattern = /\.(pdf|hwp|hwpx|doc|docx|xlsx|pptx)(?:$|[?#])/iu;

const unique = (values) => [...new Set(values.filter(Boolean))];
const officialDocumentPattern = /\.(go\.kr|or\.kr|ac\.kr|co\.kr|com)\b/iu;

const isFormCandidateUrl = (url) => {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  if (excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return false;
  }

  return true;
};

const buildRankBoost = (url, text) => {
  let boost = 0;
  const hostname = normalizeHost(url);
  if (detectFileTypeFromUrl(url)) {
    boost += 12;
  }
  if (hostname.endsWith(".go.kr") || hostname.endsWith(".or.kr")) {
    boost += 10;
  }
  if (officialDocumentPattern.test(url)) {
    boost += 4;
  }
  const textKey = compactSearchText(text);
  if (["양식", "서식", "template", "이력서", "자소서", "계약서", "제안서"].some((keyword) => textKey.includes(compactSearchText(keyword)))) {
    boost += 4;
  }
  return boost;
};

const matchesFormIntent = (text, url) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return false;
  }

  if (fileHintPattern.test(url)) {
    return true;
  }

  return formKeywords.some((keyword) => textKey.includes(compactSearchText(keyword)));
};

const buildQueries = (queryText) => {
  const trimmedQuery = String(queryText ?? "").trim();
  if (!trimmedQuery) {
    return [];
  }

  return uniqueQueries([
    `${trimmedQuery} 양식`,
    `${trimmedQuery} 서식`,
    `${trimmedQuery} template`,
    trimmedQuery,
  ]).slice(0, 4);
};

export class FreeFormLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false } = {}) {
    const queries = buildQueries(queryText);
    if (queries.length === 0) {
      return [];
    }

    const searchBatches = await Promise.all(queries.map((searchQuery) => fetchPublicSearchResults(searchQuery, this.timeoutMs)));
    const items = searchBatches.flatMap((results) =>
      results.flatMap((result) => {
        if (!isFormCandidateUrl(result.url)) {
          return [];
        }
        if (!matchesFormIntent(result.text, result.url)) {
          return [];
        }

        return [
          {
            sourceItemKey: result.url,
            pageUrl: result.url,
            canonicalUrl: result.url,
            sourceTitle: result.title,
            bodyText: [result.title, result.snippet, result.displayUrl, "무료 양식 웹 크롤링"].filter(Boolean).join(". "),
            organizationHints: [],
            locationHints: [],
            publishedAt: null,
            assets: buildLiveAssetsFromUrl(result.url, result.title),
            matchText: result.text,
            rankBoost: buildRankBoost(result.url, result.text),
          },
        ];
      }),
    );

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, String(queryText ?? "").trim(), { limit, requireQueryMatch });
  }
}
