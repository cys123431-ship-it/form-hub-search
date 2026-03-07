import { compactSearchText, hasAllTokens, splitQueryTokens } from "../../utils/normalize.js";

const toPageNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    recruitmentKind: url.searchParams.get("recruitmentKind") ?? "",
    fileType: url.searchParams.get("fileType") ?? "",
    tagSlugs,
    tagMode,
    sort,
    page: toPageNumber(url.searchParams.get("page"), 1),
    pageSize: Math.min(toPageNumber(url.searchParams.get("pageSize"), 12), 50),
  };
};

const splitOrganizationQueries = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

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

const buildOrganizationAliasMap = (state) =>
  state.organizationAliases.reduce((aliasMap, alias) => {
    const bucket = aliasMap.get(alias.organizationId) ?? [];
    bucket.push(alias.normalizedAlias);
    aliasMap.set(alias.organizationId, bucket);
    return aliasMap;
  }, new Map());

const matchesOrganizationQuery = (organization, organizationQuery, aliasMap) => {
  const normalizedQuery = compactSearchText(organizationQuery);
  if (!normalizedQuery) {
    return true;
  }

  if (compactSearchText(organization.name).includes(normalizedQuery)) {
    return true;
  }

  return (aliasMap.get(organization.id) ?? []).some((alias) => alias.includes(normalizedQuery));
};

const matchesAnyOrganizationQuery = (organization, organizationQueries, aliasMap) =>
  organizationQueries.some((organizationQuery) => matchesOrganizationQuery(organization, organizationQuery, aliasMap));

const getPrimarySource = (state, documentId) => {
  const occurrence = getPrimaryOccurrence(state, documentId);
  if (!occurrence) {
    return null;
  }

  const source = state.sourceSites.find((entry) => entry.id === occurrence.sourceId);
  return {
    name: source?.name ?? "알 수 없는 출처",
    url: occurrence.pageUrl,
    trustScore: source?.trustScore ?? 0,
  };
};

const getDocumentContext = (state, document) => {
  const documentTags = state.documentTags.filter((entry) => entry.documentId === document.id);
  const documentTagIds = new Set(documentTags.map((entry) => entry.tagId));
  const tags = state.tags.filter((tag) => documentTagIds.has(tag.id));
  const organizations = state.documentOrganizations
    .filter((entry) => entry.documentId === document.id)
    .map((entry) => state.organizations.find((organization) => organization.id === entry.organizationId))
    .filter(Boolean);
  const occurrences = state.documentOccurrences.filter((entry) => entry.documentId === document.id);
  const fileTypes = [...new Set(occurrences.map((entry) => entry.fileType).filter(Boolean))];
  const recruitmentProfile = state.recruitmentProfiles.find((entry) => entry.documentId === document.id) ?? null;

  return { tags, organizations, fileTypes, recruitmentProfile };
};

export const computeRelevance = ({ document, queryTokens, organizationQueries, organizationAliasMap, tagSlugs, context, state }) => {
  let score = 0;
  const tagMatches = context.tags.map((tag) => tag.slug);
  const primarySource = getPrimarySource(state, document.id);

  if (tagSlugs.some((slug) => tagMatches.includes(slug))) {
    score += 30;
  }
  if (queryTokens.length > 0 && hasAllTokens(document.representativeTitle, queryTokens)) {
    score += 20;
  }
  if (queryTokens.length > 0 && hasAllTokens(document.searchText, queryTokens)) {
    score += 10;
  }
  if (
    organizationQueries.length > 0 &&
    context.organizations.some((organization) =>
      matchesAnyOrganizationQuery(organization, organizationQueries, organizationAliasMap),
    )
  ) {
    score += 50;
  }
  if (primarySource) {
    score += Math.round(primarySource.trustScore * 10);
  }
  return score;
};

const buildSearchItem = (state, document, context) => ({
  id: document.id,
  title: document.representativeTitle,
  summary: document.representativeSummary,
  tags: context.tags.map((tag) => tag.name),
  organizations: context.organizations.map((organization) => organization.name),
  publishedAt: document.publishedAt,
  fileTypes: context.fileTypes,
  previewAvailable: Boolean(document.representativeSummary),
  primarySource: getPrimarySource(state, document.id),
});

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

export class SearchService {
  constructor(repository) {
    this.repository = repository;
  }

  async search(params) {
    const state = await this.repository.readState();
    const queryTokens = splitQueryTokens(params.query);
    const organizationQueries = splitOrganizationQueries(params.organization);
    const organizationAliasMap = buildOrganizationAliasMap(state);

    const matchedDocuments = state.documents
      .filter((document) => document.visibilityStatus === "active" && document.reviewStatus === "approved")
      .map((document) => ({ document, context: getDocumentContext(state, document) }))
      .filter(({ document, context }) => matchesTagMode(context.tags.map((tag) => tag.slug), params.tagSlugs, params.tagMode))
      .filter(({ context }) =>
        organizationQueries.length > 0
          ? context.organizations.some((organization) =>
              matchesAnyOrganizationQuery(organization, organizationQueries, organizationAliasMap),
            )
          : true,
      )
      .filter(({ context }) => (params.fileType ? context.fileTypes.includes(params.fileType) : true))
      .filter(({ context }) =>
        params.recruitmentKind
          ? context.recruitmentProfile?.recruitmentKind === params.recruitmentKind
          : true,
      )
      .filter(({ document }) => (queryTokens.length > 0 ? hasAllTokens(document.searchText, queryTokens) : true))
      .map(({ document, context }) => ({
        document,
        context,
        relevance: computeRelevance({
          document,
          queryTokens,
          organizationQueries,
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
    const serializedItems = pageItems.map(({ document, context }) => buildSearchItem(state, document, context));

    return {
      items: serializedItems,
      page: {
        current: params.page,
        pageSize: params.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / params.pageSize)),
      },
      facets: buildFacets(
        matchedDocuments.map(({ document, context }) => buildSearchItem(state, document, context)),
        matchedDocuments,
      ),
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
        publishedAt: occurrence.sourcePublishedAt,
        isPrimary: occurrence.isPrimary,
        source: state.sourceSites.find((source) => source.id === occurrence.sourceId)?.name ?? "알 수 없는 출처",
        assets: state.documentAssets
          .filter((asset) => asset.occurrenceId === occurrence.id)
          .map((asset) => ({ name: asset.fileName, url: asset.sourceUrl, accessPolicy: asset.accessPolicy })),
        previewText:
          state.documentContents.find((content) => content.occurrenceId === occurrence.id && content.extractionStatus === "succeeded")
            ?.cleanedText ?? "",
      }));

    return {
      id: document.id,
      title: document.representativeTitle,
      summary: document.representativeSummary,
      tags: context.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
      organizations: context.organizations.map((organization) => organization.name),
      reviewStatus: document.reviewStatus,
      qualityScore: document.qualityScore,
      publishedAt: document.publishedAt,
      recruitmentProfile: context.recruitmentProfile,
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
