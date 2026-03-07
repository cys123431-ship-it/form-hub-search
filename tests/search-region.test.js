import test from "node:test";
import assert from "node:assert/strict";
import { getMunicipalSearchProfiles, resolveNamedRegion } from "../src/services/search/search-region.js";

test("resolveNamedRegion maps district names to their metropolitan parent", () => {
  const region = resolveNamedRegion("유성구");

  assert.equal(region?.canonical, "대전광역시");
  assert.equal(region?.matchedLabel, "유성구");
  assert.equal(region?.matchedType, "district");
});

test("getMunicipalSearchProfiles infers city scope from district keywords in free text", () => {
  const profiles = getMunicipalSearchProfiles({ text: "강남구 채용 하수구 공고" });

  assert.equal(profiles.some((profile) => profile.canonical === "서울특별시"), true);
  assert.equal(profiles.find((profile) => profile.canonical === "서울특별시")?.matchedLabel, "강남구");
});
