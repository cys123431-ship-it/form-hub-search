import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "../src/services/admin/admin-service.js";

test("AdminService summary reports source, document, cache, and policy counts", async () => {
  const service = new AdminService({
    repository: {
      async readState() {
        return {
          meta: { lastCrawlAt: "2026-03-08T00:00:00Z" },
          sourceSites: [
            { id: "source_1", status: "active", sourceType: "live_search", allowCrawl: false, allowCache: false, allowPreview: true },
            { id: "source_2", status: "active", sourceType: "manual_json", allowCrawl: true, allowCache: true, allowPreview: true },
          ],
          documents: [
            { id: "doc_1", reviewStatus: "approved", qualityScore: 0.8 },
            { id: "doc_2", reviewStatus: "pending_review", qualityScore: 0.3 },
          ],
          documentOccurrences: [{ id: "occ_1" }, { id: "occ_2" }],
          liveQueryCacheEntries: [
            { sourceId: "source_1", expiresAt: "2099-01-01T00:00:00Z" },
            { sourceId: "source_1", expiresAt: "2000-01-01T00:00:00Z" },
          ],
        };
      },
    },
    crawlService: { crawlAll() {} },
  });

  const summary = await service.getSummary();

  assert.equal(summary.documents.total, 2);
  assert.equal(summary.documents.pending, 1);
  assert.equal(summary.sources.live, 1);
  assert.equal(summary.cache.freshEntries, 1);
  assert.equal(summary.policy.cachedFileAllowed, 1);
  assert.equal(summary.policy.previewAllowed, 1);
});
