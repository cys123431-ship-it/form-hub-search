import fs from "node:fs/promises";
import { stateFilePath } from "../src/config/paths.js";

const emptyState = {
  meta: {
    schemaVersion: 1,
  },
  sourceSites: [],
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
};

await fs.writeFile(stateFilePath, `${JSON.stringify(emptyState, null, 2)}\n`, "utf8");
console.log(`State reset at ${stateFilePath}`);
