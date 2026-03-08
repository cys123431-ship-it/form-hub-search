import { createStableId } from "../../utils/ids.js";

const nowMs = () => Date.now();
const toIso = (value) => new Date(value).toISOString();

const normalizeCachePart = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const buildLiveQueryCacheKey = ({
  sourceId,
  queryText = "",
  organization = "",
  region = "",
  sourceScope = "all",
}) =>
  createStableId(
    "livecache",
    [sourceId, sourceScope, queryText, organization, region].map((value) => normalizeCachePart(value)).join("|"),
  );

export const getLiveQueryCacheEntry = (state, cacheKey) =>
  state.liveQueryCacheEntries.find((entry) => entry.cacheKey === cacheKey) ?? null;

export const isFreshLiveQueryCacheEntry = (entry, currentTimeMs = nowMs()) => {
  if (!entry?.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(entry.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > currentTimeMs;
};

export const upsertLiveQueryCacheEntry = (state, record) => {
  const existingIndex = state.liveQueryCacheEntries.findIndex((entry) => entry.cacheKey === record.cacheKey);
  const existingEntry = existingIndex >= 0 ? state.liveQueryCacheEntries[existingIndex] : null;
  const nextEntry = {
    id: existingEntry?.id ?? createStableId("lqce", record.cacheKey),
    sourceId: record.sourceId,
    sourceScope: record.sourceScope ?? "all",
    cacheKey: record.cacheKey,
    queryText: record.queryText ?? "",
    organization: record.organization ?? "",
    region: record.region ?? "",
    status: record.status ?? "succeeded",
    resultCount: Number(record.resultCount ?? 0),
    durationMs: Number(record.durationMs ?? 0),
    fetchedAt: record.fetchedAt ?? toIso(nowMs()),
    expiresAt: record.expiresAt ?? toIso(nowMs()),
    lastError: record.lastError ?? null,
    updatedAt: toIso(nowMs()),
    createdAt: existingEntry?.createdAt ?? toIso(nowMs()),
  };

  if (existingIndex >= 0) {
    state.liveQueryCacheEntries[existingIndex] = nextEntry;
  } else {
    state.liveQueryCacheEntries.push(nextEntry);
  }

  if (state.liveQueryCacheEntries.length > 500) {
    state.liveQueryCacheEntries = [...state.liveQueryCacheEntries]
      .sort((left, right) => (right.fetchedAt ?? "").localeCompare(left.fetchedAt ?? ""))
      .slice(0, 500);
  }

  return nextEntry;
};

export const createLiveQueryCacheRecord = ({
  sourceId,
  sourceScope = "all",
  queryText = "",
  organization = "",
  region = "",
  ttlMinutes = 30,
  resultCount = 0,
  durationMs = 0,
  status = "succeeded",
  lastError = null,
  fetchedAtMs = nowMs(),
}) => {
  const ttlMs = Math.max(1, Number(ttlMinutes) || 30) * 60 * 1000;
  return {
    sourceId,
    sourceScope,
    cacheKey: buildLiveQueryCacheKey({ sourceId, sourceScope, queryText, organization, region }),
    queryText,
    organization,
    region,
    status,
    resultCount,
    durationMs,
    lastError,
    fetchedAt: toIso(fetchedAtMs),
    expiresAt: toIso(fetchedAtMs + ttlMs),
  };
};
