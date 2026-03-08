export const sourceScopeOptions = [
  { value: "all", label: "통합검색" },
  { value: "job_portals", label: "민간 채용 포털" },
  { value: "official_corporate", label: "기업 공식 채용" },
  { value: "public_recruitment", label: "공공 채용" },
  { value: "local_government", label: "전국 행정기관" },
  { value: "free_forms", label: "무료 양식" },
  { value: "whole_web", label: "웹 전체" },
];

const validSourceScopes = new Set(sourceScopeOptions.map((option) => option.value));

export const normalizeSourceScope = (value) => {
  const normalized = String(value ?? "").trim();
  return validSourceScopes.has(normalized) ? normalized : "all";
};

export const localGovernmentParserKeys = new Set([
  "municipal_official_search",
  "seoul_official_search",
  "daejeon_job_event_live_search",
  "daejeon_gosi_live_search",
  "national_admin_board_search",
]);

export const resolveSourceScopes = (source) => {
  if (!source) {
    return new Set(["all"]);
  }

  if (source.id === "source_public_forms") {
    return new Set(["free_forms"]);
  }
  if (source.id === "source_recruitment_forms") {
    return new Set(["job_portals"]);
  }

  switch (source.parserKey) {
    case "jobkorea_live_search":
    case "saramin_live_search":
    case "work24_live_search":
      return new Set(["job_portals"]);
    case "gojobs_live_search":
    case "job_alio_live_search":
      return new Set(["public_recruitment"]);
    case "corporate_official_careers_search":
      return new Set(["official_corporate"]);
    case "free_form_live_search":
      return new Set(["free_forms"]);
    case "whole_web_search":
      return new Set(["whole_web"]);
    default:
      if (localGovernmentParserKeys.has(source.parserKey)) {
        return new Set(["local_government"]);
      }
      return new Set(["all"]);
  }
};

export const sourceMatchesScope = (source, sourceScope) => {
  const normalizedScope = normalizeSourceScope(sourceScope);
  if (normalizedScope === "all") {
    return true;
  }

  return resolveSourceScopes(source).has(normalizedScope);
};
