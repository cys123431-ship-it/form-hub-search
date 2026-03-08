import test from "node:test";
import assert from "node:assert/strict";
import { SearchService, computeRelevance, matchesTagMode } from "../src/services/search/search-service.js";
import { buildQueryTokenGroups, expandRecruitmentQueryVariants, matchesQueryTokenGroups } from "../src/services/search/search-query.js";

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

test("SearchService falls back to occurrence organization hints for unknown companies", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_live", trustScore: 0.88 }],
        organizationAliases: [],
        tags: [{ id: "tag_recruit", slug: "recruitment", name: "채용" }],
        documents: [
          {
            id: "doc_samsung",
            representativeTitle: "삼성전자 채용 - DX 부문 신입 모집",
            representativeSummary: "삼성전자 채용 공고",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "삼성전자 채용 공고 입사지원 자기소개서 자소서",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_samsung",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            pageUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/12345678",
            organizationHints: ["삼성전자"],
          },
        ],
        documentTags: [{ documentId: "doc_samsung", tagId: "tag_recruit" }],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "자소서",
    organization: "삼성전자",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].organizations[0], "삼성전자");
});

test("SearchService falls back to document search text when live results use different company names", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_live", trustScore: 0.88 }],
        organizationAliases: [],
        tags: [{ id: "tag_recruit", slug: "recruitment", name: "채용" }],
        documents: [
          {
            id: "doc_lg_related",
            representativeTitle: "비콤시스템 채용 - 전기 제어장치 시스템 프로그램",
            representativeSummary: "LG전자 관련 검색 결과",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "비콤시스템 LG전자 자소서 채용 공고",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_lg_related",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            pageUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/48711738",
            organizationHints: ["비콤시스템"],
          },
        ],
        documentTags: [{ documentId: "doc_lg_related", tagId: "tag_recruit" }],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "자소서",
    organization: "LG전자",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
});

test("SearchService supports region filtering with location hints", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_live", trustScore: 0.93 }],
        organizationAliases: [],
        tags: [{ id: "tag_recruit", slug: "recruitment", name: "채용" }],
        documents: [
          {
            id: "doc_daejeon",
            representativeTitle: "대전 치과 채용",
            representativeSummary: "대전 지역 채용 공고",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "대전광역시 유성구 치과 채용 공고",
          },
          {
            id: "doc_seoul",
            representativeTitle: "서울 병원 채용",
            representativeSummary: "서울 지역 채용 공고",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "서울특별시 강남구 병원 채용 공고",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_daejeon",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            pageUrl: "https://www.work24.go.kr/dj",
            organizationHints: ["대전치과"],
            locationHints: ["대전광역시", "대전 유성구"],
          },
          {
            documentId: "doc_seoul",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            pageUrl: "https://www.work24.go.kr/seoul",
            organizationHints: ["서울병원"],
            locationHints: ["서울특별시", "서울 강남구"],
          },
        ],
        documentTags: [
          { documentId: "doc_daejeon", tagId: "tag_recruit" },
          { documentId: "doc_seoul", tagId: "tag_recruit" },
        ],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "채용",
    organization: "",
    region: "대전광역시",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].locations.includes("대전광역시"), true);
});

test("SearchService triggers live hydration for region-only searches", async () => {
  let hydratedRegion = null;
  const repository = {
    async readState() {
      return {
        sourceSites: [],
        organizationAliases: [],
        tags: [],
        documents: [],
        documentOccurrences: [],
        documentTags: [],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };
  const liveRecruitmentService = {
    async hydrate(params) {
      hydratedRegion = params.region;
    },
  };

  const service = new SearchService(repository, liveRecruitmentService);
  await service.search({
    query: "",
    organization: "",
    region: "대전광역시",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(hydratedRegion, "대전광역시");
});

test("SearchService keeps only municipal official documents for non-recruitment regional civic searches", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [
          { id: "source_municipal", parserKey: "municipal_official_search", trustScore: 0.88 },
          { id: "source_job", parserKey: "jobkorea_live_search", trustScore: 0.88 },
        ],
        organizationAliases: [],
        tags: [{ id: "tag_recruit", slug: "recruitment", name: "채용" }],
        documents: [
          {
            id: "doc_official",
            representativeTitle: "서울특별시 하수도 안내",
            representativeSummary: "서울특별시 공식 안내",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "서울특별시 하수도 안내 하수구 민원",
          },
          {
            id: "doc_job",
            representativeTitle: "하수구배관 채용",
            representativeSummary: "민간 채용 공고",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "서울특별시 하수구 배관 채용 공고",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_official",
            isPrimary: true,
            sourceId: "source_municipal",
            fileType: "html",
            pageUrl: "https://www.seoul.go.kr/sewer",
            locationHints: ["서울특별시"],
          },
          {
            documentId: "doc_job",
            isPrimary: true,
            sourceId: "source_job",
            fileType: "html",
            pageUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1",
            locationHints: ["서울특별시"],
          },
        ],
        documentTags: [{ documentId: "doc_job", tagId: "tag_recruit" }],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "하수구",
    organization: "",
    region: "서울특별시",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "서울특별시 하수도 안내");
});

test("public employment query variants match related hiring documents", () => {
  const tokenGroups = buildQueryTokenGroups("공공근로");

  assert.equal(matchesQueryTokenGroups("대전광역시 기간제근로자 채용 공고", tokenGroups), true);
  assert.equal(matchesQueryTokenGroups("서울시 공공일자리 참여자 모집", tokenGroups), true);
  assert.equal(matchesQueryTokenGroups("민간기업 일반 채용 공고", tokenGroups), false);
});

test("expandRecruitmentQueryVariants broadens public employment queries for live search", () => {
  const variants = expandRecruitmentQueryVariants("공공근로");

  assert.equal(variants.includes("공공근로"), true);
  assert.equal(variants.includes("공공일자리"), true);
  assert.equal(variants.includes("기간제근로자"), true);
  assert.equal(variants.includes("일자리사업"), true);
});

test("SearchService returns public employment documents for 공공근로 queries", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [{ id: "source_live", trustScore: 0.95 }],
        organizationAliases: [],
        tags: [{ id: "tag_recruit", slug: "recruitment", name: "채용" }],
        documents: [
          {
            id: "doc_public_work",
            representativeTitle: "대전광역시 재활용 분리배출 현장도우미 기간제근로자 모집",
            representativeSummary: "대전 공공일자리 공고",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-07T00:00:00Z",
            searchText: "대전광역시 재활용 분리배출 현장도우미 기간제근로자 모집 공공일자리 일자리사업",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_public_work",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            pageUrl: "https://www.daejeon.go.kr/public-work",
            locationHints: ["대전광역시"],
          },
        ],
        documentTags: [{ documentId: "doc_public_work", tagId: "tag_recruit" }],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [{ documentId: "doc_public_work", recruitmentKind: "public_work" }],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "공공근로",
    organization: "",
    region: "대전광역시",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title.includes("기간제근로자"), true);
});

test("SearchService filters results by local_government source scope", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [
          { id: "source_local", parserKey: "national_admin_board_search", trustScore: 0.92 },
          { id: "source_web", parserKey: "whole_web_search", trustScore: 0.7 },
        ],
        organizationAliases: [],
        tags: [],
        documents: [
          {
            id: "doc_local",
            representativeTitle: "대전광역시 하수도 정비 공고",
            representativeSummary: "대전광역시 공식 보드",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-08T00:00:00Z",
            searchText: "대전광역시 하수도 정비 공고 고시공고",
          },
          {
            id: "doc_web",
            representativeTitle: "하수도 관련 일반 블로그 글",
            representativeSummary: "일반 웹 문서",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-08T00:00:00Z",
            searchText: "대전광역시 하수도 일반 블로그",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_local",
            isPrimary: true,
            sourceId: "source_local",
            fileType: "html",
            pageUrl: "https://www.daejeon.go.kr/drh/drhGosiView.do?sno=1",
            locationHints: ["대전광역시"],
          },
          {
            documentId: "doc_web",
            isPrimary: true,
            sourceId: "source_web",
            fileType: "html",
            pageUrl: "https://example.com/post",
            locationHints: ["대전광역시"],
          },
        ],
        documentTags: [],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "하수도",
    organization: "",
    region: "대전광역시",
    sourceScope: "local_government",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "대전광역시 하수도 정비 공고");
});

test("SearchService filters results by whole_web source scope", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [
          { id: "source_local", parserKey: "national_admin_board_search", trustScore: 0.92 },
          { id: "source_web", parserKey: "whole_web_search", trustScore: 0.7 },
        ],
        organizationAliases: [],
        tags: [],
        documents: [
          {
            id: "doc_local",
            representativeTitle: "대전광역시 하수도 정비 공고",
            representativeSummary: "대전광역시 공식 보드",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-08T00:00:00Z",
            searchText: "대전광역시 하수도 정비 공고 고시공고",
          },
          {
            id: "doc_web",
            representativeTitle: "하수도 관련 일반 블로그 글",
            representativeSummary: "일반 웹 문서",
            visibilityStatus: "active",
            reviewStatus: "approved",
            publishedAt: "2026-03-08T00:00:00Z",
            searchText: "대전광역시 하수도 일반 블로그",
          },
        ],
        documentOccurrences: [
          {
            documentId: "doc_local",
            isPrimary: true,
            sourceId: "source_local",
            fileType: "html",
            pageUrl: "https://www.daejeon.go.kr/drh/drhGosiView.do?sno=1",
            locationHints: ["대전광역시"],
          },
          {
            documentId: "doc_web",
            isPrimary: true,
            sourceId: "source_web",
            fileType: "html",
            pageUrl: "https://example.com/post",
            locationHints: ["대전광역시"],
          },
        ],
        documentTags: [],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "하수도",
    organization: "",
    region: "대전광역시",
    sourceScope: "whole_web",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "하수도 관련 일반 블로그 글");
});

test("SearchService returns preview text and search meta", async () => {
  const repository = {
    async readState() {
      return {
        sourceSites: [
          {
            id: "source_live",
            trustScore: 0.92,
            name: "전국 행정기관 전용 게시판 검색",
            parserKey: "national_admin_board_search",
            policyNote: "공식 행정기관 게시판 중심",
            allowPreview: true,
            allowCache: false,
          },
        ],
        liveQueryCacheEntries: [],
        organizationAliases: [],
        tags: [],
        documents: [
          {
            id: "doc_1",
            representativeTitle: "서울특별시 하수구 악취 개선 공지",
            representativeSummary: "서울특별시 하수구 관련 공지",
            visibilityStatus: "active",
            reviewStatus: "approved",
            qualityScore: 0.82,
            sourceCount: 1,
            publishedAt: "2026-03-01T00:00:00Z",
            searchText: "서울특별시 하수구 악취 개선 공지 안내",
          },
        ],
        documentOccurrences: [
          {
            id: "occ_1",
            documentId: "doc_1",
            isPrimary: true,
            sourceId: "source_live",
            fileType: "html",
            accessPolicy: "cached_preview_allowed",
            pageUrl: "https://www.seoul.go.kr/sewer",
            organizationHints: ["서울특별시"],
            locationHints: ["서울특별시"],
          },
        ],
        documentContents: [
          {
            occurrenceId: "occ_1",
            versionNo: 1,
            cleanedText: "서울특별시가 하수구 악취 개선 사업을 추진합니다. 시민 불편 해소를 위한 안내입니다.",
          },
        ],
        documentTags: [],
        organizations: [],
        documentOrganizations: [],
        recruitmentProfiles: [],
      };
    },
  };

  const service = new SearchService(repository);
  const payload = await service.search({
    query: "하수구",
    organization: "",
    region: "서울특별시",
    sourceScope: "local_government",
    recruitmentKind: "",
    fileType: "",
    tagSlugs: [],
    tagMode: "and",
    sort: "relevance",
    page: 1,
    pageSize: 10,
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].previewText.includes("하수구"), true);
  assert.equal(payload.items[0].sourceScopeLabel, "전국 행정기관");
  assert.equal(payload.meta.sourceScopeLabel, "전국 행정기관");
});
