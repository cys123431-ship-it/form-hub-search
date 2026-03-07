import fs from "node:fs/promises";

const clone = (value) => JSON.parse(JSON.stringify(value));
const createEmptyState = () => ({
  meta: { schemaVersion: 1 },
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
});

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
      return JSON.parse(rawText);
    } catch {
      const corruptBackupPath = `${this.stateFilePath}.corrupt-${Date.now()}`;
      await fs.rename(this.stateFilePath, corruptBackupPath).catch(() => {});
      const emptyState = createEmptyState();
      await this.writeState(emptyState);
      return emptyState;
    }
  }

  async writeState(state) {
    const tempPath = `${this.stateFilePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.stateFilePath);
    return clone(state);
  }

  async updateState(mutator) {
    const state = await this.readState();
    await mutator(state);
    return this.writeState(state);
  }
}
