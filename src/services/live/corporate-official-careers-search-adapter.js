import { compactSearchText } from "../../utils/normalize.js";
import { expandOrganizationQueryVariants, splitOrganizationQueries } from "../search/search-organization.js";
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
  "blog.naver.com",
  "post.naver.com",
  "brunch.co.kr",
  "velog.io",
  "tistory.com",
  "medium.com",
  "linkedin.com",
  "www.linkedin.com",
  "youtube.com",
  "www.youtube.com",
  "ader.naver.com",
  "searchadvisor.naver.com",
  "cafe.naver.com",
  "news.naver.com",
  "tv.naver.com",
  "news.samsung.com",
];

const careerTerms = ["recruit", "career", "careers", "jobs", "talent", "joinus", "join-us", "employment", "join us"];
const careerPathPattern = /\/(recruit|career|careers|jobs|job|talent|employment|joinus|join-us|hire)/iu;

const unique = (values) => [...new Set(values.filter(Boolean))];

const normalizeHostKey = (url) => normalizeHost(url).replace(/\.(com|co|kr|net|org|biz|info)$/giu, "").replace(/[^a-z0-9가-힣]/giu, "");

const isPossibleCorporateCareerUrl = (url) => {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  if (excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return false;
  }

  return hostname.includes(".") && !hostname.endsWith(".go.kr");
};

const matchesOrganizationHost = (url, organizationHints) => {
  if (organizationHints.length === 0) {
    return true;
  }

  const hostKey = normalizeHostKey(url);
  if (!hostKey) {
    return false;
  }

  return organizationHints.some((hint) => {
    const hintKey = compactSearchText(hint).replace(/[^a-z0-9가-힣]/giu, "");
    return hintKey.length >= 2 && (hostKey.includes(hintKey) || hintKey.includes(hostKey));
  });
};

const matchesCareerIntent = (text, url, organizationHints) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return false;
  }

  const hostname = normalizeHost(url);
  if (matchesOrganizationHost(url, organizationHints) && careerPathPattern.test(url)) {
    return true;
  }

  if (careerPathPattern.test(url)) {
    return true;
  }

  if (/(career|recruit|jobs|talent|joinus|employment)/iu.test(hostname)) {
    return true;
  }

  return matchesOrganizationHost(url, organizationHints) && careerTerms.some((term) => textKey.includes(compactSearchText(term)));
};

const buildQueries = (queryText, organization) => {
  const organizationQueries = splitOrganizationQueries(organization);
  const focusOrganization = organizationQueries[0] ?? "";
  const baseText = [focusOrganization, String(queryText ?? "").trim()].filter(Boolean).join(" ").trim();
  const effectiveText = baseText || focusOrganization || String(queryText ?? "").trim();
  if (!effectiveText) {
    return [];
  }

  const expandedTerms = unique(
    [focusOrganization, String(queryText ?? "").trim(), effectiveText]
      .filter(Boolean)
      .flatMap((value) => [value, ...expandOrganizationQueryVariants(value)]),
  ).slice(0, 4);

  return uniqueQueries([
    ...expandedTerms.map((term) => `${term} 채용`),
    ...expandedTerms.slice(0, 3).map((term) => `${term} careers`),
    ...expandedTerms.slice(0, 2).map((term) => `${term} recruit`),
    `${effectiveText} official careers`,
  ]).slice(0, 5);
};

const buildRankBoost = (url, text, organizationHints) => {
  let boost = 0;
  const hostname = normalizeHost(url);
  if (matchesOrganizationHost(url, organizationHints)) {
    boost += 12;
  }
  if (careerPathPattern.test(url)) {
    boost += 18;
  }
  if (/(career|recruit|jobs|talent|employment)/iu.test(hostname)) {
    boost += 10;
  }
  if (detectFileTypeFromUrl(url)) {
    boost += 6;
  }
  if (compactSearchText(text).includes(compactSearchText("채용"))) {
    boost += 4;
  }
  return boost;
};

export class CorporateOfficialCareersSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, organization = "" } = {}) {
    const queries = buildQueries(queryText, organization);
    if (queries.length === 0) {
      return [];
    }

    const organizationHints = splitOrganizationQueries(organization);
    const searchBatches = await Promise.all(queries.map((searchQuery) => fetchPublicSearchResults(searchQuery, this.timeoutMs)));
    const items = searchBatches.flatMap((results) =>
      results.flatMap((result) => {
        if (!isPossibleCorporateCareerUrl(result.url)) {
          return [];
        }
        if (!matchesCareerIntent(result.text, result.url, organizationHints)) {
          return [];
        }

        return [
          {
            sourceItemKey: result.url,
            pageUrl: result.url,
            canonicalUrl: result.url,
            sourceTitle: result.title,
            bodyText: [result.title, result.snippet, result.displayUrl, "기업 공식 채용 홈페이지 탐색"].filter(Boolean).join(". "),
            organizationHints,
            locationHints: [],
            publishedAt: null,
            assets: buildLiveAssetsFromUrl(result.url, result.title),
            matchText: result.text,
            rankBoost: buildRankBoost(result.url, result.text, organizationHints),
          },
        ];
      }),
    );

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, [organizationHints[0], String(queryText ?? "").trim()].filter(Boolean).join(" "), {
      limit,
      requireQueryMatch,
    });
  }
}
