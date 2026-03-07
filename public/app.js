const state = {
  tags: [],
  organizations: [],
  selectedTagSlugs: [],
  selectedDocumentId: null,
};

const elements = {
  resultCount: document.querySelector("#result-count"),
  resultList: document.querySelector("#result-list"),
  detailView: document.querySelector("#detail-view"),
  detailStatus: document.querySelector("#detail-status"),
  tagList: document.querySelector("#tag-list"),
  organizationList: document.querySelector("#organization-list"),
  sourceList: document.querySelector("#source-list"),
  runList: document.querySelector("#run-list"),
  searchForm: document.querySelector("#search-form"),
  queryInput: document.querySelector("#query-input"),
  organizationInput: document.querySelector("#organization-input"),
  tagModeInput: document.querySelector("#tag-mode-input"),
  sortInput: document.querySelector("#sort-input"),
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

const resultMetaText = (item) =>
  [item.organizations.join(", "), item.fileTypes.join(", ").toUpperCase(), item.publishedAt?.slice(0, 10)].filter(Boolean).join(" · ");

const renderResults = (payload) => {
  elements.resultCount.textContent = `${payload.page.totalItems}건`;
  clearElement(elements.resultList);

  payload.items.forEach((item) => {
    const article = createElement("article", {
      className: `result-card ${state.selectedDocumentId === item.id ? "active" : ""}`,
    });
    article.append(createElement("h3", { text: item.title }));
    article.append(createElement("p", { className: "result-meta", text: resultMetaText(item) }));

    const tagRow = createElement("div", { className: "result-tags" });
    item.tags.forEach((tag) => tagRow.append(createPill(tag)));
    article.append(tagRow);
    article.append(createElement("p", { text: item.summary ?? "요약 없음" }));

    article.addEventListener("click", async () => {
      state.selectedDocumentId = item.id;
      await loadDetail(item.id);
      renderResults(payload);
    });
    elements.resultList.append(article);
  });

  if (payload.items.length === 0) {
    elements.resultList.append(createElement("div", { className: "mini-item", text: "조건에 맞는 문서가 없습니다." }));
  }
};

const renderDetail = (document) => {
  elements.detailStatus.textContent = document.reviewStatus;
  elements.detailView.classList.remove("empty-state");
  clearElement(elements.detailView);

  const summarySection = createElement("div", { className: "detail-section" });
  summarySection.append(createElement("h3", { text: document.title }));
  summarySection.append(createElement("p", { text: document.summary ?? "요약 없음" }));
  summarySection.append(
    createElement("p", {
      className: "detail-meta",
      text: `${document.organizations.join(", ") || "기관 없음"} · 품질 점수 ${document.qualityScore}`,
    }),
  );
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
        text: `${source.source} · ${source.fileType?.toUpperCase() ?? "HTML"} · ${source.publishedAt?.slice(0, 10) ?? "-"}`,
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
  const [sources, runs] = await Promise.all([
    fetchJson("/api/v1/admin/sources"),
    fetchJson("/api/v1/admin/crawl-runs"),
  ]);

  clearElement(elements.sourceList);
  clearElement(elements.runList);

  sources.forEach((source) => {
    const item = createElement("div", { className: "mini-item" });
    item.append(createElement("strong", { text: source.name }));
    item.append(document.createElement("br"));
    item.append(document.createTextNode(`상태 ${source.status} · 신뢰도 ${source.trustScore}`));
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
  if (state.selectedTagSlugs.length > 0) {
    searchParams.set("tagSlugs", state.selectedTagSlugs.join(","));
  }
  searchParams.set("tagMode", elements.tagModeInput.value);
  searchParams.set("sort", elements.sortInput.value);
  return searchParams.toString();
};

const runSearch = async () => {
  const payload = await fetchJson(`/api/v1/search?${buildSearchParams()}`);
  renderResults(payload);
  if (!state.selectedDocumentId && payload.items[0]) {
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
  await runSearch();
  await renderAdmin();
};

elements.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

elements.clearTagsButton.addEventListener("click", async () => {
  state.selectedTagSlugs = [];
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
