import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveReviewStatus,
  resolveOrganizations,
  scoreTagRules,
} from "../src/services/classify/rules.js";

test("resolveOrganizations matches aliases and names", () => {
  const organizations = [
    { id: "org_kdb", name: "산업은행" },
    { id: "org_ibk", name: "기업은행" },
  ];
  const aliases = [
    { organizationId: "org_kdb", normalizedAlias: "kdb산업은행" },
    { organizationId: "org_ibk", normalizedAlias: "ibk기업은행" },
  ];

  const matched = resolveOrganizations({
    title: "KDB산업은행 입사지원서",
    content: "신입 채용 지원용 자기소개서 문항",
    hints: [],
    organizations,
    aliases,
  });

  assert.deepEqual(
    matched.map((organization) => organization.id),
    ["org_kdb"],
  );
});

test("scoreTagRules accumulates matching weights", () => {
  const scores = scoreTagRules({
    title: "기업은행 디지털 인턴 자소서",
    content: "입사지원과 자기소개서 문항",
    assetText: "ibk-2026-digital-intern.pdf",
    organizationMatches: ["기업은행"],
    rules: [
      { tagId: "cover", matchField: "all", patternType: "contains", patternValue: "자기소개서", polarity: "include", weight: 1.4 },
      { tagId: "intern", matchField: "all", patternType: "contains", patternValue: "인턴", polarity: "include", weight: 1.2 },
    ],
  });

  assert.equal(scores.cover, 1.4);
  assert.equal(scores.intern, 1.2);
});

test("deriveReviewStatus keeps low quality documents pending", () => {
  assert.equal(deriveReviewStatus({ qualityScore: 0.2, tagCount: 0, extractionStatus: "failed" }), "pending_review");
  assert.equal(deriveReviewStatus({ qualityScore: 0.8, tagCount: 2, extractionStatus: "succeeded" }), "approved");
  assert.equal(
    deriveReviewStatus({
      qualityScore: 0.72,
      tagCount: 0,
      extractionStatus: "succeeded",
      allowTaglessApproval: true,
    }),
    "approved",
  );
});
