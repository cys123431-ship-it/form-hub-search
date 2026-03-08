const getLiveCacheStats = (state, sourceId) => {
  const now = Date.now();
  const cacheEntries = (state.liveQueryCacheEntries ?? []).filter((entry) => entry.sourceId === sourceId);
  const freshCount = cacheEntries.filter((entry) => Date.parse(entry.expiresAt ?? "") > now).length;
  const staleCount = Math.max(0, cacheEntries.length - freshCount);
  const latestEntry =
    [...cacheEntries].sort((left, right) => (right.fetchedAt ?? "").localeCompare(left.fetchedAt ?? ""))[0] ?? null;

  return {
    totalEntries: cacheEntries.length,
    freshCount,
    staleCount,
    latestFetchedAt: latestEntry?.fetchedAt ?? null,
  };
};

const buildSourceAccessMode = (source) => {
  if (source.allowCache) {
    return "cached_file_allowed";
  }
  if (source.allowPreview) {
    return "cached_preview_allowed";
  }
  return "link_only";
};

export class AdminService {
  constructor({ repository, crawlService }) {
    this.repository = repository;
    this.crawlService = crawlService;
  }

  async listSources() {
    const state = await this.repository.readState();
    return state.sourceSites.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      allowCrawl: source.allowCrawl,
      trustScore: source.trustScore,
      parserKey: source.parserKey,
      lastRun:
        state.crawlRuns
          .filter((run) => run.sourceId === source.id)
          .sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""))[0] ?? null,
      policyNote: source.policyNote ?? "",
      crawlIntervalMinutes: source.crawlIntervalMinutes ?? null,
      requestTimeoutMs: source.requestTimeoutMs ?? null,
      accessMode: buildSourceAccessMode(source),
      cache: getLiveCacheStats(state, source.id),
    }));
  }

  async runCrawl() {
    return this.crawlService.crawlAll({ reason: "manual" });
  }

  async listCrawlRuns() {
    const state = await this.repository.readState();
    return [...state.crawlRuns].sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
  }

  async listReviewQueue() {
    const state = await this.repository.readState();
    return state.documents
      .filter((document) => document.reviewStatus === "pending_review" || document.qualityScore < 0.45)
      .map((document) => ({
        id: document.id,
        title: document.representativeTitle,
        qualityScore: document.qualityScore,
        reviewStatus: document.reviewStatus,
      }));
  }

  async getSummary() {
    const state = await this.repository.readState();
    const now = Date.now();
    const activeSources = state.sourceSites.filter((source) => source.status === "active");
    const liveSources = activeSources.filter((source) => source.sourceType === "live_search");
    const liveQueryCacheEntries = state.liveQueryCacheEntries ?? [];
    const freshCacheEntries = liveQueryCacheEntries.filter((entry) => Date.parse(entry.expiresAt ?? "") > now);
    const pendingDocuments = state.documents.filter(
      (document) => document.reviewStatus === "pending_review" || document.qualityScore < 0.45,
    );
    const approvedDocuments = state.documents.filter((document) => document.reviewStatus === "approved");

    return {
      documents: {
        total: state.documents.length,
        approved: approvedDocuments.length,
        pending: pendingDocuments.length,
        occurrences: state.documentOccurrences.length,
      },
      sources: {
        total: state.sourceSites.length,
        active: activeSources.length,
        live: liveSources.length,
        crawlable: activeSources.filter((source) => source.allowCrawl).length,
      },
      cache: {
        totalEntries: liveQueryCacheEntries.length,
        freshEntries: freshCacheEntries.length,
        staleEntries: Math.max(0, liveQueryCacheEntries.length - freshCacheEntries.length),
      },
      policy: {
        cachedFileAllowed: activeSources.filter((source) => source.allowCache).length,
        previewAllowed: activeSources.filter((source) => !source.allowCache && source.allowPreview).length,
        linkOnly: activeSources.filter((source) => !source.allowCache && !source.allowPreview).length,
      },
      lastCrawlAt: state.meta?.lastCrawlAt ?? null,
    };
  }
}
