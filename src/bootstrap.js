import fs from "node:fs/promises";
import path from "node:path";

const timestamp = () => new Date().toISOString();
const now = () => timestamp();

const expandOrganizationAliases = (organizations) =>
  organizations.flatMap((organization) =>
    (organization.aliases ?? []).map((alias) => ({
      id: `${organization.id}_${alias}`,
      organizationId: organization.id,
      alias,
      normalizedAlias: alias.toLowerCase().replace(/\s+/g, ""),
      createdAt: timestamp(),
    })),
  );

const buildCatalogPath = (samplesDir) => path.join(samplesDir, "seed-catalog.json");

const loadCatalog = async (samplesDir) => {
  const rawCatalog = await fs.readFile(buildCatalogPath(samplesDir), "utf8");
  return JSON.parse(rawCatalog);
};

const mergeMissingById = (target, items, createItem) => {
  const existingIds = new Set(target.map((entry) => entry.id));
  let changed = false;

  items.forEach((item) => {
    if (existingIds.has(item.id)) {
      return;
    }

    target.push(createItem(item));
    existingIds.add(item.id);
    changed = true;
  });

  return changed;
};

export const seedCatalogIfNeeded = async ({ repository, samplesDir }) => {
  const state = await repository.readState();
  const catalog = await loadCatalog(samplesDir);
  const organizationAliases = expandOrganizationAliases(catalog.organizations);
  let changed = false;

  changed =
    mergeMissingById(state.sourceSites, catalog.sources, (source) => ({
      ...source,
      parserConfigJson: source.parserConfig,
      robotsCheckedAt: null,
      policyReviewedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    })) || changed;
  changed =
    mergeMissingById(state.tags, catalog.tags, (tag) => ({
      ...tag,
      description: null,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    })) || changed;
  changed =
    mergeMissingById(state.organizations, catalog.organizations, ({ aliases, ...organization }) => ({
      ...organization,
      createdAt: now(),
      updatedAt: now(),
    })) || changed;
  changed = mergeMissingById(state.organizationAliases, organizationAliases, (alias) => alias) || changed;
  changed =
    mergeMissingById(state.tagKeywordRules, catalog.tagKeywordRules, (rule) => ({
      ...rule,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    })) || changed;

  if (!changed) {
    return state;
  }

  return repository.writeState(state);
};
