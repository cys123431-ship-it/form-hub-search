import fs from "node:fs/promises";

const clone = (value) => JSON.parse(JSON.stringify(value));
export const createEmptyState = () => ({
  meta: { schemaVersion: 2, lastCrawlAt: null },
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
  liveQueryCacheEntries: [],
});

const arrayKeys = [
  "sourceSites",
  "crawlRuns",
  "crawlRunItems",
  "organizations",
  "organizationAliases",
  "tags",
  "tagKeywordRules",
  "documents",
  "documentOccurrences",
  "documentContents",
  "documentAssets",
  "documentTags",
  "documentOrganizations",
  "recruitmentProfiles",
  "liveQueryCacheEntries",
];

export const normalizeStateShape = (value) => {
  const template = createEmptyState();
  const state = value && typeof value === "object" ? value : {};
  const normalized = {
    ...template,
    ...state,
    meta: {
      ...template.meta,
      ...(state.meta ?? {}),
      schemaVersion: template.meta.schemaVersion,
    },
  };

  arrayKeys.forEach((key) => {
    normalized[key] = Array.isArray(state[key]) ? state[key] : template[key];
  });

  return normalized;
};

export class JsonStateRepository {
  constructor(stateFilePath) {
    this.stateFilePath = stateFilePath;
  }

  async ensureStateFile() {
    try {
      await fs.access(this.stateFilePath);
    } catch {
      await this.writeState(createEmptyState());
    }
  }

  async readState() {
    await this.ensureStateFile();
    const rawText = await fs.readFile(this.stateFilePath, "utf8");

    try {
      return normalizeStateShape(JSON.parse(rawText));
    } catch {
      const corruptBackupPath = `${this.stateFilePath}.corrupt-${Date.now()}`;
      await fs.rename(this.stateFilePath, corruptBackupPath).catch(() => {});
      const emptyState = createEmptyState();
      await this.writeState(emptyState);
      return emptyState;
    }
  }

  async writeState(state) {
    const normalizedState = normalizeStateShape(state);
    const tempPath = `${this.stateFilePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.stateFilePath);
    return clone(normalizedState);
  }

  async updateState(mutator) {
    const state = await this.readState();
    await mutator(state);
    return this.writeState(state);
  }
}
