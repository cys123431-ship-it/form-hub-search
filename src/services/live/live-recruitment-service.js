import { upsertParsedDocument } from "../crawl/crawl-state-helpers.js";
import {
  expandOrganizationQueryVariants,
  splitOrganizationQueries,
} from "../search/search-organization.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const liveSourceType = "live_search";
const civilServiceTerms = ["공무원", "국가공무원", "지방공무원", "군무원", "임기제", "한시임기제"];

const isCivilServiceRequest = (params) =>
  [...splitOrganizationQueries(params.organization), String(params.query ?? "").trim()].some((value) =>
    civilServiceTerms.some((term) => String(value ?? "").includes(term)),
  );

const buildLiveQueries = (params) => {
  const queryText = String(params.query ?? "").trim();
  const organizationQueries = splitOrganizationQueries(params.organization);
  const expandedOrganizations = unique(
    organizationQueries.flatMap((entry) => [entry, ...expandOrganizationQueryVariants(entry)]),
  ).slice(0, 3);

  if (expandedOrganizations.length > 0 && queryText) {
    return unique([
      ...expandedOrganizations.slice(0, 2).map((organization) => `${organization} ${queryText}`.trim()),
      ...expandedOrganizations.slice(0, 2),
      queryText,
    ]).slice(0, 4);
  }

  if (expandedOrganizations.length > 0) {
    return expandedOrganizations.slice(0, 3);
  }

  if (queryText) {
    return unique([queryText, ...expandOrganizationQueryVariants(queryText)]).slice(0, 3);
  }

  return [];
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
    const liveSources = state.sourceSites.filter((source) => {
      if (source.sourceType !== liveSourceType || source.status !== "active") {
        return false;
      }

      if (source.parserKey === "gojobs_live_search") {
        return civilServiceRequest;
      }

      return true;
    });
    if (liveSources.length === 0) {
      return;
    }

    const organizationQueries = splitOrganizationQueries(params.organization);
    const liveQueries = buildLiveQueries(params);
    if (liveQueries.length === 0) {
      return;
    }

    const parsedDocuments = [];
    const tasks = liveSources.flatMap((source) => {
      const adapter = this.adapterRegistry.get(source.parserKey);
      if (!adapter) {
        return [];
      }

      return liveQueries.map(async (queryText) => {
        try {
          const documents = await adapter.search(queryText, {
            limit: organizationQueries.length > 0 ? 6 : 8,
            requireQueryMatch: organizationQueries.length > 0 || Boolean(params.query.trim()),
          });
          return documents.map((document) => ({ sourceId: source.id, document }));
        } catch {
          return [];
        }
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
