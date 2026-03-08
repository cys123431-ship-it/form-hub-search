import { compactSearchText } from "../../utils/normalize.js";
import { municipalRegionProfiles, getMunicipalSearchProfiles, extractMatchedLocations, splitRegionQueries } from "../search/search-region.js";
import { fetchDuckDuckGoResults, normalizeHost, uniqueQueries } from "./ddg-search.js";
import { selectRankedResults } from "./live-search-utils.js";

const excludedHosts = [
  "data.go.kr",
  "www.data.go.kr",
  "law.go.kr",
  "www.law.go.kr",
  "work24.go.kr",
  "www.work24.go.kr",
  "jobkorea.co.kr",
  "www.jobkorea.co.kr",
  "saramin.co.kr",
  "www.saramin.co.kr",
  "gojobs.go.kr",
  "www.gojobs.go.kr",
  "job.alio.go.kr",
  "www.job.alio.go.kr",
  "blog.naver.com",
  "post.naver.com",
  "brunch.co.kr",
  "velog.io",
  "tistory.com",
];

const boardKeywords = [
  "고시공고",
  "채용공고",
  "모집공고",
  "채용",
  "공고",
  "모집",
  "공지사항",
  "부서소식",
  "고시",
  "게시판",
  "일자리",
  "하수",
  "민원",
];

const boardPathPattern = /\/(board|bbs|notice|gosi|gonggo|job|recruit|cop\/bbs|portal|sub\d)/iu;

const unique = (values) => [...new Set(values.filter(Boolean))];

const isOfficialAdminUrl = (url) => {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  if (excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return false;
  }

  if (hostname.endsWith(".go.kr")) {
    return true;
  }

  return municipalRegionProfiles.some((profile) =>
    profile.officialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)),
  );
};

const matchesBoardIntent = (text, url) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return false;
  }

  if (boardPathPattern.test(url)) {
    return true;
  }

  return boardKeywords.some((keyword) => textKey.includes(compactSearchText(keyword)));
};

const buildQueries = (queryText, { region = "", organization = "" } = {}) => {
  const trimmedQuery = String(queryText ?? "").trim();
  const primaryRegion = splitRegionQueries(region)[0] ?? "";
  const organizationText = String(organization ?? "").trim();
  const focusText = [primaryRegion, organizationText, trimmedQuery].filter(Boolean).join(" ").trim();
  const baseQuery = focusText || trimmedQuery || organizationText;
  if (!baseQuery) {
    return [];
  }

  return uniqueQueries([
    `${baseQuery} site:go.kr`,
    `${baseQuery} 고시공고 site:go.kr`,
    `${baseQuery} 채용공고 site:go.kr`,
    `${baseQuery} 게시판 site:go.kr`,
  ]).slice(0, 4);
};

const buildLocationHints = (text, region) => {
  const matchedProfiles = getMunicipalSearchProfiles({ region, text });
  const locations = matchedProfiles.flatMap((profile) => {
    const extracted = extractMatchedLocations(text, profile);
    return extracted.length > 0 ? extracted : [profile.canonical];
  });

  return unique(locations.length > 0 ? locations : splitRegionQueries(region));
};

export class NationalAdminBoardSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, region = "", organization = "" } = {}) {
    const queries = buildQueries(queryText, { region, organization });
    if (queries.length === 0) {
      return [];
    }

    const items = [];
    for (const searchQuery of queries) {
      const results = await fetchDuckDuckGoResults(searchQuery, this.timeoutMs);
      results.forEach((result) => {
        if (!isOfficialAdminUrl(result.url)) {
          return;
        }
        if (!matchesBoardIntent(result.text, result.url)) {
          return;
        }

        const locationHints = buildLocationHints(result.text, region);
        items.push({
          sourceItemKey: result.url,
          pageUrl: result.url,
          canonicalUrl: result.url,
          sourceTitle: result.title,
          bodyText: [
            result.title,
            result.snippet,
            result.displayUrl,
            locationHints.join(" "),
            "전국 행정기관 전용 게시판 검색",
          ]
            .filter(Boolean)
            .join(". "),
          organizationHints: unique(locationHints),
          locationHints,
          publishedAt: null,
          assets: [],
          matchText: result.text,
        });
      });
    }

    const dedupedItems = [...new Map(items.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, String(queryText ?? "").trim(), { limit, requireQueryMatch });
  }
}
