import { compactSearchText } from "../../utils/normalize.js";

export const splitOrganizationQueries = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const buildOrganizationAliasMap = (state) =>
  state.organizationAliases.reduce((aliasMap, alias) => {
    const bucket = aliasMap.get(alias.organizationId) ?? [];
    bucket.push(alias.normalizedAlias);
    aliasMap.set(alias.organizationId, bucket);
    return aliasMap;
  }, new Map());

export const matchesOrganizationQuery = (organization, organizationQuery, aliasMap) => {
  const normalizedQuery = compactSearchText(organizationQuery);
  if (!normalizedQuery) {
    return true;
  }

  if (compactSearchText(organization.name).includes(normalizedQuery)) {
    return true;
  }

  return (aliasMap.get(organization.id) ?? []).some((alias) => alias.includes(normalizedQuery));
};

export const matchesAnyOrganizationQuery = (organization, organizationQueries, aliasMap) =>
  organizationQueries.some((organizationQuery) => matchesOrganizationQuery(organization, organizationQuery, aliasMap));
