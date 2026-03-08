import { splitOrganizationQueries } from "../search/search-organization.js";
import { splitRegionQueries } from "../search/search-region.js";
import { fetchPublicSearchResults, normalizeHost, uniqueQueries } from "./ddg-search.js";
import { buildLiveAssetsFromUrl, detectFileTypeFromUrl, selectRankedResults } from "./live-search-utils.js";

const excludedHosts = [
  "ader.naver.com",
  "adcr.naver.com",
  "search.naver.com",
  "m.search.naver.com",
  "blog.naver.com",
  "cafe.naver.com",
  "kin.naver.com",
  "post.naver.com",
  "tistory.com",
  "brunch.co.kr",
  "velog.io",
  "youtube.com",
  "www.youtube.com",
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "x.com",
  "www.x.com",
];

const buildQueries = (queryText, { region = "", organization = "" } = {}) => {
  const trimmedQuery = String(queryText ?? "").trim();
  const organizationQueries = splitOrganizationQueries(organization);
  const regionQueries = splitRegionQueries(region);
  const primaryOrganization = organizationQueries[0] ?? "";
  const primaryRegion = regionQueries[0] ?? "";
  const baseText = [primaryRegion, primaryOrganization, trimmedQuery].filter(Boolean).join(" ").trim();
  if (!baseText) {
    return [];
  }

  return uniqueQueries([baseText, [primaryOrganization, trimmedQuery].filter(Boolean).join(" "), trimmedQuery]).slice(0, 3);
};

const buildRankBoost = (url, organizationHints, locationHints) => {
  const hostname = normalizeHost(url);
  const hostKey = hostname.replace(/[^a-z0-9가-힣]/giu, "");
  let boost = 0;

  if (hostname.endsWith(".go.kr")) {
    boost += 16;
  }
  if (hostname.endsWith(".or.kr") || hostname.endsWith(".ac.kr")) {
    boost += 10;
  }
  if (detectFileTypeFromUrl(url)) {
    boost += 8;
  }
  if (
    organizationHints.some((hint) => {
      const hintKey = String(hint ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/giu, "");
      return hintKey.length >= 2 && (hostKey.includes(hintKey) || hintKey.includes(hostKey));
    })
  ) {
    boost += 8;
  }
  if (
    locationHints.some((hint) => {
      const hintKey = String(hint ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/giu, "");
      return hintKey.length >= 2 && (hostKey.includes(hintKey) || hintKey.includes(hostKey));
    })
  ) {
    boost += 4;
  }

  return boost;
};

export class WholeWebSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, region = "", organization = "" } = {}) {
    const queries = buildQueries(queryText, { region, organization });
    if (queries.length === 0) {
      return [];
    }

    const organizationHints = splitOrganizationQueries(organization);
    const locationHints = splitRegionQueries(region);
    const searchBatches = await Promise.all(queries.map((searchQuery) => fetchPublicSearchResults(searchQuery, this.timeoutMs)));
    const items = searchBatches.flatMap((results) =>
      results.flatMap((result) => {
        const hostname = normalizeHost(result.url);
        if (excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
          return [];
        }

        return [
          {
            sourceItemKey: result.url,
            pageUrl: result.url,
            canonicalUrl: result.url,
            sourceTitle: result.title,
            bodyText: [result.title, result.snippet, result.displayUrl, "웹 전체 검색"].filter(Boolean).join(". "),
            organizationHints,
            locationHints,
            publishedAt: null,
            assets: buildLiveAssetsFromUrl(result.url, result.title),
            matchText: result.text,
            rankBoost: buildRankBoost(result.url, organizationHints, locationHints),
          },
        ];
      }),
    );

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, queries[0], { limit, requireQueryMatch });
  }
}
