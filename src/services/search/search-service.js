import { compactSearchText, splitQueryTokens } from "../../utils/normalize.js";
import {
  buildOrganizationAliasMap,
  matchesAnyOrganizationQuery,
  matchesOrganizationText,
  splitOrganizationQueries,
} from "./search-organization.js";
import {
  buildQueryTokenGroups,
  matchesAnySearchTerm,
  matchesQueryTokenGroups,
  recruitmentIntentTerms,
} from "./search-query.js";
import { localGovernmentParserKeys, normalizeSourceScope, resolveSourceScopes, sourceMatchesScope } from "./source-scope.js";
import { matchesAnyRegionQuery, matchesRegionText, splitRegionQueries } from "./search-region.js";

const toPageNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const civilServiceTerms = ["공무원", "국가공무원", "지방공무원", "군무원", "임기제", "한시임기제"];
const civilServicePenaltyTerms = ["학원", "강사", "상조"];
const publicCompanyTerms = ["공기업", "공공기관", "alio", "알리오"];
const municipalGeneralSourceParsers = new Set([...localGovernmentParserKeys]);
const sourceScopeLabelMap = {
  all: "통합검색",
  job_portals: "민간 채용 포털",
  official_corporate: "기업 공식 채용",
  public_recruitment: "공공 채용",
  local_government: "전국 행정기관",
  free_forms: "무료 양식",
  whole_web: "웹 전체",
};

export const parseSearchParams = (url) => {
  const tagSlugs = (url.searchParams.get("tagSlugs") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const tagMode = url.searchParams.get("tagMode") === "or" ? "or" : "and";
  const sort = ["latest", "sourceTrust"].includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "relevance";

  return {
    query: url.searchParams.get("query") ?? "",
    organization: url.searchParams.get("organization") ?? "",
    region: url.searchParams.get("region") ?? "",
    sourceScope: normalizeSourceScope(url.searchParams.get("sourceScope")),
    recruitmentKind: url.searchParams.get("recruitmentKind") ?? "",
    fileType: url.searchParams.get("fileType") ?? "",
    tagSlugs,
    tagMode,
    sort,
    page: toPageNumber(url.searchParams.get("page"), 1),
    pageSize: Math.min(toPageNumber(url.searchParams.get("pageSize"), 12), 50),
  };
};

export const matchesTagMode = (documentTagSlugs, selectedTagSlugs, tagMode) => {
  if (selectedTagSlugs.length === 0) {
    return true;
  }

  if (tagMode === "or") {
    return selectedTagSlugs.some((slug) => documentTagSlugs.includes(slug));
  }

  return selectedTagSlugs.every((slug) => documentTagSlugs.includes(slug));
};

const getPrimaryOccurrence = (state, documentId) =>
  state.documentOccurrences.find((entry) => entry.documentId === documentId && entry.isPrimary) ??
  state.documentOccurrences.find((entry) => entry.documentId === documentId);

const getPrimarySourceSite = (state, documentId) => {
  const occurrence = getPrimaryOccurrence(state, documentId);
  return occurrence ? state.sourceSites.find((entry) => entry.id === occurrence.sourceId) ?? null : null;
};

const getPrimarySource = (state, documentId) => {
  const occurrence = getPrimaryOccurrence(state, documentId);
  if (!occurrence) {
    return null;
  }

  const source = state.sourceSites.find((entry) => entry.id === occurrence.sourceId);
  const sourceScope = [...resolveSourceScopes(source)][0] ?? "all";
  return {
    name: source?.name ?? "알 수 없는 출처",
    url: occurrence.pageUrl,
    trustScore: source?.trustScore ?? 0,
    sourceScope,
    sourceScopeLabel: sourceScopeLabelMap[sourceScope] ?? "통합검색",
    parserKey: source?.parserKey ?? null,
    policyNote: source?.policyNote ?? "",
    accessMode: occurrence.accessPolicy ?? (source?.allowCache ? "cached_file_allowed" : source?.allowPreview ? "cached_preview_allowed" : "link_only"),
  };
};

const getPrimaryContent = (state, documentId) => {
  const occurrence = getPrimaryOccurrence(state, documentId);
  if (!occurrence) {
    return null;
  }

  return (
    (state.documentContents ?? [])
      .filter((entry) => entry.occurrenceId === occurrence.id)
      .sort((left, right) => right.versionNo - left.versionNo)[0] ?? null
  );
};

const getDocumentContext = (state, document) => {
  const occurrences = state.documentOccurrences.filter((entry) => entry.documentId === document.id);
  const documentTags = state.documentTags.filter((entry) => entry.documentId === document.id);
  const documentTagIds = new Set(documentTags.map((entry) => entry.tagId));
  const tags = state.tags.filter((tag) => documentTagIds.has(tag.id));
  const structuredOrganizations = state.documentOrganizations
    .filter((entry) => entry.documentId === document.id)
    .map((entry) => state.organizations.find((organization) => organization.id === entry.organizationId))
    .filter(Boolean);
  const fallbackOrganizations = occurrences
    .flatMap((entry) => entry.organizationHints ?? [])
    .map((name) => normalizeOrganizationName(name))
    .filter(Boolean);
  const organizations = mergeOrganizations(structuredOrganizations, fallbackOrganizations);
  const locations = [...new Set(occurrences.flatMap((entry) => entry.locationHints ?? []).map((value) => String(value).trim()).filter(Boolean))];
  const fileTypes = [...new Set(occurrences.map((entry) => entry.fileType).filter(Boolean))];
  const recruitmentProfile = state.recruitmentProfiles.find((entry) => entry.documentId === document.id) ?? null;

  return { tags, organizations, locations, fileTypes, recruitmentProfile };
};

const normalizeOrganizationName = (value) => String(value ?? "").trim();

const mergeOrganizations = (structuredOrganizations, fallbackNames) => {
  const merged = new Map();

  structuredOrganizations.forEach((organization) => {
    merged.set(compactSearchText(organization.name), organization);
  });

  fallbackNames.forEach((name) => {
    const normalizedName = compactSearchText(name);
    if (!normalizedName || merged.has(normalizedName)) {
      return;
    }

    merged.set(normalizedName, {
      id: `external:${normalizedName}`,
      name,
      organizationType: "external",
    });
  });

  return [...merged.values()];
};

const includesAnyText = (text, patterns) => matchesAnySearchTerm(text, patterns);

const isCivilServiceSearch = ({ queryTokens, organizationQueries, tagSlugs }) =>
  tagSlugs.includes("civil-service") ||
  queryTokens.some((token) => includesAnyText(token, civilServiceTerms)) ||
  organizationQueries.some((query) => includesAnyText(query, civilServiceTerms));

const isPublicCompanySearch = ({ queryTokens, organizationQueries, tagSlugs }) =>
  tagSlugs.includes("public-company") ||
  queryTokens.some((token) => includesAnyText(token, publicCompanyTerms)) ||
  organizationQueries.some((query) => includesAnyText(query, publicCompanyTerms));

const isRecruitmentIntent = ({ queryTokens, organizationQueries, tagSlugs }) =>
  tagSlugs.includes("recruitment") ||
  queryTokens.some((token) => includesAnyText(token, recruitmentIntentTerms)) ||
  organizationQueries.length > 0;

const isMunicipalGeneralSearch = ({ queryTokens, organizationQueries, regionQueries, tagSlugs }) =>
  regionQueries.length > 0 &&
  queryTokens.length > 0 &&
  organizationQueries.length === 0 &&
  !isRecruitmentIntent({ queryTokens, organizationQueries, tagSlugs });

export const computeRelevance = ({
  document,
  queryTokens,
  queryTokenGroups,
  organizationQueries,
  regionQueries = [],
  organizationAliasMap,
  tagSlugs,
  context,
  state,
}) => {
  let score = 0;
  const tagMatches = context.tags.map((tag) => tag.slug);
  const primarySource = getPrimarySource(state, document.id);
  const civilServiceSearch = isCivilServiceSearch({ queryTokens, organizationQueries, tagSlugs });
  const publicCompanySearch = isPublicCompanySearch({ queryTokens, organizationQueries, tagSlugs });
  const municipalGeneralSearch = isMunicipalGeneralSearch({
    queryTokens,
    organizationQueries,
    regionQueries,
    tagSlugs,
  });
  const resolvedQueryTokenGroups =
    queryTokenGroups && queryTokenGroups.length > 0 ? queryTokenGroups : buildQueryTokenGroups(queryTokens);

  if (tagSlugs.some((slug) => tagMatches.includes(slug))) {
    score += 30;
  }
  if (resolvedQueryTokenGroups.length > 0 && matchesQueryTokenGroups(document.representativeTitle, resolvedQueryTokenGroups)) {
    score += 20;
  }
  if (resolvedQueryTokenGroups.length > 0 && matchesQueryTokenGroups(document.searchText, resolvedQueryTokenGroups)) {
    score += 10;
  }
  if (
    organizationQueries.length > 0 &&
    context.organizations.some((organization) =>
      matchesAnyOrganizationQuery(organization, organizationQueries, organizationAliasMap),
    )
  ) {
    score += 50;
  } else if (organizationQueries.length > 0 && matchesOrganizationText(document.searchText, organizationQueries)) {
    score += 25;
  }
  if (primarySource) {
    score += Math.round(primarySource.trustScore * 10);
  }
  if (regionQueries.length > 0 && (matchesAnyRegionQuery(context.locations ?? [], regionQueries) || matchesRegionText(document.searchText, regionQueries))) {
    score += 28;
  }
  if (civilServiceSearch && tagMatches.includes("civil-service")) {
    score += 35;
  }
  if (civilServiceSearch && primarySource?.name.includes("나라일터")) {
    score += 40;
  }
  if (civilServiceSearch && includesAnyText(document.searchText, civilServicePenaltyTerms)) {
    score -= 25;
  }
  if (publicCompanySearch && tagMatches.includes("public-company")) {
    score += 30;
  }
  if (publicCompanySearch && primarySource?.name.includes("JOB-ALIO")) {
    score += 35;
  }
  if (municipalGeneralSearch && primarySource?.name.includes("공식 사이트 검색")) {
    score += 45;
  }
  if (municipalGeneralSearch && primarySource?.name.includes("서울특별시 통합검색")) {
    score += 45;
  }
  if (municipalGeneralSearch && tagMatches.includes("recruitment")) {
    score -= 25;
  }
  return score;
};

const buildFacets = (items, documents) => {
  const tagCounts = new Map();
  const organizationCounts = new Map();

  items.forEach((item, index) => {
    item.tags.forEach((tagName) => {
      const matchedDocument = documents[index];
      const matchedTag = matchedDocument.context.tags.find((tag) => tag.name === tagName);
      const current = tagCounts.get(tagName) ?? { slug: matchedTag?.slug ?? tagName, name: tagName, count: 0 };
      current.count += 1;
      tagCounts.set(tagName, current);
    });
    item.organizations.forEach((name) => {
      organizationCounts.set(name, (organizationCounts.get(name) ?? 0) + 1);
    });
  });

  return {
    tags: [...tagCounts.values()],
    organizations: [...organizationCounts.entries()].map(([name, count]) => ({ name, count })),
  };
};

const buildPreviewSnippet = (text, rawTerms) => {
  const normalizedText = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return "";
  }

  const terms = [...new Set(rawTerms.map((value) => String(value ?? "").trim()).filter((value) => value.length >= 2))];
  const lowerText = normalizedText.toLowerCase();
  let firstMatchIndex = -1;

  terms.forEach((term) => {
    const matchIndex = lowerText.indexOf(term.toLowerCase());
    if (matchIndex >= 0 && (firstMatchIndex === -1 || matchIndex < firstMatchIndex)) {
      firstMatchIndex = matchIndex;
    }
  });

  if (firstMatchIndex === -1) {
    return normalizedText.length > 220 ? `${normalizedText.slice(0, 220).trim()}...` : normalizedText;
  }

  const startIndex = Math.max(0, firstMatchIndex - 80);
  const endIndex = Math.min(normalizedText.length, firstMatchIndex + 160);
  const prefix = startIndex > 0 ? "..." : "";
  const suffix = endIndex < normalizedText.length ? "..." : "";
  return `${prefix}${normalizedText.slice(startIndex, endIndex).trim()}${suffix}`;
};

const buildSearchItem = (state, document, context, searchContext) => {
  const primarySource = getPrimarySource(state, document.id);
  const primaryContent = getPrimaryContent(state, document.id);
  const previewText = buildPreviewSnippet(
    primaryContent?.cleanedText ?? document.searchText ?? document.representativeSummary ?? document.representativeTitle,
    [...searchContext.queryTokens, ...searchContext.organizationQueries, ...searchContext.regionQueries, document.representativeTitle],
  );

  return {
    id: document.id,
    title: document.representativeTitle,
    summary: document.representativeSummary,
    previewText,
    tags: context.tags.map((tag) => tag.name),
    organizations: context.organizations.map((organization) => organization.name),
    locations: context.locations,
    publishedAt: document.publishedAt,
    fileTypes: context.fileTypes,
    recruitmentKind: context.recruitmentProfile?.recruitmentKind ?? null,
    previewAvailable: Boolean(document.representativeSummary || previewText),
    qualityScore: document.qualityScore,
    sourceCount: document.sourceCount,
    primarySource,
    sourceScope: primarySource?.sourceScope ?? "all",
    sourceScopeLabel: primarySource?.sourceScopeLabel ?? sourceScopeLabelMap.all,
  };
};

export class SearchService {
  constructor(repository, liveRecruitmentService = null) {
    this.repository = repository;
    this.liveRecruitmentService = liveRecruitmentService;
  }

  async search(params) {
    const startedAtMs = Date.now();
    let liveHydration = null;
    if (
      this.liveRecruitmentService &&
      (String(params.query ?? "").trim() || String(params.organization ?? "").trim() || String(params.region ?? "").trim())
    ) {
      try {
        liveHydration = await this.liveRecruitmentService.hydrate(params);
      } catch {
        // Live lookup should not block local catalog search.
      }
    }

    const state = await this.repository.readState();
    const queryTokens = splitQueryTokens(params.query);
    const queryTokenGroups = buildQueryTokenGroups(queryTokens);
    const organizationQueries = splitOrganizationQueries(params.organization);
    const regionQueries = splitRegionQueries(params.region);
    const organizationAliasMap = buildOrganizationAliasMap(state);
    const normalizedSourceScope = normalizeSourceScope(params.sourceScope);
    const municipalGeneralSearch = isMunicipalGeneralSearch({
      queryTokens,
      organizationQueries,
      regionQueries,
      tagSlugs: params.tagSlugs,
    });

    const matchedDocuments = state.documents
      .filter((document) => document.visibilityStatus === "active" && document.reviewStatus === "approved")
      .map((document) => ({ document, context: getDocumentContext(state, document) }))
      .filter(({ document }) => sourceMatchesScope(getPrimarySourceSite(state, document.id), normalizedSourceScope))
      .filter(({ document }) =>
        municipalGeneralSearch && normalizedSourceScope !== "whole_web"
          ? municipalGeneralSourceParsers.has(getPrimarySourceSite(state, document.id)?.parserKey)
          : true,
      )
      .filter(({ document, context }) => matchesTagMode(context.tags.map((tag) => tag.slug), params.tagSlugs, params.tagMode))
      .filter(({ document, context }) =>
        organizationQueries.length > 0
          ? context.organizations.some((organization) =>
              matchesAnyOrganizationQuery(organization, organizationQueries, organizationAliasMap),
            ) || matchesOrganizationText(document.searchText, organizationQueries)
          : true,
      )
      .filter(({ document, context }) =>
        regionQueries.length > 0
          ? matchesAnyRegionQuery(context.locations ?? [], regionQueries) || matchesRegionText(document.searchText, regionQueries)
          : true,
      )
      .filter(({ context }) => (params.fileType ? context.fileTypes.includes(params.fileType) : true))
      .filter(({ context }) =>
        params.recruitmentKind
          ? context.recruitmentProfile?.recruitmentKind === params.recruitmentKind
          : true,
      )
      .filter(({ document }) =>
        queryTokenGroups.length > 0 ? matchesQueryTokenGroups(document.searchText, queryTokenGroups) : true,
      )
      .map(({ document, context }) => ({
        document,
        context,
        relevance: computeRelevance({
          document,
          queryTokens,
          queryTokenGroups,
          organizationQueries,
          regionQueries,
          organizationAliasMap,
          tagSlugs: params.tagSlugs,
          context,
          state,
        }),
        sourceTrust: getPrimarySource(state, document.id)?.trustScore ?? 0,
      }));

    matchedDocuments.sort((left, right) => {
      if (params.sort === "latest") {
        return (right.document.publishedAt ?? "").localeCompare(left.document.publishedAt ?? "");
      }
      if (params.sort === "sourceTrust") {
        return right.sourceTrust - left.sourceTrust || right.relevance - left.relevance;
      }
      return right.relevance - left.relevance || (right.document.publishedAt ?? "").localeCompare(left.document.publishedAt ?? "");
    });

    const totalItems = matchedDocuments.length;
    const startIndex = (params.page - 1) * params.pageSize;
    const pageItems = matchedDocuments.slice(startIndex, startIndex + params.pageSize);
    const searchContext = { queryTokens, organizationQueries, regionQueries };
    const serializedItems = pageItems.map(({ document, context }) => buildSearchItem(state, document, context, searchContext));

    return {
      items: serializedItems,
      page: {
        current: params.page,
        pageSize: params.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / params.pageSize)),
      },
      facets: buildFacets(
        matchedDocuments.map(({ document, context }) => buildSearchItem(state, document, context, searchContext)),
        matchedDocuments,
      ),
      meta: {
        durationMs: Date.now() - startedAtMs,
        sourceScope: normalizedSourceScope,
        sourceScopeLabel: sourceScopeLabelMap[normalizedSourceScope] ?? sourceScopeLabelMap.all,
        liveHydration: liveHydration ?? {
          cacheHits: 0,
          cacheMisses: 0,
          fetchedQueries: 0,
          fetchedSources: 0,
          fetchedDocuments: 0,
          durationMs: 0,
        },
      },
    };
  }

  async getDocumentDetail(documentId) {
    const state = await this.repository.readState();
    const document = state.documents.find((entry) => entry.id === documentId);
    if (!document) {
      return null;
    }

    const context = getDocumentContext(state, document);
    const occurrences = state.documentOccurrences
      .filter((entry) => entry.documentId === document.id)
      .map((occurrence) => ({
        id: occurrence.id,
        title: occurrence.sourceTitle,
        url: occurrence.pageUrl,
        fileType: occurrence.fileType,
        accessPolicy: occurrence.accessPolicy,
        publishedAt: occurrence.sourcePublishedAt,
        isPrimary: occurrence.isPrimary,
        source: state.sourceSites.find((source) => source.id === occurrence.sourceId)?.name ?? "알 수 없는 출처",
        assets: (state.documentAssets ?? [])
          .filter((asset) => asset.occurrenceId === occurrence.id)
          .map((asset) => ({ name: asset.fileName, url: asset.sourceUrl, accessPolicy: asset.accessPolicy })),
        previewText:
          (state.documentContents ?? []).find(
            (content) => content.occurrenceId === occurrence.id && content.extractionStatus === "succeeded",
          )
            ?.cleanedText ?? "",
      }));

    return {
      id: document.id,
      title: document.representativeTitle,
      summary: document.representativeSummary,
      previewText: buildPreviewSnippet(
        (state.documentContents ?? [])
          .filter((entry) => occurrences.some((occurrence) => occurrence.id === entry.occurrenceId))
          .map((entry) => entry.cleanedText ?? "")
          .join(" "),
        [document.representativeTitle, ...context.organizations.map((organization) => organization.name)],
      ),
      tags: context.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
      organizations: context.organizations.map((organization) => organization.name),
      locations: context.locations,
      reviewStatus: document.reviewStatus,
      qualityScore: document.qualityScore,
      publishedAt: document.publishedAt,
      recruitmentProfile: context.recruitmentProfile,
      primarySource: getPrimarySource(state, document.id),
      sources: occurrences,
    };
  }

  async listTags() {
    const state = await this.repository.readState();
    return state.tags.filter((tag) => tag.isActive).map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      tagGroup: tag.tagGroup,
    }));
  }

  async listOrganizations() {
    const state = await this.repository.readState();
    return state.organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      organizationType: organization.organizationType,
    }));
  }
}
