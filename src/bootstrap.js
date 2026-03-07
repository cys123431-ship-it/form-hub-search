import fs from "node:fs/promises";
import path from "node:path";

const timestamp = () => new Date().toISOString();

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

export const seedCatalogIfNeeded = async ({ repository, samplesDir }) => {
  const state = await repository.readState();
  if (state.sourceSites.length > 0) {
    return state;
  }

  const catalogPath = path.join(samplesDir, "seed-catalog.json");
  const rawCatalog = await fs.readFile(catalogPath, "utf8");
  const catalog = JSON.parse(rawCatalog);

  state.sourceSites = catalog.sources.map((source) => ({
    ...source,
    parserConfigJson: source.parserConfig,
    robotsCheckedAt: null,
    policyReviewedAt: timestamp(),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }));
  state.tags = catalog.tags.map((tag) => ({
    ...tag,
    description: null,
    isActive: true,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }));
  state.organizations = catalog.organizations.map(({ aliases, ...organization }) => ({
    ...organization,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }));
  state.organizationAliases = expandOrganizationAliases(catalog.organizations);
  state.tagKeywordRules = catalog.tagKeywordRules.map((rule) => ({
    ...rule,
    isActive: true,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }));

  return repository.writeState(state);
};
