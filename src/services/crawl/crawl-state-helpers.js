import crypto from "node:crypto";
import { createId } from "../../utils/ids.js";
import { normalizeUrl, normalizeWhitespace } from "../../utils/normalize.js";

const now = () => new Date().toISOString();

const createHash = (value) => {
  if (!value) {
    return null;
  }
  return crypto.createHash("sha256").update(value).digest("hex");
};

export const buildRun = (sourceId, reason) => ({
  id: createId("run"),
  sourceId,
  runType: reason,
  status: "queued",
  startedAt: now(),
  endedAt: null,
  itemsFound: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsSkipped: 0,
  errorCount: 0,
  errorSummary: null,
  createdAt: now(),
});

export const buildRunItem = (runId, candidate, status, extra = {}) => ({
  id: createId("item"),
  crawlRunId: runId,
  sourceItemKey: candidate.sourceItemKey ?? null,
  pageUrl: candidate.pageUrl,
  pageUrlNormalized: normalizeUrl(candidate.pageUrl),
  itemTitle: extra.itemTitle ?? null,
  status,
  httpStatus: null,
  resolvedDocumentId: extra.documentId ?? null,
  resolvedOccurrenceId: extra.occurrenceId ?? null,
  contentHash: extra.contentHash ?? null,
  attachmentHash: extra.attachmentHash ?? null,
  debugCaptureKey: null,
  errorMessage: extra.errorMessage ?? null,
  createdAt: now(),
});

const buildDocument = (title, publishedAt) => ({
  id: createId("doc"),
  representativeTitle: title,
  normalizedTitle: "",
  representativeSummary: null,
  visibilityStatus: "active",
  reviewStatus: "pending_review",
  qualityScore: 0,
  sourceCount: 1,
  publishedAt,
  firstSeenAt: now(),
  lastSeenAt: now(),
  searchText: "",
  searchTextCompact: "",
  createdAt: now(),
  updatedAt: now(),
});

const buildAccessPolicy = (source) => {
  if (source.allowCache) {
    return "cached_file_allowed";
  }
  if (source.allowPreview) {
    return "cached_preview_allowed";
  }
  return "link_only";
};

const findExistingDocumentId = (state, parsed, hashes) => {
  const canonicalUrl = normalizeUrl(parsed.canonicalUrl);
  const attachmentUrl = normalizeUrl(parsed.assets?.[0]?.url);

  if (canonicalUrl) {
    const byCanonical = state.documentOccurrences.find((entry) => normalizeUrl(entry.canonicalUrl) === canonicalUrl);
    if (byCanonical?.documentId) {
      return byCanonical.documentId;
    }
  }

  if (hashes.attachmentHash) {
    const byAttachment = state.documentOccurrences.find((entry) => entry.attachmentHash === hashes.attachmentHash);
    if (byAttachment?.documentId) {
      return byAttachment.documentId;
    }
  }

  if (hashes.contentHash) {
    const byContent = state.documentOccurrences.find((entry) => entry.contentHash === hashes.contentHash);
    if (byContent?.documentId) {
      return byContent.documentId;
    }
  }

  if (attachmentUrl) {
    return (
      state.documentOccurrences.find((entry) => normalizeUrl(entry.attachmentUrl) === attachmentUrl)?.documentId ??
      null
    );
  }

  return null;
};

const replaceOccurrenceAssets = (state, occurrenceId, source, assets) => {
  state.documentAssets = state.documentAssets.filter((entry) => entry.occurrenceId !== occurrenceId);
  assets.forEach((asset, index) => {
    state.documentAssets.push({
      id: createId("asset"),
      occurrenceId,
      assetKind: "attachment",
      sourceUrl: asset.url,
      fileName: asset.fileName ?? null,
      fileExt: asset.fileType ?? null,
      mimeType: asset.fileType === "pdf" ? "application/pdf" : null,
      sha256: createHash(asset.url),
      fileSizeBytes: null,
      storageKey: null,
      accessPolicy: buildAccessPolicy(source),
      isPrimary: index === 0,
      createdAt: now(),
      updatedAt: now(),
    });
  });
};

const upsertOccurrenceContent = (state, occurrenceId, parsed, contentHash) => {
  const latestEntry =
    state.documentContents
      .filter((entry) => entry.occurrenceId === occurrenceId)
      .sort((left, right) => right.versionNo - left.versionNo)[0] ?? null;

  if (latestEntry?.contentHash === contentHash) {
    return;
  }

  state.documentContents.push({
    id: createId("content"),
    occurrenceId,
    versionNo: (latestEntry?.versionNo ?? 0) + 1,
    contentSource: "html_body",
    extractionStatus: parsed.bodyText ? "succeeded" : "failed",
    extractorName: "manual-json-source-adapter",
    rawText: parsed.bodyText ?? null,
    cleanedText: normalizeWhitespace(parsed.bodyText ?? ""),
    summary: null,
    contentHash,
    extractedAt: now(),
    createdAt: now(),
  });
};

export const upsertParsedDocument = (state, source, parsed) => {
  const normalizedPageUrl = normalizeUrl(parsed.pageUrl);
  const contentHash = createHash(normalizeWhitespace(parsed.bodyText ?? ""));
  const attachmentHash = createHash((parsed.assets ?? []).map((asset) => normalizeUrl(asset.url)).join("|"));
  const existingOccurrence = state.documentOccurrences.find(
    (entry) => entry.sourceId === source.id && entry.pageUrlNormalized === normalizedPageUrl,
  );

  if (existingOccurrence && existingOccurrence.contentHash === contentHash && existingOccurrence.attachmentHash === attachmentHash) {
    existingOccurrence.lastSeenAt = now();
    existingOccurrence.updatedAt = now();
    return {
      created: false,
      updated: false,
      skipped: true,
      status: "skipped_duplicate",
      documentId: existingOccurrence.documentId,
      occurrenceId: existingOccurrence.id,
      contentHash,
      attachmentHash,
    };
  }

  let documentId = existingOccurrence?.documentId ?? findExistingDocumentId(state, parsed, { contentHash, attachmentHash });
  const created = !documentId;

  if (!documentId) {
    const document = buildDocument(parsed.sourceTitle, parsed.publishedAt ?? null);
    state.documents.push(document);
    documentId = document.id;
  }

  const occurrence = existingOccurrence ?? {
    id: createId("occ"),
    documentId,
    sourceId: source.id,
    firstSeenAt: now(),
    createdAt: now(),
  };

  Object.assign(occurrence, {
    documentId,
    pageUrl: parsed.pageUrl,
    pageUrlNormalized: normalizedPageUrl,
    canonicalUrl: normalizeUrl(parsed.canonicalUrl),
    attachmentUrl: normalizeUrl(parsed.assets?.[0]?.url),
    attachmentUrlNormalized: normalizeUrl(parsed.assets?.[0]?.url),
    sourceDocumentKey: parsed.sourceItemKey ?? null,
    sourceTitle: parsed.sourceTitle,
    sourcePublishedAt: parsed.publishedAt ?? null,
    lastSeenAt: now(),
    contentHash,
    attachmentHash,
    fileType: parsed.assets?.[0]?.fileType ?? "html",
    accessPolicy: buildAccessPolicy(source),
    isPrimary: false,
    organizationHints: parsed.organizationHints ?? [],
    updatedAt: now(),
  });

  if (!existingOccurrence) {
    state.documentOccurrences.push(occurrence);
  }

  upsertOccurrenceContent(state, occurrence.id, parsed, contentHash);
  replaceOccurrenceAssets(state, occurrence.id, source, parsed.assets ?? []);

  return {
    created,
    updated: !created,
    skipped: false,
    status: "fetched",
    documentId,
    occurrenceId: occurrence.id,
    contentHash,
    attachmentHash,
  };
};
