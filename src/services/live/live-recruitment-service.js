import { upsertParsedDocument } from "../crawl/crawl-state-helpers.js";
import { expandRecruitmentQueryVariants, recruitmentIntentTerms } from "../search/search-query.js";
import {
  expandOrganizationQueryVariants,
  splitOrganizationQueries,
} from "../search/search-organization.js";
import { getMunicipalSearchProfiles, resolveNamedRegion, splitRegionQueries } from "../search/search-region.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const liveSourceType = "live_search";
const civilServiceTerms = ["공무원", "국가공무원", "지방공무원", "군무원", "임기제", "한시임기제"];
const daejeonParsers = new Set(["daejeon_job_event_live_search", "daejeon_gosi_live_search"]);
const municipalParsers = new Set(["municipal_official_search", "seoul_official_search"]);
const regionAwareParsers = new Set([
  "work24_live_search",
  "daejeon_job_event_live_search",
  "daejeon_gosi_live_search",
  "municipal_official_search",
  "seoul_official_search",
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

export class LiveRecruitmentService {
  constructor({ repository, classificationService, adapterRegistry }) {
    this.repository = repository;
    this.classificationService = classificationService;
    this.adapterRegistry = adapterRegistry;
  }

  async hydrate(params) {
    const state = await this.repository.readState();
    const civilServiceRequest = isCivilServiceRequest(params);
    const recruitmentLikeRequest = isRecruitmentLikeRequest(params);
    const municipalOfficialSearchRequest = isMunicipalOfficialSearchRequest(params);
    const regionQueries = splitRegionQueries(params.region);
    const liveSources = state.sourceSites.filter((source) => {
      if (source.sourceType !== liveSourceType || source.status !== "active") {
        return false;
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
      return;
    }

    const organizationQueries = splitOrganizationQueries(params.organization);
    if (!String(params.query ?? "").trim() && !String(params.organization ?? "").trim() && regionQueries.length === 0) {
      return;
    }

    const parsedDocuments = [];
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
          try {
            const documents = await adapter.search(queryText, {
              limit: organizationQueries.length > 0 ? 6 : 8,
              requireQueryMatch: organizationQueries.length > 0 || Boolean(params.query.trim()),
              region: regionQuery,
            });
            return documents.map((document) => ({ sourceId: source.id, document }));
          } catch {
            return [];
          }
        });
      });
    });

    const taskResults = await Promise.all(tasks);
    taskResults.forEach((entries) => {
      parsedDocuments.push(...entries);
    });

    if (parsedDocuments.length === 0) {
      return;
    }

    await this.repository.updateState(async (draftState) => {
      parsedDocuments.forEach(({ sourceId, document: parsedDocument }) => {
        const source = draftState.sourceSites.find((entry) => entry.id === sourceId);
        if (!source) {
          return;
        }

        const result = upsertParsedDocument(draftState, source, parsedDocument);
        this.classificationService.classifyDocument(draftState, result.documentId);
      });
    });
  }
}
