import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizationSearchKeys,
  expandOrganizationQueryVariants,
  matchesOrganizationText,
} from "../src/services/search/search-organization.js";

test("buildOrganizationSearchKeys expands Korean and English brand variants", () => {
  const keys = buildOrganizationSearchKeys("LG전자");

  assert.equal(keys.includes("lg전자"), true);
  assert.equal(keys.includes("엘지전자"), true);
});

test("expandOrganizationQueryVariants adds civil-service related variants", () => {
  const variants = expandOrganizationQueryVariants("공무원");

  assert.equal(variants.includes("국가공무원"), true);
  assert.equal(variants.includes("군무원"), true);
});

test("matchesOrganizationText supports fallback text matching for live search documents", () => {
  assert.equal(matchesOrganizationText("비콤시스템 LG전자 관련 채용 공고", ["LG전자"]), true);
  assert.equal(matchesOrganizationText("네이버제트 채용 공고", ["카카오"]), false);
});
