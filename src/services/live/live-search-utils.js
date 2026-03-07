import { compactSearchText, normalizeUrl, normalizeWhitespace } from "../../utils/normalize.js";
import { buildOrganizationSearchKeys } from "../search/search-organization.js";

const entityMap = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["#39", "'"],
]);

export const decodeHtml = (value) =>
  String(value ?? "").replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/giu, (_, entity) => entityMap.get(entity) ?? _);

export const stripTags = (value) => decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " "));

export const toText = (value) => normalizeWhitespace(stripTags(value));

export const toAbsoluteUrl = (baseUrl, value) => {
  if (!value) {
    return "";
  }

  return normalizeUrl(new URL(decodeHtml(value), baseUrl).toString());
};

export const buildQueryScore = (text, queryText) => {
  const normalizedText = compactSearchText(text);
  const queryKeys = buildOrganizationSearchKeys(queryText);

  return queryKeys.reduce((score, queryKey) => {
    if (!queryKey || !normalizedText.includes(queryKey)) {
      return score;
    }

    return score + Math.max(1, queryKey.length);
  }, 0);
};

export const selectRankedResults = (items, queryText, { limit = 6, requireQueryMatch = false } = {}) => {
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      score: buildQueryScore(item.matchText ?? "", queryText),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (requireQueryMatch) {
    const strictMatches = ranked.filter((entry) => entry.score > 0);
    if (strictMatches.length > 0) {
      return strictMatches.slice(0, limit).map((entry) => entry.item);
    }
  }

  return ranked.slice(0, limit).map((entry) => entry.item);
};

export const createSearchIntentText = (queryText) =>
  normalizeWhitespace([queryText, "채용 공고 입사지원 지원서 자기소개서 자소서 원서접수 공고"].join(". "));
