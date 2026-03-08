const state = {
  tags: [],
  organizations: [],
  selectedTagSlugs: [],
  selectedDocumentId: null,
  currentPage: 1,
  lastPayload: null,
  isSearching: false,
  recentSearches: [],
  savedSearches: [],
  favoriteDocuments: [],
};

const recentSearchStorageKey = "form-hub-recent-searches";
const savedSearchStorageKey = "form-hub-saved-searches";
const favoriteDocumentsStorageKey = "form-hub-favorite-documents";
const maxRecentSearches = 6;
const maxSavedSearches = 10;
const maxFavoriteDocuments = 18;
const searchPresets = [
  { label: "삼성전자 자소서", query: "자소서", organization: "삼성전자", sourceScope: "official_corporate" },
  { label: "공공근로 대전", query: "공공근로", region: "대전광역시", recruitmentKind: "public_work" },
  { label: "공무원", query: "공무원", sourceScope: "public_recruitment", recruitmentKind: "civil_service" },
  { label: "근로계약서", query: "근로계약서", sourceScope: "free_forms" },
  { label: "서울 하수구", query: "하수구", region: "서울특별시", sourceScope: "local_government" },
  { label: "네이버 채용", query: "네이버", sourceScope: "official_corporate" },
];

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
  presetList: document.querySelector("#preset-list"),
  recentSearchList: document.querySelector("#recent-search-list"),
  savedSearchList: document.querySelector("#saved-search-list"),
  favoriteDocumentList: document.querySelector("#favorite-document-list"),
  searchForm: document.querySelector("#search-form"),
  searchButton: document.querySelector("#search-button"),
  saveCurrentSearchButton: document.querySelector("#save-current-search-button"),
  clearRecentSearchesButton: document.querySelector("#clear-recent-searches-button"),
  clearSavedSearchesButton: document.querySelector("#clear-saved-searches-button"),
  clearFavoritesButton: document.querySelector("#clear-favorites-button"),
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
const formatDomain = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
};
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

const scopeBadgeTone = (scope) =>
  ({
    official_corporate: "brand",
    public_recruitment: "brand",
    local_government: "accent",
    free_forms: "accent",
    whole_web: "muted",
    job_portals: "muted",
    all: "muted",
  })[scope] ?? "muted";

const readStoredList = (storageKey) => {
  try {
    const rawValue = localStorage.getItem(storageKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredList = (storageKey, value) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode or blocked environments.
  }
};

const readRecentSearches = () => readStoredList(recentSearchStorageKey);
const readSavedSearches = () => readStoredList(savedSearchStorageKey);
const readFavoriteDocuments = () => readStoredList(favoriteDocumentsStorageKey);
const writeRecentSearches = () => writeStoredList(recentSearchStorageKey, state.recentSearches);
const writeSavedSearches = () => writeStoredList(savedSearchStorageKey, state.savedSearches);
const writeFavoriteDocuments = () => writeStoredList(favoriteDocumentsStorageKey, state.favoriteDocuments);

const buildCurrentSearchRecord = () => ({
  query: elements.queryInput.value.trim(),
  organization: elements.organizationInput.value.trim(),
  region: elements.regionInput.value.trim(),
  sourceScope: elements.sourceScopeInput.value,
  recruitmentKind: elements.recruitmentKindInput.value,
  fileType: elements.fileTypeInput.value,
  pageSize: elements.pageSizeInput.value || "12",
  sort: elements.sortInput.value,
  tagMode: elements.tagModeInput.value,
  tagSlugs: [...state.selectedTagSlugs],
});

const searchRecordSignature = (record) =>
  JSON.stringify({
    query: record.query ?? "",
    organization: record.organization ?? "",
    region: record.region ?? "",
    sourceScope: record.sourceScope ?? "all",
    recruitmentKind: record.recruitmentKind ?? "",
    fileType: record.fileType ?? "",
    pageSize: record.pageSize ?? "12",
    sort: record.sort ?? "relevance",
    tagMode: record.tagMode ?? "and",
    tagSlugs: Array.isArray(record.tagSlugs) ? [...record.tagSlugs].sort() : [],
  });

const hasMeaningfulSearchValue = (record) =>
  Boolean(record.query) ||
  Boolean(record.organization) ||
  Boolean(record.region) ||
  Boolean(record.recruitmentKind) ||
  Boolean(record.fileType) ||
  record.sourceScope !== "all" ||
  (Array.isArray(record.tagSlugs) && record.tagSlugs.length > 0);

const createSearchLabel = (record) =>
  [
    record.query,
    record.organization,
    record.region,
    record.recruitmentKind ? recruitmentKindLabels[record.recruitmentKind] ?? record.recruitmentKind : "",
    record.sourceScope && record.sourceScope !== "all" ? elements.sourceScopeInput.querySelector(`option[value="${record.sourceScope}"]`)?.textContent ?? "" : "",
  ]
    .filter(Boolean)
    .join(" · ") || "최근 검색";

const buildFavoriteSnapshot = (documentLike) => {
  const primarySource = documentLike.primarySource ?? {};
  const key = String(primarySource.url ?? documentLike.id ?? documentLike.title ?? "").trim().toLowerCase();
  return {
    key,
    id: documentLike.id,
    title: documentLike.title ?? "제목 없음",
    url: safeExternalUrl(primarySource.url ?? documentLike.url ?? ""),
    sourceName: primarySource.name ?? "",
    sourceScopeLabel: documentLike.sourceScopeLabel ?? primarySource.sourceScopeLabel ?? "",
    organizations: Array.isArray(documentLike.organizations) ? [...documentLike.organizations] : [],
    locations: Array.isArray(documentLike.locations) ? [...documentLike.locations] : [],
    previewText: documentLike.previewText ?? documentLike.summary ?? "",
  };
};

const isFavoriteDocument = (documentLike) => {
  const snapshot = buildFavoriteSnapshot(documentLike);
  return Boolean(snapshot.key) && state.favoriteDocuments.some((entry) => entry.key === snapshot.key);
};

const applySearchRecord = async (record) => {
  elements.queryInput.value = record.query ?? "";
  elements.organizationInput.value = record.organization ?? "";
  elements.regionInput.value = record.region ?? "";
  elements.sourceScopeInput.value = record.sourceScope ?? "all";
  elements.recruitmentKindInput.value = record.recruitmentKind ?? "";
  elements.fileTypeInput.value = record.fileType ?? "";
  elements.pageSizeInput.value = record.pageSize ?? "12";
  elements.sortInput.value = record.sort ?? "relevance";
  elements.tagModeInput.value = record.tagMode ?? "and";
  state.selectedTagSlugs = Array.isArray(record.tagSlugs) ? [...record.tagSlugs] : [];
  state.currentPage = 1;
  renderTagList();
  await runSearch();
};

const rememberSearch = () => {
  const record = buildCurrentSearchRecord();
  if (!hasMeaningfulSearchValue(record)) {
    return;
  }

  const signature = searchRecordSignature(record);
  state.recentSearches = [record, ...state.recentSearches.filter((entry) => searchRecordSignature(entry) !== signature)].slice(
    0,
    maxRecentSearches,
  );
  writeRecentSearches();
  renderRecentSearches();
};

const saveCurrentSearch = () => {
  const record = buildCurrentSearchRecord();
  if (!hasMeaningfulSearchValue(record)) {
    elements.searchMeta.textContent = "저장할 검색 조건이 없습니다. 검색어, 기관명, 지역, 필터 중 하나를 먼저 입력해보세요.";
    return;
  }

  const signature = searchRecordSignature(record);
  state.savedSearches = [record, ...state.savedSearches.filter((entry) => searchRecordSignature(entry) !== signature)].slice(
    0,
    maxSavedSearches,
  );
  writeSavedSearches();
  renderSavedSearches();
  elements.searchMeta.textContent = `검색 조건을 저장했습니다. 총 ${state.savedSearches.length}개 저장됨`;
};

const toggleFavoriteDocument = (documentLike) => {
  const snapshot = buildFavoriteSnapshot(documentLike);
  if (!snapshot.key) {
    return false;
  }

  const exists = state.favoriteDocuments.some((entry) => entry.key === snapshot.key);
  state.favoriteDocuments = exists
    ? state.favoriteDocuments.filter((entry) => entry.key !== snapshot.key)
    : [snapshot, ...state.favoriteDocuments].slice(0, maxFavoriteDocuments);
  writeFavoriteDocuments();
  renderFavoriteDocuments();
  return !exists;
};

const renderQuickSearches = () => {
  clearElement(elements.presetList);
  searchPresets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip quick-chip";
    button.textContent = preset.label;
    button.addEventListener("click", async () => {
      await applySearchRecord({
        query: preset.query ?? "",
        organization: preset.organization ?? "",
        region: preset.region ?? "",
        sourceScope: preset.sourceScope ?? "all",
        recruitmentKind: preset.recruitmentKind ?? "",
        fileType: preset.fileType ?? "",
        pageSize: "12",
        sort: "relevance",
        tagMode: "and",
        tagSlugs: preset.tagSlugs ?? [],
      });
    });
    elements.presetList.append(button);
  });
};

const renderRecentSearches = () => {
  clearElement(elements.recentSearchList);
  if (state.recentSearches.length === 0) {
    elements.recentSearchList.append(createElement("span", { className: "mini-inline-text", text: "최근 검색이 없습니다." }));
    return;
  }

  state.recentSearches.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip recent-chip";
    button.textContent = createSearchLabel(record);
    button.addEventListener("click", async () => {
      await applySearchRecord(record);
    });
    elements.recentSearchList.append(button);
  });
};

const renderSavedSearches = () => {
  clearElement(elements.savedSearchList);
  if (state.savedSearches.length === 0) {
    elements.savedSearchList.append(createElement("span", { className: "mini-inline-text", text: "저장된 검색이 없습니다." }));
    return;
  }

  state.savedSearches.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip recent-chip";
    button.textContent = createSearchLabel(record);
    button.addEventListener("click", async () => {
      await applySearchRecord(record);
    });
    elements.savedSearchList.append(button);
  });
};

const renderFavoriteDocuments = () => {
  clearElement(elements.favoriteDocumentList);
  if (state.favoriteDocuments.length === 0) {
    elements.favoriteDocumentList.append(createElement("div", { className: "mini-item", text: "저장된 관심 문서가 없습니다." }));
    return;
  }

  state.favoriteDocuments.forEach((entry) => {
    const item = createElement("article", { className: "mini-item favorite-card" });
    item.append(createElement("strong", { text: entry.title }));
    item.append(
      createElement("p", {
        className: "detail-meta",
        text: [entry.sourceScopeLabel, entry.sourceName, entry.organizations?.join(", "), entry.locations?.join(", ")]
          .filter(Boolean)
          .join(" · "),
      }),
    );
    item.append(createElement("p", { className: "result-preview", text: entry.previewText || "미리보기 없음" }));

    const actions = createElement("div", { className: "result-actions" });
    const sourceLink = createElement("a", { className: "ghost-link", text: "원문 페이지" });
    sourceLink.href = entry.url;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button small-button";
    removeButton.textContent = "삭제";
    removeButton.addEventListener("click", () => {
      state.favoriteDocuments = state.favoriteDocuments.filter((favorite) => favorite.key !== entry.key);
      writeFavoriteDocuments();
      renderFavoriteDocuments();
      if (state.lastPayload) {
        renderResults(state.lastPayload);
      }
    });

    actions.append(sourceLink, removeButton);
    item.append(actions);
    elements.favoriteDocumentList.append(item);
  });
};

const setSearchingState = (isSearching) => {
  state.isSearching = isSearching;
  elements.searchButton.disabled = isSearching;
  elements.saveCurrentSearchButton.disabled = isSearching;
  elements.searchButton.textContent = isSearching ? "검색 중..." : "검색 실행";
  if (isSearching) {
    elements.searchMeta.textContent = "검색 중... 첫 라이브 검색은 다소 느릴 수 있습니다.";
  }
};

const buildSearchParamsFromRecord = (record, options = {}) => {
  const searchParams = new URLSearchParams();
  if (record.query) {
    searchParams.set("query", record.query);
  }
  if (record.organization) {
    searchParams.set("organization", record.organization);
  }
  if (record.region) {
    searchParams.set("region", record.region);
  }
  if (record.recruitmentKind) {
    searchParams.set("recruitmentKind", record.recruitmentKind);
  }
  if (record.fileType) {
    searchParams.set("fileType", record.fileType);
  }
  if (Array.isArray(record.tagSlugs) && record.tagSlugs.length > 0) {
    searchParams.set("tagSlugs", record.tagSlugs.join(","));
  }
  searchParams.set("sourceScope", record.sourceScope ?? "all");
  searchParams.set("tagMode", record.tagMode ?? "and");
  searchParams.set("sort", record.sort ?? "relevance");
  searchParams.set("page", String(options.page ?? 1));
  searchParams.set("pageSize", record.pageSize ?? "12");
  return searchParams.toString();
};

const scheduleSearchPrewarm = () => {
  const prewarmCandidates = [...state.savedSearches, ...state.recentSearches, ...searchPresets]
    .filter((record) => hasMeaningfulSearchValue(record))
    .reduce((accumulator, record) => {
      const signature = searchRecordSignature(record);
      if (!accumulator.some((entry) => searchRecordSignature(entry) === signature)) {
        accumulator.push({
          ...record,
          pageSize: "6",
          sort: "relevance",
          tagMode: record.tagMode ?? "and",
        });
      }
      return accumulator;
    }, [])
    .slice(0, 4);

  const runPrewarm = async () => {
    for (const record of prewarmCandidates) {
      try {
        await fetch(`/api/v1/search?${buildSearchParamsFromRecord(record)}`);
      } catch {
        // Ignore background prewarm failures.
      }
    }
  };

  if (prewarmCandidates.length === 0) {
    return;
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      runPrewarm();
    }, { timeout: 1800 });
    return;
  }

  window.setTimeout(() => {
    runPrewarm();
  }, 1200);
};

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
  const fragments = [
    payload.meta?.sourceScopeLabel ?? "통합검색",
    `응답 ${payload.meta?.durationMs ?? 0}ms`,
    `캐시 적중 ${live.cacheHits ?? 0}`,
    `새 조회 ${live.fetchedQueries ?? 0}`,
    `문서 반영 ${live.fetchedDocuments ?? 0}`,
  ];
  if ((live.cacheMisses ?? 0) > 0) {
    fragments.push("첫 검색은 느릴 수 있고, 이후 같은 검색은 빨라집니다");
  }
  elements.searchMeta.textContent = fragments.filter(Boolean).join(" · ");
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
    badgeRow.append(createElement("span", { className: `pill ${scopeBadgeTone(item.sourceScope)}`, text: item.sourceScopeLabel }));
    badgeRow.append(createPill(formatTrust(item.primarySource?.trustScore)));
    badgeRow.append(createPill(`품질 ${Number(item.qualityScore ?? 0).toFixed(2)}`));
    if (item.primarySource?.accessMode === "cached_file_allowed") {
      badgeRow.append(createPill("문서형"));
    }
    if (item.primarySource?.url?.includes(".go.kr")) {
      badgeRow.append(createPill("공식"));
    }
    if (item.recruitmentKind) {
      badgeRow.append(createPill(recruitmentKindLabels[item.recruitmentKind] ?? item.recruitmentKind));
    }
    item.tags.forEach((tag) => badgeRow.append(createPill(tag)));
    article.append(badgeRow);

    article.append(createElement("p", { className: "result-meta", text: resultMetaText(item) }));
    article.append(createElement("p", { className: "result-preview", text: item.previewText || item.summary || "요약 없음" }));

    const footer = createElement("div", { className: "result-footer" });
    footer.append(createElement("span", { className: "mini-inline-text", text: formatDomain(item.primarySource?.url) || "출처 도메인 없음" }));
    footer.append(createElement("span", { className: "mini-inline-text", text: humanizeAccessMode(item.primarySource?.accessMode) }));
    article.append(footer);

    const actions = createElement("div", { className: "result-actions" });
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `ghost-button small-button ${isFavoriteDocument(item) ? "active-action" : ""}`.trim();
    favoriteButton.textContent = isFavoriteDocument(item) ? "저장됨" : "관심 저장";
    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavoriteDocument(item);
      renderResults(state.lastPayload ?? payload);
    });
    actions.append(favoriteButton);
    article.append(actions);

    article.addEventListener("click", async () => {
      state.selectedDocumentId = item.id;
      await loadDetail(item.id);
      renderResults(state.lastPayload ?? payload);
    });
    elements.resultList.append(article);
  });

  if (payload.items.length === 0) {
    const emptyCard = createElement("div", { className: "mini-item empty-result-card" });
    emptyCard.append(createElement("strong", { text: "조건에 맞는 문서가 없습니다." }));
    emptyCard.append(createElement("p", { className: "detail-meta", text: "다른 검색 범위, 더 넓은 지역명, 짧은 키워드로 다시 시도해보세요." }));
    const tips = createElement("div", { className: "tag-row" });
    ["통합검색", "전국 행정기관", "기업 공식 채용", "무료 양식"].forEach((label) => tips.append(createPill(label)));
    emptyCard.append(tips);
    elements.resultList.append(emptyCard);
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
  const detailActions = createElement("div", { className: "result-actions" });
  if (document.primarySource?.url) {
    const sourceLink = createElement("a", { className: "ghost-link", text: "원문 페이지" });
    sourceLink.href = safeExternalUrl(document.primarySource.url);
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    detailActions.append(sourceLink);
  }
  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  favoriteButton.className = `ghost-button small-button ${isFavoriteDocument(document) ? "active-action" : ""}`.trim();
  favoriteButton.textContent = isFavoriteDocument(document) ? "관심 저장됨" : "관심 문서 저장";
  favoriteButton.addEventListener("click", () => {
    const added = toggleFavoriteDocument(document);
    favoriteButton.className = `ghost-button small-button ${added ? "active-action" : ""}`.trim();
    favoriteButton.textContent = added ? "관심 저장됨" : "관심 문서 저장";
    if (state.lastPayload) {
      renderResults(state.lastPayload);
    }
  });
  detailActions.append(favoriteButton);
  summarySection.append(detailActions);
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

const refreshAdmin = async () => {
  try {
    await renderAdmin();
  } catch (error) {
    clearElement(elements.summaryGrid);
    clearElement(elements.sourceList);
    clearElement(elements.runList);
    elements.summaryGrid.append(createElement("div", { className: "summary-card", text: `운영 상태 로드 실패: ${error.message}` }));
  }
};

const buildSearchParams = () => {
  return buildSearchParamsFromRecord(buildCurrentSearchRecord(), { page: state.currentPage });
};

const renderSearchError = (error) => {
  state.lastPayload = null;
  state.selectedDocumentId = null;
  elements.resultCount.textContent = "0건";
  elements.searchMeta.textContent = `검색 실패: ${error.message.replace(/^request_failed:/u, "HTTP ")}`;
  clearElement(elements.resultList);
  clearElement(elements.pagination);
  const errorCard = createElement("div", { className: "mini-item empty-result-card" });
  errorCard.append(createElement("strong", { text: "검색 요청을 처리하지 못했습니다." }));
  errorCard.append(
    createElement("p", {
      className: "detail-meta",
      text: "잠시 후 다시 시도하거나 검색 범위를 줄여보세요. 첫 라이브 검색은 외부 소스 상태에 따라 지연될 수 있습니다.",
    }),
  );
  elements.resultList.append(errorCard);
  resetDetailView("검색 실패로 상세 보기를 불러오지 못했습니다.");
};

const runSearch = async () => {
  setSearchingState(true);
  try {
    const payload = await fetchJson(`/api/v1/search?${buildSearchParams()}`);
    state.lastPayload = payload;
    renderResults(payload);
    rememberSearch();

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
  } catch (error) {
    renderSearchError(error);
  } finally {
    setSearchingState(false);
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
  state.recentSearches = readRecentSearches();
  state.savedSearches = readSavedSearches();
  state.favoriteDocuments = readFavoriteDocuments();
  renderTagList();
  renderOrganizations();
  renderRegions();
  renderQuickSearches();
  renderRecentSearches();
  renderSavedSearches();
  renderFavoriteDocuments();
  resetDetailView();
  await runSearch();
  await refreshAdmin();
  scheduleSearchPrewarm();
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

elements.saveCurrentSearchButton.addEventListener("click", () => {
  saveCurrentSearch();
});

elements.clearRecentSearchesButton.addEventListener("click", () => {
  state.recentSearches = [];
  writeRecentSearches();
  renderRecentSearches();
});

elements.clearSavedSearchesButton.addEventListener("click", () => {
  state.savedSearches = [];
  writeSavedSearches();
  renderSavedSearches();
});

elements.clearFavoritesButton.addEventListener("click", () => {
  state.favoriteDocuments = [];
  writeFavoriteDocuments();
  renderFavoriteDocuments();
  if (state.lastPayload) {
    renderResults(state.lastPayload);
  }
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
  await refreshAdmin();
  elements.crawlButton.disabled = false;
  elements.crawlButton.textContent = "샘플 수집 재실행";
});

initialize().catch((error) => {
  clearElement(elements.resultList);
  elements.resultList.append(createElement("div", { className: "mini-item", text: `초기화 실패: ${error.message}` }));
});
