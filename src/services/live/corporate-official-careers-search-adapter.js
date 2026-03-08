import { compactSearchText } from "../../utils/normalize.js";
import { expandOrganizationQueryVariants, splitOrganizationQueries } from "../search/search-organization.js";
import { fetchPublicSearchResults, normalizeHost, uniqueQueries } from "./ddg-search.js";
import { selectRankedResults } from "./live-search-utils.js";

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
];

const careerTerms = ["recruit", "career", "careers", "jobs", "talent", "joinus", "join-us", "employment", "join us"];
const careerPathPattern = /\/(recruit|career|careers|jobs|job|talent|employment|joinus|join-us|hire)/iu;

const unique = (values) => [...new Set(values.filter(Boolean))];

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

const matchesCareerIntent = (text, url) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return false;
  }

  const hostname = normalizeHost(url);
  if (careerPathPattern.test(url)) {
    return true;
  }

  if (/(career|recruit|jobs|talent|joinus|employment)/iu.test(hostname)) {
    return true;
  }

  return careerTerms.some((term) => textKey.includes(compactSearchText(term)));
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
    const items = [];
    for (const searchQuery of queries) {
      const results = await fetchPublicSearchResults(searchQuery, this.timeoutMs);
      results.forEach((result) => {
        if (!isPossibleCorporateCareerUrl(result.url)) {
          return;
        }
        if (!matchesCareerIntent(result.text, result.url)) {
          return;
        }

        items.push({
          sourceItemKey: result.url,
          pageUrl: result.url,
          canonicalUrl: result.url,
          sourceTitle: result.title,
          bodyText: [result.title, result.snippet, result.displayUrl, "기업 공식 채용 홈페이지 탐색"].filter(Boolean).join(". "),
          organizationHints,
          locationHints: [],
          publishedAt: null,
          assets: [],
          matchText: result.text,
        });
      });
    }

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, [organizationHints[0], String(queryText ?? "").trim()].filter(Boolean).join(" "), {
      limit,
      requireQueryMatch,
    });
  }
}
