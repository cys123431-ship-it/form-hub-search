import { splitOrganizationQueries } from "../search/search-organization.js";
import { splitRegionQueries } from "../search/search-region.js";
import { fetchPublicSearchResults, normalizeHost, uniqueQueries } from "./ddg-search.js";
import { selectRankedResults } from "./live-search-utils.js";

const excludedHosts = ["ader.naver.com", "adcr.naver.com", "search.naver.com", "m.search.naver.com"];

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
    const items = [];
    for (const searchQuery of queries) {
      const results = await fetchPublicSearchResults(searchQuery, this.timeoutMs);
      results.forEach((result) => {
        const hostname = normalizeHost(result.url);
        if (excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
          return;
        }

        items.push({
          sourceItemKey: result.url,
          pageUrl: result.url,
          canonicalUrl: result.url,
          sourceTitle: result.title,
          bodyText: [result.title, result.snippet, result.displayUrl, "웹 전체 검색"].filter(Boolean).join(". "),
          organizationHints,
          locationHints,
          publishedAt: null,
          assets: [],
          matchText: result.text,
        });
      });
    }

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, queries[0], { limit, requireQueryMatch });
  }
}
