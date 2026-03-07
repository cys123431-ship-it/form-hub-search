import test from "node:test";
import assert from "node:assert/strict";
import { upsertParsedDocument } from "../src/services/crawl/crawl-state-helpers.js";

const createEmptyState = () => ({
  documents: [],
  documentOccurrences: [],
  documentContents: [],
  documentAssets: [],
});

test("upsertParsedDocument creates stable document ids for identical source items", () => {
  const source = {
    id: "source_recruitment_forms",
    allowCache: false,
    allowPreview: true,
  };
  const parsed = {
    sourceItemKey: "recruit_001",
    pageUrl: "https://sample.local/recruitment/kdb-2026-open",
    canonicalUrl: "https://sample.local/recruitment/kdb-2026-open",
    sourceTitle: "산업은행 2026 상반기 신입행원 입사지원서 및 자기소개서 양식",
    bodyText: "산업은행 공개 채용 지원서입니다. 신입행원 지원자를 위한 입사지원서와 자기소개서 문항을 포함합니다.",
    organizationHints: ["산업은행"],
    publishedAt: "2026-03-01T00:00:00Z",
    assets: [
      {
        url: "https://sample.local/files/kdb-2026-open-application.pdf",
        fileName: "kdb-2026-open-application.pdf",
        fileType: "pdf",
      },
    ],
  };

  const firstState = createEmptyState();
  const secondState = createEmptyState();

  const first = upsertParsedDocument(firstState, source, parsed);
  const second = upsertParsedDocument(secondState, source, parsed);

  assert.equal(first.documentId, second.documentId);
  assert.equal(first.occurrenceId, second.occurrenceId);
});
