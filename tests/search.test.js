import test from "node:test";
import assert from "node:assert/strict";
import { SearchService, computeRelevance, matchesTagMode } from "../src/services/search/search-service.js";

test("matchesTagMode supports AND filtering", () => {
  assert.equal(matchesTagMode(["resume", "recruitment"], ["resume", "recruitment"], "and"), true);
  assert.equal(matchesTagMode(["resume"], ["resume", "recruitment"], "and"), false);
});

test("matchesTagMode supports OR filtering", () => {
  assert.equal(matchesTagMode(["resume"], ["resume", "recruitment"], "or"), true);
  assert.equal(matchesTagMode(["labor-contract"], ["resume", "recruitment"], "or"), false);
});

test("computeRelevance rewards organization and title matches", () => {
  const score = computeRelevance({
    document: {
      id: "doc_1",
      representativeTitle: "산업은행 2026 상반기 자소서",
      searchText: "산업은행 자소서 채용 공고",
    },
    queryTokens: ["산업은행", "자소서"],
    organizationQueries: ["산업은행"],
    organizationAliasMap: new Map(),
    tagSlugs: ["cover-letter"],
    context: {
      tags: [{ slug: "cover-letter" }],
      organizations: [{ name: "산업은행" }],
    },
    state: {
      documentOccurrences: [{ documentId: "doc_1", isPrimary: true, sourceId: "source_1", pageUrl: "https://sample.local" }],
      sourceSites: [{ id: "source_1", trustScore: 0.9 }],
    },
  });

  assert.equal(score > 90, true);
});

test("SearchService matches organization aliases in organization filter", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_1", trustScore: 0.95 }],
        organizationAliases: [{ organizationId: "org_ibk", normalizedAlias: "ibk기업은행" }],
        tags: [{ id: "tag_cover", slug: "cover-letter", name: "자소서" }],
        documents: [
          {
            id: "doc_1",
            representativeTitle: "기업은행 디지털 인턴 지원서와 자소서 양식",
            representativeSummary: "기업은행 채용 서류",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-02-26T00:00:00Z",
            searchText: "기업은행 ibk기업은행 자소서 채용",
          },
        ],
        documentOccurrences: [{ documentId: "doc_1", isPrimary: true, sourceId: "source_1", fileType: "pdf", pageUrl: "https://sample.local/ibk" }],
        documentTags: [{ documentId: "doc_1", tagId: "tag_cover" }],
        organizations: [{ id: "org_ibk", name: "기업은행", organizationType: "bank" }],
        documentOrganizations: [{ documentId: "doc_1", organizationId: "org_ibk" }],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "",
    organization: "IBK",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].organizations[0], "기업은행");
});

test("SearchService supports comma-separated organization filters", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_1", trustScore: 0.95 }],
        organizationAliases: [],
        tags: [{ id: "tag_cover", slug: "cover-letter", name: "자소서" }],
        documents: [
          {
            id: "doc_ibk",
            representativeTitle: "기업은행 자소서",
            representativeSummary: "기업은행 채용 서류",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-02-26T00:00:00Z",
            searchText: "기업은행 자소서 채용",
          },
          {
            id: "doc_kdb",
            representativeTitle: "산업은행 자소서",
            representativeSummary: "산업은행 채용 서류",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-01T00:00:00Z",
            searchText: "산업은행 자소서 채용",
          },
        ],
        documentOccurrences: [
          { documentId: "doc_ibk", isPrimary: true, sourceId: "source_1", fileType: "pdf", pageUrl: "https://sample.local/ibk" },
          { documentId: "doc_kdb", isPrimary: true, sourceId: "source_1", fileType: "pdf", pageUrl: "https://sample.local/kdb" },
        ],
        documentTags: [
          { documentId: "doc_ibk", tagId: "tag_cover" },
          { documentId: "doc_kdb", tagId: "tag_cover" },
        ],
        organizations: [
          { id: "org_ibk", name: "기업은행", organizationType: "bank" },
          { id: "org_kdb", name: "산업은행", organizationType: "bank" },
        ],
        documentOrganizations: [
          { documentId: "doc_ibk", organizationId: "org_ibk" },
          { documentId: "doc_kdb", organizationId: "org_kdb" },
        ],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "자소서",
    organization: "기업은행,산업은행",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 2);
});
