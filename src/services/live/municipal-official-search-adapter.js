import { compactSearchText, normalizeUrl } from "../../utils/normalize.js";
import { fetchTextWithTimeout } from "../../utils/request.js";
import {
  collectMunicipalSearchTerms,
  extractMatchedLocations,
  getMunicipalSearchProfiles,
} from "../search/search-region.js";
import { decodeHtml, selectRankedResults, toText } from "./live-search-utils.js";

const searchBaseUrl = "https://html.duckduckgo.com/html/";
const resultPattern =
  /<h2 class="result__title">\s*<a[^>]*class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?<a class="result__url" href="[^"]+">([\s\S]*?)<\/a>(?:[\s\S]*?<a class="result__snippet" href="[^"]+">([\s\S]*?)<\/a>)?/giu;
const excludedNationalHosts = [
  "data.go.kr",
  "www.data.go.kr",
  "law.go.kr",
  "www.law.go.kr",
  "work.go.kr",
  "www.work.go.kr",
  "work24.go.kr",
  "www.work24.go.kr",
  "gojobs.go.kr",
  "www.gojobs.go.kr",
  "job.alio.go.kr",
  "www.job.alio.go.kr",
];

const unique = (values) => [...new Set(values.filter(Boolean))];

const decodeDdgUrl = (href) => {
  const decodedHref = decodeHtml(String(href ?? "").trim());
  if (!decodedHref) {
    return "";
  }

  try {
    const absoluteUrl = decodedHref.startsWith("//") ? `https:${decodedHref}` : decodedHref;
    const redirectUrl = new URL(absoluteUrl, searchBaseUrl);
    const targetUrl = redirectUrl.searchParams.get("uddg");
    return normalizeUrl(targetUrl ? decodeURIComponent(targetUrl) : redirectUrl.toString());
  } catch {
    return normalizeUrl(decodedHref);
  }
};

const normalizeHost = (value) => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const isOfficialMunicipalUrl = (url, profile) => {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  if (excludedNationalHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return false;
  }

  if (hostname.endsWith(".go.kr")) {
    return true;
  }

  return profile.officialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const buildSearchQueries = (queryText, profile) => {
  const trimmedQuery = String(queryText ?? "").trim();
  if (!trimmedQuery) {
    return [];
  }

  const focusTerms =
    profile.matchedType === "district"
      ? [profile.matchedLabel, profile.canonical]
      : [profile.canonical, profile.matchedLabel, ...profile.districts.slice(0, 3)];
  const domainTerms = profile.officialDomains.slice(0, 8).map((domain) => `site:${domain}`).join(" OR ");

  return unique([
    domainTerms ? `${trimmedQuery} (${domainTerms})` : "",
    [trimmedQuery, ...focusTerms].filter(Boolean).join(" "),
    profile.matchedType === "district" ? `${trimmedQuery} ${profile.matchedLabel}` : "",
  ]);
};

const buildResultText = (title, snippet, displayUrl, resolvedUrl) =>
  [title, snippet, displayUrl, resolvedUrl].map((value) => toText(value)).filter(Boolean).join(" ");

const matchesProfile = (text, profile) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return false;
  }

  return collectMunicipalSearchTerms(profile).some((term) => textKey.includes(compactSearchText(term)));
};

const parseResults = (html, profile, queryText) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(resultPattern)) {
    const resultUrl = decodeDdgUrl(match[1]);
    if (!resultUrl || seen.has(resultUrl) || !isOfficialMunicipalUrl(resultUrl, profile)) {
      continue;
    }

    const title = toText(match[2]);
    const displayUrl = toText(match[3]);
    const snippet = toText(match[4] ?? "");
    const searchableText = buildResultText(title, snippet, displayUrl, resultUrl);
    if (!matchesProfile(searchableText, profile)) {
      continue;
    }

    seen.add(resultUrl);
    const matchedLocations = extractMatchedLocations(searchableText, profile);
    const primaryLocation = matchedLocations.find((value) => value !== profile.canonical) ?? profile.canonical;

    items.push({
      sourceItemKey: resultUrl,
      pageUrl: resultUrl,
      canonicalUrl: resultUrl,
      sourceTitle: title,
      bodyText: [
        title,
        snippet,
        displayUrl,
        primaryLocation ? `기관 ${primaryLocation}` : "",
        profile.canonical ? `광역권 ${profile.canonical}` : "",
        queryText ? `검색어 ${queryText}` : "",
      ]
        .filter(Boolean)
        .join(". "),
      organizationHints: unique([primaryLocation, profile.canonical]),
      locationHints: matchedLocations.length > 0 ? matchedLocations : [profile.canonical],
      publishedAt: null,
      assets: [],
      matchText: searchableText,
    });
  }

  return items;
};

export class MunicipalOfficialSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, region = "" } = {}) {
    const trimmedQuery = String(queryText ?? "").trim();
    if (!trimmedQuery) {
      return [];
    }

    const profiles = getMunicipalSearchProfiles({
      region,
      text: [region, trimmedQuery].filter(Boolean).join(" "),
    });
    if (profiles.length === 0) {
      return [];
    }

    const parsedItems = [];
    for (const profile of profiles) {
      const queries = buildSearchQueries(trimmedQuery, profile);
      for (const searchQuery of queries) {
        try {
          const requestUrl = `${searchBaseUrl}?q=${encodeURIComponent(searchQuery)}`;
          const html = await fetchTextWithTimeout(requestUrl, this.timeoutMs);
          parsedItems.push(...parseResults(html, profile, trimmedQuery));
        } catch {
          // Ignore individual query failures and keep remaining sources usable.
        }
      }
    }

    const dedupedItems = [...new Map(parsedItems.map((item) => [item.canonicalUrl, item])).values()];
    return selectRankedResults(dedupedItems, trimmedQuery, { limit, requireQueryMatch });
  }
}
