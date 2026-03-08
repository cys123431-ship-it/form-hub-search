import { upsertParsedDocument } from "../crawl/crawl-state-helpers.js";
import { expandRecruitmentQueryVariants, recruitmentIntentTerms } from "../search/search-query.js";
import {
  expandOrganizationQueryVariants,
  splitOrganizationQueries,
} from "../search/search-organization.js";
import { normalizeSourceScope, sourceMatchesScope } from "../search/source-scope.js";
import { getMunicipalSearchProfiles, resolveNamedRegion, splitRegionQueries } from "../search/search-region.js";
import {
  buildLiveQueryCacheKey,
  createLiveQueryCacheRecord,
  getLiveQueryCacheEntry,
  isFreshLiveQueryCacheEntry,
  upsertLiveQueryCacheEntry,
} from "./live-query-cache.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const liveSourceType = "live_search";
const civilServiceTerms = ["공무원", "국가공무원", "지방공무원", "군무원", "임기제", "한시임기제"];
const formIntentTerms = [
  "양식",
  "서식",
  "template",
  "템플릿",
  "샘플",
  "예시",
  "이력서",
  "자소서",
  "자기소개서",
  "계약서",
  "제안서",
];
const daejeonParsers = new Set(["daejeon_job_event_live_search", "daejeon_gosi_live_search"]);
const municipalParsers = new Set(["municipal_official_search", "seoul_official_search"]);
const regionAwareParsers = new Set([
  "work24_live_search",
  "daejeon_job_event_live_search",
  "daejeon_gosi_live_search",
  "municipal_official_search",
  "seoul_official_search",
  "national_admin_board_search",
]);

const isCivilServiceRequest = (params) =>
  [...splitOrganizationQueries(params.organization), String(params.query ?? "").trim()].some((value) =>
    civilServiceTerms.some((term) => String(value ?? "").includes(term)),
  );

const isRecruitmentLikeRequest = (params) => {
  const combinedText = [params.query, params.organization, ...(params.tagSlugs ?? [])]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return (
    splitOrganizationQueries(params.organization).length > 0 ||
    recruitmentIntentTerms.some((term) => combinedText.includes(term))
  );
};

const isFormLikeRequest = (params) =>
  [params.query, params.organization, ...(params.tagSlugs ?? [])]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .some((value) => formIntentTerms.some((term) => value.includes(term)));

const isCorporateOfficialRequest = (params, sourceScope) => {
  if (sourceScope === "official_corporate") {
    return Boolean(String(params.query ?? "").trim() || String(params.organization ?? "").trim());
  }

  return splitOrganizationQueries(params.organization).length > 0 || isRecruitmentLikeRequest(params);
};

const isWholeWebRequest = (params, sourceScope) =>
  sourceScope === "whole_web"
    ? Boolean(String(params.query ?? "").trim() || String(params.organization ?? "").trim() || String(params.region ?? "").trim())
    : Boolean(String(params.query ?? "").trim());

const isMunicipalOfficialSearchRequest = (params) => {
  const queryText = String(params.query ?? "").trim();
  if (!queryText) {
    return false;
  }

  return (
    splitRegionQueries(params.region).length > 0 ||
    getMunicipalSearchProfiles({
      region: params.region,
      text: [params.query, params.organization].filter(Boolean).join(" "),
    }).length > 0
  );
};

const buildBaseSearchQuery = (params) =>
  joinQueryParts(String(params.organization ?? "").trim(), String(params.query ?? "").trim()) ||
  String(params.query ?? "").trim() ||
  String(params.organization ?? "").trim();

const buildFormQueries = (params) => {
  const queryText = String(params.query ?? "").trim();
  if (!queryText) {
    return [];
  }

  return unique([
    queryText,
    `${queryText} 양식`,
    `${queryText} 서식`,
  ]).slice(0, 3);
};

const buildCorporateQueries = (params) => {
  const baseQuery = buildBaseSearchQuery(params);
  if (!baseQuery) {
    return [];
  }

  return unique([baseQuery, `${baseQuery} 채용`, `${baseQuery} careers`]).slice(0, 3);
};

const buildWholeWebQueries = (params) => {
  const baseQuery = joinQueryParts(params.region, params.organization, params.query) || String(params.query ?? "").trim();
  return baseQuery ? [baseQuery] : [];
};

const joinQueryParts = (...parts) =>
  parts
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const buildLiveQueries = (params) => {
  const queryText = String(params.query ?? "").trim();
  const queryVariants = queryText ? expandRecruitmentQueryVariants(queryText).slice(0, 4) : [];
  const regionQueries = splitRegionQueries(params.region);
  const regionQuery = regionQueries.length === 1 ? regionQueries[0] : "";
  const organizationQueries = splitOrganizationQueries(params.organization);
  const expandedOrganizations = unique(
    organizationQueries.flatMap((entry) => [entry, ...expandOrganizationQueryVariants(entry)]),
  ).slice(0, 3);

  if (regionQuery && expandedOrganizations.length > 0 && queryVariants.length > 0) {
    return unique([
      ...queryVariants.slice(0, 3).map((variant) => joinQueryParts(regionQuery, expandedOrganizations[0], variant)),
      ...queryVariants.slice(0, 2).map((variant) => joinQueryParts(expandedOrganizations[0], variant)),
      ...queryVariants.slice(0, 2).map((variant) => joinQueryParts(regionQuery, variant)),
      joinQueryParts(regionQuery, expandedOrganizations[0]),
    ]).slice(0, 6);
  }

  if (regionQuery && queryVariants.length > 0) {
    return unique([
      ...queryVariants.slice(0, 3).map((variant) => joinQueryParts(regionQuery, variant)),
      ...queryVariants.slice(0, 2),
    ]).slice(0, 5);
  }

  if (regionQuery && expandedOrganizations.length > 0) {
    return unique([joinQueryParts(regionQuery, expandedOrganizations[0]), expandedOrganizations[0]]).slice(0, 4);
  }

  if (expandedOrganizations.length > 0 && queryVariants.length > 0) {
    return unique([
      ...expandedOrganizations
        .slice(0, 2)
        .flatMap((organization) => queryVariants.slice(0, 2).map((variant) => joinQueryParts(organization, variant))),
      ...expandedOrganizations.slice(0, 2),
      ...queryVariants.slice(0, 2),
    ]).slice(0, 6);
  }

  if (expandedOrganizations.length > 0) {
    return expandedOrganizations.slice(0, 3);
  }

  if (queryVariants.length > 0) {
    return unique([...queryVariants, ...expandOrganizationQueryVariants(queryText)]).slice(0, 4);
  }

  return [];
};

const buildWork24Queries = (params) => {
  const queryText = String(params.query ?? "").trim();
  const queryVariants = queryText ? expandRecruitmentQueryVariants(queryText).slice(0, 4) : [];
  const organizationQueries = splitOrganizationQueries(params.organization);
  const expandedOrganizations = unique(
    organizationQueries.flatMap((entry) => [entry, ...expandOrganizationQueryVariants(entry)]),
  ).slice(0, 2);

  if (expandedOrganizations.length > 0 && queryVariants.length > 0) {
    return unique([
      ...queryVariants.slice(0, 2).map((variant) => joinQueryParts(expandedOrganizations[0], variant)),
      ...queryVariants.slice(0, 2),
      ...expandedOrganizations,
    ]).slice(0, 5);
  }

  if (queryVariants.length > 0) {
    return queryVariants.slice(0, 3);
  }

  if (expandedOrganizations.length > 0) {
    return expandedOrganizations;
  }

  return [""];
};

const resolveSourceQueries = (source, params) => {
  if (source.parserKey === "municipal_official_search") {
    return String(params.query ?? "").trim() ? [String(params.query ?? "").trim()] : [];
  }

  if (source.parserKey === "seoul_official_search") {
    const region = resolveNamedRegion(params.region);
    const mentionsSeoul = [params.query, params.organization].some((value) => String(value ?? "").includes("서울"));
    if (region && region.canonical !== "서울특별시" && !mentionsSeoul) {
      return [];
    }

    return String(params.query ?? "").trim() ? [String(params.query ?? "").trim()] : [];
  }

  if (source.parserKey === "work24_live_search") {
    return buildWork24Queries(params);
  }

  if (source.parserKey === "national_admin_board_search") {
    return buildBaseSearchQuery(params) ? [buildBaseSearchQuery(params)] : [];
  }

  if (source.parserKey === "corporate_official_careers_search") {
    return buildCorporateQueries(params);
  }

  if (source.parserKey === "free_form_live_search") {
    return buildFormQueries(params);
  }

  if (source.parserKey === "whole_web_search") {
    return buildWholeWebQueries(params);
  }

  if (daejeonParsers.has(source.parserKey)) {
    const regionQuery = splitRegionQueries(params.region)[0] ?? "";
    const region = resolveNamedRegion(regionQuery);
    const mentionsDaejeon = [params.query, params.organization].some((value) => String(value ?? "").includes("대전"));
    if (region && region.canonical !== "대전광역시" && !mentionsDaejeon) {
      return [];
    }

    const liveQueries = buildLiveQueries(params);
    if (liveQueries.length > 0) {
      return liveQueries;
    }

    return region?.canonical === "대전광역시" ? ["채용"] : [];
  }

  return buildLiveQueries(params);
};

const getSourceCacheTtlMinutes = (source) => Math.max(5, Number(source.crawlIntervalMinutes) || 30);

export class LiveRecruitmentService {
  constructor({ repository, classificationService, adapterRegistry }) {
    this.repository = repository;
    this.classificationService = classificationService;
    this.adapterRegistry = adapterRegistry;
  }

  async hydrate(params) {
    const state = await this.repository.readState();
    const sourceScope = normalizeSourceScope(params.sourceScope);
    const startedAtMs = Date.now();
    const civilServiceRequest = isCivilServiceRequest(params);
    const recruitmentLikeRequest = isRecruitmentLikeRequest(params);
    const formLikeRequest = isFormLikeRequest(params);
    const corporateOfficialRequest = isCorporateOfficialRequest(params, sourceScope);
    const wholeWebRequest = isWholeWebRequest(params, sourceScope);
    const municipalOfficialSearchRequest = isMunicipalOfficialSearchRequest(params);
    const regionQueries = splitRegionQueries(params.region);
    const stats = {
      cacheHits: 0,
      fetchedQueries: 0,
      fetchedSources: 0,
      fetchedDocuments: 0,
      cacheMisses: 0,
      durationMs: 0,
    };
    const fetchedSourceIds = new Set();
    const liveSources = state.sourceSites.filter((source) => {
      if (source.sourceType !== liveSourceType || source.status !== "active") {
        return false;
      }
      if (!sourceMatchesScope(source, sourceScope)) {
        return false;
      }

      if (source.parserKey === "whole_web_search") {
        return wholeWebRequest;
      }

      if (source.parserKey === "free_form_live_search") {
        return formLikeRequest || sourceScope === "free_forms";
      }

      if (source.parserKey === "corporate_official_careers_search") {
        return corporateOfficialRequest;
      }

      if (source.parserKey === "national_admin_board_search") {
        return Boolean(String(params.query ?? "").trim() || String(params.organization ?? "").trim() || regionQueries.length > 0);
      }

      if (municipalParsers.has(source.parserKey)) {
        return municipalOfficialSearchRequest;
      }

      if (source.parserKey === "gojobs_live_search") {
        return civilServiceRequest;
      }

      return recruitmentLikeRequest;
    });
    if (liveSources.length === 0) {
      stats.durationMs = Date.now() - startedAtMs;
      return stats;
    }

    const organizationQueries = splitOrganizationQueries(params.organization);
    if (!String(params.query ?? "").trim() && !String(params.organization ?? "").trim() && regionQueries.length === 0) {
      stats.durationMs = Date.now() - startedAtMs;
      return stats;
    }

    const parsedDocuments = [];
    const cacheUpdates = [];
    const tasks = liveSources.flatMap((source) => {
      const adapter = this.adapterRegistry.get(source.parserKey);
      if (!adapter) {
        return [];
      }

      const sourceRegionQueries = regionAwareParsers.has(source.parserKey) && regionQueries.length > 0 ? regionQueries : [""];

      return sourceRegionQueries.flatMap((regionQuery) => {
        const sourceParams = { ...params, region: regionQuery };
        const liveQueries = resolveSourceQueries(source, sourceParams);
        if (liveQueries.length === 0) {
          return [];
        }

        return liveQueries.map(async (queryText) => {
          const cacheKey = buildLiveQueryCacheKey({
            sourceId: source.id,
            sourceScope,
            queryText,
            organization: params.organization,
            region: regionQuery,
          });
          const cacheEntry = getLiveQueryCacheEntry(state, cacheKey);
          if (isFreshLiveQueryCacheEntry(cacheEntry)) {
            stats.cacheHits += 1;
            return {
              sourceId: source.id,
              cacheRecord: null,
              documents: [],
            };
          }

          stats.cacheMisses += 1;
          const queryStartedAtMs = Date.now();
          try {
            const documents = await adapter.search(queryText, {
              limit: organizationQueries.length > 0 ? 6 : 8,
              requireQueryMatch: organizationQueries.length > 0 || Boolean(params.query.trim()),
              region: regionQuery,
              organization: params.organization,
            });
            const cacheRecord = createLiveQueryCacheRecord({
              sourceId: source.id,
              sourceScope,
              queryText,
              organization: params.organization,
              region: regionQuery,
              ttlMinutes: getSourceCacheTtlMinutes(source),
              resultCount: documents.length,
              durationMs: Date.now() - queryStartedAtMs,
              status: "succeeded",
            });
            return {
              sourceId: source.id,
              cacheRecord,
              documents,
            };
          } catch {
            return {
              sourceId: source.id,
              cacheRecord: createLiveQueryCacheRecord({
                sourceId: source.id,
                sourceScope,
                queryText,
                organization: params.organization,
                region: regionQuery,
                ttlMinutes: 5,
                resultCount: 0,
                durationMs: Date.now() - queryStartedAtMs,
                status: "failed",
                lastError: "search_failed",
              }),
              documents: [],
            };
          }
        });
      });
    });

    const taskResults = await Promise.all(tasks);
    taskResults.forEach((entry) => {
      if (!entry) {
        return;
      }

      if (entry.cacheRecord) {
        cacheUpdates.push(entry.cacheRecord);
        stats.fetchedQueries += 1;
        if (entry.documents.length > 0) {
          fetchedSourceIds.add(entry.sourceId);
        }
      }

      entry.documents.forEach((document) => {
        parsedDocuments.push({ sourceId: entry.sourceId, document });
      });
    });
    stats.fetchedDocuments = parsedDocuments.length;
    stats.fetchedSources = fetchedSourceIds.size;

    await this.repository.updateState(async (draftState) => {
      parsedDocuments.forEach(({ sourceId, document: parsedDocument }) => {
        const source = draftState.sourceSites.find((entry) => entry.id === sourceId);
        if (!source) {
          return;
        }

        const result = upsertParsedDocument(draftState, source, parsedDocument);
        this.classificationService.classifyDocument(draftState, result.documentId);
      });

      cacheUpdates.forEach((cacheRecord) => {
        upsertLiveQueryCacheEntry(draftState, cacheRecord);
      });
    });

    stats.durationMs = Date.now() - startedAtMs;
    return stats;
  }
}
