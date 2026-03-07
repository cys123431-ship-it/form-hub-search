import fs from "node:fs/promises";

const clone = (value) => JSON.parse(JSON.stringify(value));

export class JsonStateRepository {
  constructor(stateFilePath) {
    this.stateFilePath = stateFilePath;
  }

  async ensureStateFile() {
    try {
      await fs.access(this.stateFilePath);
    } catch {
      const emptyState = {
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
      };
      await this.writeState(emptyState);
    }
  }

  async readState() {
    await this.ensureStateFile();
    const rawText = await fs.readFile(this.stateFilePath, "utf8");
    return JSON.parse(rawText);
  }

  async writeState(state) {
    await fs.writeFile(this.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return clone(state);
  }

  async updateState(mutator) {
    const state = await this.readState();
    await mutator(state);
    return this.writeState(state);
  }
}
