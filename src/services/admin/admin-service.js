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
}
