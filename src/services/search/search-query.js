import { compactSearchText, splitQueryTokens } from "../../utils/normalize.js";

const unique = (values) => [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];

export const publicEmploymentTerms = [
  "공공근로",
  "공공일자리",
  "기간제근로자",
  "기간제 근로자",
  "기간제",
  "일자리사업",
];

export const recruitmentIntentTerms = unique([
  "채용",
  "공고",
  "공채",
  "입사지원",
  "지원서",
  "자기소개서",
  "자소서",
  "원서",
  "인턴",
  "사원",
  "모집",
  "공무원",
  "일자리",
  ...publicEmploymentTerms,
]);

const queryVariantMap = new Map(
  [
    ["공공근로", publicEmploymentTerms],
    ["공공일자리", publicEmploymentTerms],
    ["기간제근로자", publicEmploymentTerms],
    ["기간제 근로자", publicEmploymentTerms],
    ["기간제", publicEmploymentTerms],
    ["일자리사업", publicEmploymentTerms],
  ].map(([key, variants]) => [compactSearchText(key), unique([key, ...variants])]),
);

export const matchesAnySearchTerm = (text, terms) => {
  const normalizedText = compactSearchText(text);
  if (!normalizedText) {
    return false;
  }

  return terms.some((term) => normalizedText.includes(compactSearchText(term)));
};

export const buildQueryTokenGroups = (tokensOrQuery) => {
  const tokens = Array.isArray(tokensOrQuery) ? tokensOrQuery : splitQueryTokens(tokensOrQuery);
  return tokens.map((token) => unique([token, ...(queryVariantMap.get(compactSearchText(token)) ?? [])]));
};

export const matchesQueryTokenGroups = (text, tokenGroups) => {
  if (tokenGroups.length === 0) {
    return true;
  }

  const normalizedText = compactSearchText(text);
  return tokenGroups.every((group) => group.some((term) => normalizedText.includes(compactSearchText(term))));
};

export const expandRecruitmentQueryVariants = (queryText) => {
  const tokens = splitQueryTokens(queryText);
  if (tokens.length === 0) {
    return [];
  }

  const variants = new Set([tokens.join(" ")]);
  const tokenGroups = buildQueryTokenGroups(tokens);
  tokenGroups.forEach((group, index) => {
    group.forEach((term) => {
      const replacedTokens = [...tokens];
      replacedTokens[index] = term;
      variants.add(replacedTokens.join(" "));
    });
  });

  return [...variants].map((value) => value.trim()).filter(Boolean);
};
