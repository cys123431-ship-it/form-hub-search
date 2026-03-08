import test from "node:test";
import assert from "node:assert/strict";
import { seedCatalogIfNeeded } from "../src/bootstrap.js";
import { samplesDir } from "../src/config/paths.js";

const createState = () => ({
  meta: { schemaVersion: 1 },
  sourceSites: [
    {
      id: "source_public_forms",
      name: "무료 양식 샘플 피드",
      parserKey: "manual_json_source",
    },
  ],
  crawlRuns: [],
  crawlRunItems: [],
  organizations: [],
  organizationAliases: [],
  tags: [],
  tagKeywordRules: [],
  documents: [],
  documentOccurrences: [],
  documentContents: [],
  documentAssets: [],
  documentTags: [],
  documentOrganizations: [],
  recruitmentProfiles: [],
});

test("seedCatalogIfNeeded merges missing catalog entries into an existing state file", async () => {
  let state = createState();
  const repository = {
    async readState() {
      return JSON.parse(JSON.stringify(state));
    },
    async writeState(nextState) {
      state = JSON.parse(JSON.stringify(nextState));
      return state;
    },
  };

  const seeded = await seedCatalogIfNeeded({ repository, samplesDir });

  assert.equal(seeded.sourceSites.some((source) => source.id === "source_jobkorea_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_municipal_official_search"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_seoul_official_search"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_work24_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_job_alio_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_daejeon_gosi_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_national_admin_board_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_corporate_official_careers_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_free_form_live"), true);
  assert.equal(seeded.sourceSites.some((source) => source.id === "source_whole_web_live"), true);
  assert.equal(seeded.tags.some((tag) => tag.slug === "cover-letter"), true);
});
