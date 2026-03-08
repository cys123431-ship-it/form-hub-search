import test from "node:test";
import assert from "node:assert/strict";
import { NationalAdminBoardSearchAdapter } from "../src/services/live/national-admin-board-search-adapter.js";

const sampleHtml = `
  <html>
    <body>
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.sejong.go.kr%2Fbbs%2FR0071%2Fview.do%3FnttId%3D123">세종특별자치시 하수도 정비 공고</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.sejong.go.kr%2Fbbs%2FR0071%2Fview.do%3FnttId%3D123">www.sejong.go.kr/bbs/R0071/view.do</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.sejong.go.kr%2Fbbs%2FR0071%2Fview.do%3FnttId%3D123">세종특별자치시 하수도 정비 관련 고시공고 게시판 안내</a>

      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fsejong-sewer">세종 하수도 블로그</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fsejong-sewer">blog.example.com/sejong-sewer</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fsejong-sewer">세종 하수도 관련 후기</a>
    </body>
  </html>
`;

test("NationalAdminBoardSearchAdapter keeps official administrative board results", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(sampleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const adapter = new NationalAdminBoardSearchAdapter();
  const items = await adapter.search("하수도", {
    region: "세종특별자치시",
    limit: 5,
    requireQueryMatch: true,
  });

  assert.equal(items.length > 0, true);
  assert.equal(items.some((item) => item.pageUrl.includes("sejong.go.kr")), true);
  assert.equal(items.some((item) => item.pageUrl.includes("blog.example.com")), false);
});
