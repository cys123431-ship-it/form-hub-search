import { compactSearchText, firstSentences, normalizeSearchText } from "../../utils/normalize.js";

const getRuleText = ({ title, content, assetText, organizationMatches, matchField }) => {
  const fields = {
    title,
    content,
    asset_name: assetText,
    organization: organizationMatches.join(" "),
    all: [title, content, assetText, organizationMatches.join(" ")].join(" "),
  };
  return fields[matchField] ?? fields.all;
};

const matchRule = (text, rule) => {
  const normalizedText = compactSearchText(text);
  const normalizedValue = compactSearchText(rule.patternValue);

  if (!normalizedText || !normalizedValue) {
    return false;
  }

  if (rule.patternType === "exact") {
    return normalizedText === normalizedValue;
  }

  if (rule.patternType === "regex") {
    try {
      return new RegExp(rule.patternValue, "i").test(text);
    } catch {
      return false;
    }
  }

  return normalizedText.includes(normalizedValue);
};

export const resolveOrganizations = ({ title, content, hints, organizations, aliases }) => {
  const searchableText = compactSearchText([title, content, ...(hints ?? [])].join(" "));
  const matchedIds = new Set();

  organizations.forEach((organization) => {
    if (searchableText.includes(compactSearchText(organization.name))) {
      matchedIds.add(organization.id);
    }
  });

  aliases.forEach((alias) => {
    if (searchableText.includes(alias.normalizedAlias)) {
      matchedIds.add(alias.organizationId);
    }
  });

  return organizations.filter((organization) => matchedIds.has(organization.id));
};

export const scoreTagRules = ({ title, content, assetText, organizationMatches, rules }) =>
  rules.reduce((scores, rule) => {
    const text = getRuleText({ title, content, assetText, organizationMatches, matchField: rule.matchField });
    if (!matchRule(text, rule)) {
      return scores;
    }

    const currentScore = scores[rule.tagId] ?? 0;
    const weight = Number(rule.weight ?? 1);
    scores[rule.tagId] = rule.polarity === "exclude" ? currentScore - weight : currentScore + weight;
    return scores;
  }, {});

export const buildSummary = ({ title, content }) => firstSentences([title, content].filter(Boolean).join(". "));

export const deriveRecruitmentProfile = ({ title, content, tagSlugs, organizationNames }) => {
  const combined = normalizeSearchText([title, content, ...organizationNames].join(" "));
  const isRecruitment = tagSlugs.includes("recruitment") || combined.includes("입사지원") || combined.includes("채용");
  if (!isRecruitment) {
    return null;
  }

  const seasonMatch = `${title} ${content}`.match(/(20\d{2})\s*(상반기|하반기|상시)/);
  let recruitmentKind = "open_recruitment";
  if (
    combined.includes("공무원") ||
    combined.includes("군무원") ||
    combined.includes("임기제") ||
    combined.includes("한시임기제")
  ) {
    recruitmentKind = "civil_service";
  } else if (combined.includes("인턴")) {
    recruitmentKind = "intern";
  } else if (combined.includes("경력")) {
    recruitmentKind = "experienced";
  } else if (combined.includes("계약직")) {
    recruitmentKind = "contract";
  }

  return {
    recruitmentKind,
    seasonLabel: seasonMatch ? `${seasonMatch[1]} ${seasonMatch[2]}` : null,
    employmentTrack: combined.includes("디지털") ? "디지털" : combined.includes("행원") ? "행원" : null,
  };
};

export const calculateQualityScore = ({ title, content, tagCount, organizationCount, extractionStatus }) => {
  let score = 0;
  if (title?.trim()) {
    score += 0.25;
  }
  if ((content?.length ?? 0) >= 80) {
    score += 0.35;
  }
  if (tagCount > 0) {
    score += 0.2;
  }
  if (organizationCount > 0) {
    score += 0.1;
  }
  if (extractionStatus === "succeeded") {
    score += 0.1;
  }
  return Math.min(Number(score.toFixed(4)), 1);
};

export const deriveReviewStatus = ({ qualityScore, tagCount, extractionStatus }) => {
  if (extractionStatus !== "succeeded") {
    return "pending_review";
  }
  if (tagCount === 0 || qualityScore < 0.45) {
    return "pending_review";
  }
  return "approved";
};
