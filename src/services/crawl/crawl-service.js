import { buildRun, buildRunItem, upsertParsedDocument } from "./crawl-state-helpers.js";

const now = () => new Date().toISOString();

export class CrawlService {
  constructor({ repository, classificationService, adapterRegistry }) {
    this.repository = repository;
    this.classificationService = classificationService;
    this.adapterRegistry = adapterRegistry;
  }

  async crawlAll({ reason = "manual" } = {}) {
    const summaries = [];

    await this.repository.updateState(async (state) => {
      const activeSources = state.sourceSites.filter((source) => source.status === "active" && source.allowCrawl);
      for (const source of activeSources) {
        summaries.push(await this.#crawlSourceInState(state, source, reason));
      }
      state.meta.lastCrawlAt = now();
    });

    return summaries;
  }

  async #crawlSourceInState(state, source, reason) {
    const run = buildRun(source.id, reason);
    state.crawlRuns.push(run);

    const adapter = this.adapterRegistry.get(source.parserKey);
    if (!adapter) {
      run.status = "failed";
      run.errorCount = 1;
      run.errorSummary = `adapter_not_found:${source.parserKey}`;
      run.endedAt = now();
      return run;
    }

    try {
      const candidates = await adapter.fetchCandidates(source);
      run.itemsFound = candidates.length;

      for (const candidate of candidates) {
        try {
          const parsed = await adapter.fetchDetail(candidate, source);
          const result = upsertParsedDocument(state, source, parsed);
          this.classificationService.classifyDocument(state, result.documentId);

          run.itemsCreated += Number(result.created);
          run.itemsUpdated += Number(result.updated);
          run.itemsSkipped += Number(result.skipped);
          state.crawlRunItems.push(
            buildRunItem(run.id, candidate, result.status, {
              itemTitle: parsed.sourceTitle,
              documentId: result.documentId,
              occurrenceId: result.occurrenceId,
              contentHash: result.contentHash,
              attachmentHash: result.attachmentHash,
            }),
          );
        } catch (error) {
          run.errorCount += 1;
          state.crawlRunItems.push(
            buildRunItem(run.id, candidate, "parse_failed", {
              errorMessage: error.message,
            }),
          );
        }
      }
    } catch (error) {
      run.status = "failed";
      run.errorCount += 1;
      run.errorSummary = error.message;
    }

    if (run.status !== "failed") {
      run.status = run.errorCount > 0 ? "partially_failed" : "succeeded";
    }
    run.endedAt = now();
    return run;
  }
}
