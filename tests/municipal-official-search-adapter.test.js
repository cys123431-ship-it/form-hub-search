import test from "node:test";
import assert from "node:assert/strict";
import { MunicipalOfficialSearchAdapter } from "../src/services/live/municipal-official-search-adapter.js";

const sampleHtml = `
  <html>
    <body>
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.daejeon.go.kr%2Fdrh%2Fboard%2FboardNormalView.do%3FntatcSeq%3D1497611010">대전시 '2025년 하반기 공공기관 직원 통합채용' 실시</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.daejeon.go.kr%2Fdrh%2Fboard%2FboardNormalView.do%3FntatcSeq%3D1497611010">www.daejeon.go.kr/drh/board/boardNormalView.do</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.daejeon.go.kr%2Fdrh%2Fboard%2FboardNormalView.do%3FntatcSeq%3D1497611010">대전광역시가 하반기 공공기관 직원 통합채용을 실시한다.</a>

      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fdaejeon-job">민간 블로그 결과</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fdaejeon-job">blog.example.com/daejeon-job</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fdaejeon-job">대전광역시 채용 후기</a>
    </body>
  </html>
`;

test("MunicipalOfficialSearchAdapter keeps only official municipal results", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(sampleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const adapter = new MunicipalOfficialSearchAdapter();
  const items = await adapter.search("채용", {
    region: "대전광역시",
    limit: 5,
    requireQueryMatch: true,
  });

  assert.equal(items.length > 0, true);
  assert.equal(items.some((item) => item.pageUrl.includes("daejeon.go.kr")), true);
  assert.equal(items.some((item) => item.pageUrl.includes("blog.example.com")), false);
});
