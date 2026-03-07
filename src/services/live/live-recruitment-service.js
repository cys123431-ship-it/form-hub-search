import { upsertParsedDocument } from "../crawl/crawl-state-helpers.js";
import { splitOrganizationQueries } from "../search/search-organization.js";

const unique = (values) => [...new Set(values.filter(Boolean))];

export class LiveRecruitmentService {
  constructor({ repository, classificationService, adapterRegistry }) {
    this.repository = repository;
    this.classificationService = classificationService;
    this.adapterRegistry = adapterRegistry;
  }

  async hydrate(params) {
    const state = await this.repository.readState();
    const liveSources = state.sourceSites.filter((source) => source.parserKey === "jobkorea_live_search" && source.status === "active");
    if (liveSources.length === 0) {
      return;
    }

    const organizationQueries = splitOrganizationQueries(params.organization);
    const liveQueries = unique(organizationQueries.length > 0 ? organizationQueries : [params.query.trim()]).slice(0, 3);
    if (liveQueries.length === 0) {
      return;
    }

    const source = liveSources[0];
    const adapter = this.adapterRegistry.get(source.parserKey);
    if (!adapter) {
      return;
    }

    const parsedDocuments = [];
    for (const queryText of liveQueries) {
      try {
        const documents = await adapter.search(queryText, {
          limit: organizationQueries.length > 0 ? 4 : 6,
          requireQueryMatch: organizationQueries.length > 0,
        });
        parsedDocuments.push(...documents);
      } catch {
        continue;
      }
    }

    if (parsedDocuments.length === 0) {
      return;
    }

    await this.repository.updateState(async (draftState) => {
      parsedDocuments.forEach((parsedDocument) => {
        const result = upsertParsedDocument(draftState, source, parsedDocument);
        this.classificationService.classifyDocument(draftState, result.documentId);
      });
    });
  }
}
