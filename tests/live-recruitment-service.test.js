import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyState } from "../src/repositories/json/json-state-repository.js";
import { LiveRecruitmentService } from "../src/services/live/live-recruitment-service.js";

const createRepository = (initialState) => {
  let state = JSON.parse(JSON.stringify(initialState));
  return {
    async readState() {
      return JSON.parse(JSON.stringify(state));
    },
    async updateState(mutator) {
      await mutator(state);
      return JSON.parse(JSON.stringify(state));
    },
    getState() {
      return state;
    },
  };
};

test("LiveRecruitmentService reuses fresh query cache entries", async () => {
  const state = createEmptyState();
  state.sourceSites.push({
    id: "source_whole_web_live",
    name: "웹 전체 검색",
    sourceType: "live_search",
    parserKey: "whole_web_search",
    status: "active",
    trustScore: 0.7,
    crawlIntervalMinutes: 30,
  });

  const repository = createRepository(state);
  let adapterCallCount = 0;
  const adapterRegistry = new Map([
    [
      "whole_web_search",
      {
        async search() {
          adapterCallCount += 1;
          return [
            {
              sourceItemKey: "https://www.samsung.com",
              pageUrl: "https://www.samsung.com",
              canonicalUrl: "https://www.samsung.com",
              sourceTitle: "삼성전자 공식 홈페이지",
              bodyText: "삼성전자 공식 홈페이지. 웹 전체 검색.",
              organizationHints: ["삼성전자"],
              locationHints: [],
              publishedAt: null,
              assets: [],
              matchText: "삼성전자 공식 홈페이지",
            },
          ];
        },
      },
    ],
  ]);

  const service = new LiveRecruitmentService({
    repository,
    classificationService: { classifyDocument() {} },
    adapterRegistry,
  });

  const firstStats = await service.hydrate({
    query: "삼성전자",
    organization: "",
    region: "",
    sourceScope: "whole_web",
    tagSlugs: [],
  });
  const secondStats = await service.hydrate({
    query: "삼성전자",
    organization: "",
    region: "",
    sourceScope: "whole_web",
    tagSlugs: [],
  });

  assert.equal(adapterCallCount, 1);
  assert.equal(firstStats.cacheMisses, 1);
  assert.equal(secondStats.cacheHits, 1);
  assert.equal(repository.getState().liveQueryCacheEntries.length, 1);
});
