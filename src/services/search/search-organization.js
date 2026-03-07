import { compactSearchText } from "../../utils/normalize.js";

const corporatePrefixPattern = /^(?:주식회사|\(주\)|㈜|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인)\s*/iu;
const corporateSuffixPattern = /(?:주식회사|\(주\)|㈜|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인)$/iu;

const replacementPairs = [
  ["lg", "엘지"],
  ["sk", "에스케이"],
  ["kt", "케이티"],
  ["cj", "씨제이"],
  ["ibk", "기업은행"],
  ["kdb", "산업은행"],
  ["kepco", "한전"],
  ["naver", "네이버"],
  ["kakao", "카카오"],
  ["hyundai", "현대"],
  ["lotte", "롯데"],
  ["posco", "포스코"],
  ["hanwha", "한화"],
  ["samsung", "삼성"],
  ["엘지", "lg"],
  ["에스케이", "sk"],
  ["케이티", "kt"],
  ["씨제이", "cj"],
  ["기업은행", "ibk"],
  ["산업은행", "kdb"],
  ["한전", "kepco"],
  ["네이버", "naver"],
  ["카카오", "kakao"],
  ["현대", "hyundai"],
  ["롯데", "lotte"],
  ["포스코", "posco"],
  ["한화", "hanwha"],
  ["삼성", "samsung"],
];

const exactExpansionMap = new Map([
  ["공무원", ["국가공무원", "지방공무원", "임기제공무원", "한시임기제공무원", "군무원"]],
  ["국가공무원", ["공무원", "지방공무원", "임기제공무원", "한시임기제공무원"]],
  ["지방공무원", ["공무원", "국가공무원", "임기제공무원", "한시임기제공무원"]],
  ["lg전자", ["엘지전자", "lg"]],
  ["엘지전자", ["lg전자", "엘지"]],
  ["삼성전자", ["samsung전자", "삼성"]],
  ["기업은행", ["ibk", "ibk기업은행"]],
  ["산업은행", ["kdb", "kdb산업은행"]],
]);

const unique = (values) => [...new Set(values.filter(Boolean))];

export const stripOrganizationDecorators = (value) =>
  String(value ?? "")
    .trim()
    .replace(corporatePrefixPattern, "")
    .replace(corporateSuffixPattern, "")
    .trim();

export const splitOrganizationQueries = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const expandOrganizationQueryVariants = (value) => {
  const raw = String(value ?? "").trim();
  const baseVariants = unique([raw, stripOrganizationDecorators(raw)]);
  const expanded = new Set(baseVariants);

  const queue = [...baseVariants];
  while (queue.length > 0) {
    const current = queue.shift();
    const compactCurrent = compactSearchText(current);
    const exactExpansions = exactExpansionMap.get(compactCurrent) ?? [];

    exactExpansions.forEach((candidate) => {
      const normalizedCandidate = String(candidate).trim();
      if (!normalizedCandidate || expanded.has(normalizedCandidate)) {
        return;
      }
      expanded.add(normalizedCandidate);
      queue.push(normalizedCandidate);
    });

    replacementPairs.forEach(([from, to]) => {
      const lowerCurrent = current.toLowerCase();
      if (!lowerCurrent.includes(from)) {
        return;
      }

      const candidate = lowerCurrent.replaceAll(from, to);
      if (!candidate || expanded.has(candidate)) {
        return;
      }

      expanded.add(candidate);
      queue.push(candidate);
    });
  }

  return [...expanded];
};

export const buildOrganizationSearchKeys = (value) =>
  unique(
    expandOrganizationQueryVariants(value)
      .flatMap((variant) => [variant, stripOrganizationDecorators(variant)])
      .map((variant) => compactSearchText(variant)),
  );

export const buildOrganizationAliasMap = (state) =>
  state.organizationAliases.reduce((aliasMap, alias) => {
    const bucket = aliasMap.get(alias.organizationId) ?? [];
    bucket.push(...buildOrganizationSearchKeys(alias.normalizedAlias));
    aliasMap.set(alias.organizationId, bucket);
    return aliasMap;
  }, new Map());

export const matchesOrganizationQuery = (organization, organizationQuery, aliasMap) => {
  const queryKeys = buildOrganizationSearchKeys(organizationQuery);
  if (queryKeys.length === 0) {
    return true;
  }

  const organizationKeys = unique([
    ...buildOrganizationSearchKeys(organization.name),
    ...(aliasMap.get(organization.id) ?? []),
  ]);

  return queryKeys.some((queryKey) =>
    organizationKeys.some((organizationKey) => organizationKey.includes(queryKey) || queryKey.includes(organizationKey)),
  );
};

export const matchesAnyOrganizationQuery = (organization, organizationQueries, aliasMap) =>
  organizationQueries.some((organizationQuery) => matchesOrganizationQuery(organization, organizationQuery, aliasMap));

export const matchesOrganizationText = (text, organizationQueries) => {
  const textKeys = buildOrganizationSearchKeys(text);
  if (textKeys.length === 0) {
    return false;
  }

  return organizationQueries.some((organizationQuery) => {
    const queryKeys = buildOrganizationSearchKeys(organizationQuery);
    return queryKeys.some((queryKey) =>
      textKeys.some((textKey) => textKey.includes(queryKey) || queryKey.includes(textKey)),
    );
  });
};
