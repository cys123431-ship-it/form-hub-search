import {
  buildSummary,
  calculateQualityScore,
  deriveRecruitmentProfile,
  deriveReviewStatus,
  resolveOrganizations,
  scoreTagRules,
} from "./rules.js";
import { compactSearchText } from "../../utils/normalize.js";
import { matchesAnySearchTerm, publicEmploymentTerms } from "../search/search-query.js";

const now = () => new Date().toISOString();

const latestContentForOccurrence = (state, occurrenceId) =>
  state.documentContents
    .filter((entry) => entry.occurrenceId === occurrenceId)
    .sort((left, right) => right.versionNo - left.versionNo)[0] ?? null;

const getSourceTrust = (state, sourceId) => state.sourceSites.find((source) => source.id === sourceId)?.trustScore ?? 0;
const tagOptionalApprovalParsers = new Set([
  "municipal_official_search",
  "seoul_official_search",
  "national_admin_board_search",
  "whole_web_search",
]);

const choosePrimaryOccurrence = (state, occurrences) =>
  [...occurrences].sort((left, right) => {
    const trustDiff = getSourceTrust(state, right.sourceId) - getSourceTrust(state, left.sourceId);
    if (trustDiff !== 0) {
      return trustDiff;
    }
    return (right.sourcePublishedAt ?? "").localeCompare(left.sourcePublishedAt ?? "");
  })[0] ?? null;

const synchronizeDocumentTags = (state, documentId, tagIds) => {
  state.documentTags = state.documentTags.filter((entry) => entry.documentId !== documentId);
  tagIds.forEach((tagId, index) => {
    state.documentTags.push({
      documentId,
      tagId,
      assignmentMethod: "rule",
      confidence: 1,
      isPrimary: index === 0,
      createdAt: now(),
      updatedAt: now(),
    });
  });
};

const synchronizeOrganizations = (state, documentId, organizations) => {
  state.documentOrganizations = state.documentOrganizations.filter((entry) => entry.documentId !== documentId);
  organizations.forEach((organization, index) => {
    state.documentOrganizations.push({
      documentId,
      organizationId: organization.id,
      relationType: "recruiter",
      confidence: 1,
      isPrimary: index === 0,
      createdAt: now(),
    });
  });
};

const synchronizeRecruitmentProfile = (state, documentId, profile) => {
  state.recruitmentProfiles = state.recruitmentProfiles.filter((entry) => entry.documentId !== documentId);
  if (!profile) {
    return;
  }

  state.recruitmentProfiles.push({
    documentId,
    recruitmentKind: profile.recruitmentKind,
    seasonLabel: profile.seasonLabel,
    employmentTrack: profile.employmentTrack,
    applyStartAt: null,
    applyEndAt: null,
    postingUrl: null,
    externalApplyUrl: null,
    createdAt: now(),
    updatedAt: now(),
  });
};

const applyOrganizationTypeTags = (scores, organizations, tags) => {
  const slugToId = new Map(tags.map((tag) => [tag.slug, tag.id]));

  if (organizations.some((organization) => organization.organizationType === "bank")) {
    scores[slugToId.get("banking")] = Math.max(scores[slugToId.get("banking")] ?? 0, 1.1);
  }
  if (organizations.some((organization) => organization.organizationType === "public_company")) {
    scores[slugToId.get("public-company")] = Math.max(scores[slugToId.get("public-company")] ?? 0, 1.1);
  }
};

const applyPublicEmploymentTags = (scores, { title, content, assetText }, tags) => {
  const searchableText = [title, content, assetText].join(" ");
  if (!matchesAnySearchTerm(searchableText, publicEmploymentTerms)) {
    return;
  }

  const slugToId = new Map(tags.map((tag) => [tag.slug, tag.id]));
  if (slugToId.get("recruitment")) {
    scores[slugToId.get("recruitment")] = Math.max(scores[slugToId.get("recruitment")] ?? 0, 1.2);
  }
  if (slugToId.get("labor")) {
    scores[slugToId.get("labor")] = Math.max(scores[slugToId.get("labor")] ?? 0, 1.05);
  }
};

export class ClassificationService {
  classifyDocument(state, documentId) {
    const document = state.documents.find((entry) => entry.id === documentId);
    if (!document) {
      return null;
    }

    const occurrences = state.documentOccurrences.filter((entry) => entry.documentId === documentId);
    const primaryOccurrence = choosePrimaryOccurrence(state, occurrences);
    occurrences.forEach((occurrence) => {
      occurrence.isPrimary = occurrence.id === primaryOccurrence?.id;
      occurrence.updatedAt = now();
    });

    const primaryContent = latestContentForOccurrence(state, primaryOccurrence?.id);
    const assetText = state.documentAssets
      .filter((asset) => asset.occurrenceId === primaryOccurrence?.id)
      .map((asset) => asset.fileName ?? asset.fileExt ?? "")
      .join(" ");

    const organizations = resolveOrganizations({
      title: primaryOccurrence?.sourceTitle ?? "",
      content: primaryContent?.cleanedText ?? "",
      hints: primaryOccurrence?.organizationHints ?? [],
      organizations: state.organizations,
      aliases: state.organizationAliases,
    });

    const tagScores = scoreTagRules({
      title: primaryOccurrence?.sourceTitle ?? "",
      content: primaryContent?.cleanedText ?? "",
      assetText,
      organizationMatches: organizations.map((organization) => organization.name),
      rules: state.tagKeywordRules.filter((rule) => rule.isActive),
    });

    applyOrganizationTypeTags(tagScores, organizations, state.tags);
    applyPublicEmploymentTags(
      tagScores,
      {
        title: primaryOccurrence?.sourceTitle ?? "",
        content: primaryContent?.cleanedText ?? "",
        assetText,
      },
      state.tags,
    );

    const sortedTagIds = Object.entries(tagScores)
      .filter(([, score]) => score >= 1)
      .sort((left, right) => right[1] - left[1])
      .map(([tagId]) => tagId);

    synchronizeDocumentTags(state, documentId, sortedTagIds);
    synchronizeOrganizations(state, documentId, organizations);

    const tagSlugs = sortedTagIds
      .map((tagId) => state.tags.find((tag) => tag.id === tagId)?.slug)
      .filter(Boolean);
    const recruitmentProfile = deriveRecruitmentProfile({
      title: primaryOccurrence?.sourceTitle ?? "",
      content: primaryContent?.cleanedText ?? "",
      tagSlugs,
      organizationNames: organizations.map((organization) => organization.name),
    });

    synchronizeRecruitmentProfile(state, documentId, recruitmentProfile);

    const summary = buildSummary({
      title: primaryOccurrence?.sourceTitle ?? document.representativeTitle,
      content: primaryContent?.cleanedText ?? "",
    });
    const extractionStatus = primaryContent?.extractionStatus ?? "failed";
    const qualityScore = calculateQualityScore({
      title: primaryOccurrence?.sourceTitle,
      content: primaryContent?.cleanedText,
      tagCount: sortedTagIds.length,
      organizationCount: organizations.length,
      extractionStatus,
    });
    const primarySource = state.sourceSites.find((source) => source.id === primaryOccurrence?.sourceId) ?? null;
    const searchText = [
      primaryOccurrence?.sourceTitle ?? "",
      summary,
      organizations.map((organization) => organization.name).join(" "),
      sortedTagIds
        .map((tagId) => state.tags.find((tag) => tag.id === tagId)?.name ?? "")
        .join(" "),
      primaryContent?.cleanedText?.slice(0, 400) ?? "",
    ].join(" ");

    document.representativeTitle = primaryOccurrence?.sourceTitle ?? document.representativeTitle;
    document.normalizedTitle = compactSearchText(document.representativeTitle);
    document.representativeSummary = summary;
    document.visibilityStatus = "active";
    document.reviewStatus = deriveReviewStatus({
      qualityScore,
      tagCount: sortedTagIds.length,
      extractionStatus,
      allowTaglessApproval: tagOptionalApprovalParsers.has(primarySource?.parserKey) && qualityScore >= 0.55,
    });
    document.qualityScore = qualityScore;
    document.sourceCount = occurrences.length;
    document.publishedAt = primaryOccurrence?.sourcePublishedAt ?? document.publishedAt;
    document.firstSeenAt = occurrences.map((entry) => entry.firstSeenAt).sort()[0] ?? document.firstSeenAt;
    document.lastSeenAt = occurrences.map((entry) => entry.lastSeenAt).sort().at(-1) ?? document.lastSeenAt;
    document.searchText = searchText;
    document.searchTextCompact = compactSearchText(searchText);
    document.updatedAt = now();

    return document;
  }
}
