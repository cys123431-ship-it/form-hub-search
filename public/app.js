const state = {
  tags: [],
  organizations: [],
  selectedTagSlugs: [],
  selectedDocumentId: null,
  currentPage: 1,
  lastPayload: null,
};

const regionSuggestions = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "수원시",
  "성남시",
  "고양시",
  "용인시",
  "부천시",
  "강남구",
  "서초구",
  "송파구",
  "중구",
  "영등포구",
  "관악구",
  "마포구",
  "유성구",
  "서구",
  "동구",
  "대덕구",
  "청주시",
  "천안시",
  "전주시",
  "창원시",
  "김해시",
  "포항시",
  "제주시",
  "해운대구",
  "수영구",
  "수성구",
  "남동구",
  "연수구",
  "광산구",
  "울주군",
];

const elements = {
  resultCount: document.querySelector("#result-count"),
  searchMeta: document.querySelector("#search-meta"),
  resultList: document.querySelector("#result-list"),
  pagination: document.querySelector("#pagination"),
  detailView: document.querySelector("#detail-view"),
  detailStatus: document.querySelector("#detail-status"),
  tagList: document.querySelector("#tag-list"),
  organizationList: document.querySelector("#organization-list"),
  regionList: document.querySelector("#region-list"),
  sourceList: document.querySelector("#source-list"),
  runList: document.querySelector("#run-list"),
  summaryGrid: document.querySelector("#summary-grid"),
  searchForm: document.querySelector("#search-form"),
  queryInput: document.querySelector("#query-input"),
  organizationInput: document.querySelector("#organization-input"),
  regionInput: document.querySelector("#region-input"),
  sourceScopeInput: document.querySelector("#source-scope-input"),
  tagModeInput: document.querySelector("#tag-mode-input"),
  sortInput: document.querySelector("#sort-input"),
  recruitmentKindInput: document.querySelector("#recruitment-kind-input"),
  fileTypeInput: document.querySelector("#file-type-input"),
  pageSizeInput: document.querySelector("#page-size-input"),
  clearTagsButton: document.querySelector("#clear-tags-button"),
  crawlButton: document.querySelector("#crawl-button"),
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`request_failed:${response.status}`);
  }
  return response.json();
};

const createElement = (tagName, options = {}) => {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text) {
    element.textContent = options.text;
  }
  return element;
};

const clearElement = (element) => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

const safeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "#";
  } catch {
    return "#";
  }
};

const createPill = (text) => createElement("span", { className: "pill", text });
const formatTrust = (value) => `신뢰도 ${Number(value ?? 0).toFixed(2)}`;
const recruitmentKindLabels = {
  open_recruitment: "공채",
  civil_service: "공무원",
  public_work: "공공근로",
  intern: "인턴",
  experienced: "경력",
  contract: "계약직",
};

const humanizeAccessMode = (value) =>
  ({
    cached_file_allowed: "파일 캐시 허용",
    cached_preview_allowed: "미리보기 허용",
    link_only: "링크 전용",
  })[value] ?? value;

const resetDetailView = (message = "목록에서 문서를 고르면 출처, 첨부 링크, 채용 메타데이터를 볼 수 있습니다.") => {
  elements.detailStatus.textContent = "문서를 선택하세요";
  elements.detailView.classList.add("empty-state");
  clearElement(elements.detailView);
  elements.detailView.textContent = message;
};

const renderTagList = () => {
  clearElement(elements.tagList);
  state.tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag-chip ${state.selectedTagSlugs.includes(tag.slug) ? "selected" : ""}`;
    button.textContent = `${tag.name}`;
    button.addEventListener("click", () => {
      if (state.selectedTagSlugs.includes(tag.slug)) {
        state.selectedTagSlugs = state.selectedTagSlugs.filter((slug) => slug !== tag.slug);
      } else {
        state.selectedTagSlugs = [...state.selectedTagSlugs, tag.slug];
      }
      state.currentPage = 1;
      renderTagList();
      runSearch();
    });
    elements.tagList.append(button);
  });
};

const renderOrganizations = () => {
  clearElement(elements.organizationList);
  state.organizations.forEach((organization) => {
    const option = document.createElement("option");
    option.value = organization.name;
    elements.organizationList.append(option);
  });
};

const renderRegions = () => {
  clearElement(elements.regionList);
  regionSuggestions.forEach((regionName) => {
    const option = document.createElement("option");
    option.value = regionName;
    elements.regionList.append(option);
  });
};

const resultMetaText = (item) =>
  [
    item.primarySource?.name ?? "",
    item.organizations.join(", "),
    item.locations?.join(", "),
    item.fileTypes.join(", ").toUpperCase(),
    item.publishedAt?.slice(0, 10),
  ]
    .filter(Boolean)
    .join(" · ");

const renderSearchMeta = (payload) => {
  const live = payload.meta?.liveHydration ?? {};
  elements.searchMeta.textContent = [
    payload.meta?.sourceScopeLabel ?? "통합검색",
    `응답 ${payload.meta?.durationMs ?? 0}ms`,
    `캐시 적중 ${live.cacheHits ?? 0}`,
    `새 조회 ${live.fetchedQueries ?? 0}`,
    `문서 반영 ${live.fetchedDocuments ?? 0}`,
  ]
    .filter(Boolean)
    .join(" · ");
};

const paginationRange = (currentPage, totalPages) => {
  const maxVisible = 7;
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (currentPage - offset > 1) {
      pages.add(currentPage - offset);
    }
    if (currentPage + offset < totalPages) {
      pages.add(currentPage + offset);
    }
  }

  return [...pages].sort((left, right) => left - right);
};

const renderPagination = (payload) => {
  clearElement(elements.pagination);

  if (payload.page.totalPages <= 1) {
    return;
  }

  const createPageButton = (label, targetPage, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-button ${options.active ? "active" : ""}`.trim();
    button.textContent = label;
    button.disabled = Boolean(options.disabled);
    button.addEventListener("click", async () => {
      state.currentPage = targetPage;
      await runSearch();
    });
    return button;
  };

  elements.pagination.append(
    createPageButton("이전", Math.max(1, payload.page.current - 1), {
      disabled: payload.page.current === 1,
    }),
  );

  paginationRange(payload.page.current, payload.page.totalPages).forEach((pageNumber, index, pages) => {
    if (index > 0 && pageNumber - pages[index - 1] > 1) {
      elements.pagination.append(createElement("span", { className: "pagination-gap", text: "..." }));
    }

    elements.pagination.append(
      createPageButton(String(pageNumber), pageNumber, {
        active: payload.page.current === pageNumber,
      }),
    );
  });

  elements.pagination.append(
    createPageButton("다음", Math.min(payload.page.totalPages, payload.page.current + 1), {
      disabled: payload.page.current === payload.page.totalPages,
    }),
  );
};

const renderResults = (payload) => {
  elements.resultCount.textContent = `${payload.page.totalItems}건 · ${payload.page.current}/${payload.page.totalPages}페이지`;
  renderSearchMeta(payload);
  clearElement(elements.resultList);

  payload.items.forEach((item) => {
    const article = createElement("article", {
      className: `result-card ${state.selectedDocumentId === item.id ? "active" : ""}`,
    });
    article.append(createElement("h3", { text: item.title }));

    const badgeRow = createElement("div", { className: "result-tags" });
    badgeRow.append(createPill(item.sourceScopeLabel));
    badgeRow.append(createPill(formatTrust(item.primarySource?.trustScore)));
    badgeRow.append(createPill(`품질 ${Number(item.qualityScore ?? 0).toFixed(2)}`));
    if (item.recruitmentKind) {
      badgeRow.append(createPill(recruitmentKindLabels[item.recruitmentKind] ?? item.recruitmentKind));
    }
    item.tags.forEach((tag) => badgeRow.append(createPill(tag)));
    article.append(badgeRow);

    article.append(createElement("p", { className: "result-meta", text: resultMetaText(item) }));
    article.append(createElement("p", { className: "result-preview", text: item.previewText || item.summary || "요약 없음" }));

    article.addEventListener("click", async () => {
      state.selectedDocumentId = item.id;
      await loadDetail(item.id);
      renderResults(state.lastPayload ?? payload);
    });
    elements.resultList.append(article);
  });

  if (payload.items.length === 0) {
    elements.resultList.append(createElement("div", { className: "mini-item", text: "조건에 맞는 문서가 없습니다." }));
  }

  renderPagination(payload);
};

const renderDetail = (document) => {
  elements.detailStatus.textContent = document.reviewStatus;
  elements.detailView.classList.remove("empty-state");
  clearElement(elements.detailView);

  const summarySection = createElement("div", { className: "detail-section" });
  summarySection.append(createElement("h3", { text: document.title }));
  summarySection.append(createElement("p", { text: document.summary ?? "요약 없음" }));
  summarySection.append(createElement("p", { className: "result-preview", text: document.previewText || "미리보기 없음" }));
  summarySection.append(
    createElement("p", {
      className: "detail-meta",
      text: `${document.organizations.join(", ") || "기관 없음"} · ${document.locations.join(", ") || "지역 없음"} · 품질 점수 ${document.qualityScore}`,
    }),
  );
  if (document.primarySource) {
    summarySection.append(
      createElement("p", {
        className: "detail-meta",
        text: `${document.primarySource.name} · ${document.primarySource.sourceScopeLabel} · ${formatTrust(document.primarySource.trustScore)} · ${humanizeAccessMode(document.primarySource.accessMode)}`,
      }),
    );
    if (document.primarySource.policyNote) {
      summarySection.append(createElement("p", { className: "detail-meta", text: document.primarySource.policyNote }));
    }
  }
  const tagRow = createElement("div", { className: "tag-row" });
  document.tags.forEach((tag) => tagRow.append(createPill(tag.name)));
  summarySection.append(tagRow);

  const recruitmentSection = createElement("div", { className: "detail-section" });
  recruitmentSection.append(createElement("h3", { text: "채용 메타데이터" }));
  recruitmentSection.append(
    createElement("div", {
      className: "mini-item",
      text: document.recruitmentProfile
        ? `유형 ${document.recruitmentProfile.recruitmentKind} · 시즌 ${document.recruitmentProfile.seasonLabel ?? "-"}`
        : "채용 문서가 아닙니다.",
    }),
  );

  const sourcesSection = createElement("div", { className: "detail-section" });
  sourcesSection.append(createElement("h3", { text: "출처와 첨부" }));
  const detailList = createElement("div", { className: "detail-list" });

  document.sources.forEach((source) => {
    const sourceCard = createElement("div", { className: "source-card" });
    sourceCard.append(createElement("strong", { text: source.title }));
    sourceCard.append(
      createElement("p", {
        className: "detail-meta",
        text: `${source.source} · ${source.fileType?.toUpperCase() ?? "HTML"} · ${source.publishedAt?.slice(0, 10) ?? "-"} · ${humanizeAccessMode(source.accessPolicy)}`,
      }),
    );
    sourceCard.append(createElement("p", { text: source.previewText || "미리보기 텍스트 없음" }));

    const assetList = createElement("div", { className: "source-assets" });
    source.assets.forEach((asset) => {
      const link = createElement("a", { text: asset.name ?? asset.url });
      link.href = safeExternalUrl(asset.url);
      link.target = "_blank";
      link.rel = "noreferrer";
      assetList.append(link);
    });
    const sourceLink = createElement("a", { text: "원문 페이지 이동" });
    sourceLink.href = safeExternalUrl(source.url);
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    assetList.append(sourceLink);
    sourceCard.append(assetList);
    detailList.append(sourceCard);
  });

  sourcesSection.append(detailList);
  elements.detailView.append(summarySection, recruitmentSection, sourcesSection);
};

const renderAdmin = async () => {
  const [summary, sources, runs] = await Promise.all([
    fetchJson("/api/v1/admin/summary"),
    fetchJson("/api/v1/admin/sources"),
    fetchJson("/api/v1/admin/crawl-runs"),
  ]);

  clearElement(elements.summaryGrid);
  clearElement(elements.sourceList);
  clearElement(elements.runList);

  [
    `문서 ${summary.documents.total} · 승인 ${summary.documents.approved} · 대기 ${summary.documents.pending}`,
    `소스 ${summary.sources.active}/${summary.sources.total} · 라이브 ${summary.sources.live}`,
    `캐시 ${summary.cache.freshEntries} fresh · ${summary.cache.staleEntries} stale`,
    `정책 파일캐시 ${summary.policy.cachedFileAllowed} · 미리보기 ${summary.policy.previewAllowed} · 링크 ${summary.policy.linkOnly}`,
  ].forEach((text) => {
    elements.summaryGrid.append(createElement("div", { className: "summary-card", text }));
  });

  sources.forEach((source) => {
    const item = createElement("div", { className: "mini-item" });
    item.append(createElement("strong", { text: source.name }));
    item.append(document.createElement("br"));
    item.append(
      document.createTextNode(
        `상태 ${source.status} · 신뢰도 ${source.trustScore} · 캐시 ${source.cache.freshCount}/${source.cache.totalEntries}`,
      ),
    );
    item.append(document.createElement("br"));
    item.append(document.createTextNode(`${humanizeAccessMode(source.accessMode)} · ${source.crawlIntervalMinutes ?? "-"}분 주기`));
    if (source.policyNote) {
      item.append(document.createElement("br"));
      item.append(document.createTextNode(source.policyNote));
    }
    elements.sourceList.append(item);
  });

  if (runs.length === 0) {
    elements.runList.append(createElement("div", { className: "mini-item", text: "실행 이력이 없습니다." }));
    return;
  }

  runs.slice(0, 4).forEach((run) => {
    const item = createElement("div", { className: "mini-item" });
    item.append(createElement("strong", { text: run.runType }));
    item.append(document.createElement("br"));
    item.append(document.createTextNode(`${run.status} · 신규 ${run.itemsCreated} · 갱신 ${run.itemsUpdated}`));
    elements.runList.append(item);
  });
};

const buildSearchParams = () => {
  const searchParams = new URLSearchParams();
  if (elements.queryInput.value.trim()) {
    searchParams.set("query", elements.queryInput.value.trim());
  }
  if (elements.organizationInput.value.trim()) {
    searchParams.set("organization", elements.organizationInput.value.trim());
  }
  if (elements.regionInput.value.trim()) {
    searchParams.set("region", elements.regionInput.value.trim());
  }
  if (elements.recruitmentKindInput.value) {
    searchParams.set("recruitmentKind", elements.recruitmentKindInput.value);
  }
  if (elements.fileTypeInput.value) {
    searchParams.set("fileType", elements.fileTypeInput.value);
  }
  if (state.selectedTagSlugs.length > 0) {
    searchParams.set("tagSlugs", state.selectedTagSlugs.join(","));
  }
  searchParams.set("sourceScope", elements.sourceScopeInput.value);
  searchParams.set("tagMode", elements.tagModeInput.value);
  searchParams.set("sort", elements.sortInput.value);
  searchParams.set("page", String(state.currentPage));
  searchParams.set("pageSize", elements.pageSizeInput.value || "12");
  return searchParams.toString();
};

const runSearch = async () => {
  const payload = await fetchJson(`/api/v1/search?${buildSearchParams()}`);
  state.lastPayload = payload;
  renderResults(payload);

  if (payload.items.length === 0) {
    state.selectedDocumentId = null;
    resetDetailView("조건에 맞는 문서가 없습니다.");
    return;
  }

  const selectedItem = payload.items.find((item) => item.id === state.selectedDocumentId);
  if (!selectedItem) {
    state.selectedDocumentId = payload.items[0].id;
    await loadDetail(payload.items[0].id);
    renderResults(payload);
  }
};

const loadDetail = async (documentId) => {
  const payload = await fetchJson(`/api/v1/documents/${documentId}`);
  renderDetail(payload);
};

const initialize = async () => {
  const [tags, organizations] = await Promise.all([fetchJson("/api/v1/tags"), fetchJson("/api/v1/organizations")]);
  state.tags = tags;
  state.organizations = organizations;
  renderTagList();
  renderOrganizations();
  renderRegions();
  resetDetailView();
  await runSearch();
  await renderAdmin();
};

elements.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.currentPage = 1;
  await runSearch();
});

elements.clearTagsButton.addEventListener("click", async () => {
  state.selectedTagSlugs = [];
  state.currentPage = 1;
  renderTagList();
  await runSearch();
});

elements.crawlButton.addEventListener("click", async () => {
  elements.crawlButton.disabled = true;
  elements.crawlButton.textContent = "수집 실행 중";
  await fetchJson("/api/v1/admin/crawl-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  await runSearch();
  await renderAdmin();
  elements.crawlButton.disabled = false;
  elements.crawlButton.textContent = "샘플 수집 재실행";
});

initialize().catch((error) => {
  clearElement(elements.resultList);
  elements.resultList.append(createElement("div", { className: "mini-item", text: `초기화 실패: ${error.message}` }));
});
