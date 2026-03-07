import fs from "node:fs/promises";
import path from "node:path";

const readItems = async (samplesDir, sampleFile) => {
  const fullPath = path.join(samplesDir, sampleFile);
  const rawText = await fs.readFile(fullPath, "utf8");
  return JSON.parse(rawText);
};

export class ManualJsonSourceAdapter {
  constructor(samplesDir) {
    this.samplesDir = samplesDir;
  }

  async fetchCandidates(sourceConfig) {
    const items = await readItems(this.samplesDir, sourceConfig.parserConfigJson.sampleFile);
    return items.map((item) => ({
      pageUrl: item.pageUrl,
      sourceItemKey: item.sourceItemKey ?? null,
      publishedAt: item.publishedAt ?? null,
    }));
  }

  async fetchDetail(candidate, sourceConfig) {
    const items = await readItems(this.samplesDir, sourceConfig.parserConfigJson.sampleFile);
    const item =
      items.find((entry) => entry.sourceItemKey === candidate.sourceItemKey) ??
      items.find((entry) => entry.pageUrl === candidate.pageUrl);

    if (!item) {
      throw new Error(`candidate_not_found:${candidate.pageUrl}`);
    }

    return item;
  }
}
